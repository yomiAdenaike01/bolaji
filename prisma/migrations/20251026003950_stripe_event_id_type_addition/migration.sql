/*
  Warnings:

  - The `rawPayload` column on the `StripeEvent` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[id,type]` on the table `StripeEvent` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `StripeEvent` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "StripeEvent" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "rawPayload",
ADD COLUMN     "rawPayload" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "StripeEvent_id_type_key" ON "StripeEvent"("id", "type");
