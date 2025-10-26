import express, { Request, Response, NextFunction, Application } from "express";
import cors from "cors";
import session from "express-session";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import { RedisStore } from "connect-redis";
import { logger } from "@/lib/logger";
import { Store } from "@/infra";
import { Config } from "@/config";
import { HttpError } from "http-errors";

export const setupMiddlewares = (
  app: Application,
  store: Store,
  config: Config,
) => {
  // 🟢 Allow Express to trust ngrok/reverse proxies
  app.set("trust proxy", 1);

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
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
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

  app.use(
    session({
      saveUninitialized: false, // 🟢 don’t send empty sessions
      resave: false,
      store: new RedisStore({
        client: store,
      }),
      secret: config.secret,
      cookie: {
        maxAge: config.maxAge,
        sameSite: "none", // ✅ required for Framer cross-domain
        secure: true, // ✅ works now because trust proxy is set
        httpOnly: true,
      },
    }),
  );

  app.use(
    (error: HttpError, request: Request, res: Response, next: NextFunction) => {
      logger.error(
        error,
        `Status=${error.status} Endpoint=${request.url} Message=${error.message}`,
        error.details,
      );
      res.status(error.status).json({
        error: error.message,
        details: error?.details ?? null,
      });
    },
  );
};
