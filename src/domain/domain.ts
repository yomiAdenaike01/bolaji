import { Db, Store } from "@/infra";
import { Integrations } from "@/infra/integrations";
import { Config } from "../config";
import { JobsQueues } from "../infra/workers/jobs-queue";
import { AuthService } from "./auth/auth.service";
import { PreordersService } from "./preorders/preorders.service";
import { SessionService } from "./session/session";
import { SubscriptionsService } from "./subscriptions/subscriptions.service";
import { UserService } from "./user/users.service";
import { EditionsService } from "./editions.service";
import { NotificationService } from "./notifications/notification.service";
import { PasswordService } from "./password/password.service";
import { PricingService } from "./pricing.service";
import { StripeShippingService } from "@/infra/integrations/stripeShipping.integration";

export const initDomain = async (appConfig: Config, store: Store, db: Db) => {
  const pricingService = new PricingService();
  const shippingHelper = new StripeShippingService(pricingService);
  const integrations = new Integrations(db, appConfig, shippingHelper);
  await integrations.init();
  const userService = new UserService(db, integrations);

  const jobQueues = new JobsQueues(appConfig.redisConnectionUrl);
  const passwordService = new PasswordService();
  const preorders = new PreordersService(
    appConfig,
    db,
    userService,
    integrations,
    store,
    passwordService,
    pricingService,
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
    editions: new EditionsService(db, store, jobQueues),
    session: new SessionService(appConfig, db, store),
    user: userService,
    auth: new AuthService(db, userService),
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
