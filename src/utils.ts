import crypto from "crypto";
import { Request } from "express";
import { Db, TransactionClient } from "./infra";

export const getRequestUserAgent = (req: Request): string => {
  return req.headers["user-agent"] ?? "unknown";
};

export const createDeviceFingerprint = (req: Request) => {
  const ua = getRequestUserAgent(req);
  const ip = "127.0.0.1"; //getClientIp(req);
  return crypto.createHash("sha256").update(`${ua}-${ip}`).digest("hex");
};
