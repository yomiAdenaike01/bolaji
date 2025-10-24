import dotenv from "dotenv";
import { initConfig } from "./config";
import { initDomain } from "./domain/domain";
import { initDb } from "./infra";
import { initWeb } from "./web/web";
import { logger } from "./lib/logger";
dotenv.config();

const main = () => {
  const config = initConfig();
  const db = initDb();
  const domain = initDomain(config, db);
  const web = initWeb(domain, config);
  web.listen(config.port, () => {
    logger.info(`Starting server on port:${config.port}`);
  });
};

void main();
