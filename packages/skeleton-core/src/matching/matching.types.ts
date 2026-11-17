import { Vertical } from "@prisma/client";

export { Vertical };

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export interface GeoPoint {
  lat: number;
  lng: number;
}

// ---------------------------------------------------------------------------
// Runner I/O types
// ---------------------------------------------------------------------------

/**
 * Flattened listing shape the runner and strategies operate on.
 * `providerApproved` is computed by the backend layer via
 * `isProviderApproved(provider)` before the listing enters the pool — the
 * runner enforces the gate here, strategies never need to re-check it.
 */
export interface MatchingListing {
  listingId: string;
  providerId: string;
  vertical: Vertical;
  location: GeoPoint;
  active: boolean;
  providerApproved: boolean;
  metadata: Record<string, unknown>;
}

export interface MatchingRequest {
  vertical: Vertical;
  windowStart: Date;
  windowEnd: Date;
  location: GeoPoint;
  metadata?: Record<string, unknown>;
}

export interface RankedCandidate {
  listingId: string;
  providerId: string;
  distanceKm: number;
  rank: number; // 1 = best
}

// ---------------------------------------------------------------------------
// Strategy interface
// ---------------------------------------------------------------------------

export interface MatchingStrategy {
  /**
   * Returns true when this listing is eligible for the given request.
   * The runner guarantees this is only called on listings that are active,
   * within the current search radius, and from an approved provider.
   */
  isEligible(
    request: MatchingRequest,
    listing: MatchingListing,
    distanceKm: number
  ): boolean;

  /**
   * Ranks an already-filtered eligible set.  Must return one entry per
   * input element, with `rank` values starting at 1.
   */
  rank(
    request: MatchingRequest,
    eligible: Array<{ listing: MatchingListing; distanceKm: number }>
  ): RankedCandidate[];
}

// ---------------------------------------------------------------------------
// Expanding-search runner config and result
// ---------------------------------------------------------------------------

export interface ExpandingSearchConfig {
  startRadiusKm: number;
  radiusStepKm: number;
  maxRadiusKm: number;
  maxCandidates: number;
}

export interface MatchingResult {
  candidates: RankedCandidate[];
  radiusUsedKm: number;
  /** true = reached maxRadiusKm with zero eligible candidates */
  exhausted: boolean;
  totalEligibleFound: number;
  /** Eligible candidates beyond maxCandidates — explicitly counted, never silently discarded */
  droppedForCapacity: number;
}
