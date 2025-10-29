import { OrderType, PlanType } from "@/generated/prisma/enums";
import { z } from "zod";
import { shippingAddressSchema } from "../schemas/users";

export const createSubscriptionInputSchema = z
  .object({
    userId: z.string().min(1),
    planId: z.string().min(1).optional(),
    redirectUrl: z.url(),
    addressId: z.string().optional(),
    plan: z.enum(PlanType).optional(),
    address: shippingAddressSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (!(data.planId || data.plan)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "PlanId or PlanType is required",
        path: ["planId"],
      });
    }
  });

export type CreateSubscriptionInput = z.infer<
  typeof createSubscriptionInputSchema
>;

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
  userId: z.string().min(1, "UserId is required"),
  planId: z.string().min(1, "PlanId is required"),
  subscriptionId: z.string().min(1, "SubscriptionId is required"), // ✅ now required
  type: z.literal(OrderType.SUBSCRIPTION_RENEWAL),
  eventId: z.string().min(1, "EventId is required"),
  isNewSubscription: z.boolean().nullable(),
});

export const updateSubscriptionInputSchema = z.object({
  subscriptionId: z.string().min(1),
  stripeSubscriptionId: z.string().min(1),
  currentPeriodStart: z.number().nonnegative().optional(),
  currentPeriodEnd: z.number().nonnegative().optional(),
  subscriptionPlanId: z.string().min(1),
  stripeInvoiceId: z.string().optional(),
  addressId: z.string().optional(),
});

export const onCreateSubscriptionInputSchema = z.object({
  planId: z.string().min(1),
  subscriptionId: z.string().min(1),
  userId: z.string().min(1),
});

export type OnCreateSubscriptionInput = z.infer<
  typeof onCreateSubscriptionInputSchema
>;
export type SubscriptionEventData = z.infer<typeof subscriptionSchema>;

export type UpdateSubscriptionInput = z.infer<
  typeof updateSubscriptionInputSchema
>;
