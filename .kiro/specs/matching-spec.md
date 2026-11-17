# matching-spec — give this to Kiro verbatim

## Where this code goes

Package: `packages/skeleton-core` (already has `order-state/` and `auth/`
modules following this same pattern — follow their shape).

Create:
- `packages/skeleton-core/src/matching/matching.types.ts`
- `packages/skeleton-core/src/matching/geo.ts`
- `packages/skeleton-core/src/matching/matching-runner.ts`
- `packages/skeleton-core/src/matching/matching-runner.property.test.ts`
- `packages/skeleton-core/src/matching/strategies/hallowear.strategy.ts`
- `packages/skeleton-core/src/matching/strategies/hallowear.strategy.test.ts`
- `packages/skeleton-core/src/matching/strategies/haint.strategy.ts`
- `packages/skeleton-core/src/matching/strategies/haint.strategy.test.ts`
- `packages/skeleton-core/src/matching/index.ts`

Then add this line to the existing `packages/skeleton-core/src/index.ts`:
```ts
export * from "./matching";
```

## Critical constraint: reuse existing types, don't redeclare

- Import `Vertical` from `@prisma/client` (already defined in
  `prisma/schema.prisma` as `hallowear | haint`) — don't redeclare it.
- Import `isProviderApproved` from `../auth` (already built — it's in
  `packages/skeleton-core/src/auth/auth.types.ts`). **This is the single
  most important wiring point in this spec**: the provider-approval gate
  from auth-spec must actually get enforced here, or it's dead code. See
  "Provider-approval gate" below for exactly where it plugs in.
- `fast-check` is already a devDependency of this package — use it for the
  property test below instead of a hand-written loop (unlike
  `order-state-spec`, this module's inputs aren't a small finite enum, so a
  real property test is expected, not a labeled substitute).

## The generic interface (from docs/ARCHITECTURE.md)

```ts
interface MatchingStrategy {
  isEligible(request: MatchingRequest, listing: MatchingListing, distanceKm: number): boolean;
  rank(request: MatchingRequest, eligible: Array<{ listing: MatchingListing; distanceKm: number }>): RankedCandidate[];
}
```

Design these input/output types yourself in `matching.types.ts`, but they
must include at least:

```ts
interface GeoPoint { lat: number; lng: number }

interface MatchingListing {
  listingId: string;
  providerId: string;
  vertical: Vertical;
  location: GeoPoint;
  active: boolean;
  providerApproved: boolean; // see "Provider-approval gate" below
  metadata: Record<string, unknown>;
}

interface MatchingRequest {
  vertical: Vertical;
  windowStart: Date;
  windowEnd: Date;
  location: GeoPoint;
  metadata?: Record<string, unknown>;
}

interface RankedCandidate {
  listingId: string;
  providerId: string;
  distanceKm: number;
  rank: number; // 1 = best
}
```

`geo.ts` should export a `distanceKm(a: GeoPoint, b: GeoPoint): number`
haversine implementation — pure function, no external geo library needed
for this scale.

## Provider-approval gate — enforce this in the runner, not per-strategy

`MatchingListing.providerApproved` must be computed by the caller (backend
layer, later) via `isProviderApproved(provider)` and passed in. **The
generic runner — not each strategy — must hard-filter out any listing
where `providerApproved` is `false`, before ever calling
`strategy.isEligible`.** This is deliberate: putting the check in the
runner means every current and future vertical (including ones scaffolded
later by the MCP tool) gets the gate for free, and no strategy
implementation can accidentally skip it. Do not also duplicate this check
inside `hallowear.strategy.ts` or `haint.strategy.ts` — it belongs in
exactly one place.

## The generic expanding-search runner

`matching-runner.ts` exports:

```ts
interface ExpandingSearchConfig {
  startRadiusKm: number;
  radiusStepKm: number;
  maxRadiusKm: number;
  maxCandidates: number;
}

interface MatchingResult {
  candidates: RankedCandidate[];
  radiusUsedKm: number;
  exhausted: boolean;        // true = reached maxRadiusKm with zero eligible
  totalEligibleFound: number;
  droppedForCapacity: number; // eligible candidates beyond maxCandidates — must be an explicit count, never silently discarded
}

function runMatching(
  request: MatchingRequest,
  listingPool: MatchingListing[],
  strategy: MatchingStrategy,
  config: ExpandingSearchConfig
): MatchingResult;
```

