# auth-spec addendum: access + refresh tokens — give this to Kiro verbatim

## Why

The current `AuthService.login` issues a single JWT valid for 7 days with
no server-side revocation — if it leaks, it's usable for a week with no
way to kill it, and admin actions in this system move money (even
simulated). Standard fix: a short-lived access token plus a longer-lived,
revocable refresh token stored hashed in the DB, rotated on every use.

## Where this code goes

Package: `packages/skeleton-core`, extending the existing `auth/` module
(`auth.types.ts`, `auth.service.ts`, `auth.service.test.ts`, `index.ts`) —
don't create a new top-level module for this.

## Schema change required first

Add to `packages/skeleton-core/prisma/schema.prisma`:

```prisma
model RefreshToken {
  id         String    @id @default(uuid())
  userId     String
  user       User      @relation(fields: [userId], references: [id])
  // SHA-256 hex digest of the raw token — never store the raw token.
  // A refresh token is already high-entropy random data, so a fast
  // deterministic hash (not bcrypt) is correct here: it needs an
  // equality-indexable lookup, and unlike a password there's no
  // low-entropy-input brute-force risk to defend against.
  tokenHash  String    @unique
  expiresAt  DateTime
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())
}
```

Add `refreshTokens RefreshToken[]` to the `User` model.

Run `npx prisma migrate dev --name add_refresh_tokens` from
`packages/skeleton-core` after editing the schema, the same way the
existing migrations were created.

## Required behavior changes

### `auth.types.ts`

- `LoginResult` changes from `{ user: AuthUser; token: string }` to:
  ```ts
  interface LoginResult {
    user: AuthUser;
    accessToken: string;
    refreshToken: string;
  }
  ```
  This is a breaking rename (`token` → `accessToken`) — intentional, to
  make the two token kinds unambiguous at every call site.
- New errors: `InvalidRefreshTokenError` (covers not-found, expired, AND
  already-revoked — don't leak which specific condition failed, same
  reasoning as `InvalidCredentialsError` already in this file).

### `auth.service.ts`

1. **`login`** now issues both tokens:
   - Access token: JWT, same claims as today (`sub`, `email`, `role`),
     expiry shortened from `7d` to `15m`.
   - Refresh token: `crypto.randomBytes(32).toString("hex")` (32 bytes of
     randomness — don't use a JWT for this, it doesn't need to be
     self-describing). Store `sha256(rawToken)` as `tokenHash` with
     `expiresAt` 30 days out. Return the **raw** token to the caller once;
     it is never retrievable again.

2. **`refreshTokens(rawRefreshToken: string): Promise<LoginResult>`** —
   the rotation endpoint:
   - Hash the incoming raw token, look up by `tokenHash`.
   - Throws `InvalidRefreshTokenError` if: not found, `revokedAt` is set,
     or `expiresAt` has passed.
   - On success: **atomically** mark the found row `revokedAt = now()`
     AND issue a brand-new access+refresh pair in the same operation
     (wrap in `prisma.$transaction`). This is rotation-on-use — if a
     stolen refresh token gets replayed after the legitimate client
     already rotated it, the replay must fail (the row is already
     revoked), not succeed a second time.
   - Returns the same `LoginResult` shape as `login`.

3. **`logout(rawRefreshToken: string): Promise<void>`** — hashes the
   token, sets `revokedAt = now()` on the matching row if found and not
   already revoked. Succeeds silently (no error) if the token doesn't
   exist or is already revoked — logout is idempotent, not a place to
   leak whether a token was valid.

4. **`verifyToken`** (existing method, verifying the *access* token) is
   unchanged — access tokens are still stateless JWTs, only refresh
   tokens are stored/revocable. Do not add a DB check to `verifyToken`
   itself; that would defeat the point of having a short-lived stateless
   access token in the first place.

## Tests (`auth.service.test.ts` — extend, don't replace)

- `login` returns both `accessToken` (3 dot-separated JWT segments) and a
  `refreshToken`, and a `RefreshToken` row is created with a hash that
  does **not** equal the raw returned token (i.e. it's actually hashed,
  not stored in plaintext under a different field name).
- `refreshTokens` with a valid, unexpired, unrevoked token succeeds and
  returns a new pair.
- `refreshTokens` called a second time with the **same now-rotated**
  token throws `InvalidRefreshTokenError` (the replay-after-rotation
  case — this is the one that actually matters, don't skip it).
- `refreshTokens` with an expired token throws `InvalidRefreshTokenError`.
- `logout` revokes a valid token, and a subsequent `refreshTokens` call
  with that same token then throws `InvalidRefreshTokenError`.
- `logout` on an already-revoked or nonexistent token does not throw.

## Out of scope

No NestJS/HTTP layer changes — `backend/api`'s `AuthController`,
`JwtAuthGuard`, and the e2e tests that currently expect `result.body.token`
will be updated separately (by the other assistant building `backend/api`
directly) once this lands. Don't touch anything outside
`packages/skeleton-core/src/auth/` and the Prisma schema.
