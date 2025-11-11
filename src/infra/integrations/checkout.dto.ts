import { OrderType, PlanType } from "@/generated/prisma/index.js";
import Stripe from "stripe";
import { PaymentEventActions } from "./stripe.integration.js";

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
  orderId?: string;
  redirectUrl?: string | null;
  isNewSubscription?: boolean | null;
  quantity?: number;
} & (
  | {
      orderType: OrderType;
      plan: PlanType;
      editionId: string | null;
      addressId?: string | null;
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
