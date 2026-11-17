-- Postgres requires a new enum value to be committed in its own
-- transaction before it can be used elsewhere (e.g. as a column default)
-- in a later statement. This migration exists solely to satisfy that.
ALTER TYPE "PaymentStatus" ADD VALUE 'pending_checkout';
