import { Domain } from "@/domain/domain";
import { createSubscriptionInputSchema } from "@/domain/subscriptions/dto";
import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { invalidInputErrorResponse } from "./utils";
import { createDeviceFingerprint, getRequestUserAgent } from "@/utils";
import { getSubscriptionThankYouPage } from "../templates/getSubscriptionThankyouPage";
import { Config } from "@/config";
import { getSubscriptionCancelPage } from "../templates/getSubscriptionCancelledPage";
import { SubscriptionAlreadyActiveError } from "@/domain/subscriptions/subscriptions.service";
import { logger } from "@/lib/logger";
import { isBefore } from "date-fns";
import { EDITION_01_RELEASE } from "@/constants";
import z from "zod";

export class SubscriptionsController {
  constructor(
    private readonly domain: Domain,
    private readonly config: Config,
  ) {}
  handleResumeSubscription = async (req, res) => {
    const { user_id, redirect_url } = z
      .object({
        user_id: z.string().min(1),
        redirect_url: z.url(),
      })
      .parse(req.query);

    const response =
      await this.domain.subscriptions.resumeSubscription(user_id);
    res.redirect(`/resume-confirm?redirect_url=${redirect_url}`);
  };
  /**
   * POST /api/subscription
   * @param req
   * @param res
   */
  handleCancelSubscription = async (req: Request, res: Response) => {
    try {
      const userId = await this.domain.session.getUserIdOrThrow(
        (req as any).sessionId,
      );
      await this.domain.subscriptions.cancelSubscription(userId);
      res.json({ success: true });
    } catch (error) {
      logger.error(
        error,
        `[SubscriptionsController]: Failed to cancel subscription err=${(error as any).message} sessionId=${(req as any).sessionId}`,
      );
      res.json({ success: false });
    }
  };
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
      this.config.frontEndUrl,
      isBefore(Date.now(), EDITION_01_RELEASE),
    );
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  };
  /**
   * @deprecated Users can now only go to subscriptions if they have a token
   * TODO: On the 9th this page is free to use
   * GET - /api/subscriptions/can-subscribe
   */
  handleCanSubscribe = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { userId } = this.domain.session.getUserFromRequestOrThrow(req);
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
      const userId =
        this.domain.session.getUserFromRequest(req)?.userId || req.body.userId;
      logger.info(
        {
          path: req.originalUrl,
          method: req.method,
          userId,
          requestBody: req.body,
        },
        "[SubscriptionController] Incoming create subscription request",
      );

      const { error, data: subscriptionsInput } =
        createSubscriptionInputSchema.safeParse({
          ...req.body,
          userId,
        });

      if (error) {
        logger.warn(
          { userId, issues: error.issues },
          "[SubscriptionController] Subscription input validation failed",
        );
        invalidInputErrorResponse(res, error.issues, "/subscriptions/create");
        return;
      }

      const { checkoutUrl } =
        await this.domain.subscriptions.createSubscription({
          ...subscriptionsInput,
          deviceFingerprint: createDeviceFingerprint(req),
          userAgent: getRequestUserAgent(req),
        });

      res.status(StatusCodes.OK).json({ url: checkoutUrl });
    } catch (error) {
      logger.error(
        {
          err: error,
          path: req.originalUrl,
          method: req.method,
          userId:
            this.domain.session.getUserFromRequest(req)?.userId ||
            req.body.userId,
        },
        "[SubscriptionController] Failed to start subscription",
      );
      if (error instanceof SubscriptionAlreadyActiveError) {
        return res
          .status(StatusCodes.CONFLICT)
          .json({ error: "Subscription already active" });
      }
      res
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .json({ error: "Failed to start subscription" });
    }
  };
}
