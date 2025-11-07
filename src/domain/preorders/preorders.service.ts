import { Config } from "@/config";
import { Address } from "@/generated/prisma/client";
import {
  AccessStatus,
  OrderStatus,
  OrderType,
  PaymentProvider,
  PaymentStatus,
  PlanType,
  ShipmentStatus,
  UserStatus,
} from "@/generated/prisma/enums";
import { Db, TransactionClient } from "@/infra";
import { Integrations } from "@/infra/integrations";
import { AdminEmailType, EmailType } from "@/infra/integrations/email-types";
import {
  CompletedPreoderEventDto,
  preorderSchema,
} from "@/infra/integrations/schema";
import { logger } from "@/lib/logger";
import z from "zod";
import { createPreorderSchema } from "../schemas/preorder";
import { ShippingAddress, shippingAddressSchema } from "../schemas/users";
import { UserService } from "../user/users.service";
import { addYears, isAfter } from "date-fns";
import { Store } from "@/infra";
import {
  EDITION_00_REMANING_CACHE_KEY,
  PREORDER_EDITION_MAX_COPIES,
} from "@/constants";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { PasswordService } from "../password/password.service";
import { PricingService } from "../pricing.service";

export enum CompletePreorderStatus {
  SUCCESS = "SUCCESS", // fully created and completed successfully
  UPDATED_EXISTING = "UPDATED_EXISTING", // existing records found but fixed (e.g. status updated)
  ALREADY_PAID = "ALREADY_PAID", // preorder already completed successfully earlier
  ORDER_EXISTS = "ORDER_EXISTS", // order already exists and paid
  PAYMENT_EXISTS = "PAYMENT_EXISTS", // payment already recorded as succeeded
  PREORDER_NOT_FOUND = "PREORDER_NOT_FOUND", // no preorder row found for this paymentLinkId
  INVALID_ADDRESS = "INVALID_ADDRESS", // missing or invalid address for physical/full
  FAILED = "FAILED", // unexpected error or unhandled case
}

export class PreordersService {
  constructor(
    private readonly config: Config,
    private readonly db: Db,
    private readonly user: UserService,
    private readonly integrations: Integrations,
    private readonly store: Store,
    private readonly passwordService: PasswordService,
    private readonly pricingService: PricingService,
  ) {}

  canSubscribe = async (userId: string) => {
    try {
      const cacheKey = `preorder-subscribe-page:access:${userId}`;
      const cached = await this.store.get(cacheKey);
      if (cached) {
        try {
          return Boolean(cached);
        } catch {
          return false;
        }
      }
      const preorder = await this.db.preorder.findFirst({
        where: {
          userId,
          OR: [
            {
              status: OrderStatus.PAID,
            },
            {
              user: {
                status: UserStatus.PENDING_PREORDER,
              },
            },
          ],
        },
      });
      await this.store.setEx(cacheKey, 1000 * 60 * 60, "true");
      return !!preorder;
    } catch (error) {
      throw new Error("Failed to find preorder");
    }
  };

  findPreorderById = async (preorderId: string) => {
    return this.db.preorder.findUnique({
      where: {
        id: preorderId,
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        edition: true,
      },
    });
  };

  canAccessPreorderEdition = async (userId: string) => {
    logger.info(
      `[PreorderService] Checking Edition 00 access for userId=${userId}`,
    );

    // 1️⃣ Find the user's paid preorder for Edition 00
    const edtionAccess = await this.db.editionAccess.findFirst({
      where: {
        userId,
        edition: {
          number: 0, // safer than code hard-string,
          // releaseDate: {
          //   lte: new Date(),
          // },
        },
      },
      include: {
        user: true,
      },
    });

    if (!edtionAccess) {
      logger.warn(
        `[Preorder Service] No edition access record for user ${userId}`,
      );
      return false;
    }

    // 2️⃣ Enforce expiry (Edition 00 → 1 year)
    const now = new Date();
    if (edtionAccess.expiresAt && isAfter(now, edtionAccess.expiresAt)) {
      logger.warn(`[Preorder Service] Access expired for user ${userId}`);
      return false;
    }

    // 3️⃣ Optionally check status
    if (edtionAccess.status !== AccessStatus.ACTIVE) {
      logger.warn(
        `[Preorder Service] Access not active (status=${edtionAccess.status}) for user ${userId}`,
      );
      return false;
    }

    logger.info(
      `[Preorder Service] Valid Edition 00 access found: accessId=${edtionAccess.id}, expiresAt=${edtionAccess?.expiresAt?.toISOString()}`,
    );

    return true;
  };

