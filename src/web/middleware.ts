import express, { Request, Response, NextFunction, Application } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import { logger } from "@/lib/logger";
import { Store } from "@/infra";
import { Config } from "@/config";
import createHttpError, { HttpError } from "http-errors";
import jwt from "jsonwebtoken";
import compression from "compression";
import { SessionService } from "@/domain/session/session";
import z, { ZodError, ZodType } from "zod";

function shouldCompress(req: any, res: any) {
  if (req.headers["x-no-compression"]) {
    // don't compress responses with this request header
    return false;
  }
  return compression.filter(req, res);
}

const logRequest = (req: Request, res: Response, next: NextFunction) => {
  logger.info(
    `${req.method} url: ${req.url} ${req.body ? `body ${JSON.stringify(req.body)}` : ""} `,
  );
  next();
};

export const setupMiddlewares = (
  app: Application,
  store: Store,
  config: Config,
) => {
  // 🟢 Allow Express to trust ngrok/reverse proxies
  app.set("trust proxy", 1);
  app.use(compression({ filter: shouldCompress }));

  // fallback to standard filter function

  app.use(logRequest);
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        const isAllowed = config.allowedOrigins.some((pattern) =>
          typeof pattern === "string"
            ? origin === pattern
            : pattern.test(origin),
        );
        if (isAllowed) return callback(null, true);
        callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
      allowedHeaders: ["Content-Type", "x-hub-id", "Authorization"],
      exposedHeaders: ["x-new-access-token"],
    }),
  );

  app.use(
    express.json({
      verify(req, res, buf) {
        if (req.url?.includes("webhook")) {
          (req as any).rawBody = buf;
        }
      },
    }),
  );

  app.use(bodyParser.urlencoded());
  app.use(cookieParser());
};

export const setupErrorHandlers = (app: Application) => {
  app.use(
    (
      err: HttpError | Error,
      req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      if (res.headersSent) return _next(err);
      const status =
        "status" in err && typeof (err as HttpError).status === "number"
          ? (err as HttpError).status
          : 500;

      const message =
        "message" in err && err.message ? err.message : "Internal Server Error";

      logger.error(`${req.method} ${req.url} (${status}) — ${message}`);

      res.status(status).json({
        error: message,
        details:
          "details" in err && (err as HttpError).details
            ? (err as HttpError).details
            : null,
      });
    },
  );

  // 🪶 Not found handler (optional but recommended)
  app.use((req, res, _next) => {
    res.status(404).json({ error: "Endpoint not found" });
  });
};

export const makeAuthGuard = (session: SessionService) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization?.split("Bearer ") || [];
      const token = authHeader?.[1] || null;
      if (!token) return next(createHttpError.Unauthorized());

      // Decode just to inspect expiry
      const decoded = jwt.decode(token) as {
        exp?: number;
        sub?: string;
        sessionId?: string;
        email?: string;
        context?: string;
      } | null;
      if (!decoded?.exp || !decoded?.sub || !decoded?.sessionId)
        throw createHttpError.Unauthorized("Invalid token");

      const now = Math.floor(Date.now() / 1000);
      const remaining = decoded.exp - now;

      let accessToken = token;
      let refreshed = false;

      if (remaining <= 10 && remaining > -60) {
        try {
          const refreshedPair = await session.refreshAccessToken(token);
          accessToken = refreshedPair.accessToken;
          refreshed = true;
        } catch {
          return next(createHttpError.Unauthorized("Session expired"));
        }
      }

      const tkn = session.parseOrThrow(accessToken, "access");
      req.sessionId = tkn.sessionId;
      req.userId = decoded.sub;
      req.email = decoded.email;
      req.context = decoded.context;

      if (refreshed) res.setHeader("x-new-access-token", accessToken);

      next();
    } catch (error) {
      next(error);
    }
  };
};

export const makeOptionalAuthGuard = (session: SessionService) => {
  return async (req, _res, next) => {
    const authHeader = req.headers.authorization?.split("Bearer ")[1];
    if (!authHeader) {
      // no token, continue anonymously
      return next();
    }

    try {
      const decoded = session.parseOrThrow(authHeader, "access");
      req.sessionId = decoded.sessionId;
      req.userId = decoded.sub;
      req.email = decoded.email;
      req.context = decoded.context;
      next();
    } catch {
      // invalid token, ignore and continue (do NOT throw)
      next();
    }
  };
};

export type AuthGuard = ReturnType<typeof makeAuthGuard>;
export type OptionalAuthGuard = ReturnType<typeof makeOptionalAuthGuard>;

export function assertReqUserIdIsDefined(
  req: Request,
): asserts req is Request & { userId: string } {
  z.string().parse(req.userId);
}

export const validateRequest =
  <T>(schema: ZodType<T>, property: "query" | "body" | "params" = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestData = req[property];
      schema.parse(requestData);
      next();
    } catch (error) {
      next(
        createHttpError.BadRequest(
          error instanceof ZodError
            ? error.issues.map((e) => e.message).join(",")
            : (error as any).message,
        ),
      );
    }
  };
