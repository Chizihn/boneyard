import { InvalidRefundInputError, RefundInput, RefundResult } from "./payments.types";

/**
 * Computes how much to refund on a disputed or cancelled order.
 *
 * Refund rule (from .kiro/steering/refund-base-amount.md):
 *   The refund owed to the requester is always derived from `baseAmount`
 *   (the pre-discount price), never from `heldAmount` (what the requester
 *   actually paid after discounts) — and it is NOT capped by heldAmount.
 *   "The platform absorbs the gap" is literal: when baseAmount > heldAmount
 *   (a discount was applied), the requester is still owed the full
 *   base-derived amount. Whatever portion can't be drawn back out of the
 *   actual held funds (`fromEscrow`, capped at heldAmount - alreadyReleased)
 *   is `platformAbsorbed` — the discount cost, which lands on the platform,
 *   not on the provider and not on the requester.
 *
 *   NOTE: an earlier version of this function capped `refundAmount` itself
 *   at `heldAmount - alreadyReleased` via `Math.min(baseAmount, ...)`. That
 *   was wrong: since the validation below requires `baseAmount >= heldAmount`,
 *   that min() picked the heldAmount-derived cap on every single discounted
 *   order — the one case this rule exists to handle — making the refund
 *   silently equal to the discounted total instead of the base amount.
 *
 * Escrow accounting (the only hard physical constraint):
 *   `fromEscrow + alreadyReleased` must never exceed `heldAmount` — you
 *   cannot withdraw more from escrow than was ever deposited into it.
 *
 * Throws `InvalidRefundInputError` on:
 *   - Any negative input value
 *   - `baseAmount < heldAmount` (the pre-discount base must be >= the
 *     discounted charged amount — a discount can only lower the charged
 *     amount, never raise it above base)
 *   - `alreadyReleased > heldAmount` (can't release more than was held)
 */
export function computeRefund(input: RefundInput): RefundResult {
  const { heldAmount, baseAmount, alreadyReleased } = input;

  if (heldAmount < 0) {
    throw new InvalidRefundInputError(`heldAmount must be >= 0, got ${heldAmount}`);
  }
  if (baseAmount < 0) {
    throw new InvalidRefundInputError(`baseAmount must be >= 0, got ${baseAmount}`);
  }
  if (alreadyReleased < 0) {
    throw new InvalidRefundInputError(`alreadyReleased must be >= 0, got ${alreadyReleased}`);
  }
  if (baseAmount < heldAmount) {
    throw new InvalidRefundInputError(
      `baseAmount (${baseAmount}) must be >= heldAmount (${heldAmount}) — ` +
        `a discount lowers the charged amount, so base is always >= charged`
    );
  }
  if (alreadyReleased > heldAmount) {
    throw new InvalidRefundInputError(
      `alreadyReleased (${alreadyReleased}) exceeds heldAmount (${heldAmount})`
    );
  }

  // The full amount still owed to the requester — derived from baseAmount,
  // uncapped by heldAmount. This is the number the steering rule refers to.
  const refundAmount = baseAmount - alreadyReleased;

  // What's physically available to draw back out of the held payment.
  const availableInEscrow = heldAmount - alreadyReleased;

  // Draw as much of the refund as escrow can cover; never more than that.
  const fromEscrow = Math.min(refundAmount, availableInEscrow);

  // Whatever's left is the discount gap — the platform's cost, not the
  // provider's and not a reason to shortchange the requester.
  const platformAbsorbed = refundAmount - fromEscrow;

  const remainingHeld = availableInEscrow - fromEscrow;

  return { refundAmount, fromEscrow, platformAbsorbed, remainingHeld };
}
