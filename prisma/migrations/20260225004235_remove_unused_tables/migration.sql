/*
  Warnings:

  - You are about to drop the `EmailLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EmailVerificationToken` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OrderItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PasswordResetToken` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Session` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StripeSubscriptionCheckoutMetadata` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SupportMessage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SupportTicket` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SystemFlag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserRefreshToken` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."EmailLog" DROP CONSTRAINT "EmailLog_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."EmailVerificationToken" DROP CONSTRAINT "EmailVerificationToken_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."OrderItem" DROP CONSTRAINT "OrderItem_editionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."OrderItem" DROP CONSTRAINT "OrderItem_orderId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PasswordResetToken" DROP CONSTRAINT "PasswordResetToken_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Session" DROP CONSTRAINT "Session_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."StripeSubscriptionCheckoutMetadata" DROP CONSTRAINT "StripeSubscriptionCheckoutMetadata_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."SupportMessage" DROP CONSTRAINT "SupportMessage_authorUserId_fkey";

-- DropForeignKey
ALTER TABLE "public"."SupportMessage" DROP CONSTRAINT "SupportMessage_ticketId_fkey";

-- DropForeignKey
ALTER TABLE "public"."SupportTicket" DROP CONSTRAINT "SupportTicket_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."UserRefreshToken" DROP CONSTRAINT "UserRefreshToken_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."UserRefreshToken" DROP CONSTRAINT "UserRefreshToken_userId_fkey";

-- DropTable
DROP TABLE "public"."EmailLog";

-- DropTable
DROP TABLE "public"."EmailVerificationToken";

-- DropTable
DROP TABLE "public"."OrderItem";

-- DropTable
DROP TABLE "public"."PasswordResetToken";

-- DropTable
DROP TABLE "public"."Session";

-- DropTable
DROP TABLE "public"."StripeSubscriptionCheckoutMetadata";

-- DropTable
DROP TABLE "public"."SupportMessage";

-- DropTable
DROP TABLE "public"."SupportTicket";

-- DropTable
DROP TABLE "public"."SystemFlag";

-- DropTable
DROP TABLE "public"."UserRefreshToken";
