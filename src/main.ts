import { loadEnv } from "./config/env";
loadEnv();
import { initConfig } from "./config";
import { initDomain } from "./domain/domain";
import { initInfra, initStore } from "./infra";
import { logger } from "./lib/logger";
import { initWeb } from "./web/web";

const bootstrap = async () => {
  const config = initConfig();

  // 1️⃣ Await store initialization
  const store = await initStore(config);
  const { db, initWorkers } = initInfra(config, store); // adjust as needed\

  // 2️⃣ Await domain init after Redis ready
  const domain = await initDomain(config, store, db);

  // 3️⃣ Start workers and web
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
