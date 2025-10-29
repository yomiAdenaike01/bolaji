import {
  onCreateSubscriptionInputSchema,
  subscriptionSchema,
} from "@/domain/subscriptions/dto";
import { OrderType, PlanType } from "@/generated/prisma/enums";
import { logger } from "@/lib/logger";
import Stripe from "stripe";
import z from "zod";
import { preorderSchema } from "./schema";
import { PaymentEvent } from "./checkout.dto";
import crypto from "crypto";

export enum PaymentEventActions {
  SUBSCRIPTION_STARTED = "SUBSCRIPTION_STARTED",
  PREORDER_FAILED = "PREORDER_FAILED",
}
export class StripeIntegration {
  private stripe!: Stripe;

  constructor(
    apiKey: string,
    private readonly webhookSecret: string,
    private readonly paymentRedirectUrl: string,
  ) {
    try {
      this.stripe = new Stripe(apiKey, { apiVersion: "2025-09-30.clover" });
    } catch (error) {
      logger.error(error, "Failed to initlaise stripe");
    }
  }

  handlePreorderFailure = async (
    failedObject: Stripe.PaymentIntent | Stripe.Charge,
  ): Promise<PaymentEvent | null> => {
    // Ensure we have a PaymentIntent
    const paymentIntentId =
      (failedObject as Stripe.PaymentIntent).id ||
      (failedObject as Stripe.Charge).payment_intent;

    if (!paymentIntentId) {
      logger.error(
        "[StripeIntegration] No payment_intent found on failure event",
      );
      return null;
    }

    let meta: Record<string, string> | null = failedObject.metadata || null;
    // Fetch the full PaymentIntent from Stripe to get metadata
    if (!meta) {
      try {
        const intent = await this.stripe.paymentIntents.retrieve(
          paymentIntentId as string,
          {
            expand: ["latest_charge"],
          },
        );
        meta = intent.metadata;
      } catch (error) {
        const checkout = await this.getCheckoutById(paymentIntentId as string);
        meta = checkout?.metadata || null;
      }
    }

    if (!meta) return null;

    return {
      userId: meta.userId,
      redirectUrl: meta.redirectUrl || null,
      rawPayload: JSON.stringify(failedObject),
      stripeEventType: "payment_intent.payment_failed",
      orderType: OrderType.PREORDER,
      type: OrderType.PREORDER,
      plan: (meta.plan as PlanType) ?? PlanType.DIGITAL,
      editionId: meta.editionId ?? "",
      addressId: meta.addressId ?? null,
      orderId: meta.preorderId,
      paymentLinkId: meta.paymentLinkId || "",
      eventId: paymentIntentId as string,
      amount: (failedObject as any)?.amount ?? 0,
      success: false,
      action: PaymentEventActions.PREORDER_FAILED,
    };
  };

  getCheckoutById = async (checkoutSessionId: string) => {
    try {
      logger.info(
        `[StripeIntegration] Fetching subscription checkout session id=${checkoutSessionId}`,
      );
      const session =
        await this.stripe.checkout.sessions.retrieve(checkoutSessionId);
      return session;
    } catch (error) {
      return null;
    }
  };
  getPaymentLink = async (paymentLinkId: string) => {
    try {
      logger.info(
        `[StripeIntegration] Fetching payment link id=${paymentLinkId}`,
      );
      const link = await this.stripe.paymentLinks.retrieve(paymentLinkId);

      if (!link || !link?.active) {
        logger.warn(
          `[StripeIntegration] Payment link ${paymentLinkId} not found or deleted or inactive (status=${link.active}) .`,
        );
        return null;
      }
      logger.info(
        `[StripeIntegration] ✅ Retrieved payment link id=${paymentLinkId}`,
      );

      return {
        stripePaymentLinkId: link.id,
        url: link.url,
        amount: link.line_items?.data?.[0]?.price?.unit_amount || null,
        currency: link.line_items?.data?.[0]?.price?.currency || "GBP",
      };
    } catch (err: any) {
      // 404 or network error — treat as not found
      if (err.code === "resource_missing" || err.statusCode === 404) {
        logger.warn(`Payment link ${paymentLinkId} missing in Stripe`);
        return null;
      }

      logger.error(
        err,
        `Unexpected error retrieving payment link ${paymentLinkId}`,
      );
      return null;
    }
  };

