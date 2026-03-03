import bcrypt from "bcrypt";
import { Db, TransactionClient } from "@/infra";
import { Integrations } from "@/infra/integrations";
import {
  CreateSubscriptionInput,
  CreateSubscriptionResult,
  UpdateSubscriptionInput,
} from "./dto";
import crypto from "crypto";
import {
  AccessStatus,
  OrderStatus,
  OrderType,
  PaymentStatus,
  PlanType,
  ShipmentStatus,
  SubscriptionStatus,
  UserStatus,
  EditionStatus,
} from "@/generated/prisma/enums";
import { logger } from "@/lib/logger";
import { JobsQueues } from "../../infra/workers/jobs-queue";
import { AdminEmailType, EmailType } from "@/infra/integrations/email-types";
import { addYears } from "date-fns";
import { Config } from "@/config";
import { PricingService } from "../pricing.service";
import { EditionsService } from "../editions.service";
import z from "zod";

export class SubscriptionAlreadyActiveError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class SubscriptionsService {
  constructor(
    private readonly db: Db,
    private readonly integrations: Integrations,
    private readonly config: Config,
    private readonly queues: JobsQueues,
    private readonly pricingService: PricingService,
    private readonly editionsService: EditionsService,
  ) {}

  resumeSubscription = async (userId: string) => {
    const subscription =
      await this.integrations.payments.resumeSubscription(userId);
    this.db.$transaction((tx) =>
      Promise.all([
        tx.subscription.update({
          where: {
            stripeSubscriptionId: subscription.id,
            status: {
              not: SubscriptionStatus.ACTIVE,
            },
          },
          data: {
            status: SubscriptionStatus.ACTIVE,
            canceledAt: null,
            cancelReason: null,
          },
        }),
        tx.user.update({
          where: { id: userId },
          data: { status: UserStatus.ACTIVE },
        }),
      ]),
    );
    await this.db.subscription.update({
      where: {
        stripeSubscriptionId: subscription.id,
      },
      data: {
        status: SubscriptionStatus.ACTIVE,
      },
    });
    return null;
  };

  cancelSubscription = async (userId: string) => {
    try {
      const uid = z.string().parse(userId);
      const subscription = await this.db.subscription.findFirst({
        where: {
          userId: uid,
          status: SubscriptionStatus.ACTIVE,
        },
        include: {
          user: {
            select: {
              email: true,
              name: true,
            },
          },
          plan: {
            select: {
              type: true,
            },
          },
        },
      });

      if (!subscription || !subscription.stripeSubscriptionId) {
        logger.info(
          `[Subscription Service] Failed to find subscription userId=${userId} || no stripeSubscriptionId found subscriptionId=${subscription?.id}`,
        );
        return;
      }

      const cancelledSubscription =
        await this.integrations.payments.cancelSubscription(
          subscription?.stripeSubscriptionId,
        );
      if (!cancelledSubscription)
        logger.info(
          "[Subscription Service]: Failed to cancel stripe subscription",
        );
      await this.db.subscription.update({
        where: {
          id: subscription.id,
          status: SubscriptionStatus.ACTIVE,
        },
        data: {
          status: SubscriptionStatus.CANCELED,
        },
      });
      logger.info(
        `[Subscription Service]: Successfully cancelled subscription userId=${userId} subscriptionId=${subscription.id}`,
      );

      this.integrations.adminEmail
        .send({
          content: {
            canceledAt: new Date(
              cancelledSubscription?.ended_at || Date.now(),
            ).toISOString(),
            email: subscription.user.email,
            name: subscription.user.name || "Unknown",
            plan: subscription.plan.type,
          },
          type: AdminEmailType.SUBSCRIPTION_CANCELED,
        })
        .catch((err) => {
          logger.error(
            err,
            "[Subscription Service] Failed to send subscription cancelled admin email",
          );
        });
    } catch (err) {
      logger.error(
        `[Subscription Service]: Failed to cancel subscription err=${(err as any).message}`,
      );
      throw err;
    }
  };

