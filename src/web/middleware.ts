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
  app.use(cors());
  app.use(
    express.json({
      verify(req, res, buf, encoding) {
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
      saveUninitialized: true,
      resave: false,
      store: new RedisStore({
        client: store,
      }),
      secret: config.secret,
      cookie: {
        maxAge: config.maxAge,
        sameSite: "lax",
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
