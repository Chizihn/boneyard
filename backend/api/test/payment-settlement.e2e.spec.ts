/**
 * PaymentSettlementService against the real Postgres container — only the
 * Bachs HTTP boundary is faked (there's no real sandbox API key available
 * in this environment). This exercises the actual atomic-claim and
 * resume-under-the-same-key logic for real, the same "don't mock the DB"
 * philosophy as the other e2e specs in this directory.
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@boneyard/skeleton-core";
import { PaymentSettlementService } from "../src/payments/payment-settlement.service";
import type { BachsService } from "../src/payments/bachs.service";
import type { ConfigService } from "@nestjs/config";

const fakeConfig = {
  get: (key: string) => `https://boneyard.example/${key.toLowerCase()}`,
} as unknown as ConfigService;

const RUN_ID = Date.now();
const EMAIL_DOMAIN = `settle-${RUN_ID}.test`;
const emailFor = (label: string) => `${label}@${EMAIL_DOMAIN}`;

class FakeBachsService {
  calls: Array<{ method: string; args: unknown[] }> = [];
  shouldFailTransfer = false;
  accountId = "acct_fake_1";
  transferId = "tr_fake_1";

  async createConnectedAccount(payload: Record<string, unknown>) {
    this.calls.push({ method: "createConnectedAccount", args: [payload] });
    return { id: this.accountId };
  }

  async createAccountLink(accountId: string, payload: Record<string, unknown>) {
    this.calls.push({ method: "createAccountLink", args: [accountId, payload] });
    return { url: `https://sandbox-dashboard.bachs.io/onboard/${accountId}` };
  }

  async getConnectedAccount(accountId: string) {
    this.calls.push({ method: "getConnectedAccount", args: [accountId] });
    return { id: accountId };
  }

  async createTransfer(payload: Record<string, unknown>, idempotencyKey: string) {
    this.calls.push({ method: "createTransfer", args: [payload, idempotencyKey] });
    if (this.shouldFailTransfer) {
      throw new Error("simulated Bachs outage");
    }
    return { id: this.transferId };
  }
}

describe("PaymentSettlementService (real DB, faked Bachs HTTP boundary)", () => {
  let fakeBachs: FakeBachsService;
  let settlement: PaymentSettlementService;
  let providerId: string;

  beforeAll(async () => {
    const provider = await prisma.user.create({
      data: { email: emailFor("prov"), password: "unused", name: "Provider", role: "provider" },
    });
    providerId = provider.id;
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { endsWith: `@${EMAIL_DOMAIN}` } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    const listings = await prisma.listing.findMany({
      where: { providerId: { in: userIds } },
      select: { id: true },
    });
    const listingIds = listings.map((l) => l.id);
    const requests = await prisma.request.findMany({
      where: { listingId: { in: listingIds } },
      select: { id: true },
    });
    const requestIds = requests.map((r) => r.id);
    await prisma.payment.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.request.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    fakeBachs = new FakeBachsService();
    settlement = new PaymentSettlementService(fakeBachs as unknown as BachsService, fakeConfig);
  });

  async function createHeldPayment(amount = 50) {
    const listing = await prisma.listing.create({
      data: {
        providerId,
        vertical: "hallowear",
        title: "Test listing",
        metadata: {},
        location: { lat: 0, lng: 0 },
      },
    });
    const request = await prisma.request.create({
      data: {
        requesterId: providerId, // reuse the same user id, irrelevant to this test
        listingId: listing.id,
        vertical: "hallowear",
        status: "IN_PROGRESS",
        windowStart: new Date(),
        windowEnd: new Date(Date.now() + 86_400_000),
        amount,
      },
    });
    const payment = await prisma.payment.create({
      data: { requestId: request.id, amount, status: "held", baseAmount: amount },
    });
    return payment;
  }

  it("ensureConnectedAccount creates one when none exists, and is idempotent", async () => {
    await prisma.user.update({ where: { id: providerId }, data: { bachsAccountId: null } });

    const first = await settlement.ensureConnectedAccount(providerId);
    expect(first.accountId).toBe(fakeBachs.accountId);
    expect(first.onboardingUrl).toContain(fakeBachs.accountId);
    expect(fakeBachs.calls.filter((c) => c.method === "createConnectedAccount")).toHaveLength(1);

    const second = await settlement.ensureConnectedAccount(providerId);
    expect(second.accountId).toBe(fakeBachs.accountId);
    // No second createConnectedAccount call — idempotent.
    expect(fakeBachs.calls.filter((c) => c.method === "createConnectedAccount")).toHaveLength(1);
  });

  it("releasePayment falls back to a plain status flip when the provider has no connected account", async () => {
    await prisma.user.update({ where: { id: providerId }, data: { bachsAccountId: null } });
    const payment = await createHeldPayment();

    await settlement.releasePayment(payment.id, providerId);

    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe("released");
    expect(updated.providerReference).toBeNull();
    expect(fakeBachs.calls).toHaveLength(0);
  });

  it("with a connected account: atomically claims, calls Bachs, and records the real reference", async () => {
    await prisma.user.update({ where: { id: providerId }, data: { bachsAccountId: "acct_existing" } });
    const payment = await createHeldPayment(75);

    await settlement.releasePayment(payment.id, providerId);

    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe("released");
    expect(updated.providerReference).toBe(fakeBachs.transferId);

    const transferCall = fakeBachs.calls.find((c) => c.method === "createTransfer");
    expect(transferCall).toBeDefined();
    const [, idempotencyKey] = transferCall!.args as [Record<string, unknown>, string];
    expect(idempotencyKey).toBe(payment.id);
  });

  it("on Bachs failure, leaves providerReference at PENDING:<key> rather than resetting it", async () => {
    await prisma.user.update({ where: { id: providerId }, data: { bachsAccountId: "acct_existing" } });
    const payment = await createHeldPayment();
    fakeBachs.shouldFailTransfer = true;

    await expect(settlement.releasePayment(payment.id, providerId)).rejects.toThrow(
      "simulated Bachs outage"
    );

    const stuck = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stuck.status).toBe("held");
    expect(stuck.providerReference).toBe(`PENDING:${payment.id}`);
  });

  it("retrying after a failure resumes under the SAME idempotency key, not a new one", async () => {
    await prisma.user.update({ where: { id: providerId }, data: { bachsAccountId: "acct_existing" } });
    const payment = await createHeldPayment();
    fakeBachs.shouldFailTransfer = true;

    await expect(settlement.releasePayment(payment.id, providerId)).rejects.toThrow();
    const firstAttemptKey = (
      fakeBachs.calls.find((c) => c.method === "createTransfer")!.args as [unknown, string]
    )[1];

    fakeBachs.shouldFailTransfer = false;
    await settlement.releasePayment(payment.id, providerId);

    const transferCalls = fakeBachs.calls.filter((c) => c.method === "createTransfer");
    expect(transferCalls).toHaveLength(2);
    const secondAttemptKey = (transferCalls[1].args as [unknown, string])[1];
    expect(secondAttemptKey).toBe(firstAttemptKey);
    expect(secondAttemptKey).toBe(payment.id);

    const resolved = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(resolved.status).toBe("released");
    expect(resolved.providerReference).toBe(fakeBachs.transferId);
  });

  it("is a no-op once already settled for real — never calls Bachs again", async () => {
    await prisma.user.update({ where: { id: providerId }, data: { bachsAccountId: "acct_existing" } });
    const payment = await createHeldPayment();

    await settlement.releasePayment(payment.id, providerId);
    expect(fakeBachs.calls.filter((c) => c.method === "createTransfer")).toHaveLength(1);

    await settlement.releasePayment(payment.id, providerId);
    expect(fakeBachs.calls.filter((c) => c.method === "createTransfer")).toHaveLength(1);
  });
});
