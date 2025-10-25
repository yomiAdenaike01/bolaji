import { Domain } from "@/domain/domain";
import { logger } from "@/lib/logger";
import { Request, Response } from "express";
import z from "zod";
import { createErrorResponse } from "./utils";
import { StatusCodes } from "http-status-codes";

export class IntegrationsController {
  constructor(private readonly domain: Domain) {}
  handlePaymentEvents = async (req: Request, res: Response) => {
    try {
      let sig = req.headers["stripe-signature"];
      logger.debug(`Received webook event sig=${sig}`);
      sig = z.string().min(1).parse(sig);
      const body = (req as any).rawBody;
      await this.domain.integrations.payments.handleWebhook(body, sig);
    } catch (error) {
      return createErrorResponse(res, {
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        error: "Failed to handle event",
        endpoint: "/integrations/payments/webhook",
      });
    }
  };
}
