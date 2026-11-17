import { distanceKm } from "./geo";
import {
  ExpandingSearchConfig,
  MatchingListing,
  MatchingRequest,
  MatchingResult,
  MatchingStrategy,
} from "./matching.types";

/**
 * Generic expanding-radius search runner.
 *
 * Provider-approval gate and vertical match are both enforced here — once,
 * for every vertical — by filtering out listings where `providerApproved`
 * is false or `vertical` doesn't match the request, before
 * `strategy.isEligible` is ever called. Strategies must not re-implement
 * either check. `MatchingListing.providerApproved` is set by the backend
 * layer via `isProviderApproved(provider)` before listings enter the pool.
 * The vertical check exists so a caller that accidentally passes a mixed
 * pool into the wrong strategy fails safely, rather than relying on each
 * strategy's metadata-shape parsing to incidentally reject it.
 *
 * The runner never relaxes `maxRadiusKm` as a fallback — if the expanding
 * search reaches that limit with zero eligible candidates, it returns an
 * empty result with `exhausted: true`.  This is a hard limit, not a
 * preference (see `.kiro/steering/matching-radius-bound.md`).
 */
export function runMatching(
  request: MatchingRequest,
  listingPool: MatchingListing[],
  strategy: MatchingStrategy,
  config: ExpandingSearchConfig
): MatchingResult {
  const { startRadiusKm, radiusStepKm, maxRadiusKm, maxCandidates } = config;

  // Pre-compute distances once — they don't change between radius waves.
  const withDistance = listingPool.map((listing) => ({
    listing,
    distanceKm: distanceKm(request.location, listing.location),
  }));

  let currentRadius = Math.min(startRadiusKm, maxRadiusKm);

  while (true) {
    // Step 3: within radius, active, provider-approved, and same vertical
    // as the request. `listing.providerApproved` was computed by the caller
    // via `isProviderApproved(provider)` before the listing entered the pool.
    const inRadius = withDistance.filter(
      ({ listing, distanceKm: d }) =>
        d <= currentRadius &&
        listing.active &&
        listing.providerApproved === true &&
        listing.vertical === request.vertical
    );

    // Step 4: strategy eligibility check.
    const eligible = inRadius.filter(({ listing, distanceKm: d }) =>
      strategy.isEligible(request, listing, d)
    );

    if (eligible.length > 0) {
      // Step 5: rank, sort, cap at maxCandidates.
      const ranked = strategy.rank(request, eligible);
      ranked.sort((a, b) => a.rank - b.rank);

      const totalEligibleFound = ranked.length;
      const taken = ranked.slice(0, maxCandidates);
      const droppedForCapacity = totalEligibleFound - taken.length;

      return {
        candidates: taken,
        radiusUsedKm: currentRadius,
        exhausted: false,
        totalEligibleFound,
        droppedForCapacity,
      };
    }

    // Step 6: exhausted at the hard radius limit.
    if (currentRadius >= maxRadiusKm) {
      return {
        candidates: [],
        radiusUsedKm: currentRadius,
        exhausted: true,
        totalEligibleFound: 0,
        droppedForCapacity: 0,
      };
    }

    // Step 7: expand radius, capped at maxRadiusKm.
    currentRadius = Math.min(currentRadius + radiusStepKm, maxRadiusKm);
  }
}
