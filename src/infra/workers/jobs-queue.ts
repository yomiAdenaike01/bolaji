import { Queue } from "bullmq";
import IORedis from "ioredis";
export class JobsQueues {
  private emailQueue: Queue<any, any, string, any, any, string>;
  private renewalQueue: Queue<any, any, string, any, any, string>;
  constructor(connectionUrl: string) {
    this.emailQueue = new Queue("emails", {
      connection: {
        url: connectionUrl,
      },
    });
    this.renewalQueue = new Queue("renewable", {
      connection: {
        url: connectionUrl,
      },
    });
  }

  add = async (jobName: string, data: any, options?: any) => {
    const [queueName] = jobName.split(".");
    const targetQueue =
      queueName === "renewal" ? this.renewalQueue : this.emailQueue;

    return targetQueue.add(jobName, data, {
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      ...options,
    });
  };
}
