import { Db } from "@/infra";
import { logger } from "@/lib/logger";
import { Config } from "../../config";
import { EmailEventType } from "@/generated/prisma/enums";
import { AdminEmailIntegration } from "./admin.email.integration";
import { EmailIntegration } from "./email.integration";
import { StripeIntegration } from "./stripe.integration";
import { StripeShippingService } from "./stripeShipping.integration";
import { Webhook } from "svix";

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

  constructEmailEventPayload = (payload: any) => {
    const eventType = payload?.type as string | undefined;

    const events = [
      "email.unsubscribed",
      "email.complained",
      "email.bounced",
      "email.clicked",
      "email.sent",
      "email.delivered",
      "email.opened",
    ];

    if (!events.includes(eventType || "")) return null;

    const data = payload?.data ?? {};

    const campaign = data.tags.campaign || null;
    const providerEventId = data?.email_id || data?.id;

    if (!campaign) {
      logger.info(
        `[handleEmailWebhook]: No campaign found on id=${providerEventId}`,
      );
      return null;
    }

    const toEmail = Array.isArray(data?.to) ? data.to[0] : data?.to;

    if (!eventType || !providerEventId || !toEmail) {
      logger.warn(
        { eventType, providerEventId, toEmail },
        "[Integrations] Invalid email webhook payload",
      );
      return null;
    }

    const status =
      {
        "email.sent": EmailEventType.SENT,
        "email.delivered": EmailEventType.DELIVERED,
        "email.opened": EmailEventType.OPENED,
        "email.clicked": EmailEventType.CLICKED,
        "email.bounced": EmailEventType.BOUNCED,
        "email.complained": EmailEventType.SPAM,
        "email.unsubscribed": EmailEventType.UNSUBSCRIBED,
      }[eventType] || EmailEventType.FAILED;

    const createdAt = payload?.created_at
      ? new Date(payload.created_at)
      : new Date();

    const statusFields: any = {
      status,
      lastEventAt: createdAt,
    };

    if (status === EmailEventType.SENT) statusFields.sentAt = createdAt;

    if (status === EmailEventType.DELIVERED)
      statusFields.deliveredAt = createdAt;

    if (status === EmailEventType.OPENED) statusFields.openedAt = createdAt;

    if (status === EmailEventType.CLICKED) statusFields.clickedAt = createdAt;

    if (status === EmailEventType.BOUNCED) statusFields.bouncedAt = createdAt;

    if (status === EmailEventType.SPAM) statusFields.spamReportedAt = createdAt;

    if (status === EmailEventType.UNSUBSCRIBED)
      statusFields.unsubscribedAt = createdAt;

    return {
      campaign,
      toEmail,
      providerEventId,
      eventType: status,
      occurredAt: createdAt,
      payload: JSON.stringify(payload) ?? null,
    };
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
