-- CreateTable
CREATE TABLE "StripeSubscriptionCheckoutMetadata" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "stripeCustomerId" TEXT,
    "metadataJson" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',

    CONSTRAINT "StripeSubscriptionCheckoutMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StripeSubscriptionCheckoutMetadata_sessionId_key" ON "StripeSubscriptionCheckoutMetadata"("sessionId");

-- CreateIndex
CREATE INDEX "StripeSubscriptionCheckoutMetadata_userId_idx" ON "StripeSubscriptionCheckoutMetadata"("userId");

-- CreateIndex
CREATE INDEX "StripeSubscriptionCheckoutMetadata_subscriptionId_idx" ON "StripeSubscriptionCheckoutMetadata"("subscriptionId");

-- AddForeignKey
ALTER TABLE "StripeSubscriptionCheckoutMetadata" ADD CONSTRAINT "StripeSubscriptionCheckoutMetadata_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
