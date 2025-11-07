import { PricingService, ShippingZone } from "@/domain/pricing.service";
import { logger } from "@/lib/logger";
import Stripe from "stripe";

export class StripeShippingService {
  private integration!: Stripe;
  constructor(private readonly pricingService: PricingService) {}

  ensure = async (integration: Stripe) => {
    try {
      this.integration = integration;

      const pricing = await this.ensureAllShippingPrices();
      logger.info(
        pricing,
        "[StripeShippingService] ✅ Successfully set shipping prices",
      );
    } catch (err) {
      logger.error(
        err,
        "[StripeShippingService] ❌ Failed to initialise shipping cost products",
      );
    }
  };

  async findExistingPrice(zone: string, amount: number) {
    try {
      const prices = await this.integration.prices.list({
        expand: ["data.product"],
        active: true,
        limit: 100,
      });

      return prices.data.find((p) => {
        const product = p.product as Stripe.Product;
        return (
          p.unit_amount === amount &&
          p.currency === "gbp" &&
          p.recurring?.interval === "month" &&
          (product.metadata?.zone === zone ||
            product.name === `Shipping (${zone})`)
        );
      });
    } catch (error) {
      logger.error(error, "[StripeShippingService] Failed to fetch prices");
      return null;
    }
  }

  private async ensureRecurringShippingPrice(
    zone: ShippingZone,
  ): Promise<string> {
    const name = this.pricingService.getShippingZone(zone);
    const amount = this.pricingService.getShippingPrice(zone);

    const existing = await this.findExistingPrice(zone, amount);
    if (existing) {
      logger.info(
        `[StripeShippingService] Using existing shipping price for ${zone}: ${existing.id}`,
      );
      return existing.id;
    }

    // 🆕 Create unique product for zone
    const product = await this.integration.products.create({
      name: `Shipping (${zone})`,
      description: `Monthly recurring shipping charge for ${zone}`,
      metadata: { zone },
    });

    // 🆕 Create recurring monthly price
    const price = await this.integration.prices.create({
      currency: "gbp",
      unit_amount: amount,
      recurring: { interval: "month" },
      product: product.id,
      metadata: { zone },
    });

    logger.info(
      `[StripeShippingService] Created new shipping price for ${zone}: ${price.id}`,
    );

    return price.id;
  }

  private async ensureAllShippingPrices(): Promise<
    Record<ShippingZone, string>
  > {
    const zones: ShippingZone[] = ["UK", "EUROPE", "ROW"];

    const entries = await Promise.all(
      zones.map(async (zone) => {
        const id = await this.ensureRecurringShippingPrice(zone);
        return [zone, id] as const;
      }),
    );

    return Object.fromEntries(entries) as Record<ShippingZone, string>;
  }
}
