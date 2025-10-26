import bodyParser from "body-parser";
import express, { Application } from "express";
import { StatusCodes } from "http-status-codes";
import { Controllers, PaymentsWebhookHandler } from "./controllers/controllers";

export const setupRouters = (controllers: Controllers, app: Application) => {
  const router = express.Router();
  // #region auth router
  const authRouter = express.Router();
  authRouter.post("/authenticate", controllers.auth.handleAuthenticateUser);
  // #endregion

  // #region user router
  const userRouter = express.Router();
  userRouter.post("/create", controllers.user.handleCreateUser);
  userRouter.get("/editions/access", controllers.user.handleGetEditionsAccess);
  // #endregion

  //#region pre-order router
  const preorderRouter = express.Router();
  preorderRouter.post("/create", controllers.preorders.handleCreatePreorder);
  preorderRouter.post(
    "/create-user-preorder",
    controllers.preorders.handleCreateUserAndPreorder,
  );
  //#endregion

  //#region integration router
  const integrationsRouter = express.Router();
  //#endregion

  router.use("/integrations", integrationsRouter);
  router.use("/auth", authRouter);
  router.use("/preorders", preorderRouter);
  router.use("/users", userRouter);
  app.use("/api", router);
};

export const createPaymentsRouter = (
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
