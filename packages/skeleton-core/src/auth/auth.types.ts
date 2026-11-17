import { Role } from "@prisma/client";

export { Role };

// ---------------------------------------------------------------------------
// Input / output shapes
// ---------------------------------------------------------------------------

/** Roles that can self-select at signup. Admin is seeded/promoted only. */
export type SignupRole = Extract<Role, "requester" | "provider">;

export interface SignupInput {
  email: string;
  password: string;
  name: string;
  role: SignupRole;
}

export interface LoginInput {
  email: string;
  password: string;
}

/**
 * The authenticated user shape returned by login and read from JWT payloads.
 * The backend reads role from this — never from a client-sent header/body.
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /**
   * Only present for `provider` accounts.
   * null means unapproved; a Date means the moment the admin approved them.
   */
  providerApprovedAt: Date | null;
}

/** Returned by login — includes the signed JWT alongside the user record. */
export interface LoginResult {
  user: AuthUser;
  token: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InvalidRoleError extends Error {
  constructor(attemptedRole: string) {
    super(
      `Role "${attemptedRole}" cannot be self-selected at signup. ` +
        `Only "requester" and "provider" are allowed.`
    );
    this.name = "InvalidRoleError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`An account with email "${email}" already exists.`);
    this.name = "DuplicateEmailError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password.");
    this.name = "InvalidCredentialsError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ProviderNotFoundError extends Error {
  constructor(userId: string) {
    super(`Provider user "${userId}" not found.`);
    this.name = "ProviderNotFoundError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotAProviderError extends Error {
  constructor(userId: string) {
    super(`User "${userId}" is not a provider and cannot be approved.`);
    this.name = "NotAProviderError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Provider approval gate helper
// ---------------------------------------------------------------------------

/**
 * Returns true when the provider account has been admin-approved.
 * This is the check `MatchingStrategy.findEligible` must call — the gate is
 * enforced server-side, not just hidden in the UI.
 */
export function isProviderApproved(user: Pick<AuthUser, "role" | "providerApprovedAt">): boolean {
  if (user.role !== Role.provider) return false;
  return user.providerApprovedAt !== null;
}
