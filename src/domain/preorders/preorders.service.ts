import { PlanType, OrderStatus } from "@/generated/prisma/enums";
import { Db } from "@/infra";
import { Integrations } from "@/infra/integrations";
import { logger } from "@/lib/logger";
import z from "zod";
import { createPreorderSchema } from "../schemas/preorder";
import { EmailType } from "@/infra/integrations/email.integrations.templates";
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
  }: {
    addressId: string | null;
    userId: string;
    choice: PlanType;
    email: string;
  }) {
    const parsed = createPreorderSchema
      .omit({
        name: true,
      })
      .safeExtend(z.object({ addressId: z.string().min(1).nullable() }).shape)
      .parse({ userId, choice, email, addressId });

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
