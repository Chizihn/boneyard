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
  ProviderNotFoundError,
  NotAProviderError,
} from "./auth.types";

const BCRYPT_ROUNDS = 12;

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
        // Providers start unapproved — providerApprovedAt stays null
        providerApprovedAt: null,
      },
    });

    return toAuthUser(user);
  }

  /**
   * Authenticates a user by email + password.
   * Returns the `AuthUser` and a signed JWT that includes the user's role.
   * The backend reads role from the token — never trusts a client-sent role.
   * Throws `InvalidCredentialsError` on bad email or password (unified message
   * to avoid leaking whether the email exists).
   */
  async login(input: LoginInput): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await bcrypt.compare(input.password, user.password);
    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }

    const authUser = toAuthUser(user);

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      this.jwtSecret,
      { expiresIn: "7d" }
    );

    return { user: authUser, token };
  }

  /**
   * Verifies a JWT and returns the decoded `AuthUser`.
   * Throws `JsonWebTokenError` / `TokenExpiredError` from the jsonwebtoken
   * library on invalid or expired tokens — the HTTP layer should map these to
   * 401 responses.
   */
  async verifyToken(token: string): Promise<AuthUser> {
    const payload = jwt.verify(token, this.jwtSecret) as {
      sub: string;
      email: string;
      role: Role;
    };

    // Re-fetch from DB so the role and approval state are always fresh,
    // not stale data baked into the token at sign time.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new InvalidCredentialsError();
    }

    return toAuthUser(user);
  }

  /**
   * Flips a provider account from unapproved → approved.
   * This is the single admin action described in auth-spec §"Provider approval gate".
   * - Throws `ProviderNotFoundError` if the user doesn't exist.
   * - Throws `NotAProviderError` if the user is not a provider.
   * - Idempotent: calling it on an already-approved provider is a no-op.
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
      // Already approved — idempotent, no DB write needed
      return toAuthUser(user);
    }

    const updated = await this.prisma.user.update({
      where: { id: providerId },
      data: { providerApprovedAt: new Date() },
    });

    return toAuthUser(updated);
  }
}
