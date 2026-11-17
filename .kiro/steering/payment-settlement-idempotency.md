# Payment settlement calls must be atomically claimed and resumable, never retried under a fresh reference

Before calling an external payment provider to move money (a payout/
transfer, a charge), the row being settled must first be atomically marked
with a `PENDING:<idempotencyKey>` guard — a conditional update on current
state (the same atomic-claim pattern already used for dispute claiming).
Only after that guard succeeds does the provider call happen; only after
the provider call succeeds does the row flip to its final settled state.

If the process crashes between "provider call succeeded" and "DB write
committed," the retry must **resume under that exact same
`idempotencyKey`**, never mint a fresh one. The provider already deduped
the transfer under the old key — generating a new key and retrying is what
causes a double payout, because the provider has no way to know the new
request represents the same intended transfer as the one it already
processed.

A settlement that fails must be left in its `PENDING:<key>` state, not
reset to a clean/unclaimed state. This guarantees any retry is forced to
reuse the same key (it's still sitting right there in the row) rather than
accidentally computing a different one.

Applies to: any code that calls out to a payment provider to actually move
money on a `Payment` row (provider payout on `COMPLETED`, the Bachs
checkout/charge-collection flow). Does not apply to purely internal ledger
operations that never touch an external provider.

## Inbound webhooks must be deduped by event id before processing, not just signature-verified

A valid signature only proves the webhook really came from the provider —
it says nothing about whether this exact event was already processed.
Providers routinely retry webhook delivery (e.g. if the endpoint doesn't
ack with a 2xx fast enough), so the same event id can arrive more than
once. Before acting on a webhook event, insert its id into a dedicated
table (`ProcessedWebhookEvent`) and rely on the primary key/unique
constraint to reject a duplicate: if the insert fails because the id
already exists, the event was already handled — return success
immediately without reprocessing, never re-run the handler "just in case."
Record the event as processed, then act on it — not the other way around,
or a crash between acting and recording would make every retry reprocess
the event.
