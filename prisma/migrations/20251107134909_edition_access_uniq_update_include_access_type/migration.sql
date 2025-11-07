/*
  Warnings:

  - A unique constraint covering the columns `[userId,editionId,accessType]` on the table `EditionAccess` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."EditionAccess_userId_editionId_key";

-- CreateIndex
CREATE UNIQUE INDEX "EditionAccess_userId_editionId_accessType_key" ON "EditionAccess"("userId", "editionId", "accessType");
