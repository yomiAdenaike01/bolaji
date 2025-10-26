import fs from "fs";
import { parse } from "csv-parse";
import dotenv from "dotenv";
import path from "path";
import { EmailIntegration } from "../infra/integrations/email.integration";
import { AdminEmailIntegration } from "../infra/integrations/admin.email.integration";
import { initConfig } from "../config";
import { EmailType } from "../infra/integrations/email.integrations.templates";
import { logger } from "../lib/logger";
import { generatePreorderReport } from "../lib/spreadsheets/generatePreorderReport";
import { AdminEmailType } from "../infra/integrations/admin.email.template";
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

  for (const user of users) {
    try {
      await emailIntegration.sendEmail({
        email: user.Email,
        type: EmailType.PREORDER_RELEASED,
        content: {
          name: user.Name,
          preorderLink: config.frontEndUrl,
        },
      });

      successful.push({ name: user.Name, email: user.Email });
      logger.info(`✅ Email sent to ${user.Name} (${user.Email})`);

      // optional delay to avoid Resend rate limits
      await new Promise((r) => setTimeout(r, 500));
    } catch (err: any) {
      failed.push({ name: user.Name, email: user.Email, error: err.message });
      logger.error(`❌ Failed to send to ${user.Email}`, err);
    }

    logger.info("🎉 All emails processed!");
  }

  const { buffer, filename } = await generatePreorderReport(successful, failed);

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

sendWaitlistEmails().catch((err) => {
  logger.error("💥 Script failed", err);
  process.exit(1);
});
