import { logger } from "@/lib/logger";
import { Queue } from "bullmq";
export class JobsQueues {
  private emailQueue: Queue<any, any, string, any, any, string>;
  private stripePaymentsQueue: Queue<any, any, string, any, any, string>;
  editionsQueue: Queue<any, any, string, any, any, string>;
  constructor(connectionUrl: string) {
    this.emailQueue = new Queue("emails", {
      connection: {
        url: connectionUrl,
      },
    });
    this.stripePaymentsQueue = new Queue("payments", {
      connection: {
        url: connectionUrl,
      },
    });
    this.editionsQueue = new Queue("editions", {
      connection: {
        url: connectionUrl,
      },
    });
  }

  add = async (jobName: string, data: any, options?: any) => {
    const [queueName] = jobName.split(".");
    const targetQueue = {
      payment: this.stripePaymentsQueue,
      email: this.emailQueue,
    }[queueName];

    if (!targetQueue) {
      logger.error(
        `[Jobs Queue] Failed to add job queue not found queue=${queueName}`,
      );
      return;
    }

    return targetQueue.add(jobName, data, {
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      ...options,
    });
  };
}
