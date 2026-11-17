import { PaymentStatus, DisputeStatus } from "@prisma/client";

export { PaymentStatus, DisputeStatus };

// ---------------------------------------------------------------------------
// Refund math types
// ---------------------------------------------------------------------------

export interface RefundInput {
  /** Payment.amount — what was actually charged (post-discount) */
  heldAmount: number;
  /** Payment.baseAmount — pre-discount; refund is always derived from this */
  baseAmount: number;
  /** Portion already released to the provider, if any (default 0) */
  alreadyReleased: number;
}

export interface RefundResult {
  /**
   * Total amount owed to the requester, derived from baseAmount and
   * UNCAPPED by heldAmount — this is "the" refund amount the rule in
   * .kiro/steering/refund-base-amount.md refers to.
   */
  refundAmount: number;
  /**
   * The portion of refundAmount actually drawn back out of the held
   * payment. Capped at (heldAmount - alreadyReleased) — you cannot
   * physically withdraw more from escrow than was deposited into it.
   */
  fromEscrow: number;
  /**
   * The gap between refundAmount and fromEscrow — the cost of a
   * promotional discount that the platform absorbs rather than the
   * provider. Zero when no discount was applied (baseAmount === heldAmount).
   */
  platformAbsorbed: number;
  /** heldAmount - alreadyReleased - fromEscrow */
  remainingHeld: number;
}

// ---------------------------------------------------------------------------
// Dispute service types
// ---------------------------------------------------------------------------

/**
 * Minimal Dispute shape returned from DB operations.
 * Named `DisputeRecord`, not `Dispute`, to avoid colliding with the
 * Prisma-generated `Dispute` model type re-exported via `../prisma-client`.
 */
export interface DisputeRecord {
  id: string;
  requestId: string;
  raisedBy: string;
  status: DisputeStatus;
  reason: string | null;
  resolution: string | null;
  claimedByAdminId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResolveDisputeResult {
  dispute: DisputeRecord;
  refund: RefundResult;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InvalidRefundInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRefundInputError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DisputeNotFoundError extends Error {
  constructor(disputeId: string) {
    super(`Dispute "${disputeId}" not found.`);
    this.name = "DisputeNotFoundError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DisputeAlreadyClaimedError extends Error {
  constructor(disputeId: string) {
    super(
      `Dispute "${disputeId}" is already claimed or resolved — another admin won the race.`
    );
    this.name = "DisputeAlreadyClaimedError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DisputeNotClaimedByAdminError extends Error {
  constructor(disputeId: string, adminId: string) {
    super(
      `Dispute "${disputeId}" is not claimed by admin "${adminId}".`
    );
    this.name = "DisputeNotClaimedByAdminError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PaymentNotFoundError extends Error {
  constructor(requestId: string) {
    super(`Payment for request "${requestId}" not found.`);
    this.name = "PaymentNotFoundError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
