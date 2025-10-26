export const initConfig = () => {
  return {
    port: +(process.env.PORT || 0),
    secret: String(process.env.SESSION_SECRET),
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
    allowedOrigins: (process.env.ALLOWED_ORIGINS || "").split(",") as (
      | string
      | RegExp
    )[],
  };
};

export type Config = ReturnType<typeof initConfig>;
