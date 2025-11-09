import { UserStatus } from "@/generated/prisma/enums";
import { Db } from "@/infra";
import { AdminEmailType, EmailType } from "@/infra/integrations/email-types";
import { generateWaitlistEmailSummary } from "@/lib/spreadsheets/generateWaitlistEmailSummary";
import bcrypt from "bcrypt";
import Bottleneck from "bottleneck";
import { Job } from "bullmq";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import pLimit from "p-limit";
import { Config } from "../config";
import { AdminEmailIntegration } from "../infra/integrations/admin.email.integration";
import { EmailIntegration } from "../infra/integrations/email.integration";
import { logger } from "../lib/logger";

const formatList = (arr: any[]): Array<{ Email: string; Name: string }> => {
  if (!arr) return [];
  return arr.map((a) => {
    return {
      Name: `${a["First name"]} ${a["Last name"] || ""}`,
      Email: a["Email"],
    };
  });
};

/**
 * Send preorder release emails to waitlist users
 */
export async function sendWaitlistEmails({
  job,
  config,
  db,
  emailIntegration,
  adminEmailIntegration,
  emailType = EmailType.PREORDER_RELEASED,
}: {
  job: Job<any, any, string>;
  config: Config;
  db: Db;
  emailIntegration: EmailIntegration;
  adminEmailIntegration: AdminEmailIntegration;
  emailType?: EmailType;
}) {
  const users = formatList(job.data.waitlist);
  if (!users?.length) throw new Error("No users found in waitlist");

  logger.info(`📋 Loaded ${users.length} users`);
  const successful: { name: string; email: string }[] = [];
  const failed: { name: string; email: string; error: string }[] = [];

  // --- 1️⃣ Generate passwords concurrently ---
  logger.info("🔐 Generating passwords...");
  const passwordLimit = pLimit(20);
  const userEmailByPasswordHash = Object.fromEntries(
    await Promise.all(
      users.map((user) =>
        passwordLimit(async () => {
          const password = crypto.randomBytes(5).toString("hex");
          return [
            user.Email,
            {
              accountPasswordHash: await bcrypt.hash(password, 10),
              accountPassword: password,
            },
          ];
        }),
      ),
    ),
  );

  // --- 2️⃣ Upsert users concurrently ---
  logger.info("👤 Upserting users...");
  const upsertLimit = pLimit(10);
  const dbUsers = await Promise.all(
    users.map((u) =>
      upsertLimit(() =>
        db.user.upsert({
          where: { email: u.Email },
          update: {
            name: u.Name,
            status: UserStatus.PENDING_PREORDER,
            passwordHash: userEmailByPasswordHash[u.Email].accountPasswordHash,
          },
          create: {
            email: u.Email,
            name: u.Name,
            status: UserStatus.PENDING_PREORDER,
            passwordHash: userEmailByPasswordHash[u.Email].accountPasswordHash,
          },
        }),
      ),
    ),
  );
  logger.info(`✅ ${dbUsers.length} users upserted`);

  const userIdsByEmail = Object.fromEntries(
    dbUsers.map((u) => [u.email, u.id]),
  );

  // --- 3️⃣ Bottleneck rate limiter for emails (2 req/sec) ---
  logger.info("📧 Sending preorder emails...");
  const limiter = new Bottleneck({
    minTime: 500, // 2 emails per second
    maxConcurrent: 1, // ensures strict rate limit
  });

  const sessionVersion = 1;

  // --- Retry wrapper for rate-limited sends ---

  await Promise.all(
    users.map((user) =>
      limiter.schedule(async () => {
        try {
          const token = jwt.sign(
            {
              email: user.Email,
              name: user.Name,
              userId: userIdsByEmail[user.Email],
              version: sessionVersion,
              type: "PREORDER",
              password: userEmailByPasswordHash[user.Email].accountPassword,
            },
            config.jwtSecret,
            { expiresIn: "7d" },
          );

          const preorderUrl = new URL(
            `${config.serverUrl}/preorders/private-access`,
          );
          preorderUrl.searchParams.append("token", token);

          await emailIntegration.sendEmail({
            email: user.Email,
            type: emailType,
            content: {
              name: user.Name,
              email: user.Email,
              preorderLink: preorderUrl.toString(),
              password: userEmailByPasswordHash[user.Email].accountPassword,
            },
          });

          successful.push({ name: user.Name, email: user.Email });
          logger.info(`✅ Sent email to ${user.Email}`);
        } catch (err: any) {
          failed.push({
            name: user.Name,
            email: user.Email,
            error: err.message,
          });
          logger.error(`❌ Failed to send ${user.Email}: ${err.message}`);
        }
      }),
    ),
  );

  // --- 4️⃣ Report summary to admin ---
  const { buffer, filename } = await generateWaitlistEmailSummary(
    successful,
    failed,
    db,
  );

  await adminEmailIntegration.send({
    type: AdminEmailType.WAITLIST_PREORDER_RELEASE_SUMMARY,
    content: {
      totalFailed: failed.length,
      totalSent: successful.length,
    },
    attachReport: false,
    attachmentOverride: {
      filename,
      buffer,
    },
  });

  logger.info(
    `🎉 Job complete! ${successful.length} sent, ${failed.length} failed.`,
  );
  return { successful, failed, success: true };
}