  getSubscription = async (subscriptionId: string) => {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  };
  private handleAsyncPaymentComplete(
    event: Stripe.CheckoutSessionAsyncPaymentSucceededEvent,
  ) {}
  private constructSubscriptionCreatedData = (
    event: Stripe.CustomerSubscriptionCreatedEvent,
  ): PaymentEvent | null => {
    logger.info(
      `[StripeIntegration] Event received: ${event.type}, id=${event.id}`,
    );
    const metadata = event.data.object?.metadata;
    if (!metadata) {
      logger.warn(
        `[StripeIntegration] ⚠️ No metadata found in subscription.created event id=${event.id}`,
      );
      return null;
    }
    const parsed = onCreateSubscriptionInputSchema.parse(metadata);
    logger.info(
      `[StripeIntegration] ✅ Parsed subscription.created metadata for userId=${parsed.userId}`,
    );

    return {
      ...parsed,
      eventId: event.id,
      amount: 0,
      orderType: OrderType.SUBSCRIPTION_RENEWAL,
      type: OrderType.SUBSCRIPTION_RENEWAL,
      action: PaymentEventActions.SUBSCRIPTION_STARTED,
      success: true,
      rawPayload: JSON.stringify(event),
      stripeEventType: event.type,
      startDate: event.data.object.start_date,
    };
  };

  constructCheckoutEventData = (
    event: Stripe.CheckoutSessionCompletedEvent,
  ): PaymentEvent | null => {
    logger.info(
      `[StripeIntegration] Event received: ${event.type}, id=${event.id}`,
    );

    const session = event.data.object;
    const metadata = session.metadata;
    const orderTotal = session.amount_total ?? session.amount_subtotal ?? 0;
    const rawPayload = JSON.stringify(event);
    const stripeEventType = event.type;

    if (!metadata) throw new Error("Metadata is not defined");

    if (!Object.keys(metadata).every(Boolean)) {
      logger.error(
        `[StripeIntegration] ❌ Missing metadata on event id=${event.id}`,
      );
      throw new Error("Metadata is not defined");
    }

    switch (metadata.type as OrderType) {
      case OrderType.PREORDER: {
        const {
          userId,
          plan,
          type,
          editionId,
          addressId = null,
          amount,
          eventId,
          paymentLinkId,
        } = preorderSchema.parse({
          ...metadata,
          amount: orderTotal,
          eventId: event.id,
          paymentLinkId: session.payment_link,
        });

        logger.info(
          `[StripeIntegration] ✅ Parsed preorder metadata for userId=${userId}, editionId=${editionId}`,
        );

        return {
          userId,
          success: true,
          rawPayload,
          plan,
          stripeEventType,
          orderType: type,
          editionId,
          addressId,
          eventId,
          amount,
          type,
          paymentLinkId,
        };
      }

      case OrderType.SUBSCRIPTION_RENEWAL: {
        const {
          userId,
          subscriptionId,
          planId,
          type,
          eventId,
          isNewSubscription,
        } = subscriptionSchema.parse({
          ...metadata,
          eventId: event.id,
          isNewSubscription: Boolean(metadata?.isNewSubscription || false),
        });

        logger.info(
          `[StripeIntegration] ✅ Parsed subscription renewal for userId=${userId}, subscriptionId=${subscriptionId}`,
        );
        return {
          isNewSubscription,
          success: true,
          userId,
          rawPayload,
          stripeEventType,
          orderType: type,
          subscriptionId,
          subscriptionPlanId: planId,
          eventId,
          amount: orderTotal,
          type,
          stripeSubscriptionId: session.subscription?.toString(),
          stripeInvoiceId:
            typeof session.invoice === "string"
              ? session.invoice
              : session.invoice?.id,
        };
      }

      default: {
        logger.warn(
          `[StripeIntegration:constructCheckoutEventData]: Unknown order type ${metadata.type}`,
        );
        return null;
      }
    }
  };
  handlePaymentFailed(event: Stripe.PaymentIntentPaymentFailedEvent) {
    throw new Error("Method not implemented.");
  }
  handleInvoiceSuccess(event: Stripe.InvoicePaymentSucceededEvent) {
    throw new Error("Method not implemented.");
  }
  handleInvoiceFailed(event: Stripe.InvoicePaymentFailedEvent) {
    throw new Error("Method not implemented.");
  }
  handleSubscriptionCanceled(event: Stripe.CustomerSubscriptionDeletedEvent) {
    throw new Error("Method not implemented.");
  }

