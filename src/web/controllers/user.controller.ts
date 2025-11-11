import { Domain } from "@/domain/domain.js";
import { createUserSchema } from "@/domain/schemas/users.js";
import { createDeviceFingerprint, getRequestUserAgent } from "@/utils.js";
import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { createErrorResponse, invalidInputErrorResponse } from "./utils.js";
import { Hub } from "@/generated/prisma/index.js";
import createHttpError from "http-errors";
import { randomUUID } from "crypto";

export class UserController {
  constructor(private readonly domain: Domain) {}
  handleGetUserAddreses = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const userId = await this.domain.session.getUserIdOrThrow(
        (req as any).sessionId,
      );
      const address = await this.domain.user.findUserAddreses(userId);
      res.status(200).json(address);
      return;
    } catch (error) {
      next(error);
    }
  };
  public getUserIdOrUnauthorised = async (req: Request) => {
    const userId = await this.domain.session.getUserIdOrThrow(
      (req as any).sessionId,
    );
  };

  handleGetEditionsAccess = async (req: Request, res: Response) => {
    const userId = await this.domain.session.getUserIdOrThrow(
      (req as any).sessionId,
    );
    const currentHubHeader = String(req.headers["x-hub-id"]);
    if (!currentHubHeader) {
      throw createHttpError.Forbidden("Hub not found");
    }
    const currentHub = Object.fromEntries(Object.entries(Hub))[
      currentHubHeader
    ];
    if (!currentHub) {
      throw createHttpError.Forbidden("Hub not found");
    }
    const { withAccess, withoutAccess } =
      await this.domain.user.getUserEditionsAccess(userId, currentHub);

    return res.status(200).json({
      unlocked: withAccess,
      locked: withoutAccess,
    });
  };

  handleCreateUser = async (req: Request, res: Response) => {
    const createUserInput = createUserSchema.safeParse({
      ...req.body,
      userAgent: getRequestUserAgent(req),
      deviceFingerprint: createDeviceFingerprint(req),
    });

    if (createUserInput.error) {
      return invalidInputErrorResponse(
        res,
        createUserInput.error.issues,
        req.url,
      );
    }

    try {
      const createdUser = await this.domain.user.registerUser(
        createUserInput.data,
      );
      const sessionId = randomUUID();
      await this.domain.session.setLoginInfo(sessionId, {
        email: createdUser.email,
        userId: createdUser.id,
        deviceId: createdUser.deviceId,
      });
      res.json(createdUser);
      return;
    } catch (error) {
      return createErrorResponse(res, {
        endpoint: req.url,
        statusCode: StatusCodes.BAD_REQUEST,
        error: "Failed to create user",
        details: (error as Error).message,
      });
    }
  };
}
