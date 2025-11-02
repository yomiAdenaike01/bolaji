import { Domain } from "@/domain/domain";
import { AuthController } from "./auth.controller";
import { IntegrationsController } from "./integrations.controller";
import { PreorderController } from "./preorder.controller";
import { UserController } from "./user.controller";
import { createStripePaymentWebhook } from "./createStripeWebhook";
import { SubscriptionsController } from "./subscriptions.controller";
import { Config } from "@/config";
import { Store } from "@/infra";
import { ScreenController } from "./screen.controller";

export const initControllers = (
  store: Store,
  config: Config,
  domain: Domain,
) => {
  const integrations = new IntegrationsController(domain);
  return {
    auth: new AuthController(config, domain, store),
    user: new UserController(domain),
    preorders: new PreorderController(store, config, domain),
    subscriptions: new SubscriptionsController(domain),
    screens: new ScreenController(config, domain),
    integrations,
    stripePaymentWebhook: createStripePaymentWebhook(integrations, domain),
  };
};

export type Controllers = ReturnType<typeof initControllers>;
export type PaymentsWebhookHandler = Controllers["stripePaymentWebhook"];
