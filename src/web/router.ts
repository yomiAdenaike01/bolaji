import bodyParser from "body-parser";
import express, {
  Application,
  Router
} from "express";
import { StatusCodes } from "http-status-codes";
import { AuthController } from "./controllers/auth.controller";
import { Controllers, PaymentsWebhookHandler } from "./controllers/controllers";
import { FaqController } from "./controllers/faq.controller";
import { PreorderController } from "./controllers/preorder.controller";
import { SubscriptionsController } from "./controllers/subscriptions.controller";
import { UserController } from "./controllers/user.controller";
import { AuthGuard } from "./middleware";



const makeAuthRouter = (
  authGuard: AuthGuard,
  authController: AuthController,
) => {
  const r = express.Router();
  r.post("/authenticate", authController.handleAuthenticateUser);
  r.get("/dev/authenticate", authController.handleDevAuth);
  r.post("/reset-password", authController.handleResetPassword);
  r.get("/is-valid", authGuard, (req, res) => {
    res.status(200).json({ isValid: true });
  });

  return r;
};

const makeUserRouter = (userController: UserController) => {
  const r = express.Router();
  r.post("/create", userController.handleCreateUser);
  r.get(
    "/editions/access",
    userController.handleGetEditionsAccess,
  );
  r.get(
    "/addresses",
    userController.handleGetUserAddreses,
  );

  return r;
};

const makeFaqsRouter = (faqController: FaqController) => {
  const r = Router();
  r.get("/", faqController.handleGetFaqs);
  return r;
};

const makeSubscriptionsRouter = (
  authGuard: AuthGuard,
  subscriptionsController: SubscriptionsController,
) => {
  const r = Router();
  r.get("/thank-you", subscriptionsController.handleThankYouPage);
  r.get("/cancel", subscriptionsController.handleSubscriptionCancelPage);
  r.post(
    "/create",
    // authGuard,
    subscriptionsController.handleCreateSubscription,
  );
  r.get(
    "/can-subscribe",
    authGuard,
    subscriptionsController.handleCanSubscribe,
  );

  return r;
};

const makePreorderRouter = (
  authGuard: AuthGuard,
  preorderController: PreorderController,
) => {
  const r = express.Router();
  r.post("/auth-exchange", preorderController.handlePreorderAuthExchange);
  r.get("/verify", authGuard, preorderController.handleCanAccessPreorder);
  r.get("/private-access", preorderController.renderPrivateAccessPage);
  r.post("/private-access", preorderController.handlePrivateAccessPassword);
  r.post("/", preorderController.handleCreatePreorder);
  r.get("/thank-you", preorderController.handlePreorderThankYou);
  r.post(
    "/create-user-preorder",
    preorderController.handleCreateUserAndPreorder,
  );
  return r;
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

export const setupRouters = (
  authGuard: AuthGuard,
  controllers: Controllers,
  app: Application,
) => {
  const router = express.Router();
  router.get("/healthz", (req, res) => {
    res.status(StatusCodes.OK).send("ok");
  });
  // #region auth router
  const authRouter = makeAuthRouter(authGuard, controllers.auth);
  // #endregion

  // #region user router
  const userRouter = makeUserRouter(controllers.user);
  // #endregion

  //#region pre-order router
  const preorderRouter = makePreorderRouter(authGuard, controllers.preorders);
  //#endregion

  //#region integration router
  const integrationsRouter = express.Router();
  //#endregion

  //#region subscriptions router
  const subscriptionsRouter = makeSubscriptionsRouter(
    authGuard,
    controllers.subscriptions,
  );
  //#endregion
  const faqRouter = makeFaqsRouter(controllers.faqs);

  router.use("/faqs", faqRouter);
  router.use("/subscriptions", subscriptionsRouter);
  router.use("/integrations", integrationsRouter);
  router.use("/auth", authRouter);
  router.use("/preorders", preorderRouter);
  router.use("/users", userRouter);
  app.use("/api", router);
};
