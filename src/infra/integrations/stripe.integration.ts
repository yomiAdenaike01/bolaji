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
}
export class StripeIntegration {
  private constructSubscriptionCreatedData = (
    event: Stripe.CustomerSubscriptionCreatedEvent,
  ): PaymentEvent | null => {
    logger.info("[StripeIntegration] Subscription created");
    const metadata = event.data.object?.metadata;
    if (!metadata) return null;
    const parsed = onCreateSubscriptionInputSchema.parse(metadata);
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
    logger.info("[StripeIntegration]: Processing event...");

    const session = event.data.object;
    const metadata = session.metadata;
    const orderTotal = session.amount_total ?? session.amount_subtotal ?? 0;
    const rawPayload = JSON.stringify(event);
    const stripeEventType = event.type;

    if (!metadata) throw new Error("Metadata is not defined");

    if (!Object.keys(metadata).every(Boolean))
      throw new Error("Metadata is not defined");

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
          "[StripeIntegration:constructCheckoutEventData]: Parsed preorder data",
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
        const { userId, subscriptionId, planId, type, eventId } =
          subscriptionSchema.parse({
            ...metadata,
            eventId: event.id,
          });

        logger.info("[StripeIntegration] Parsed subscription renewal data");

        return {
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
  private stripe!: Stripe;

  constructor(
    apiKey: string,
    private readonly webhookSecret: string,
    private readonly paymentRedirectUrl: string,
  ) {
    try {
      this.stripe = new Stripe(apiKey, { apiVersion: "2025-09-30.clover" });
    } catch (error) {
      console.error(error);
    }
  }

  createPreorderPaymentLink = async (opts: {
    userId: string;
    editionId: string;
    choice: PlanType;
    amount: number;
    addressId: string | null;
    redirectUrl: string;
  }) => {
    const parsed = z
      .object({
        userId: z.string().min(1),
        editionId: z.string().min(1),
        choice: z.enum(["DIGITAL", "PHYSICAL", "FULL"]),
        amount: z.number().min(1),
        addressId: z.string().min(1).nullable(),
        redirectUrl: z.string().min(1),
      })
      .parse(opts);

    // 🧮 Ensure correct pricing from your own logic if you don’t trust `amount`
    const priceInCents = Math.round(parsed.amount);

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
      metadata: {
        userId: parsed.userId,
        editionId: parsed.editionId,
        plan: parsed.choice,
        type: "PREORDER",
        addressId: parsed.addressId,
      },
      after_completion: {
        type: "redirect",
        redirect: { url: parsed.redirectUrl || this.paymentRedirectUrl },
      },
    };
    // 🧱 Create a hosted payment link
    const paymentLink = await this.stripe.paymentLinks.create(params);

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
    },
    idempotencyKey?: string,
  ): Promise<{ checkoutUrl: string; stripeCheckoutSessionId: string }> => {
    const metadata = {
      ...(params.addressId ? { addressId: params.addressId } : {}),
      userId: params.userId,
      planId: params.planId,
      subscriptionId: params.subscriptionId,
      type: OrderType.SUBSCRIPTION_RENEWAL,
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

    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return { checkoutUrl: session.url, stripeCheckoutSessionId: session.id };
  };
  ensureCustomer = async (
    params: {
      userId: string;
      email?: string | null;
      stripeCustomerId?: string | null;
    },
    setCustomerId: (id: string) => Promise<void>,
  ): Promise<string> => {
    if (params.stripeCustomerId) return params.stripeCustomerId;

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

      const idempotencyKey = crypto
        .createHash("sha256")
        .update(JSON.stringify(params))
        .digest("hex");

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
      case "checkout.session.completed":
        return this.constructCheckoutEventData(event);
      case "customer.subscription.created":
        return this.constructSubscriptionCreatedData(event);
      // case "payment_intent.payment_failed":
      //   return this.handlePaymentFailed(event);
      // case "invoice.payment_succeeded":
      //   return this.handleInvoiceSuccess(event);
      // case "invoice.payment_failed":
      //   return this.handleInvoiceFailed(event);
      // case "customer.subscription.deleted":
      //   return this.handleSubscriptionCanceled(event);
    }
    return null;
  };
}
