import dotenv from "dotenv";
import { initConfig } from "./config";
import { initDomain } from "./domain/domain";
import { initDb, initRedis, initStore } from "./infra";
import { initWeb } from "./web/web";
import { logger } from "./lib/logger";
dotenv.config();

const boostrap = () => {
  const config = initConfig();
  const db = initDb();
  const store = initStore(config);
  const redis = initRedis(config);
  const domain = initDomain(config, store, redis, db);
  const web = initWeb(domain, store, config);

  web.listen(config.port, () => {
    logger.info(`Starting server on port:${config.port}`);
  });
};

void boostrap();
