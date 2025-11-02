import { AccessStatus, EditionStatus, Hub } from "@/generated/prisma/enums";
import { Db, Store } from "@/infra";
import { JobsQueues } from "@/infra/workers/jobs-queue";
import { isBefore } from "date-fns";

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
        status: "ACTIVE",
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
}
