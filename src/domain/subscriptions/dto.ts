import { OrderType } from "@/generated/prisma/enums";
import { z } from "zod";

export const CreateSubscriptionInput = z.object({
  userId: z.string().min(1),
  planId: z.string().min(1),
  redirectUrl: z.url(),
});
export type CreateSubscriptionInput = z.infer<typeof CreateSubscriptionInput>;

export type CreateSubscriptionResult = {
  checkoutUrl: string;
};

export type SubscriptionStatus =
  | "pending"
  | "active"
  | "canceled"
  | "incomplete";

export interface SubscriptionPlaceholder {
  id: string;
  userId: string;
  planId: string;
  status: SubscriptionStatus;
  stripeCheckoutSessionId?: string | null;
  stripeSubscriptionId?: string | null;
}

export const subscriptionSchema = z.object({
  userId: z.string().uuid(),
  planId: z.string().uuid(),
  subscriptionId: z.string().uuid(), // ✅ now required
  type: z.literal(OrderType.SUBSCRIPTION_RENEWAL),
  eventId: z.string(),
});

export type SubscriptionEventData = z.infer<typeof subscriptionSchema>;

export const updateSubscriptionInputSchema = z.object({
  subscriptionId: z.uuid(),
  stripeSubscriptionId: z.uuid(),
  currentPeriodStart: z.number().nonnegative().optional(),
  currentPeriodEnd: z.number().nonnegative().optional(),
});
export type UpdateSubscriptionInput = z.infer<
  typeof updateSubscriptionInputSchema
>;
