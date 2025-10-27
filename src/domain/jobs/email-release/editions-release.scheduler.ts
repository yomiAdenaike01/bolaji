import { logger } from "@/lib/logger";
import { Worklet } from "@/types/worklet";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export class EditionsReleaseSchedule {
  private scheduler: Queue<any, any, string, any, any, string>;
  private readonly queueId = "process-edition-release";
  constructor(connection: IORedis, worker: Worklet) {
    worker.init(this.queueId, connection);
    logger.info(`Initialising scheduler queueId=${this.queueId}...`);
    this.scheduler = new Queue("editions-release", { connection });
    this.start();
  }
  private start = async () => {
    await this.scheduler.upsertJobScheduler(
      this.queueId,
      {
        pattern: "0 9 16 * *", // 9am 16th each month
        tz: "Europe/London",
      },
      {
        name: "process-edition-release",
        data: {},
        opts: {
          removeOnFail: true,
          attempts: 3,
        },
      },
    );
  };
}
