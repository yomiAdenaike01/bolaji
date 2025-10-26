import { Domain } from "@/domain/domain";
import { createUserSchema } from "@/domain/schemas/users";
import { createDeviceFingerprint, getRequestUserAgent } from "@/utils";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { createErrorResponse, invalidInputErrorResponse } from "./utils";

export class UserController {
  constructor(private readonly domain: Domain) {}

  handleGetEditionsAccess = async (req: Request, res: Response) => {
    const userId = this.domain.session.getUserIdOrThrow(req.session);
    const { withAccess, withoutAccess } =
      await this.domain.user.getUserEditionsAccess(userId);

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
