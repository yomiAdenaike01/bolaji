import { Db } from "@/infra";
import { Integrations } from "@/infra/integrations";
import {
  CreateSubscriptionInput,
  CreateSubscriptionResult,
  UpdateSubscriptionInput,
} from "./dto";
import crypto from "crypto";
import { SubscriptionStatus } from "@/generated/prisma/enums";
import { logger } from "@/lib/logger";

// TODO: Account for physical and full subscriptions

export class SubscriptionsService {
  constructor(
    private readonly db: Db,
    private readonly integrations: Integrations,
  ) {}

  onSubscriptionUpdate = async (params: UpdateSubscriptionInput) => {
    const {
      subscriptionId,
      stripeSubscriptionId,
      currentPeriodStart,
      currentPeriodEnd,
    } = params;

    // 1️⃣ Run everything inside a transaction for atomicity
    return await this.db.$transaction(async (tx) => {
      // 🔹 Find the existing placeholder subscription
      const existing = await tx.subscription.findUnique({
        where: { id: subscriptionId },
        include: { user: true },
      });

      if (!existing) {
        logger.warn(
          `[SubscriptionsService] No subscription found for ID: ${subscriptionId}`,
        );
        throw new Error(`Subscription not found: ${subscriptionId}`);
      }

      const periodStart = currentPeriodStart
        ? new Date(currentPeriodStart * 1000)
        : new Date();

      const periodEnd = currentPeriodEnd
        ? new Date(currentPeriodEnd * 1000)
        : new Date(
            periodStart.getFullYear(),
            periodStart.getMonth() + 1,
            periodStart.getDate(),
          );

      const [allEditions, unlocked, updated] = await Promise.all([
        tx.edition.findMany({
          orderBy: { number: "asc" },
          select: { id: true, number: true },
        }),
        tx.editionAccess.findMany({
          where: { userId: existing.userId },
          select: { editionId: true },
        }),
        tx.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: SubscriptionStatus.ACTIVE,
            stripeSubscriptionId,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
          },
        }),
      ]);

      const unlockedIds = new Set(unlocked.map((u) => u.editionId));

      const nextEdition = allEditions.find((ed) => !unlockedIds.has(ed.id));

      if (!nextEdition) {
        logger.info(
          `[SubscriptionsService] All editions unlocked for user ${existing.userId}`,
        );
        return updated;
      }

      await tx.editionAccess.upsert({
        where: {
          userId_editionId: {
            userId: existing.userId,
            editionId: nextEdition.id,
          },
        },
        update: {},
        create: {
          userId: existing.userId,
          editionId: nextEdition.id,
          unlockedAt: new Date(),
          subscriptionId: updated.id,
        },
      });

      logger.info(
        `[SubscriptionsService] Subscription ${subscriptionId} activated & edition ${nextEdition.number} unlocked.`,
      );

      return updated;
    });
  };

  createSubscription = async (
    input: CreateSubscriptionInput,
  ): Promise<CreateSubscriptionResult> => {
    // 1️⃣ Fetch user and plan
    const [user, plan] = await Promise.all([
      this.db.user.findUnique({ where: { id: input.userId } }),
      this.db.subscriptionPlan.findUnique({ where: { id: input.planId } }),
    ]);

    if (!user) throw new Error("User not found");
    if (!plan) throw new Error("Plan not found");

    // 2️⃣ Check for existing pending/active subscription (idempotency)
    const existingSub = await this.db.subscription.findFirst({
      where: {
        userId: user.id,
        planId: plan.id,
        status: { in: ["PENDING", "AWAITING_PAYMENT", "ACTIVE"] },
      },
    });

    if (existingSub) {
      // Already has a subscription in progress or active
      if (existingSub.stripeCheckoutSessionId) {
        return {
          checkoutUrl: `https://checkout.stripe.com/pay/${existingSub.stripeCheckoutSessionId}`,
        };
      }
      throw new Error("Subscription already exists for this plan.");
    }

    // 3️⃣ Pre-create a placeholder subscription in DB
    const placeholder = await this.db.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        status: "PENDING",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // 4️⃣ Ensure Stripe Price (lazy-create if missing)
    const priceId = await this.integrations.payments.ensureStripePrice(
      {
        id: plan.id,
        name: plan.name,
        priceCents: plan.priceCents,
        currency: plan.currency,
        interval: plan.interval as any,
        stripePriceId: plan.stripePriceId,
      },
      async (pid) => {
        await this.db.subscriptionPlan.update({
          where: { id: plan.id },
          data: { stripePriceId: pid },
        });
      },
    );

    // 5️⃣ Ensure Stripe Customer
    const customerId = await this.integrations.payments.ensureCustomer(
      {
        userId: user.id,
        email: user.email,
        stripeCustomerId: user.stripeCustomerId,
      },
      async (cid) => {
        await this.db.user.update({
          where: { id: user.id },
          data: { stripeCustomerId: cid },
        });
      },
    );

    // 6️⃣ Create a deterministic idempotency key
    const idempotencyKey = crypto
      .createHash("sha256")
      .update(`sub:${user.id}:${plan.id}`)
      .digest("hex");

    // 7️⃣ Create Stripe Checkout Session (metadata links back to our DB record)
    const { checkoutUrl, stripeCheckoutSessionId } =
      await this.integrations.payments.createSubscriptionCheckout(
        {
          userId: user.id,
          planId: plan.id,
          successUrl: input.redirectUrl,
          cancelUrl: input.redirectUrl,
          stripeCustomerId: customerId,
          priceId,
          trialDays: null,
          subscriptionId: placeholder.id,
        },
        idempotencyKey,
      );

    // 8️⃣ Update placeholder record with Stripe session details
    await this.db.subscription.update({
      where: { id: placeholder.id },
      data: {
        stripeCheckoutSessionId,
        status: SubscriptionStatus.AWAITING_PAYMENT,
      },
    });

    // 9️⃣ Return checkout URL to client
    return { checkoutUrl };
  };
}
