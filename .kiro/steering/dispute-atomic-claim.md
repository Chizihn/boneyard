# Dispute resolution must atomically claim before refunding

Any dispute resolution action must first atomically claim the dispute row
(a conditional update guarded by current status, e.g.
`UPDATE ... WHERE status = 'open'`) before computing or issuing a refund.
Two admins acting on the same dispute must not both succeed.

Applies to: any admin-facing dispute resolution endpoint or service method.
The claim and the status check must happen in a single atomic database
operation — never a read-then-write pair (read status, decide it's open,
then write), which has a race window between the two admins.
