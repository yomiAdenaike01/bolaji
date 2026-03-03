import { loadEnv } from "./config/env";
loadEnv();
import { initConfig } from "./config";
import { initDomain } from "./domain/domain";
import { initInfra, initStore } from "./infra";
import { logger } from "./lib/logger";
import { initWeb } from "./web/web";

const bootstrap = async () => {
  const config = initConfig();

  const store = await initStore(config);
  const { db, initWorkers } = initInfra(config, store);

  const domain = await initDomain(config, store, db);

  await initWorkers(domain);
  const web = initWeb(domain, store, config);

  web.listen(config.port, () => {
    logger.info(`🚀 Server started on port ${config.port}`);
  });
};

void bootstrap().catch((err) => {
  logger.error(err, "❌ Fatal error during bootstrap");
  process.exit(1);
});
