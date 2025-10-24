import Stripe from "stripe";
import z from "zod";

export class StripeIntegration {
  private stripe!: Stripe;

  constructor(apiKey: string) {
    try {
      this.stripe = new Stripe(apiKey, { apiVersion: "2025-09-30.clover" });
    } catch (error) {
      console.error(error);
    }
  }

  async createPreorderPaymentLink(opts: {
    userId: string;
    editionId: string;
    choice: "DIGITAL" | "PHYSICAL" | "FULL";
    amount: number;
  }) {
    const parsed = z
      .object({
        userId: z.string().min(1),
        editionId: z.string().min(1),
        choice: z.enum(["DIGITAL", "PHYSICAL", "FULL"]),
        amount: z.number().min(1),
      })
      .parse(opts);

    // 🧮 Ensure correct pricing from your own logic if you don’t trust `amount`
    const priceInCents = Math.round(parsed.amount);

    // 🧱 Create a hosted payment link
    const paymentLink = await this.stripe.paymentLinks.create({
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
      },
      after_completion: {
        type: "redirect",
        redirect: { url: "https://yourframer.site/thank-you" },
      },
    });

    // 🧾 Return data that your backend can store in Prisma
    return {
      stripePaymentLinkId: paymentLink.id,
      url: paymentLink.url,
      amount: priceInCents,
      currency: "GBP",
    };
  }

  async retrievePaymentIntent(id: string) {
    return await this.stripe.paymentIntents.retrieve(id);
  }

  async handleWebhook(requestBody: Buffer, signature: string, secret: string) {
    const event = this.stripe.webhooks.constructEvent(
      requestBody,
      signature,
      secret,
    );
    return event;
  }
}
