import { Edition, EditionAccess } from "@/generated/prisma/client";
import {
  AccessStatus,
  EditionStatus,
  Hub,
  PlanType,
} from "@/generated/prisma/enums";
import { Db, Store, TransactionClient } from "@/infra";
import { JobsQueues } from "@/infra/workers/jobs-queue";
import { logger } from "@/lib/logger";
import { longFormatters, startOfToday } from "date-fns";

type DbUserAccess = {
  userId: string;
  subscriptionId: string | null;
  id: string;
  status: AccessStatus;
  editionId: string;
  unlockedAt: Date | null;
  unlockAt: Date | null;
  grantedAt: Date;
  expiresAt: Date | null;
  accessType: PlanType;
};

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
  private readonly EDITIONS_ACCESS_TTL = 60 * 60 * 24;
  constructor(
    private readonly db: Db,
    private readonly store: Store,
    private readonly jobQueues: JobsQueues,
  ) {}

  /**
   * Fetch a user's edition access list.
   * Unlocks due editions in one batch update, then returns updated data.
   */
  getUserEditionAccess = async (
    userId: string,
    planTypes: PlanType | PlanType[],
  ) => {
    const cacheKey = `editionAccess:${userId}`;
    const now = new Date();

    const cached = await this.store.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as ({
          id: string;
          userId: string;
          editionId: string;
          unlockedAt: Date | null;
          unlockAt: Date | null;
          status: AccessStatus;
          subscriptionId: string | null;
          grantedAt: Date;
          expiresAt: Date | null;
          accessType: PlanType;
        } & {
          edition: Edition | null;
        })[];
      } catch {}
    }

    const activeAccess = (await this.db.editionAccess.findMany({
      where: {
        userId,
        status: AccessStatus.ACTIVE,
        accessType: {
          in: Array.isArray(planTypes) ? planTypes : [planTypes],
        },
      },
      include: {
        edition: true,
      },
      orderBy: { edition: { number: "asc" } },
    })) as (EditionAccess & { edition: Edition | null })[];

    const releasedAccess = activeAccess.filter((a) =>
      a.edition?.releaseDate
        ? a.edition.releaseDate <= now || a.edition.readyForRelease
        : true,
    );

    await this.cacheEditionAccess(userId, releasedAccess);

    return releasedAccess;
  };
  invalidateEditionAccess = async (userId: string) => {
    logger.info(
      `[Edition Service]: Invalidating edition access userId=${userId}`,
    );
    return this.store.expire(`editionAccess:${userId}`, -1);
  };
  private getReleaseEditionTransaction = async (
    tx: TransactionClient,
    editionNumber: number,
  ) => {
    const now = new Date();

    const edition = await tx.edition.update({
      where: {
        number: editionNumber,
        status: {
          notIn: [EditionStatus.ACTIVE, EditionStatus.CLOSED],
        },
      },
      data: {
        status: EditionStatus.ACTIVE,
        releasedAt: now,
        updatedAt: now,
      },
    });

    if (!edition) throw new Error(`Edition ${editionNumber} not found`);

    logger.info(
      `[Edition Service] Edition ${editionNumber} status updated ${edition.code} to - ${edition.status}.`,
    );

    const userAccess = await tx.editionAccess.updateManyAndReturn({
      where: {
        editionId: edition.id,
        status: AccessStatus.SCHEDULED,
      },
      data: {
        status: AccessStatus.ACTIVE,
        unlockedAt: now,
      },
      select: {
        accessType: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (userAccess.length === 0) {
      return {
        edition,
        unlocked: userAccess.length,
        affectedUsers: [],
        userAccessData: null,
      };
    }

    const affectedUsers = userAccess.filter(
      (u) => u.user && Object.values(u.user).every(Boolean),
    );

    const userEditionsAccess = await tx.editionAccess.findMany({
      where: {
        userId: { in: affectedUsers.map((a) => a.user.id) },
        status: AccessStatus.ACTIVE,
        expiresAt: { gt: now },
      },
      include: { edition: true },
      orderBy: { edition: { number: "asc" } },
    });

    const userAccessData = new Map<string, EditionAccess[]>();

    for (const access of userEditionsAccess) {
      if (!userAccessData.has(access.userId)) {
        userAccessData.set(access.userId, []);
      }
      userAccessData.get(access.userId)!.push(access);
    }

    return {
      edition,
      unlocked: affectedUsers.length,
      affectedUsers,
      userAccessData,
    };
  };

  private releaseEdition = async (editionNumber: number) => {
    logger.info(`[EditionsService] Starting Edition:${editionNumber} release`);
    const result = await this.db.$transaction((tx) =>
      this.getReleaseEditionTransaction(tx, editionNumber),
    );

    if (!result) {
      logger.info(
        {
          editionNumber,
          reason: "Edition already ACTIVE or CLOSED — no unlocks performed",
        },
        "[EditionService] No-op: edition release skipped",
      );
      return;
    }

    const { edition, unlocked, affectedUsers, userAccessData } = result;

    logger.info(
      `[EditionsService] ✅ Edition ${edition.title} → ${edition.status} — ${unlocked} user accesses unlocked`,
    );

    if (
      affectedUsers.length === 0 ||
      !userAccessData ||
      userAccessData?.size === 0
    ) {
      logger.info(
        { editionNumber },
        "[EditionsService] No users had updated access — skipping cache invalidation",
      );
      return affectedUsers;
    }

    logger.info(
      {
        editionNumber,
        affectedUsers: affectedUsers.length,
      },
      "[EditionsService] 🧹 Clearing editionAccess cache for affected users",
    );

    const batchSize = 100;
    const cachedAccessIds = affectedUsers.filter(
      (user) => user.accessType !== PlanType.PHYSICAL,
    );
    for (let i = 0; i < cachedAccessIds.length; i += batchSize) {
      const batch = cachedAccessIds.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async ({ user }) => {
          const { id } = user;
          const userAccess = userAccessData?.get(id);
          if (!userAccess) return;
          try {
            await this.cacheEditionAccess(id, userAccess);
          } catch (err) {
            logger.error(
              err,
              `[EditionsService] Failed to refresh cache for user=${id}`,
            );
          }
        }),
      );
    }

    logger.info(
      {
        editionNumber,
        clearedUsers: affectedUsers.length,
      },
      `[EditionsService] Sucessfully cached edition access users=${affectedUsers.map((u) => u.user.id).join(",")}complete`,
    );
    return affectedUsers;
  };

  cacheEditionAccess = (id: string, userAccess: DbUserAccess[]) => {
    return this.store.setEx(
      `editionAccess:${id}`,
      this.EDITIONS_ACCESS_TTL,
      JSON.stringify(userAccess),
    );
  };

  getUserScheduledEditionAccess = async (
    userId: string,
    planTypes: PlanType | PlanType[],
  ) => {
    const now = new Date();

    const where: any = {
      userId,
      status: AccessStatus.SCHEDULED,
      expiresAt: { gt: now },
    };

    if (Array.isArray(planTypes)) {
      where.OR = planTypes.map((type) => ({ accessType: type }));
    } else {
      where.accessType = planTypes;
    }

    const scheduledAccess = (await this.db.editionAccess.findMany({
      where,
      include: { edition: true },
      orderBy: { edition: { releaseDate: "asc" } },
    })) as (EditionAccess & { edition: Edition | null })[];

    return scheduledAccess;
  };

  releasePendingOrSpecificEdition = async (editionNum?: number) => {
    const today = startOfToday();
    const nextEdition = await this.db.edition.findFirst({
      where: editionNum
        ? {
            number: editionNum,
            status: {
              not: { in: [EditionStatus.ACTIVE, EditionStatus.CLOSED] },
            },
          }
        : {
            readyForRelease: true,
            releaseDate: { gte: today },
            OR: [
              { status: EditionStatus.PENDING },
              { status: EditionStatus.PREORDER_OPEN },
            ],
          },
      orderBy: { number: "asc" },
    });

    if (!nextEdition) {
      logger.info("[EditionsService]: No pending editions left to release.");
      return;
    }

    logger.info(
      `[EditionsService]: Releasing next edition: ${nextEdition.title}`,
    );
    return {
      affectedUsers: await this.releaseEdition(nextEdition.number),
      nextEdition,
    };
  };
}
