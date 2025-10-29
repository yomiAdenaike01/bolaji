import { Domain } from "@/domain/domain";
import { createUserSchema } from "@/domain/schemas/users";
import { createDeviceFingerprint, getRequestUserAgent } from "@/utils";
import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { createErrorResponse, invalidInputErrorResponse } from "./utils";
import { Hub } from "@/generated/prisma/enums";
import createHttpError from "http-errors";

export class UserController {
  constructor(private readonly domain: Domain) {}
  handleGetUserAddreses = async (req: Request, res: Response) => {
    const userId = this.domain.session.getUserIdOrThrow(req.session);
    const address = await this.domain.user.findUserAddreses(userId);
    res.status(200).json(address);
    return;
  };
  public getUserIdOrUnauthorised(req: Request) {
    try {
      const userId = this.domain.session.getUserId(req.session);
      if (!userId) throw new Error("User id not found on session");
    } catch (error) {
      throw createHttpError.Unauthorized(
        "Failed to fetch user ID from session",
      );
    }
  }

  handleGetEditionsAccess = async (req: Request, res: Response) => {
    const userId = this.domain.session.getUserIdOrThrow(req.session);
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

      this.domain.session.setLoginInfo(req.session, {
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
