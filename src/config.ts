export const initConfig = () => {
  return {
    port: +(process.env.PORT || 0),
    secret: String(process.env.SESSION_SECRET),
    maxAge: +(process.env.MAX_AGE || 0),
    databaseUrl: process.env.DATABASE_URL || "",
    stripeApiKey: "",
    resendApiKey: process.env.RESEND_API_KEY || "",
    sentFromEmailAddr: process.env.SOURCE_EMAIL_ADDR || "",
  };
};

export type Config = ReturnType<typeof initConfig>;
