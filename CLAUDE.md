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

Planning complete, no code written yet. Next step: write the four skeleton
specs described in `docs/KIRO-PLAN.md`, then start the backend in Kiro.

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
