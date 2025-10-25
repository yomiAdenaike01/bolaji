import { Domain } from "@/domain/domain";
import { UserController } from "./user.controller";
import { PreorderController } from "./preorder.controller";
import { AuthController } from "./auth.controller";

export const initControllers = (domain: Domain) => {
  return {
    auth: new AuthController(domain),
    user: new UserController(domain),
    preorders: new PreorderController(domain),
  };
};

export type Controllers = ReturnType<typeof initControllers>;
