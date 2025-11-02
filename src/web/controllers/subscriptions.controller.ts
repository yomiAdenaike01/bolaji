import { Domain } from "@/domain/domain";
import { createSubscriptionInputSchema } from "@/domain/subscriptions/dto";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { invalidInputErrorResponse } from "./utils";
import { createDeviceFingerprint, getRequestUserAgent } from "@/utils";

export class SubscriptionsController {
  constructor(private readonly domain: Domain) {}

  handleCreateSubscription = async (req: Request, res: Response) => {
    const { error, data: subscriptionsInput } =
      createSubscriptionInputSchema.safeParse({
        ...req.body,
        userId: await this.domain.session.getUserIdOrThrow(
          (req as any).sessionId,
        ),
      });

    if (error) {
      invalidInputErrorResponse(res, error.issues, "/subscriptions/create");
      return;
    }

    const { checkoutUrl } = await this.domain.subscriptions.createSubscription({
      ...subscriptionsInput,
      deviceFingerprint: createDeviceFingerprint(req),
      userAgent: getRequestUserAgent(req),
    });

    res.status(StatusCodes.OK).json({ url: checkoutUrl });
  };
}
