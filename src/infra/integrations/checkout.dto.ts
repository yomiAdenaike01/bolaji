import { OrderType, PlanType } from "@/generated/prisma/enums";
import Stripe from "stripe";

export type PaymentEvent = {
  userId: string;
  rawPayload: string;
  stripeEventType: Stripe.CheckoutSessionCompletedEvent["type"];
  orderType: OrderType;
  type: OrderType;
  amount: number;
  eventId: string;
  success: boolean;
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
      planId: string;
    }
);
