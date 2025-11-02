/*
  Warnings:

  - Added the required column `paymentIntentId` to the `StripeSubscriptionCheckoutMetadata` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "StripeSubscriptionCheckoutMetadata" ADD COLUMN     "paymentIntentId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "StripeSubscriptionCheckoutMetadata_paymentIntentId_idx" ON "StripeSubscriptionCheckoutMetadata"("paymentIntentId");
