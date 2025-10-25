import { Db, TransactionClient } from "@/infra";
import { CreateUserInput } from "../schemas/users";
import bcrypt from "bcrypt";
import { Integrations } from "@/infra/integrations";
import { logger } from "@/lib/logger";
import { Prisma } from "@/generated/prisma/client";
import { EmailType } from "@/infra/integrations/email.integrations.templates";
import z from "zod";

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
    const { device, user } = await this.db.$transaction(async (trx) => {
      const user = await trx.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
        },
      });

      if (input.shippingAddress) {
        const { shippingAddress } = input;
        await trx.address.create({
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

      const device = await this.findOrRegisterDevice({
        tx: trx,
        deviceFingerprint: input.deviceFingerprint,
        userId: user.id,
        userAgent: input.userAgent,
      });
      return {
        device,
        user,
      };
    });

    if (!device.id) throw new Error("No device id found");

    const userDto = z
      .object({
        email: z.string().min(1),
        name: z.string().min(1),
      })
      .parse(user);

    this.integrations.email
      .sendEmail({
        email: userDto.email,
        type: EmailType.REGISTER,
        content: {
          email: userDto.email,
          name: userDto.name,
        },
      })
      .catch((err) => {
        logger.error(err, "Failed to send email");
      });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      deviceId: device.id,
    };
  }
  async findOrRegisterDevice<T extends Prisma.TransactionClient>({
    tx,
    deviceFingerprint,
    userAgent,
    userId,
  }: {
    tx?: TransactionClient;
    deviceFingerprint: string;
    userAgent: string;
    userId: string;
  }) {
    const db = tx ?? this.db;
    const existing = await db.device.findUnique({
      where: {
        userId_fingerprint: {
          userId,
          fingerprint: deviceFingerprint,
        },
      },
    });

    if (existing) {
      const updated = await db.device.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date(), isActive: true },
      });
      return updated;
    }

    const count = await db.device.count({
      where: { userId },
    });

    if (count >= 5) {
      throw new Error("Maximum device limit reached (5).");
    }

    const device = await db.device.create({
      data: {
        userId,
        fingerprint: deviceFingerprint,
        userAgent,
      },
    });

    return device;

    // First, check if the device already exists — cheap lookup using the unique composite key
  }
}
