/*
  Warnings:

  - A unique constraint covering the columns `[providerMessageId]` on the table `EmailEvent` will be added. If there are existing duplicate values, this will fail.
  - Made the column `providerMessageId` on table `EmailEvent` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "EmailEvent" ALTER COLUMN "providerMessageId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "EmailEvent_providerMessageId_key" ON "EmailEvent"("providerMessageId");
