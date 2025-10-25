import { OrderType, PlanType } from "@/generated/prisma/enums";
import Stripe from "stripe";
import z from "zod";
import { CompletedPreoderEventDto, preorderSchema } from "./schema";

export class StripeIntegration {
  toPreoderCompleteDto = (
    event: Stripe.CheckoutSessionCompletedEvent,
  ): CompletedPreoderEventDto & { orderType: OrderType } => {
    if (!event?.data?.object?.metadata)
      throw new Error("Metadata is not defined");

    const orderTotal =
      event.data.object.amount_total || event.data.object.amount_subtotal;

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
      ...event.data.object.metadata,
      amount: orderTotal,
      eventId: event.id,
      paymentLinkId: event.data.object.payment_link,
    });

    return {
      userId,
      plan,
      orderType: type,
      editionId,
      addressId,
      eventId,
      amount,
      type,
      paymentLinkId,
    };
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
  }) => {
    const parsed = z
      .object({
        userId: z.string().min(1),
        editionId: z.string().min(1),
        choice: z.enum(["DIGITAL", "PHYSICAL", "FULL"]),
        amount: z.number().min(1),
        addressId: z.string().min(1).nullable(),
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
        redirect: { url: this.paymentRedirectUrl },
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

  handleWebhook = (requestBody: Buffer, signature: string) => {
    const event = this.stripe.webhooks.constructEvent(
      requestBody,
      signature,
      this.webhookSecret,
    );
    switch (event.type) {
      case "checkout.session.completed":
        return this.toPreoderCompleteDto(event);
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
