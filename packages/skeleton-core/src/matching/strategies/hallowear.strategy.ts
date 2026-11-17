import {
  MatchingListing,
  MatchingRequest,
  MatchingStrategy,
  RankedCandidate,
} from "../matching.types";

/**
 * Expected shape of `listing.metadata` for the Hallowear vertical.
 * Validated at runtime in `isEligible` — unknown shapes are ineligible.
 */
interface HallowearListingMeta {
  category: string;
  availabilityStart: string; // ISO date string
  availabilityEnd: string;   // ISO date string
  pricePerDay: number;
}

function parseHallowearMeta(meta: Record<string, unknown>): HallowearListingMeta | null {
  const { category, availabilityStart, availabilityEnd, pricePerDay } = meta;
  if (
    typeof category !== "string" ||
    typeof availabilityStart !== "string" ||
    typeof availabilityEnd !== "string" ||
    typeof pricePerDay !== "number"
  ) {
    return null;
  }
  return { category, availabilityStart, availabilityEnd, pricePerDay };
}

/**
 * Hallowear eligibility:
 *   1. The request's [windowStart, windowEnd] falls entirely within
 *      [availabilityStart, availabilityEnd].
 *   2. request.metadata.category matches listing.metadata.category exactly.
 *
 * Ranking formula:
 *   score = distanceKm * 1000 + pricePerDay
 *   — distance is the primary sort (1 km difference outweighs any price),
 *     pricePerDay breaks ties within the same distance (cheaper first).
 *   Rank is assigned 1-based, lowest score = rank 1.
 */
export class HallowearStrategy implements MatchingStrategy {
  isEligible(
    request: MatchingRequest,
    listing: MatchingListing,
    _distanceKm: number
  ): boolean {
    const meta = parseHallowearMeta(listing.metadata);
    if (!meta) return false;

    const requestCategory =
      typeof request.metadata?.category === "string"
        ? request.metadata.category
        : null;
    if (!requestCategory) return false;

    if (requestCategory !== meta.category) return false;

    const availStart = new Date(meta.availabilityStart).getTime();
    const availEnd = new Date(meta.availabilityEnd).getTime();
    const winStart = request.windowStart.getTime();
    const winEnd = request.windowEnd.getTime();

    return winStart >= availStart && winEnd <= availEnd;
  }

  rank(
    _request: MatchingRequest,
    eligible: Array<{ listing: MatchingListing; distanceKm: number }>
  ): RankedCandidate[] {
    const scored = eligible.map(({ listing, distanceKm: d }) => {
      const meta = parseHallowearMeta(listing.metadata);
      const price = meta?.pricePerDay ?? 0;
      // score = distance (km) * 1000 + pricePerDay
      // A 1 km difference always beats a price difference (prices realistically < 1000)
      const score = d * 1000 + price;
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
