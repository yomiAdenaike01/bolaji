import bodyParser from "body-parser";
import express, {
  Application,
  Router,
  NextFunction,
  Request,
  Response,
} from "express";
import { StatusCodes } from "http-status-codes";
import { AuthController } from "./controllers/auth.controller";
import { Controllers } from "./controllers/controllers";
import { FaqController } from "./controllers/faq.controller";
import { PreorderController } from "./controllers/preorder.controller";
import { UserController } from "./controllers/user.controller";
import { AuthGuard, OptionalAuthGuard } from "./middleware";
import { JobsQueues } from "@/infra/workers/jobs-queue";
import { createBullBoard } from "@bull-board/api";
import { ExpressAdapter } from "@bull-board/express";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { Config } from "@/config";
import { EditionsAccessController } from "./controllers/editions-access.controller";
import { WebhookController } from "./controllers/webhook.controller";
import { JobController } from "./controllers/job.controller";
import { makeSubscriptionsRouter } from "./routers/subscriptions.router";
import { makeEditionsAccessRouter } from "./routers/editions-access.router";

const makeAuthRouter = (
  authGuard: AuthGuard,
  authController: AuthController,
) => {
  const r = express.Router();
  r.post("/authenticate", authController.handleAuthenticateUser);
  r.post("/login", authController.handlePortalLogin);

  r.get("/dev/authenticate", authController.handleDevAuth);
  r.post("/reset-password", authController.handleResetPassword);
  r.get("/is-authenticated", authGuard, (req, res) => {
    res.status(200).json({
      isValid: true,
    });
  });
  r.get("/is-valid", authGuard, (req, res) => {
    const tknContext = (req as any)?.context; // returned from parseOrThrow()

    if (!tknContext || tknContext === "preorder") {
      return res.status(200).json({ isValid: true, context: "preorder" });
    }

    // Otherwise block
    return res.status(403).json({
      isValid: false,
      reason: "not preorder user",
    });
  });

  return r;
};

const makeUserRouter = (userController: UserController) => {
  const r = express.Router();
  r.post("/create", userController.handleCreateUser);
  r.get("/editions/access", userController.handleGetEditionsAccess);
  r.get("/addresses", userController.handleGetUserAddreses);

  return r;
};

const makeFaqsRouter = (faqController: FaqController) => {
  const r = Router();
  r.get("/", faqController.handleGetFaqs);
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

export const setupRouters = (
  authGuard: AuthGuard,
  optionalAuthGuard: OptionalAuthGuard,
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
  integrationsRouter.post(
    "/email/webhook",
    controllers.integrations.handleEmailEvents,
  );
  //#endregion

  //#region subscriptions router
  const subscriptionsRouter = makeSubscriptionsRouter(
    authGuard,
    optionalAuthGuard,
    controllers.subscriptions,
  );
  //#endregion
  const faqRouter = makeFaqsRouter(controllers.faqs);

  const editionsAccessRouter = makeEditionsAccessRouter(
    authGuard,
    controllers.editionsAccess,
  );

  router.use("/editions-access", editionsAccessRouter);
  router.use("/faqs", faqRouter);
  router.use("/subscriptions", subscriptionsRouter);
  router.use("/integrations", integrationsRouter);
  router.use("/auth", authRouter);
  router.use("/preorders", preorderRouter);
  router.use("/users", userRouter);

  app.use("/api", router);
};
