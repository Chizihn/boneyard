# Boneyard

Kiroween 2026 submission. Category: **Skeleton Crew**. Deadline: Fri Dec 4,
2026, 2:00 PM PT. Built with Kiro (not Claude Code) — this file is for
whichever assistant is helping plan/review/write supporting material; the
actual implementation happens in Kiro per the rules (repo must show real Kiro
usage via the `/.kiro` directory).

## What this is

One reusable two-sided marketplace skeleton (auth, matching engine, order/
booking state machine, payments + dispute resolution), proven versatile by
shipping two unrelated real apps from it:

- **Hallowear** — costume & prop rental marketplace
- **Haint** — haunted-attraction/ghost-tour booking marketplace

The engineering substance is the skeleton. Both apps should be thin — a
handful of screens each — because nearly everything they need comes from the
shared backend and shared UI components. The reviewer should be able to see
"same skeleton, two different businesses" at a glance.

This pattern is a generalization of the author's own real solo work: Ryder
(delivery dispatch), Eatovr, FetchAm, Glubon all share this same underlying
shape (requester/provider, matching, order state machine, disputes) and were
each built from scratch. Boneyard is that shape written once, properly,
instead of rebuilt per project.

## Why these specific docs exist

- `docs/ARCHITECTURE.md` — system design: monorepo layout, data model,
  matching engine, state machine, payments/dispute flow, admin app, MCP
  scaffolding tool.
- `docs/DESIGN.md` — product design: screens/flows for both apps and the
  shared admin dashboard, visual direction.
- `docs/KIRO-PLAN.md` — the actual Kiro usage plan: what goes in each spec,
  what the steering docs must say, hook definitions, the MCP tool spec, PBT
  targets, and the Kiro Crew agent split. This is the file that most directly
  determines the contest score — read it first when picking up build work.
- `docs/SUBMISSION-CHECKLIST.md` — hard submission requirements from the
  official rules, tracked as a checklist.

## Current status

Monorepo scaffolded (pnpm workspace, `skeleton-core`'s Prisma schema
migrated against a local Postgres container). All four skeleton specs are
done: `auth-spec`, `order-state-spec`, `matching-spec`, and
`payments-dispute-spec` have all been run through Kiro, with their
generated code in `packages/skeleton-core/src/` and the specs themselves
saved in `.kiro/specs/`. Steering docs for all five domain rules are in
`.kiro/steering/`, and the `pbt-on-spec-change` hook is wired and verified.
`skeleton-core` passes a full typecheck and 202 tests (`pnpm --filter
@boneyard/skeleton-core test`).

`backend/api` (NestJS, built directly rather than through Kiro — see the
division of labor this assistant and the author agreed on, driven by
limited Kiro credit) now covers the full endpoint surface: auth, listings
(CRUD + matching-engine-powered search), requests (create/accept/start/
complete/cancel/dispute, wired to the order-state machine and payments),
and admin (provider approval queue, dispute claim/resolve, activity feed).
Passes a full typecheck and 27 e2e tests against the real Postgres
container (`pnpm --filter @boneyard/api test`) — including a genuine
8-concurrent-request burst proving the Haint slot-capacity atomic guard
holds under real load, not just in `skeleton-core`'s isolated tests.

Two real bugs were caught and fixed via this live testing (not just
typecheck/unit tests): a provider's bcrypt password hash was leaking
through `/listings/search` and `/admin/providers/pending` (both fixed with
explicit Prisma `select`s — worth grepping for `include: { provider: true }`
/ `include: { requester: true }` / bare `prisma.user.findMany` again if
new endpoints touch user relations); and a NestJS+Vitest decorator-metadata
gap (esbuild doesn't implement `emitDecoratorMetadata`) that silently broke
both DI and `ValidationPipe` under the test runner — fixed via explicit
`@Inject()` everywhere and an SWC-based vitest transform
(`backend/api/vitest.config.ts`).

`backend/api` also now has: Swagger docs at `/docs` (full `@ApiProperty`
coverage on every DTO, `@ApiBearerAuth` wired), Helmet security headers,
CORS via `CORS_ORIGIN` (comma-separated allowlist or `*`, defaults to a
localhost-only allowlist if unset — see `main.ts`), a `/health` check
(DB-connectivity probe, excluded from Swagger), and fail-fast env
validation (`src/config/env.validation.ts` — a too-short `JWT_SECRET` or
missing `DATABASE_URL` now aborts startup with a clear message instead of
booting and failing confusingly on the first request). Default port is
4000 (`backend/api/.env`).

Auth now has access+refresh tokens (`auth-spec-refresh-tokens` addendum,
run through Kiro) — 15-min access tokens, 30-day rotating refresh tokens,
`POST /auth/refresh` + `POST /auth/logout`. Review caught a real
concurrency bug in Kiro's rotation logic (unconditional `update` instead
of a guarded `updateMany` — same bug class as the `resolveDispute`
double-submit fixed earlier); fixed, with a `fast-check` property test
confirmed to actually catch the regression.

Payments are fully real now, both legs — **Bachs** Connect for payout
(`PaymentSettlementService`) and real checkout sessions + real refunds for
the charge side (`CheckoutService`), both confirmed asynchronously via a
signed webhook (`POST /webhooks/bachs`). `Request`/`Payment` only reach
`MATCHED`/`held` once the webhook actually confirms payment — see
`.kiro/steering/payment-settlement-idempotency.md` for the atomic-claim +
webhook-dedup patterns (informed by reading Eatovr's integration and the
real docs.bachs.io refund API, not copying either). The payout side still
no-ops gracefully if a provider hasn't connected a Bachs account — that's
a real "not onboarded" state, not a simulation. `BACHS_SECRET_KEY`/
`BACHS_WEBHOOK_SECRET` still need real values in `.env` to hit the actual
sandbox; the test suite fakes only the Bachs HTTP boundary.

Note: Gemini has been working in this same repo concurrently (adding
`NotificationsModule`/push notifications). It added two simulation
fallbacks that directly contradicted the "no simulations" instruction
above — removed both; flagged in `docs/TRACKER.md` since there's no live
channel to Gemini to confirm it saw this.

`skeleton-core` is at 212 tests, `backend/api` at 57+ (growing — Gemini's
notification tests included), full `pnpm build` clean across both. See
`docs/TRACKER.md` for the full done/remaining breakdown.

Next: the two thin app specs (`hallowear-spec`, `haint-spec`) via Kiro, or
the MCP scaffold tool / actual Expo app shells.

## Ground rules

- This must be a genuinely new project (started Oct 30, 2026 or later) per
  contest eligibility — do not copy code from the author's existing repos
  (Ryder, Eatovr, etc.), even though the domain knowledge they encode is
  fair game and should go into steering docs as plain English rules.
- `/.kiro` directory must exist at repo root and must never be gitignored.
- Repo needs two separate folders, one per app, per Skeleton Crew rules.
- Stack should stay close to what the author already knows well (Node.js/
  NestJS, Postgres/Prisma, React Native/Expo) — no new tooling to learn
  mid-hackathon unless `docs/KIRO-PLAN.md` specifically calls for it (e.g.
  the MCP server).
