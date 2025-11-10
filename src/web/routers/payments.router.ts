import bodyParser from "body-parser";
import { Application, Router } from "express";
import { StatusCodes } from "http-status-codes";
import { PaymentsWebhookHandler } from "../controllers/controllers.js";

export const makePaymentsRouter = (
  app: Application,
  paymentWebhookHandler: PaymentsWebhookHandler,
) => {
  const paymentsRouter = Router();
  paymentsRouter.post(
    "/webhook",
    bodyParser.raw({ type: "application/json" }),
    paymentWebhookHandler,
  );
  paymentsRouter.get("/redirect", (req, res) => {
    res.status(StatusCodes.OK).json(req.body);
  });
  app.use("/api/integrations/payments", paymentsRouter);
};
