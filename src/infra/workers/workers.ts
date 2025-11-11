import { Config } from "@/config/index.js";
import { Db } from "../index.js";
import { EmailWorker } from "./email.worker.js";
import { logger } from "@/lib/logger.js";
import { PaymentWorker } from "./payment.worker.js";
import { Domain } from "@/domain/domain.js";
import { ReleaseWorker } from "./editions.worker.js";
// TODO: ALL EDITIONS ACCESS EXPIRES AFTER 2 YEARS

export class JobWorkers {
  constructor(config: Config, db: Db, domain: Domain) {
    logger.info("[Workers] Initialising workers...");
    new EmailWorker(
      db,
      config.redisConnectionUrl,
      domain.integrations.email,
      domain.integrations.adminEmail,
      domain.notifications,
      config,
    );
    new PaymentWorker(config, domain, db);
    new ReleaseWorker(config, domain, db);
  }
}
