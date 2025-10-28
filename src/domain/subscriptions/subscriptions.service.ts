import { Db, TransactionClient } from "@/infra";
import { Integrations } from "@/infra/integrations";
import {
  CreateSubscriptionInput,
  CreateSubscriptionResult,
  UpdateSubscriptionInput,
} from "./dto";
import crypto from "crypto";
import {
  OrderStatus,
  OrderType,
  PaymentStatus,
  PlanType,
  ShipmentStatus,
  SubscriptionStatus,
} from "@/generated/prisma/enums";
import { logger } from "@/lib/logger";
import { JobsQueues } from "../../infra/workers/jobs-queue";
import { AdminEmailType } from "@/infra/integrations/email-types";

export class SubscriptionsService {
  constructor(
    private readonly db: Db,
    private readonly integrations: Integrations,
    private readonly queues: JobsQueues,
  ) {}

  private getNextAvaliableEdition = async (
    tx: Db | TransactionClient,
    userId: string,
  ) => {
    const [allEditions, unlocked] = await Promise.all([
      tx.edition.findMany({
        orderBy: { number: "asc" },
        select: { id: true, number: true },
      }),
      tx.editionAccess.findMany({
        where: { userId: userId },
        select: { editionId: true },
      }),
    ]);
    const unlockedIds = new Set(unlocked.map((u) => u.editionId));
    return allEditions.find((ed) => !unlockedIds.has(ed.id));
  };
  onSubscriptionCreate = async ({
    planId,
    userId,
  }: {
    subscriptionId: string;
    planId: string;
    userId: string;
  }) => {
    const [plan, user] = await this.db.$transaction(async (tx) => {
      return Promise.all([
        tx.subscriptionPlan.findUniqueOrThrow({
          where: {
            id: planId,
          },
        }),
        tx.user.findUniqueOrThrow({
          where: {
            id: userId,
          },
        }),
      ]);
    });
    if (!user.name) throw new Error("User not found");
    this.integrations.adminEmail.send({
      type: AdminEmailType.SUBSCRIPTION_STARTED,
      attachReport: true,
      content: {
        plan: plan.type,
        email: user.email,
        name: user.name,
        periodStart: new Date().toISOString(),
        periodEnd: new Date(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
        ).toISOString(),
      },
    });
  };
  onSubscriptionUpdate = async (params: UpdateSubscriptionInput) => {
    const {
      subscriptionId,
      stripeSubscriptionId,
      currentPeriodStart,
      currentPeriodEnd,
      subscriptionPlanId,
      stripeInvoiceId,
      addressId,
    } = params;

    const result = await this.db.$transaction(async (tx) => {
      logger.info(
        "[Subscriptions Service] Fetching existing subscription and plan",
      );
      const [existingSubscription, subscriptionPlan] = await Promise.all([
        tx.subscription.findUniqueOrThrow({
          where: { id: subscriptionId },
          include: { user: true },
        }),
        tx.subscriptionPlan.findUniqueOrThrow({
          where: { id: subscriptionPlanId },
        }),
      ]);

      if (existingSubscription)
        logger.info(
          `[Subscription Service] Existing subscription found id=${existingSubscription.id}`,
        );
      if (subscriptionPlan)
        logger.info(
          `[Subscription Service] Existing subscriptionPlan found id=${subscriptionPlan.id}`,
        );

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
      logger.info(
        "[Subscription Service] Updating subscription, creating new order and payment",
      );
      const [updatedSubscription, newOrder] = await Promise.all([
        tx.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: SubscriptionStatus.ACTIVE,
            stripeSubscriptionId,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
          },
        }),
        tx.order.create({
          data: {
            userId: existingSubscription.userId,
            subscriptionId,
            type: OrderType.SUBSCRIPTION_RENEWAL,
            status: OrderStatus.PAID,
            totalCents: subscriptionPlan.priceCents,
            currency: subscriptionPlan.currency,
          },
        }),
      ]);
      tx.payment.create({
        data: {
          userId: existingSubscription.userId,
          orderId: newOrder.id,
          amountCents: subscriptionPlan.priceCents,
          currency: subscriptionPlan.currency,
          providerPaymentId: stripeInvoiceId ?? `sub_${stripeSubscriptionId}`,
          status: PaymentStatus.SUCCEEDED,
        },
      });
      logger.info(
        `[Subscription Service] Updated subscription ${updatedSubscription.id}`,
      );
      logger.info(`[Subscription Service] Created new order ${newOrder.id}`);

      logger.info("[SubscriptionService] Fetching next edition");
      const nextEdition = await this.getNextAvaliableEdition(
        tx,
        existingSubscription.userId,
      );

      if (!nextEdition) {
        logger.info(
          `[Subscriptions Service] User ${existingSubscription.userId} already has all editions unlocked.`,
        );
        return { updatedSubscription, nextEdition: null };
      }

