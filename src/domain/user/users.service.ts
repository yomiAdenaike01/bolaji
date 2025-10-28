import { UserStatus } from "@/generated/prisma/enums";
import { Db, TransactionClient } from "@/infra";
import { Integrations } from "@/infra/integrations";
import { AdminEmailType, EmailType } from "@/infra/integrations/email-types";
import { logger } from "@/lib/logger";
import bcrypt from "bcrypt";
import z from "zod";
import {
  CreateUserInput,
  ShippingAddress,
  shippingAddressSchema,
} from "../schemas/users";

export class UserService {
  constructor(
    private readonly db: Db,
    private readonly integrations: Integrations,
  ) {}

  changeUserStatus = (userId: string, status: UserStatus) => {
    logger.info(
      `[User Service] Changing status for userId=${userId} to status=${status}`,
    );
    return this.db.user.update({
      where: {
        id: userId,
      },
      data: {
        status,
      },
    });
  };
  async findUserById(uid: string) {
    return this.db.user.findUniqueOrThrow({
      where: {
        id: uid,
      },
    });
  }

  private createAddress = (
    input: ShippingAddress & { name: string; userId: string },
    tx?: TransactionClient,
  ) => {
    const db = tx || this.db;
    logger.info(`[User Service] Creating address for userId=${input.userId}`);

    return db.address.create({
      data: {
        isDefault: true,
        line1: input.line1,
        line2: input.line2,
        fullName: input.name,
        postalCode: input.postalCode,
        city: input.city,
        country: input.country,
        phone: input.phone,
        user: {
          connect: {
            id: input.userId,
          },
        },
      },
    });
  };
  findOrCreateUser = async (
    input: {
      email: string;
      name: string;
      password: string;
      status: UserStatus;
    },
    tx?: TransactionClient,
  ) => {
    const mutations = async (db: TransactionClient | Db) => {
      let foundOrCreatedUser = await db.user.findUnique({
        where: { email: input.email },
      });

      if (foundOrCreatedUser?.status === UserStatus.ACTIVE) {
        throw new Error("User already exists with that email.");
      }

      if (
        foundOrCreatedUser?.status &&
        (
          [
            UserStatus.PENDING_PREORDER,
            UserStatus.PENDING_RETRY,
          ] as Array<UserStatus>
        ).includes(foundOrCreatedUser?.status)
      ) {
        logger.info(
          `[User service] Updating user with status=${foundOrCreatedUser.status} userId=${foundOrCreatedUser.id}`,
        );
        foundOrCreatedUser = await db.user.update({
          where: { id: foundOrCreatedUser.id },
          data: {
            name: input.name || foundOrCreatedUser.name,
            passwordHash: bcrypt.hashSync(input.password, 10),
            status: input.status,
          },
        });
      } else {
        logger.info(`[User service] Creating user email=${input.email}`);
        // 🔹 CASE 3: New user creation
        const passwordHash = bcrypt.hashSync(input.password, 10);
        foundOrCreatedUser = await db.user.create({
          data: {
            email: input.email,
            name: input.name,
            passwordHash,
            status: input.status,
          },
        });
      }
      return foundOrCreatedUser;
    };
    if (!tx) return this.db.$transaction((tx) => mutations(tx));
    return mutations(tx);
  };

  registerUser = async (input: CreateUserInput & { status?: UserStatus }) => {
    const userStatus = input.status || UserStatus.ACTIVE;
    const { user, device, addressId } = await this.db.$transaction(
      async (tx) => {
        let foundOrCreatedUser = await this.findOrCreateUser(
          {
            email: input.email,
            name: input.name,
            status: userStatus,
            password: input.password,
          },
          tx,
        );

        let addressId: string | null = null;

        if (input.shippingAddress) {
          const address = await this.createAddress(
            {
              ...input.shippingAddress,
              userId: foundOrCreatedUser.id,
              name: foundOrCreatedUser.name || "",
            },
            tx,
          );
          addressId = address.id;
        }

        const device = await this.findOrRegisterDevice({
          tx: tx,
          deviceFingerprint: input.deviceFingerprint,
          userId: foundOrCreatedUser.id,
          userAgent: input.userAgent,
        });
        return { device, user: foundOrCreatedUser, addressId };
      },
    );

    if (!device.id) throw new Error("No device id found");

    const registerationEmailDto = z
      .object({
        email: z.string().min(1),
        name: z.string().min(1),
        address: shippingAddressSchema.optional(),
      })
      .parse({
        name: user.name,
        email: user.email,
        ...(input.shippingAddress
          ? {
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
            }
          : {}),
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
  };
  public getUserEditionsAccess = async (userId: string) => {
    const [accesses, editions] = await this.db.$transaction(async (tx) => {
      return Promise.all([
        tx.editionAccess.findMany({
          where: { userId },
          select: { editionId: true },
        }),
        tx.edition.findMany({
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
    });

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
      logger.error(error, "[User Service] Failed to send registration emails");
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
  }
}
