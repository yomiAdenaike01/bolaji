/*
  Warnings:

  - A unique constraint covering the columns `[paymentIntentId]` on the table `StripeSubscriptionCheckoutMetadata` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "StripeSubscriptionCheckoutMetadata_paymentIntentId_key" ON "StripeSubscriptionCheckoutMetadata"("paymentIntentId");
