/*
  Warnings:

  - The `status` column on the `Edition` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Edition" DROP COLUMN "status",
ADD COLUMN     "status" "EditionStatus" NOT NULL DEFAULT 'PENDING';
