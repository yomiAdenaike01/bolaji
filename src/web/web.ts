import { Domain } from "@/domain/domain";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  NextFunction,
  Request,
  Response,
  type Application,
} from "express";
import session from "express-session";
import { Config } from "../config";
import { Controllers, initControllers } from "./controllers/controllers";
import { Store } from "@/infra";
import { RedisStore } from "connect-redis";
import { logger } from "@/lib/logger";
import { HttpError } from "http-errors";
import { StatusCodes } from "http-status-codes";
import bodyParser from "body-parser";

const setupMiddlewares = (app: Application, store: Store, config: Config) => {
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

const setupRouters = (controllers: Controllers, app: Application) => {
  const router = express.Router();
  // #region auth router
  const authRouter = express.Router();
  authRouter.post("/authenticate", controllers.auth.handleAuthenticateUser);
  // #endregion

  // #region user router
  const userRouter = express.Router();
  userRouter.post("/create", controllers.user.handleCreateUser);
  // #endregion

  //#region pre-order router
  const preorderRouter = express.Router();
  preorderRouter.post("/create", controllers.preorders.handleCreatePreorder);
  preorderRouter.post(
    "/create-user-preorder",
    controllers.preorders.handleCreateUserAndPreorder,
  );
  //#endregion

  //#region integration router
  const integrationsRouter = express.Router();
  const paymentsRouter = express.Router();
  paymentsRouter.get("/redirect", (req, res) => {
    res.status(StatusCodes.OK).json(req.body);
  });
  paymentsRouter.post(
    "/webhook",
    bodyParser.raw({ type: "application/json" }),
    controllers.integrations.handlePaymentEvents,
  );

  integrationsRouter.use("/payments", paymentsRouter);
  //#endregion

  router.use("/integrations", integrationsRouter);
  router.use("/auth", authRouter);
  router.use("/preorders", preorderRouter);
  router.use("/users", userRouter);
  app.use("/api", router);
};

export const initWeb = (
  domain: Domain,
  store: Store,
  config: Config,
): Application => {
  const ctrls = initControllers(domain);
  const app = express();
  setupMiddlewares(app, store, config);
  setupRouters(ctrls, app);
  return app;
};
