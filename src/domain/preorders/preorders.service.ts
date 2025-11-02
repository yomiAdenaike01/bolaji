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
  ) {}

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
    const preorder = await this.db.preorder.findFirst({
      where: {
        userId,
        status: OrderStatus.PAID,
        edition: {
          number: 0, // safer than code hard-string
        },
      },
      include: {
        edition: {
          include: {
            editionAccess: {
              where: { userId },
            },
          },
        },
        user: true,
      },
    });

    if (!preorder) {
      logger.warn(
        `[Preorder Service] No paid preorder found for user ${userId}`,
      );
      return null;
    }

    const access = preorder.edition.editionAccess[0];
    if (!access) {
      logger.warn(
        `[Preorder Service] No edition access record for user ${userId}`,
      );
      return null;
    }

    // 2️⃣ Enforce expiry (Edition 00 → 1 year)
    const now = new Date();
    if (isAfter(now, access.expiresAt)) {
      logger.warn(`[Preorder Service] Access expired for user ${userId}`);
      return null;
    }

    // 3️⃣ Optionally check status
    if (access.status !== AccessStatus.ACTIVE) {
      logger.warn(
        `[Preorder Service] Access not active (status=${access.status}) for user ${userId}`,
      );
      return null;
    }

    logger.info(
      `[Preorder Service] Valid Edition 00 access found: preorderId=${preorder.id}, expiresAt=${access.expiresAt.toISOString()}`,
    );

    return {
      preorderId: preorder.id,
      expiresAt: access.expiresAt,
      user: preorder.user,
    };
  };

  markAsFailed = async ({
    userId,
    editionId,
    preorderId,
    redirectUrl,
    addressId,
  }: {
    preorderId: string;
    userId: string;
    editionId: string;
    redirectUrl: string;
    addressId: string | null;
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
      let paymentUrl: string | null = null;

      if (preorder.stripePaymentLinkId) {
        logger.info(
          `[Preorder Service] Fetching preorder payment link url — id=${preorder.id}, edition=${editionId}, user=${userId}`,
        );
        await this.integrations.payments.invalidatePaymentLink(
          preorder.stripePaymentLinkId,
        );
        const paymentLink = await this.findOrCreatePreorderPaymentLink({
          stripePaymentLinkId: preorder.stripePaymentLinkId,
          amount: preorder.totalCents,
          editionId,
          preorderId,
          redirectUrl,
          addressId,
          choice: preorder.choice,
          userId: preorder.userId,
        });

        if (paymentLink?.url) {
          logger.info(
            `[Preorder Service] Fetched preorder payment link url — id=${preorder.id} url=${paymentLink.url}, edition=${editionId}, user=${userId}`,
          );
          paymentUrl = paymentLink.url;
        }
        logger.warn(
          `[Preorder Service] Failed to find or create payment link - id=${preorder.id}, edition=${editionId}, user=${userId}`,
        );
      }
      return { ...preorder, retryUrl: paymentUrl };
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
  }: {
    stripePaymentLinkId?: string | null;
    amount: number;
    choice: PlanType;
    editionId: string;
    userId: string;
    addressId: string | null;
    redirectUrl: string;
    preorderId: string;
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

  canAcceptPreorder = async (tx?: TransactionClient) => {
    const queries = (db: TransactionClient | Db) => {
      const preorderCountPromise = db.preorder.count({
        where: {
          status: {
            in: [OrderStatus.PENDING, OrderStatus.PAID],
          },
        },
      });
      const preorderEditionPromise = db.edition.findUniqueOrThrow({
        where: { number: 0 },
      });
      return Promise.all([preorderCountPromise, preorderEditionPromise]);
    };

    let preorderCount = 0;
    let preorderMaxCopies = 300;

    if (!tx) {
      let [result, preorderEdition] = await this.db.$transaction(async (tx) => {
        return queries(tx);
      });
      preorderCount = result;
      preorderMaxCopies = preorderEdition.maxCopies || 300;
    } else {
      let [count, preorderEdition] = await queries(this.db);
      preorderCount = count;
      preorderMaxCopies = preorderEdition.maxCopies || 300;
    }

    return preorderCount + 1 < (preorderMaxCopies || 300);
  };

  private getExistingPreorder = async (
    userId: string,
    editionId: string,
    tx?: TransactionClient,
  ) => {
    return (tx || this.db).preorder.findFirst({
      where: {
        userId,
        editionId: editionId,
        status: {
          in: [OrderStatus.PENDING, OrderStatus.PAID],
        },
      },
    });
  };

  registerPreorder = async (
    {
      userId,
      choice,
      email,
      addressId,
    }: {
      addressId: string | null;
      userId: string;
      choice: PlanType;
      email: string;
    },
    tx?: TransactionClient,
  ) => {
    const parsed = createPreorderSchema
      .omit({ name: true })
      .safeExtend(z.object({ addressId: z.string().min(1).nullable() }).shape)
      .parse({ userId, choice, email, addressId });

    const totalCents = this.getPrice(parsed.choice);

    // 1️⃣ Atomic DB step — ensure edition and preorder consistency
    const { preorder, edition00 } = await this.db.$transaction(async (tx) => {
      const edition00 = await tx.edition.findUniqueOrThrow({
        where: { number: 0 },
      });

      const existing = await this.getExistingPreorder(userId, edition00.id, tx);

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
          totalCents,
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
      redirectUrl: `${this.config.serverUrl}/preorders/thank-you?preorder_id=${preorder.id}`, // TODO: Needs to redirect to thank you page based on plan, must include - "SUBSCRIBE TO THE ONGOING EDITIONS"
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

    this.integrations.email
      .sendEmail({
        email,
        content: {
          name: user.name,
          email,
          editionCode: edition00.code,
        },
        type: EmailType.PREORDER_CONFIRMATION,
      })
      .then(() =>
        logger.info(
          `📨 Sent preorder confirmation to ${email} (${preorder.id})`,
        ),
      )
      .catch((err) =>
        logger.error(err, `⚠️ Failed to send preorder email to ${email}`),
      );

    // 5️⃣ Return consistent shape
    return {
      preorderId: preorder.id,
      url: paymentLink.url,
      amount: preorder.totalCents,
      currency: "GBP",
    };
  };

  private sendCheckOutCompleteComms = ({
    name,
    email,
    choice,
    amount,
    edition,
    address,
  }: {
    amount: string;
    name: string;
    email: string;
    choice: PlanType;
    edition: string;
    address?: ShippingAddress;
  }) => {
    const sendConfirmEmail = this.integrations.email.sendEmail({
      email: email,
      type: EmailType.PREORDER_CONFIRMATION,
      content: {
        editionCode: "EDI00",
        email: email,
        name: name || "",
        plan: choice,
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
      },
    });

    Promise.all([sendConfirmEmail, sendAdminEmail]).catch((err) => {
      logger.error(err, "Failed to confirm or admin email");
    });
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

    await this.db.user.update({
      where: {
        id: completedPreorderDto.userId,
        status: {
          not: UserStatus.ACTIVE,
        },
      },
      data: {
        status: UserStatus.ACTIVE,
      },
    });

    if (!result) return null;

    const formattedAmount = new Intl.NumberFormat("en-GB", {
      currency: "gbp",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      style: "currency",
    }).format(amount / 100);

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

    this.sendCheckOutCompleteComms({
      name: sendCommsDto.name,
      email: sendCommsDto.email,
      choice: plan,
      amount: formattedAmount,
      edition: sendCommsDto.editionCode,
      address: sendCommsDto.address,
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
    if (plan !== PlanType.PHYSICAL) {
      const existingAccess = await tx.editionAccess.findFirst({
        where: { userId, editionId },
      });
      // Preorders unlock novemeber 9th 2025 9AM
      if (!existingAccess) {
        const unlockAt = new Date("2025-11-09T09:00:00.000Z");

        await tx.editionAccess.create({
          data: {
            editionId,
            userId,
            unlockAt,
            status: AccessStatus.SCHEDULED,
            expiresAt: addYears(Date.now(), 1),
          },
        });
        logger.info(
          `[Preorder Service] 🆕 Created edition access userId=${userId}`,
        );
      } else if (
        existingAccess.status === AccessStatus.SCHEDULED &&
        isAfter(new Date(), existingAccess.unlockAt)
      ) {
        // Activate automatically if the unlock date has already passed
        await tx.editionAccess.update({
          where: { id: existingAccess.id },
          data: { status: AccessStatus.ACTIVE, unlockedAt: new Date() },
        });
        logger.info(
          `[Preorder Service] 🔓 Activated edition access for userId=${userId}`,
        );
      }
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

  // TODO: Update preorder prices DIGITAL=800 FULL=2000 ALL_ACCESS=2000
  // Subscription prices DIGITAL=500 PHYSICAL=1000 ALL_ACCESS=1000
  private getPrice(choice: PlanType) {
    switch (choice) {
      case "DIGITAL":
        return 500;
      case "PHYSICAL":
      case "FULL":
        return 850;
      default:
        throw new Error("Invalid plan type");
    }
  }
}
