-- AlterTable
ALTER TABLE "User" ADD COLUMN     "preorderEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "preorderLinkClickedAt" TIMESTAMP(3),
ADD COLUMN     "reminderEmailSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SystemFlag" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemFlag_pkey" PRIMARY KEY ("key")
);
