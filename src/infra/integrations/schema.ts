import { PlanType, OrderType } from "@/generated/prisma/enums";
import z from "zod";

export const preorderSchema = z.object({
  editionId: z.string().min(1),
  plan: z.enum(PlanType),
  type: z.enum(OrderType),
  userId: z.string().min(1),
  addressId: z.string().nullable(),
  amount: z.number(),
  eventId: z.string().min(1),
  paymentLinkId: z.string().min(1),
  quantity: z.number().nonnegative(),

});

export type CompletedPreoderEventDto = z.infer<typeof preorderSchema>;
