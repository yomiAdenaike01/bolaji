import { Router } from "express";
import { UserController } from "../controllers/user.controller.js";

export const makeUserRouter = (userController: UserController) => {
  const r = Router();
  r.post("/create", userController.handleCreateUser);
  r.get("/editions/access", userController.handleGetEditionsAccess);
  r.get("/addresses", userController.handleGetUserAddreses);

  return r;
};
