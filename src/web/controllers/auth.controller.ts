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
import { Config } from "@/config";
import createHttpError from "http-errors";
import { access } from "fs";
import { Store } from "@/infra";

export class AuthController {
  constructor(
    private readonly config: Config,
    private readonly domain: Domain,
    private readonly store: Store,
  ) {}

  handleResetPassword = async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      await this.domain.auth.updatePasswordByEmail({ email, password });
      res.status(StatusCodes.OK).json({ success: true });
    } catch (error) {
      res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ error: "Failed to reset password" });
    }
  };

  handleRefreshAccessToken = async (req: Request, res: Response) => {
    const accessToken = String(
      req.headers.authorization?.split("Bearer ")?.[1].trim(),
    );
    const accessTokenData = await this.domain.session.parseOrThrow(
      accessToken,
      "access",
    );
    if (!accessTokenData) {
      throw createHttpError.Unauthorized("Failed to validate");
    }
  };
  handleDevAuth = async (req: Request, res: Response) => {
    try {
      const user = await this.domain.auth.loginAsDev();
      if (!user?.id) {
        throw createHttpError.Unauthorized("user not found");
      }
      const { jwtPair } = await this.initSession({
        id: user.id,
        email: user.email,
      });

      res.status(200).json({ user, jwtPair });
    } catch (error) {
      throw error;
    }
  };
  private initSession = async ({
    id,
    email,
    deviceId,
  }: {
    id: string;
    email: string;
    deviceId?: string;
  }) => {
    const sessionId = await this.domain.session.createSession(
      id,
      email,
      deviceId,
    );

    const jwtPair = this.domain.session.generateJwtPair({
      email: email,
      sessionId,
      userId: id,
    });

    return {
      sessionId,
      jwtPair,
    };
  };
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
      const { jwtPair } = await this.initSession({
        id: user.id,
        email: user.email,
        deviceId: user.deviceId,
      });

      res.status(200).json({ user, accessToken: jwtPair.accessToken });
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
