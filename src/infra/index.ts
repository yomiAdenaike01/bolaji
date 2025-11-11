import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaClient } from "@/generated/prisma/index.js";
import { createClient } from "redis";
import { Config } from "@/config/index.js";
import { logger } from "@/lib/logger.js";
import { seed } from "./seed.js";
import { JobWorkers } from "./workers/workers.js";
import { Domain } from "@/domain/domain.js";
import { registerWorkspace } from "./registerWorkspace.js";

const initDb = () => {
  const db = new PrismaClient();
  db.$extends(withAccelerate());
  return db;
};

const initStore = async (config: Config) => {
  const redisClient = createClient({
    url: config.redisConnectionUrl,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 5) {
          logger.error("[Infra] Too many Redis reconnect attempts");
          return new Error("Redis connection failed");
        }
        logger.warn(`[Infra] Redis reconnect attempt #${retries}`);
        return Math.min(retries * 100, 3000); // backoff
      },
    },
  });

  redisClient.on("error", (err) => {
    logger.error(err, "[Infra] Redis client error");
  });

  redisClient.on("connect", () => {
    logger.info("[Infra] Redis client connecting...");
  });

  redisClient.on("ready", () => {
    logger.info("[Infra] ✅ Redis connection ready");
  });

  // ✅ Await the connection
  await redisClient.connect();

  // Optional: Verify connection
  try {
    await redisClient.ping();
    logger.info("[Infra] 🟢 Redis ping successful");
  } catch (pingErr) {
    logger.error(pingErr, "[Infra] Redis ping failed");
  }

  return redisClient;
};
const initWorkers = (config: Config, db: Db) => (domain: Domain) => {
  return new JobWorkers(config, db, domain);
};

export const initInfra = async (config: Config) => {
  const store = await initStore(config);
  const db = initDb();
  seed(db, store).catch((err) => {
    logger.error(err, "Failed to seed db");
  });
  return {
    db,
    store,
    initWorkers: initWorkers(config, db),
  };
};

export type Infra = ReturnType<typeof initInfra>;
export type Db = ReturnType<typeof initDb>;
export type TransactionClient = Parameters<
  Parameters<Db["$transaction"]>[0]
>[0];

export type Store = Awaited<ReturnType<typeof initStore>>;
export type Workspace = ReturnType<typeof registerWorkspace>;
