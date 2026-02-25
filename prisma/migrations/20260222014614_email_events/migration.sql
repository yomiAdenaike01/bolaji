-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'SPAM', 'UNSUBSCRIBED', 'FAILED');

-- CreateTable
CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campaign" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "providerEventId" TEXT,
    "eventType" "EmailEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,

    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailEvent_campaign_eventType_idx" ON "EmailEvent"("campaign", "eventType");

-- CreateIndex
CREATE INDEX "EmailEvent_toEmail_eventType_idx" ON "EmailEvent"("toEmail", "eventType");
