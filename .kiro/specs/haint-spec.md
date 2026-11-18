# haint-spec (draft for Kiro)

`apps/haint` is a thin Expo (React Native) app, same shape as
`apps/hallowear` — auth, matching, the order-state machine, and payments
all already exist and are already tested; this spec is config + screens
on top of them, not new business logic. If a screen needs logic beyond
"call this endpoint, show this field," that logic belongs in
`skeleton-core` or `backend/api`, not here — flag it instead of writing
it into the app.

## What this app is

A haunted-attraction/ghost-tour booking marketplace. Requesters browse
attractions and book a specific time slot; attraction operators (providers)
publish slots with capacity and check requesters in on arrival. Real money
changes hands through the existing Bachs checkout/payout integration in
`backend/api` — this app just renders `checkoutUrl` and shows status, it
never talks to Bachs directly.

## Stack / wiring

- Expo (SDK 58) + Expo Router, TypeScript. Same pinned versions as
  `apps/hallowear` — React 19.3.0 / React Native 0.88.1 / `expo-router
  ~58.0.32` / `react-native-reanimated` 4.7.1 + `react-native-worklets`
  0.13.0 (babel plugin `react-native-worklets/plugin`, listed last) —
  copy that app's `package.json`/`babel.config.js`/`metro.config.js`
  shape rather than re-deriving versions.
- All visual components come from `@boneyard/skeleton-ui`
  (`Container`, `Heading`, `BodyText`, `Button`, `Input`, `Badge`,
  `StatusBadge`, `Card`, `ListingCard`, `EmptyState`, `BackButton`,
  `Toast`/`useToast`, `haintTheme`, `useBoneyardFonts`). Wrap the app
  root in `<ThemeProvider theme={haintTheme}>` once `useBoneyardFonts()`
  returns true — same pattern as Hallowear's `_layout.tsx`, not a new
  one. Do not write new color values, new font-family strings, or a
  second button/card/badge/toast component in this app — if
  `skeleton-ui` is missing something a screen genuinely needs, that's a
  `skeleton-ui` change, not a local workaround. `haintTheme` is dark by
  default (`isDark: true`) and its display headings render in a
  synthetic italic slant (`theme.headingItalic`) — `Heading` already
  handles this automatically, don't override `fontStyle` yourself.
- Talk to `backend/api` (already built, already tested) directly over
  REST, same auth/token pattern as Hallowear's `lib/api.ts` (access +
  refresh token pair from `POST /auth/login`, `Authorization: Bearer`,
  refresh-once-on-401 via `POST /auth/refresh`, and the same fix that
  pattern needed: don't attempt a refresh at all on a call that had no
  access token to begin with, or a wrong-password error reports as
  "session expired"). Port `lib/api.ts`, `lib/auth-context.tsx`,
  `lib/screens/SettingsScreen.tsx`, and `lib/screens/ProfileScreen.tsx`
  from Hallowear largely as-is — they're vertical-agnostic (auth,
  settings, delete-account, profile aren't Haint-specific at all).
