import { describe, it, expect } from "vitest";
import { RequestStatus } from "@prisma/client";
import {
  ORDER_STATE_TRANSITIONS,
  assertTransition,
  isValidTransition,
} from "./order-state.machine";
import { InvalidOrderTransitionError } from "./order-state.types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_STATUSES = Object.values(RequestStatus);

/** Statuses that have outgoing transitions in the table. */
const TERMINAL_STATUSES: RequestStatus[] = [
  RequestStatus.COMPLETED,
  RequestStatus.RESOLVED,
  RequestStatus.CANCELLED,
];

/** All (current, next) pairs that ARE listed in the transition table. */
const VALID_PAIRS: [RequestStatus, RequestStatus][] = Object.entries(
  ORDER_STATE_TRANSITIONS
).flatMap(([from, toSet]) =>
  [...(toSet as Set<RequestStatus>)].map(
    (to): [RequestStatus, RequestStatus] => [from as RequestStatus, to]
  )
);

// ---------------------------------------------------------------------------
// 1. Every listed transition succeeds without throwing
// ---------------------------------------------------------------------------

describe("valid transitions — assertTransition does not throw", () => {
  it.each(VALID_PAIRS)("%s → %s", (current, next) => {
    expect(() => assertTransition(current, next)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. Every (current, next) pair NOT in the table throws InvalidOrderTransitionError
//
// NOTE: No property-based testing library (fast-check / similar) is available
// in this environment, so this is an exhaustive hand-written loop over all
// RequestStatus × RequestStatus pairs that are absent from the table.
// This is the labeled substitute called out in order-state-spec §5.
// ---------------------------------------------------------------------------

describe("invalid transitions — assertTransition throws InvalidOrderTransitionError", () => {
  const invalidPairs: [RequestStatus, RequestStatus][] = [];

  for (const current of ALL_STATUSES) {
    for (const next of ALL_STATUSES) {
      if (!isValidTransition(current, next)) {
        invalidPairs.push([current, next]);
      }
    }
  }

  it.each(invalidPairs)("%s → %s", (current, next) => {
    expect(() => assertTransition(current, next)).toThrow(
      InvalidOrderTransitionError
    );

    // Also verify the error carries the right fields
    try {
      assertTransition(current, next);
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidOrderTransitionError);
      const typed = err as InvalidOrderTransitionError;
      expect(typed.current).toBe(current);
      expect(typed.next).toBe(next);
      expect(typed.message).toContain(current);
      expect(typed.message).toContain(next);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Terminal states have NO entry in the transition table (not empty-but-present)
// ---------------------------------------------------------------------------

describe("terminal states have no entry in ORDER_STATE_TRANSITIONS", () => {
  it.each(TERMINAL_STATUSES)("%s is absent from the table", (status) => {
    // The key must be absent — not present with an empty set
    expect(Object.prototype.hasOwnProperty.call(ORDER_STATE_TRANSITIONS, status)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. isValidTransition mirrors assertTransition
// ---------------------------------------------------------------------------

describe("isValidTransition is consistent with assertTransition", () => {
  for (const current of ALL_STATUSES) {
    for (const next of ALL_STATUSES) {
      if (isValidTransition(current, next)) {
        it(`${current} → ${next}: isValidTransition true, assertTransition does not throw`, () => {
          expect(isValidTransition(current, next)).toBe(true);
          expect(() => assertTransition(current, next)).not.toThrow();
        });
      } else {
        it(`${current} → ${next}: isValidTransition false, assertTransition throws`, () => {
          expect(isValidTransition(current, next)).toBe(false);
          expect(() => assertTransition(current, next)).toThrow(InvalidOrderTransitionError);
        });
      }
    }
  }
});
