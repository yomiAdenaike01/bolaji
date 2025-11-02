import { Config } from "@/config";
import { Domain } from "@/domain/domain";
import {
  createPreorderSchema,
  createUserPreorderInputSchema,
  shoudlValidateShippingAddress,
} from "@/domain/schemas/preorder";
import { shippingAddressSchema } from "@/domain/schemas/users";
import { DecodedJwt } from "@/domain/session/session";
import { PlanType, UserStatus } from "@/generated/prisma/enums";
import { Store } from "@/infra";
import { logger } from "@/lib/logger";
import { createDeviceFingerprint, getRequestUserAgent } from "@/utils";
import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import { StatusCodes } from "http-status-codes";
import jwt from "jsonwebtoken";
import z from "zod";
import { getPreorderPasswordPage } from "../templates/getPreorderPasswordPage";
import { getThankYouPage } from "../templates/getPreorderThankyouPage";
import { createErrorResponse, invalidInputErrorResponse } from "./utils";
import { getNoAccessPage } from "../templates/getNoAccessPage";
export class PreorderController {
  constructor(
    private readonly store: Store,
    private readonly config: Config,
    private readonly domain: Domain,
  ) {}
  /**
   * GET /api/preorders/thank-you
   * Renders post-checkout thank you page
   */
  handlePreorderThankYou = async (req: Request, res: Response) => {
    const { preorder_id } = req.query;
    if (!preorder_id)
      return res.status(StatusCodes.BAD_REQUEST).send("Missing preorder_id");

    const preorder = await this.domain.preorders.findPreorderById(
      String(preorder_id),
    );

    if (!preorder || !preorder.user || !preorder.userId)
      return res.status(StatusCodes.NOT_FOUND).send("Preorder not found");

    // Generate new password

    const parsed = z
      .object({
        userName: z.string(),
        plan: z.enum(PlanType),
      })
      .parse({
        userName: preorder.user.name,
        plan: preorder.choice,
      });
    // Render thank-you HTML
    const html = getThankYouPage({
      name: parsed.userName,
      plan: parsed.plan,
      redirectUrl: `${this.config.frontEndUrl}/subscription/dashboard-subscription`,
    });

    res.setHeader("Content-Type", "text/html");
    return res.status(StatusCodes.OK).send(html);
  };

  /**
   * GET /api/preorders/private-access
   * Renders the password entry page
   */
  renderPrivateAccessPage = async (req: Request, res: Response) => {
    const { token } = req.query;

    if (!token) {
      const html = getNoAccessPage();
      res.setHeader("Content-Type", "text/html");
      res.send(html);
      return;
    }

    try {
      // Verify token is at least structurally valid (optional deep verify later)
      jwt.verify(token as string, this.config.jwtSecret);
      const html = getPreorderPasswordPage(token as string);
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } catch (error) {
      logger.error(error, "Invalid preorder token");
      res.status(StatusCodes.UNAUTHORIZED).send("Invalid or expired link");
    }
  };

  /**
   * POST /api/preorders/private-access
   * Validates password + token, issues session, redirects to Framer site
   */
  handlePrivateAccessPassword = async (req: Request, res: Response) => {
    const { password, token } = req.body;

    if (!token || !password) {
      const html = getPreorderPasswordPage("", "Missing password or token.");
      res.setHeader("Content-Type", "text/html");
      return res.status(StatusCodes.BAD_REQUEST).send(html);
    }

    try {
      // 1. Decode and verify preorder token
      const decoded = jwt.verify(token, this.config.jwtSecret) as {
        email: string;
        name: string;
        userId: string;
        version: number;
        sessionKey: string;
        type: string;
      };
      if (decoded?.type !== "PREORDER") throw createHttpError.Unauthorized();

      const user = await this.domain.auth.authenticateUser({
        principal: decoded.email,
        password: password,
        userAgent: getRequestUserAgent(req),
        deviceFingerprint: createDeviceFingerprint(req),
      });
      // 2. Find the user

      if (!user) {
        const html = getPreorderPasswordPage(token, "Invalid preorder user.");
        res.setHeader("Content-Type", "text/html");
        return res.status(StatusCodes.UNAUTHORIZED).send(html);
      }
      const { accessToken } = await this.domain.session.initSession({
        userId: user.id,
        email: user.email,
        deviceId: user.deviceId,
      });
      // TODO: AFTER EVERY 10 PEOPLE HAVE COMPLETED SEND AN EMAIL TO THE TEAM TO SEE WHO HAS GOTTEN ACCESS
      // 6. Redirect to Framer preorder site
      const redirectUrl = new URL(this.config.privateAccessPageUrl);
      redirectUrl.searchParams.set("token", accessToken);

      return res.redirect(redirectUrl.toString());
    } catch (error: any) {
      logger.error(error, "Preorder password validation failed");
      const html = getPreorderPasswordPage(token, "Invalid or expired link.");
      res.setHeader("Content-Type", "text/html");
      return res.status(StatusCodes.UNAUTHORIZED).send(html);
    }
  };
  /**
   * POST /api/preorders/auth-exchange
   * Exhanges preorder token for session token
   */
  handlePreorderAuthExchange = async (req: Request, res: Response) => {
    try {
      const token = String(req.body.token);

      if (!token) throw new Error("No token found on request");

      const decoded = jwt.verify(token, this.config.jwtSecret) as DecodedJwt;

      await this.domain.session.deleteSession(decoded.sessionId);

      const { accessToken } = await this.domain.session.initSession({
        userId: decoded.sub,
        email: decoded.email,
      });
      res.status(StatusCodes.OK).json({ token: accessToken });
    } catch (error) {
      logger.error(error, "[PreorderController] Failed auth exchange");
      res.status(StatusCodes.UNAUTHORIZED);
    }
  };
  /**
   * POST /api/preorders/create-user-preorder
   * Create user and preorder
   */
  handleCreateUserAndPreorder = async (req: Request, res: Response) => {
    const combinedSchema = createUserPreorderInputSchema.safeParse(req.body);
    const sessionId = (req as any).sessionId;

    if (combinedSchema.error) {
      const { issues } = combinedSchema.error;
      return invalidInputErrorResponse(res, issues, req.url);
    }
    const { data: input } = combinedSchema;

    const canAcceptPreorder = await this.domain.preorders.canAcceptPreorder(
      input.choice,
    );
    if (!canAcceptPreorder)
      return createErrorResponse(res, {
        statusCode: StatusCodes.FORBIDDEN,
        error: "Cannot accept preorders",
        endpoint: req.url,
      });

    const password = this.config.preorderPassword;

    const user = await this.domain.user.registerUser({
      deviceFingerprint: createDeviceFingerprint(req),
      email: input.email,
      name: input.name,
      shippingAddress: input.shippingAddress,
      password: password,
      userAgent: getRequestUserAgent(req),
      status: UserStatus.PENDING_PREORDER,
    });

    const preoder = await this.domain.preorders.registerPreorder({
      choice: input.choice,
      userId: user.id,
      email: user.email,
      addressId: user.addressId,
    });

    await this.domain.session.setLoginInfo(sessionId, {
      userId: user.id,
      email: user.email,
      deviceId: user.deviceId,
      addressId: user.addressId,
    });

    res.status(StatusCodes.OK).json(preoder);
  };

