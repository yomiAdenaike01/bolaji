import { Db, Store } from "@/infra/index.js";
import { Integrations } from "@/infra/integrations/index.js";
import { Config } from "../config/index.js";
import { JobsQueues } from "../infra/workers/jobs-queue.js";
import { AuthService } from "./auth/auth.service.js";
import { PreordersService } from "./preorders/preorders.service.js";
import { SessionService } from "./session/session.js";
import { SubscriptionsService } from "./subscriptions/subscriptions.service.js";
import { UserService } from "./user/users.service.js";
import { EditionsService } from "./editions.service.js";
import { NotificationService } from "./notifications/notification.service.js";
import { PasswordService } from "./password/password.service.js";
import { PricingService } from "./pricing.service.js";
import { StripeShippingService } from "@/infra/integrations/stripeShipping.integration.js";

export const initDomain = async (appConfig: Config, store: Store, db: Db) => {
  const pricingService = new PricingService();
  const shippingHelper = new StripeShippingService(pricingService);
  const integrations = new Integrations(db, appConfig, shippingHelper);
  await integrations.init();
  const userService = new UserService(db, integrations);

  const jobQueues = new JobsQueues(appConfig.redisConnectionUrl);
  const passwordService = new PasswordService();
  const editionsService = new EditionsService(db, store, jobQueues);
  const preorders = new PreordersService(
    appConfig,
    db,
    userService,
    integrations,
    store,
    passwordService,
    pricingService,
    editionsService,
  );

  return {
    pricing: pricingService,
    password: passwordService,
    preorders,
    notifications: new NotificationService(
      integrations.email,
      integrations.adminEmail,
      jobQueues,
      db,
    ),
    editions: editionsService,
    session: new SessionService(appConfig, db, store),
    user: userService,
    auth: new AuthService(db, appConfig, userService),
    integrations,
    jobQueues,
    subscriptions: new SubscriptionsService(
      db,
      integrations,
      appConfig,
      jobQueues,
      pricingService,
    ),
  };
};

export type Domain = Awaited<ReturnType<typeof initDomain>>;
