/*
  Warnings:

  - You are about to drop the column `providerMessageId` on the `EmailEvent` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[providerEventId]` on the table `EmailEvent` will be added. If there are existing duplicate values, this will fail.
  - Made the column `providerEventId` on table `EmailEvent` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "public"."EmailEvent_providerMessageId_key";

-- AlterTable
ALTER TABLE "EmailEvent" DROP COLUMN "providerMessageId",
ALTER COLUMN "providerEventId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "EmailEvent_providerEventId_key" ON "EmailEvent"("providerEventId");
