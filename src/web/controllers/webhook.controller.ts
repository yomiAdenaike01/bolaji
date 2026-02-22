import { Domain } from "@/domain/domain";
import { logger } from "@/lib/logger";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { IntegrationsController } from "./integrations.controller";
import { createErrorResponse } from "./utils";
import { PaymentEvent } from "@/infra/integrations/checkout.dto";

export class WebhookController {
  constructor(
    private readonly integrationsCtrl: IntegrationsController,
    private readonly domain: Domain,
  ) {}

  handleRecordEmailInteraction = async (req: Request, res: Response) => {
    try {
      const recordEmailEventPayload =
        await this.integrationsCtrl.handleEmailEvents(req, res);
      if (!recordEmailEventPayload) {
        res.status(StatusCodes.OK).json({ recieved: true });
        return;
      }
      await this.domain.jobQueues.add(
        "email.recordEvent",
        recordEmailEventPayload,
      );
      res.status(StatusCodes.OK).json({ recieved: true });
    } catch (error) {
      logger.error(
        `[HandleRecordEmailInteraction]: Failed to handle email interaction err=${JSON.stringify(error)}`,
      );
      createErrorResponse(res, {
        error: "Failed to handle email event",
        endpoint: "/integrations/emails",
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }
  };

  handlePayments = () => async (req: Request, res: Response) => {
    let paymentEvent: PaymentEvent | null = null;
    try {
      paymentEvent = await this.integrationsCtrl.handlePaymentEvents(req, res);
      if (!paymentEvent) {
        res.status(StatusCodes.OK).json({ received: true });
        return;
      }
      if (!(paymentEvent as any)?.success) {
        await this.domain.jobQueues.add("payment.failed", paymentEvent);
      } else {
        await this.domain.jobQueues.add("payment.success", paymentEvent);
      }
      res.status(200).json({
        success: true,
      });
      return;
    } catch (error) {
      logger.error("Failed to handle stripe webhook event");
      createErrorResponse(res, {
        error: "Failed to handle stripe event",
        endpoint: "/integrations/payments",
        statusCode: StatusCodes.BAD_REQUEST,
      });
      return;
    }
  };
}
