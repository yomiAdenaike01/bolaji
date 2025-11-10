import express, { Application } from "express";
import { StatusCodes } from "http-status-codes";
import { Controllers } from "./controllers/controllers.js";
import { AuthGuard, OptionalAuthGuard } from "./middleware.js";
import { makeAuthRouter } from "./routers/auth.router.js";
import { makeFaqsRouter } from "./routers/faq.router.js";
import { makePreorderRouter } from "./routers/preorder.router.js";
import { makeSubscriptionsRouter } from "./routers/subscriptions.router.js";
import { makeUserRouter } from "./routers/user.router.js";
import { Workspace } from "@/infra/index.js";

export const setupRouters = ({
  authGuard,
  optionalAuthGuard,
  controllers,
  app,
  workspace,
}: {
  workspace: Workspace;
  authGuard: AuthGuard;
  optionalAuthGuard: OptionalAuthGuard;
  controllers: Controllers;
  app: Application;
}) => {
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
    optionalAuthGuard,
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
  router.post(
    "/admin/update-preorder-job",
    controllers.jobs.handleSendWaitlist,
  );
  app.use("/api", router);
};
