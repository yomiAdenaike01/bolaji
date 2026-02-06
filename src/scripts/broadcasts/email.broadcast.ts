import { loadEnv } from "@/config/env";
loadEnv();
import { initConfig } from "@/config";
import { EmailType } from "@/infra/integrations/email-types";
import { EmailIntegration } from "@/infra/integrations/email.integration";
import Bottleneck from "bottleneck";
import { readFile } from "fs/promises";

async function broadcastEmail() {
  const emailPath = process.env.EMAILS_LIST;
  const emailType = process.env.EMAIL_TYPE as EmailType;
  console.log({emailPath,emailType})
  if (!emailPath) throw new Error("Emails not found");

  if (!emailType) throw new Error("Email type not found");

  const config = initConfig();
  const emailsJSON = await readFile(emailPath, { encoding: "utf-8" });
  const recipients = JSON.parse(emailsJSON) as string[];
  const emailIntegration = new EmailIntegration(
    config.resendApiKey,
    config.sentFromEmailAddr,
  );
  const limiter = new Bottleneck({
    minTime: 500,
    maxConcurrent: 1,
  });

  const responses = await Promise.all(
    recipients.map((recipient) => {
      return limiter.schedule(async () => {
        try {
          await emailIntegration.sendEmail({
            email: recipient,
            type: emailType,
            content: undefined,
          });
          return {result:true, recipient};
        } catch (error) {
          console.error(error)
          return {result:false, recipient}
        }
      });
    }),
  );
  return {
    totalRecipients: recipients.length,
    success:responses.filter(resp=>resp.result === true).length,
    failures:responses.filter(resp=>resp.result === false).length,
  }
}

broadcastEmail()
  .then((result) => {
    console.log(`Successfully sent: ${result.success}/${result.totalRecipients} emails`)
    process.exit(0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  });
