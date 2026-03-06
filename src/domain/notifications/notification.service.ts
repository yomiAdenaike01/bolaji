import { AccessStatus, PlanType } from "@/generated/prisma/enums";
import { Db } from "@/infra";
import { AdminEmailIntegration } from "@/infra/integrations/admin.email.integration";
import {
  AdminEmailType,
  EmailContentMap,
  EmailType,
} from "@/infra/integrations/email-types";
import { EmailIntegration } from "@/infra/integrations/email.integration";
import { JobsQueues } from "@/infra/workers/jobs-queue";
import { logger } from "@/lib/logger";
import z from "zod";

export class NotificationService {
  constructor(
    private readonly customerEmail: EmailIntegration,
    private readonly adminEmail: AdminEmailIntegration,
    private readonly jobQueues: JobsQueues,
    private readonly db: Db,
  ) {}

  notifySubscriptionAction = async (
    action: "pause" | "cancel",
    {
      name,
      email,
      plan,
      editionsAccessDates,
    }: {
      name?: string | null;
      email: string;
      plan: PlanType;
      editionsAccessDates?: { number: number; expiryDate: Date }[];
    },
  ) => {
    const nowAsDateString = new Date().toISOString();
    const pauseEmailContent: EmailContentMap[EmailType.SUBSCRIPTION_PAUSED] = {
      email,
      name: name || "User",
      plan,
      pausedAt: nowAsDateString,
    };

    const cancelEmailContent = {
      name,
      email,
      plan,
      canceledAt: nowAsDateString,
    };

    const commsEmailConfig: any =
      {
        pause: [
          {
            content: pauseEmailContent,
            type: AdminEmailType.SUBSCRIPTION_PAUSED,
          },
          {
            type: EmailType.SUBSCRIPTION_PAUSED,
            content: pauseEmailContent,
          },
        ],
        cancel: [
          {
            type: AdminEmailType.SUBSCRIPTION_CANCELED,
            content: cancelEmailContent,
          },
          {
            type: EmailType.SUBSCRIPTION_CANCELLED,
            content: {
              ...cancelEmailContent,
              editionsAccessDates,
            },
          },
        ],
      }[action] || [];

    const [adminEmailConfig, userEmailConfig] = commsEmailConfig;

    if (action === "cancel")
      z.array(
        z.object({ number: z.number().nonnegative(), expiryDate: z.date() }),
      ).parse(userEmailConfig.content.editionsAccessDates);

    const promises = [
      this.customerEmail.sendEmail({ email, ...userEmailConfig }),
      this.adminEmail.send(adminEmailConfig),
    ];

    await Promise.all(promises);
  };

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
