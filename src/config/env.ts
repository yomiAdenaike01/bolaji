import { logger } from "@/lib/logger.js";
import * as dotenv from "dotenv";
import path from "path";

// Only load once (singleton)
let loaded = false;

export const loadEnv = () => {
  if (loaded) return;
  loaded = true;

  const env = process.env.NODE_ENV ?? "local";

  // Map NODE_ENV → file
  const envFile =
    {
      production: ".env.production",
      staging: ".env.staging",
      development: ".env.local",
      local: ".env.local",
    }[env] ?? ".env.local";

  const envPath = path.resolve(process.cwd(), envFile);

  logger.info(`[Env] Loading environment from ${envPath}`);

  dotenv.config({ path: envPath });
};
