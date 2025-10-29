import { OrderType, PlanType } from "@/generated/prisma/enums";
import Stripe from "stripe";
import { PaymentEventActions } from "./stripe.integration";

export type PaymentEvent = {
  userId: string;
  rawPayload: string;
  stripeEventType: Stripe.Event["type"];
  orderType: OrderType;
  type: OrderType;
  amount?: number;
  eventId: string;
  success: boolean;
  action?: PaymentEventActions;
  isNewSubscription?: boolean | null;
} & (
  | {
      orderType: OrderType;
      plan: PlanType;
      editionId: string;
      addressId: string | null;
      paymentLinkId: string;
    }
  | {
      orderType: OrderType;
      subscriptionId?: string;
      subscriptionPlanId: string;
      stripeInvoiceId?: string;
      stripeSubscriptionId?: string | null;
    }
  | {
      startDate: number;
      planId: string;
      subscriptionId: string;
      userId: string;
    }
);