      logger.info(
        `[Subscriptions Service] Subscription ${subscriptionId} renewed → Edition ${nextEdition.number} unlocked.`,
      );
      // 🔀 For digital plans: unlock next edition
      if (subscriptionPlan.type !== PlanType.PHYSICAL) {
        logger.info(
          `[Subscription Service] Updating edition access for user=${existingSubscription.userId} nextEditionId=${nextEdition.id} nextEditionNumber=${nextEdition.number}`,
        );
        await tx.editionAccess.upsert({
          where: {
            userId_editionId: {
              userId: existingSubscription.userId,
              editionId: nextEdition.id,
            },
          },
          update: {},
          create: {
            userId: existingSubscription.userId,
            editionId: nextEdition.id,
            unlockedAt: new Date(),
            subscriptionId: updatedSubscription.id,
          },
        });
        return;
      }
      if (!addressId) return { updatedSubscription, nextEdition };
      logger.info(
        `[Subscription Service] Creating shipform for userId=${existingSubscription.userId} `,
      );
      await tx.shipment.create({
        data: {
          userId: existingSubscription.userId,
          status: ShipmentStatus.PENDING,
          editionId: nextEdition.id,
          addressId,
        },
      });

      return { updatedSubscription, nextEdition };
    });
    if (!result) return;
    await this.queues.add("email.subscription_renewed", {
      userId: result.updatedSubscription.userId,
      nextEdition: result.nextEdition,
    });
  };

  private findExistingSubscription = async ({
    userId,
    planId,
  }: {
    userId: string;
    planId: string;
  }) => {
    return this.db.$transaction(async (tx) => {
      const [user, plan] = await Promise.all([
        tx.user.findUnique({ where: { id: userId } }),
        tx.subscriptionPlan.findUnique({ where: { id: planId } }),
      ]);

      if (!user) throw new Error("User not found");
      if (!plan) throw new Error("Plan not found");

      const subscription = await tx.subscription.findFirst({
        where: {
          userId: user.id,
          planId: plan.id,
          status: {
            in: [
              SubscriptionStatus.PENDING,
              SubscriptionStatus.AWAITING_PAYMENT,
              SubscriptionStatus.ACTIVE,
            ],
          },
        },
      });
      return { subscription, user, subscriptionPlan: plan };
    });
  };

  createSubscription = async (
    input: CreateSubscriptionInput,
  ): Promise<CreateSubscriptionResult> => {
    let addressId = input.addressId;

    if (input.addressId) {
      await this.db.address.findUniqueOrThrow({
        where: {
          id: addressId,
          userId: input.userId,
        },
        select: {
          userId: true,
        },
      });
    }

    const {
      subscription: existingSub,
      user,
      subscriptionPlan: plan,
    } = await this.findExistingSubscription({
      userId: input.userId,
      planId: input.planId,
    });

    if (input.address) {
      // create address for user
      let { id } = await this.db.address.create({
        data: {
          isDefault: true,
          line1: input.address.line1,
          line2: input.address.line2,
          fullName: user.name,
          postalCode: input.address.postalCode,
          city: input.address.city,
          country: input.address.country,
          phone: input.address.phone,
          user: {
            connect: {
              id: user.id,
            },
          },
        },
        select: {
          id: true,
        },
      });
      addressId = id;
    }

    if (existingSub) {
      if (existingSub.stripeCheckoutSessionId) {
        // replace with something else
        return {
          checkoutUrl: `https://checkout.stripe.com/pay/${existingSub.stripeCheckoutSessionId}`,
        };
      }
      throw new Error("Subscription already exists for this plan.");
    }

    // 3️⃣ Pre-create a placeholder subscription in DB
    const placeholder = await this.db.$transaction((tx) => {
      return tx.subscription.upsert({
        where: {
          userId_planId_status: {
            userId: input.userId,
            planId: input.planId,
            status: SubscriptionStatus.PENDING,
          },
        },
        create: {
          userId: input.userId,
          planId: input.planId,
          status: SubscriptionStatus.PENDING,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        update: {},
      });
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
        stripeProductId: plan.stripeProductId,
      },
      async (productId, priceId) => {
        await this.db.subscriptionPlan.update({
          where: { id: plan.id },
          data: { stripePriceId: priceId, stripeProductId: productId },
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
      .update(`sub:${user.id}:${plan.id}:${Math.floor(Date.now() / 10000)}`)
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
          subscriptionId: placeholder.id,
          addressId,
        },
        idempotencyKey,
      );

    // 8️⃣ Update placeholder record with Stripe session details
    await this.db.$transaction((tx) => {
      return tx.subscription.update({
        where: { id: placeholder.id },
        data: {
          stripeCheckoutSessionId,
          status: SubscriptionStatus.AWAITING_PAYMENT,
        },
      });
    });

    if (!user.name) throw new Error("User name is undefined");

    // 9️⃣ Return checkout URL to client
    return { checkoutUrl };
  };
}
