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
import { Db } from "..";
import { StripeShippingService } from "./stripeShipping.integration";

export enum PaymentEventActions {
  SUBSCRIPTION_STARTED = "SUBSCRIPTION_STARTED",
  PREORDER_FAILED = "PREORDER_FAILED",
  SUBSCRIPTION_INITIAL_PAYMENT_FAILED = "SUBSCRIPTION_INITIAL_PAYMENT_FAILED",
}
export class StripeIntegration {
  private stripe!: Stripe;

  constructor(
    private readonly db: Db,
    apiKey: string,
    private readonly webhookSecret: string,
    private readonly paymentRedirectUrl: string,
    private readonly shippingPrice: StripeShippingService,
  ) {
    try {
      this.stripe = new Stripe(apiKey, { apiVersion: "2025-10-29.clover" });
      this.shippingPrice.ensure(this.stripe);
    } catch (error) {
      logger.error(error, "Failed to initlaise stripe");
    }
  }

  invalidatePaymentLink = async (linkId: string) => {
    try {
      await this.stripe.paymentLinks.update(linkId, {
        active: false,
      });
      logger.info(`[StripeIntegration] Invalidated payment link - ${linkId}`);
    } catch (error) {
      logger.warn(
        error,
        `[StripeIntegration] Failed to invalidate payment link - ${linkId}`,
      );
      return null;
    }
  };

  private getSubscriptionMetadata = async (paymentIntentId: string) => {
    try {
      logger.info(
        `[StripeIntegration] Finding stripe metadata by db payment intent - ${paymentIntentId} `,
      );
      if (!paymentIntentId) {
        logger.warn(
          `[StripeIntegration] Failed to find stripe metadata by db payment intent - ${paymentIntentId} `,
        );

        return null;
      }
      const dbMetadata =
        await this.db.stripeSubscriptionCheckoutMetadata.findUnique({
          where: {
            paymentIntentId,
          },
        });
      if (!dbMetadata?.metadataJson) {
        logger.warn(
          `[StripeIntegration] Failed to find stripe metadata by db payment intent - ${paymentIntentId} `,
        );
        return null;
      }
      const parsedMetadata = {
        ...dbMetadata,
        ...(dbMetadata.metadataJson as {
          userId: string;
          planId: string;
          successUrl: string;
          cancelUrl: string;
          stripeCustomerId: string;
          priceId: string;
          subscriptionId: string;
          addressId: string | undefined;
          isNewSubscription: boolean;
          stripePaymentLinkId?: string;
        }),
      };
      return parsedMetadata;
    } catch (error) {
      logger.warn(
        `[StripeIntegration] Failed to find stripe metadata by db payment intent - ${paymentIntentId} `,
      );
      return null;
    }
  };

