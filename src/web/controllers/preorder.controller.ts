import { Domain } from "@/domain/domain";
import { createPreorderSchema } from "@/domain/schemas/preorder";
import { Request, Response } from "express";
import { createErrorResponse, invalidInputErrorResponse } from "./utils";
import { createUserSchema } from "@/domain/schemas/users";
import { StatusCodes } from "http-status-codes";
import { SessionError } from "@/domain/session/session";
import createHttpError from "http-errors";
import { RESP_TYPES } from "redis";
import { PlanType } from "@/generated/prisma/enums";
import { logger } from "@/lib/logger";

export class PreorderController {
  constructor(private readonly domain: Domain) {}

  shouldAssertAddress = (session: any, choice: PlanType) => {
    const addressId = this.domain.session.getCurrentAddress(session);
    if (choice !== "DIGITAL" && !addressId)
      throw new Error("Address id is not defined");
    return addressId;
  };

  handleCreateUserAndPreorder = async (req: Request, res: Response) => {
    const combinedSchema = createUserSchema
      .extend(
        createPreorderSchema.pick({
          choice: true,
        }).shape,
      )
      .strict()
      .safeParse(req.body);

    if (combinedSchema.error) {
      const { issues } = combinedSchema.error;
      return invalidInputErrorResponse(res, issues, req.url);
    }
    const { data: input } = combinedSchema;

    const user = await this.domain.user.registerUser({
      deviceFingerprint: input.deviceFingerprint,
      email: input.email,
      name: input.name,
      shippingAddress: input.shippingAddress,
      password: input.password,
      userAgent: input.userAgent,
    });

    const canAcceptPreorder = await this.domain.preorders.canAcceptPreorder();

    if (!canAcceptPreorder)
      return createErrorResponse(res, {
        statusCode: StatusCodes.FORBIDDEN,
        error: "Cannot accept preorders",
        endpoint: req.url,
      });

    const preoder = await this.domain.preorders.registerPreorder({
      choice: input.choice,
      userId: user.id,
      email: user.email,
      addressId: user.addressId,
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

      const { userId, choice } = createPreoderInput.data;

      const addressId = this.shouldAssertAddress(req.session, choice);

      const { preorderId, url } = await preordersDomain.registerPreorder({
        userId,
        choice,
        email: sessionDomain.getEmailOrThrow(req.session),
        addressId,
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
