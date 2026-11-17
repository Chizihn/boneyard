-- Must be committed before use elsewhere, per Postgres's enum rules.
ALTER TYPE "PaymentStatus" ADD VALUE 'pending_refund';
