import { Config } from "../../config";
import { StripeIntegration } from "./stripe.integration";
import { EmailIntegration } from "./email.integration";
import { Db, Store } from "@/infra";
import { AdminEmailIntegration } from "./admin.email.integration";
import { logger } from "@/lib/logger";
import { StripeShippingService } from "./stripeShipping.integration";

export class Integrations {
  public readonly payments: StripeIntegration;
  public readonly email: EmailIntegration;
  public readonly adminEmail: AdminEmailIntegration;

  constructor(
    private readonly db: Db,
    private readonly cache: Store,
    private readonly appConfig: Config,
    private readonly shippingPriceHelper: StripeShippingService,
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
          logger.info(`Event ${eventId} already handled.`);
          return null;
        }
        if (existing?.status === "PROCESSING") {
          logger.warn(`Event ${eventId} is already processing.`);
          return null;
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
