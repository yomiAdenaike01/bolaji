import "express-serve-static-core";
declare module "express-serve-static-core" {
  interface Request {
    sessionId?: string;
    userId?: string;
    email?: string;
    context?: string;
    session?: Session & Partial<SessionData>;
  }
}

export {};
