import { Config } from "@/config";
import { Db } from "..";
import { EmailIntegration } from "../integrations/email.integration";
import { EmailWorker } from "./email.worker";
import IORedis from "ioredis";
import { logger } from "@/lib/logger";

export class JobWorkers {
  constructor(config: Config, db: Db, connection: IORedis) {
    logger.info("Initialising workers...");
    const emailIntegration = new EmailIntegration(
      config.resendApiKey,
      config.sentFromEmailAddr,
    );
    new EmailWorker(db, connection, emailIntegration);
  }
}
