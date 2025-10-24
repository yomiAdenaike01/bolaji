export const initConfig = () => {
  return {
    port: +(process.env.PORT || 0),
    secret: String(process.env.SESSION_SECRET),
    maxAge: +(process.env.MAX_AGE || 0),
    databaseUrl: process.env.DATABASE_URL || "",
    stripeApiKey: "",
  };
};

export type Config = ReturnType<typeof initConfig>;
