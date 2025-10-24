import { Config } from "../config";
import { Db } from "@/infra";
import { Integrations } from "@/infra/integrations";
import { PreordersService } from "./preorders/preorders.service";
import { SessionService } from "./session/session";
import { UserService } from "./user/users";

export const initDomain = (appConfig: Config, db: Db) => {
  const integrations = new Integrations(appConfig);
  return {
    preorders: new PreordersService(db, integrations),
    session: new SessionService(),
    user: new UserService(db, integrations),
  };
};

export type Domain = ReturnType<typeof initDomain>;
