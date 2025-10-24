import { z } from "zod";
import { PlanType } from "@/generated/prisma/enums";

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
});

export type CreatePreorderInput = z.infer<typeof createPreorderSchema>;
