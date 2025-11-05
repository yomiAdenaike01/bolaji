import { Db } from "@/infra";
import { logger } from "@/lib/logger";
import { Job, Worker } from "bullmq";
import z from "zod";
import { EmailType } from "../integrations/email-types";
import { EmailIntegration } from "../integrations/email.integration";
import { Config } from "@/config";
import { OrderStatus, PlanType, UserStatus } from "@/generated/prisma/enums";
import { sendWaitlistEmails } from "@/scripts/send-waitlist-emails";
import { AdminEmailIntegration } from "../integrations/admin.email.integration";

export class EmailWorker {
  constructor(
    private readonly db: Db,
    connection: string,
    private readonly emailIntegration: EmailIntegration,
    private readonly adminEmailIntegration: AdminEmailIntegration,
    private readonly config: Config,
  ) {
    const w = new Worker("emails", async (job) => this.process(job), {
      connection: {
        url: connection,
      },
    });
    w.on('failed',(job)=>{
      logger.warn(`[EmailWorker] Failed to complete job - $${job?.name} ${job?.id}`)
    })
    w.on('error',(error)=>{
      logger.error(error,`[EmailWorker] Error - Processing email job`)
    })
  }

  process = async (job: Job<any, any, string>) => {
    logger.info(`📬 [EmailWorker] Processing job: ${job.name}`);

    switch (job.name) {
      case "email.preorders_open": {
        // await sendWaitlistEmails({
        //   job,
        //   config: this.config,
        //   db: this.db,
        //   emailIntegration: this.emailIntegration,
        //   adminEmailIntegration: this.adminEmailIntegration,
        // });
        break;
      }
      case "email.preorder_reminder": {
        const users = await this.db.user.findMany({
          where: {
            preorderLinkClickedAt: null,
            preorderEmailSentAt: { not: null },
            status: UserStatus.PENDING_PREORDER,
          },
        });
        for (const user of users) {
          if (!user?.email || !user.name) continue;
          await this.emailIntegration.sendEmail({
            email: user.email,
            type: EmailType.EDITION_00_DIGITAL_RELEASE,
            content: {
              name: user.name,
              accessLink: `${this.config.frontEndUrl}/auth/login`,
              subscribeLink: `${this.config.frontEndUrl}/subscription/dashboard-subscription`,
            },
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        break;
      }
      case "email.edition00_release": {
        const users = await this.db.preorder.findMany({
          where: {
            choice: {
              not: PlanType.PHYSICAL,
            },
            status: OrderStatus.PAID,
          },
          include: { user: true },
        });

        for (const preorder of users) {
          if (!preorder.user?.email || !preorder.user.name) continue;
          await this.emailIntegration.sendEmail({
            email: preorder.user.email,
            type: EmailType.EDITION_00_DIGITAL_RELEASE,
            content: {
              name: preorder.user.name,
              accessLink: `${this.config.frontEndUrl}/auth/login`,
              subscribeLink: `${this.config.frontEndUrl}/subscription/dashboard-subscription`,
            },
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        break;
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

        await Promise.all([
          this.emailIntegration.sendEmail({
            type: EmailType.SUBSCRIPTION_RENEWED,
            email: user.email,
            content: {
              name: user.name ?? "",
              email: user.email,
              nextEdition: nextEdition?.id,
            },
          }),
          this.db.emailLog.create({
            data: {
              userId,
              toEmail: user.email,
              templateKey: EmailType.SUBSCRIPTION_RENEWED,
              subject: "Your Bolaji Editions subscription has renewed",
              deliveredAt: new Date(),
            },
          }),
        ]);

        break;
      }

      default:
        logger.info(`⚠️ Unknown job type ${job.name}`);
    }
  };
}
