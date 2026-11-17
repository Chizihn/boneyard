import { RequestStatus } from "@prisma/client";
import { InvalidOrderTransitionError } from "./order-state.types";

/**
 * Explicit transition table.  Terminal states (COMPLETED, RESOLVED, CANCELLED)
 * have no entry — attempting to leave them throws just like any other absent pair.
 */
export const ORDER_STATE_TRANSITIONS: Readonly<
  Partial<Record<RequestStatus, ReadonlySet<RequestStatus>>>
> = {
  [RequestStatus.REQUESTED]: new Set([
    RequestStatus.MATCHED,
    RequestStatus.CANCELLED,
  ]),
  [RequestStatus.MATCHED]: new Set([
    RequestStatus.ACCEPTED,
    RequestStatus.CANCELLED,
  ]),
  [RequestStatus.ACCEPTED]: new Set([RequestStatus.IN_PROGRESS]),
  [RequestStatus.IN_PROGRESS]: new Set([
    RequestStatus.COMPLETED,
    RequestStatus.DISPUTED,
  ]),
  [RequestStatus.DISPUTED]: new Set([RequestStatus.RESOLVED]),
} as const;

/**
 * Returns true when moving from `current` to `next` is listed in the
 * transition table.  Use this when you want to branch; use `assertTransition`
 * when you want to throw on an illegal move.
 */
export function isValidTransition(
  current: RequestStatus,
  next: RequestStatus
): boolean {
  return ORDER_STATE_TRANSITIONS[current]?.has(next) ?? false;
}

/**
 * Asserts that the `current` → `next` transition is legal.
 * Throws `InvalidOrderTransitionError` if it is not — never silently
 * no-ops, auto-corrects, or returns a boolean.
 */
export function assertTransition(
  current: RequestStatus,
  next: RequestStatus
): void {
  if (!isValidTransition(current, next)) {
    throw new InvalidOrderTransitionError(current, next);
  }
}
