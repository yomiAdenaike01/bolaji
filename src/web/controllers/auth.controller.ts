import { Config } from "@/config/index.js";
import { Domain } from "@/domain/domain.js";
import {
  authenticateUserSchema,
  deviceIdentifierSchema,
} from "@/domain/schemas/users.js";
import { Store } from "@/infra/index.js";
import { logger } from "@/lib/logger.js";
import { createDeviceFingerprint, getRequestUserAgent } from "@/utils.js";
import { Request, Response } from "express";
import createHttpError from "http-errors";
import { StatusCodes } from "http-status-codes";
import { createErrorResponse, invalidInputErrorResponse } from "./utils.js";
import { PlanType } from "@/generated/prisma/index.js";

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

  private initSession = async ({
    id,
    email,
    deviceId,
    context = "portal",
  }: {
    id: string;
    email: string;
    deviceId?: string;
    context?: string;
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
      context,
    });

    return {
      sessionId,
      jwtPair,
    };
  };

  handlePortalLogin = async (req: Request, res: Response) => {
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

      // 1️⃣ Authenticate user
      const user = await this.domain.auth.authenticateUser(
        authenticateUserInput.data,
      );

      // 2️⃣ Create session + JWT
      const { jwtPair } = await this.initSession({
        id: user.id,
        email: user.email,
        deviceId: user.deviceId,
        context: "portal",
      });

      // 3️⃣ Get ACTIVE edition access (what they can see *now*)
      const activeAccess = await this.domain.editions.getUserEditionAccess(
        user.id,
        [PlanType.DIGITAL, PlanType.FULL],
      );

      // If they have Edition 00 unlocked → redirect to Edition 00
      const hasEdition00 = activeAccess.some((a) => a.edition?.number === 0);
      if (hasEdition00) {
        return res.status(StatusCodes.OK).json({
          user,
          accessToken: jwtPair.accessToken,
          edition: { number: 0 },
          showComingSoonModal: false,
        });
      }

      // If they have any other ACTIVE edition → redirect to latest one
      if (activeAccess.length > 0) {
        const latest = [...activeAccess].sort(
          (a, b) => (b.edition?.number ?? 0) - (a.edition?.number ?? 0),
        )[0];

        return res.status(StatusCodes.OK).json({
          user,
          accessToken: jwtPair.accessToken,
          edition: latest.edition
            ? {
                number: latest.edition.number,
                title: latest.edition.title,
                releaseDate: latest.edition.releaseDate,
              }
            : null,
          showComingSoonModal: false,
        });
      }

      // 4️⃣ No ACTIVE access → maybe they’re a subscriber whose edition is still SCHEDULED
      const scheduledAccess =
        await this.domain.editions.getUserScheduledEditionAccess(user.id, [
          PlanType.DIGITAL,
          PlanType.FULL,
        ]);

      if (scheduledAccess.length > 0) {
        const next = scheduledAccess[0]; // earliest upcoming edition (e.g. Edition 01)

        return res.status(StatusCodes.OK).json({
          user,
          accessToken: jwtPair.accessToken,
          edition: null,
          showComingSoonModal: true,
          nextEdition: next.edition
            ? {
                number: next.edition.number,
                title: next.edition.title,
                releaseDate: next.edition.releaseDate,
              }
            : null,
        });
      }

      if (activeAccess.length === 0) {
        return createErrorResponse(res, {
          endpoint: "/auth/login",
          statusCode: StatusCodes.FORBIDDEN,
          error: "Access Denied",
          details:
            "This account does not have digital access. Physical-edition accounts cannot log in to the digital portal.",
        });
      }

      // 5️⃣ No ACTIVE and no SCHEDULED → they have no subscription / no access
      return res.status(StatusCodes.OK).json({
        user,
        accessToken: jwtPair.accessToken,
        edition: null,
        showComingSoonModal: false,
      });
    } catch (error) {
      logger.error(error, "[handlePortalLogin]: Failed to authenticate user");
      return createErrorResponse(res, {
        endpoint: "/auth/authenticate",
        statusCode: StatusCodes.UNAUTHORIZED,
        error: "Unauthorised",
        details: "Failed to authenticate user",
      });
    }
  };

  handleAuthenticateUser = async (req: Request, res: Response) => {
    try {
      const { context, ...input } = {
        principal: req.body.principal,
        password: req.body.password,

        context: req.body.context || "portal",
      };

      const authenticateUserInput = authenticateUserSchema
        .safeExtend(deviceIdentifierSchema.shape)
        .safeParse({
          principal: req.body.principal,
          password: req.body.password,
          deviceFingerprint: createDeviceFingerprint(req),
          userAgent: getRequestUserAgent(req),
        });

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
        context: context,
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
