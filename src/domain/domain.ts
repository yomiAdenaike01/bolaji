import { Db, Store } from "@/infra";
import { Integrations } from "@/infra/integrations";
import IORedis from "ioredis";
import { Config } from "../config";
import { AuthService } from "./auth/auth.service";
import { initSchedulers } from "./jobs/schedule";
import { PreordersService } from "./preorders/preorders.service";
import { SessionService } from "./session/session";
import { UserService } from "./user/users.service";
import { SubscriptionsService } from "./subscriptions/subscriptions.service";

export const initDomain = (
  appConfig: Config,
  store: Store,
  redis: IORedis,
  db: Db,
) => {
  const integrations = new Integrations(db, store, appConfig);
  const userService = new UserService(db, integrations);
  //#region schedulers
  initSchedulers(redis, db, integrations.email);
  //#endregion
  return {
    preorders: new PreordersService(db, userService, integrations),
    session: new SessionService(),
    user: userService,
    auth: new AuthService(db, userService),
    integrations,
    subscriptions: new SubscriptionsService(db, integrations),
  };
};

export type Domain = ReturnType<typeof initDomain>;
