import crypto from "crypto";
import { getClientIp } from "get-client-ip";
import { Request } from "express";

export const getRequestUserAgent = (req: Request): string => {
  return req.headers["user-agent"] ?? "unknown";
};

export const createDeviceFingerprint = (req: any) => {
  const ua = getRequestUserAgent(req);
  const ip = "127.0.0.1"; //getClientIp(req);
  return crypto.createHash("sha256").update(`${ua}-${ip}`).digest("hex");
};
