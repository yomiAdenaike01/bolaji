import { Db } from "@/infra";
import { CreateUserInput } from "../schemas/users";
import bcrypt from "bcrypt";
import { Integrations } from "@/infra/integrations";
import { EmailType } from "@/infra/integrations/email.integration";
import { logger } from "@/lib/logger";

export class UserService {
  constructor(
    private readonly db: Db,
    private readonly integrations: Integrations,
  ) {}
  async registerUser(input: CreateUserInput) {
    const existingUser = await this.db.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new Error("User already exists with that email.");
    }

    const passwordHash = bcrypt.hashSync(input.password, 10);

    // 🧱 Create the user
    const user = await this.db.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
      },
    });

    if (input.shippingAddress) {
      const { shippingAddress } = input;
      await this.db.address.create({
        data: {
          line1: shippingAddress.addressLine1,
          line2: shippingAddress.addressLine2,
          postalCode: shippingAddress.postalCode,
          city: shippingAddress.city,
          country: shippingAddress.country,
          phone: input.phoneNumber,
          user: {
            connect: {
              id: user.id,
            },
          },
        },
      });
    }

    // 🖥️ Check device count before creating a new one
    const deviceCount = await this.db.device.count({
      where: { userId: user.id },
    });

    if (deviceCount >= 5) {
      throw new Error("Maximum device limit reached (5).");
    }

    const device = await this.db.device.upsert({
      where: {
        userId_fingerprint: {
          userId: user.id,
          fingerprint: input.deviceFingerprint,
        },
      },
      update: { lastSeenAt: new Date(), isActive: true },
      create: {
        userId: user.id,
        fingerprint: input.deviceFingerprint,
        userAgent: input.userAgent,
      },
    });

    if (!device.id) throw new Error("No device id found");
    this.integrations.email
      .sendEmail({
        email: user.email,
        type: EmailType.REGISTER,
      })
      .catch((err) => {
        logger.error(err, "Failed to send email");
      });

    // ✅ Return safe user data (never return password)
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      deviceId: device.id,
    };
  }
}
