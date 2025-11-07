import {
  EDITION_00_RELEASE,
  EDITION_01_RELEASE,
  PREORDER_OPENING_DATETIME,
} from "@/constants";
import { logger } from "@/lib/logger";
import { JobsOptions, Queue } from "bullmq";
import { differenceInMilliseconds, addHours } from "date-fns";

/**
 * Centralized BullMQ queue manager
 * Handles email, payment, and edition jobs with production-safe scheduling.
 */
export class JobsQueues {
  private emailQueue: Queue;
  private stripePaymentsQueue: Queue;
  private editionReleasesQueue: Queue;

  constructor(private readonly connectionUrl: string) {
    this.emailQueue = new Queue("emails", {
      connection: { url: this.connectionUrl },
      defaultJobOptions: {
        removeOnComplete: { age: 86400, count: 5000 },
        removeOnFail: { age: 172800, count: 5000 },
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
      },
    });

    this.stripePaymentsQueue = new Queue("payments", {
      connection: { url: this.connectionUrl },
      defaultJobOptions: {
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
      },
    });

    this.editionReleasesQueue = new Queue("editions", {
      connection: { url: this.connectionUrl },
      defaultJobOptions: {
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
      },
    });

    void this.init();
  }

  private async init() {
    await this.addPreorderOpeningJob({ waitlist: [] });
    await this.addSendPreorderReminderJob();
    await this.queueReleaseJobs();
    await this.queueAdminDigestJobs();
  }

  public readonly getEmailQueue = () => this.emailQueue;
  public readonly getPaymentsQueue = () => this.stripePaymentsQueue;
  public readonly getEditionsQueue = () => this.editionReleasesQueue;

  private async addIfFuture(
    queue: Queue,
    jobName: string,
    date: Date,
    data: any = {},
    options?: JobsOptions,
  ) {
    const now = new Date();

    if (now >= date) {
      logger.info(
        `[Scheduler] ⏭️ Skipping ${jobName} — scheduled date (${date.toISOString()}) has already passed.`,
      );
      return;
    }

    const jobId = `${jobName}-${date.toISOString()}`;
    const existing = await queue.getJob(jobId);
    if (existing) {
      logger.info(
        `[Scheduler] ${jobName} already exists (id=${jobId}) — skipping.`,
      );
      return;
    }

    const delay = Math.max(differenceInMilliseconds(date, now), 0);

    await queue.add(jobName, data, {
      jobId,
      delay,
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      ...options,
    });

    logger.info(`[Scheduler] ✅ Queued ${jobName} for ${date.toISOString()}`);
  }

  private async addPreorderOpeningJob(data: {
    waitlist: Array<{ email: string; name: string }>;
  }) {
    const releaseDate = PREORDER_OPENING_DATETIME;
    await this.addIfFuture(
      this.emailQueue,
      "email.preorders_open",
      releaseDate,
      data,
    );
  }

  private async addSendPreorderReminderJob() {
    const reminder = new Date("2025-11-08T09:00:00Z"); // 9 AM UTC (10 AM UK)
    await this.addIfFuture(
      this.emailQueue,
      "email.preorder_reminder",
      reminder,
    );
  }

  private async queueReleaseJobs() {
    logger.info("[Scheduler] Checking edition release jobs...");

    const now = new Date();

    // Edition 00 release (preorder/limited)
    await this.addIfFuture(
      this.editionReleasesQueue,
      "edition-00",
      EDITION_00_RELEASE,
      {
        edition: "00",
      },
    );

    // Edition 01 release
    await this.addIfFuture(
      this.editionReleasesQueue,
      "edition-01",
      EDITION_01_RELEASE,
      {
        edition: "01",
      },
    );

    // Monthly repeating edition auto-release
    await this.editionReleasesQueue.add(
      "edition-monthly",
      { task: "auto-release-next-edition" },
      {
        repeat: { pattern: "0 9 1 * *" }, // every 1st of month at 9:00 UTC
        jobId: "monthly-edition-release",
        removeOnComplete: true,
      },
    );

    logger.info("[Scheduler] Edition release jobs check complete ✅");
  }

  private async queueAdminDigestJobs() {
    logger.info("[Scheduler] Scheduling admin subscriber digest emails...");

    const startGate = addHours(PREORDER_OPENING_DATETIME, 5); // 5h after preorder open
    const now = new Date();

    const delay = Math.max(differenceInMilliseconds(startGate, now), 0);

    // Morning digest
    await this.emailQueue.add(
      "email.admin_subscriber_digest",
      { timeOfDay: "morning" },
      {
        jobId: "admin-subscriber-digest-morning",
        repeat: { pattern: "0 8 * * *" }, // 08:00 UTC daily
        removeOnComplete: true,
        delay,
      },
    );

    // Night digest
    await this.emailQueue.add(
      "email.admin_subscriber_digest",
      { timeOfDay: "night" },
      {
        jobId: "admin-subscriber-digest-night",
        repeat: { pattern: "0 20 * * *" }, // 20:00 UTC daily
        removeOnComplete: true,
        delay,
      },
    );

    logger.info(
      `[Scheduler] Admin digests gated until ${startGate.toISOString()} — will begin after gate time.`,
    );
  }

  // ----------------------------
  // Generic job adder
  // ----------------------------
  public readonly add = async (
    jobName: string,
    data: any,
    options?: JobsOptions,
  ) => {
    const [queuePrefix] = jobName.split(".");
    const targetQueue =
      queuePrefix === "payment"
        ? this.stripePaymentsQueue
        : queuePrefix === "email"
          ? this.emailQueue
          : queuePrefix === "edition"
            ? this.editionReleasesQueue
            : null;

    if (!targetQueue) {
      logger.warn(`[JobsQueues] ❌ No matching queue for job=${jobName}`);
      return;
    }

    const job = await targetQueue.add(jobName, data, {
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      ...options,
    });

    logger.info(
      `[JobsQueues] Queued job ${job.name} (${targetQueue.name}) -> id=${job.id}`,
    );
    return job;
  };
}
