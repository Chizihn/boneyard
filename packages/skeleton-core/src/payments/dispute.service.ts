import { PrismaClient, DisputeStatus, PaymentStatus } from "@prisma/client";
import { computeRefund } from "./refund";
import {
  DisputeRecord,
  ResolveDisputeResult,
  DisputeAlreadyClaimedError,
  DisputeNotClaimedByAdminError,
  DisputeNotFoundError,
  PaymentNotFoundError,
} from "./payments.types";

/**
 * Pure atomic-claim logic extracted for testability.
 *
 * Given a dispute row and an adminId, returns `{ claimed: true }` if the
 * claim would succeed (status is open AND not yet claimed by anyone), or
 * `{ claimed: false }` if another admin already holds it.
 *
 * This mirrors exactly the WHERE clause of the guarded Prisma updateMany:
 *   WHERE id = disputeId AND status = 'open' AND claimedByAdminId IS NULL
 *
 * Extracted so the property test can run concurrent claim attempts against
 * an in-memory fake without fighting Prisma's mock surface.
 */
export function tryClaim(
  row: { status: DisputeStatus; claimedByAdminId: string | null },
  _adminId: string
): { claimed: boolean } {
  if (row.status === DisputeStatus.open && row.claimedByAdminId === null) {
    return { claimed: true };
  }
  return { claimed: false };
}

export class DisputeService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Atomically claims an open dispute for the given admin.
   *
   * Uses a single guarded UPDATE (Prisma updateMany with a WHERE on both
   * `status` and `claimedByAdminId`) — never a read-then-write pair.
   * If the update affects zero rows, another admin won the race;
   * throws `DisputeAlreadyClaimedError`.
   *
   * This satisfies the atomic-claim requirement in
   * .kiro/steering/dispute-atomic-claim.md.
   */
  async claimDispute(disputeId: string, adminId: string): Promise<DisputeRecord> {
    const result = await this.prisma.dispute.updateMany({
      where: {
        id: disputeId,
        status: DisputeStatus.open,
        claimedByAdminId: null,
      },
      data: {
        claimedByAdminId: adminId,
      },
    });

    if (result.count === 0) {
      throw new DisputeAlreadyClaimedError(disputeId);
    }

    // Safe to fetch now — we own the claim
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
    });
    if (!dispute) {
      throw new DisputeNotFoundError(disputeId);
    }

    return dispute;
  }

  /**
   * Resolves a claimed dispute.
   *
   * Guards:
   *  - Atomically flips status open -> resolved, guarded by
   *    `status = 'open' AND claimedByAdminId = adminId` — the same
   *    guarded-update pattern as `claimDispute`. This closes a narrower but
   *    real race: without it, the *same* admin double-submitting resolution
   *    (e.g. a double-click, or a retried request) could pass a plain
   *    read-then-write check twice and double-process the refund. Postgres's
   *    row lock on the guarded UPDATE means only one concurrent call can
   *    ever see `status = 'open'` match — the second always loses the race
   *    the same way a different admin's claim attempt would.
   *  - Refund is computed via `computeRefund` reading Payment.baseAmount,
   *    never Payment.amount — satisfies .kiro/steering/refund-base-amount.md.
   */
  async resolveDispute(
    disputeId: string,
    adminId: string
  ): Promise<ResolveDisputeResult> {
    const claim = await this.prisma.dispute.updateMany({
      where: {
        id: disputeId,
        status: DisputeStatus.open,
        claimedByAdminId: adminId,
      },
      data: {
        status: DisputeStatus.resolved,
      },
    });

    if (claim.count === 0) {
      // Lost the guard — either the dispute doesn't exist, isn't claimed by
      // this admin, or was already resolved (by this admin or another call).
      // This follow-up read is only to produce an accurate error message;
      // it has no bearing on correctness since the atomic guard above is
      // what actually prevents double-processing.
      const existing = await this.prisma.dispute.findUnique({
        where: { id: disputeId },
      });
      if (!existing) {
        throw new DisputeNotFoundError(disputeId);
      }
      throw new DisputeNotClaimedByAdminError(disputeId, adminId);
    }

    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
    });
    if (!dispute) {
      throw new DisputeNotFoundError(disputeId);
    }

    const payment = await this.prisma.payment.findUnique({
      where: { requestId: dispute.requestId },
    });
    if (!payment) {
      throw new PaymentNotFoundError(dispute.requestId);
    }

    // computeRefund reads baseAmount — never heldAmount/amount.
    // This is the single call site for refund math; don't inline it here.
    const refund = computeRefund({
      heldAmount: Number(payment.amount),
      baseAmount: Number(payment.baseAmount),
      alreadyReleased: 0,
    });

    // The Payment row tracks the actual escrowed funds — it records what's
    // physically drawn back out of escrow (fromEscrow), not the full
    // requester-facing refund promise (refundAmount), since any
    // platformAbsorbed gap never passed through this payment's held balance.
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.refunded,
        amount: refund.fromEscrow,
      },
    });

    // Status is already flipped to resolved by the atomic guard above —
    // this write only fills in the resolution text, which needs the refund
    // numbers we've just computed. Only the call that won the guard ever
    // reaches this line, so there's no double-write risk here.
    const resolutionNote =
      refund.platformAbsorbed > 0
        ? `Refund of ${refund.refundAmount} issued by admin ${adminId} ` +
          `(${refund.fromEscrow} from escrow, ${refund.platformAbsorbed} ` +
          `absorbed by platform for the promotional discount)`
        : `Refund of ${refund.refundAmount} issued by admin ${adminId}`;

    const resolved = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        resolution: resolutionNote,
      },
    });

    return { dispute: resolved, refund };
  }
}
