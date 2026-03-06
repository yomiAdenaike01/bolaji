import { Router } from "express";
import z from "zod";
import { SubscriptionsController } from "../controllers/subscriptions.controller";
import { AuthGuard, OptionalAuthGuard, validateRequest } from "../middleware";

export const makeSubscriptionsRouter = (
  authGuard: AuthGuard,
  optionalAuthGuard: OptionalAuthGuard,
  subscriptionsController: SubscriptionsController,
) => {
  const r = Router();
  r.get("/", authGuard, subscriptionsController.handleGetAllSubscriptions);
  r.get("/thank-you", subscriptionsController.handleThankYouPage);
  const subscriptionIdValidationSchema = z.object({
    subscriptionId: z
      .string({
        error: "Subscription Id is not a string or undefined",
      })
      .min(1, { error: "Subscription Id is empty" }),
  });
  r.delete(
    "/cancel",
    authGuard,
    validateRequest(subscriptionIdValidationSchema),
    subscriptionsController.handleCancelSubscription,
  );
  r.patch(
    "/pause",
    authGuard,
    validateRequest(subscriptionIdValidationSchema),
    subscriptionsController.handlePauseSubscription,
  );
  // r.patch("/cancel", subscriptionsController.handleSubscriptionCancelPage);
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
