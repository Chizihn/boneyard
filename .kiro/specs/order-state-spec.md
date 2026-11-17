# order-state-spec — give this to Kiro verbatim

## Where this code goes

Package: `packages/skeleton-core` (already scaffolded — `package.json`,
`tsconfig.json`, and a generated Prisma client exist; `src/index.ts` is the
barrel export file, currently just re-exporting `./prisma-client`).

Create:
- `packages/skeleton-core/src/order-state/order-state.types.ts`
- `packages/skeleton-core/src/order-state/order-state.machine.ts`
- `packages/skeleton-core/src/order-state/order-state.machine.test.ts`
- `packages/skeleton-core/src/order-state/index.ts`

Then add this line to the existing `packages/skeleton-core/src/index.ts`:
```ts
export * from "./order-state";
```

## Critical constraint: reuse the existing status enum

The Prisma schema at `packages/skeleton-core/prisma/schema.prisma` already
defines:

```prisma
enum RequestStatus {
  REQUESTED
  MATCHED
  ACCEPTED
  IN_PROGRESS
  COMPLETED
  DISPUTED
  RESOLVED
  CANCELLED
}
```

**Import `RequestStatus` from `@prisma/client`** (it's already a dependency
of this package and the client is already generated against the migrated
database) — do not redeclare this as a new string union or a separate enum.
The whole point is that the state machine and the database column share one
source of truth.

## Requirements

1. An explicit transition table (not an `if`/`switch` chain) mapping each
   `RequestStatus` to the set of statuses it may legally move to:
   - `REQUESTED` → `MATCHED`, `CANCELLED`
   - `MATCHED` → `ACCEPTED`, `CANCELLED`
   - `ACCEPTED` → `IN_PROGRESS`
   - `IN_PROGRESS` → `COMPLETED`, `DISPUTED`
   - `DISPUTED` → `RESOLVED`
   - `COMPLETED`, `RESOLVED`, `CANCELLED` → (no outgoing transitions —
     terminal states)
2. Export the transition table itself (e.g. `ORDER_STATE_TRANSITIONS`), not
   just a function — other modules (matching engine, admin dispute actions)
   need to reference which transitions are legal without re-implementing
   the table.
3. `assertTransition(current: RequestStatus, next: RequestStatus): void` —
   throws a dedicated `InvalidOrderTransitionError` (include `current` and
   `next` in the error message) when the transition isn't in the table.
   It must **throw**, never silently no-op, auto-correct, or return a
   boolean — this is a steering-doc rule, not a style preference.
4. Also export `isValidTransition(current, next): boolean` as a
   non-throwing check, for call sites that want to branch instead of
   catching.
5. Tests (in `order-state.machine.test.ts`, using vitest — already a
   devDependency of this package):
   - Every transition listed above succeeds via `assertTransition` without
     throwing.
   - Every `RequestStatus` pair **not** in the table throws
     `InvalidOrderTransitionError` via `assertTransition` — this should be
     exhaustive over all status × status pairs, not just a couple of
     examples, since the property being tested is "only listed transitions
     ever succeed, with no exceptions" (this is also one of the five PBT
     targets in `docs/KIRO-PLAN.md` — if a property-based testing library is
     available in this environment, prefer a real property test generating
     arbitrary `RequestStatus` pairs over a hand-written exhaustive loop;
     otherwise the exhaustive loop over all pairs is an acceptable
     substitute and should be clearly labeled as such).
   - The three terminal states have no entries in the transition table at
     all (not empty-but-present — actually absent, so an attempt to leave
     them throws like any other invalid transition).

## Out of scope

Don't touch anything in `packages/skeleton-core/src/prisma-client.ts` or add
a NestJS/HTTP layer — this module is pure domain logic with zero framework
or network dependencies, callable from `backend/api` later.