  createPreorderPaymentLink = async (opts: {
    userId: string;
    editionId: string;
    choice: PlanType;
    amount: number;
    addressId: string | null;
    redirectUrl: string;
    preorderId: string;
  }) => {
    logger.info(
      `[StripeIntegration] Creating preorder payment link for userId=${opts.userId}, editionId=${opts.editionId}, plan=${opts.choice}`,
    );
    const parsed = z
      .object({
        userId: z.string().min(1),
        editionId: z.string().min(1),
        choice: z.enum(["DIGITAL", "PHYSICAL", "FULL"]),
        amount: z.number().min(1),
        addressId: z.string().min(1).nullable(),
        redirectUrl: z.string().min(1),
        preorderId: z.string().min(1),
      })
      .parse(opts);

    // 🧮 Ensure correct pricing from your own logic if you don’t trust `amount`
    const priceInCents = Math.round(parsed.amount);
    const metadata = {
      userId: parsed.userId,
      editionId: parsed.editionId,
      plan: parsed.choice,
      type: "PREORDER",
      addressId: parsed.addressId,
      preorderId: parsed.preorderId,
      redirectUrl: parsed.redirectUrl,
    };

    const params: Stripe.PaymentLinkCreateParams = {
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `Bolaji Edition 00 – ${parsed.choice}`,
            },
            unit_amount: priceInCents,
          },
          quantity: 1,
        },
      ],
      metadata,
      payment_intent_data: {
        metadata,
      },
      after_completion: {
        type: "redirect",
        redirect: { url: parsed.redirectUrl || this.paymentRedirectUrl },
      },
    };
    // 🧱 Create a hosted payment link
    const paymentLink = await this.stripe.paymentLinks.create(params);
    logger.info(
      `[StripeIntegration] ✅ Created Stripe preorder link id=${paymentLink.id}`,
    );

    // 🧾 Return data that your backend can store in Prisma
    return {
      stripePaymentLinkId: paymentLink.id,
      url: paymentLink.url,
      amount: priceInCents,
      currency: "GBP",
    };
  };

  retrievePaymentIntent = async (id: string) => {
    return await this.stripe.paymentIntents.retrieve(id);
  };
  createSubscriptionCheckout = async (
    params: {
      userId: string;
      planId: string;
      successUrl: string;
      cancelUrl: string;
      stripeCustomerId: string;
      priceId: string;
      subscriptionId: string;
      addressId?: string;
      isNewSubscription: boolean | null;
    },
    idempotencyKey?: string,
  ): Promise<{ checkoutUrl: string; stripeCheckoutSessionId: string }> => {
    logger.info(
      `[StripeIntegration] Creating subscription checkout for userId=${params.userId}, planId=${params.planId}`,
    );
    const metadata = {
      ...(params.addressId ? { addressId: params.addressId } : {}),
      userId: params.userId,
      planId: params.planId,
      subscriptionId: params.subscriptionId,
      type: OrderType.SUBSCRIPTION_RENEWAL,
      isNewSubscription: String(params.isNewSubscription),
    };

    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "subscription",
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        customer: params.stripeCustomerId,
        client_reference_id: `${params.userId}:${params.planId}`,
        allow_promotion_codes: true,
        line_items: [{ price: params.priceId, quantity: 1 }],
        metadata,
        subscription_data: {
          trial_period_days: undefined,
          metadata,
        },
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
    logger.info(
      `[StripeIntegration] ✅ Created Stripe checkout session id=${session.id}s`,
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return { checkoutUrl: session.url, stripeCheckoutSessionId: session.id };
  };
  ensureCustomer = async (
    params: {
      userId: string;
      email?: string | null;
      stripeCustomerId?: string | null;
    },
    setCustomerId: (id: string | null) => Promise<void>,
  ): Promise<string> => {
    if (params.stripeCustomerId) {
      const stripeCustomer = await this.stripe.customers.retrieve(
        params.stripeCustomerId,
      );
      if (stripeCustomer && Boolean(stripeCustomer?.deleted) === false) {
        return stripeCustomer.id;
      }
    }

    const customer = await this.stripe.customers.create({
      email: params.email ?? undefined,
      metadata: { userId: params.userId },
    });
    await setCustomerId(customer.id);
    return customer.id;
  };
  private findOrCreateStripeProduct = async (
    planName: string,
  ): Promise<string> => {
    const targetName =
      `Bolaji Editions Subscription - ${planName}`.toLowerCase();

    let foundProductId: string | null = null;
    let startingAfter: string | undefined;

    do {
      const params = {
        limit: 100,
        active: true,
        starting_after: startingAfter,
      };

      const { data: products, has_more } =
        await this.stripe.products.list(params);

      for (const product of products) {
        const name = product.name.trim().toLowerCase();
        if (name === targetName) {
          foundProductId = product.id;
          break;
        }
      }

      if (!has_more) break;
      startingAfter = products[products.length - 1]?.id;
    } while (!foundProductId);

    if (foundProductId) {
      return foundProductId;
    }

    const product = await this.stripe.products.create({
      name: `Bolaji Editions Subscription - ${planName}`,
      description: "Access to monthly Bolaji Editions content.",
      metadata: {
        planName,
        source: "backend_auto_create",
      },
    });

    return product.id;
  };

  ensureStripePrice = async (
    plan: {
      id: string;
      name: string;
      priceCents: number;
      currency: string;
      interval: "DAY" | "WEEK" | "MONTH" | "YEAR";
      stripePriceId?: string | null;
      stripeProductId?: string | null;
    },
    setStripeProduct: (productId: string, priceId: string) => Promise<void>,
  ): Promise<string> => {
    if (plan.stripePriceId) return plan.stripePriceId;

    let productId = plan.stripeProductId;

    if (!productId) {
      productId = await this.findOrCreateStripeProduct(plan.name);
    }
    // Create or reuse a single product

    const price = await this.stripe.prices.create({
      product: productId,
      nickname: plan.name,
      unit_amount: plan.priceCents,
      currency: plan.currency.toLowerCase(),
      recurring: { interval: plan.interval.toLowerCase() as any },
      metadata: { planId: plan.id },
    });

    await setStripeProduct(productId, price.id);
    return price.id;
  };

  handleWebhook = (requestBody: Buffer, signature: string) => {
    let reqBody = null;
    let event: Stripe.Event | null = null;
    try {
      reqBody = JSON.parse(requestBody.toString("utf-8"));
      event = this.stripe.webhooks.constructEvent(
        requestBody,
        signature,
        this.webhookSecret,
      );
    } catch (error) {
      logger.error(
        `Failed to handle stripe event type=${reqBody?.type || "no type found"}`,
      );
      return null;
    }
    if (!event) throw new Error("Event is not defined");
    switch (event.type) {
      // 🟢 --- CHECKOUT EVENTS ---
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.payment_status === "paid") {
          // ✅ Instant success (card, Apple Pay, etc.)
          return this.constructCheckoutEventData(event);
        } else {
          // ⚠️ Async methods (SEPA, Bacs, etc.) – wait for confirmation
          logger.info(
            `[StripeIntegration] Checkout completed but payment still pending for session=${session.id}`,
          );
        }
        break;
      }

      // 🟢 Async payment confirmation (SEPA, Bacs, etc.)
      case "checkout.session.async_payment_succeeded": {
        return this.handleAsyncPaymentComplete(event);
      }

      // 🔴 Async payment failed (SEPA, Bacs, etc.)
      case "checkout.session.async_payment_failed": {
        return this.handlePreorderFailure(event.data.object as any);
      }

      // 🔴 Direct payment failures (card declined, etc.)
      case "payment_intent.payment_failed":
      case "charge.failed": {
        return this.handlePreorderFailure(event.data.object);
      }

      // 🟢 Subscription lifecycle
      case "customer.subscription.created": {
        // First subscription creation (user just subscribed)
        return this.constructSubscriptionCreatedData(event);
      }

      // 🟢 Renewal success
      case "invoice.payment_succeeded": {
        // Renewal payment succeeded → unlock next edition
        return this.handleInvoiceSuccess(event);
      }

      // 🔴 Renewal failure (retry attempts start)
      case "invoice.payment_failed": {
        // Renewal failed → trigger retry email or mark PAST_DUE
        return this.handleInvoiceFailed(event);
      }

      // 🔴 Subscription cancelled (user or failed retries)
      case "customer.subscription.deleted": {
        // Cancelled → remove from renewal & access cycles
        return this.handleSubscriptionCanceled(event);
      }

      default: {
        logger.info(`[StripeIntegration] No handler for event=${event.type}`);
        return null;
      }
    }

    return null;
  };
}
