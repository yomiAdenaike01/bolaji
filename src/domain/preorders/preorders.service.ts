import { PlanType, OrderStatus } from "@/generated/prisma/enums";
import { Db } from "@/infra";
import { Integrations } from "@/infra/integrations";
import { EmailType } from "@/infra/integrations/email.integration";
import { logger } from "@/lib/logger";
import z from "zod";
import { createPreorderSchema } from "../schemas/preorder";

export class PreordersService {
  constructor(
    private readonly db: Db,
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

  async registerPreorder({
    userId,
    choice,
    email,
  }: {
    userId: string;
    choice: PlanType;
    email: string;
  }) {
    const parsed = createPreorderSchema
      .omit({
        name: true,
      })
      .parse({ userId, choice, email });

    const edition00 = await this.db.edition.findFirst({ where: { number: 0 } });
    if (!edition00) throw new Error("Edition 00 not configured.");

    const totalCents = this.getPrice(parsed.choice);

    const paymentLinkDto = {
      userId: parsed.userId,
      editionId: edition00.id,
      choice: parsed.choice,
      amount: totalCents,
    };

    const paymentLink =
      await this.integrations.payments.createPreorderPaymentLink(
        paymentLinkDto,
      );

    const preorder = await this.db.preorder.upsert({
      where: { stripePaymentLinkId: paymentLink.stripePaymentLinkId },
      create: {
        userId: parsed.userId,
        choice: parsed.choice,
        editionId: edition00.id,
        totalCents,
        currency: "GBP",
        status: OrderStatus.PENDING,
        stripePaymentLinkId: paymentLink.stripePaymentLinkId,
      },
      update: {
        choice: parsed.choice,
        totalCents,
        status: OrderStatus.PENDING,
        updatedAt: new Date(),
      },
    });
    const sendEmailInput = {
      email: parsed.email,
      type: EmailType.REGISTER,
    };

    this.integrations.email
      .sendEmail(sendEmailInput)
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
