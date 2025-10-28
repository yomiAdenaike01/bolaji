import { Queue } from "bullmq";

export class JobsQueues {
  private emailQueue: Queue<any, any, string, any, any, string>;
  private renewalQueue: Queue<any, any, string, any, any, string>;
  constructor() {
    this.emailQueue = new Queue("emails");
    this.renewalQueue = new Queue("renewable");
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
