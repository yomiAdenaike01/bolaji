import { Config } from "@/config";
import { JobsQueues } from "@/infra/workers/jobs-queue";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import express, { Request, Response, Application, NextFunction } from "express";
import { JobController } from "../controllers/job.controller";

const adminAuthGuard =
  (apiKey: string) => (req: Request, res: Response, next: NextFunction) => {
    if (req.headers["x-api-key"] !== apiKey) return res.status(401).end();
    return next();
  };

const wwwAdminAuthGuard =
  (apiKey: string) => (req: Request, res: Response, next: NextFunction) => {
    const auth = {
      login: "admin",
      password: apiKey,
    };

    const b64auth = (req.headers.authorization || "").split(" ")[1] || "";
    const [login, password] = Buffer.from(b64auth, "base64")
      .toString()
      .split(":");

    if (
      login &&
      password &&
      login === auth.login &&
      password === auth.password
    ) {
      return next();
    }

    res.set("WWW-Authenticate", 'Basic realm="401"');
    res.status(401).send("Authentication required.");
  };

export const makeAdminRouter = (
  app: Application,
  config: Config,
  jobQueues: JobsQueues,
  jobsController: JobController,
) => {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  createBullBoard({
    queues: [
      new BullMQAdapter(jobQueues.getEmailQueue()),
      new BullMQAdapter(jobQueues.getEditionsQueue()),
      new BullMQAdapter(jobQueues.getPaymentsQueue()),
    ],
    serverAdapter: serverAdapter,
  });

  app.use(
    "/admin/queues",
    wwwAdminAuthGuard(config.adminApiKey),
    serverAdapter.getRouter(),
  );

  const middlewares = [adminAuthGuard(config.adminApiKey), express.json()];

  app.post(
    "/admin/jobs/release-edition",
    ...middlewares,
    jobsController.handleReleaseEdition,
  );
  app.use(
    "/admin/jobs/broadcast",
    ...middlewares,
    jobsController.handleBroadcast,
  );
};
