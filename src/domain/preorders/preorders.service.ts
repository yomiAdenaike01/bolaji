import { Address } from "@/generated/prisma/client";
import {
  OrderStatus,
  OrderType,
  PaymentProvider,
  PaymentStatus,
  PlanType,
  ShipmentStatus,
} from "@/generated/prisma/enums";
import { Db } from "@/infra";
import { Integrations } from "@/infra/integrations";
import { AdminEmailType } from "@/infra/integrations/admin.email.template";
import { EmailType } from "@/infra/integrations/email.integrations.templates";
import {
  CompletedPreoderEventDto,
  preorderSchema,
} from "@/infra/integrations/schema";
import { logger } from "@/lib/logger";
import z from "zod";
import { createPreorderSchema } from "../schemas/preorder";
import { ShippingAddress, shippingAddressSchema } from "../schemas/users";
import { UserService } from "../user/users.service";

export class PreordersService {
  constructor(
    private readonly db: Db,
    private readonly user: UserService,
    private readonly integrations: Integrations,
  ) {}

  async canAcceptPreorder() {
    const result = await this.db.preorder.count({
      where: {
        status: {
          in: [OrderStatus.PENDING, OrderStatus.PAID],
        },
      },
    });
    return result + 1 < 300;
  }

  private async hasExistingPreorder(userId: string, editionId: string) {
    const existing = await this.db.preorder.findFirst({
      where: {
        userId,
        editionId: editionId,
        status: {
          in: [OrderStatus.PENDING, OrderStatus.PAID],
        },
      },
    });
    return !!existing;
  }

  async registerPreorder({
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
  }) {
    const parsed = createPreorderSchema
      .omit({
        name: true,
      })
      .safeExtend(z.object({ addressId: z.string().min(1).nullable() }).shape)
      .parse({ userId, choice, email, addressId, redirectUrl });

    const edition00 = await this.db.edition.findUniqueOrThrow({
      where: { number: 0 },
    });

    const hasExistingPreorder = await this.hasExistingPreorder(
      userId,
      edition00.id,
    );
    if (hasExistingPreorder) throw new Error("User preorder exists");

    const totalCents = this.getPrice(parsed.choice);

    const paymentLinkDto = {
      userId: parsed.userId,
      editionId: edition00.id,
      choice: parsed.choice,
      amount: totalCents,
      addressId,
      redirectUrl,
    };

    const paymentLink =
      await this.integrations.payments.createPreorderPaymentLink(
        paymentLinkDto,
      );

    const preorder = await this.db.preorder.create({
      data: {
        userId: parsed.userId,
        choice: parsed.choice,
        editionId: edition00.id,
        totalCents,
        currency: "GBP",
        status: OrderStatus.PENDING,
        stripePaymentLinkId: paymentLink.stripePaymentLinkId,
      },
    });
    const sendEmailInput = {
      email: parsed.email,
      type: EmailType.REGISTER,
    };

    const user = await this.user.findUserById(userId);
    if (!user.name) throw new Error(`No name found on user uid=${user.id}`);

    this.integrations.email
      .sendEmail({
        email,
        content: {
          name: user?.name,
          email,
          editionCode: edition00.code,
        },
        type: EmailType.PREORDER_CONFIRMATION,
      })
      .then(() => {
        logger.debug(
          `Successfully sent email: ${sendEmailInput.email} type=${sendEmailInput.type}`,
        );
      })
      .catch((err) => {
        logger.error(err, "Failed to send user email");
      });

    return {
      preorderId: preorder.id,
      url: paymentLink.url,
      amount: totalCents,
      currency: "GBP",
    };
  }

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

    logger.info("[PreorderService:onCompletePreorder] Processing preorder ...");

    const result = await this.completePreorderTransaction(completedPreorderDto);

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
    logger.debug(
      dto,
      "[PreorderService:CompletePreorderTransaction] Completeing preorder transaction",
    );
    const {
      eventId,
      userId,
      editionId,
      paymentLinkId,
      amount,
      plan,
      addressId,
    } = dto;

    return this.db.$transaction(async (tx) => {
      let address: Address | null = null;
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
      const createPaymentPromise = tx.payment.create({
        data: {
          orderId: order.id,
          providerPaymentId: eventId,
          userId,
          provider: PaymentProvider.STRIPE,
          status: PaymentStatus.SUCCEEDED,
          amountCents: amount,
        },
      });

      const updatePreorderPromise = tx.preorder.update({
        where: {
          stripePaymentLinkId: paymentLinkId,
        },
        data: {
          status: OrderStatus.PAID,
        },
      });

      const mightUnlockEditionPromise =
        plan !== PlanType.PHYSICAL
          ? await tx.editionAccess.create({
              data: {
                editionId,
                userId,
                unlockedAt: new Date(),
              },
            })
          : Promise.resolve();

      await Promise.all([
        createPaymentPromise,
        updatePreorderPromise,
        mightUnlockEditionPromise,
      ]);

      if ([PlanType.FULL, PlanType.PHYSICAL].includes(plan as any)) {
        if (!addressId) {
          throw new Error("Address is not defined");
        }
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
