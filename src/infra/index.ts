import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaClient } from "@/generated/prisma/client";
import { createClient } from "redis";
import { Config } from "@/config";
import { logger } from "@/lib/logger";
import IORedis from "ioredis";
import { seed } from "./seed";
import { JobWorkers } from "./workers/workers";
import { Domain } from "@/domain/domain";

const initDb = () => {
  const db = new PrismaClient().$extends(withAccelerate());
  seed(db).catch((err) => {
    logger.error(err, "Failed to seed db");
  });
  return db;
};

const initStore = (config: Config) => {
  let redisClient = createClient({
    url: config.redisConnectionUrl,
    socket: {
      tls: true,
    },
  });
  redisClient.connect().catch(logger.error);
  return redisClient;
};

const initRedis = (config: Config) => {
  const { redisConfig, redisConnectionUrl } = config;
  const redisInstance = new IORedis(redisConnectionUrl, {
    maxRetriesPerRequest: null,
    tls: {},
  });
  redisInstance.ping(() => {
    logger.info("✅ Succesfully connected to redis");
  });
  redisInstance.on("error", (err) => {
    logger.error(err, "Redis error");
  });
  return redisInstance;
};

const initWorkers = (config: Config, db: Db) => (domain: Domain) => {
  return new JobWorkers(config, db, domain);
};

export const initInfra = (config: Config) => {
  const db = initDb();
  const redis = initRedis(config);
  return {
    db,
    store: initStore(config),
    redis,
    initWorkers: initWorkers(config, db),
  };
};

export type Infra = ReturnType<typeof initInfra>;
export type Db = ReturnType<typeof initDb>;
export type TransactionClient = Parameters<
  Parameters<Db["$transaction"]>[0]
>[0];

export type Store = ReturnType<typeof initStore>;
export type RedisClient = ReturnType<typeof initRedis>;
