import { Domain } from "@/domain/domain";
import {
  authenticateUserSchema,
  deviceIdentifierSchema,
} from "@/domain/schemas/users";
import { createErrorResponse, invalidInputErrorResponse } from "./utils";
import { Request, Response } from "express";
import { createDeviceFingerprint, getRequestUserAgent } from "@/utils";
import { StatusCodes } from "http-status-codes";
import { logger } from "@/lib/logger";

export class AuthController {
  constructor(private readonly domain: Domain) {}
  handleAuthenticateUser = async (req: Request, res: Response) => {
    try {
      const input = {
        principal: req.body.principal,
        password: req.body.password,
        deviceFingerprint: createDeviceFingerprint(req),
        userAgent: getRequestUserAgent(req),
      };

      const authenticateUserInput = authenticateUserSchema
        .safeExtend(deviceIdentifierSchema.shape)
        .safeParse(input);

      if (authenticateUserInput.error) {
        return invalidInputErrorResponse(
          res,
          authenticateUserInput.error.issues,
          "/auth/authenticate",
        );
      }
      const user = await this.domain.auth.authenticateUser(
        authenticateUserInput.data,
      );

      this.domain.session.setLoginInfo(req.session, {
        deviceId: user.deviceId,
        email: user.email,
        userId: user.id,
      });

      res.json(user);
    } catch (error) {
      logger.error(
        error,
        "[handleAuthenticateUser]: Failed to authenticate user",
      );
      return createErrorResponse(res, {
        endpoint: "/auth/authenticate",
        statusCode: StatusCodes.UNAUTHORIZED,
        error: "Unauthorised",
        details: "Failed to authenticate user",
      });
    }
  };
}
