import { describe, it, expect } from "vitest";
import { Vertical } from "@prisma/client";
import { HaintStrategy } from "./haint.strategy";
import { MatchingListing, MatchingRequest } from "../matching.types";

const strategy = new HaintStrategy();

const SLOT_START = "2026-10-15T14:00:00.000Z";
const SLOT_END = "2026-10-15T17:00:00.000Z";

function makeListing(overrides: Partial<MatchingListing> = {}): MatchingListing {
  return {
    listingId: "listing-1",
    providerId: "provider-1",
    vertical: Vertical.haint,
    location: { lat: 0, lng: 0 },
    active: true,
    providerApproved: true,
    metadata: {
      slotStart: SLOT_START,
      slotEnd: SLOT_END,
      capacity: 10,
      bookedCount: 5,
      rating: 4.5,
    },
    ...overrides,
  };
}

function makeRequest(overrides: Partial<MatchingRequest> = {}): MatchingRequest {
  return {
    vertical: Vertical.haint,
    windowStart: new Date(SLOT_START),
    windowEnd: new Date(SLOT_END),
    location: { lat: 0, lng: 0 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isEligible
// ---------------------------------------------------------------------------

describe("HaintStrategy.isEligible", () => {
  it("returns true when window matches slot exactly and capacity available", () => {
    expect(strategy.isEligible(makeRequest(), makeListing(), 0)).toBe(true);
  });

  it("returns false when window start does not match slot start", () => {
    const req = makeRequest({ windowStart: new Date("2026-10-15T13:00:00.000Z") });
    expect(strategy.isEligible(req, makeListing(), 0)).toBe(false);
  });

  it("returns false when window end does not match slot end", () => {
    const req = makeRequest({ windowEnd: new Date("2026-10-15T18:00:00.000Z") });
    expect(strategy.isEligible(req, makeListing(), 0)).toBe(false);
  });

  it("returns false when request window is a subset of the slot (not an exact match)", () => {
    const req = makeRequest({
      windowStart: new Date("2026-10-15T14:30:00.000Z"),
      windowEnd: new Date("2026-10-15T16:00:00.000Z"),
    });
    expect(strategy.isEligible(req, makeListing(), 0)).toBe(false);
  });

  it("returns false when bookedCount equals capacity", () => {
    const listing = makeListing({
      metadata: { slotStart: SLOT_START, slotEnd: SLOT_END, capacity: 5, bookedCount: 5, rating: 4 },
    });
    expect(strategy.isEligible(makeRequest(), listing, 0)).toBe(false);
  });

  it("returns false when bookedCount exceeds capacity", () => {
    const listing = makeListing({
      metadata: { slotStart: SLOT_START, slotEnd: SLOT_END, capacity: 5, bookedCount: 7, rating: 4 },
    });
    expect(strategy.isEligible(makeRequest(), listing, 0)).toBe(false);
  });

  it("returns true when bookedCount is one below capacity", () => {
    const listing = makeListing({
      metadata: { slotStart: SLOT_START, slotEnd: SLOT_END, capacity: 5, bookedCount: 4, rating: 4 },
    });
    expect(strategy.isEligible(makeRequest(), listing, 0)).toBe(true);
  });

  it("returns false when listing metadata is malformed", () => {
    const listing = makeListing({ metadata: { broken: true } });
    expect(strategy.isEligible(makeRequest(), listing, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// rank
// ---------------------------------------------------------------------------

describe("HaintStrategy.rank", () => {
  it("ranks closer listing higher (rank 1) regardless of rating", () => {
    const near = makeListing({ listingId: "near", metadata: { slotStart: SLOT_START, slotEnd: SLOT_END, capacity: 10, bookedCount: 0, rating: 2 } });
    const far = makeListing({ listingId: "far", metadata: { slotStart: SLOT_START, slotEnd: SLOT_END, capacity: 10, bookedCount: 0, rating: 5 } });

    const result = strategy.rank(makeRequest(), [
      { listing: near, distanceKm: 1 },
      { listing: far, distanceKm: 10 },
    ]);

    const r = Object.fromEntries(result.map((c) => [c.listingId, c.rank]));
    expect(r["near"]).toBe(1);
    expect(r["far"]).toBe(2);
  });

  it("uses rating as tiebreaker when distance is equal — higher rating wins", () => {
    const highRated = makeListing({ listingId: "high", metadata: { slotStart: SLOT_START, slotEnd: SLOT_END, capacity: 10, bookedCount: 0, rating: 4.8 } });
    const lowRated = makeListing({ listingId: "low", metadata: { slotStart: SLOT_START, slotEnd: SLOT_END, capacity: 10, bookedCount: 0, rating: 2.1 } });

    const result = strategy.rank(makeRequest(), [
      { listing: lowRated, distanceKm: 5 },
      { listing: highRated, distanceKm: 5 },
    ]);

    const r = Object.fromEntries(result.map((c) => [c.listingId, c.rank]));
    expect(r["high"]).toBe(1);
    expect(r["low"]).toBe(2);
  });

  it("ranks 3+ candidates: near-highrated > near-lowrated > far-highrated", () => {
    const nearHigh = makeListing({ listingId: "near-high", metadata: { slotStart: SLOT_START, slotEnd: SLOT_END, capacity: 10, bookedCount: 0, rating: 5.0 } });
    const nearLow = makeListing({ listingId: "near-low", metadata: { slotStart: SLOT_START, slotEnd: SLOT_END, capacity: 10, bookedCount: 0, rating: 1.0 } });
    const farHigh = makeListing({ listingId: "far-high", metadata: { slotStart: SLOT_START, slotEnd: SLOT_END, capacity: 10, bookedCount: 0, rating: 5.0 } });

    const result = strategy.rank(makeRequest(), [
      { listing: farHigh, distanceKm: 20 },
      { listing: nearLow, distanceKm: 2 },
      { listing: nearHigh, distanceKm: 2 },
    ]);

    const r = Object.fromEntries(result.map((c) => [c.listingId, c.rank]));
    expect(r["near-high"]).toBe(1);
    expect(r["near-low"]).toBe(2);
    expect(r["far-high"]).toBe(3);
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
