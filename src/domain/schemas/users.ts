import z from "zod";

export const deviceIdentifierSchema = z.object({
  deviceFingerprint: z.string().min(1, "Failed to fingerprint device"),
  userAgent: z.string().min(1, "Failed to fingerprint device"),
});

export const shippingAddressSchema = z.object({
  fullName: z.string().min(1, "Full name is required").optional(),
  line1: z.string().min(1, "Address line 1 is required"),
  line2: z.string().optional().nullable(),
  city: z.string().min(1, "City is required"),
  state: z.string().optional().nullable(),
  postalCode: z.string().min(1, "Postal code is required"),
  country: z.string().min(1, "Country is required"),
  phone: z
    .string()
    .min(1, "Phone number is required")
    .regex(/^[+\d\s()-]+$/, "Invalid phone number format"),
});

export const createUserSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    email: z.email("Invalid email").min(1, "Email is required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    shippingAddress: shippingAddressSchema.optional(),
  })
  .safeExtend(deviceIdentifierSchema.shape)
  .strict();

export const authenticateUserSchema = z
  .object({
    principal: z.email().min(1, "Email is required"),
    password: z.string().min(1, "Password is required"),
  })
  .strict();

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type AuthenticateUserInput = z.infer<typeof authenticateUserSchema>;
export type ShippingAddressInput = z.infer<typeof shippingAddressSchema>;
export type ShippingAddress = z.infer<typeof shippingAddressSchema>;
