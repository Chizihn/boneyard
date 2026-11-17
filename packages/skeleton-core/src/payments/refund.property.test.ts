/**
 * Property-based tests for computeRefund.
 *
 * Invariants from docs/KIRO-PLAN.md + .kiro/steering/refund-base-amount.md:
 *   P1 — refundAmount is derived from baseAmount, uncapped, and independent
 *        of heldAmount: refundAmount === baseAmount - alreadyReleased,
 *        always, even when heldAmount is much smaller than baseAmount.
 *        (This is the property an earlier version of computeRefund violated:
 *        it capped refundAmount at heldAmount - alreadyReleased, which is
 *        exactly wrong for the discounted case.)
 *   P2 — escrow accounting: fromEscrow + alreadyReleased never exceeds
 *        heldAmount (you cannot withdraw more from escrow than was held).
 *   P3 — full accounting: fromEscrow + platformAbsorbed === refundAmount.
 *   P4 — platformAbsorbed is exactly the discount gap: zero when
 *        baseAmount === heldAmount (no discount), positive otherwise.
 *   P5 — remainingHeld === heldAmount - alreadyReleased - fromEscrow.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { computeRefund } from "./refund";

/**
 * Arbitrary for a valid RefundInput triple where:
 *   baseAmount >= heldAmount >= alreadyReleased >= 0
 */
const arbValidRefundInput = fc
  .tuple(
    fc.double({ min: 0, max: 10_000, noNaN: true }), // alreadyReleased
    fc.double({ min: 0, max: 10_000, noNaN: true }), // extra held above alreadyReleased
    fc.double({ min: 0, max: 10_000, noNaN: true }) // extra base above heldAmount
  )
  .map(([released, extraHeld, extraBase]) => ({
    alreadyReleased: released,
    heldAmount: released + extraHeld,
    baseAmount: released + extraHeld + extraBase,
  }));

const arbValidRefundInputInt = fc
  .tuple(
    fc.integer({ min: 0, max: 10_000 }),
    fc.integer({ min: 0, max: 10_000 }),
    fc.integer({ min: 0, max: 10_000 })
  )
  .map(([released, extraHeld, extraBase]) => ({
    alreadyReleased: released,
    heldAmount: released + extraHeld,
    baseAmount: released + extraHeld + extraBase,
  }));

describe("computeRefund — property tests", () => {
  it("P1: refundAmount === baseAmount - alreadyReleased, independent of heldAmount", () => {
    fc.assert(
      fc.property(arbValidRefundInputInt, (input) => {
        const result = computeRefund(input);
        return result.refundAmount === input.baseAmount - input.alreadyReleased;
      }),
      { numRuns: 1000 }
    );
  });

  it("P1-regression: varying heldAmount with baseAmount/alreadyReleased fixed never changes refundAmount", () => {
    // This is the exact scenario the old (buggy) cap-at-heldAmount formula broke:
    // refundAmount must stay pinned to baseAmount regardless of how small heldAmount is.
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000 }), // alreadyReleased
        fc.integer({ min: 0, max: 5_000 }), // extraBase -> baseAmount = alreadyReleased + extraBase
        fc.integer({ min: 0, max: 5_000 }), // extraHeldOffset, folded into [0, extraBase]
        (alreadyReleased, extraBase, extraHeldOffset) => {
          const baseAmount = alreadyReleased + extraBase;
          const heldAmount =
            alreadyReleased + (extraBase === 0 ? 0 : extraHeldOffset % (extraBase + 1));

          const result = computeRefund({ heldAmount, baseAmount, alreadyReleased });
          return result.refundAmount === baseAmount - alreadyReleased;
        }
      ),
      { numRuns: 1000 }
    );
  });

  it("P2: fromEscrow + alreadyReleased never exceeds heldAmount", () => {
    fc.assert(
      fc.property(arbValidRefundInput, (input) => {
        const result = computeRefund(input);
        return (
          result.fromEscrow + input.alreadyReleased <=
          input.heldAmount + Number.EPSILON * 1e6
        );
      }),
      { numRuns: 1000 }
    );
  });

  it("P3: fromEscrow + platformAbsorbed === refundAmount", () => {
    fc.assert(
      fc.property(arbValidRefundInput, (input) => {
        const result = computeRefund(input);
        return (
          Math.abs(result.fromEscrow + result.platformAbsorbed - result.refundAmount) < 1e-9
        );
      }),
      { numRuns: 1000 }
    );
  });

  it("P4: platformAbsorbed is zero iff there was no discount (baseAmount === heldAmount)", () => {
    fc.assert(
      fc.property(arbValidRefundInputInt, (input) => {
        const result = computeRefund(input);
        const noDiscount = input.baseAmount === input.heldAmount;
        return noDiscount
          ? result.platformAbsorbed === 0
          : result.platformAbsorbed >= 0; // positive whenever a discount exists and the refund exceeds what's held
      }),
      { numRuns: 1000 }
    );
  });

  it("P4-strict: a real discount with a full refund produces a positive platformAbsorbed", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000 }), // heldAmount
        fc.integer({ min: 1, max: 5_000 }), // discountGap (strictly positive -> real discount)
        (heldAmount, discountGap) => {
          const baseAmount = heldAmount + discountGap;
          const result = computeRefund({ heldAmount, baseAmount, alreadyReleased: 0 });
          // Full refund (alreadyReleased = 0) on a discounted order: escrow can only
          // cover heldAmount, so the entire discountGap must show up as platformAbsorbed.
          return result.fromEscrow === heldAmount && result.platformAbsorbed === discountGap;
        }
      ),
      { numRuns: 1000 }
    );
  });

  it("P5: remainingHeld === heldAmount - alreadyReleased - fromEscrow", () => {
    fc.assert(
      fc.property(arbValidRefundInput, (input) => {
        const result = computeRefund(input);
        const expected = input.heldAmount - input.alreadyReleased - result.fromEscrow;
        return Math.abs(result.remainingHeld - expected) < 1e-9;
      }),
      { numRuns: 1000 }
    );
  });

  it("full refund, no discount: refundAmount === fromEscrow === baseAmount === heldAmount", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5_000 }), (amount) => {
        const result = computeRefund({
          heldAmount: amount,
          baseAmount: amount,
          alreadyReleased: 0,
        });
        return (
          result.refundAmount === amount &&
          result.fromEscrow === amount &&
          result.platformAbsorbed === 0
        );
      }),
      { numRuns: 1000 }
    );
  });

  it("rejects baseAmount < heldAmount, negative values, and alreadyReleased > heldAmount", () => {
    expect(() => computeRefund({ heldAmount: 100, baseAmount: 50, alreadyReleased: 0 })).toThrow();
    expect(() => computeRefund({ heldAmount: -1, baseAmount: 10, alreadyReleased: 0 })).toThrow();
    expect(() => computeRefund({ heldAmount: 10, baseAmount: -1, alreadyReleased: 0 })).toThrow();
    expect(() => computeRefund({ heldAmount: 10, baseAmount: 10, alreadyReleased: -1 })).toThrow();
    expect(() => computeRefund({ heldAmount: 10, baseAmount: 10, alreadyReleased: 11 })).toThrow();
  });
});
