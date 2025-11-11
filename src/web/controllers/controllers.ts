import { Domain } from "@/domain/domain.js";
import { AuthController } from "./auth.controller.js";
import { IntegrationsController } from "./integrations.controller.js";
import { PreorderController } from "./preorder.controller.js";
import { UserController } from "./user.controller.js";
import { createStripePaymentWebhook } from "./createStripeWebhook.js";
import { SubscriptionsController } from "./subscriptions.controller.js";
import { Config } from "@/config/index.js";
import { Store } from "@/infra/index.js";
import { ScreenController } from "./screen.controller.js";
import { FaqController } from "./faq.controller.js";
import { JobController } from "./job.controller.js";

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
    subscriptions: new SubscriptionsController(domain, config),
    screens: new ScreenController(config, domain),
    integrations,
    jobs: new JobController(config, domain),
    faqs: new FaqController(),
    stripePaymentWebhook: createStripePaymentWebhook(integrations, domain),
  };
};

export type Controllers = ReturnType<typeof initControllers>;
export type PaymentsWebhookHandler = Controllers["stripePaymentWebhook"];
