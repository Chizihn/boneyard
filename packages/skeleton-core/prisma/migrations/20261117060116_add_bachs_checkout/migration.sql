-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "status" SET DEFAULT 'pending_checkout';
ALTER TABLE "Payment" ADD COLUMN "checkoutSessionId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "checkoutUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_checkoutSessionId_key" ON "Payment"("checkoutSessionId");

-- CreateTable
CREATE TABLE "ProcessedWebhookEvent" (
    "id" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("id")
);
