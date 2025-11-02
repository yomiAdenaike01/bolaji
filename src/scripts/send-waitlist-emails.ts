import fs from "fs";
import { parse } from "csv-parse";
import dotenv from "dotenv";
import path from "path";
import { EmailIntegration } from "../infra/integrations/email.integration";
import { AdminEmailIntegration } from "../infra/integrations/admin.email.integration";
import { initConfig } from "../config";
import { logger } from "../lib/logger";
import { generatePreorderEmailStatusReport } from "../lib/spreadsheets/generatePreorderReport";
import { AdminEmailType, EmailType } from "@/infra/integrations/email-types";
import jwt from "jsonwebtoken";
import { initInfra } from "@/infra";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { UserStatus } from "@/generated/prisma/enums";
dotenv.config();

/**
 * Parse waitlist CSV into structured user objects
 */
async function parseWaitlistCsv(
  filePath: string,
): Promise<{ Email: string; Name: string }[]> {
  return new Promise((resolve, reject) => {
    const users: { Email: string; Name: string }[] = [];
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, skip_empty_lines: true }))
      .on("data", (row) => users.push(row))
      .on("end", () => resolve(users))
      .on("error", reject);
  });
}

/**
 * Send preorder release emails to waitlist users
 */
async function sendWaitlistEmails() {
  const config = initConfig();
  const { db, store } = initInfra(config);
  const csvPath = path.resolve(
    __dirname,
    "./BOLAJI_EDITIONS_WAITLIST_SAMPLE.csv",
  );
  const users = await parseWaitlistCsv(csvPath);

  logger.info(`📋 Loaded ${users.length} users from waitlist CSV`);
  logger.info(`🚀 Preparing to send preorder release emails...`);

  const emailIntegration = new EmailIntegration(
    config.resendApiKey,
    config.sentFromEmailAddr,
  );

  const adminEmailIntegration = new AdminEmailIntegration(
    config.resendApiKey,
    config.adminEmailAddresses,
    {} as any,
    config.sentFromEmailAddr,
  );

  const successful: { name: string; email: string }[] = [];
  const failed: { name: string; email: string; error: string }[] = [];
  logger.info("Creating user passwords...");

  const userEmailByPasswordHash: Record<
    string,
    { accountPasswordHash: string; accountPassword: string }
  > = Object.fromEntries(
    await Promise.all(
      users.map(async (user) => {
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
  );
  const createdPasswords = Object.values(userEmailByPasswordHash);

  if (
    !createdPasswords.every(Boolean) ||
    createdPasswords.length !== users.length
  ) {
    return logger.error("Failed to create passwords for users");
  }

  logger.info("Creating users...");
  // TODO: HANDLE IF ALREADY EXISTS BUT THEY SHOULDN'T HAVE ANY PENDING ORDERS OR ANYTHING
  const dbUsers = await db.user.createManyAndReturn({
    data: users.map((u) => {
      return {
        email: u.Email,
        name: u.Name,
        status: UserStatus.PENDING_PREORDER,
        passwordHash: userEmailByPasswordHash[u.Email].accountPasswordHash,
      };
    }),
  });
  const userIdsByEmail = Object.fromEntries(
    dbUsers.map((user) => [user.email, user.id]),
  );
  logger.info(`✅ Successfully created ${users.length} users`);
  const sessionVersion = 1;
  for (const user of users) {
    try {
      const sessionKey = `preorder:session:version:${crypto.randomBytes(5).toString("hex")}`;
      await store.set(sessionKey, sessionVersion);
      const token = jwt.sign(
        {
          email: user.Email,
          name: user.Name,
          userId: userIdsByEmail[user.Email],
          version: sessionVersion,
          sessionKey,
          type: "PREORDER",
          password: userEmailByPasswordHash[user.Email].accountPassword,
        },
        config.jwtSecret,
        {
          expiresIn: "7d",
        },
      );

      const preorderUrl = new URL(
        `${config.serverUrl}/preorders/private-access`,
      );
      preorderUrl.searchParams.append("token", token);

      await emailIntegration.sendEmail({
        email: user.Email,
        type: EmailType.PREORDER_RELEASED,
        content: {
          name: user.Name,
          email: user.Email,
          preorderLink: preorderUrl.toString(),
          password: userEmailByPasswordHash[user.Email].accountPassword,
        },
      });

      successful.push({ name: user.Name, email: user.Email });
      logger.info(`✅ Email sent to ${user.Name} (${user.Email})`);

      await new Promise((r) => setTimeout(r, 500));
    } catch (err: any) {
      failed.push({ name: user.Name, email: user.Email, error: err.message });
      logger.error(`❌ Failed to send to ${user.Email}`, err);
    }

    logger.info("🎉 All emails processed!");
  }

  const { buffer, filename } = await generatePreorderEmailStatusReport(
    successful,
    failed,
  );

  logger.info("📨 Sending report email to admins...");
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
}

sendWaitlistEmails()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    logger.error(err, "💥 Script failed");
    process.exit(1);
  });
