import { Config } from "@/config";
import { Domain } from "@/domain/domain";
import { Db } from "..";
import { Job, Worker } from "bullmq";
import { logger } from "@/lib/logger";
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
        logger.info(`[release] Releasing edition ${editionNumber}`);
        await this.domain.editions.releaseEdition(editionNumber);
        this.domain.notifications
          .sendEditionReleaseEmails(editionNumber)
          .catch((err) => {
            logger.error(
              `[EmailWorker] Failed to send edition release emails for edition=${editionNumber}`,
            );
          });
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
