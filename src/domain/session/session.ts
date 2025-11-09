import { Config } from "@/config";
import { logger } from "@/lib/logger";
import { randomUUID } from "crypto";
import createHttpError from "http-errors";
import jwt from "jsonwebtoken";
import { Db } from "@/infra";
import { Store } from "@/infra";
import { Request } from "express";

export type DecodedJwt = {
  sub: string;
  email: string;
  sessionId: string;
  jti: string;
  type: "access" | "refresh";
  version: number;
  iat: number;
  exp: number;
  aud: string;
};

export interface JwtPayload {
  userId: string;
  email: string;
  sessionId: string;
  context?: string;
}

interface JwtPair {
  accessToken: string;
  refreshToken: string;
}

export class SessionService {
  constructor(
    private readonly config: Config,
    private readonly db: Db,
    private readonly store: Store,
  ) {}
  getUserId = async (sessionId: string) => {
    try {
      const uid = await this.getUserIdOrThrow(sessionId);
      return uid;
    } catch (error) {
      return null;
    }
  };
  setUserId = (sessionId: any, userId: string): any => {
    return this.updateSessionProperty(sessionId, { userId });
  };
  setEmail(sessionId: any, email: string) {
    return this.updateSessionProperty(sessionId, { email });
  }
  setLoginInfo = async (
    sessionId: string | undefined = randomUUID(),
    sess: {
      userId: string;
      email: string;
      deviceId: string;
      addressId?: string | null;
    },
  ) => {
    await this.store.hSet(sessionId, sess as Record<string, string>);
  };
  getUserFromRequest = (req: Request) => {
    const userId = (req as any).userId || null;
    const email = (req as any).email || null;
    const sessionId = (req as any).sessionId || null;

    if (!userId) {
      return null;
    }

    return { userId, email, sessionId };
  };
  getUserFromRequestOrThrow = (req: Request) => {
    const user = this.getUserFromRequest(req);
    if (!user) throw createHttpError.Unauthorized("User not authenticated");
    return user;
  };
  getEmailOrThrow = async (sessionId: string): Promise<string> => {
    const email = await this.getSessionPropertyOrThrow(sessionId, "email");
    if (!email) throw createHttpError.Unauthorized();
    return email;
  };
  getUserIdOrThrow = async (sessionId: string) => {
    const userId = await this.getSessionPropertyOrThrow(sessionId, "userId");
    if (!userId) throw createHttpError.Unauthorized();
    return userId;
  };
  getCurrentAddress = async (sessionId: string) => {
    const addressId = await this.getSessionProperty(sessionId, "addressId");
    if (!addressId) return null;
    return addressId;
  };

  // ─────────────────────────────────────────────
  // 🔐 JWT CREATION
  // ─────────────────────────────────────────────
  generateJwtPair = (payload: JwtPayload): JwtPair => {
    const { userId, email, sessionId, context } = payload;
    if (!userId || !email || !sessionId)
      throw new Error("Missing required JWT fields");

    const jti = randomUUID();

    const accessToken = jwt.sign(
      {
        sub: userId,
        email,
        sessionId,
        jti,
        type: "access",
        version: 1,
        context,
      },
      this.config.jwtSecret,
      {
        expiresIn: "45m",
        audience: "bolajieditions-frontend",
      },
    );

    const refreshToken = jwt.sign(
      {
        sub: userId,
        email,
        sessionId,
        jti,
        type: "refresh",
        version: 1,
      },
      this.config.jwtRefreshSecret,
      {
        expiresIn: this.config.refreshTokenTtl as any, // e.g. "7d"
        issuer: "bolajieditions-api",
        audience: "bolajieditions-frontend",
      },
    );

    const key = `auth:refresh:${userId}:${sessionId}`;
    const ttlSeconds = 7 * 24 * 60 * 60;
    this.store.setEx(key, ttlSeconds, refreshToken).catch((err) => {
      logger.error(err, "[Session] Failed to save refresh token");
    });

    logger.info(`[Session] Issued JWT pair for userId - ${userId}`);
    return { accessToken, refreshToken };
  };

  // ─────────────────────────────────────────────
  // 🔎 JWT VERIFICATION
  // ─────────────────────────────────────────────
  parseOrThrow = (token: string, type: "access" | "refresh" = "access") => {
    try {
      const secret =
        type === "refresh"
          ? this.config.jwtRefreshSecret
          : this.config.jwtSecret;

      const decoded = jwt.verify(token, secret, {
        ignoreExpiration: this.config.ignoreJwtExpiry,
      }) as any;

      if (decoded.type !== type)
        throw createHttpError.Unauthorized("Invalid token type");

      if (!decoded.sub || !decoded.email || !decoded.sessionId)
        throw createHttpError.Unauthorized("Token missing claims");

      return decoded as {
        sub: string;
        email: string;
        sessionId: string;
        jti: number;
        type: string;
        version: number;
        context: string;
      };
    } catch (err: any) {
      logger.error(`[JWT] ${type} token error: ${err.message}`);
      throw createHttpError.Unauthorized("Invalid or expired token");
    }
  };