  handlePreorderOrSubscriptionCheckoutFailure = async (
    failedObject: Stripe.PaymentIntent | Stripe.Charge,
  ): Promise<PaymentEvent | null> => {
    // Ensure we have a PaymentIntent
    let paymentIntentId = (failedObject as Stripe.PaymentIntent).id;
    const isSubscription = failedObject.description === "Subscription creation";
    let meta: Record<string, string> | null = failedObject.metadata || null;
    if (isSubscription) {
      paymentIntentId = String((failedObject as Stripe.Charge).payment_intent);
      const dbMetadata = await this.getSubscriptionMetadata(paymentIntentId);
      if (dbMetadata)
        return {
          reason: failedObject.status,
          action: PaymentEventActions.SUBSCRIPTION_INITIAL_PAYMENT_FAILED,
          addressId: dbMetadata?.addressId || null,
          orderType: OrderType.SUBSCRIPTION_RENEWAL,
          rawPayload: JSON.stringify(failedObject),
          stripeEventType: "charge.failed",
          editionId: null,
          planId: dbMetadata.planId,
          success: false,
          userId: dbMetadata.userId,
          type: OrderType.SUBSCRIPTION_RENEWAL,
          eventId: failedObject.id,
          stripePaymentLinkId: dbMetadata?.stripePaymentLinkId,
        } as any;
    }

    if (!paymentIntentId) {
      logger.error(
        "[StripeIntegration] No payment_intent found on failure event",
      );
      return null;
    }

    const hasMetaData = meta && Object.keys(meta).length > 0;
    // Fetch the full PaymentIntent from Stripe to get metadata
    if (!hasMetaData) {
      try {
        const intent = await this.stripe.paymentIntents.retrieve(
          paymentIntentId as string,
          {
            expand: [isSubscription ? "invoice.subscription" : "latest_charge"],
          },
        );
        meta = Object.keys(intent.metadata).length > 0 ? intent.metadata : null;
      } catch (error) {
        const checkout = await this.getCheckoutById(paymentIntentId as string);
        meta =
          ((Object.keys(checkout?.metadata || {}).length > 0
            ? checkout?.metadata
            : null) as Record<string, string>) || null;
      }
    }

    if (!meta) {
      logger.warn(
        `[StripeIntegration] Failed to find metadata in failure paymentIntentId=${paymentIntentId}`,
      );
      return null;
    }
    return {
      userId: meta.userId,
      redirectUrl: meta.redirectUrl || null,
      rawPayload: JSON.stringify(failedObject),
      stripeEventType: "payment_intent.payment_failed",
      orderType: OrderType.PREORDER,
      type: OrderType.PREORDER,
      quantity: +meta.quantity || 1,
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
          quantity,
        } = preorderSchema.parse({
          ...metadata,
          amount: orderTotal,
          eventId: event.id,
          paymentLinkId: session.payment_link,
          quantity: +(metadata.quantity || 1),
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
          quantity,
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
          addressId,
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
          addressId: addressId as any,
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

  createPreorderPaymentLink = async (opts: {
    userId: string;
    editionId: string;
    choice: PlanType;
    amount: number;
    addressId: string | null;
    redirectUrl: string;
    preorderId: string;
    quantity?: number;
    shippingCents?: number;
    shippingZone?: string;
  }) => {
    logger.info(
      `[StripeIntegration] Creating preorder payment link for userId=${opts.userId}, editionId=${opts.editionId}, plan=${opts.choice}`,
    );
    const parsed = z
      .object({
        userId: z.string().min(1),
        editionId: z.string().min(1),
        choice: z.enum(PlanType),
        amount: z.number().min(1),
        addressId: z.string().min(1).nullable(),
        redirectUrl: z.string().min(1),
        preorderId: z.string().min(1),
        quantity: z.number().nonnegative(),
        shippingCents: z.number().optional(),
        shippingZone: z.string().optional(),
      })
      .parse(opts);

    // 🧮 Ensure correct pricing from your own logic if you don’t trust `amount`
    const priceInCents = Math.round(parsed.amount);
    const metadata = {
      userId: parsed.userId,
      editionId: parsed.editionId,
      plan: parsed.choice,
      type: OrderType.PREORDER,
      addressId: parsed.addressId,
      preorderId: parsed.preorderId,
      redirectUrl: parsed.redirectUrl,
      quantity: parsed.quantity,
    };

    const lineItems: Stripe.PaymentLinkCreateParams.LineItem[] = [
      {
        price_data: {
          currency: "gbp",
          product_data: {
            name: `Bolaji Edition 00 — ${parsed.choice}`,
          },
          unit_amount: Math.round(parsed.amount),
        },
        quantity: Math.max(1, opts.quantity || 1),
      },
    ];

    // ✅ Add shipping as its own line if applicable
    if (
      parsed.shippingCents &&
      parsed.shippingCents > 0 &&
      parsed.shippingZone
    ) {
      lineItems.push({
        price_data: {
          currency: "gbp",
          product_data: {
            name: `Shipping (${parsed.shippingZone || "International"})`,
          },
          unit_amount: parsed.shippingCents,
        },
        quantity: 1,
      });
    }

    const params: Stripe.PaymentLinkCreateParams = {
      line_items: lineItems,
      metadata,
      payment_intent_data: { metadata },
      after_completion: {
        type: "redirect",
        redirect: { url: parsed.redirectUrl || this.paymentRedirectUrl },
      },
    };

    // ✅ Create hosted payment link
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

  hasExistingSubscription = async ({
    customerId,
    planId,
    subscriptionId,
  }: {
    customerId: string;
    planId: string;
    subscriptionId: string;
  }) => {
    const sub = await this.getSubscription(subscriptionId);

    return (
      sub.status === "active" &&
      sub.metadata.planId === planId &&
      customerId === sub.customer
    );
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
      shippingCents?: number;
      shippingZone?: string;
    },
    idempotencyKey?: string,
  ) => {
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

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: params.priceId, quantity: 1 },
    ];

    // ✅ Add shipping as a one-time setup fee
    if (
      params.shippingCents &&
      params.shippingCents > 0 &&
      params.shippingZone
    ) {
      const shippingPrice = await this.shippingPrice.findExistingPrice(
        params.shippingZone,
        params.shippingCents,
      );
      if (shippingPrice?.id)
        lineItems.push({
          price: shippingPrice?.id,
          quantity: 1,
        });
    }

    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: params.stripeCustomerId,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        allow_promotion_codes: true,
        client_reference_id: `${params.userId}:${params.planId}`,
        line_items: lineItems,
        metadata,
        subscription_data: { metadata },
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
    logger.info(
      `[StripeIntegration] ✅ Created Stripe checkout session id=${session.id}s`,
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return {
      checkoutUrl: session.url,
      stripePaymentLinkId: session.payment_link,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: session.payment_intent?.toString(),
    };
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
        `Failed to handle stripe event type=${(reqBody as any)?.type || "no type found"}`,
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
        return this.handlePreorderOrSubscriptionCheckoutFailure(
          event.data.object as any,
        );
      }

      // 🔴 Direct payment failures (card declined, etc.)
      case "payment_intent.payment_failed":
      case "charge.failed": {
        return this.handlePreorderOrSubscriptionCheckoutFailure(
          event.data.object,
        );
      }

      // 🟢 Subscription lifecycle
      case "customer.subscription.created": {
        // First subscription creation (user just subscribed)
        logger.info(
          `[StripeIntegration] Subscription created (id=${event.data.object.id}) — handled via checkout.session.completed.`,
        );

        return null;
      }

      // 🟢 Renewal success
      case "invoice.payment_succeeded": {
        // Renewal payment succeeded → unlock next edition
        return this.handleRollingSubscription(event);
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
  private handleAsyncPaymentComplete(
    event: Stripe.CheckoutSessionAsyncPaymentSucceededEvent,
  ) {
    return null;
  }
  /**
   * @deprecated Unused
   */
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
  private handlePaymentFailed(event: Stripe.PaymentIntentPaymentFailedEvent) {
    return null;
  }
  private handleRollingSubscription(
    event: Stripe.InvoicePaymentSucceededEvent,
  ): PaymentEvent | null {
    const invoice = event.data.object;
    // 🔍 Detect whether this is the *first* invoice for a new subscription
    if (invoice.billing_reason === "subscription_create") {
      logger.info(
        `[StripeIntegration] Skipping first-cycle invoice; handled by checkout.session.completed`,
      );
      return null;
    }

    // ✅ Continue only if it's a recurring renewal
    const metadata = invoice.lines.data[0]?.metadata;
    if (!metadata) {
      logger.warn(
        `[StripeIntegration] No metadata found on invoice ${invoice.id}`,
      );
      return null;
    }
    const { userId, subscriptionId, planId, type, eventId } =
      subscriptionSchema.parse({
        ...metadata,
        eventId: event.id,
        isNewSubscription: false,
      });
    const stripeSubscriptionId = z
      .string()
      .min(1)
      .parse(event.data.object.parent?.subscription_details?.subscription);
    return {
      isNewSubscription: false,
      success: true,
      stripeEventType: event.type,
      type,
      userId,
      rawPayload: JSON.stringify(event.data),
      eventId: eventId,
      orderType: type,
      subscriptionId,
      subscriptionPlanId: planId,
      amount: event.data.object.amount_paid,
      stripeInvoiceId: event.data.object.id,
      stripeSubscriptionId,
    };
  }
  private handleInvoiceFailed(event: Stripe.InvoicePaymentFailedEvent) {
    return null;
  }
  private handleSubscriptionCanceled(
    event: Stripe.CustomerSubscriptionDeletedEvent,
  ) {
    return null;
  }
}
