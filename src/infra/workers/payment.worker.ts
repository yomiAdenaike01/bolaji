import { Job, Worker } from "bullmq";
import { Db } from "..";
import { EmailIntegration } from "../integrations/email.integration";
import { Domain } from "@/domain/domain";
import {
  updateSubscriptionInputSchema,
  onCreateSubscriptionInputSchema,
} from "@/domain/subscriptions/dto";
import { OrderType, PlanType, UserStatus } from "@/generated/prisma/enums";
import { logger } from "@/lib/logger";
import z, { ZodType } from "zod";
import { PaymentEvent } from "../integrations/checkout.dto";
import { EmailType, AdminEmailType } from "../integrations/email-types";
import { preorderSchema } from "../integrations/schema";
import { PaymentEventActions } from "../integrations/stripe.integration";
import { CompletePreorderStatus } from "@/domain/preorders/preorders.service";

const failedPreorderDto = z.object({
  action: z.string(),
  addressId: z.string().optional().nullable(),
  amount: z.number().nonnegative(),
  editionId: z.string(),
  plan: z.enum(PlanType),
  eventId: z.string(),
  type: z.enum(OrderType),
  userId: z.string(),
  orderId: z.string(),
  redirectUrl: z.string(),
});

type FailedPreorderInput = z.infer<typeof failedPreorderDto>;
export class PaymentWorker {
  worker: Worker<any, any, string>;
  constructor(
    connection: string,
    private readonly domain: Domain,
  ) {
    this.worker = new Worker("payments", async (job) => this.process(job), {
      connection: {
        url: connection,
      },
    });
  }

  protected process = async (job: Job<any, any, string>) => {
    const paymentEvent = job.data;
    try {
      logger.info(
        `[Payment Worker] Processing job id=${job.id} name=${job.name}`,
      );

      const existingEvent = await this.domain.integrations.beginEvent(
        paymentEvent.eventId,
        paymentEvent.stripeEventType,
        paymentEvent.rawPayload,
      );
      if (!existingEvent) return;
      switch (job.name) {
        case "payment.success":
          await this.handleSuccess(paymentEvent);
          break;

        case "payment.failed":
          await this.handleFailures(paymentEvent);
          break;
      }

      await this.domain.integrations.completeEvent(
        paymentEvent.eventId,
        paymentEvent.stripeEventType,
        "HANDLED",
      );
      return;
    } catch (error: any) {
      logger.error(
        `[Payment Worker] Failed to handle payment job reason=${error.message} `,
      );
      if (!paymentEvent) return;
      await this.domain.integrations.completeEvent(
        paymentEvent.eventId,
        paymentEvent.stripeEventType,
        "FAILED",
      );
    }
  };

