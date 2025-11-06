-- AlterTable
ALTER TABLE "EditionAccess" ALTER COLUMN "unlockAt" DROP NOT NULL,
ALTER COLUMN "expiresAt" DROP NOT NULL;
