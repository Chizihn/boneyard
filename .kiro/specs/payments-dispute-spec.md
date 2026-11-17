# payments-dispute-spec — give this to Kiro verbatim

## Where this code goes

Package: `packages/skeleton-core` (follow the shape of `order-state/`,
`auth/`, and `matching/` — types file, service/logic file, test file,
`index.ts` barrel).

Create:
- `packages/skeleton-core/src/payments/payments.types.ts`
- `packages/skeleton-core/src/payments/refund.ts`
- `packages/skeleton-core/src/payments/refund.property.test.ts`
- `packages/skeleton-core/src/payments/dispute.service.ts`
- `packages/skeleton-core/src/payments/dispute.service.test.ts`
- `packages/skeleton-core/src/payments/dispute.service.property.test.ts`
- `packages/skeleton-core/src/payments/index.ts`

Then add this line to the existing `packages/skeleton-core/src/index.ts`:
```ts
export * from "./payments";
```

## Critical constraint: reuse existing types, don't redeclare

- Import `PaymentStatus` and `DisputeStatus` from `@prisma/client` (already
  defined in `prisma/schema.prisma`) — don't redeclare them.
- Use `PrismaClient` from `@prisma/client` for DB access, the same
  constructor-injection pattern `AuthService` already uses in
  `packages/skeleton-core/src/auth/auth.service.ts` (`constructor(private
  readonly prisma: PrismaClient) {}`) — be consistent with that.
- `fast-check` is already a devDependency — use it for both property tests
  below, same as `matching-runner.property.test.ts` already does.

## Steering docs this spec must satisfy (read both before writing code)

- `.kiro/steering/refund-base-amount.md`
- `.kiro/steering/dispute-atomic-claim.md`

These aren't optional guidance — they're the two things this spec exists
to get right, and both are PBT targets in `docs/KIRO-PLAN.md`.

## Part 1: Refund math (`refund.ts`)

```ts
export interface RefundInput {
  heldAmount: number;   // Payment.amount — what was actually charged (post-discount)
  baseAmount: number;   // Payment.baseAmount — pre-discount
  alreadyReleased: number; // portion already released to provider, if any (default 0)
}

export interface RefundResult {
  refundAmount: number;
  remainingHeld: number;
}

export function computeRefund(input: RefundInput): RefundResult;
```

Rule: **refund is always computed from `baseAmount`, never from
`heldAmount`/the discounted total the requester paid.** The platform
absorbs the gap between `baseAmount` and `heldAmount` — the provider's
refund exposure is based on the undiscounted price. Concretely: on a full
refund, `refundAmount === baseAmount` capped so that
`refundAmount + alreadyReleased` never exceeds `heldAmount` (you can't
refund or release more than was actually held). Throw on invalid input
(negative amounts, `baseAmount` less than `heldAmount` — base should always
be ≥ the discounted amount actually charged).

### Property test (`refund.property.test.ts`)

Generate arbitrary `heldAmount`/`baseAmount`/`alreadyReleased` combinations
(keeping them in valid relative ranges) and assert for every run:
- `refundAmount` is always derived from `baseAmount`, never from
  `heldAmount` (i.e. changing `heldAmount` while holding `baseAmount` and
  the discount-relationship fixed does not change the computed refund,
  except where it changes the cap).
- `refundAmount + alreadyReleased <= heldAmount` always holds (total
  released + refunded never exceeds amount held — this is the exact
  wording of the PBT target in `docs/KIRO-PLAN.md`).

## Part 2: Dispute claiming + resolution (`dispute.service.ts`)

```ts
export class DisputeService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Atomically claims an open dispute for the given admin.
   * Must be a single conditional UPDATE guarded by current status
   * (`WHERE status = 'open'`) — never a read-then-write pair.
   * Returns the claimed dispute, or throws `DisputeAlreadyClaimedError`
   * if another admin's claim (or resolution) won the race.
   */
  async claimDispute(disputeId: string, adminId: string): Promise<Dispute>;

  /**
   * Resolves a claimed dispute: computes the refund via `computeRefund`
   * (reading the associated Payment's baseAmount/amount), updates the
   * Payment and Dispute rows, and returns the result. Must only proceed
   * on a dispute this adminId actually claimed — throw
   * `DisputeNotClaimedByAdminError` otherwise.
   */
  async resolveDispute(disputeId: string, adminId: string): Promise<ResolveDisputeResult>;
}
```

The atomic claim is the whole point of this module. Use Prisma's
`updateMany` (or raw SQL via `$executeRaw`) with a `WHERE status = 'open'
AND claimedByAdminId IS NULL` guard in the same statement that sets
`claimedByAdminId` and flips status — not `findUnique` followed by a
separate `update`. If the guarded update affects zero rows, that means
someone else won the race; throw `DisputeAlreadyClaimedError` in that case
rather than silently succeeding or returning a stale read.

`resolveDispute` must call `computeRefund` from Part 1 — don't
reimplement refund math inline here.

### Unit tests (`dispute.service.test.ts`)

Mock `PrismaClient` the same way `auth.service.test.ts` does. Cover:
- Successful claim on an open, unclaimed dispute.
- `claimDispute` throws `DisputeAlreadyClaimedError` when the guarded
  update affects zero rows (simulate this via the mock returning `{ count:
  0 }` from `updateMany`).
- `resolveDispute` throws `DisputeNotClaimedByAdminError` if called with
  an `adminId` that doesn't match `claimedByAdminId`.
- `resolveDispute`'s refund calculation reads `baseAmount`, confirmed by
  asserting the mock Payment update is called with a refund amount that
  matches `computeRefund`'s output for that input, not the discounted
  `amount`.

### Property test (`dispute.service.property.test.ts`)

This is the concurrency PBT target: **under concurrent claim attempts on
the same dispute, exactly one succeeds.** Since this package has no real
Postgres connection in its unit tests (DB access is mocked, same as
`auth.service.test.ts`), simulate concurrency against an in-memory fake
that mimics Postgres's guarded-update semantics: a single shared "row"
object, and a fake `updateMany` that only succeeds (returns `count: 1`) if
the `WHERE` condition it's given would actually match current state,
otherwise returns `count: 0` — applied atomically within the fake (no
interleaving inside a single fake call, which is the real guarantee a
genuine `WHERE status = 'open'` SQL statement gives you from Postgres).
Use `fast-check` to generate an arbitrary number of concurrent
`claimDispute` calls (2–20) with different `adminId`s against the same
fake dispute row, run them via `Promise.all`, and assert exactly one
resolves successfully and the rest throw `DisputeAlreadyClaimedError`.

If this is hard to express cleanly against the mocked Prisma client,
it's acceptable to write the atomic-guard logic as a small pure function
extracted from `claimDispute` (e.g. `tryClaim(row, adminId): { row,
claimed: boolean }`) specifically so it's unit/property-testable without a
real database — then `claimDispute` itself just wraps that logic in the
real Prisma guarded update. Favor that extraction if it makes the property
test meaningfully simpler; don't force a fragile mock-concurrency setup
just to avoid adding one pure function.

## Out of scope

No NestJS/HTTP layer. No actual payment provider integration (Stripe/
Paystack sandbox mode) — that's `backend/api`, built later. This module
only owns the pure refund math and the atomic-claim dispute logic against
the existing Prisma schema.