  private isValidOrThrow<T>(
    input: unknown,
    schema: ZodType<T>,
  ): asserts input is T {
    schema.parse(input);
  }
  private handleSuccess = async (paymentEvent: PaymentEvent) => {
    logger.info("[Payment Worker] Successfully constructed payment event");
    if (paymentEvent.type == OrderType.PREORDER) {
      const {
        orderType,
        stripeEventType,
        rawPayload,
        ...onCompletePreorderDto
      } = paymentEvent;

      this.isValidOrThrow(onCompletePreorderDto, preorderSchema);

      try {
        await this.domain.preorders.onCompletePreorder(onCompletePreorderDto);
      } catch (error) {
        if (
          [
            CompletePreorderStatus.ALREADY_PAID,
            CompletePreorderStatus.PREORDER_NOT_FOUND,
          ].includes((error as any)?.status)
        ) {
          logger.warn(
            `[Payment Worker] Failed to complete preorder reason status=${(error as any)?.status}`,
          );
          return;
        }
        await this.domain.user.changeUserStatus(
          onCompletePreorderDto.userId,
          UserStatus.PENDING_RETRY,
        );
        logger.error(error, "[Payment Worker] Failed to complete preorder");
        throw error;
      }

      return;
    }

    if (paymentEvent.type === OrderType.SUBSCRIPTION_RENEWAL) {
      this.isValidOrThrow(paymentEvent, updateSubscriptionInputSchema);
      const { updatedSubscription, nextEdition } =
        await this.domain.subscriptions.onSubscriptionUpdate({
          subscriptionId: paymentEvent.subscriptionId,
          stripeSubscriptionId: paymentEvent.stripeSubscriptionId,
          subscriptionPlanId: paymentEvent.subscriptionPlanId,
          stripeInvoiceId: paymentEvent.stripeInvoiceId,
        });

      const { user, plan } = updatedSubscription;
      if (!user.name || !user.email)
        throw new Error(
          `User is not defined on subscription id=${updatedSubscription.id} planId=${updatedSubscription.planId}`,
        );
      logger.info(
        "[Subscription Service] 🎉 Successfully completed subscription transactions",
      );
      if (paymentEvent.isNewSubscription) {
        (this.domain.integrations.email.sendEmail({
          type: EmailType.SUBSCRIPTION_STARTED,
          email: user.email,
          content: {
            name: user.name,
            email: user.email,
            nextEdition: nextEdition?.number,
          },
        }),
          this.domain.integrations.adminEmail.send({
            type: AdminEmailType.SUBSCRIPTION_STARTED,
            attachReport: true,
            content: {
              name: user.name,
              email: user.email,
              plan: plan.type,
              periodStart: updatedSubscription.currentPeriodStart,
              periodEnd: updatedSubscription.currentPeriodEnd,
            },
          }),
          logger.info(
            "[Subscription Service] 🎉 Successfully sent subscription created comms",
          ));
      } else {
        this.domain.integrations.email.sendEmail({
          type: EmailType.SUBSCRIPTION_RENEWED,
          email: user.email,
          content: {
            name: user.name,
            email: user.email,
            nextEdition: nextEdition?.number,
          },
        });
        this.domain.integrations.adminEmail.send({
          type: AdminEmailType.SUBSCRIPTION_RENEWED,
          content: {
            name: user.name,
            email: user.email,
            plan: plan.type,
            renewedAt: new Date().toISOString(),
            nextPeriodEnd: new Date(
              Date.now() + 30 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          },
        });
        logger.info(
          "[Subscription Service] 🎉 Successfully sent subscription renewed comms",
        );
      }

      return;
    }
    if (paymentEvent.action === PaymentEventActions.SUBSCRIPTION_STARTED) {
      this.isValidOrThrow(paymentEvent, onCreateSubscriptionInputSchema);
      await this.domain.subscriptions.onSubscriptionCreate({
        planId: paymentEvent.planId,
        subscriptionId: paymentEvent.subscriptionId,
        userId: paymentEvent.userId,
      });
      return;
    }
  };

  private handleFailures = async (paymentEvent: PaymentEvent) => {
    if (paymentEvent.orderType === OrderType.PREORDER) {
      this.isValidOrThrow(paymentEvent, failedPreorderDto);
      await this.failPreorder(paymentEvent);
      return;
    }
  };

  private failPreorder = async (paymentEvent: FailedPreorderInput) => {
    const failedPreorder = await this.domain.preorders.markAsFailed({
      userId: paymentEvent.userId,
      editionId: paymentEvent.editionId,
      preorderId: paymentEvent.orderId,
      addressId: paymentEvent.addressId || null,
      redirectUrl: paymentEvent.redirectUrl,
    });

    if (!failedPreorder?.id)
      throw new Error(`No preorder found by id=${paymentEvent.orderId}`);

    if (!failedPreorder?.user?.email || !failedPreorder?.user?.name)
      throw new Error(
        `Failed to send comms for failed preoroder=${paymentEvent.orderId} user email is undefined`,
      );

    const email = failedPreorder.user.email;

    this.domain.integrations.email.sendEmail({
      email,
      type: EmailType.PREORDER_PAYMENT_FAILED,
      content: {
        name: failedPreorder.user.name || "Reader",
        email,
        editionCode: failedPreorder.edition.code,
        plan: failedPreorder.choice,
        ...(failedPreorder.retryUrl
          ? { retryLink: failedPreorder.retryUrl }
          : {}),
      },
    });
  };
}
