/**
 * Property-based concurrency test for the dispute atomic-claim guard.
 *
 * PBT target from docs/KIRO-PLAN.md:
 *   "Under concurrent claim attempts on the same dispute, exactly one succeeds."
 *
 * Approach (per spec guidance):
 *   The atomic guard logic is extracted as the pure function `tryClaim`
 *   in dispute.service.ts. We build an in-memory fake that mimics the
 *   Postgres guarded-update semantics: a single shared row, and a fake
 *   `updateMany` that only succeeds (count=1) if the WHERE condition would
 *   match current row state, applied atomically within the fake (no
 *   interleaving inside a single fake call — the guarantee a real
 *   `UPDATE ... WHERE status = 'open' AND claimedByAdminId IS NULL` gives).
 *
 *   fast-check generates 2–20 concurrent claim attempts with distinct
 *   adminIds. Promise.all races them. We assert:
 *     - Exactly one resolves (the one whose updateMany call atomically won).
 *     - All others throw DisputeAlreadyClaimedError.
 *     - The winner's adminId is set on the row.
 */

import { describe, it } from "vitest";
import * as fc from "fast-check";
import { expect } from "vitest";
import { DisputeStatus } from "@prisma/client";
import { DisputeService, tryClaim } from "./dispute.service";
import { DisputeAlreadyClaimedError } from "./payments.types";

// ---------------------------------------------------------------------------
// In-memory fake Prisma that enforces the atomic WHERE guard
// ---------------------------------------------------------------------------

type FakeDisputeRow = {
  id: string;
  requestId: string;
  raisedBy: string;
  status: DisputeStatus;
  resolution: string | null;
  claimedByAdminId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function makeFakeRow(id = "dispute-1"): FakeDisputeRow {
  return {
    id,
    requestId: "req-1",
    raisedBy: "user-1",
    status: DisputeStatus.open,
    resolution: null,
    claimedByAdminId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Creates a fake Prisma client whose `dispute.updateMany` enforces the same
 * atomic WHERE semantics as a real Postgres conditional update.
 *
 * "Atomic" here means: within a single call to `updateMany`, the row is
 * read and written without interleaving. Because JavaScript's event loop
 * is single-threaded and we don't await anything inside the synchronous
 * guard check, concurrent `Promise.all` calls will each see the row state
 * *as it was when their updateMany ran* — the first one wins, the rest
 * see `claimedByAdminId !== null` and return count=0.
 */
function makeFakePrismaForConcurrency(row: FakeDisputeRow) {
  return {
    dispute: {
      updateMany: (args: {
        where: { id: string; status: DisputeStatus; claimedByAdminId: null };
        data: { claimedByAdminId: string };
      }) => {
        // Synchronously check-and-write — mirrors the atomic WHERE guarantee
        const { claimed } = tryClaim(row, args.data.claimedByAdminId);
        if (claimed) {
          row.claimedByAdminId = args.data.claimedByAdminId;
          row.status = DisputeStatus.open; // status stays open until resolved
          return Promise.resolve({ count: 1 });
        }
        return Promise.resolve({ count: 0 });
      },
      findUnique: (_args: unknown) => Promise.resolve({ ...row }),
      update: (_args: unknown) => Promise.resolve({ ...row }),
    },
    payment: {
      findUnique: (_args: unknown) => Promise.resolve(null),
      update: (_args: unknown) => Promise.resolve(null),
    },
  };
}

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe("DisputeService.claimDispute — concurrency property", () => {
  it("exactly one claim succeeds when N admins race on the same dispute", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 20 }).chain((n) =>
          fc.tuple(
            fc.constant(n),
            fc.uniqueArray(fc.string({ minLength: 1, maxLength: 10 }), {
              minLength: n,
              maxLength: n,
            })
          )
        ),
        async ([n, adminIds]) => {
          const row = makeFakeRow();
          const fakePrisma = makeFakePrismaForConcurrency(row);
          const service = new DisputeService(fakePrisma as any);

          const attempts = adminIds.map((adminId) =>
            service
              .claimDispute("dispute-1", adminId)
              .then((d) => ({ ok: true as const, adminId, dispute: d }))
              .catch((err) => ({ ok: false as const, adminId, err }))
          );

          const results = await Promise.all(attempts);

          const successes = results.filter((r) => r.ok);
          const failures = results.filter((r) => !r.ok);

          // Exactly one claim must succeed
          if (successes.length !== 1) return false;
          // All others must throw DisputeAlreadyClaimedError
          if (failures.length !== n - 1) return false;
          for (const f of failures) {
            if (!f.ok && !(f.err instanceof DisputeAlreadyClaimedError)) {
              return false;
            }
          }
          // The winning admin's id must be on the row
          const winner = successes[0];
          if (winner.ok && row.claimedByAdminId !== winner.adminId) return false;

          return true;
        }
      ),
      { numRuns: 300 }
    );
  });
});
