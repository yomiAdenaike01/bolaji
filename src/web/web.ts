import { Domain } from "@/domain/domain.js";
import { Store, Workspace } from "@/infra/index.js";
import express, { type Application } from "express";
import path from "path";
import { Config } from "../config/index.js";
import { initControllers } from "./controllers/controllers.js";
import { setupErrorHandlers, setupMiddlewares } from "./middleware.js";
import { setupRouters } from "./router.js";
import { makeBullMqRouter } from "./routers/bull.router.js";
import { makePaymentsRouter } from "./routers/payments.router.js";
import { makeWorkspaceRouter } from "./routers/workspace.router.js";
import { fileURLToPath } from "url";
import { logger } from "@/lib/logger.js";

export const initWeb = ({
  domain,
  store,
  config,
  workspace,
}: {
  domain: Domain;
  store: Store;
  config: Config;
  workspace: Workspace;
}): Application => {
  const ctrls = initControllers(store, config, domain);
  const app = express();

  const __filename = fileURLToPath(import.meta.url);
  const dirPath = path.dirname(__filename);
  app.use("/api/images", express.static(path.join(dirPath, "../../assets")));

  makeBullMqRouter(app, config, domain.jobQueues);

  makePaymentsRouter(app, ctrls.stripePaymentWebhook);

  const adminRouter = makeWorkspaceRouter(workspace);
  app.use(workspace.options.rootPath, adminRouter);
  logger.info(`[Router] Serving workspace at ${workspace.options.rootPath}`);

  const { authGuard, optionalAuthGuard } = setupMiddlewares({
    app,
    store,
    config,
    domain,
  });

  setupRouters({
    authGuard,
    optionalAuthGuard,
    controllers: ctrls,
    app,
    workspace,
  });

  setupErrorHandlers(app);
  return app;
};