  markAsFailed = async ({
    userId,
    editionId,
    preorderId,
    quantity,
  }: {
    preorderId: string;
    userId: string;
    editionId: string;
    addressId: string | null;
    quantity: number;
  }) => {
    const preorder = await this.db.preorder.update({
      where: {
        id: preorderId,
        userId,
        editionId,
      },
      data: {
        status: OrderStatus.FAILED,
        failedAt: new Date(),
        user: {
          update: {
            status: UserStatus.PENDING_RETRY,
          },
        },
      },
      include: {
        edition: true,
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });
    if (preorder.id && preorder.userId) {
      logger.info(
        `[Preorder Service] Marked preorder as FAILED — id=${preorder.id}, edition=${editionId}, user=${userId}`,
      );
      logger.info(
        `[Preorder Service] Restoring edition00 quantity=${quantity}`,
      );
      await this.store.incrBy(EDITION_00_REMANING_CACHE_KEY, quantity);

      return preorder;
    }
    logger.warn(
      `[Preorder Service] No eligible preorder found to mark as failed (userId=${userId}, editionId=${editionId})`,
    );
    return null;
  };

  findOrCreatePreorderPaymentLink = async ({
    stripePaymentLinkId,
    amount,
    choice,
    editionId,
    userId,
    addressId,
    redirectUrl,
    preorderId,
    quantity,
    shippingCents,
    shippingZone,
  }: {
    quantity?: number;
    stripePaymentLinkId?: string | null;
    amount: number;
    choice: PlanType;
    editionId: string;
    userId: string;
    addressId: string | null;
    redirectUrl: string;
    preorderId: string;
    shippingCents?: number;
    shippingZone?: string;
  }) => {
    try {
      // ✅ 1️⃣ If a Stripe link exists, check if it’s still valid
      if (stripePaymentLinkId) {
        const existing =
          await this.integrations.payments.getPaymentLink(stripePaymentLinkId);

        if (existing) {
          logger.info(
            `♻️ Reusing existing Stripe link for preorder=${preorderId}, link=${existing.url}`,
          );
          return existing;
        }

        logger.warn(
          `⚠️ Stripe link ${stripePaymentLinkId} invalid or deleted — recreating.`,
        );
      }

      // ✅ 2️⃣ Create a new link (using idempotency key)
      const paymentLink =
        await this.integrations.payments.createPreorderPaymentLink({
          userId,
          editionId,
          choice,
          amount,
          addressId,
          redirectUrl,
          preorderId,
          quantity,
          shippingCents,
          shippingZone,
        });

      // ✅ 3️⃣ Save in DB atomically
      await this.db.preorder.update({
        where: { id: preorderId },
        data: { stripePaymentLinkId: paymentLink.stripePaymentLinkId },
      });

      logger.info(
        `✅ Created new Stripe link - preoderId=${preorderId}, link=${paymentLink.url}`,
      );

      return paymentLink;
    } catch (err: any) {
      logger.error(err, "❌ Stripe payment link creation failed");

      // mark user for retry — safe recovery state
      await this.db.user.update({
        where: { id: userId },
        data: { status: UserStatus.PENDING_RETRY },
      });

      throw new Error(`Stripe payment link creation failed: ${err.message}`);
    }
  };

  canAcceptPreorder = async (
    plan: PlanType,
    tx?: TransactionClient,
  ): Promise<boolean> => {
    // Digital editions have no limit
    if (plan === "DIGITAL") return true;

    const key = "edition:0:remaining";

    try {
      // 1️⃣ Try to read remaining stock from Redis first
      const remaining = await this.store.get(key);

      if (remaining !== null) {
        // parseInt ensures we safely compare a number
        return Number(remaining) > 0;
      }

      // 2️⃣ Fallback: calculate from database if Redis key missing
      const dbClient = tx ?? this.db;

      const [preorderCount, preorderEdition] = await Promise.all([
        dbClient.preorder.count({
          where: {
            status: { in: [OrderStatus.PENDING, OrderStatus.PAID] },
          },
        }),
        dbClient.edition.findUniqueOrThrow({ where: { number: 0 } }),
      ]);

      const preorderMaxCopies =
        preorderEdition.maxCopies || PREORDER_EDITION_MAX_COPIES;

      return preorderCount < preorderMaxCopies;
    } catch (err) {
      console.error("canAcceptPreorder check failed:", err);

      // 3️⃣ Fail-open (so a Redis hiccup doesn't block users)
      return true;
    }
  };

  private getExistingPreorder = async (
    userId: string,
    editionId: string,
    choice: PlanType,
    tx?: TransactionClient,
  ) => {
    return (tx || this.db).preorder.findFirst({
      where: {
        userId,
        choice,
        editionId: editionId,
        status: {
          in: [OrderStatus.PENDING, OrderStatus.PAID],
        },
      },
    });
  };

  /**
   * Checks and reserves stock for physical/full preorders.
   * Uses Redis for atomic operations and falls back to DB if Redis not initialized.
   * Returns `true` if reservation succeeded, otherwise throws an error.
   */
  /**
   * Checks and reserves stock for physical/full preorders.
   * Uses Redis for atomic operations and falls back to DB if Redis not initialized.
   * Returns `true` if reservation succeeded, otherwise throws an error.
   */
  private reservePhysicalStock = async (
    plan: PlanType,
    quantity = 1,
  ): Promise<boolean> => {
    // Only relevant for physical or full editions
    if (plan === PlanType.DIGITAL) return false;

    const key = EDITION_00_REMANING_CACHE_KEY; // Edition 00 is the only preorderable edition
    const context = { plan, key, quantity };

    try {
      // 1️⃣ Try Redis first
      const remainingStr = await this.store.get(key);

      if (remainingStr !== null) {
        const remaining = Number(remainingStr);
        logger.info({ ...context, remaining }, "🔍 Checking Redis stock");

        if (remaining < quantity) {
          logger.warn(
            { ...context, remaining },
            "❌ Not enough stock in Redis",
          );
          throw new Error("Sold out");
        }

        // Atomically decrement by custom quantity using Lua or multi() transaction
        const newRemaining = await this.store.decrBy(key, quantity);

        if (Number(newRemaining) < 0) {
          // Undo overshoot
          await this.store.incrBy(key, quantity);
          logger.error(
            { ...context, remaining, newRemaining },
            "⚠️ Race condition: Redis stock went below zero, rollback performed",
          );
          throw new Error("Sold out");
        }

        logger.info(
          {
            ...context,
            remainingBefore: remaining,
            remainingAfter: newRemaining,
          },
          "✅ Reserved preorder stock via Redis",
        );
        return true;
      }

      // 2️⃣ Fallback to DB check
      logger.warn(
        { ...context },
        "[Preorder Service] ⚠️ Redis key missing — falling back to DB preorder count",
      );

      const [preorderCount, preorderEdition] = await this.db.$transaction(
        (tx) =>
          Promise.all([
            tx.preorder.count({
              where: {
                status: { in: [OrderStatus.PENDING, OrderStatus.PAID] },
              },
            }),
            tx.edition.findUniqueOrThrow({ where: { number: 0 } }),
          ]),
      );

      const preorderMaxCopies =
        preorderEdition.maxCopies || PREORDER_EDITION_MAX_COPIES;

      if (preorderCount + quantity > preorderMaxCopies) {
        logger.warn(
          { ...context, preorderCount, preorderMaxCopies },
          "[Preorder Service] ❌ Edition sold out (DB fallback)",
        );
        throw new Error("Sold out");
      }

      logger.info(
        { ...context, preorderCount, preorderMaxCopies },
        "[Preorder Service] ✅ Reserved stock via DB fallback",
      );

      return true;
    } catch (err) {
      logger.error(
        { ...context, error: (err as any).message },
        "[Preorder Service] 💥 Failed to reserve preorder slot",
      );
      throw err;
    }
  };

  registerPreorder = async (
    {
      userId,
      choice,
      email,
      addressId,
      quantity = 1,
      country,
    }: {
      quantity?: number;
      addressId: string | null;
      userId: string;
      choice: PlanType;
      email: string;
      country?: string;
    },
    tx?: TransactionClient,
  ) => {
    const parsed = createPreorderSchema
      .omit({ name: true })
      .safeExtend(
        z.object({
          addressId: z.string().min(1).nullable(),
          country: z.string().optional(),
        }).shape,
      )
      .parse({ userId, choice, email, addressId, quantity, country });

    let reservedPhysicalCopy = false;

    try {
      const totalCents = this.pricingService.getPreorderProductPrice(
        parsed.choice,
      );
      const totalIncQuantity = totalCents * quantity; // used for db records
      let shippingCost = 0;
      let shippingZone: string | undefined = undefined;

      reservedPhysicalCopy = await this.reservePhysicalStock(
        parsed.choice,
        quantity,
      );
      let shouldAddShippingCost = reservedPhysicalCopy && parsed.country;

      if (shouldAddShippingCost) {
        shippingCost = this.pricingService.getShippingPrice(parsed.country!);
        shippingZone = this.pricingService.getShippingZone(parsed.country!);
      }

      // 1️⃣ Atomic DB step — ensure edition and preorder consistency
      const { preorder, edition00 } = await this.db.$transaction(async (tx) => {
        const edition00 = await tx.edition.findUniqueOrThrow({
          where: { number: 0 },
        });

        const existing = await this.getExistingPreorder(
          userId,
          edition00.id,
          choice,
          tx,
        );

        if (existing?.status === OrderStatus.PAID) {
          logger.info(
            `✅ User ${userId} already completed preorder for edition ${edition00.id}`,
          );
          return { preorder: existing, edition00 };
        }

        if (existing) {
          logger.info(
            `♻️ Reusing existing preorder ${existing.id} for user ${userId}`,
          );
          return { preorder: existing, edition00 };
        }

        const preorder = await tx.preorder.create({
          data: {
            userId: parsed.userId,
            choice: parsed.choice,
            editionId: edition00.id,
            totalCents: totalIncQuantity,
            currency: "GBP",
            status: OrderStatus.PENDING,
          },
        });

        logger.info(
          `🆕 Created new preorder ${preorder.id} for user ${userId} (${choice})`,
        );

        return { preorder, edition00 };
      });
      if (preorder.status === OrderStatus.PAID) {
        throw new Error("User has already paid");
      }

      // 2️⃣ Stripe link handling (idempotent)
      const paymentLink = await this.findOrCreatePreorderPaymentLink({
        stripePaymentLinkId: preorder.stripePaymentLinkId,
        addressId,
        amount: totalCents,
        choice: parsed.choice,
        editionId: edition00.id,
        preorderId: preorder.id,
        userId: parsed.userId,
        quantity: parsed.quantity,
        shippingCents: shippingCost,
        shippingZone,
        redirectUrl: `${this.config.serverUrl}/preorders/thank-you?preorder_id=${preorder.id}`,
      });

      // 3️⃣ Mark user as active once Stripe is ready
      await this.db.user.update({
        where: { id: userId },
        data: { status: UserStatus.PENDING_PREORDER },
      });

      // 4️⃣ Non-blocking email
      const user = await this.user.findUserById(userId);
      if (!user?.name)
        throw new Error(`Missing name for user id=${userId} during preorder.`);

      // 5️⃣ Return consistent shape
      return {
        preorderId: preorder.id,
        url: paymentLink.url,
        amount: preorder.totalCents,
        currency: "GBP",
      };
    } catch (error) {
      if (reservedPhysicalCopy && parsed.choice !== PlanType.DIGITAL) {
        await this.store.incrBy(EDITION_00_REMANING_CACHE_KEY, quantity);
      }
      throw error;
    }
  };

  private sendCheckOutCompleteEmails = ({
    name,
    email,
    choice,
    amount,
    edition,
    address,
    newUserPassword,
    quantity = 1,
  }: {
    amount: string;
    name: string;
    email: string;
    choice: PlanType;
    edition: string;
    address?: ShippingAddress;
    newUserPassword?: string;
    quantity: number;
  }) => {
    const sendConfirmEmail = this.integrations.email.sendEmail({
      email: email,
      type: EmailType.PREORDER_CONFIRMATION,
      content: {
        editionCode: "ED00",
        email: email,
        name: name || "",
        plan: choice,
        newPassword: newUserPassword,
      },
    });

    const sendAdminEmail = this.integrations.adminEmail.send({
      type: AdminEmailType.NEW_PREORDER,
      content: {
        amount,
        editionCode: edition,
        email: email,
        name,
        plan: choice,
        address,
        quantity,
      },
    });

    Promise.all([sendConfirmEmail, sendAdminEmail]).catch((err) => {
      logger.error(err, "Failed to confirm or admin email");
    });
  };

  hasSuccessfulPreorder = async (userId: string, tx?: TransactionClient) => {
    const db = tx || this.db;
    logger.info(`[Preorder Service] Has user preordered before - ${userId}`);
    const hasPreorederBefore = await db.order.findFirst({
      where: {
        userId,
        type: OrderType.PREORDER,
        status: OrderStatus.PAID,
        stripePaymentIntentId: {
          not: null,
        },
        edition: {
          number: 0,
        },
      },
    });
    const result = !!hasPreorederBefore;
    logger.info(
      `[Preorder Service] User - ${userId} has successful preorder - ${result}`,
    );
    return result;
  };

  public onCompletePreorder = async (
    completedPreorderDto: CompletedPreoderEventDto,
  ) => {
    preorderSchema.parse(completedPreorderDto);
    const { plan, amount } = completedPreorderDto;

    const { result, status } =
      await this.completePreorderTransaction(completedPreorderDto);

    const resultStatus = status as CompletePreorderStatus;

    if (
      [
        CompletePreorderStatus.UPDATED_EXISTING,
        CompletePreorderStatus.SUCCESS,
      ].includes(resultStatus)
    ) {
      await this.integrations.payments.invalidatePaymentLink(
        completedPreorderDto.paymentLinkId,
      );
    }

    if (
      [
        CompletePreorderStatus.FAILED,
        CompletePreorderStatus.PREORDER_NOT_FOUND,
        CompletePreorderStatus.ALREADY_PAID,
        CompletePreorderStatus.INVALID_ADDRESS,
      ].includes(resultStatus)
    ) {
      if (
        [
          CompletePreorderStatus.ALREADY_PAID,
          CompletePreorderStatus.PREORDER_NOT_FOUND,
        ].includes(resultStatus)
      ) {
        await this.integrations.payments.invalidatePaymentLink(
          completedPreorderDto.paymentLinkId,
        );
      }
      throw { message: "Failed to create preorder", status: resultStatus };
    }

    if (!result) return null;

    const shouldUpdatePassword = plan !== PlanType.PHYSICAL;

    const { plainPassword, hashedPassword } =
      await this.passwordService.generatePassword();

    if (shouldUpdatePassword) {
      await this.db.user.update({
        where: {
          id: completedPreorderDto.userId,
          status: {
            not: UserStatus.ACTIVE,
          },
        },
        data: {
          status: UserStatus.ACTIVE,
          passwordHash: hashedPassword,
        },
      });
    }
    const shippingPrice = result.address?.country
      ? this.pricingService.getShippingPrice(result.address?.country)
      : 0;
    const formattedAmount = new Intl.NumberFormat("en-GB", {
      currency: "gbp",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      style: "currency",
    }).format((amount + shippingPrice) / 100);

    const sendCommsDto = z
      .object({
        email: z.email().min(1),
        name: z.string().min(1),
        editionCode: z.string().min(1),
        address: shippingAddressSchema.optional(),
      })
      .parse({
        email: result.email,
        name: result.name,
        editionCode: result.editionCode,
        ...(result.address
          ? {
              address: {
                postalCode: result.address?.postalCode,
                city: result.address?.city,
                state: result.address?.state,
                country: result.address?.country,
                fullName: result.name,
                line1: result.address?.line1,
                line2: result.address?.line2,
                phone: result.address?.phone,
              },
            }
          : {}),
      });

    this.sendCheckOutCompleteEmails({
      name: sendCommsDto.name,
      email: sendCommsDto.email,
      choice: plan,
      amount: formattedAmount,
      edition: sendCommsDto.editionCode,
      address: sendCommsDto.address,
      newUserPassword: shouldUpdatePassword ? plainPassword : undefined,
      quantity: completedPreorderDto.quantity,
    });
  };
  private grantEditionAccess = async (
    tx: TransactionClient,
    {
      userId,
      editionId,
      plan,
    }: { plan: PlanType; userId: string; editionId: string },
  ) => {
    // ----  Grant edition access ----
    const existingAccess = await tx.editionAccess.findFirst({
      where: { userId, editionId, accessType: plan },
    });
    // Preorders unlock novemeber 9th 2025 9AM
    if (!existingAccess) {
      const edition = await tx.edition.findUnique({
        where: {
          id: editionId,
        },
      });

      logger.info(
        {
          editionId,
          userId,
          accessType: plan,
          unlockAt: (
            edition?.releaseDate ||
            edition?.preorderOpenAt ||
            new Date()
          ).toISOString(),
          status: AccessStatus.SCHEDULED,
          expiresAt: addYears(Date.now(), 1).toISOString(),
        },
        `[PreorderService-grantEditionAccess] Creating edition acces editionId - ${editionId} userId - ${userId} planType - ${plan} status-${AccessStatus.SCHEDULED}`,
      );

      await tx.editionAccess.create({
        data: {
          editionId,
          userId,
          accessType: plan,
          unlockAt:
            edition?.releaseDate || edition?.preorderOpenAt || new Date(),
          status: AccessStatus.SCHEDULED,
          expiresAt: addYears(Date.now(), 1),
        },
      });
      logger.info(
        `[Preorder Service] 🆕 Created edition access userId=${userId}`,
      );
    } else if (
      existingAccess.unlockAt &&
      existingAccess.status === AccessStatus.SCHEDULED &&
      isAfter(new Date(), existingAccess.unlockAt)
    ) {
      // Activate automatically if the unlock date has already passed
      await tx.editionAccess.update({
        where: { id: existingAccess.id, accessType: plan },
        data: { status: AccessStatus.ACTIVE, unlockedAt: new Date() },
      });
      logger.info(
        `[Preorder Service] 🔓 Activated edition access for userId=${userId}`,
      );
    }
  };

  private completePreorderTransaction = async (
    dto: CompletedPreoderEventDto,
  ) => {
    const {
      eventId,
      userId,
      editionId,
      paymentLinkId,
      amount,
      plan,
      addressId,
      quantity = 1,
    } = dto;

    logger.info(
      `[Preorder Service] Completing preorder transaction userId=${userId} editionId=${editionId} paymentLinkId=${paymentLinkId}`,
    );

    return this.db.$transaction(async (tx) => {
      try {
        // ---- 1️⃣ Ensure preorder exists ----
        const preorder = await tx.preorder.findUnique({
          where: {
            userId,
            choice: plan,
            stripePaymentLinkId: paymentLinkId,
            status: {
              not: OrderStatus.PAID,
            },
          },
          select: { id: true, status: true, userId: true, editionId: true },
        });

        if (!preorder) {
          logger.error(
            `[Preorder Service] ❌ Preorder already paid (${paymentLinkId})`,
          );
          return { status: CompletePreorderStatus.ALREADY_PAID, result: null };
        }

        let updatedExisting = false;

        // ---- 2️⃣ Find or fix existing order ----
        let order = await tx.order.findFirst({
          where: {
            preorder: { stripePaymentLinkId: paymentLinkId },
            type: OrderType.PREORDER,
          },
          include: {
            edition: { select: { code: true } },
            user: { select: { name: true, email: true, id: true } },
          },
        });

        if (order) {
          if (order.status !== OrderStatus.PAID) {
            await tx.order.update({
              where: { id: order.id },
              data: { status: OrderStatus.PAID },
            });
            updatedExisting = true;
            logger.info(
              `[Preorder Service] 🔄 Updated existing order=${order.id} → PAID`,
            );
          }
        } else {
          order = await tx.order.create({
            data: {
              userId,
              editionId,
              stripePaymentIntentId: eventId,
              currency: "GBP",
              status: OrderStatus.PAID,
              quantity,
              totalCents: amount,
              type: OrderType.PREORDER,
              preorder: {
                connect: { stripePaymentLinkId: paymentLinkId },
              },
            },
            include: {
              edition: { select: { code: true } },
              user: { select: { name: true, email: true, id: true } },
            },
          });
          logger.info(`[Preorder Service] 🆕 Created order=${order.id}`);
        }

        // ---- 3️⃣ Payment: create or fix ----
        let payment = await tx.payment.findUnique({
          where: { providerPaymentId: eventId },
        });

        if (payment) {
          if (payment.status !== PaymentStatus.SUCCEEDED) {
            await tx.payment.update({
              where: { id: payment.id },
              data: { status: PaymentStatus.SUCCEEDED },
            });
            updatedExisting = true;
            logger.info(
              `[Preorder Service] 🔄 Updated payment=${payment.id} → SUCCEEDED`,
            );
          }
        } else {
          await tx.payment.create({
            data: {
              orderId: order.id,
              providerPaymentId: eventId,
              userId,
              provider: PaymentProvider.STRIPE,
              status: PaymentStatus.SUCCEEDED,
              amountCents: amount,
            },
          });
          logger.info(
            `[Preorder Service] 💳 Created payment for eventId=${eventId}`,
          );
        }

        // ---- Update preorder status if needed ----
        if (preorder.status !== OrderStatus.PAID) {
          await tx.preorder.update({
            where: { stripePaymentLinkId: paymentLinkId },
            data: { status: OrderStatus.PAID },
          });
          updatedExisting = true;
          logger.info(`[Preorder Service] 🔄 Updated preorder → PAID`);
        }

        // ----  Grant edition access ----
        await this.grantEditionAccess(tx, {
          userId,
          editionId,
          plan,
        });

        // ---- 6️⃣ Create or fix shipment ----
        let address: Address | null = null;
        if ([PlanType.FULL, PlanType.PHYSICAL].includes(plan as any)) {
          if (!addressId) {
            logger.error(`[Preorder Service] ❌ Missing address`);
            return {
              result: null,
              status: CompletePreorderStatus.INVALID_ADDRESS,
            };
          }

          let shipment = await tx.shipment.findFirst({
            where: { userId, editionId },
            include: { address: true },
          });

          if (shipment) {
            if (shipment.status !== ShipmentStatus.PENDING) {
              await tx.shipment.update({
                where: { id: shipment.id },
                data: { status: ShipmentStatus.PENDING },
              });
              updatedExisting = true;
              logger.info(
                `[Preorder Service] 🔄 Shipment=${shipment.id} → PENDING`,
              );
            }
            address = shipment.address;
          } else {
            shipment = await tx.shipment.create({
              data: {
                userId,
                editionId,
                addressId,
                status: ShipmentStatus.PENDING,
              },
              include: { address: true },
            });
            address = shipment.address;
            logger.info(
              `[Preorder Service] 🆕 Created shipment for user=${userId}`,
            );
          }
        }

        const result = {
          email: order.user.email,
          name: order.user.name,
          editionCode: order.edition?.code,
          address,
        };

        const status = updatedExisting
          ? CompletePreorderStatus.UPDATED_EXISTING
          : CompletePreorderStatus.SUCCESS;

        logger.info(
          `[Preorder Service] ✅ Completed preorder transaction for userId=${userId} status=${status}`,
        );

        return { status, result };
      } catch (error: any) {
        logger.error(
          `[Preorder Service] ❌ Transaction failed: ${error.message}`,
          error,
        );
        return { result: null, status: "FAILED", error: error.message };
      }
    });
  };
}
