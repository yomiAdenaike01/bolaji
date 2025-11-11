import { loadEnv } from "./config/env.js";
loadEnv();
import { initConfig } from "./config/index.js";
import { initDomain } from "./domain/domain.js";
import { initInfra } from "./infra/index.js";
import { registerWorkspace } from "./infra/registerWorkspace.js";
import { logger } from "./lib/logger.js";
import { initWeb } from "./web/web.js";

const bootstrap = async () => {
  const config = initConfig();

  // 1️⃣ Await store initialization
  const { store, db, initWorkers } = await initInfra(config); // adjust as needed\

  // 2️⃣ Await domain init after Redis ready
  const domain = await initDomain(config, store, db);

  const workspace = registerWorkspace(config, domain);

  // 3️⃣ Start workers and web
  await initWorkers(domain);

  const web = initWeb({
    domain,
    store,
    config,
    workspace,
  });

  web.listen(config.port, () => {
    logger.info(`🚀 Server started on port ${config.port}`);
  });
};

void bootstrap().catch((err) => {
  logger.error(err, "❌ Fatal error during bootstrap");
  process.exit(1);
});
