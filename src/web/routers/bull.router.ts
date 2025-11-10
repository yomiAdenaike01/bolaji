import { Config } from "@/config/index.js";
import { JobsQueues } from "@/infra/workers/jobs-queue.js";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { Application, NextFunction, Request, Response } from "express";

export const makeBullMqRouter = (
  app: Application,
  config: Config,
  jobQueues: JobsQueues,
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
  const protect = (req: Request, res: Response, next: NextFunction) => {
    const auth = {
      login: "admin",
      password: config.adminApiKey,
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
  app.use("/admin/queues", protect, serverAdapter.getRouter());
};
