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

export const initDomain = (appConfig: Config, store: Store, db: Db) => {
  const integrations = new Integrations(db, store, appConfig);
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
  );
  return {
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
    ),
  };
};

export type Domain = ReturnType<typeof initDomain>;
