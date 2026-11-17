import { describe, it, expect, vi, beforeEach } from "vitest";
import { Role } from "@prisma/client";
import { AuthService } from "./auth.service";
import {
  InvalidRoleError,
  DuplicateEmailError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  NotAProviderError,
  ProviderNotFoundError,
  isProviderApproved,
} from "./auth.types";

// ---------------------------------------------------------------------------
// Minimal Prisma mock — only the methods AuthService touches
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<{
  id: string;
  email: string;
  password: string;
  name: string;
  role: Role;
  providerApprovedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return {
    id: "user-1",
    email: "test@example.com",
    // bcrypt hash of "password123" — pre-computed so tests don't need to hash
    // We override this per test when we need a real match.
    password: "$2a$12$placeholder",
    name: "Test User",
    role: Role.requester,
    providerApprovedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePrismaMock() {
  return {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}

const JWT_SECRET = "test-secret";

// ---------------------------------------------------------------------------
// signup
// ---------------------------------------------------------------------------

describe("AuthService.signup", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: AuthService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AuthService(prisma as any, JWT_SECRET);
  });

  it("creates a requester account", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const created = makeUser({ role: Role.requester });
    prisma.user.create.mockResolvedValue(created);

    const result = await service.signup({
      email: "req@example.com",
      password: "pass",
      name: "Requester",
      role: "requester",
    });

    expect(result.role).toBe(Role.requester);
    expect(prisma.user.create).toHaveBeenCalledOnce();
    // Password stored as a hash, not plaintext
    const createArg = prisma.user.create.mock.calls[0][0];
    expect(createArg.data.password).not.toBe("pass");
    expect(createArg.data.password).toMatch(/^\$2[ab]\$/);
  });

  it("creates a provider account with providerApprovedAt = null", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const created = makeUser({ role: Role.provider, providerApprovedAt: null });
    prisma.user.create.mockResolvedValue(created);

    const result = await service.signup({
      email: "prov@example.com",
      password: "pass",
      name: "Provider",
      role: "provider",
    });

    expect(result.role).toBe(Role.provider);
    expect(result.providerApprovedAt).toBeNull();
    const createArg = prisma.user.create.mock.calls[0][0];
    expect(createArg.data.providerApprovedAt).toBeNull();
  });

  it("throws InvalidRoleError when role is 'admin'", async () => {
    await expect(
      service.signup({
        email: "admin@example.com",
        password: "pass",
        name: "Admin",
        role: "admin" as any, // bypass type to test runtime guard
      })
    ).rejects.toThrow(InvalidRoleError);
  });

  it("throws DuplicateEmailError when email is already taken", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser());

    await expect(
      service.signup({
        email: "test@example.com",
        password: "pass",
        name: "Dup",
        role: "requester",
      })
    ).rejects.toThrow(DuplicateEmailError);

    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

