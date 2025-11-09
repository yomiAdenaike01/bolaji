import { logger } from "@/lib/logger";

export const initConfig = () => {
  const config = {
    port: +(process.env.PORT || 3400),
    secret: String(process.env.SESSION_SECRET),
    jwtSecret: process.env.JWT_SECRET || "",
    maxAge: +(process.env.MAX_AGE || 0),
    databaseUrl: process.env.DATABASE_URL || "",
    stripeApiKey: process.env.STRIPE_API_KEY || "",
    resendApiKey: process.env.RESEND_API_KEY || "",
    sentFromEmailAddr: process.env.SOURCE_EMAIL_ADDR || "",
    redisConnectionUrl: process.env.REDIS_URL || "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    stripePaymentRedirectUrl: process.env.STRIPE_PAYMENT_REDIRECT_URL || "",
    adminEmailAddresses: (process.env.ADMIN_EMAILS || "").split(","),
    frontEndUrl: process.env.FRONTEND_URL || "",
    env: (process.env.NODE_ENV || "production") as "dev" | "production",
    preorderPassword: process.env.PREORDER_PASSWORD || "",
    serverUrl: process.env.SERVER_URL || "",
    adminApiKey: process.env.ADMIN_API_KEY || "",
    jwtRefreshSecret: process.env.JWT_REFRESH_TOKEN_SECRET || "",
    accessTokenTtl: process.env.JWT_ACCESS_TOKEN_TTL || "30m",
    refreshTokenTtl: process.env.JWT_REFRESH_TTL || "7d",
    privateAccessPageUrl: process.env.PREORDER_ACCESS_PAGE_URL || "",
    allowedOrigins: (process.env.ALLOWED_ORIGINS || "").split(",") as (
      | string
      | RegExp
    )[],
  };
  logger.info(`[Config] Loaded config for env - ${config.env}`);
  return config;
};

export type Config = ReturnType<typeof initConfig>;
