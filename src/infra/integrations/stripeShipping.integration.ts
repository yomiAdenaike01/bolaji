import { PricingService, ShippingZone } from "@/domain/pricing.service";
import { logger } from "@/lib/logger";
import Stripe from "stripe";

export class StripeShippingService {
  private integration!: Stripe;
  constructor(private readonly pricingService: PricingService) {}

  ensure(integration: Stripe) {
    this.integration = integration;
    this.ensureAllShippingPrices()
      .then((pricing) => {
        logger.info(
          pricing,
          "[StripeShippingService] ✅ Successfully set shipping prices",
        );
      })
      .catch((err) => {
        logger.error(
          err,
          "[StripeShippingService] Failed to initialise shipping cost products",
        );
      });
  }

  async findExistingPrice(name: string, amount: number) {
    try {
      const prices = await this.integration.prices.list({
        expand: ["data.product"],
        active: true,
        limit: 100,
      });

      return prices.data.find(
        (p) =>
          p.unit_amount === amount &&
          p.currency === "gbp" &&
          (p.product as Stripe.Product).name === name &&
          p.recurring?.interval === "month",
      );
    } catch (error) {
      logger.error(
        error,
        "[StripeShippingService] Failed to fetch shipping prices",
      );
      return null;
    }
  }

  private async ensureRecurringShippingPrice(
    zone: ShippingZone,
  ): Promise<string> {
    const name = this.pricingService.getShippingZone(zone);
    const amount = this.pricingService.getShippingPrice(zone);
    const existing = await this.findExistingPrice(name, amount);
    if (existing) {
      return existing.id;
    }

    // 🆕 Create product
    const product = await this.integration.products.create({
      name,
      description: `Monthly recurring shipping charge for ${zone}`,
    });

    // 🆕 Create recurring monthly price
    const price = await this.integration.prices.create({
      currency: "gbp",
      unit_amount: amount,
      recurring: { interval: "month" },
      product: product.id,
    });

    logger.info(
      `[StripeShippingService] Created new shipping price for ${zone}: ${price.id}`,
    );
    return price.id;
  }

  private async ensureAllShippingPrices(): Promise<
    Record<ShippingZone, string>
  > {
    const result: Record<ShippingZone, string> = {
      UK: await this.ensureRecurringShippingPrice("UK"),
      EUROPE: await this.ensureRecurringShippingPrice("EUROPE"),
      ROW: await this.ensureRecurringShippingPrice("ROW"),
    };
    return result;
  }
}
