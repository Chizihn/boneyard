import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  prisma,
  Vertical,
  isProviderApproved,
  runMatching,
  HallowearStrategy,
  HaintStrategy,
} from "@boneyard/skeleton-core";
import type { ExpandingSearchConfig, MatchingListing, MatchingRequest, MatchingStrategy } from "@boneyard/skeleton-core";
import { CreateListingDto } from "./dto/create-listing.dto";
import { UpdateListingDto } from "./dto/update-listing.dto";
import { SearchListingsDto } from "./dto/search-listings.dto";

// Reasonable defaults for a hackathon-scale demo; not currently exposed as
// request params since neither app's screens expose radius tuning to users.
const DEFAULT_SEARCH_CONFIG: ExpandingSearchConfig = {
  startRadiusKm: 5,
  radiusStepKm: 15,
  maxRadiusKm: 150,
  maxCandidates: 20,
};

const STRATEGIES: Record<Vertical, MatchingStrategy> = {
  [Vertical.hallowear]: new HallowearStrategy(),
  [Vertical.haint]: new HaintStrategy(),
};

@Injectable()
export class ListingsService {
  create(providerId: string, dto: CreateListingDto) {
    return prisma.listing.create({
      data: {
        providerId,
        vertical: dto.vertical as Vertical,
        title: dto.title,
        metadata: dto.metadata as any,
        location: { lat: dto.location.lat, lng: dto.location.lng },
        active: true,
      },
    });
  }

  findMine(providerId: string) {
    return prisma.listing.findMany({
      where: { providerId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string) {
    const listing = await prisma.listing.findUnique({ where: { id } });
    if (!listing) {
      throw new NotFoundException(`Listing "${id}" not found.`);
    }
    return listing;
  }

  async update(id: string, providerId: string, dto: UpdateListingDto) {
    const listing = await this.findById(id);
    if (listing.providerId !== providerId) {
      throw new ForbiddenException("You can only edit your own listings.");
    }

    return prisma.listing.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.metadata !== undefined ? { metadata: dto.metadata as any } : {}),
        ...(dto.location !== undefined
          ? { location: { lat: dto.location.lat, lng: dto.location.lng } }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  /**
   * Powers the browse screens — runs skeleton-core's matching engine over
   * the active listing pool for the vertical, returning ranked, eligible
   * candidates. Read-only: nothing is persisted here. MatchCandidate rows
   * are only written when a Request is actually created (RequestsService),
   * which is what gives the "why this provider" audit trail a requestId to
   * attach to.
   */
  async search(dto: SearchListingsDto) {
    const vertical = dto.vertical as Vertical;
    const strategy = STRATEGIES[vertical];

    // select (not include) the provider relation, and only the two fields
    // isProviderApproved actually needs — the full User row (password hash
    // included) must never end up in a response this endpoint returns.
    const listings = await prisma.listing.findMany({
      where: { vertical, active: true },
      include: {
        provider: { select: { role: true, providerApprovedAt: true } },
      },
    });

    const pool: MatchingListing[] = listings.map((listing) => ({
      listingId: listing.id,
      providerId: listing.providerId,
      vertical: listing.vertical,
      location: listing.location as { lat: number; lng: number },
      active: listing.active,
      providerApproved: isProviderApproved(listing.provider),
      metadata: listing.metadata as Record<string, unknown>,
    }));

    const request: MatchingRequest = {
      vertical,
      windowStart: new Date(dto.windowStart),
      windowEnd: new Date(dto.windowEnd),
      location: { lat: dto.lat, lng: dto.lng },
      metadata: dto.category ? { category: dto.category } : undefined,
    };

    const result = runMatching(request, pool, strategy, DEFAULT_SEARCH_CONFIG);

    // Strip the provider sub-select before returning for display — it was
    // only ever needed internally for isProviderApproved, never for the
    // requester's view of the listing.
    const byId = new Map(
      listings.map(({ provider, ...listing }) => [listing.id, listing])
    );

    return {
      ...result,
      candidates: result.candidates.map((c) => ({ ...c, listing: byId.get(c.listingId) })),
    };
  }
}