- `Listing.vertical` is always `"haint"` for everything this app creates
  or reads. `Listing.metadata` fields this app uses:
  - `slotStart` / `slotEnd` (ISO datetime strings) — the exact time
    window of the slot. `HaintStrategy.isEligible` requires a request's
    `[windowStart, windowEnd]` to match these **exactly**, not fall
    within a range the way Hallowear's date window does — there is no
    "pick any dates within availability" step for this app, only "pick
    one of the listing's published slots."
  - `capacity` (number) and `bookedCount` (number) — eligibility also
    requires `bookedCount < capacity`. The atomic check-and-claim that
    prevents two bookings from racing past capacity already lives in
    `backend/api` (see `.kiro/steering/haint-slot-capacity.md`) — this
    app never computes or trusts a client-side capacity check, it just
    submits the request and handles the real error if the slot filled
    up between page-load and submit (a 409 — show it as "this slot just
    filled up," not a generic failure).
  - `rating` (number) — shown on listing cards, also what `HaintStrategy`
    ranks on (distance primary, rating breaks ties) — the app never
    re-implements ranking, it just displays whatever order
    `GET /listings/search` returns.
  - `pricePerTicket` (number) — read by `backend/api`'s amount
    computation for Haint requests (flat per-ticket, no per-night math
    the way Hallowear has). Not part of `HaintStrategy`'s own validated
    metadata shape, but still required for a request's amount to be
    correct — don't drop it when creating a listing.
  - No `category` field exists for Haint (it's Hallowear-only and
    silently ignored server-side for this vertical) — don't add a
    category filter/input to any Haint screen.
- Folder shape: same as Hallowear — Expo Router route groups
  `app/(requester)/(tabs)/...` and `app/(provider)/(tabs)/...`, a
  `Tabs` navigator for the per-role root screens (floating pill tab bar,
  same component shape as Hallowear's, themed with `haintTheme`'s dark
  palette) wrapped in a `Stack` for detail/booking-flow screens pushed
  on top. Keep per-screen files small — the same "fetch, map data into
  `ListingCard`/`StatusBadge` props, handle one or two actions" bar
  Hallowear's screens were held to applies here.

## Screens (from docs/DESIGN.md)

**Requester**

1. **Browse attractions** — `GET /listings/search?vertical=haint` with a
   wide default date window (there's no "category" filter for this
   vertical — omit it) and the device's location (or the same fixed
   fallback-location-with-a-flagged-note pattern Hallowear's Browse
   screen uses if location access isn't available). Grid of
   `ListingCard`s — title, `pricePerTicket`, a distance/rating subtitle,
   a badge showing remaining capacity (`capacity - bookedCount`) when
   it's running low (e.g. ≤ 3 left), using the `warning` badge variant.
2. **Attraction detail** — `GET /listings/:id`. Description (from
   `title`/whatever descriptive fields exist on the listing), available
   time slots. If a provider publishes multiple slots as separate
   `Listing` rows (the natural modeling — one listing per bookable slot,
   not one listing with an array of slots), this screen may need
   `GET /listings/search` filtered to the same attraction/provider to
   show "other times" — confirm with whoever's reviewing this spec
   whether attractions are one-listing-per-slot or one-listing-with-
   many-slots before building this; the data model as described in
   `docs/ARCHITECTURE.md` suggests the former.
3. **Book a slot** — no date *range* picker the way Hallowear's booking
   screen has one (that's the wrong interaction for an exact-slot
   match) — confirm the listing's own `slotStart`/`slotEnd`, then
   `POST /requests` with `listingId`, `windowStart: slotStart,
   windowEnd: slotEnd` taken directly from the listing, not
   user-edited. Same checkout-URL-opening and
   not-confirmed-until-webhook-clears behavior as Hallowear's booking
   screen. On success, the "ticket" is just the created `Request`'s id
   — render a QR code encoding it (a plain `react-native-qrcode-svg` or
   equivalent is reasonable here; this is new-ish but narrowly-scoped
   tooling, flag it rather than silently adding a heavier dependency).
4. **My bookings** — `GET /requests/mine`, `StatusBadge` per
   `RequestStatus`, a ticket/QR view on the booking detail screen (same
   QR code as screen 3, re-derivable from the request id, not stored
   separately), and a "raise a dispute" action
   (`POST /requests/:id/dispute`) for cases like the attraction closing
   early.

**Provider (attraction operator)**

5. **Attraction profile** — provider-level info (name/description) isn't
   really separate from "my listings" here the way it might be for a
   business with one storefront and many SKUs — if the design intent is
   a single description shown across all of a provider's slot listings,
   that's `User` profile data, not `Listing` data, and may not need its
   own screen beyond what the shared Profile screen already covers.
   Flag this rather than inventing a new backend field for it.
6. **Manage slots** — `POST /listings` to publish a new slot
   (`vertical: "haint"`, metadata above), `GET /listings/mine` to list
   them, `PATCH /listings/:id` to edit or to "close out" a slot
   (`active: false`) — same shape as Hallowear's list-item/edit/my-
   listings screens, just with slot fields instead of date-range/price-
   per-day fields.
7. **Check-in** — scanning a requester's ticket (the QR from screen 3)
   decodes to a request id; confirming arrival is
   `POST /requests/:id/start` (ACCEPTED → IN_PROGRESS — "checked in," not
   finished yet). There is no dedicated check-in/QR backend endpoint;
   this is purely a client-side scan-then-call-the-existing-transition
   flow. A simple `expo-camera`-based scanner is reasonable; don't build
   a custom barcode decoder.

## Out of scope for this spec

No local auth screens beyond what calls `backend/api`'s existing
`/auth/*` endpoints. No local order-state transitions, no local
payment/refund math, no local capacity-checking logic (the server is the
only source of truth there — see above). No map view for screen 1 even
though `docs/DESIGN.md` mentions "map + list" — ship the list first; a
map is a real scope addition, not a styling detail, and should be a
follow-up decision, not something built silently into this pass. No
admin screens — that's `apps/admin`, a separate spec.
