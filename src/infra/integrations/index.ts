import { Db } from "@/infra/index.js";
import { logger } from "@/lib/logger.js";
import { Config } from "../../config/index.js";
import { AdminEmailIntegration } from "./admin.email.integration.js";
import { EmailIntegration } from "./email.integration.js";
import { StripeIntegration } from "./stripe.integration.js";
import { StripeShippingService } from "./stripeShipping.integration.js";

export class Integrations {
  public readonly payments: StripeIntegration;
  public readonly email: EmailIntegration;
  public readonly adminEmail: AdminEmailIntegration;

  constructor(
    private readonly db: Db,
    private readonly appConfig: Config,
    shippingPriceHelper: StripeShippingService,
  ) {
    const {
      stripeApiKey,
      stripeWebhookSecret,
      resendApiKey,
      sentFromEmailAddr,
      stripePaymentRedirectUrl,
      adminEmailAddresses,
    } = this.appConfig;

    const emailIntegration = new EmailIntegration(
      resendApiKey,
      sentFromEmailAddr,
    );

    const adminEmailIntegration = new AdminEmailIntegration(
      resendApiKey,
      adminEmailAddresses,
      db,
      sentFromEmailAddr,
    );

    this.payments = new StripeIntegration(
      db,
      stripeApiKey,
      stripeWebhookSecret,
      stripePaymentRedirectUrl,
      shippingPriceHelper,
    );

    this.email = emailIntegration;
    this.adminEmail = adminEmailIntegration;
  }

  init = async () => {
    await this.payments.init();
  };

  beginEvent = async (eventId: string, eventType: string, rawPayload?: any) => {
    try {
      return await this.db.stripeEvent.create({
        data: {
          id: eventId,
          type: eventType,
          status: "PROCESSING",
          rawPayload: rawPayload ? JSON.stringify(rawPayload) : undefined,
        },
      });
    } catch (error: any) {
      if (error.code === "P2002") {
        const existing = await this.db.stripeEvent.findUnique({
          where: { id: eventId, type: eventType },
        });
        if (existing?.status === "HANDLED") {
          logger.info(`[Stripe] Event ${eventId} already handled.`);
          return null;
        }
        if (existing?.status === "PROCESSING") {
          logger.warn(`[Stripe] Event ${eventId} is already processing.`);
          return null;
        }
        if (existing?.status === "FAILED") {
          logger.warn(
            `[Stripe] Event ${eventId} previously failed — retrying.`,
          );
          // Optionally update it to PROCESSING again
          await this.db.stripeEvent.update({
            where: { id: eventId },
            data: { status: "PROCESSING" },
          });
          return existing;
        }
      }
      throw error;
    }
  };

  completeEvent = async (
    eventId: string,
    eventType: string,
    status: "HANDLED" | "FAILED",
    errorMessage?: string,
  ) => {
    try {
      logger.info(
        `[Integrations] Completing event eventId=${eventId} type=${eventType} status=${status} errorMessage=${errorMessage || "No error message"}`,
      );
      await this.db.stripeEvent.update({
        where: { id: eventId, type: eventType },
        data: {
          status,
          handledAt: status === "HANDLED" ? new Date() : null,
          rawPayload: errorMessage
            ? JSON.stringify({ error: errorMessage })
            : undefined,
        },
      });
    } catch (error) {
      logger.error(error, "Failed to update event");
    }
  };
}
