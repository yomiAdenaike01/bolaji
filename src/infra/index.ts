import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaClient } from "@/generated/prisma/client";
import { createClient } from "redis";
import { Config } from "@/config";
import { logger } from "@/lib/logger";
import { seed } from "./seed";
import { JobWorkers } from "./workers/workers";
import { Domain } from "@/domain/domain";

const initDb = () => {
  const db = new PrismaClient().$extends(withAccelerate());
  return db;
};

const initStore = (config: Config) => {
  let redisClient = createClient({
    url: config.redisConnectionUrl,
    socket: {
      tls: config.env === "production",
    } as any,
  });
  redisClient
    .connect()
    .then(() => logger.info("[Infra] Successfully connected to redis"))
    .catch(logger.error);
  redisClient.on("pong", () => {
    logger.info("[Infra] Received pong from redis!");
  });
  redisClient.ping();

  return redisClient;
};

const initWorkers = (config: Config, db: Db) => (domain: Domain) => {
  return new JobWorkers(config, db, domain);
};

export const initInfra = (config: Config) => {
  const db = initDb();
  const store = initStore(config);
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

export type Store = ReturnType<typeof initStore>;
