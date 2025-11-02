/*
  Warnings:

  - Added the required column `expiresAt` to the `EditionAccess` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "EditionAccess" ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
