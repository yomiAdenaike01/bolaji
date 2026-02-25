import { Config } from "@/config";
import { Domain } from "@/domain/domain";
import { Store } from "@/infra";
import { AuthController } from "./auth.controller";
import { EditionsAccessController } from "./editions-access.controller";
import { FaqController } from "./faq.controller";
import { IntegrationsController } from "./integrations.controller";
import { JobController } from "./job.controller";
import { PreorderController } from "./preorder.controller";
import { ScreenController } from "./screen.controller";
import { SubscriptionsController } from "./subscriptions.controller";
import { UserController } from "./user.controller";
import { WebhookController } from "./webhook.controller";

// [TODO]: Refactor intergrations and webhook controller implementation doesn't make sense
export const initControllers = (
  store: Store,
  config: Config,
  domain: Domain,
) => {
  const integrations = new IntegrationsController(config, domain);
  return {
    auth: new AuthController(config, domain, store),
    user: new UserController(domain),
    preorders: new PreorderController(store, config, domain),
    subscriptions: new SubscriptionsController(domain, config),
    screens: new ScreenController(config, domain),
    integrations,
    jobs: new JobController(config, domain),
    faqs: new FaqController(),
    editionsAccess: new EditionsAccessController(domain),
    webhooks: new WebhookController(integrations, domain),
  };
};

export type Controllers = ReturnType<typeof initControllers>;
