import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaClient } from "@/generated/prisma/client";
import { createClient } from "redis";
import { Config } from "@/config";
import { logger } from "@/lib/logger";
import IORedis from "ioredis";
import { seed } from "./seed";

export const initDb = () => {
  const db = new PrismaClient().$extends(withAccelerate());
  seed(db).catch((err) => {
    logger.error(err, "Failed to seed db");
  });
  return db;
};

export type Db = ReturnType<typeof initDb>;

export type TransactionClient = Parameters<
  Parameters<Db["$transaction"]>[0]
>[0];

export const initStore = (appConfig: Config) => {
  let redisClient = createClient({
    url: appConfig.redisConnectionUrl,
  });
  redisClient.connect().catch(logger.error);
  return redisClient;
};

export const initRedis = (appConfig: Config) => {
  return new IORedis(appConfig.redisConnectionUrl);
};

export type Store = ReturnType<typeof initStore>;
export type RedisClient = ReturnType<typeof initRedis>;
