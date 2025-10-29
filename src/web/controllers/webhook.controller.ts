import { Domain } from "@/domain/domain";
import { logger } from "@/lib/logger";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { IntegrationsController } from "./integrations.controller";
import { createErrorResponse } from "./utils";

export class WebhookController {
  constructor(
    private readonly integrationsCtrl: IntegrationsController,
    private readonly domain: Domain,
  ) {}
  // private isValidOrThrow<T>(
  //   input: unknown,
  //   schema: ZodType<T>,
  // ): asserts input is T {
  //   schema.parse(input);
  // }
  // handleSuccess = async (paymentEvent: PaymentEvent) => {
  //   this.domain.jobQueues.add("payments.handle", paymentEvent);
  //   logger.info("[Webhook Controller] Successfully constructed payment event");
  //   if (paymentEvent.type == OrderType.PREORDER) {
  //     const {
  //       orderType,
  //       stripeEventType,
  //       rawPayload,
  //       ...onCompletePreorderDto
  //     } = paymentEvent;

  //     this.isValidOrThrow(onCompletePreorderDto, preorderSchema);

  //     try {
  //       await this.domain.preorders.onCompletePreorder(onCompletePreorderDto);
  //     } catch (error) {
  //       await this.domain.user.changeUserStatus(
  //         onCompletePreorderDto.userId,
  //         UserStatus.PENDING_RETRY,
  //       );
  //       logger.error(error, "[Webhook Controller] Failed to complete preorder");
  //       throw error;
  //     }

  //     return;
  //   }

  //   if (paymentEvent.type === OrderType.SUBSCRIPTION_RENEWAL) {
  //     this.isValidOrThrow(paymentEvent, updateSubscriptionInputSchema);
  //     const { updatedSubscription, nextEdition } =
  //       await this.domain.subscriptions.onSubscriptionUpdate({
  //         subscriptionId: paymentEvent.subscriptionId,
  //         stripeSubscriptionId: paymentEvent.stripeSubscriptionId,
  //         subscriptionPlanId: paymentEvent.subscriptionPlanId,
  //         stripeInvoiceId: paymentEvent.stripeInvoiceId,
  //       });

  //     const { user, plan } = updatedSubscription;
  //     if (!user.name || !user.email)
  //       throw new Error(
  //         `User is not defined on subscription id=${updatedSubscription.id} planId=${updatedSubscription.planId}`,
  //       );
  //     if (paymentEvent.isNewSubscription) {
  //       Promise.all([
  //         this.domain.integrations.email.sendEmail({
  //           type: EmailType.SUBSCRIPTION_STARTED,
  //           email: user.email,
  //           content: {
  //             name: user.name,
  //             email: user.email,
  //             nextEdition: nextEdition?.number,
  //           },
  //         }),
  //         this.domain.integrations.adminEmail.send({
  //           type: AdminEmailType.SUBSCRIPTION_STARTED,
  //           attachReport: true,
  //           content: {
  //             name: user.name,
  //             email: user.email,
  //             plan: plan.type,
  //             periodStart: updatedSubscription.currentPeriodStart,
  //             periodEnd: updatedSubscription.currentPeriodEnd,
  //           },
  //         }),
  //       ]).catch((err) => {
  //         logger.error(
  //           err,
  //           "[Subscription Service] Failed to send subscription started emails ",
  //         );
  //       });
  //     } else {
  //       Promise.all([
  //         this.domain.integrations.email.sendEmail({
  //           type: EmailType.SUBSCRIPTION_RENEWED,
  //           email: user.email,
  //           content: {
  //             name: user.name,
  //             email: user.email,
  //             nextEdition: nextEdition?.number,
  //           },
  //         }),
  //         this.domain.integrations.adminEmail.send({
  //           type: AdminEmailType.SUBSCRIPTION_RENEWED,
  //           content: {
  //             name: user.name,
  //             email: user.email,
  //             plan: plan.type,
  //             renewedAt: new Date().toISOString(),
  //             nextPeriodEnd: new Date(
  //               Date.now() + 30 * 24 * 60 * 60 * 1000,
  //             ).toISOString(),
  //           },
  //         }),
  //       ]).catch((err) => {
  //         logger.error(
  //           err,
  //           "[Subscription Service] Failed to send subscription renewed emails",
  //         );
  //       });
  //     }

  //     return;
  //   }
  //   if (paymentEvent.action === PaymentEventActions.SUBSCRIPTION_STARTED) {
  //     this.isValidOrThrow(paymentEvent, onCreateSubscriptionInputSchema);
  //     await this.domain.subscriptions.onSubscriptionCreate({
  //       planId: paymentEvent.planId,
  //       subscriptionId: paymentEvent.subscriptionId,
  //       userId: paymentEvent.userId,
  //     });
  //     return;
  //   }
  // };
  // handleFailures = async (paymentEvent: PaymentEvent) => {
  //   throw new Error("Method not implemented.");
  // };

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
