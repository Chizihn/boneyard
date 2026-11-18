-- Soft-delete marker for account deletion (Play Store compliance). A
-- hard DELETE on User would FK-fail for any account with listings or
-- requests (no onDelete: Cascade on those relations), so deletion
-- anonymizes the row and sets this instead.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
