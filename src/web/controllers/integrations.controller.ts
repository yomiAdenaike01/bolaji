import { Domain } from "@/domain/domain";
import { logger } from "@/lib/logger";
import { Request, Response } from "express";
import z from "zod";

export class IntegrationsController {
  constructor(private readonly domain: Domain) {}
  handlePaymentEvents = (req: Request, res: Response) => {
    try {
      let sig = req.headers["stripe-signature"];
      logger.debug(`Received webook event sig=${sig}`);
      sig = z.string().min(1).parse(sig);
      const body = (req as any).rawBody;
      return this.domain.integrations.payments.handleWebhook(body, sig);
    } catch (error) {
      logger.error(error, "Failed to handle stripe webhook event");
      return null;
    }
  };
}
