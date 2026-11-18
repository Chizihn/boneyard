# hallowear-spec (draft for Kiro)

`apps/hallowear` is a thin Expo (React Native) app. It owns almost nothing —
auth, matching, the order-state machine, and payments all already exist and
are already tested; this spec is config + screens on top of them, not new
business logic. If a screen needs logic beyond "call this endpoint, show
this field," that logic belongs in `skeleton-core` or `backend/api`, not
here — flag it instead of writing it into the app.

## What this app is

A costume & prop rental marketplace. Requesters browse listings and request
to book; providers list items and accept/decline incoming requests. Real
money changes hands through the existing Bachs checkout/payout integration
in `backend/api` — this app just renders `checkoutUrl` and shows status, it
never talks to Bachs directly.

## Stack / wiring

- Expo (SDK 57) + Expo Router, TypeScript. React 19.2.3 / React Native
  0.86.3 — match what's already pinned in `packages/skeleton-ui`.
- All visual components come from `@boneyard/skeleton-ui`
  (`Screen`, `Heading`, `BodyText`, `Button`, `Badge`, `StatusBadge`, `Card`,
  `ListingCard`, `hallowearTheme`, `useBoneyardFonts`). Wrap the app root in
  `<ThemeProvider theme={hallowearTheme}>` once `useBoneyardFonts()` returns
  true. **Do not** write new `StyleSheet` color values, new font-family
  strings, or a second button/card/badge component in this app — if
  `skeleton-ui` is missing something a screen genuinely needs, that's a
  `skeleton-ui` change, not a local workaround.
- Talk to `backend/api` (already built, already tested) directly over REST.
  No new backend endpoints should be needed for any screen below — if one
  seems to be missing, say so rather than inventing a client-side
  workaround. Auth: store the access+refresh token pair from
  `POST /auth/login`, attach the access token as `Authorization: Bearer`,
  refresh via `POST /auth/refresh` on a 401, exactly once, before failing.
- `Listing.vertical` is always `"hallowear"` for everything this app
  creates or reads. `Listing.metadata` fields this app uses: `category`
  (string), `pricePerDay` (number), `availabilityStart`/`availabilityEnd`
  (ISO date strings). Matching/ranking for these listings is already
  `HallowearStrategy` in `skeleton-core` (date+category eligibility,
  distance+price ranking) — this app does not re-implement or duplicate
  that logic client-side; it just submits a request and displays whatever
  `MatchCandidate`/status comes back.
- Folder shape: Expo Router route groups, e.g. `app/(requester)/...` and
  `app/(provider)/...`, each route a thin screen component that fetches,
  renders `skeleton-ui` primitives, and calls one of the endpoints below.
  Keep per-screen files small — a screen doing more than "fetch, map data
  into `ListingCard`/`StatusBadge` props, handle one or two actions" is a
  sign it's drifted out of scope for a thin app.

## Screens (from docs/DESIGN.md)

**Requester**

1. **Browse listings** — `GET /listings/search?vertical=hallowear` with
   date/category/distance filters as query params. Grid of `ListingCard`s
   (image, title, price, availability subtitle).
2. **Listing detail** — `GET /listings/:id`. Photos (placeholder image is
   fine — no photo upload in scope), price, availability window, provider
   rating if present on the response, else omit that line rather than
   inventing a value.
3. **Request to book** — pick dates within the listing's availability
   window, confirm → `POST /requests`. The response includes
   `payment.checkoutUrl` while `payment.status` is `pending_checkout` — open
   that URL (e.g. `Linking.openURL` or an in-app browser) for the requester
   to actually pay. Do not show the request as confirmed/matched until a
   later poll/refresh of `GET /requests/:id` shows `MATCHED`/`held` — the
   webhook, not this screen, is what confirms payment.
4. **My bookings** — `GET /requests/mine`. List with `StatusBadge` per
   `RequestStatus`; a bookings detail view with a "contact provider" link
   (can be a plain `mailto:`/`tel:` link to the provider's contact field if
   present — no in-app chat in scope) and a "raise a dispute" action
   (`POST /requests/:id/dispute`) available once status is
   `ACCEPTED`/`IN_PROGRESS`/`COMPLETED`.

**Provider**

5. **List an item** — category, price/day, available date range →
   `POST /listings` with `vertical: "hallowear"` and the `metadata` shape
   above. (Photos out of scope — ship with the placeholder `ListingCard`
   image state.)
6. **My listings** — `GET /listings/mine`; edit → `PATCH /listings/:id`;
   "mark unavailable" is just editing `active: false`, not a new endpoint.
7. **Incoming requests** — `GET /requests/incoming`; accept/decline →
   `POST /requests/:id/accept` / `POST /requests/:id/cancel`; "mark
   returned" → `POST /requests/:id/complete` (this is also what triggers
   the real payout per the existing `PaymentSettlementService` flow — no
   separate payout action needed here).

## Out of scope for this spec

No local auth screens beyond what calls `backend/api`'s existing
`/auth/*` endpoints — no separate signup flow logic, no password reset (not
built in the backend either, don't add it here). No local order-state
transitions, no local payment/refund math, no chat, no photo upload, no
push notifications (`NotificationsModule` already exists in `backend/api`
if this is revisited later — not this app's job to wire up yet). No admin
screens — that's `apps/admin`, a separate spec.
