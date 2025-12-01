import { Db } from "@/infra";
import { logger } from "@/lib/logger";
import { Job, Worker } from "bullmq";
import z, { promise, ZodType } from "zod";
import {
  AdminEmailType,
  EmailContentMap,
  EmailType,
} from "../integrations/email-types";
import { EmailIntegration } from "../integrations/email.integration";
import { Config } from "@/config";
import { PlanType, UserStatus } from "@/generated/prisma/enums";
import { sendWaitlistEmails } from "@/scripts/send-waitlist-emails";
import { AdminEmailIntegration } from "../integrations/admin.email.integration";
import { NotificationService } from "@/domain/notifications/notification.service";
import Bottleneck from "bottleneck";

export type EmailData = {
  name: string;
  email: string;
  planType: PlanType;
} & Record<string, any>;

const emailReleaseSchema = z.object({
  emailType: z.enum(EmailType),
  editionCode: z.string(),
  editionTitle: z.string(),
  recipients: z.array(
    z.object({
      planType: z.enum(PlanType),
      email: z.email(),
      name: z.string(),
    }),
  ),
});

export class EmailWorker {
  private readonly schemaMap = {
    [EmailType.EDITION_00_DIGITAL_RELEASE]: {
      schema: z.object({
        name: z.string(),
        planType: z.enum(PlanType),
        subscribeLink: z.url(),
        resetPasswordLink: z.url(),
      }),
      build: (user) => ({
        name: user.name,
        planType: user.planType,
        resetPasswordLink: `${this.config.frontEndUrl}/auth/reset-password`,
        subscribeLink: `${this.config.frontEndUrl}/subscription/dashboard-subscription`,
      }),
    },
    [EmailType.NEW_EDITION_RELEASED]: {
      schema: z.object({
        name: z.string(),
        editionTitle: z.string(),
        editionCode: z.string(),
        planType: z.enum(PlanType),
        editionsCollectionUrl: z.string(),
      }),
      build: (data) => {
        return {
          name: data.name,
          planType: data.planType,
          editionTitle: data.editionTitle,
          editionCode: data.editionCode,
          editionsCollectionUrl: `${this.config.frontEndUrl}/editions-collections`,
        };
      },
    },
  } as any as Record<
    keyof EmailContentMap,
    {
      schema: ZodType<any>;
      build: (
        rawEmailData: EmailData,
      ) => EmailContentMap[keyof EmailContentMap];
    }
  >;
  constructor(
    private readonly db: Db,
    connection: string,
    private readonly emailIntegration: EmailIntegration,
    private readonly adminEmailIntegration: AdminEmailIntegration,
    private readonly notificationService: NotificationService,
    private readonly config: Config,
  ) {
    const w = new Worker("emails", async (job) => this.process(job), {
      connection: {
        url: connection,
      },
      concurrency: 5,
    });
    w.on("completed", (job) => {
      logger.info(`✅ Job name:${job.name} id:${job.id} complete`);
    });
    w.on("failed", (job) => {
      logger.warn(
        `[EmailWorker] Failed to complete job - $${job?.name} ${job?.id}`,
      );
    });
    w.on("error", (error) => {
      logger.error(error, `[EmailWorker] Error - Processing email job`);
    });
  }

  private getReleaseEmailContent = <T extends EmailType>(
    emailType: T,
    rawData: EmailData,
  ): EmailContentMap[T] => {
    const entry = this.schemaMap[emailType];
    if (!entry) {
      throw new Error(`[EmailWorker] Unknown emailType: ${emailType}`);
    }

    const content = entry.build(rawData);
    entry.schema.parse(content);
    return content as EmailContentMap[T];
  };

  process = async (job: Job<any, any, string>) => {
    logger.info(`📬 [EmailWorker] Processing job: ${job.name}`);

    switch (job.name) {
      case "email.admin_subscriber_digest": {
        const timeOfDay: "morning" | "night" =
          job.data?.timeOfDay === "night" ? "night" : "morning";

        try {
          logger.info(
            `[EmailWorker] Generating ${timeOfDay} subscriber digest report...`,
          );

          await this.adminEmailIntegration.send({
            type: AdminEmailType.SUBSCRIBER_DAILY_DIGEST,
            content: { timeOfDay },
            attachReport: true, // ✅ triggers report generator internally
          });

          logger.info(
            `[EmailWorker] ✅ Sent ${timeOfDay} admin subscriber digest`,
          );
        } catch (err) {
          logger.error(
            err,
            "[EmailWorker] Failed to send admin subscriber digest",
          );
          throw err;
        }
        break;
      }

      case "email.release": {
        const parsed = emailReleaseSchema.parse(job.data);

        const { editionCode, editionTitle, recipients, emailType } = parsed;
        logger.info(
          `📢 Sending release email ${emailType} for Edition ${editionCode} to ${recipients.length} recipients`,
        );
        const limiter = new Bottleneck({
          minTime: 500,
          maxConcurrent: 1,
        });
        try {
          await Promise.all(
            recipients.map((recipient) => {
              limiter.schedule(async () => {
                try {
                  const personalisedContent = this.getReleaseEmailContent(
                    emailType,
                    {
                      ...recipient,
                      editionTitle,
                      editionCode,
                    },
                  );

                  await this.emailIntegration.sendEmail({
                    email: recipient.email,
                    type: emailType,
                    content: personalisedContent,
                  });
                } catch (error) {
                  logger.error(
                    error,
                    `[EmailWorker] Failed to send email to user=${recipient.email} `,
                  );
                }
              });
            }),
          );
        } catch (err) {
          logger.error(
            err,
            `[EmailWorker] Failed to send release emails to ${recipients.map((r) => r.email)}`,
          );
        }

        break;
      }
      case "email.preorders_open": {
        return await sendWaitlistEmails({
          job,
          config: this.config,
          db: this.db,
          emailIntegration: this.emailIntegration,
          adminEmailIntegration: this.adminEmailIntegration,
          emailType: EmailType.PREORDER_RELEASED_REMINDER,
        });
      }

      case "email.subscription_renewed": {
        const parsedData = z
          .object({
            userId: z.string(),
            nextEdition: z.object({
              id: z.string(),
              number: z.number().nonnegative(),
            }),
          })
          .parse(job.data);

        const { userId, nextEdition } = parsedData;

        if (!nextEdition) return;
        const user = await this.db.user.findUnique({ where: { id: userId } });
        if (!user?.email) return;

        this.emailIntegration
          .sendEmail({
            type: EmailType.SUBSCRIPTION_RENEWED,
            email: user.email,
            content: {
              name: user.name ?? "",
              email: user.email,
              nextEdition: nextEdition?.id,
            },
          })
          .catch((err) => {
            logger.error(
              err,
              `[Email Worker] Failed to send ${EmailType.SUBSCRIPTION_RENEWED}`,
            );
          });

        break;
      }

      default:
        logger.info(`⚠️ Unknown job type ${job.name}`);
    }
  };
}
