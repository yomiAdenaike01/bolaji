import {
  EditionStatus,
  Hub,
  OrderStatus,
  PlanType,
} from "@/generated/prisma/client";
import { logger } from "@/lib/logger";
import { Db, Store, TransactionClient } from ".";
import {
  DEFAULT_PLANS,
  EDITION_00_RELEASE,
  EDITION_00_REMANING_CACHE_KEY,
  EDITION_01_RELEASE,
  PREORDER_CLOSING_DATETIME,
  PREORDER_EDITION_MAX_COPIES,
  PREORDER_OPENING_DATETIME,
} from "@/constants";
import { padNumber } from "@/utils";

const ensureDefaultPlans = async (db: TransactionClient) => {
  logger.info("🔍 Checking for default subscription plans in database...");
  for (const plan of DEFAULT_PLANS) {
    const existing = await db.subscriptionPlan.findFirst({
      where: { type: plan.type },
    });

    if (existing) {
      logger.info(`✅ Found existing plan: ${plan.type}`);
      continue;
    }

    await db.subscriptionPlan.create({
      data: {
        name: plan.name,
        type: plan.type,
        interval: "MONTH",
        priceCents: plan.priceCents,
        currency: plan.currency,
        active: true,
      },
    });

    logger.info(`🆕 Created missing default plan: ${plan.type}`);
  }

  logger.info("✅ All default subscription plans verified in DB.");
};

const ensureEditions = async (db: TransactionClient) => {
  const isProd = process.env.NODE_ENV === "production";
  logger.info("🌱 Ensuring Editions");

  // ───────────────────────────────────────────────
  // Edition 00 — Preorder Edition
  // ───────────────────────────────────────────────
  const edition00 = await db.edition.upsert({
    where: { number: 0 },
    update: {
      ...(process.env.NODE_ENV !== "production" && {
        title: "Edition 00 — Preorder",
        status: EditionStatus.PENDING,
        releaseDate: EDITION_00_RELEASE,
        preorderOpenAt: PREORDER_OPENING_DATETIME,
        preorderCloseAt: PREORDER_CLOSING_DATETIME,
        maxCopies: PREORDER_EDITION_MAX_COPIES,
        hub: Hub.HUB1,
        updatedAt: new Date(),
      }),
    },
    create: {
      number: 0,
      hub: Hub.HUB1,
      code: "ED00",
      title: "Edition 00 — Preorder",
      status: EditionStatus.PENDING,
      releaseDate: EDITION_00_RELEASE,
      preorderOpenAt: PREORDER_OPENING_DATETIME,
      preorderCloseAt: PREORDER_CLOSING_DATETIME,
      createdAt: new Date(),
      maxCopies: PREORDER_EDITION_MAX_COPIES,
    },
  });

  // ───────────────────────────────────────────────
  // Future Editions (01 → 12)
  // ───────────────────────────────────────────────
  const totalFuture = 12;

  for (let i = 1; i <= totalFuture; i++) {
    const padded = padNumber(i);
    const hub = i <= 6 ? Hub.HUB1 : Hub.HUB2;
    const releaseDate = i === 1 ? EDITION_01_RELEASE : null;

    const existing = await db.edition.findUnique({ where: { number: i } });

    // 🚫 Skip if edition exists and is finalized in prod
    if (
      isProd &&
      existing &&
      ([EditionStatus.ACTIVE, EditionStatus.CLOSED] as any).includes(
        existing.status,
      )
    ) {
      logger.info(
        `⏭️ Skipping Edition ${i} — already finalized (${existing.status})`,
      );
      continue;
    }

    if (existing) {
      if (isProd) {
        logger.info(`✅ Edition ${i} already exists — no overwrite`);
        continue;
      }

      // dev-safe update
      await db.edition.update({
        where: { number: i },
        data: {
          hub,
          code: `ED${padded}`,
          title: `Edition ${padded}`,
          status: EditionStatus.PENDING,
          releaseDate,
          updatedAt: new Date(),
        },
      });
    } else {
      await db.edition.create({
        data: {
          number: i,
          hub,
          code: `ED${padded}`,
          title: `Edition ${padded}`,
          status: EditionStatus.PENDING,
          releaseDate,
          createdAt: new Date(),
        },
      });
    }

    logger.info(`✅ Ensured Edition ${i} (${isProd ? "safe" : "updated"})`);
  }

  logger.info("✅ Editions ensured safely");
  return edition00;
};

async function initializeEditionStock(
  db: Db,
  store: Store,
  preorderEdition: { id: string; maxCopies: number | null },
) {
  logger.info("[Stock Init] Checking preorder edition stock...");

  const edition0Id = preorderEdition.id;
  const maxCopies = preorderEdition.maxCopies || PREORDER_EDITION_MAX_COPIES;

  // 🧮 Sum total quantity of PAID orders tied to physical/full preorders
  const paidOrders = await db.order.aggregate({
    where: {
      editionId: edition0Id,
      status: OrderStatus.PAID,
      // The order may come from a preorder of type physical/full
      preorder: {
        choice: { in: [PlanType.PHYSICAL, PlanType.FULL] },
      },
    },
    _sum: {
      quantity: true,
    },
  });

  const totalReserved = (paidOrders._sum as any).quantity ?? 0;
  const remaining = Math.max(maxCopies - totalReserved, 0);

  // 🧠 Check existing cache
  const existing = await store.get(EDITION_00_REMANING_CACHE_KEY);
  const existingNum = existing ? Number(existing) : null;

  if (existingNum !== remaining) {
    await store.set(EDITION_00_REMANING_CACHE_KEY, remaining);
    logger.info(
      `[Stock Init] 🔄 Updated Redis stock: ${remaining} remaining (Max: ${maxCopies}, Reserved: ${totalReserved})`,
    );
  } else {
    logger.info("[Stock Init] ✅ Cache already up to date.");
  }

  return remaining;
}

export const seed = async (db: Db, store: Store) => {
  const preorderEdition = await db.$transaction(async (tx) => {
    const [, edition00] = await Promise.all([
      ensureDefaultPlans(tx),
      ensureEditions(tx),
    ]);
    return edition00;
  });
  await initializeEditionStock(db, store, preorderEdition);
  logger.info("[Seed] ✅ Seeding complete");
};
