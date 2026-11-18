import crypto from "crypto";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  SignupInput,
  LoginInput,
  AuthUser,
  LoginResult,
  InvalidRoleError,
  DuplicateEmailError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  ProviderNotFoundError,
  NotAProviderError,
} from "./auth.types";

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_DAYS = 30;

/** Roles that cannot be self-selected at signup. */
const ADMIN_ONLY_ROLES: Set<Role> = new Set([Role.admin]);

function toAuthUser(user: {
  id: string;
  email: string;
  name: string;
  role: Role;
  providerApprovedAt: Date | null;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    providerApprovedAt: user.providerApprovedAt,
  };
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function mintRawRefreshToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function refreshTokenExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TOKEN_TTL_DAYS);
  return d;
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwtSecret: string
  ) {}

  /**
   * Creates a new requester or provider account.
   * - Admin role cannot be self-selected; throws `InvalidRoleError`.
   * - Duplicate email throws `DuplicateEmailError`.
   * - New provider accounts start unapproved (`providerApprovedAt = null`).
   */
  async signup(input: SignupInput): Promise<AuthUser> {
    if (ADMIN_ONLY_ROLES.has(input.role as Role)) {
      throw new InvalidRoleError(input.role);
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      throw new DuplicateEmailError(input.email);
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        password: passwordHash,
        name: input.name,
        role: input.role as Role,
        providerApprovedAt: null,
      },
    });

    return toAuthUser(user);
  }

  /**
   * Authenticates a user by email + password.
   * Returns a short-lived access token (15 min JWT) and a long-lived
   * refresh token (30 days, stored hashed in DB).
   * Throws `InvalidCredentialsError` on bad email or password — unified
   * message to avoid leaking whether the email exists.
   */
  async login(input: LoginInput): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (!user || user.deletedAt) {
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await bcrypt.compare(input.password, user.password);
    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }

    const authUser = toAuthUser(user);
    const { accessToken, refreshToken } = await this.issueTokenPair(user.id, authUser);

    return { user: authUser, accessToken, refreshToken };
  }

  /**
   * Rotates a refresh token.
   * - Hashes the incoming raw token and looks it up by `tokenHash`.
   * - Throws `InvalidRefreshTokenError` if not found, already revoked, or expired.
   * - On success: atomically claims the row (guarded `updateMany` on
   *   `revokedAt: null`, not a plain `update` by id) before issuing a
   *   fresh pair. The guard is what actually makes replay-after-rotation
   *   safe under real concurrency: two genuinely simultaneous calls with
   *   the same token both pass the initial read-only check above (neither
   *   has written yet), so the exclusivity has to come from the atomic
   *   claim itself, not from the earlier read. Whichever call's claim
   *   affects 0 rows loses the race and throws — the same pattern
   *   `logout()` below already uses, and the same pattern
   *   DisputeService.claimDispute uses in the payments module.
   */
  async refreshTokens(rawRefreshToken: string): Promise<LoginResult> {
    const tokenHash = hashToken(rawRefreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt !== null || stored.expiresAt < new Date()) {
      throw new InvalidRefreshTokenError();
    }

    const authUser = toAuthUser(stored.user);

    const { accessToken, refreshToken } = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new InvalidRefreshTokenError();
      }
      return this.issueTokenPairTx(tx, stored.userId, authUser);
    });

    return { user: authUser, accessToken, refreshToken };
  }

  /**
   * Revokes a refresh token so it can no longer be rotated.
   * Idempotent — does not throw if the token doesn't exist or is already revoked.
   * Logout must never leak whether a token was valid.
   */
  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken);

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // updateMany silently affects 0 rows when not found or already revoked — that's correct.
  }

  /**
   * Verifies an access token JWT and returns the decoded `AuthUser`.
   * Access tokens are stateless — no DB lookup here by design.
   * Throws `JsonWebTokenError` / `TokenExpiredError` from jsonwebtoken on
   * invalid or expired tokens; the HTTP layer maps these to 401.
   */
  async verifyToken(token: string): Promise<AuthUser> {
    const payload = jwt.verify(token, this.jwtSecret) as {
      sub: string;
      email: string;
      role: Role;
    };

    // Re-fetch from DB so role and approval state are always current.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || user.deletedAt) {
      throw new InvalidCredentialsError();
    }

    return toAuthUser(user);
  }

  /**
   * Deletes (soft) the account: requires the current password as
   * re-confirmation (standard for a destructive, irreversible action),
   * then anonymizes PII and revokes every refresh token so no existing
   * session — including the one making this call — survives it. Listings
   * and requests are left as historical records (hard-deleting them would
   * corrupt other users' order history); `deletedAt` is what every other
   * read path must check instead.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }

    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.userPushToken.updateMany({
        where: { userId, active: true },
        data: { active: false },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          email: `deleted-${userId}@deleted.boneyard.invalid`,
          name: "Deleted user",
          password: crypto.randomBytes(32).toString("hex"),
        },
      }),
    ]);
  }

  /**
   * Flips a provider account from unapproved → approved.
   * Idempotent: no-op if already approved.
   */
  async approveProvider(providerId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: providerId },
    });
    if (!user) {
      throw new ProviderNotFoundError(providerId);
    }
    if (user.role !== Role.provider) {
      throw new NotAProviderError(providerId);
    }

    if (user.providerApprovedAt !== null) {
      return toAuthUser(user);
    }

    const updated = await this.prisma.user.update({
      where: { id: providerId },
      data: { providerApprovedAt: new Date() },
    });

    return toAuthUser(updated);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Issues an access + refresh token pair outside a transaction. */
  private async issueTokenPair(
    userId: string,
    authUser: AuthUser
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.issueTokenPairTx(this.prisma, userId, authUser);
  }

  /**
   * Issues an access + refresh token pair using the given Prisma client
   * (may be a transaction client). Called by both `login` and
   * `refreshTokens`.
   */
  private async issueTokenPairTx(
    tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"> | PrismaClient,
    userId: string,
    authUser: AuthUser
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = jwt.sign(
      { sub: authUser.id, email: authUser.email, role: authUser.role },
      this.jwtSecret,
      { expiresIn: ACCESS_TOKEN_TTL }
    );

    const rawRefreshToken = mintRawRefreshToken();
    const tokenHash = hashToken(rawRefreshToken);

    await (tx as PrismaClient).refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: refreshTokenExpiresAt(),
      },
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }
}
