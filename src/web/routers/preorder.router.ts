import { Router } from "express";
import { PreorderController } from "../controllers/preorder.controller.js";
import { AuthGuard } from "../middleware.js";

export const makePreorderRouter = (
  authGuard: AuthGuard,
  preorderController: PreorderController,
) => {
  const r = Router();
  r.post("/auth-exchange", preorderController.handlePreorderAuthExchange);
  r.get("/verify", authGuard, preorderController.handleCanAccessPreorder);
  r.get("/private-access", preorderController.renderPrivateAccessPage);
  r.post("/token", preorderController.handleGenerateToken);

  r.post("/private-access", preorderController.handlePrivateAccessPassword);
  r.post("/", preorderController.handleCreatePreorder);
  r.get("/thank-you", preorderController.handlePreorderThankYou);
  r.post(
    "/create-user-preorder",
    preorderController.handleCreateUserAndPreorder,
  );
  return r;
};
