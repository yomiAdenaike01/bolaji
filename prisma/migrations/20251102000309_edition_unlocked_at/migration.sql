/*
  Warnings:

  - Added the required column `unlockAt` to the `EditionAccess` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "EditionStatus" AS ENUM ('PENDING', 'PREORDER_OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "Edition" ADD COLUMN     "preorderCloseAt" TIMESTAMP(3),
ADD COLUMN     "preorderOpenAt" TIMESTAMP(3),
ADD COLUMN     "releasedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "EditionAccess" ADD COLUMN     "status" "AccessStatus" NOT NULL DEFAULT 'SCHEDULED',
ADD COLUMN     "unlockAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "unlockedAt" DROP NOT NULL,
ALTER COLUMN "unlockedAt" DROP DEFAULT;
