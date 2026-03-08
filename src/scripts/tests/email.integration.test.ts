import { loadEnv } from "@/config/env";
loadEnv();
import fs, { readdirSync } from "fs";
import path from "path";
import { initConfig } from "@/config";
import { EmailIntegration } from "@/infra/integrations/email.integration";
import { AdminEmailIntegration } from "@/infra/integrations/admin.email.integration";
import { EmailType, AdminEmailType } from "@/infra/integrations/email-types";
import {
  getAdminMockPayloadFor,
  getMockPayloadFor,
} from "../../tests/integrations/email/email.integration.mock";

const config = initConfig();

const ensureDirExists = () => {
  const outDir = path.join(process.cwd(), "emails_previews");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
    console.log(`Created dir path:${outDir}`);
    return outDir;
  }
  const filesList = readdirSync(outDir);
  if (!filesList[0]) return outDir;
  console.log(`Removing files from dir path:${outDir}`);
  for (const file of filesList) {
    fs.unlink(file, () => {
      console.log(`Removed file: ${file}`);
    });
  }
  return outDir;
};

async function testEmails() {
  // Initialise integrations
  const userEmailIntegration = new EmailIntegration(
    config.resendApiKey,
    config.sentFromEmailAddr,
  );
  const adminEmailIntegration = new AdminEmailIntegration(
    config.resendApiKey,
    config.adminEmailAddresses,
    {} as any,
    config.sentFromEmailAddr,
  );

  const outDir = ensureDirExists();

  for (const type of Object.values(EmailType)) {
    const payload = getMockPayloadFor(type, config);
    if (payload === null) {
      console.warn(`⚠️  No mock payload found for ${type}`);
      continue;
    }
    if (Array.isArray(payload)) {
      payload.forEach(async (p, index) => {
        const email = await userEmailIntegration.getTemplate(type, p);
        const filePath = path.join(
          outDir,
          `${type}_${(p as any)?.planType || index}.html`,
        );
        fs.writeFileSync(filePath, email.template);
        console.log(`✅ Rendered user email: ${type}`);
      });
      continue;
    }
    const email = await userEmailIntegration.getTemplate(type, payload);

    const filePath = path.join(outDir, `${type}.html`);
    fs.writeFileSync(filePath, email.template);
    console.log(`✅ Rendered user email: ${type}`);
  }

  console.log("\n🧪 Generating admin emails...\n");
  for (const type of Object.values(AdminEmailType)) {
    const payload = getAdminMockPayloadFor(type);
    if (!payload) {
      console.warn(`⚠️  No mock payload found for ${type}`);
      continue;
    }

    if (Array.isArray(payload)) {
      payload.forEach((p, index) => {
        const email = adminEmailIntegration.getTemplate(type, p);
        const filePath = path.join(outDir, `ADMIN_${type}_${index}.html`);
        fs.writeFileSync(filePath, email.template);
        console.log(`✅ Rendered user email: ADMIN_${type}`);
      });
      continue;
    }

    const email = adminEmailIntegration.getTemplate(type, payload as any);
    const filePath = path.join(outDir, `ADMIN_${type}.html`);
    fs.writeFileSync(filePath, email.template);

    console.log(`✅ Rendered admin email: ${type}`);
  }

  console.log(
    "\n🎉 All emails rendered successfully! Check the 'emails_previews' folder.",
  );
}

testEmails()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error while rendering emails:", err);
    process.exit(1);
  });
