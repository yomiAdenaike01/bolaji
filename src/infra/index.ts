import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaClient } from "@/generated/prisma/client";
import { createClient } from "redis";
import { Config } from "@/config";
import { logger } from "@/lib/logger";

export const initDb = () => new PrismaClient().$extends(withAccelerate());

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

export type Store = ReturnType<typeof initStore>;
