# Invalid state transitions must throw, never silently correct

A booking/request state transition that isn't in the explicit transition
table must throw, never silently no-op or auto-correct.

Applies to: `skeleton-core`'s order-state machine (`assertTransition`) and
any code that calls it. Do not add a fallback path that "fixes" an invalid
transition request by picking the nearest valid state, ignoring it, or
logging a warning and continuing — an invalid transition is a bug in the
caller and must surface as a thrown error so it gets caught, not masked.
