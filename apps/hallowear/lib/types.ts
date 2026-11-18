/**
 * API response shapes for the Hallowear app.
 * These mirror what backend/api returns — not imported from skeleton-core
 * because that package brings Prisma/Node binaries that break Metro.
 */

export type RequestStatus =
  | "REQUESTED"
  | "MATCHED"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "DISPUTED"
  | "RESOLVED"
  | "CANCELLED";

export interface HallowearMeta {
  category: string;
  pricePerDay: number;
  availabilityStart: string; // ISO date string
  availabilityEnd: string;   // ISO date string
}

export interface Listing {
  id: string;
  providerId: string;
  title: string;
  vertical: "hallowear";
  metadata: HallowearMeta;
  location: { lat: number; lng: number };
  active: boolean;
  provider?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface BookingRequest {
  id: string;
  listingId: string;
  listing?: Listing;
  status: RequestStatus;
  windowStart: string;
  windowEnd: string;
  amount: string;
  payment?: {
    status: string;
    checkoutUrl?: string;
  };
  createdAt: string;
}
