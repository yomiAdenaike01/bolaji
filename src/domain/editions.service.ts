import { AccessStatus, EditionStatus, Hub } from "@/generated/prisma/enums";
import { Db, Store } from "@/infra";
import { JobsQueues } from "@/infra/workers/jobs-queue";
import { logger } from "@/lib/logger";
import { isBefore, subMonths } from "date-fns";

export type UserEditionAccess = ({
  edition: {
    number: number;
    id: string;
    status: EditionStatus;
    createdAt: Date;
    updatedAt: Date;
    code: string;
    title: string;
    releaseDate: Date | null;
    hub: Hub | null;
    isLimited: boolean;
    maxCopies: number | null;
    preorderOpenAt: Date | null;
    preorderCloseAt: Date | null;
    releasedAt: Date | null;
  };
} & {
  id: string;
  userId: string;
  editionId: string;
  unlockedAt: Date | null;
  unlockAt: Date;
  status: AccessStatus;
  subscriptionId: string | null;
  grantedAt: Date;
  expiresAt: Date;
})[];

export class EditionsService {
  private readonly CACHE_TTL_SECONDS = 600;
  constructor(
    private readonly db: Db,
    private readonly store: Store,
    private readonly jobQueues: JobsQueues,
  ) {}

  /**
   * Fetch a user's edition access list.
   * Unlocks due editions in one batch update, then returns updated data.
   */
  getUserEditionAccess = async (userId: string) => {
    const cacheKey = `editionAccess:${userId}`;
    const now = new Date();

    // 1️⃣ Try Redis cache
    const cached = await this.store.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as UserEditionAccess;
      } catch {}
    }

    // 2️⃣ Fetch current valid edition access
    const activeAccess = await this.db.editionAccess.findMany({
      where: {
        userId,
        status: AccessStatus.ACTIVE,
        expiresAt: { gt: now },
      },
      include: {
        edition: true,
      },
      orderBy: { edition: { number: "asc" } },
    });

    // 3️⃣ Filter only released editions
    const releasedAccess = activeAccess.filter((a) =>
      a.edition.releaseDate ? a.edition.releaseDate <= now : true,
    );

    // 4️⃣ Cache for 5 minutes
    await this.store.setEx(
      cacheKey,
      this.CACHE_TTL_SECONDS,
      JSON.stringify(releasedAccess),
    );

    // 5️⃣ Return fresh data
    return releasedAccess;
  };
  releaseEdition = async (editionNumber: number) => {
    const now = new Date();

    const result = await this.db.$transaction(async (tx) => {
      const edition = await tx.edition.findUnique({
        where: { number: editionNumber },
        select: { id: true, title: true, status: true, number: true },
      });

      if (!edition) throw new Error(`Edition ${editionNumber} not found`);

      // already finalized → no-op
      if (
        ([EditionStatus.ACTIVE, EditionStatus.CLOSED] as any).includes(
          edition.status,
        )
      ) {
        logger.info(
          `[Edition Service] Edition ${editionNumber} already ${edition.status}.`,
        );
        return null;
      }

      // ─── Special rule for Edition 00 ───────────────────────────────
      const nextStatus =
        edition.number === 0 ? EditionStatus.CLOSED : EditionStatus.ACTIVE;

      const updatedEdition = await tx.edition.update({
        where: { id: edition.id },
        data: {
          status: nextStatus,
          releasedAt: now,
          updatedAt: now,
        },
      });

      logger.info(
        `[Edition Service] Edition ${editionNumber} status updated from ${edition.status} to - ${updatedEdition.status}.`,
      );

      // Unlock all scheduled access for this edition
      const { count } = await tx.editionAccess.updateMany({
        where: {
          editionId: edition.id,
          status: AccessStatus.SCHEDULED,
          unlockAt: { lte: now },
        },
        data: {
          status: AccessStatus.ACTIVE,
          unlockedAt: now,
        },
      });

      return { edition: updatedEdition, unlocked: count };
    });

    if (!result) return;
    logger.info(
      `[Edition Service] ✅ Edition ${result.edition.title} → ${result.edition.status} — ${result.unlocked} user accesses unlocked`,
    );
  };
  releaseNextPendingEdition = async () => {
    const nextEdition = await this.db.edition.findFirst({
      where: {
        OR: [
          { status: EditionStatus.PENDING },
          { status: EditionStatus.PREORDER_OPEN },
        ],
      },
      orderBy: { number: "asc" },
    });

    if (!nextEdition) {
      logger.info("No pending editions left to release.");
      return;
    }

    logger.info(`Releasing next edition: ${nextEdition.title}`);
    await this.releaseEdition(nextEdition.number);
  };
}