Algorithm (expanding radius waves):
1. Start at `startRadiusKm`.
2. Compute `distanceKm` from the request to every listing in the pool.
3. Filter to listings where `distanceKm <= currentRadius`, `active`, and
   `providerApproved` (the gate above).
4. Call `strategy.isEligible` on the survivors.
5. If at least one is eligible: call `strategy.rank`, sort by `rank`
   ascending, take the top `maxCandidates`, and return — set
   `droppedForCapacity` to however many eligible candidates didn't make the
   cut (0 if none).
6. If zero eligible and `currentRadius >= maxRadiusKm`: return an empty
   result with `exhausted: true`. **Never relax `maxRadiusKm` to find a
   fallback candidate — this is a steering-doc rule
   (`.kiro/steering/matching-radius-bound.md`), not a style choice.**
7. Otherwise increase radius by `radiusStepKm` (capped at `maxRadiusKm`)
   and go to step 2.

### Property test (`matching-runner.property.test.ts`)

Use `fast-check` to generate arbitrary listing pools (random count,
locations, `providerApproved` booleans) and arbitrary `ExpandingSearchConfig`
values, then assert for every run:
- No candidate in `result.candidates` has `distanceKm > config.maxRadiusKm`.
- `result.candidates.length + result.droppedForCapacity === result.totalEligibleFound`
  (the "never silently dropped without a reason" property — every eligible
  candidate is accounted for in one of these two numbers).
- No candidate with `providerApproved === false` ever appears in
  `result.candidates`.

This is one of the five PBT targets in `docs/KIRO-PLAN.md` — treat it as
load-bearing for the write-up, not a nice-to-have.

## Hallowear strategy

Listing metadata shape for this vertical:
```ts
{ category: string; availabilityStart: string; availabilityEnd: string; pricePerDay: number }
```
(dates as ISO strings)

- **Eligible**: the request's `[windowStart, windowEnd]` falls entirely
  within `[availabilityStart, availabilityEnd]`, AND the request's
  `metadata.category` matches the listing's `metadata.category` exactly.
- **Rank**: primarily by `distanceKm` ascending, using `pricePerDay` as the
  tiebreaker (cheaper first) when two candidates are within the same
  distance band. Pick a concrete, deterministic formula — document it with
  a one-line comment — this exact weighting isn't specified further than
  "distance + price" in `docs/ARCHITECTURE.md`, so a reasonable documented
  choice is fine.

## Haint strategy

Listing metadata shape for this vertical:
```ts
{ slotStart: string; slotEnd: string; capacity: number; bookedCount: number; rating: number }
```

- **Eligible**: the request's `[windowStart, windowEnd]` matches the
  listing's `[slotStart, slotEnd]` (exact match — a Haint request books a
  specific slot, not a range within it), AND `bookedCount < capacity`.
- **Rank**: primarily by `distanceKm` ascending, using `rating` (higher is
  better) as the tiebreaker. Same note as above re: exact formula.
- **Out of scope**: do NOT implement the capacity decrement/booking
  confirmation here — this strategy only *reads* `bookedCount` vs.
  `capacity` to decide eligibility. The atomic check-and-decrement when a
  booking is actually confirmed (`.kiro/steering/haint-slot-capacity.md`)
  happens in `backend/api`, which doesn't exist yet and is out of scope for
  this spec.

## Tests

- `hallowear.strategy.test.ts` / `haint.strategy.test.ts`: unit tests
  covering eligible/ineligible cases for each rule above (date window,
  category match, slot match, capacity exhausted) and a ranking test with
  at least 3 candidates to confirm sort order.
- The property test described above covers the runner itself.

## Out of scope

No NestJS/HTTP layer, no actual DB queries (the runner takes an
already-fetched `listingPool` array — fetching listings from Postgres
within a radius is a `backend/api` concern, built later, not this
package).
