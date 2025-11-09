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
      case "edition-00":
      case "edition-01": {
        const editionNumber = Number(job.data.edition);
        try {
          logger.info(
            `[release] Starting release for edition ${editionNumber}`,
          );

          const affectedUsers =
            await this.domain.editions.releaseEdition(editionNumber);

          if (!affectedUsers?.[0]) {
            logger.info(
              "[EditionsWorker] No affected users found, notifications are not required",
            );
            return;
          }

          await this.domain.notifications.sendEditionReleaseEmails({
            editionNumber,
            users: affectedUsers,
            emailType: EmailType.EDITION_00_DIGITAL_RELEASE, // Handle 01 release
          });
          logger.info(
            `[release] Edition ${editionNumber} emails sent successfully.`,
          );
        } catch (err) {
          logger.error(
            err,
            `[EditionsWorker] Failed to release edition=${editionNumber}`,
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
