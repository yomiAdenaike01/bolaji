import { Domain } from "@/domain/domain.js";
import { IntegrationsController } from "./integrations.controller.js";
import { WebhookController } from "./webhook.controller.js";

export const createStripePaymentWebhook = (
  integrationsCtrl: IntegrationsController,
  domain: Domain,
) => new WebhookController(integrationsCtrl, domain).handle();
