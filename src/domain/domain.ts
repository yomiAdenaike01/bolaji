import { Config } from "../config";
import { Db, Store } from "@/infra";
import { Integrations } from "@/infra/integrations";
import { PreordersService } from "./preorders/preorders.service";
import { SessionService } from "./session/session";
import { UserService } from "./user/users.service";
import { AuthService } from "./auth/auth.service";

export const initDomain = (appConfig: Config, store: Store, db: Db) => {
  const integrations = new Integrations(db, store, appConfig);
  const userService = new UserService(db, integrations);
  return {
    preorders: new PreordersService(db, userService, integrations),
    session: new SessionService(),
    user: userService,
    auth: new AuthService(db, userService),
    integrations,
  };
};

export type Domain = ReturnType<typeof initDomain>;
