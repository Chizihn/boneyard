/**
 * Property-based concurrency test for refresh token rotation.
 *
 * This is the same shape of guarantee as DisputeService.claimDispute's own
 * concurrency property test (see payments/dispute.service.property.test.ts):
 * "under concurrent attempts against the same row, exactly one succeeds."
 * Here the row is a RefreshToken being rotated instead of a Dispute being
 * claimed, but the atomic-claim mechanics (and the reason a plain
 * read-then-write pair is unsafe) are identical.
 *
 * Approach: an in-memory fake Prisma client whose `refreshToken.updateMany`
 * enforces the same guarded-WHERE semantics a real
 * `UPDATE ... WHERE id = ? AND revokedAt IS NULL` gives you from Postgres —
 * the check-and-write happens synchronously within one call, with no
 * internal await, so concurrent `Promise.all` callers can never interleave
 * mid-check the way they could with separate read-then-write round trips.
 */
import { describe, it } from "vitest";
import { expect } from "vitest";
import * as fc from "fast-check";
import { Role } from "@prisma/client";
import { AuthService } from "./auth.service";
import { InvalidRefreshTokenError } from "./auth.types";

type FakeRefreshTokenRow = {
  id: string;
  userId: string;
  tokenHash: string;
  revokedAt: Date | null;
  expiresAt: Date;
};

const FAKE_USER = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: Role.requester,
  providerApprovedAt: null,
};

function makeFakePrisma(initialRow: FakeRefreshTokenRow) {
  const rows = new Map<string, FakeRefreshTokenRow>([[initialRow.id, { ...initialRow }]]);
  let nextId = 2;

  const api: any = {
    refreshToken: {
      findUnique: async ({ where }: { where: { tokenHash?: string; id?: string } }) => {
        const found = [...rows.values()].find(
          (r) => (where.tokenHash && r.tokenHash === where.tokenHash) || (where.id && r.id === where.id)
        );
        if (!found) return null;
        return { ...found, user: FAKE_USER };
      },
      // Mirrors a real guarded `UPDATE ... WHERE id = ? AND revokedAt IS NULL`:
      // the check-and-write below is one synchronous block with no internal
      // await, so it can never interleave with another concurrent call.
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; revokedAt: null };
        data: { revokedAt: Date };
      }) => {
        const found = rows.get(where.id);
        if (!found) return { count: 0 };
        if (found.revokedAt !== null) return { count: 0 }; // already claimed
        found.revokedAt = data.revokedAt;
        return { count: 1 };
      },
      // Unconditional, unguarded update — kept only to sanity-check that
      // this property test actually fails if AuthService regresses to
      // this (the pre-fix) implementation. Not used by the real fixed code.
      update: async ({ where, data }: { where: { id: string }; data: { revokedAt: Date } }) => {
        const found = rows.get(where.id);
        if (!found) throw new Error("not found");
        found.revokedAt = data.revokedAt;
        return found;
      },
      create: async ({
        data,
      }: {
        data: { userId: string; tokenHash: string; expiresAt: Date };
      }) => {
        const id = `rt-${nextId++}`;
        const row: FakeRefreshTokenRow = {
          id,
          userId: data.userId,
          tokenHash: data.tokenHash,
          revokedAt: null,
          expiresAt: data.expiresAt,
        };
        rows.set(id, row);
        return row;
      },
    },
    $transaction: async (fn: (tx: typeof api) => Promise<unknown>) => fn(api),
  };

  return { api, rows };
}

describe("AuthService.refreshTokens — concurrency property", () => {
  it("exactly one of N concurrent rotation attempts on the same token succeeds", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 20 }), async (n) => {
        // AuthService hashes the raw token before looking it up, so the
        // fake row must be seeded with that same hash BEFORE it's handed
        // to makeFakePrisma — that function copies the row into its
        // internal Map at call time, so mutating the row afterward
        // wouldn't reach the copy.
        const rawRefreshToken = "raw-refresh-token-under-test";
        const crypto = await import("crypto");
        const tokenHash = crypto.createHash("sha256").update(rawRefreshToken).digest("hex");

        const now = new Date();
        const row: FakeRefreshTokenRow = {
          id: "rt-1",
          userId: FAKE_USER.id,
          tokenHash,
          revokedAt: null,
          expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        };
        const { api } = makeFakePrisma(row);
        const service = new AuthService(api as any, "test-jwt-secret");

        const attempts = Array.from({ length: n }, () =>
          service
            .refreshTokens(rawRefreshToken)
            .then((r) => ({ ok: true as const, result: r }))
            .catch((err) => ({ ok: false as const, err }))
        );

        const results = await Promise.all(attempts);
        const successes = results.filter((r) => r.ok);
        const failures = results.filter((r) => !r.ok);

        if (successes.length !== 1) return false;
        if (failures.length !== n - 1) return false;
        for (const f of failures) {
          if (!f.ok && !(f.err instanceof InvalidRefreshTokenError)) return false;
        }
        return true;
      }),
      { numRuns: 200 }
    );
  });
});
