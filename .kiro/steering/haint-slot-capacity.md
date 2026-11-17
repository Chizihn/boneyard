# Haint slot bookings must never exceed capacity

Haint slot bookings must never allow two confirmed bookings to exceed a
slot's capacity — check and decrement capacity atomically.

Applies to: the Haint booking flow (confirming a `Request` against a
time-slot listing). The capacity check and the booking confirmation must
happen in a single atomic database operation (e.g. a conditional update
guarded by remaining capacity) — never a read-then-write pair, which has a
race window under concurrent booking attempts on the same slot.
