import { Domain } from "@/domain/domain";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Application } from "express";
import session from "express-session";
import { Config } from "../config";
import { Controllers, initControllers } from "./controllers/controllers";

const setupMiddlewares = (app: Application, config: Config) => {
  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    session({
      saveUninitialized: true,
      resave: false,
      secret: config.secret,
      cookie: {
        maxAge: config.maxAge,
      },
    }),
  );
};

const setupRouters = (controllers: Controllers, app: Application) => {
  const router = express.Router();
  router.post("/users/create", controllers.user.handleCreateUser);
  router.post("/preorders/create", controllers.preorders.handleCreatePreorder);
  router.post(
    "/preorders/create-user-preorder",
    controllers.preorders.handleCreateUserAndPreorder,
  );
  app.use("/api", router);
};

export const initWeb = (domain: Domain, config: Config): Application => {
  const ctrls = initControllers(domain);
  const app = express();
  setupMiddlewares(app, config);
  setupRouters(ctrls, app);
  return app;
};