describe("AuthService.login", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: AuthService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AuthService(prisma as any, JWT_SECRET);
  });

  it("returns AuthUser and both tokens on valid credentials", async () => {
    // We need a real bcrypt hash to test the compare path
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("correct-pass", 12);
    prisma.user.findUnique.mockResolvedValue(
      makeUser({ role: Role.requester, password: hash })
    );
    prisma.refreshToken.create.mockResolvedValue({});

    const result = await service.login({
      email: "test@example.com",
      password: "correct-pass",
    });

    expect(result.user.role).toBe(Role.requester);
    // Access token is a JWT — 3 dot-separated segments
    expect(result.accessToken.split(".")).toHaveLength(3);
    // Refresh token is a 64-char hex string (32 bytes)
    expect(result.refreshToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stores a hash of the refresh token, not the raw value", async () => {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("pass", 12);
    prisma.user.findUnique.mockResolvedValue(makeUser({ password: hash }));
    prisma.refreshToken.create.mockResolvedValue({});

    const result = await service.login({ email: "test@example.com", password: "pass" });

    const createCall = prisma.refreshToken.create.mock.calls[0][0];
    // The stored tokenHash must not equal the raw refreshToken
    expect(createCall.data.tokenHash).not.toBe(result.refreshToken);
    // It should be a 64-char SHA-256 hex digest
    expect(createCall.data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("login result includes the user's role (client uses it to route)", async () => {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("pass", 12);
    prisma.user.findUnique.mockResolvedValue(
      makeUser({ role: Role.provider, password: hash })
    );
    prisma.refreshToken.create.mockResolvedValue({});

    const { user } = await service.login({ email: "prov@example.com", password: "pass" });
    expect(user.role).toBe(Role.provider);
  });

  it("throws InvalidCredentialsError on unknown email", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login({ email: "ghost@example.com", password: "pass" })
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("throws InvalidCredentialsError on wrong password", async () => {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("correct-pass", 12);
    prisma.user.findUnique.mockResolvedValue(makeUser({ password: hash }));

    await expect(
      service.login({ email: "test@example.com", password: "wrong-pass" })
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("wrong-password error message does not distinguish from unknown-email error", async () => {
    // Both throw InvalidCredentialsError with the same message — prevents email enumeration
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("correct", 12);

    prisma.user.findUnique.mockResolvedValue(null);
    let err1: InvalidCredentialsError | undefined;
    try { await service.login({ email: "ghost@x.com", password: "x" }); }
    catch (e) { err1 = e as InvalidCredentialsError; }

    prisma.user.findUnique.mockResolvedValue(makeUser({ password: hash }));
    let err2: InvalidCredentialsError | undefined;
    try { await service.login({ email: "test@example.com", password: "wrong" }); }
    catch (e) { err2 = e as InvalidCredentialsError; }

    expect(err1?.message).toBe(err2?.message);
  });
});

// ---------------------------------------------------------------------------
// refreshTokens
// ---------------------------------------------------------------------------

describe("AuthService.refreshTokens", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: AuthService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AuthService(prisma as any, JWT_SECRET);
  });

  function makeStoredToken(overrides: Partial<{
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
    user: ReturnType<typeof makeUser>;
  }> = {}) {
    return {
      id: "rt-1",
      userId: "user-1",
      tokenHash: "somehash",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
      revokedAt: null,
      createdAt: new Date(),
      user: makeUser(),
      ...overrides,
    };
  }

  it("returns a new token pair for a valid, unexpired, unrevoked token", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(makeStoredToken());
    let updateManyCall: any;
    // $transaction calls the callback with a tx object
    prisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const txMock = {
        refreshToken: {
          updateMany: vi.fn().mockImplementation((args: any) => {
            updateManyCall = args;
            return Promise.resolve({ count: 1 });
          }),
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return cb(txMock);
    });

    const result = await service.refreshTokens("some-raw-token");

    expect(result.accessToken.split(".")).toHaveLength(3);
    expect(result.refreshToken).toMatch(/^[0-9a-f]{64}$/);
    expect(result.user).toBeDefined();
    // The guard must target this exact row and require it to still be
    // unrevoked — this is what makes rotation safe under concurrency.
    expect(updateManyCall.where).toEqual({ id: "rt-1", revokedAt: null });
  });

  it("throws InvalidRefreshTokenError when the atomic claim loses the race " +
    "(updateMany affects 0 rows — another concurrent call won it first)", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(makeStoredToken());
    prisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const txMock = {
        refreshToken: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return cb(txMock);
    });

    await expect(service.refreshTokens("some-raw-token")).rejects.toThrow(
      InvalidRefreshTokenError
    );
  });

  it("throws InvalidRefreshTokenError when token is not found", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(service.refreshTokens("unknown-token")).rejects.toThrow(
      InvalidRefreshTokenError
    );
  });

  it("throws InvalidRefreshTokenError when token is already revoked (replay-after-rotation)", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(
      makeStoredToken({ revokedAt: new Date(Date.now() - 1000) })
    );

    await expect(service.refreshTokens("rotated-token")).rejects.toThrow(
      InvalidRefreshTokenError
    );
  });

  it("throws InvalidRefreshTokenError when token is expired", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(
      makeStoredToken({ expiresAt: new Date(Date.now() - 1000) })
    );

    await expect(service.refreshTokens("expired-token")).rejects.toThrow(
      InvalidRefreshTokenError
    );
  });
});

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------

