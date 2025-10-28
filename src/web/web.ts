import { Domain } from "@/domain/domain";
import { Store } from "@/infra";
import express, { type Application } from "express";
import { Config } from "../config";
import { initControllers } from "./controllers/controllers";
import { setupMiddlewares } from "./middleware";
import { makePaymentsRouter, setupRouters } from "./router";

export const initWeb = (
  domain: Domain,
  store: Store,
  config: Config,
): Application => {
  const ctrls = initControllers(domain);
  const app = express();

  makePaymentsRouter(app, ctrls.stripePaymentWebhook);
  setupMiddlewares(app, store, config);
  setupRouters(ctrls, app);
  return app;
};
