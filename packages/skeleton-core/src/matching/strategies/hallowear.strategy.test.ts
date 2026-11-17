import { describe, it, expect } from "vitest";
import { Vertical } from "@prisma/client";
import { HallowearStrategy } from "./hallowear.strategy";
import { MatchingListing, MatchingRequest } from "../matching.types";

const strategy = new HallowearStrategy();

function makeListing(overrides: Partial<MatchingListing> = {}): MatchingListing {
  return {
    listingId: "listing-1",
    providerId: "provider-1",
    vertical: Vertical.hallowear,
    location: { lat: 0, lng: 0 },
    active: true,
    providerApproved: true,
    metadata: {
      category: "costume",
      availabilityStart: "2026-10-01T00:00:00.000Z",
      availabilityEnd: "2026-10-31T23:59:59.000Z",
      pricePerDay: 50,
    },
    ...overrides,
  };
}

function makeRequest(overrides: Partial<MatchingRequest> = {}): MatchingRequest {
  return {
    vertical: Vertical.hallowear,
    windowStart: new Date("2026-10-10T00:00:00.000Z"),
    windowEnd: new Date("2026-10-12T00:00:00.000Z"),
    location: { lat: 0, lng: 0 },
    metadata: { category: "costume" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isEligible
// ---------------------------------------------------------------------------

describe("HallowearStrategy.isEligible", () => {
  it("returns true when window is within availability and category matches", () => {
    expect(strategy.isEligible(makeRequest(), makeListing(), 0)).toBe(true);
  });

  it("returns false when request window starts before availability", () => {
    const req = makeRequest({ windowStart: new Date("2026-09-30T00:00:00.000Z") });
    expect(strategy.isEligible(req, makeListing(), 0)).toBe(false);
  });

  it("returns false when request window ends after availability", () => {
    const req = makeRequest({ windowEnd: new Date("2026-11-01T00:00:00.000Z") });
    expect(strategy.isEligible(req, makeListing(), 0)).toBe(false);
  });

  it("returns false when window is entirely outside availability", () => {
    const req = makeRequest({
      windowStart: new Date("2026-11-01T00:00:00.000Z"),
      windowEnd: new Date("2026-11-03T00:00:00.000Z"),
    });
    expect(strategy.isEligible(req, makeListing(), 0)).toBe(false);
  });

  it("returns true when request window exactly spans full availability", () => {
    const req = makeRequest({
      windowStart: new Date("2026-10-01T00:00:00.000Z"),
      windowEnd: new Date("2026-10-31T23:59:59.000Z"),
    });
    expect(strategy.isEligible(req, makeListing(), 0)).toBe(true);
  });

  it("returns false when category does not match", () => {
    const req = makeRequest({ metadata: { category: "prop" } });
    expect(strategy.isEligible(req, makeListing(), 0)).toBe(false);
  });

  it("returns false when request has no category metadata", () => {
    const req = makeRequest({ metadata: {} });
    expect(strategy.isEligible(req, makeListing(), 0)).toBe(false);
  });

  it("returns false when listing metadata is malformed", () => {
    const listing = makeListing({ metadata: { broken: true } });
    expect(strategy.isEligible(makeRequest(), listing, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// rank
// ---------------------------------------------------------------------------

describe("HallowearStrategy.rank", () => {
  it("ranks closer listing higher (rank 1) over distant listing", () => {
    const near = makeListing({ listingId: "near", metadata: { category: "costume", availabilityStart: "2026-10-01T00:00:00.000Z", availabilityEnd: "2026-10-31T00:00:00.000Z", pricePerDay: 100 } });
    const far = makeListing({ listingId: "far", metadata: { category: "costume", availabilityStart: "2026-10-01T00:00:00.000Z", availabilityEnd: "2026-10-31T00:00:00.000Z", pricePerDay: 10 } });

    const result = strategy.rank(makeRequest(), [
      { listing: near, distanceKm: 1 },
      { listing: far, distanceKm: 10 },
    ]);

    const r = Object.fromEntries(result.map((c) => [c.listingId, c.rank]));
    expect(r["near"]).toBe(1);
    expect(r["far"]).toBe(2);
  });

  it("uses price as tiebreaker when distance is equal — cheaper wins", () => {
    const cheap = makeListing({ listingId: "cheap", metadata: { category: "costume", availabilityStart: "2026-10-01T00:00:00.000Z", availabilityEnd: "2026-10-31T00:00:00.000Z", pricePerDay: 20 } });
    const pricey = makeListing({ listingId: "pricey", metadata: { category: "costume", availabilityStart: "2026-10-01T00:00:00.000Z", availabilityEnd: "2026-10-31T00:00:00.000Z", pricePerDay: 80 } });

    const result = strategy.rank(makeRequest(), [
      { listing: pricey, distanceKm: 5 },
      { listing: cheap, distanceKm: 5 },
    ]);

    const r = Object.fromEntries(result.map((c) => [c.listingId, c.rank]));
    expect(r["cheap"]).toBe(1);
    expect(r["pricey"]).toBe(2);
  });

  it("ranks 3+ candidates in correct order: near-cheap > near-pricey > far-cheap", () => {
    const nearCheap = makeListing({ listingId: "near-cheap", metadata: { category: "costume", availabilityStart: "2026-10-01T00:00:00.000Z", availabilityEnd: "2026-10-31T00:00:00.000Z", pricePerDay: 10 } });
    const nearPricey = makeListing({ listingId: "near-pricey", metadata: { category: "costume", availabilityStart: "2026-10-01T00:00:00.000Z", availabilityEnd: "2026-10-31T00:00:00.000Z", pricePerDay: 90 } });
    const farCheap = makeListing({ listingId: "far-cheap", metadata: { category: "costume", availabilityStart: "2026-10-01T00:00:00.000Z", availabilityEnd: "2026-10-31T00:00:00.000Z", pricePerDay: 10 } });

    const result = strategy.rank(makeRequest(), [
      { listing: farCheap, distanceKm: 20 },
      { listing: nearPricey, distanceKm: 2 },
      { listing: nearCheap, distanceKm: 2 },
    ]);

    const r = Object.fromEntries(result.map((c) => [c.listingId, c.rank]));
    expect(r["near-cheap"]).toBe(1);
    expect(r["near-pricey"]).toBe(2);
    expect(r["far-cheap"]).toBe(3);
  });

  it("assigns consecutive rank values starting at 1", () => {
    const listings = ["a", "b", "c"].map((id) =>
      makeListing({ listingId: id })
    );
    const result = strategy.rank(
      makeRequest(),
      listings.map((l, i) => ({ listing: l, distanceKm: i + 1 }))
    );
    const ranks = result.map((r) => r.rank).sort((a, b) => a - b);
    expect(ranks).toEqual([1, 2, 3]);
  });
});
