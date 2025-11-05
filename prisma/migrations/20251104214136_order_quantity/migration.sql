/*
  Warnings:

  - You are about to drop the column `quantity` on the `Shipment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Shipment" DROP COLUMN "quantity";
