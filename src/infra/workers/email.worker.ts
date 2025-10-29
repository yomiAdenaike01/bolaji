import { Db } from "@/infra";
import { logger } from "@/lib/logger";
import { Job, Worker } from "bullmq";
import IORedis from "ioredis";
import z from "zod";
import { EmailType } from "../integrations/email-types";
import { EmailIntegration } from "../integrations/email.integration";

export class EmailWorker {
  constructor(
    private readonly db: Db,
    connection: string,
    private readonly emailIntegration: EmailIntegration,
  ) {
    new Worker("emails", async (job) => this.process(job), {
      connection: {
        url: connection,
      },
    });
  }
  process = async (job: Job<any, any, string>) => {
    logger.info(`📬 [EmailWorker] Processing job: ${job.name}`);

    switch (job.name) {
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
