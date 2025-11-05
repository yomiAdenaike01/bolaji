import { Domain } from "@/domain/domain";
import { logger } from "@/lib/logger";
import { Request, Response } from "express";
import z from "zod";

export class IntegrationsController {
  constructor(private readonly domain: Domain) {}
  handlePaymentEvents = (req: Request, res: Response) => {
    try {
      logger.info(
        "[IntegrationsConrtoller:handlePaymentEvents]: Received stripe event",
      );
      let sig = req.headers["stripe-signature"];
      logger.info(`Received webook event sig=${sig}`);
      sig = z.string().min(1).parse(sig);
      return this.domain.integrations.payments.handleWebhook(req.body, sig);
    } catch (error: any) {
      logger.error(error,`Failed to handle stripe event`);
      return null;
    }
  };
}
