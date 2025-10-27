import { Domain } from "@/domain/domain";
import { IntegrationsController } from "./integrations.controller";
import { WebhookController } from "./webhook.controller";

export const createStripePaymentWebhook = (
  integrationsCtrl: IntegrationsController,
  domain: Domain,
) => new WebhookController(integrationsCtrl, domain).handle();
