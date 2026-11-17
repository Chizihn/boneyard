# Refund amount must come from baseAmount, never the discounted total

Refund amount must always be computed from the request's pre-discount base
amount, never the discounted total the requester actually paid — the
platform absorbs promotional discounts, not the provider.

Applies to: any code path that computes or issues a refund (payments
module, dispute resolution, admin actions). The `Payment` model's
`baseAmount` field exists specifically for this — refund math must read
from it, never from `amount` (the actual charged/discounted total) and
never re-derive it from a discount percentage applied on the fly.
