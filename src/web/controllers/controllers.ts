import { Domain } from "@/domain/domain";
import { UserController } from "./user.controller";
import { PreorderController } from "./preorder.controller";
import { AuthController } from "./auth.controller";
import { IntegrationsController } from "./integrations.controller";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { createErrorResponse } from "./utils";
import { OrderType } from "@/generated/prisma/enums";

const stripePaymentWebhook =
  (integrations: IntegrationsController, domain: Domain) =>
  async (req: Request, res: Response) => {
    const paymentEvent = integrations.handlePaymentEvents(req, res);
    if (!paymentEvent) {
      return createErrorResponse(res, {
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        error: "Failed to handle event",
        endpoint: "/integrations/payments/webhook",
      });
    }
    if (paymentEvent.type == OrderType.PREORDER) {
      return await domain.preorders.onCompletePreorder(paymentEvent);
    }
  };

export const initControllers = (domain: Domain) => {
  const integrations = new IntegrationsController(domain);
  return {
    auth: new AuthController(domain),
    user: new UserController(domain),
    preorders: new PreorderController(domain),
    integrations,
    stripePaymentWebhook: stripePaymentWebhook(integrations, domain),
  };
};

export type Controllers = ReturnType<typeof initControllers>;
