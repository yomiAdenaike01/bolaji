import { Db } from "@/infra";
import { EmailIntegration } from "@/infra/integrations/email.integration";
import { Job, Worker } from "bullmq";
import IORedis from "ioredis";
import { Worklet } from "@/types/worklet";
import { EmailType } from "@/infra/integrations/email-types";
import { logger } from "@/lib/logger";

export class EditionsReleaseWorker implements Worklet {
  constructor(
    private readonly db: Db,
    private readonly emailIntegration: EmailIntegration,
  ) {}

  init = (queueId: string, connection: IORedis) => {
    logger.info(`Intialised worker queue=${queueId}`);
    new Worker(queueId, this.process, {
      connection,
    });
  };
  process = async (job: Job<any, any, string>) => {
    logger.info("🎉 Starting edition release job...");

    // 1️⃣ Get the latest released edition
    const latestEdition = await this.db.edition.findFirst({
      where: { releaseDate: { lte: new Date() } },
      orderBy: { releaseDate: "desc" },
    });

    if (!latestEdition) {
      logger.warn("No released edition found — skipping email send.");
      return;
    }

    // 2️⃣ Fetch all subscribed users
    const users = await this.db.user.findMany({
      where: {
        subscriptions: {
          some: { status: "ACTIVE" },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    if (!users.length) {
      logger.warn("No active subscribers found to notify.");
      return;
    }

    // 3️⃣ Send emails in parallel (with Promise.allSettled)
    logger.info(
      `Sending "${latestEdition.code}" release emails to ${users.length} users...`,
    );

    const results = await Promise.allSettled(
      users.map((user) =>
        this.emailIntegration.sendEmail({
          email: user.email,
          type: EmailType.NEW_EDITION_RELEASED,
          content: {
            name: user.name ?? "Reader",
            editionTitle: latestEdition.title,
            editionCode: latestEdition.code,
            editionLink: `https://bolaji.studio/editions/${latestEdition.code}`,
          },
        }),
      ),
    );

    // 4️⃣ Log summary
    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failedCount = results.length - successCount;

    logger.info(
      `✅ Edition release job complete — sent: ${successCount}, failed: ${failedCount}`,
    );

    return { successCount, failedCount };
  };
}
