import { Domain } from "@/domain/domain";
import { UserController } from "./user.controller";
import { PreorderController } from "./preorder.controller";
import { Return } from "@prisma/client/runtime/library";

export const initControllers = (domain: Domain) => {
  return {
    user: new UserController(domain),
    preorders: new PreorderController(domain),
  };
};

export type Controllers = ReturnType<typeof initControllers>;
