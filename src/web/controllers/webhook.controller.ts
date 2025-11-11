import { Domain } from "@/domain/domain.js";
import { logger } from "@/lib/logger.js";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { IntegrationsController } from "./integrations.controller.js";
import { createErrorResponse } from "./utils.js";
import { PaymentEvent } from "@/infra/integrations/checkout.dto.js";

export class WebhookController {
  constructor(
    private readonly integrationsCtrl: IntegrationsController,
    private readonly domain: Domain,
  ) {}

  handle = () => async (req: Request, res: Response) => {
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
