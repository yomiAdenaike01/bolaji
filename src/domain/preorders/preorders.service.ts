import { Address } from "@/generated/prisma/client";
import {
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
import {
  CompletedPreoderEventDto,
  preorderSchema,
} from "@/infra/integrations/schema";
import { logger } from "@/lib/logger";
import z from "zod";
import { createPreorderSchema } from "../schemas/preorder";
import { ShippingAddress, shippingAddressSchema } from "../schemas/users";
import { UserService } from "../user/users.service";
import { AdminEmailType, EmailType } from "@/infra/integrations/email-types";

export class PreordersService {
  constructor(
    private readonly db: Db,
    private readonly user: UserService,
    private readonly integrations: Integrations,
  ) {}

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
        status: {
          notIn: [OrderStatus.PAID, OrderStatus.CANCELED],
        },
      },
      data: {
        status: OrderStatus.FAILED,
        failedAt: new Date(),
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

  async canAcceptPreorder(tx?: TransactionClient) {
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
  }

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
      redirectUrl,
    }: {
      addressId: string | null;
      userId: string;
      choice: PlanType;
      email: string;
      redirectUrl: string;
    },
    tx?: TransactionClient,
  ) => {
    const parsed = createPreorderSchema
      .omit({ name: true })
      .safeExtend(z.object({ addressId: z.string().min(1).nullable() }).shape)
      .parse({ userId, choice, email, addressId, redirectUrl });

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

    // 2️⃣ Stripe link handling (idempotent)
    const paymentLink = await this.findOrCreatePreorderPaymentLink({
      stripePaymentLinkId: preorder.stripePaymentLinkId,
      addressId,
      amount: totalCents,
      choice: parsed.choice,
      editionId: edition00.id,
      preorderId: preorder.id,
      userId: parsed.userId,
      redirectUrl,
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

    const result = await this.completePreorderTransaction(completedPreorderDto);

    await this.db.user.update({
      where: {
        id: completedPreorderDto.userId,
      },
      data: {
        status: UserStatus.ACTIVE,
      },
    });

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
      `[Preorder Service] Completeing preorder transaction for userId=${userId} editionId=${editionId} paymentLinkId=${paymentLinkId} plan=${plan} addressId=${addressId}`,
    );
    return this.db.$transaction(async (tx) => {
      let address: Address | null = null;
      logger.info(
        `[Preorder Service] Creating order for eventId=${eventId} paymentLinkId=${paymentLinkId}`,
      );
      const order = await tx.order.create({
        data: {
          userId,
          editionId,
          stripePaymentIntentId: eventId,
          currency: "GBP",
          status: OrderStatus.PAID,
          totalCents: amount,
          type: OrderType.PREORDER,
          preorder: {
            connect: {
              stripePaymentLinkId: paymentLinkId,
            },
          },
        },
        include: {
          edition: {
            select: {
              code: true,
            },
          },
          user: {
            include: {
              addresses: true,
            },
          },
        },
      });
      logger.info(
        `[Preorder Service] Creating successful payment for order=${order.id} paymentEventId=${eventId} userId=${userId} amount=${amount}`,
      );
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
        `[Preorder Service] Updating preorder to status=${OrderStatus.PAID} by paymentLinkId=${paymentLinkId}`,
      );
      await tx.preorder.update({
        where: {
          stripePaymentLinkId: paymentLinkId,
        },
        data: {
          status: OrderStatus.PAID,
        },
      });

      if (plan !== PlanType.PHYSICAL) {
        logger.info(
          `[Preorder Service] Updating edition access for userId=${userId} editionId=${editionId}`,
        );
        await tx.editionAccess.create({
          data: {
            editionId,
            userId,
            unlockedAt: new Date(),
          },
        });
      }

      if ([PlanType.FULL, PlanType.PHYSICAL].includes(plan as any)) {
        if (!addressId) {
          throw new Error("Address is not defined");
        }
        logger.info(
          `[Preorder Service] Creating shipment for addressId=${addressId} userId=${userId}`,
        );
        const shipment = await tx.shipment.create({
          data: {
            userId,
            editionId,
            addressId,
            status: ShipmentStatus.PENDING,
          },
          include: {
            address: true,
          },
        });
        address = shipment.address;
      }
      logger.info(
        `[Preorder Service] ✅ Completed preorder transactions orderId=${order.id} for userId=${order.userId}`,
      );
      return {
        email: order.user.email,
        name: order.user.name,
        editionCode: order.edition?.code,
        address,
      };
    });
  };

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
