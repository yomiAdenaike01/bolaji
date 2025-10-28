import { Db, Store } from "@/infra";
import { Integrations } from "@/infra/integrations";
import IORedis from "ioredis";
import { Config } from "../config";
import { AuthService } from "./auth/auth.service";
import { PreordersService } from "./preorders/preorders.service";
import { SessionService } from "./session/session";
import { UserService } from "./user/users.service";
import { SubscriptionsService } from "./subscriptions/subscriptions.service";
import { JobsQueues } from "../infra/workers/jobs-queue";

export const initDomain = (
  appConfig: Config,
  store: Store,
  redis: IORedis,
  db: Db,
) => {
  const integrations = new Integrations(db, store, appConfig);
  const userService = new UserService(db, integrations);

  const jobQueues = new JobsQueues(appConfig.redisConnectionUrl);
  //#region schedulers
  //#endregion
  return {
    preorders: new PreordersService(db, userService, integrations),
    session: new SessionService(),
    user: userService,
    auth: new AuthService(db, userService),
    integrations,
    subscriptions: new SubscriptionsService(db, integrations, jobQueues),
  };
};

export type Domain = ReturnType<typeof initDomain>;
