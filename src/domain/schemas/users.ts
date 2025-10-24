import z from "zod";

export const createUserSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    email: z.email("Invalid email").min(1, "Email is required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    deviceFingerprint: z.string().min(1, "Failed to fingerprint device"),
    userAgent: z.string().min(1, "Failed to fingerprint device"),
    phoneNumber: z.string().optional(),
    shippingAddress: z
      .object({
        addressLine1: z.string().min(1, "Address line 1 is required"),
        addressLine2: z.string().optional(),
        postalCode: z.string().min(1, "Postal code is required"),
        city: z.string().min(1, "City is required"),
        state: z.string().min(1, "State is required"),
        country: z.string().min(1, "Country is required"),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.shippingAddress &&
      (!data.phoneNumber || data.phoneNumber.trim() === "")
    ) {
      ctx.addIssue({
        path: ["phoneNumber"],
        code: z.ZodIssueCode.custom,
        message: "Phone number is required when shipping address is defined",
      });
    }
  })
  .strict();

export type CreateUserInput = z.infer<typeof createUserSchema>;
