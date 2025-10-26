import dotenv from "dotenv";
import { initConfig } from "./config";
import { initDomain } from "./domain/domain";
import { initDb, initStore } from "./infra";
import { initWeb } from "./web/web";
import { logger } from "./lib/logger";
dotenv.config();

const main = () => {
  const config = initConfig();
  const db = initDb();

  const store = initStore(config);
  const domain = initDomain(config, store, db);
  const web = initWeb(domain, store, config);

  web.listen(config.port, () => {
    logger.info(`Starting server on port:${config.port}`);
  });
};

void main();
