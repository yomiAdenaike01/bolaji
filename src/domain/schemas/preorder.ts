import { z } from "zod";
import { PlanType } from "@/generated/prisma/enums";
import { createUserSchema } from "./users";

export const createPreorderSchema = z.object({
  userId: z.string().min(0),
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name is too long")
    .optional(),
  email: z.email("Invalid email address").min(1, "Email is required"),
  choice: z.enum(PlanType, {
    message: "Choice must be one of DIGITAL, PHYSICAL, or FULL",
  }),
  redirectUrl: z.string().min(1),
});

export const createUserPreorderInputSchema = createUserSchema
  .omit({
    deviceFingerprint: true,
    userAgent: true,
  })
  .extend(
    createPreorderSchema.pick({
      choice: true,
      redirectUrl: true,
    }).shape,
  )
  .superRefine((data, ctx) => {
    const needsShipping = (
      [PlanType.PHYSICAL, PlanType.FULL] as Array<PlanType>
    ).includes(data.choice);

    if (needsShipping && !data.shippingAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Shipping address is required for physical or full editions.",
        path: ["shippingAddress"],
      });
    }
  });

export type CreatePreorderInput = z.infer<typeof createPreorderSchema>;
export type CreateUserPreorderInput = z.infer<
  typeof createUserPreorderInputSchema
>;
