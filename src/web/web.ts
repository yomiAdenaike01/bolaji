import { Domain } from "@/domain/domain";
import { Store } from "@/infra";
import express, { type Application } from "express";
import { Config } from "../config";
import { initControllers } from "./controllers/controllers";
import {
  makeOptionalAuthGuard,
  makeAuthGuard,
  setupErrorHandlers,
  setupMiddlewares,
} from "./middleware";
import { setupRouters } from "./router";
import path from "path";
import { makeWebhooksRouter } from "./routers/webhooks.router";
import { makeAdminRouter } from "./routers/admin.router";

export const initWeb = (
  domain: Domain,
  store: Store,
  config: Config,
): Application => {
  const ctrls = initControllers(store, config, domain);
  const app = express();

  app.use("/api/images", express.static(path.join(__dirname, "../../assets")));

  makeAdminRouter(app, config, domain.jobQueues, ctrls.jobs);
  makeWebhooksRouter(app, ctrls.webhooks);

  setupMiddlewares(app, store, config);

  const authGuard = makeAuthGuard(domain.session);
  const optionalAuthGuard = makeOptionalAuthGuard(domain.session);

  setupRouters(authGuard, optionalAuthGuard, ctrls, app);

  setupErrorHandlers(app);
  return app;
};
