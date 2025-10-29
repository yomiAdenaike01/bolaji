import crypto from "crypto";
import { Request } from "express";

export const getRequestUserAgent = (req: Request): string => {
  return req.headers["user-agent"] ?? "unknown";
};

export const createDeviceFingerprint = (req: Request) => {
  const ua = getRequestUserAgent(req);
  const ip = "127.0.0.1"; //getClientIp(req);
  return crypto.createHash("sha256").update(`${ua}-${ip}`).digest("hex");
};

export const formatDate = (date: string | Date) => {
  const d = new Date(date);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};
