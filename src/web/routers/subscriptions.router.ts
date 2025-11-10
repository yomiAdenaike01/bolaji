import { Router } from "express";
import { SubscriptionsController } from "../controllers/subscriptions.controller.js";
import { AuthGuard, OptionalAuthGuard } from "../middleware.js";

export const makeSubscriptionsRouter = (
  authGuard: AuthGuard,
  optionalAuthGuard: OptionalAuthGuard,
  subscriptionsController: SubscriptionsController,
) => {
  const r = Router();
  r.get("/thank-you", subscriptionsController.handleThankYouPage);
  r.get("/cancel", subscriptionsController.handleSubscriptionCancelPage);
  r.post(
    "/create",
    optionalAuthGuard,
    subscriptionsController.handleCreateSubscription,
  );
  r.get(
    "/can-subscribe",
    authGuard,
    subscriptionsController.handleCanSubscribe,
  );

  return r;
};