  // TODO: Add quantities for phyiscal copies
  /**
   * POST /api/preorders
   * Create preorder for authenticated user
   */
  handleCreatePreorder = async (req: Request, res: Response) => {
    try {
      const token = req.headers.authorization?.split("Bearer ")[1];
      if (!token) return this.handleCreateUserAndPreorder(req, res);

      const { accessToken } =
        await this.domain.session.checkAndRefreshAccessToken(token);

      const { sessionId } = this.domain.session.parseOrThrow(accessToken);

      const { session: sessionDomain, preorders: preordersDomain } =
        this.domain;

      const [sessionUserId, sessionEmailAddress] = await Promise.all([
        sessionDomain.getUserIdOrThrow(sessionId),
        sessionDomain.getEmailOrThrow(sessionId),
      ]);

      const createPreoderInput = createPreorderSchema
        .extend({
          shippingAddress: shippingAddressSchema.optional(),
        })
        .superRefine(shoudlValidateShippingAddress)
        .safeParse({
          userId: sessionUserId,
          email: sessionEmailAddress,
          ...req.body,
        });

      if (!createPreoderInput.success) {
        const { issues } = createPreoderInput.error;
        return invalidInputErrorResponse(res, issues, req.url);
      }

      const canAcceptPreorder = await preordersDomain.canAcceptPreorder(
        createPreoderInput.data.choice,
      );
      if (!canAcceptPreorder)
        return createErrorResponse(res, {
          statusCode: StatusCodes.FORBIDDEN,
          error: "Cannot accept preorders",
          endpoint: req.url,
        });

      const { userId, choice, shippingAddress, quantity } =
        createPreoderInput.data;

      let addressId: string | null = null;

      if (shippingAddress) {
        const address = await this.domain.user.createAddress({
          userId: userId,
          ...shippingAddress,
        });
        addressId = address.id;
      }

      this.shouldAssertAddress(choice, addressId);
      const email = await sessionDomain.getEmailOrThrow(sessionId);

      const { preorderId, url } = await preordersDomain.registerPreorder({
        userId,
        choice,
        email,
        addressId,
        quantity,
      });
      const sessionPreorderKey = (req.session as any).preorderKey;
      if (sessionPreorderKey) {
        await this.store.del(sessionPreorderKey);
      }
      res.status(StatusCodes.OK).json({ preorderId, url });
    } catch (error) {
      logger.error(error, "Failed to create preorder");
      throw error;
    }
  };
  handlePreorderIntroScreen = async (req: Request, res: Response) => {
    try {
      const userId = await this.domain.session.getUserIdOrThrow(
        (req as any).sessionId,
      );
      const canAccess =
        await this.domain.preorders.canAccessPreorderEdition(userId);
      if (!canAccess)
        throw createHttpError.Unauthorized(
          "Failed to find access to preorder edition",
        );
      res.status(StatusCodes.OK).json({ granted: canAccess });
    } catch (error) {
      return createHttpError.Unauthorized("User is not authenticated");
    }
  };
  handleCanAccessPreorder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const userId = await this.domain.session.getUserIdOrThrow(
        (req as any).sessionId,
      );
      const accessRegister =
        await this.domain.editions.getUserEditionAccess(userId);
      const canAccess = accessRegister.some((r) => r.edition.code === "ED00");
      res.status(200).json({ granted: canAccess });
    } catch (error) {
      next(error);
    }
  };
  private shouldAssertAddress = (
    choice: PlanType,
    addressId?: string | null,
  ) => {
    if (choice !== PlanType.DIGITAL && !addressId) {
      throw new Error(
        `Address is required for plan=${choice} but is undefined`,
      );
    }
  };
}
