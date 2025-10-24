import { createDeviceFingerprint } from "@/utils";
import { Domain } from "@/domain/domain";
import e, { Request, Response } from "express";
import { createUserSchema } from "@/domain/schemas/users";
import { logger } from "@/lib/logger";
import { invalidInputErrorResponse, createErrorResponse } from "./utils";
import { StatusCodes } from "http-status-codes";

export class UserController {
  constructor(private readonly domain: Domain) {}

  handleCreateUser = async (req: Request, res: Response) => {
    const createUserInput = createUserSchema.safeParse({
      ...req.body,
      userAgent: req.headers["user-agent"],
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
