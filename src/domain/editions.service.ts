import { AccessStatus, EditionStatus, Hub } from "@/generated/prisma/enums";
import { Db, Store } from "@/infra";
import { JobsQueues } from "@/infra/workers/jobs-queue";
import { isBefore } from "date-fns";

export type UserEditionAccess = {
  user: {
    name: string | null;
    email: string;
  };
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
  status: AccessStatus;
  userId: string;
  editionId: string;
  unlockedAt: Date | null;
  unlockAt: Date;
  subscriptionId: string | null;
  grantedAt: Date;
  expiresAt: Date;
};

export class EditionsService {
  readonly CACHE_TTL_SECONDS = 600;
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
        return JSON.parse(cached);
      } catch {}
    }

    // 2️⃣ One transaction, two SQL statements total
    const { updatedAccess, toUnlock } = await this.db.$transaction(
      async (tx) => {
        // (1) Bulk unlock in a single query
        const toUnlock = await tx.editionAccess.updateMany({
          where: {
            userId,
            status: AccessStatus.SCHEDULED,
            unlockAt: { lte: now },
          },
          data: {
            status: AccessStatus.ACTIVE,
            unlockedAt: now,
          },
        });

        // (2) Fetch all updated access records (joined to edition)
        const updatedAccess = await tx.editionAccess.findMany({
          where: { userId },
          include: {
            edition: true,
            user: { select: { email: true, name: true } },
          },
          orderBy: { edition: { number: "asc" } },
        });

        return { updatedAccess, toUnlock };
      },
    );

    // 3️⃣ Send unlock emails asynchronously (optional)
    if (toUnlock.count > 0) {
      // We don't know *which* were updated from updateMany directly,
      // but you can select them by unlockedAt === now if needed.
      const unlockedNow = updatedAccess.filter(
        (a) =>
          a.status === AccessStatus.ACTIVE &&
          a.unlockedAt &&
          isBefore(new Date(a.unlockedAt), new Date(now.getTime() + 1000)),
      );

      for (const a of unlockedNow) {
        const user = a.user;
        if (!user?.email) continue;
        this.jobQueues.add("email.new_edition_release", a);
        // sendEmail({
        //   to: user.email,
        //   subject: `Your Bolaji Edition ${a.edition.number} is now live ✨`,
        //   html: `
        //     <h2>Edition ${a.edition.number} is now unlocked</h2>
        //     <p>Hi ${user.name || "there"},</p>
        //     <p>You can now access your Bolaji Edition ${
        //       a.edition.number
        //     }.</p>
        //     <p><a href="https://bolaji-editions.framer.website/login">Access Now →</a></p>
        //   `,
        // }).catch((err) =>
        //   console.error("❌ Failed to send unlock email:", err.message)
        // );
      }
    }

    // 4️⃣ Cache for fast retrieval
    await this.store.setex(
      cacheKey,
      this.CACHE_TTL_SECONDS,
      JSON.stringify(updatedAccess),
    );

    return updatedAccess;
  };
}
