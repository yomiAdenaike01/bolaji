import { Domain } from "@/domain/domain";
import { OrderType } from "@/generated/prisma/enums";
import { PaymentEvent } from "@/infra/integrations/checkout.dto";
import { preorderSchema } from "@/infra/integrations/schema";
import { logger } from "@/lib/logger";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { ZodType } from "zod";
import { IntegrationsController } from "./integrations.controller";
import { createErrorResponse } from "./utils";
import { updateSubscriptionInputSchema } from "@/domain/subscriptions/dto";

export class WebhookController {
  constructor(
    private readonly integrationsCtrl: IntegrationsController,
    private readonly domain: Domain,
  ) {}
  private isValidOrThrow<T>(
    input: unknown,
    schema: ZodType<T>,
  ): asserts input is T {
    schema.parse(input);
  }
  handleSuccess = async (paymentEvent: PaymentEvent) => {
    if (paymentEvent.type == OrderType.PREORDER) {
      const {
        orderType,
        stripeEventType,
        rawPayload,
        ...onCompletePreorderDto
      } = paymentEvent;

      this.isValidOrThrow(onCompletePreorderDto, preorderSchema);

      await this.domain.preorders.onCompletePreorder(onCompletePreorderDto);
      return;
    }

    if (paymentEvent.type === OrderType.SUBSCRIPTION_RENEWAL) {
      this.isValidOrThrow(paymentEvent, updateSubscriptionInputSchema);

      await this.domain.subscriptions.onSubscriptionUpdate({
        subscriptionId: paymentEvent.subscriptionId,
        stripeSubscriptionId: paymentEvent.stripeSubscriptionId,
      });
      return;
    }
  };
  handleFailures = async (paymentEvent: PaymentEvent) => {
    throw new Error("Method not implemented.");
  };

  handle = () => async (req: Request, res: Response) => {
    let paymentEvent = null;
    try {
      paymentEvent = await this.integrationsCtrl.handlePaymentEvents(req, res);
      if (!paymentEvent) {
        createErrorResponse(res, {
          statusCode: StatusCodes.BAD_REQUEST,
          error: "Failed to handle event",
          endpoint: "/integrations/payments/webhook",
        });
        return;
      }

      const existingEvent = await this.domain.integrations.beginEvent(
        paymentEvent.eventId,
        paymentEvent.stripeEventType,
        paymentEvent.rawPayload,
      );
      if (!existingEvent)
        return res.status(200).send("Duplicate event ignored");

      if (!paymentEvent.success) {
        await this.handleFailures(paymentEvent);
      } else {
        await this.handleSuccess(paymentEvent);
      }

      await this.domain.integrations.completeEvent(
        paymentEvent.eventId,
        paymentEvent.stripeEventType,
        "HANDLED",
      );
    } catch (error) {
      logger.error(error, "Failed to handle stripe webhook event");
      if (!paymentEvent) return;
      await this.domain.integrations.completeEvent(
        paymentEvent.eventId,
        paymentEvent.stripeEventType,
        "FAILED",
      );
    }
  };
}
