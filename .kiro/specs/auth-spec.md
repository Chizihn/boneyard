# auth-spec (draft for Kiro)

## Roles

Three roles on `User`: `requester`, `provider`, `admin`. A user has exactly
one role, set at signup (admin accounts are seeded/promoted, not
self-selected at signup).

## Signup / login

- Email + password signup for `requester` and `provider`. Standard
  hashed-password storage, session/JWT auth — nothing vertical-specific
  here, this is shared by both apps.
- Login returns the user's role so clients can route to the correct app
  shell (requester flow vs provider flow); the backend never trusts a
  client-sent role on protected requests — it reads role from the
  authenticated session/token.
- Profile fields are generic (name, contact, location) — vertical-specific
  profile data (e.g. costume inventory vs attraction details) lives on
  `Listing.metadata`, not on `User`.

## Provider approval gate

- A new `provider` account starts in an unapproved state and **cannot**
  receive match candidates or appear in matching results until an admin
  approves them.
- This gate is enforced server-side in the matching path, not just hidden
  in the UI — an unapproved provider's listings must never be returned by
  `MatchingStrategy.findEligible`, even if the provider creates listings
  while unapproved.
- Admin approval is a single state flip (unapproved -> approved); there is
  no partial/tiered approval for the hackathon scope.
- Rejected/unapproved providers can still log in and manage their own
  listings — the gate blocks *visibility to requesters*, not account
  access.

## Out of scope for this spec

Listing creation, matching, order lifecycle, and payments are each their
own spec (`matching-spec`, `order-state-spec`, `payments-dispute-spec`) —
auth-spec only owns identity, roles, and the approval gate.