  // ─────────────────────────────────────────────
  // 🔁 REFRESH ACCESS TOKEN
  // ─────────────────────────────────────────────
  refreshAccessToken = async (accessToken: string) => {
    const decoded = jwt.decode(accessToken) as {
      sub: string;
      sessionId: string;
    };
    if (!decoded?.sub || !decoded?.sessionId)
      throw createHttpError.Unauthorized("Invalid access token");

    const redisKey = `auth:refresh:${decoded.sub}:${decoded.sessionId}`;
    const storedRefresh = await this.store.get(redisKey);
    if (!storedRefresh)
      throw createHttpError.Unauthorized("No refresh token available");

    const verified = this.parseOrThrow(storedRefresh, "refresh");

    const { accessToken: newAccess, refreshToken: newRefresh } =
      this.generateJwtPair({
        userId: verified.sub,
        email: verified.email,
        sessionId: verified.sessionId,
      });

    // Rotate refresh token
    await this.store.set(redisKey, newRefresh, { EX: 7 * 24 * 60 * 60 });

    return { accessToken: newAccess };
  };

  // ─────────────────────────────────────────────
  // 🧱 REDIS SESSION HANDLING
  // ─────────────────────────────────────────────
  async createSession(
    userId: string,
    email: string,
    deviceId?: string,
    context = "portal",
  ) {
    if (!userId || !email) throw new Error("User id or email is undefined");

    const userSessionKey = `user:session:${userId}`;
    const existingSessionId = await this.store.get(userSessionKey);

    // ✅ If user already has a linked session, reuse it instead of creating new
    if (existingSessionId) {
      const redisKey = `session:${existingSessionId}`;
      const exists = await this.store.exists(redisKey);

      if (exists) {
        logger.info(
          `[Session] Reusing existing session ${existingSessionId} for userId=${userId}`,
        );
        // optional: extend TTL on reuse
        await this.store.expire(redisKey, 7 * 24 * 60 * 60);
        return existingSessionId;
      } else {
        // pointer exists but hash missing -> cleanup pointer
        await this.store.del(userSessionKey);
      }
    }

    // 🆕 Otherwise, create new session and pointer
    const sessionId = randomUUID();
    const redisKey = `session:${sessionId}`;
    const data = {
      userId,
      email,
      context,
      ...(deviceId ? { deviceId } : {}),
      createdAt: new Date().toISOString(),
      lastAction: new Date().toISOString(),
    };

    await this.store.hSet(redisKey, data as Record<string, string>);
    await this.store.expire(redisKey, 7 * 24 * 60 * 60);
    await this.store.set(userSessionKey, sessionId);

    logger.info(`[Session] Created new session ${sessionId} for ${email}`);
    return sessionId;
  }

  async deleteSession(sessionId: string, userId?: string) {
    await this.store.del(`session:${sessionId}`);
    if (userId) await this.store.del(`auth:refresh:${userId}:${sessionId}`);
    logger.info(`[Session] Deleted session ${sessionId}`);
  }

  // ─────────────────────────────────────────────
  // 🎯 FIELD-LEVEL SESSION UPDATES
  // ─────────────────────────────────────────────
  async updateSessionProperty(
    sessionId: string,
    updates: Record<string, string | number | null>,
    extendTtl = true,
  ) {
    const redisKey = `session:${sessionId}`;
    const exists = await this.store.exists(redisKey);
    if (!exists) throw createHttpError.NotFound("Session not found");

    await this.store.hSet(redisKey, updates as Record<string, string>);

    if (extendTtl) await this.store.expire(redisKey, 7 * 24 * 60 * 60); // extend TTL if active

    logger.debug(
      `[Session] Updated ${sessionId} → ${Object.keys(updates).join(", ")}`,
    );
  }

  async getSessionProperty(sessionId: string, key: string) {
    const redisKey = `session:${sessionId}`;
    const value = await this.store.hGet(redisKey, key);

    return value;
  }

  async getSessionPropertyOrThrow(sessionId: string, key: string) {
    const value = await this.getSessionProperty(sessionId, key);
    if (value === null)
      throw createHttpError.NotFound(`Property ${key} not found`);
    return value;
  }

  initSession = async ({
    userId,
    email,
    deviceId,
    context = "portal",
  }: {
    userId: string;
    email: string;
    deviceId?: string;
    context?: string;
  }) => {
    const sessionId = await this.createSession(
      userId,
      email,
      deviceId,
      context,
    );
    const { accessToken, refreshToken } = this.generateJwtPair({
      email: email,
      userId: userId,
      sessionId,
      context,
    });
    return {
      refreshToken,
      accessToken,
      sessionId,
    };
  };

  // ─────────────────────────────────────────────
  // 🕒 AUTO REFRESH CHECK
  // ─────────────────────────────────────────────
  async checkAndRefreshAccessToken(accessToken: string, thresholdSeconds = 30) {
    const decoded = jwt.decode(accessToken) as any;
    if (!decoded?.exp) throw createHttpError.BadRequest("Invalid access token");

    const now = Math.floor(Date.now() / 1000);
    const remaining = decoded.exp - now;
    if (remaining > thresholdSeconds) return { refreshed: false, accessToken };

    const refreshed = await this.refreshAccessToken(accessToken);
    return { refreshed: true, accessToken: refreshed.accessToken };
  }
}
