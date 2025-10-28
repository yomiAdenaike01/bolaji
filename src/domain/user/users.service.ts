import { Db, TransactionClient } from "@/infra";
import {
  CreateUserInput,
  ShippingAddress,
  shippingAddressSchema,
} from "../schemas/users";
import bcrypt from "bcrypt";
import { Integrations } from "@/infra/integrations";
import { logger } from "@/lib/logger";
import z from "zod";
import { AdminEmailType, EmailType } from "@/infra/integrations/email-types";

export class UserService {
  constructor(
    private readonly db: Db,
    private readonly integrations: Integrations,
  ) {}
  async findUserById(uid: string) {
    return this.db.user.findUniqueOrThrow({
      where: {
        id: uid,
      },
    });
  }
  async registerUser(input: CreateUserInput) {
    const existingUser = await this.db.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new Error("User already exists with that email.");
    }

    const passwordHash = bcrypt.hashSync(input.password, 10);
    const { device, user, addressId } = await this.db.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: {
            name: input.name,
            email: input.email,
            passwordHash,
          },
        });
        let addId: string | null = null;
        if (input.shippingAddress) {
          const { shippingAddress } = input;
          const address = await tx.address.create({
            data: {
              isDefault: true,
              line1: shippingAddress.line1,
              line2: shippingAddress.line2,
              fullName: input.name,
              postalCode: shippingAddress.postalCode,
              city: shippingAddress.city,
              country: shippingAddress.country,
              phone: shippingAddress.phone,
              user: {
                connect: {
                  id: user.id,
                },
              },
            },
          });
          addId = address.id;
        }

        const device = await this.findOrRegisterDevice({
          tx: tx,
          deviceFingerprint: input.deviceFingerprint,
          userId: user.id,
          userAgent: input.userAgent,
        });
        return {
          device,
          user,
          addressId: addId,
        };
      },
    );

    if (!device.id) throw new Error("No device id found");

    const registerationEmailDto = z
      .object({
        email: z.string().min(1),
        name: z.string().min(1),
        address: shippingAddressSchema.optional(),
      })
      .strict()
      .parse({
        name: user.name,
        email: user.email,
        address: {
          postalCode: input.shippingAddress?.postalCode,
          city: input.shippingAddress?.city,
          state: input.shippingAddress?.state,
          country: input.shippingAddress?.country,
          fullName: input.name,
          line1: input.shippingAddress?.line1,
          line2: input.shippingAddress?.line2,
          phone: input.shippingAddress?.phone,
        },
      });

    this.sendUserRegistrationEmails(registerationEmailDto);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      deviceId: device.id,
      addressId: addressId,
    };
  }
  public getUserEditionsAccess = async (userId: string) => {
    const [accesses, editions] = await Promise.all([
      this.db.editionAccess.findMany({
        where: { userId },
        select: { editionId: true },
      }),
      this.db.edition.findMany({
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          code: true,
          title: true,
          releaseDate: true,
        },
      }),
    ]);
    const accessIds = new Set(accesses.map((a) => a.editionId));

    const withAccess = editions.filter((e) => accessIds.has(e.id));
    const withoutAccess = editions.filter((e) => !accessIds.has(e.id));
    return {
      withAccess,
      withoutAccess,
    };
  };
  private async sendUserRegistrationEmails(userDto: {
    email: string;
    name: string;
    address?: ShippingAddress;
  }) {
    try {
      const sendUserEmailPromise = this.integrations.email.sendEmail({
        email: userDto.email,
        type: EmailType.REGISTER,
        content: {
          email: userDto.email,
          name: userDto.name,
        },
      });
      const sendAdminEmailPromise = this.integrations.adminEmail.send({
        type: AdminEmailType.NEW_USER,
        content: {
          email: userDto.email,
          name: userDto.name,
          address: userDto.address,
        },
      });
      await Promise.all([sendUserEmailPromise, sendAdminEmailPromise]);
    } catch (error) {
      logger.error(error, "Failed to send email");
    }
  }
  async findOrRegisterDevice({
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
    const db = tx || this.db;
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
