import { Domain } from "@/domain/domain";
import { Store } from "@/infra";
import express, { type Application } from "express";
import { Config } from "../config";
import { initControllers } from "./controllers/controllers";
import {
  initTokenAuthGuard,
  setupErrorHandlers,
  setupMiddlewares,
} from "./middleware";
import { makeBullMqRouter, makePaymentsRouter, setupRouters } from "./router";
import path from "path";

export const initWeb = (
  domain: Domain,
  store: Store,
  config: Config,
): Application => {
  const ctrls = initControllers(store, config, domain);
  const app = express();

  app.use("/api/images", express.static(path.join(__dirname, "../../assets")));
  app.use(
    "/.well-known",
    express.static(path.join(__dirname, "../../assets/well-known")),
  );

  makeBullMqRouter(app, config, domain.jobQueues);

  makePaymentsRouter(app, ctrls.stripePaymentWebhook);

  setupMiddlewares(app, store, config);

  const authGuard = initTokenAuthGuard(domain.session);

  setupRouters(authGuard, ctrls, app);

  setupErrorHandlers(app);
  return app;
};
