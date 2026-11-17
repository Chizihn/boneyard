import { describe, it, expect, vi, beforeEach } from "vitest";
import { DisputeStatus, PaymentStatus } from "@prisma/client";
import { DisputeService } from "./dispute.service";
import {
  DisputeAlreadyClaimedError,
  DisputeNotClaimedByAdminError,
  DisputeNotFoundError,
} from "./payments.types";
import { computeRefund } from "./refund";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDispute(overrides: Partial<{
  id: string;
  requestId: string;
  raisedBy: string;
  status: DisputeStatus;
  resolution: string | null;
  claimedByAdminId: string | null;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return {
    id: "dispute-1",
    requestId: "request-1",
    raisedBy: "user-1",
    status: DisputeStatus.open,
    resolution: null,
    claimedByAdminId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePayment(overrides: Partial<{
  id: string;
  requestId: string;
  amount: unknown;
  baseAmount: unknown;
  status: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return {
    id: "payment-1",
    requestId: "request-1",
    // Decimal columns come back as Prisma Decimal objects; Number() handles them
    amount: 80,          // discounted total (what requester actually paid)
    baseAmount: 100,     // pre-discount — refund must be based on this
    status: PaymentStatus.held,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePrisma() {
  return {
    dispute: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// claimDispute
// ---------------------------------------------------------------------------

describe("DisputeService.claimDispute", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: DisputeService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new DisputeService(prisma as any);
  });

  it("returns the claimed dispute on success", async () => {
    prisma.dispute.updateMany.mockResolvedValue({ count: 1 });
    const claimed = makeDispute({ claimedByAdminId: "admin-1" });
    prisma.dispute.findUnique.mockResolvedValue(claimed);

    const result = await service.claimDispute("dispute-1", "admin-1");
    expect(result.claimedByAdminId).toBe("admin-1");
    expect(prisma.dispute.updateMany).toHaveBeenCalledOnce();
  });

  it("passes the correct WHERE guard to updateMany (status=open, claimedByAdminId=null)", async () => {
    prisma.dispute.updateMany.mockResolvedValue({ count: 1 });
    prisma.dispute.findUnique.mockResolvedValue(makeDispute({ claimedByAdminId: "admin-1" }));

    await service.claimDispute("dispute-1", "admin-1");

    const call = prisma.dispute.updateMany.mock.calls[0][0];
    expect(call.where.status).toBe(DisputeStatus.open);
    expect(call.where.claimedByAdminId).toBeNull();
    expect(call.where.id).toBe("dispute-1");
  });

  it("throws DisputeAlreadyClaimedError when updateMany returns count: 0", async () => {
    prisma.dispute.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.claimDispute("dispute-1", "admin-1")).rejects.toThrow(
      DisputeAlreadyClaimedError
    );
    // Must not proceed to findUnique after a failed claim
    expect(prisma.dispute.findUnique).not.toHaveBeenCalled();
  });

  it("throws DisputeNotFoundError if the dispute vanishes after a successful claim", async () => {
    prisma.dispute.updateMany.mockResolvedValue({ count: 1 });
    prisma.dispute.findUnique.mockResolvedValue(null);

    await expect(service.claimDispute("dispute-1", "admin-1")).rejects.toThrow(
      DisputeNotFoundError
    );
  });
});

// ---------------------------------------------------------------------------
// resolveDispute
// ---------------------------------------------------------------------------

describe("DisputeService.resolveDispute", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: DisputeService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new DisputeService(prisma as any);
  });

  it("resolves successfully and returns refund derived from baseAmount", async () => {
    const dispute = makeDispute({ claimedByAdminId: "admin-1" });
    const payment = makePayment({ amount: 80, baseAmount: 100 });

    prisma.dispute.updateMany.mockResolvedValue({ count: 1 });
    prisma.dispute.findUnique.mockResolvedValue(dispute);
    prisma.payment.findUnique.mockResolvedValue(payment);
    prisma.payment.update.mockResolvedValue({ ...payment, status: PaymentStatus.refunded });
    prisma.dispute.update.mockResolvedValue({
      ...dispute,
      status: DisputeStatus.resolved,
      resolution: "Refund of 100 issued by admin admin-1 (80 from escrow, 20 absorbed by platform for the promotional discount)",
    });

    const result = await service.resolveDispute("dispute-1", "admin-1");

    // Verify refund is based on baseAmount (100), not heldAmount (80) — and is
    // NOT capped down to 80. The 20 gap is explicitly platform-absorbed.
    const expected = computeRefund({ heldAmount: 80, baseAmount: 100, alreadyReleased: 0 });
    expect(result.refund.refundAmount).toBe(100);
    expect(result.refund.refundAmount).toBe(expected.refundAmount);
    expect(result.refund.fromEscrow).toBe(80);
    expect(result.refund.platformAbsorbed).toBe(20);

    // The Payment row's amount reflects what actually moved in escrow
    // (fromEscrow), not the full requester-facing refund promise.
    const paymentUpdateCall = prisma.payment.update.mock.calls[0][0];
    expect(paymentUpdateCall.data.amount).toBe(expected.fromEscrow);
    expect(paymentUpdateCall.data.status).toBe(PaymentStatus.refunded);
  });

  it("refund amount equals baseAmount, not heldAmount, and is not capped by it", async () => {
    // baseAmount=200, heldAmount=150 (discounted). The requester is owed the
    // full base amount (200) — NOT capped to 150. Escrow can only physically
    // return 150 of it; the remaining 50 is platform-absorbed.
    const dispute = makeDispute({ claimedByAdminId: "admin-x" });
    const payment = makePayment({ amount: 150, baseAmount: 200 });

    prisma.dispute.updateMany.mockResolvedValue({ count: 1 });
    prisma.dispute.findUnique.mockResolvedValue(dispute);
    prisma.payment.findUnique.mockResolvedValue(payment);
    prisma.payment.update.mockResolvedValue(payment);
    prisma.dispute.update.mockResolvedValue(dispute);

    const result = await service.resolveDispute("dispute-1", "admin-x");

    // computeRefund(heldAmount=150, baseAmount=200, alreadyReleased=0):
    //   refundAmount = baseAmount - alreadyReleased = 200
    //   fromEscrow = min(200, 150) = 150
    //   platformAbsorbed = 200 - 150 = 50
    expect(result.refund.refundAmount).toBe(200);
    expect(result.refund.fromEscrow).toBe(150);
    expect(result.refund.platformAbsorbed).toBe(50);
  });

  it("refund = baseAmount when there's no discount — base and held are equal", async () => {
    const dispute = makeDispute({ claimedByAdminId: "admin-z" });
    const payment = makePayment({ amount: 50, baseAmount: 50 });

    prisma.dispute.updateMany.mockResolvedValue({ count: 1 });
    prisma.dispute.findUnique.mockResolvedValue(dispute);
    prisma.payment.findUnique.mockResolvedValue(payment);
    prisma.payment.update.mockResolvedValue(payment);
    prisma.dispute.update.mockResolvedValue(dispute);

    const result = await service.resolveDispute("dispute-1", "admin-z");
    // base=50, held=50, released=0 → refund = 50, fully from escrow, nothing absorbed
    expect(result.refund.refundAmount).toBe(50);
    expect(result.refund.fromEscrow).toBe(50);
    expect(result.refund.platformAbsorbed).toBe(0);
  });

  it("throws DisputeNotClaimedByAdminError when adminId does not match claimedByAdminId", async () => {
    // The guarded updateMany's WHERE (status='open' AND claimedByAdminId=adminId)
    // wouldn't match a dispute claimed by someone else — simulate that with count: 0.
    prisma.dispute.updateMany.mockResolvedValue({ count: 0 });
    prisma.dispute.findUnique.mockResolvedValue(
      makeDispute({ claimedByAdminId: "admin-other" })
    );

    await expect(
      service.resolveDispute("dispute-1", "admin-mine")
    ).rejects.toThrow(DisputeNotClaimedByAdminError);

    expect(prisma.payment.findUnique).not.toHaveBeenCalled();
  });

  it("throws DisputeNotClaimedByAdminError when dispute is not yet claimed (claimedByAdminId=null)", async () => {
    prisma.dispute.updateMany.mockResolvedValue({ count: 0 });
    prisma.dispute.findUnique.mockResolvedValue(makeDispute({ claimedByAdminId: null }));

    await expect(
      service.resolveDispute("dispute-1", "admin-1")
    ).rejects.toThrow(DisputeNotClaimedByAdminError);
  });

  it("throws DisputeNotFoundError when dispute does not exist", async () => {
    prisma.dispute.updateMany.mockResolvedValue({ count: 0 });
    prisma.dispute.findUnique.mockResolvedValue(null);

    await expect(
      service.resolveDispute("dispute-1", "admin-1")
    ).rejects.toThrow(DisputeNotFoundError);
  });

  it("the guarded updateMany targets status='open' and claimedByAdminId=adminId", async () => {
    prisma.dispute.updateMany.mockResolvedValue({ count: 1 });
    prisma.dispute.findUnique.mockResolvedValue(makeDispute({ claimedByAdminId: "admin-1" }));
    prisma.payment.findUnique.mockResolvedValue(makePayment());
    prisma.payment.update.mockResolvedValue({});
    prisma.dispute.update.mockResolvedValue(makeDispute());

    await service.resolveDispute("dispute-1", "admin-1");

    const call = prisma.dispute.updateMany.mock.calls[0][0];
    expect(call.where.id).toBe("dispute-1");
    expect(call.where.status).toBe(DisputeStatus.open);
    expect(call.where.claimedByAdminId).toBe("admin-1");
    expect(call.data.status).toBe(DisputeStatus.resolved);
  });

  it("double-submit by the same admin: the second resolveDispute call loses the atomic guard", async () => {
    // Simulates a double-click/retry: the first call's guarded update has
    // already flipped status to 'resolved', so the second call's updateMany
    // (same WHERE, status='open') matches zero rows — exactly how Postgres's
    // row lock would behave on a real concurrent pair of these statements.
    prisma.dispute.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    prisma.dispute.findUnique.mockResolvedValue(makeDispute({ claimedByAdminId: "admin-1" }));
    prisma.payment.findUnique.mockResolvedValue(makePayment());
    prisma.payment.update.mockResolvedValue({});
    prisma.dispute.update.mockResolvedValue(makeDispute());

    const first = service.resolveDispute("dispute-1", "admin-1");
    const second = service.resolveDispute("dispute-1", "admin-1");

    await expect(first).resolves.toBeDefined();
    await expect(second).rejects.toThrow(DisputeNotClaimedByAdminError);

    // The refund/payment side effects must only have run once.
    expect(prisma.payment.update).toHaveBeenCalledOnce();
  });
});
