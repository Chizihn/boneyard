import {
  MatchingListing,
  MatchingRequest,
  MatchingStrategy,
  RankedCandidate,
} from "../matching.types";

/**
 * Expected shape of `listing.metadata` for the Haint vertical.
 */
interface HaintListingMeta {
  slotStart: string;    // ISO datetime string
  slotEnd: string;      // ISO datetime string
  capacity: number;
  bookedCount: number;
  rating: number;
}

function parseHaintMeta(meta: Record<string, unknown>): HaintListingMeta | null {
  const { slotStart, slotEnd, capacity, bookedCount, rating } = meta;
  if (
    typeof slotStart !== "string" ||
    typeof slotEnd !== "string" ||
    typeof capacity !== "number" ||
    typeof bookedCount !== "number" ||
    typeof rating !== "number"
  ) {
    return null;
  }
  return { slotStart, slotEnd, capacity, bookedCount, rating };
}

/**
 * Haint eligibility:
 *   1. request.[windowStart, windowEnd] exactly matches listing.[slotStart, slotEnd].
 *   2. bookedCount < capacity (at least one seat/slot remaining).
 *
 * Note: this strategy only *reads* bookedCount vs. capacity.  The atomic
 * check-and-decrement when a booking is confirmed lives in backend/api —
 * see `.kiro/steering/haint-slot-capacity.md`.
 *
 * Ranking formula:
 *   score = distanceKm * 10 - rating
 *   — distance is the primary sort; rating (higher is better) breaks ties.
 *   Rank is assigned 1-based, lowest score = rank 1.
 */
export class HaintStrategy implements MatchingStrategy {
  isEligible(
    request: MatchingRequest,
    listing: MatchingListing,
    _distanceKm: number
  ): boolean {
    const meta = parseHaintMeta(listing.metadata);
    if (!meta) return false;

    const slotStart = new Date(meta.slotStart).getTime();
    const slotEnd = new Date(meta.slotEnd).getTime();
    const winStart = request.windowStart.getTime();
    const winEnd = request.windowEnd.getTime();

    // Exact slot match — a Haint request books a specific slot, not a range within it
    if (winStart !== slotStart || winEnd !== slotEnd) return false;

    // Slot must have remaining capacity
    if (meta.bookedCount >= meta.capacity) return false;

    return true;
  }

  rank(
    _request: MatchingRequest,
    eligible: Array<{ listing: MatchingListing; distanceKm: number }>
  ): RankedCandidate[] {
    const scored = eligible.map(({ listing, distanceKm: d }) => {
      const meta = parseHaintMeta(listing.metadata);
      const rating = meta?.rating ?? 0;
      // score = distanceKm * 10 - rating
      // 10x multiplier means a 1 km difference outweighs a perfect 10-point rating swing
      const score = d * 10 - rating;
      return { listing, distanceKm: d, score };
    });

    scored.sort((a, b) => a.score - b.score);

    return scored.map(({ listing, distanceKm: d }, i) => ({
      listingId: listing.listingId,
      providerId: listing.providerId,
      distanceKm: d,
      rank: i + 1,
    }));
  }
}
