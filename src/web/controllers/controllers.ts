import { Domain } from "@/domain/domain";
import { UserController } from "./user.controller";
import { PreorderController } from "./preorder.controller";
import { AuthController } from "./auth.controller";
import { IntegrationsController } from "./integrations.controller";

export const initControllers = (domain: Domain) => {
  return {
    auth: new AuthController(domain),
    user: new UserController(domain),
    preorders: new PreorderController(domain),
    integrations: new IntegrationsController(domain),
  };
};

export type Controllers = ReturnType<typeof initControllers>;
