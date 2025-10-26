import { Domain } from "@/domain/domain";
import { AuthController } from "./auth.controller";
import { IntegrationsController } from "./integrations.controller";
import { PreorderController } from "./preorder.controller";
import { UserController } from "./user.controller";
import { createStripePaymentWebhook } from "./createStripeWebhook";

export const initControllers = (domain: Domain) => {
  const integrations = new IntegrationsController(domain);
  return {
    auth: new AuthController(domain),
    user: new UserController(domain),
    preorders: new PreorderController(domain),
    integrations,
    stripePaymentWebhook: createStripePaymentWebhook(integrations, domain),
  };
};

export type Controllers = ReturnType<typeof initControllers>;
export type PaymentsWebhookHandler = Controllers["stripePaymentWebhook"];
