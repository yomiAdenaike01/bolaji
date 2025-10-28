import bodyParser from "body-parser";
import express, { Application, Router } from "express";
import { StatusCodes } from "http-status-codes";
import { Controllers, PaymentsWebhookHandler } from "./controllers/controllers";
import { SubscriptionsController } from "./controllers/subscriptions.controller";
import { PreorderController } from "./controllers/preorder.controller";
import { UserController } from "./controllers/user.controller";
import { AuthController } from "./controllers/auth.controller";

const makeAuthRouter = (authController: AuthController) => {
  const r = express.Router();
  r.post("/authenticate", authController.handleAuthenticateUser);
  return r;
};

const makeUserRouter = (userController: UserController) => {
  const r = express.Router();
  r.post("/create", userController.handleCreateUser);
  r.get("/editions/access", userController.handleGetEditionsAccess);
  return r;
};

const makeSubscriptionsRouter = (
  subscriptionsController: SubscriptionsController,
) => {
  const r = Router();
  r.post("/create", subscriptionsController.handleCreateSubscription);
  return r;
};

const makePreorderRouter = (preorderController: PreorderController) => {
  const r = express.Router();
  r.post("/create", preorderController.handleCreatePreorder);
  r.post(
    "/create-user-preorder",
    preorderController.handleCreateUserAndPreorder,
  );
  return r;
};

export const setupRouters = (controllers: Controllers, app: Application) => {
  const router = express.Router();
  // #region auth router
  const authRouter = makeAuthRouter(controllers.auth);
  // #endregion

  // #region user router
  const userRouter = makeUserRouter(controllers.user);
  // #endregion

  //#region pre-order router
  const preorderRouter = makePreorderRouter(controllers.preorders);
  //#endregion

  //#region integration router
  const integrationsRouter = express.Router();
  //#endregion

  //#region subscriptions router
  const subscriptionsRouter = makeSubscriptionsRouter(
    controllers.subscriptions,
  );
  //#endregion
  router.use("/subscriptions", subscriptionsRouter);
  router.use("/integrations", integrationsRouter);
  router.use("/auth", authRouter);
  router.use("/preorders", preorderRouter);
  router.use("/users", userRouter);
  app.use("/api", router);
};

export const makePaymentsRouter = (
  app: Application,
  paymentWebhookHandler: PaymentsWebhookHandler,
) => {
  const paymentsRouter = express.Router();
  paymentsRouter.post(
    "/webhook",
    bodyParser.raw({ type: "application/json" }),
    paymentWebhookHandler,
  );
  paymentsRouter.get("/redirect", (req, res) => {
    res.status(StatusCodes.OK).json(req.body);
  });
  app.use("/api/integrations/payments", paymentsRouter);
};
