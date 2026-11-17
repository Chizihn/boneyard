import { describe, it, expect, vi, beforeEach } from "vitest";
import { Role } from "@prisma/client";
import { AuthService } from "./auth.service";
import {
  InvalidRoleError,
  DuplicateEmailError,
  InvalidCredentialsError,
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

  it("returns AuthUser and a JWT on valid credentials", async () => {
    // We need a real bcrypt hash to test the compare path
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("correct-pass", 12);
    prisma.user.findUnique.mockResolvedValue(
      makeUser({ role: Role.requester, password: hash })
    );

    const result = await service.login({
      email: "test@example.com",
      password: "correct-pass",
    });

    expect(result.user.role).toBe(Role.requester);
    expect(result.token).toBeTruthy();
    // JWT has 3 dot-separated segments
    expect(result.token.split(".")).toHaveLength(3);
  });

  it("login result includes the user's role (client uses it to route)", async () => {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("pass", 12);
    prisma.user.findUnique.mockResolvedValue(
      makeUser({ role: Role.provider, password: hash })
    );

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
