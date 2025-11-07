import {
  EDITION_00_RELEASE,
  EDITION_01_RELEASE,
  PREORDER_OPENING_DATETIME,
} from "@/constants";
import { logger } from "@/lib/logger";
import { JobsOptions, Queue } from "bullmq";
import { randomUUID } from "crypto";
import { add, addHours, differenceInMilliseconds, sub } from "date-fns";

/**
 * Centralized BullMQ queue manager
 * Handles email, payment, and edition jobs with production-safe settings.
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

    // Initialize scheduled jobs
    this.addPreorderOpeningJob({ waitlist: [] });
    this.addSendPreorderReminderJob();
    this.queueReleaseJobs();
    this.queueAdminDigestJobs();
  }

  // ----------------------------
  // Public queue getters
  // ----------------------------
  public readonly getEmailQueue = () => this.emailQueue;
  public readonly getPaymentsQueue = () => this.stripePaymentsQueue;
  public readonly getEditionsQueue = () => this.editionReleasesQueue;

  // ----------------------------
  // Scheduled Jobs
  // ----------------------------
  private async queueReleaseJobs() {
    logger.info("[Scheduler] Scheduling edition release jobs...");

    const now = new Date();

    // Edition 00 release (preorder / limited)
    await this.editionReleasesQueue.add(
      "edition-00",
      { edition: "00" },
      {
        jobId: "edition-00",
        removeOnComplete: true,
        delay: Math.max(differenceInMilliseconds(EDITION_00_RELEASE, now), 0),
      },
    );

    // Edition 01 release
    await this.editionReleasesQueue.add(
      "edition-01",
      { edition: "01" },
      {
        jobId: "edition-01",
        removeOnComplete: true,
        delay: Math.max(differenceInMilliseconds(EDITION_01_RELEASE, now), 0),
      },
    );

    // All future monthly editions
    await this.editionReleasesQueue.add(
      "edition-monthly",
      { task: "auto-release-next-edition" },
      {
        repeat: { pattern: "0 9 1 * *" }, // every 1st of month at 9:00 UTC
        jobId: "monthly-edition-release",
      },
    );

    logger.info("[Scheduler] Edition release jobs scheduled ✅");
  }

  private async addSendPreorderReminderJob() {
    const reminder = add(PREORDER_OPENING_DATETIME, { days: 3 });
    const now = new Date();
    const delay = Math.max(differenceInMilliseconds(reminder, now), 0);

    await this.emailQueue.add(
      "email.preorder_reminder",
      {},
      {
        jobId: `email.preorder_reminder-${reminder.toISOString()}`,
        delay,
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
      },
    );

    logger.info(
      `[Scheduler] Scheduled preorder reminder emails for ${reminder.toISOString()}`,
    );
  }

  async addPreorderOpeningJob(data: {
    waitlist: Array<{ email: string; name: string }>;
  }) {
    const releaseDate = PREORDER_OPENING_DATETIME;
    const now = new Date();
    const delay = Math.max(differenceInMilliseconds(releaseDate, now), 0);

    await this.emailQueue.add("email.preorders_open", data, {
      jobId: `email.preorders_open-${releaseDate.toISOString()}`,
      delay,
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
    });

    logger.info(
      `[Scheduler] Scheduled preorder opening email for ${releaseDate.toISOString()}`,
    );
  }

  /**
   * Admin digest: send subscriber + edition report twice daily
   */

  private async queueAdminDigestJobs() {
    logger.info("[Scheduler] Scheduling admin subscriber digest emails...");

    // Gate: do not allow any digest to run before this moment.
    const startGate = addHours(PREORDER_OPENING_DATETIME, 5); // after preorder kick-off
    const now = new Date();
    const delay = Math.max(differenceInMilliseconds(startGate, now), 0);

    // Morning digest — first fire will be the first 08:00 AFTER the gate
    await this.emailQueue.add(
      "email.admin_subscriber_digest",
      { timeOfDay: "morning" },
      {
        jobId: "admin-subscriber-digest-morning",
        repeat: { pattern: "0 8 * * *" }, // 08:00 UTC daily
        removeOnComplete: true,
        delay, // ensures no run before 2025-11-07T09:00Z
      },
    );

    // Night digest — will run 2025-11-07 at 20:00 UTC (same day) and then daily
    await this.emailQueue.add(
      "email.admin_subscriber_digest",
      { timeOfDay: "night" },
      {
        jobId: "admin-subscriber-digest-night",
        repeat: { pattern: "0 20 * * *" }, // 20:00 UTC daily
        removeOnComplete: true,
        delay, // same gate
      },
    );

    logger.info(
      `[Scheduler] Admin digests gated until ${startGate.toISOString()} — night run will begin today at 20:00 UTC; morning starts tomorrow at 08:00 UTC.`,
    );
  }

  // ----------------------------
  // Utility adder
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
      logger.error(`[JobsQueues] No matching queue for job=${jobName}`);
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
