import { OrderStatus, PlanType } from "@/generated/prisma/enums";
import Stripe from "stripe";
import z from "zod";
import { Db } from "..";
import { EmailIntegration } from "./email.integration";
import { EmailType } from "./email.integrations.templates";
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";

export class StripeIntegration {
  private getPrice(choice: PlanType) {
    switch (choice) {
      case "DIGITAL":
        return 500;
      case "PHYSICAL":
      case "FULL":
        return 850;
      default:
        throw new Error("Invalid plan type");
    }
  }
  handleCheckoutCompleted = async (
    event: Stripe.CheckoutSessionCompletedEvent,
  ) => {
    try {
      const {
        userId,
        plan,
        type,
        editionId,
        addressId = null,
      } = z
        .object({
          editionId: z.string().min(1),
          plan: z.enum(PlanType),
          type: z.string().min(1),
          userId: z.string().min(1),
          addressId: z.string().nullable(),
        })
        .parse(event.data.object.metadata);

      const user = await this.db.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            userId,
            editionId,
            stripePaymentIntentId: event.id,
            currency: "GBP",
            status: OrderStatus.PAID,
            totalCents: 0,
            type: "PREORDER",
          },
          include: {
            user: {
              include: {
                addresses: true,
              },
            },
          },
        });

        const amount =
          event.data.object.amount_total ||
          event.data.object.amount_subtotal ||
          this.getPrice(plan);

        if (!amount)
          throw new Error(`Amount is undefined or zero amount=${amount}`);

        await tx.payment.create({
          data: {
            orderId: order.id,
            providerPaymentId: event.id,
            userId,
            provider: "STRIPE",
            status: "SUCCEEDED",
            amountCents: amount,
          },
        });
        if (plan !== PlanType.PHYSICAL) {
          await tx.editionAccess.create({
            data: {
              editionId,
              userId,
              unlockedAt: new Date(),
            },
          });
        }
        if ([PlanType.FULL, PlanType.PHYSICAL].includes(plan as any)) {
          if (!addressId) {
            throw new Error("Address is not defined");
          }
          await tx.shipment.create({
            data: {
              userId,
              editionId,
              addressId,
              status: "PENDING",
            },
          });
        }

        return {
          email: order.user.email,
          name: order.user.name,
        };
      });
      await this.emailIntegration.sendEmail({
        email: user.email,
        type: EmailType.PREORDER_CONFIRMATION,
        content: {
          editionCode: "EDI00",
          email: user.email,
          name: user.name || "",
          plan,
        },
      });
    } catch (error) {
      console.error(error);
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
    private readonly db: Db,
    private readonly emailIntegration: EmailIntegration,
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

  handleWebhook = async (requestBody: Buffer, signature: string) => {
    const event = this.stripe.webhooks.constructEvent(
      requestBody,
      signature,
      this.webhookSecret,
    );
    switch (event.type) {
      case "checkout.session.completed":
        return this.handleCheckoutCompleted(event);
      // case "payment_intent.payment_failed":
      //   return this.handlePaymentFailed(event);
      // case "invoice.payment_succeeded":
      //   return this.handleInvoiceSuccess(event);
      // case "invoice.payment_failed":
      //   return this.handleInvoiceFailed(event);
      // case "customer.subscription.deleted":
      //   return this.handleSubscriptionCanceled(event);
    }
    return event;
  };
}
