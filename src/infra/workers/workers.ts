import { Config } from "@/config";
import { Db } from "..";
import { EmailWorker } from "./email.worker";
import { logger } from "@/lib/logger";
import { PaymentWorker } from "./payment.worker";
import { Domain } from "@/domain/domain";
import { EditionsWorker } from "./editions.worker";
// TODO: ALL EDITIONS ACCESS EXPIRES AFTER 2 YEARS

export class JobWorkers {
  constructor(config: Config, db: Db, domain: Domain) {
    logger.info("[Workers] Initialising workers...");
    new EmailWorker(
      db,
      config.redisConnectionUrl,
      domain.integrations.email,
      config,
    );
    new PaymentWorker(config, domain, db);
    new EditionsWorker(config, domain, db);
  }
}