  private getNextAvaliableEditionForSubscription = async (
    tx: Db | TransactionClient,
    userId: string,
  ) => {
    const [allEditions, unlocked] = await Promise.all([
      tx.edition.findMany({
        orderBy: { number: "asc" },
        where: {
          number: {
            gte: 1,
          },
        },
        select: { id: true, number: true, status: true },
      }),
      tx.editionAccess.findMany({
        where: { userId: userId },
        select: { editionId: true },
      }),
    ]);
    const unlockedIds = new Set(unlocked.map((u) => u.editionId));
    return allEditions.find((ed) => !unlockedIds.has(ed.id));
  };
  onCreateOrUpdateSubscription = async (params: UpdateSubscriptionInput) => {
    const {
      subscriptionId,
      stripeSubscriptionId,
      currentPeriodStart,
      currentPeriodEnd,
      subscriptionPlanId,
      stripeInvoiceId,
      addressId,
    } = params;

    let isNewSubscription = params.isNewSubscription;

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

      if (existingSubscription) {
        isNewSubscription =
          existingSubscription.status === SubscriptionStatus.AWAITING_PAYMENT;
        logger.info(
          `[Subscription Service] Existing subscription found id=${existingSubscription.id}`,
        );
      }

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
          include: {
            user: true,
            plan: true,
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
      const nextEdition = await this.getNextAvaliableEditionForSubscription(
        tx,
        existingSubscription.userId,
      );

      if (!nextEdition) {
        logger.info(
          `[Subscriptions Service] User ${existingSubscription.userId} already has all editions unlocked.`,
        );
        return { updatedSubscription, nextEdition: null, isNewSubscription };
      }

      logger.info(
        `[Subscriptions Service] Subscription ${subscriptionId} renewed → Edition ${nextEdition.number} unlocked.`,
      );
      const isNextEditionReleased = nextEdition.status === EditionStatus.ACTIVE;
      const shouldEditionExpire = subscriptionPlan.type !== PlanType.PHYSICAL;
      logger.info(
        `[Subscription Service] Updating edition access for user=${existingSubscription.userId} nextEditionId=${nextEdition.id} nextEditionNumber=${nextEdition.number}`,
      );
      await tx.editionAccess.upsert({
        where: {
          userId_editionId_accessType: {
            userId: existingSubscription.userId,
            editionId: nextEdition.id,
            accessType: subscriptionPlan.type,
          },
        },
        update: {},
        create: {
          accessType: subscriptionPlan.type,
          status: isNextEditionReleased
            ? AccessStatus.ACTIVE
            : AccessStatus.SCHEDULED,
          unlockedAt: isNextEditionReleased ? new Date() : null,
          expiresAt: shouldEditionExpire ? addYears(new Date(), 2) : null,
          userId: existingSubscription.userId,
          editionId: nextEdition.id,
          subscriptionId: updatedSubscription.id,
        },
      });

      if (!addressId)
        return { updatedSubscription, nextEdition, isNewSubscription };

      logger.info(
        `[Subscription Service] Creating shipment for userId=${existingSubscription.userId} `,
      );
      const shipment = await tx.shipment.create({
        data: {
          userId: existingSubscription.userId,
          status: ShipmentStatus.PENDING,
          editionId: nextEdition.id,
          addressId,
        },
      });
      logger.info(
        `[Subscription Service] Successfully created shipment for userId=${existingSubscription.userId} addressId=${shipment.addressId} editionId=${shipment.editionId}`,
      );
      return { updatedSubscription, nextEdition, isNewSubscription };
    });
    if (isNewSubscription)
      try {
        await this.db.user.update({
          where: {
            id: result.updatedSubscription.user.id,
            status: { not: UserStatus.ACTIVE },
          },
          data: {
            status: UserStatus.ACTIVE,
          },
        });
      } catch (error) {
        logger.warn(
          error,
          `[Subscription Service]: Failed to set user - ${result.updatedSubscription.user.id} status to ACTIVE`,
        );
      }
    if (result.updatedSubscription.userId && !isNewSubscription)
      await this.editionsService.invalidateEditionAccess(
        result.updatedSubscription.userId,
      );
    return { ...result, isNewSubscription };
  };

  private findExistingDbSubscription = async ({
    userId,
    planId,
  }: {
    userId: string;
    planId?: string;
  }) => {
    logger.info(
      `[Subscription Service] Checking for existing subscription userId=${userId} planId=${planId}`,
    );
    return this.db.$transaction(async (tx) => {
      const [user, plan] = await Promise.all([
        tx.user.findUnique({ where: { id: userId } }),
        tx.subscriptionPlan.findUnique({
          where: {
            id: planId,
          },
        }),
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
      logger.info(
        `[Subscription Service] Found subscription for userId=${user.id} subscriptionId=${subscription?.id} planId=${plan.id} planType=${plan.type}`,
      );
      return { subscription, user, subscriptionPlan: plan };
    });
  };

  createSubscription = async (
    input: CreateSubscriptionInput & {
      deviceFingerprint?: string;
      userAgent?: string;
    },
  ): Promise<CreateSubscriptionResult> => {
    let userId = input.userId;
    let shippingCents: number | undefined = undefined;
    let shippingZone: string | undefined = undefined;
    if (!input.userId) {
      logger.info(
        input,
        `[Subscription Service] No userId found, creating with input`,
      );
      const password = crypto.randomBytes(4).toString("hex");
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await this.db.user.upsert({
        where: {
          email: input.email,
        },
        update: {},
        create: {
          name: input.name,
          email: input.email,
          status: UserStatus.PENDING_SUBSCRIPTION,
          passwordHash,
          ...(input.deviceFingerprint && input.userAgent
            ? {
                devices: {
                  create: {
                    fingerprint: input.deviceFingerprint,
                    userAgent: input.userAgent,
                  },
                },
              }
            : {}),
        },
      });

      userId = user.id;
    }
    const startTime = Date.now();
    let addressId = input.addressId;
    logger.info(
      `[Subscription Service] 🟦 Starting subscription creation for userId=${input.userId}, planType=${input.plan || "unknown"}`,
    );

    if (!userId) throw new Error("User id is not defined");
    try {
      logger.info(
        `[Subscription Service] PlanId missing. Fetching plan by type=${input.plan}`,
      );
      const plan = await this.db.subscriptionPlan.findFirstOrThrow({
        where: { type: input.plan },
      });

      if (input.addressId) {
        logger.info(
          `[Subscription Service] Validating address id=${input.addressId} for userId=${userId}`,
        );
        const { country } = await this.db.address.findUniqueOrThrow({
          where: { id: input.addressId, userId },
        });
        shippingZone = this.pricingService.getShippingZone(country);
        shippingCents = this.pricingService.getShippingPrice(country);
        logger.info(
          `[Subscription Service] Calculated shippingCents=${shippingCents} (${shippingZone}) for userId=${userId}`,
        );
      }

      const { subscription: existingSub, user } =
        await this.findExistingDbSubscription({
          userId: userId,
          planId: plan.id,
        });
      if (
        existingSub?.status === SubscriptionStatus.ACTIVE &&
        existingSub.stripeSubscriptionId &&
        user.stripeCustomerId
      ) {
        const hasActiveSubscription =
          await this.integrations.payments.hasExistingSubscription({
            customerId: user.stripeCustomerId,
            subscriptionId: existingSub.stripeSubscriptionId,
            planId: existingSub.planId,
          });
        if (hasActiveSubscription)
          throw new SubscriptionAlreadyActiveError(
            `Subscription already active (userId=${userId}, planId=${plan.id})`,
          );
      }

      if (input.address) {
        logger.info(
          `[Subscription Service] Creating new address for userId=${userId}`,
        );
        const { id, country } = await this.db.address.create({
          data: {
            isDefault: true,
            line1: input.address.line1,
            line2: input.address.line2,
            fullName: user.name,
            postalCode: input.address.postalCode,
            city: input.address.city,
            country: input.address.country,
            phone: input.address.phone,
            user: { connect: { id: user.id } },
          },
          select: { id: true, country: true },
        });
        addressId = id;
        shippingZone = this.pricingService.getShippingZone(country);
        shippingCents = this.pricingService.getShippingPrice(country);
        logger.info(
          `[Subscription Service] Calculated shippingCents=${shippingCents} (${shippingZone}) for userId=${userId}`,
        );
        logger.info(
          `[Subscription Service] ✅ Address created with id=${addressId}`,
        );
      }

      // 5️⃣ Handle existing subscription
      if (existingSub?.stripeCheckoutSessionId) {
        logger.info(
          `[Subscription Service] Attempting to reuse existing Stripe checkout session for userId=${user.id}, sessionId=${existingSub.stripeCheckoutSessionId}`,
        );

        const checkoutSession =
          await this.integrations.payments.getCheckoutById(
            existingSub.stripeCheckoutSessionId,
          );

        if (checkoutSession && checkoutSession.url) {
          logger.info(
            `[Subscription Service]  Reusing existing checkout session for userId=${user.id}, sessionId=${existingSub.stripeCheckoutSessionId}`,
          );

          return { checkoutUrl: checkoutSession.url };
        }

        logger.warn(
          `[Subscription Service] Stored Stripe sessionId=${existingSub.stripeCheckoutSessionId} is invalid or expired. Cleaning up and creating new one.`,
        );

        try {
          await this.db.subscription.update({
            where: { id: existingSub.id },
            data: {
              stripeCheckoutSessionId: null,
              status: SubscriptionStatus.PENDING,
            },
          });
          logger.info(
            `[Subscription Service] Cleared invalid checkout session for subscriptionId=${existingSub.id}`,
          );
        } catch (err) {
          logger.error(
            err,
            `[Subscription Service] Failed to clear invalid session for subscriptionId=${existingSub.id}`,
          );
        }
      }

      const planId = plan.id;
      if (!planId) throw new Error("Plan Id is not defined");

      // 6️⃣ Create placeholder subscription
      logger.info(
        `[Subscription Service] Creating subscription placeholder for userId=${user.id}, planId=${plan.id}`,
      );
      const placeholder = existingSub
        ? existingSub
        : await this.db.$transaction((tx) =>
            tx.subscription.upsert({
              where: {
                userId_planId_status: {
                  userId: userId,
                  planId,
                  status: SubscriptionStatus.PENDING,
                },
              },
              create: {
                userId: userId,
                planId,
                status: SubscriptionStatus.PENDING,
                currentPeriodStart: new Date(),
                currentPeriodEnd: new Date(
                  Date.now() + 30 * 24 * 60 * 60 * 1000,
                ),
              },
              update: {},
            }),
          );
      logger.info(
        `[Subscription Service] Placeholder subscription created id=${placeholder.id}`,
      );

      const ensurePricePromise = this.integrations.payments.ensureStripePrice(
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
          logger.info(
            `[Subscription Service] Updating subscription plan with Stripe product=${productId}, price=${priceId}`,
          );
          await this.db.subscriptionPlan.update({
            where: { id: plan.id },
            data: { stripePriceId: priceId, stripeProductId: productId },
          });
          logger.info(
            `[Subscription Service] ✅ Subscription plan updated id=${plan.id}`,
          );
        },
      );

      const ensureCustomerPromise = this.integrations.payments.ensureCustomer(
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
          logger.info(
            `[Subscription Service] Linked Stripe customerId=${cid} to userId=${user.id}`,
          );
        },
      );
      const [priceId, customerId] = await Promise.all([
        ensurePricePromise,
        ensureCustomerPromise,
      ]);

      const idempotencyKey = crypto
        .createHash("sha256")
        .update(`sub:${user.id}:${plan.id}:${Math.floor(Date.now() / 10000)}`)
        .digest("hex");

      logger.info(
        `[Subscription Service] Generated idempotencyKey=${idempotencyKey.slice(0, 12)}…`,
      );

      logger.info(
        `[Subscription Service] Creating Stripe checkout session for userId=${user.id}, planId=${plan.id}, customerId=${customerId}`,
      );

      const metadata = {
        userId: user.id,
        planId: plan.id,
        successUrl: `${this.config.serverUrl}/subscriptions/thank-you?planType=${plan.type}`,
        cancelUrl: `${this.config.serverUrl}/subscriptions/cancel`,
        stripeCustomerId: customerId,
        priceId,
        subscriptionId: placeholder.id,
        addressId,
        isNewSubscription: true, // It was an oversight to attach this since it will always be true
        type: OrderType.SUBSCRIPTION_RENEWAL,
        shippingCents,
        shippingZone,
      };
      const {
        checkoutUrl,
        stripeCheckoutSessionId,
        stripePaymentIntentId,
        stripePaymentLinkId,
      } = await this.integrations.payments.createSubscriptionCheckout(
        metadata,
        idempotencyKey,
      );
      logger.info(
        `[Subscription Service] ✅ Stripe checkout session created sessionId=${stripeCheckoutSessionId}`,
      );

      // 11️⃣ Update placeholder subscription
      this.db.$transaction(async (tx) => {
        const { id: subscriptionId } = await tx.subscription.update({
          where: { id: placeholder.id },
          data: {
            stripeCheckoutSessionId,
            status: SubscriptionStatus.AWAITING_PAYMENT,
          },
        });
        if (stripePaymentIntentId) {
          logger.info(
            `[Subscription Service] Creating stripe metadata - checkout:${stripeCheckoutSessionId} paymentIntent:${stripePaymentIntentId} userId:${userId}`,
          );
          await tx.stripeSubscriptionCheckoutMetadata.upsert({
            where: {
              sessionId: stripeCheckoutSessionId,
              userId,
              paymentIntentId: stripePaymentIntentId,
            },
            update: {},
            create: {
              paymentIntentId: stripePaymentIntentId,
              subscriptionId,
              sessionId: stripeCheckoutSessionId,
              metadataJson: JSON.stringify({
                ...metadata,
                stripePaymentLinkId,
              }),
              userId,
              stripeCustomerId: customerId,
            },
          });
        }
        logger.warn(
          `[Subscription Service] No stripe payment intent id found on checkout - ${stripeCheckoutSessionId}`,
        );
      });

      logger.info(
        `[Subscription Service] ✅ Placeholder updated with Stripe sessionId=${stripeCheckoutSessionId}`,
      );

      const duration = (Date.now() - startTime) / 1000;
      logger.info(
        `[Subscription Service] 🎉 Subscription checout created successfully for userId=${user.id}, planId=${plan.id}, elapsed=${duration.toFixed(
          2,
        )}s`,
      );

      return { checkoutUrl };
    } catch (err: any) {
      logger.error(
        err,
        `[Subscription Service] ❌ Failed to create subscription for userId=${input.userId} planType=${input.plan}`,
      );
      throw err;
    }
  };
}
