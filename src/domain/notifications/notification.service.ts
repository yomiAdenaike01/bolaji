import { AccessStatus } from "@/generated/prisma/enums";
import { Db } from "@/infra";
import { AdminEmailIntegration } from "@/infra/integrations/admin.email.integration";
import { EmailIntegration } from "@/infra/integrations/email.integration";
import { JobsQueues } from "@/infra/workers/jobs-queue";
import { logger } from "@/lib/logger";

export class NotificationService {
  constructor(
    private readonly customerEmail: EmailIntegration,
    private readonly adminEmail: AdminEmailIntegration,
    private readonly jobQueues: JobsQueues,
    private readonly db: Db,
  ) {}

  sendEditionReleaseEmails = async (editionNumber: number) => {
    const { access, edition } = await this.db.$transaction(async (tx) => {
      const edition = await tx.edition.findUnique({
        where: { number: editionNumber },
        select: { id: true, title: true, code: true },
      });
      if (!edition)
        return {
          edition: null,
          access: [],
        };

      // Fetch all users with ACTIVE access
      const access = await tx.editionAccess.findMany({
        where: {
          editionId: edition.id,
          status: AccessStatus.ACTIVE,
        },
        select: { userId: true, user: { select: { email: true, name: true } } },
      });
      return {
        access,
        edition,
      };
    });

    if (!access.length) {
      logger.info(
        `[Notification Service] No active users for Edition ${editionNumber}`,
      );
      return;
    }

    logger.info(
      `[Notification Service] Queuing ${access.length} release emails for Edition ${editionNumber}`,
    );

    // Batch emails (e.g. 500 per job)
    const batchSize = 500;
    for (let i = 0; i < access.length; i += batchSize) {
      const batch = access.slice(i, i + batchSize);
      await this.jobQueues.add(
        "email.release",
        {
          editionCode: edition?.code,
          editionTitle: edition?.title,
          recipients: batch.map((a) => ({
            email: a.user.email,
            name: a.user.name,
          })),
        },
        {
          removeOnComplete: true,
          attempts: 3,
        },
      );
    }
  };
}
