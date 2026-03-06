import bodyParser from "body-parser";
import { Application, Router } from "express";
import { StatusCodes } from "http-status-codes";
import { WebhookController } from "../controllers/webhook.controller";

export const makeWebhooksRouter = (
  app: Application,
  webhookController: WebhookController,
) => {
  const r = Router();
  r.post(
    "/emails/webhook",
    bodyParser.raw({ type: "application/json" }),
    webhookController.handleRecordEmailInteraction,
  );

  r.post(
    "/payments/webhook",
    bodyParser.raw({ type: "application/json" }),
    webhookController.handlePayments,
  );
  r.get("/payments/redirect", (req, res) => {
    res.status(StatusCodes.OK).json(req.body);
  });
  app.use("/api/integrations", r);
};
