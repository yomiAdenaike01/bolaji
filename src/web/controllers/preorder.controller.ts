import { Domain } from "@/domain/domain";
import {
  createPreorderSchema,
  createUserPreorderInputSchema,
} from "@/domain/schemas/preorder";
import { SessionError } from "@/domain/session/session";
import { PlanType, UserStatus } from "@/generated/prisma/enums";
import { logger } from "@/lib/logger";
import { createDeviceFingerprint, getRequestUserAgent } from "@/utils";
import { Request, Response } from "express";
import createHttpError from "http-errors";
import { StatusCodes } from "http-status-codes";
import { createErrorResponse, invalidInputErrorResponse } from "./utils";
import { getPreorderPasswordPage } from "../templates/getPreorderPasswordPage";
import { Config } from "@/config";
import jwt from "jsonwebtoken";
import { getErrorPage } from "../templates/getErrorPage";
import { Store } from "@/infra";

export class PreorderController {
  constructor(
    private readonly store: Store,
    private readonly config: Config,
    private readonly domain: Domain,
  ) {}

  handlePrivateAccessPassword = async (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      jwt.verify(token, this.config.jwtSecret);
      const redisKey = `access_attempts:${token}`;
      const attempts = +((await this.store.get(redisKey)) || 0);

      if (attempts >= 3) {
        return res
          .status(StatusCodes.FORBIDDEN)
          .send(
            getErrorPage(
              "Too many failed attempts. Please request a new link.",
            ),
          );
      }
      const isCorrectPassword =
        req.body.password === this.config.preorderPassword;

      if (!isCorrectPassword) {
        await this.store.set(redisKey, +attempts + 1, {
          expiration: { type: "KEEPTTL" },
        }); // expire in 5 min
        return res
          .status(StatusCodes.UNAUTHORIZED)
          .send(
            getPreorderPasswordPage(
              token,
              "Incorrect password. Please try again.",
            ),
          );
      }
      await this.store.multi().incr(redisKey).expire(redisKey, 300).exec();

      return res.redirect(`${this.config.frontEndUrl}/preorder`);
    } catch (error) {
      res.status(StatusCodes.UNAUTHORIZED).send();
    }
  };

  handleGetPrivateAccessPage = (req: Request, res: Response) => {
    try {
      const token = String(req.query.token);
      if (!token) throw new Error("No token found on request");
      jwt.verify(token, this.config.jwtSecret);

      const passwordPage = getPreorderPasswordPage(token);
      return res.send(passwordPage);
    } catch (error) {
      res.status(StatusCodes.UNAUTHORIZED);
    }
  };
  shouldAssertAddress = (session: any, choice: PlanType) => {
    const addressId = this.domain.session.getCurrentAddress(session);
    if (choice !== "DIGITAL" && !addressId)
      throw new Error("Address id is not defined");
    return addressId;
  };

  handleCreateUserAndPreorder = async (req: Request, res: Response) => {
    const combinedSchema = createUserPreorderInputSchema.safeParse(req.body);

    if (combinedSchema.error) {
      const { issues } = combinedSchema.error;
      return invalidInputErrorResponse(res, issues, req.url);
    }
    const { data: input } = combinedSchema;

    const canAcceptPreorder = await this.domain.preorders.canAcceptPreorder();
    if (!canAcceptPreorder)
      return createErrorResponse(res, {
        statusCode: StatusCodes.FORBIDDEN,
        error: "Cannot accept preorders",
        endpoint: req.url,
      });

    const user = await this.domain.user.registerUser({
      deviceFingerprint: createDeviceFingerprint(req),
      email: input.email,
      name: input.name,
      shippingAddress: input.shippingAddress,
      password: input.password,
      userAgent: getRequestUserAgent(req),
      status: UserStatus.PENDING_PREORDER,
    });

    const preoder = await this.domain.preorders.registerPreorder({
      choice: input.choice,
      userId: user.id,
      email: user.email,
      addressId: user.addressId,
      redirectUrl: input.redirectUrl,
    });

    this.domain.session.setLoginInfo(req.session, {
      userId: user.id,
      email: user.email,
      deviceId: user.deviceId,
      addressId: user.addressId,
    });

    res.status(200).json(preoder);
  };

  handleCreatePreorder = async (req: Request, res: Response) => {
    try {
      const { session: sessionDomain, preorders: preordersDomain } =
        this.domain;
      const sessionUserId = sessionDomain.getUserIdOrThrow(req.session);
      const sessionEmailAddress = sessionDomain.getEmailOrThrow(req.session);
      const createPreoderInput = createPreorderSchema.safeParse({
        userId: sessionUserId,
        email: sessionEmailAddress,
        ...req.body,
      });

      if (!createPreoderInput.success) {
        const { issues } = createPreoderInput.error;
        return invalidInputErrorResponse(res, issues, req.url);
      }

      const canAcceptPreorder = await preordersDomain.canAcceptPreorder();
      if (!canAcceptPreorder)
        return createErrorResponse(res, {
          statusCode: StatusCodes.FORBIDDEN,
          error: "Cannot accept preorders",
          endpoint: req.url,
        });

      const { userId, choice, redirectUrl } = createPreoderInput.data;

      const addressId = this.shouldAssertAddress(req.session, choice);

      const { preorderId, url } = await preordersDomain.registerPreorder({
        userId,
        choice,
        email: sessionDomain.getEmailOrThrow(req.session),
        addressId,
        redirectUrl,
      });
      res.status(StatusCodes.OK).json({ preorderId, url });
    } catch (error) {
      logger.error(error, "Failed to create preorder");
      if (error instanceof SessionError) {
        throw createHttpError(StatusCodes.UNAUTHORIZED, "User is unauthorised");
      }
      throw createHttpError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to create preorder",
      );
    }
  };
}
