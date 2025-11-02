import { EditionStatus, PlanType } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";
import { Db, Store, TransactionClient } from ".";
import {
  EDITION_00_REMANING_CACHE_KEY,
  PREORDER_CLOSING_DATETIME,
  PREORDER_EDITION_MAX_COPIES,
  PREORDER_OPENING_DATETIME,
} from "@/constants";

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

const ensurePreorderEdition = async (db: TransactionClient) => {
  logger.info("🌱 Seeding Bolaji Editions");

  // Edition 00 (Preorder Edition)
  const edition = await db.edition.upsert({
    where: { number: 0 },
    update: {},
    create: {
      number: 0,
      code: "EDIT-00",
      title: "Edition 00 — Preorder",
      status: EditionStatus.PENDING, // will automatically open via time check or job
      preorderOpenAt: PREORDER_OPENING_DATETIME,
      preorderCloseAt: PREORDER_CLOSING_DATETIME,
      createdAt: new Date(),
      maxCopies: PREORDER_EDITION_MAX_COPIES,
    },
  });

  logger.info(`✅ Seeded Edition 00 (${edition.code})`);
  return edition;
};

export const seed = async (db: Db, store: Store) => {
  const preorderEdition = await db.$transaction(async (tx) => {
    const [, edition00] = await Promise.all([
      ensureDefaultPlans(tx),
      ensurePreorderEdition(tx),
    ]);
    return edition00;
  });
  await store.set(
    EDITION_00_REMANING_CACHE_KEY,
    preorderEdition.maxCopies || PREORDER_EDITION_MAX_COPIES,
  );
};
