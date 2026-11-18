/**
 * API response shapes for the Haint app.
 * Not imported from skeleton-core — Prisma brings native engine binaries
 * that break Metro bundling.
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

export interface HaintMeta {
  slotStart: string;       // ISO datetime — exact slot window start
  slotEnd: string;         // ISO datetime — exact slot window end
  capacity: number;
  bookedCount: number;
  rating: number;
  pricePerTicket: number;
}

export interface Listing {
  id: string;
  providerId: string;
  title: string;
  vertical: "haint";
  metadata: HaintMeta;
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
