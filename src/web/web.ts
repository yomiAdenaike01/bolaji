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
import { makePaymentsRouter, setupRouters } from "./router";

export const initWeb = (
  domain: Domain,
  store: Store,
  config: Config,
): Application => {
  const ctrls = initControllers(store, config, domain);
  const app = express();

  makePaymentsRouter(app, ctrls.stripePaymentWebhook);

  setupMiddlewares(app, store, config);

  const authGuard = initTokenAuthGuard(domain.session);

  setupRouters(authGuard, ctrls, app);

  setupErrorHandlers(app);
  return app;
};
