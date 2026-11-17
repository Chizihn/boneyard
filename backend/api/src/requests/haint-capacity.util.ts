import { prisma } from "@boneyard/skeleton-core";

/**
 * Releases one unit of Haint slot capacity previously claimed at request
 * creation (see RequestsService.create's atomic increment). Called when a
 * Haint request is cancelled, or when its checkout fails/expires before
 * payment ever completed — both mean the slot was never actually used.
 *
 * GREATEST(...,0) is defensive, not load-bearing: as long as this is only
 * ever called once per claimed increment, bookedCount can't go negative
 * anyway. It just means a bug that double-releases degrades to "wrong
 * count" instead of "negative count propagating into capacity checks."
 */
export async function releaseHaintCapacity(listingId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Listing"
    SET metadata = jsonb_set(
      metadata,
      '{bookedCount}',
      to_jsonb(GREATEST(((metadata->>'bookedCount')::int - 1), 0))
    )
    WHERE id = ${listingId}
      AND metadata ? 'bookedCount'
  `;
}
