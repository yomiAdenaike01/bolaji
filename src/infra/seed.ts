import { logger } from "@/lib/logger";
import { Db } from ".";
import { PlanType } from "@/generated/prisma/client";

const ensureDefaultPlans = async (db: Db) => {
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

export const seed = async (db: Db) => {
  await ensureDefaultPlans(db);
};
