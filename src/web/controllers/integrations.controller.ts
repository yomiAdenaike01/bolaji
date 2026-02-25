import { Config } from "@/config";
import { Domain } from "@/domain/domain";
import { logger } from "@/lib/logger";
import { Request, Response } from "express";
import { Webhook } from "svix";
import z from "zod";

export class IntegrationsController {
  constructor(
    private readonly appConfig: Config,
    private readonly domain: Domain,
  ) {}
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
      logger.error(error, `Failed to handle stripe event`);
      return null;
    }
  };

  handleEmailEvents = async (req: Request, res: Response) => {
    let evt: any = null;
    const payload = req.body.toString();
    const headers = req.headers;
    try {
      const wh = new Webhook(this.appConfig.resendWebhookSigningSecret);
      evt = wh.verify(payload, headers as any);
    } catch (error) {
      logger.error(
        error,
        "[IntegrationsController] Failed to handle email webhook",
      );
      throw error;
    }

    return this.domain.integrations.constructEmailEventPayload(evt);
  };
}
