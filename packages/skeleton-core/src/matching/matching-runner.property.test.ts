/**
 * Property-based tests for the generic matching runner.
 * Uses fast-check to generate arbitrary listing pools and configs, then
 * asserts three invariants that must hold for every possible input:
 *
 *   P1 — Radius hard limit: no returned candidate has distanceKm > maxRadiusKm.
 *   P2 — Full accounting: candidates.length + droppedForCapacity === totalEligibleFound.
 *   P3 — Approval gate: no candidate from an unapproved provider appears in results.
 *
 * This is one of the five PBT targets in docs/KIRO-PLAN.md.
 */

import { describe, it } from "vitest";
import * as fc from "fast-check";
import { Vertical } from "@prisma/client";
import { runMatching } from "./matching-runner";
import {
  ExpandingSearchConfig,
  MatchingListing,
  MatchingRequest,
  MatchingStrategy,
  RankedCandidate,
} from "./matching.types";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const arbGeoPoint = fc.record({
  lat: fc.double({ min: -90, max: 90, noNaN: true }),
  lng: fc.double({ min: -180, max: 180, noNaN: true }),
});

const arbListing = (id: number): fc.Arbitrary<MatchingListing> =>
  fc.record({
    listingId: fc.constant(`listing-${id}`),
    providerId: fc.constant(`provider-${id}`),
    vertical: fc.constantFrom(Vertical.hallowear, Vertical.haint),
    location: arbGeoPoint,
    active: fc.boolean(),
    providerApproved: fc.boolean(),
    metadata: fc.constant({}),
  });

const arbListingPool = fc
  .integer({ min: 0, max: 30 })
  .chain((n) =>
    n === 0
      ? fc.constant([] as MatchingListing[])
      : fc.tuple(...Array.from({ length: n }, (_, i) => arbListing(i)))
        .map((arr) => arr as MatchingListing[])
  );

const arbConfig: fc.Arbitrary<ExpandingSearchConfig> = fc
  .record({
    startRadiusKm: fc.double({ min: 1, max: 50, noNaN: true }),
    radiusStepKm: fc.double({ min: 1, max: 50, noNaN: true }),
    maxRadiusKm: fc.double({ min: 10, max: 500, noNaN: true }),
    maxCandidates: fc.integer({ min: 1, max: 20 }),
  })
  .map((c) => ({
    ...c,
    // Ensure startRadius <= maxRadius so the config is coherent
    startRadiusKm: Math.min(c.startRadiusKm, c.maxRadiusKm),
  }));

const arbRequest: fc.Arbitrary<MatchingRequest> = fc.record({
  vertical: fc.constantFrom(Vertical.hallowear, Vertical.haint),
  windowStart: fc.date({ min: new Date("2026-01-01"), max: new Date("2027-01-01") }),
  windowEnd: fc.date({ min: new Date("2026-01-02"), max: new Date("2027-06-01") }),
  location: arbGeoPoint,
  metadata: fc.constant({}),
});

// ---------------------------------------------------------------------------
// A permissive "accept everything" strategy for runner-level property tests.
// This isolates the runner's invariants from strategy-level eligibility logic.
// ---------------------------------------------------------------------------

class AcceptAllStrategy implements MatchingStrategy {
  isEligible(): boolean {
    return true;
  }
  rank(
    _req: MatchingRequest,
    eligible: Array<{ listing: MatchingListing; distanceKm: number }>
  ): RankedCandidate[] {
    return eligible.map(({ listing, distanceKm }, i) => ({
      listingId: listing.listingId,
      providerId: listing.providerId,
      distanceKm,
      rank: i + 1,
    }));
  }
}

const acceptAll = new AcceptAllStrategy();

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("runMatching — property tests", () => {
  it("P1: no returned candidate has distanceKm > maxRadiusKm", () => {
    fc.assert(
      fc.property(arbRequest, arbListingPool, arbConfig, (request, pool, config) => {
        const result = runMatching(request, pool, acceptAll, config);
        for (const candidate of result.candidates) {
          if (candidate.distanceKm > config.maxRadiusKm) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 500 }
    );
  });

  it("P2: candidates.length + droppedForCapacity === totalEligibleFound", () => {
    fc.assert(
      fc.property(arbRequest, arbListingPool, arbConfig, (request, pool, config) => {
        const result = runMatching(request, pool, acceptAll, config);
        return (
          result.candidates.length + result.droppedForCapacity ===
          result.totalEligibleFound
        );
      }),
      { numRuns: 500 }
    );
  });

  it("P3: no candidate from an unapproved provider (providerApproved === false) appears in results", () => {
    fc.assert(
      fc.property(arbRequest, arbListingPool, arbConfig, (request, pool, config) => {
        const unapprovedIds = new Set(
          pool
            .filter((l) => !l.providerApproved)
            .map((l) => l.providerId)
        );
        const result = runMatching(request, pool, acceptAll, config);
        for (const candidate of result.candidates) {
          if (unapprovedIds.has(candidate.providerId)) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 500 }
    );
  });

  it("P3-variant: no candidate from an inactive listing appears in results", () => {
    fc.assert(
      fc.property(arbRequest, arbListingPool, arbConfig, (request, pool, config) => {
        const inactiveIds = new Set(
          pool.filter((l) => !l.active).map((l) => l.listingId)
        );
        const result = runMatching(request, pool, acceptAll, config);
        for (const candidate of result.candidates) {
          if (inactiveIds.has(candidate.listingId)) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 500 }
    );
  });

  it("P3-variant-2: no candidate has a different vertical than the request", () => {
    // acceptAll doesn't check vertical itself — this must be enforced by the
    // runner, so a caller that accidentally mixes verticals in the pool
    // fails safely instead of relying on a strategy's metadata shape to
    // incidentally reject the mismatch.
    fc.assert(
      fc.property(arbRequest, arbListingPool, arbConfig, (request, pool, config) => {
        const wrongVerticalIds = new Set(
          pool.filter((l) => l.vertical !== request.vertical).map((l) => l.listingId)
        );
        const result = runMatching(request, pool, acceptAll, config);
        for (const candidate of result.candidates) {
          if (wrongVerticalIds.has(candidate.listingId)) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 500 }
    );
  });

  it("exhausted flag is set when pool is empty", () => {
    fc.assert(
      fc.property(arbRequest, arbConfig, (request, config) => {
        const result = runMatching(request, [], acceptAll, config);
        return (
          result.exhausted === true &&
          result.candidates.length === 0 &&
          result.totalEligibleFound === 0
        );
      }),
      { numRuns: 200 }
    );
  });

  it("candidates.length never exceeds maxCandidates", () => {
    fc.assert(
      fc.property(arbRequest, arbListingPool, arbConfig, (request, pool, config) => {
        const result = runMatching(request, pool, acceptAll, config);
        return result.candidates.length <= config.maxCandidates;
      }),
      { numRuns: 500 }
    );
  });
});
