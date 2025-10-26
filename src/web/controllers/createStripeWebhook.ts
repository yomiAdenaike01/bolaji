import { OrderType } from "@/generated/prisma/enums";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { IntegrationsController } from "./integrations.controller";
import { createErrorResponse } from "./utils";
import { Domain } from "@/domain/domain";
import { logger } from "@/lib/logger";

export const createStripePaymentWebhook =
  (integrationsCtrl: IntegrationsController, domain: Domain) =>
  async (req: Request, res: Response) => {
    let paymentEvent = null;
    try {
      paymentEvent = integrationsCtrl.handlePaymentEvents(req, res);
      if (!paymentEvent) {
        createErrorResponse(res, {
          statusCode: StatusCodes.BAD_REQUEST,
          error: "Failed to handle event",
          endpoint: "/integrations/payments/webhook",
        });
        return;
      }

      const existingEvent = await domain.integrations.beginEvent(
        paymentEvent.eventId,
        paymentEvent.stripeEventType,
        paymentEvent.rawPayload,
      );
      if (!existingEvent)
        return res.status(200).send("Duplicate event ignored");
      if (paymentEvent.type == OrderType.PREORDER) {
        const {
          orderType,
          stripeEventType,
          rawPayload,
          ...onCompletePreorderDto
        } = paymentEvent;
        await domain.preorders.onCompletePreorder(onCompletePreorderDto);
      }

      await domain.integrations.completeEvent(
        paymentEvent.eventId,
        paymentEvent.stripeEventType,
        "HANDLED",
      );
    } catch (error) {
      logger.error(error, "Failed to handle stripe webhook event");
      if (!paymentEvent) return;
      await domain.integrations.completeEvent(
        paymentEvent.eventId,
        paymentEvent.stripeEventType,
        "FAILED",
      );
    }
  };
