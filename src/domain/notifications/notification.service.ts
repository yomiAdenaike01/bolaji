import { AccessStatus, PlanType } from "@/generated/prisma/enums";
import { Db } from "@/infra";
import { AdminEmailIntegration } from "@/infra/integrations/admin.email.integration";
import { EmailType } from "@/infra/integrations/email-types";
import { EmailIntegration } from "@/infra/integrations/email.integration";
import { JobsQueues } from "@/infra/workers/jobs-queue";
import { logger } from "@/lib/logger";
import { ZodType } from "zod";

export class NotificationService {
  constructor(
    private readonly customerEmail: EmailIntegration,
    private readonly adminEmail: AdminEmailIntegration,
    private readonly jobQueues: JobsQueues,
    private readonly db: Db,
  ) {}

  sendEditionReleaseEmails = async ({
    editionNumber,
    users,
    emailType,
  }: {
    editionNumber: number;
    users: {
      accessType: PlanType;
      user: { id: string; email: string; name: string | null };
    }[];
    emailType: EmailType;
  }) => {
    if (users?.length === 0) {
      logger.info(
        `[Notification Service] No users to email for Edition ${editionNumber}`,
      );
      return;
    }

    const edition = await this.db.edition.findFirstOrThrow({
      where: { number: editionNumber },
      select: { code: true, number: true, title: true },
    });

    logger.info(
      `[Notification Service] Preparing to queue emails for Edition ${editionNumber}`,
    );

    if (!users.length) {
      logger.info(`[Notification Service] Skipping  — no recipients.`);
      return;
    }

    const batchSize = 100;
    const totalBatches = Math.ceil(users.length / batchSize);

    logger.info(
      `[Notification Service] Queuing ${users.length} emails. Edition ${editionNumber}`,
    );

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;

      await this.jobQueues.add(
        "email.release",
        {
          emailType,
          editionCode: edition.code,
          editionNumber: edition.number,
          editionTitle: edition.title,
          recipients: batch.map(({ user, accessType }) => ({
            email: user.email,
            name: user.name,
            planType: accessType,
          })),
        },
        { removeOnComplete: true, attempts: 3 },
      );

      logger.info(
        `[Notification Service] 📨 Queued email.release batch ${batchNumber}/${totalBatches} (${batch.length} emails) for Edition ${editionNumber}`,
      );
    }

    logger.info(
      `[Notification Service] ✅ All ${users.length} email batches queued for Edition ${editionNumber}`,
    );
  };
}
