import dotenv from "dotenv";
import { initConfig } from "./config";
import { initDomain } from "./domain/domain";
import { initInfra } from "./infra";
import { logger } from "./lib/logger";
import { initWeb } from "./web/web";
dotenv.config();

const boostrap = () => {
  const config = initConfig();
  const { db, store, redis } = initInfra(config);
  const domain = initDomain(config, store, redis, db);
  const web = initWeb(domain, store, config);

  web.listen(config.port, () => {
    logger.info(`Starting server on port:${config.port}`);
  });
};

void boostrap();
