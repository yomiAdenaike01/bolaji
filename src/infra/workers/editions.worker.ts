import { Config } from "@/config";
import { Domain } from "@/domain/domain";
import { Db } from "..";
import { Job, Worker } from "bullmq";
import { logger } from "@/lib/logger";
import { EmailType } from "../integrations/email-types";
export class ReleaseWorker {
  constructor(
    private readonly config: Config,
    private readonly domain: Domain,
    private readonly db: Db,
  ) {
    const worker = new Worker("editions", async (job) => this.process(job), {
      connection: {
        url: this.config.redisConnectionUrl,
      },
    });
  }

  private async process(job: Job) {
    switch (job.name) {
      case "edition-01": {
        let editionNumber = 0;
        try {
          const result = await this.domain.editions.releaseNextPendingEdition();

          if (!result) {
            return;
          }

          const { nextEdition, affectedUsers } = result;

          if (!affectedUsers) {
            logger.info(
              "[release] No affected users found. No notifications are required",
            );
            return;
          }

          editionNumber = nextEdition.number;

          await this.domain.notifications.sendEditionReleaseEmails({
            editionNumber,
            users: affectedUsers,
            emailType: EmailType.NEW_EDITION_RELEASED,
          });
          logger.info(
            `[release] Edition ${editionNumber} emails sent successfully.`,
          );
        } catch (err) {
          logger.error(
            err,
            `[release] Failed to release edition=${editionNumber}`,
          );
        }

        break;
      }

      case "edition-monthly": {
        logger.info(`[release] Running monthly auto-release`);
        await this.domain.editions.releaseNextPendingEdition();
        break;
      }

      default:
        logger.warn(`[release] Unknown job name: ${job.name}`);
    }
  }
}
