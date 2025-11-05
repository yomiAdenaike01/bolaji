import { EditionStatus, Hub, OrderStatus, PlanType } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";
import { Db, Store, TransactionClient } from ".";
import {
  EDITION_00_REMANING_CACHE_KEY,
  PREORDER_CLOSING_DATETIME,
  PREORDER_EDITION_MAX_COPIES,
  PREORDER_OPENING_DATETIME,
} from "@/constants";
import { log } from "node:console";

const ensureDefaultPlans = async (db: TransactionClient) => {
  const DEFAULT_PLANS = [
    {
      type: PlanType.FULL,
      name: "Full Access (Digital + Physical)",
      priceCents: 2499,
      currency: "GBP",
    },
    {
      type: PlanType.PHYSICAL,
      name: "Physical Edition Subscription",
      priceCents: 1499,
      currency: "GBP",
    },
    {
      type: PlanType.DIGITAL,
      name: "Digital Access Subscription",
      priceCents: 999,
      currency: "GBP",
    },
  ];
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
  logger.info("🌱 Seeding Editions");

  // Edition 00 (Preorder Edition)
  const edition = await db.edition.upsert({
    where: { number: 0 },
    update: {},
    create: {
      number: 0,
      hub: Hub.HUB1,
      code: "ED00",
      title: "Edition 00 — Preorder",
      status: EditionStatus.PENDING,
      releaseDate: PREORDER_OPENING_DATETIME,
      preorderOpenAt: PREORDER_OPENING_DATETIME,
      preorderCloseAt: PREORDER_CLOSING_DATETIME,
      createdAt: new Date(),
      maxCopies: PREORDER_EDITION_MAX_COPIES,
    },
  });
  const totalFuture = 12;


  const futureSeeds = Array.from({ length: totalFuture }, (_, i) => {
    const number = i + 1; // starts at 1
    const padded = String(number).padStart(2, "0"); // "01", "02", ...
    const hub = number <= 6 ? Hub.HUB1 : Hub.HUB2;
    logger.info(`🌱 Seeding edition ED${padded}...`);
    const prom = db.edition.upsert({
      where: { number },
      update: {},
      create: {
        number,
        hub,
        code: `ED${padded}`,
        title: `Edition ${padded}`,
        status: EditionStatus.PENDING,
        createdAt: new Date(),
      },
    });
    return prom;
  });

  await Promise.all(futureSeeds);

  logger.info(`✅ Seeded Editions complete`);
  return edition;
};


 async function initializeEditionStock(
  db: Db,
  store: Store,
  preorderEdition: { id: string; maxCopies: number | null }
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
      `[Stock Init] 🔄 Updated Redis stock: ${remaining} remaining (Max: ${maxCopies}, Reserved: ${totalReserved})`
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
   await initializeEditionStock(db,store, preorderEdition)
  logger.info('[Seed] ✅ Seeding complete')
};
