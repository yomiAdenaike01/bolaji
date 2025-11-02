import { Db, Store } from "@/infra";
import { Integrations } from "@/infra/integrations";
import { Config } from "../config";
import { AuthService } from "./auth/auth.service";
import { PreordersService } from "./preorders/preorders.service";
import { SessionService } from "./session/session";
import { UserService } from "./user/users.service";
import { SubscriptionsService } from "./subscriptions/subscriptions.service";
import { JobsQueues } from "../infra/workers/jobs-queue";
import { OrderStatus, PlanType } from "@/generated/prisma/enums";

export const initDomain = (appConfig: Config, store: Store, db: Db) => {
  const integrations = new Integrations(db, store, appConfig);
  const userService = new UserService(db, integrations);

  const jobQueues = new JobsQueues(appConfig.redisConnectionUrl);
  const preorders = new PreordersService(
    appConfig,
    db,
    userService,
    integrations,
  );
  return {
    preorders,
    session: new SessionService(appConfig, db, store),
    user: userService,
    auth: new AuthService(db, userService),
    integrations,
    jobQueues,
    subscriptions: new SubscriptionsService(db, integrations, jobQueues),
  };
};

export type Domain = ReturnType<typeof initDomain>;
