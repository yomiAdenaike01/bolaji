import { Domain } from "@/domain/domain";
import { createSubscriptionInputSchema } from "@/domain/subscriptions/dto";
import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { invalidInputErrorResponse } from "./utils";
import { createDeviceFingerprint, getRequestUserAgent } from "@/utils";
import { getSubscriptionThankYouPage } from "../templates/getSubscriptionThankyouPage";
import { Config } from "@/config";
import { getSubscriptionCancelPage } from "../templates/getSubscriptionCancelledPage";
import { SubscriptionAlreadyActiveError } from '@/domain/subscriptions/subscriptions.service';
import { logger } from '@/lib/logger';

export class SubscriptionsController {
  constructor(
    private readonly domain: Domain,
    private readonly config: Config,
  ) {}
  /**
   * GET - /api/subscriptions/cancel
   */
  handleSubscriptionCancelPage = (req: Request, res: Response) => {
    const html = getSubscriptionCancelPage(
      `${this.config.frontEndUrl}/subscription/dashboard-subscription`,
    );
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  };
  /**
   * GET - /api/subscriptions/thank-you
   */
  handleThankYouPage = (req: Request, res: Response) => {
    const html = getSubscriptionThankYouPage(
      `${this.config.frontEndUrl}/auth/login`,
    );
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  };
  /**
   * GET - /api/subscriptions/can-subscribe
   */
  handleCanSubscribe = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const userId = await this.domain.session.getUserIdOrThrow(
        (req as any).sessionId,
      );
      const canSubscribe = await this.domain.preorders.canSubscribe(userId);
      res.status(StatusCodes.OK).json({ granted: canSubscribe });
    } catch (error) {
      next(error);
    }
  };
  /**
   * POST - /api/subscriptions/create
   */
  handleCreateSubscription = async (req: Request, res: Response) => {
    try {
    const { error, data: subscriptionsInput } =
      createSubscriptionInputSchema.safeParse({
        ...req.body,
        userId: req.body.userId || await this.domain.session.getUserId(
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
    } catch (error) {
      logger.error(error,'[SubscriptionController] Failed to start subscription')
      if (error instanceof SubscriptionAlreadyActiveError) {
       return res.status(StatusCodes.CONFLICT).json({error:"Subscription already active"})
      }
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({error:"Failed to start subscription"})
    }
  };
}