describe("AuthService.logout", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: AuthService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AuthService(prisma as any, JWT_SECRET);
  });

  it("revokes a valid token so subsequent refreshTokens throws", async () => {
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    await service.logout("some-raw-token");

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledOnce();
    const call = prisma.refreshToken.updateMany.mock.calls[0][0];
    expect(call.where.revokedAt).toBeNull();
    expect(call.data.revokedAt).toBeInstanceOf(Date);
  });

  it("does not throw when token does not exist (idempotent)", async () => {
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.logout("nonexistent-token")).resolves.toBeUndefined();
  });

  it("does not throw when token is already revoked (idempotent)", async () => {
    // updateMany with revokedAt: null WHERE clause returns 0 for already-revoked rows
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.logout("already-revoked-token")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// approveProvider
// ---------------------------------------------------------------------------

describe("AuthService.approveProvider", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: AuthService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AuthService(prisma as any, JWT_SECRET);
  });

  it("sets providerApprovedAt on an unapproved provider", async () => {
    const provider = makeUser({ role: Role.provider, providerApprovedAt: null });
    const approved = { ...provider, providerApprovedAt: new Date() };
    prisma.user.findUnique.mockResolvedValue(provider);
    prisma.user.update.mockResolvedValue(approved);

    const result = await service.approveProvider("user-1");

    expect(result.providerApprovedAt).not.toBeNull();
    expect(prisma.user.update).toHaveBeenCalledOnce();
  });

  it("is idempotent — does not write to DB if already approved", async () => {
    const provider = makeUser({
      role: Role.provider,
      providerApprovedAt: new Date("2026-01-01"),
    });
    prisma.user.findUnique.mockResolvedValue(provider);

    const result = await service.approveProvider("user-1");

    expect(result.providerApprovedAt).toEqual(new Date("2026-01-01"));
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("throws ProviderNotFoundError for unknown user", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.approveProvider("nonexistent")).rejects.toThrow(
      ProviderNotFoundError
    );
  });

  it("throws NotAProviderError when user is a requester", async () => {
    prisma.user.findUnique.mockResolvedValue(
      makeUser({ role: Role.requester })
    );

    await expect(service.approveProvider("user-1")).rejects.toThrow(
      NotAProviderError
    );
  });

  it("throws NotAProviderError when user is an admin", async () => {
    prisma.user.findUnique.mockResolvedValue(
      makeUser({ role: Role.admin })
    );

    await expect(service.approveProvider("user-1")).rejects.toThrow(
      NotAProviderError
    );
  });
});

// ---------------------------------------------------------------------------
// isProviderApproved — the gate MatchingStrategy.findEligible must check
// ---------------------------------------------------------------------------

describe("isProviderApproved", () => {
  it("returns false for a provider with no approval date", () => {
    expect(
      isProviderApproved({ role: Role.provider, providerApprovedAt: null })
    ).toBe(false);
  });

  it("returns true for a provider with an approval date", () => {
    expect(
      isProviderApproved({ role: Role.provider, providerApprovedAt: new Date() })
    ).toBe(true);
  });

  it("returns false for a requester regardless of providerApprovedAt", () => {
    expect(
      isProviderApproved({ role: Role.requester, providerApprovedAt: null })
    ).toBe(false);
    // Edge case: requester with a date shouldn't be treated as approved provider
    expect(
      isProviderApproved({ role: Role.requester, providerApprovedAt: new Date() })
    ).toBe(false);
  });

  it("returns false for an admin", () => {
    expect(
      isProviderApproved({ role: Role.admin, providerApprovedAt: null })
    ).toBe(false);
  });
});
