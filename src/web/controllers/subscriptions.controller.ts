import { Domain } from "@/domain/domain";
import { createSubscriptionInputSchema } from "@/domain/subscriptions/dto";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { invalidInputErrorResponse } from "./utils";

export class SubscriptionsController {
  constructor(private readonly domain: Domain) {}

  handleCreateSubscription = async (req: Request, res: Response) => {
    const { error, data: subscriptionsInput } =
      createSubscriptionInputSchema.safeParse({
        ...req.body,
        userId: this.domain.session.getUserIdOrThrow(req.session),
      });

    if (error) {
      invalidInputErrorResponse(res, error.issues, "/subscriptions/create");
      return;
    }

    const { checkoutUrl } =
      await this.domain.subscriptions.createSubscription(subscriptionsInput);
    res.status(StatusCodes.OK).json(checkoutUrl);
  };
}
