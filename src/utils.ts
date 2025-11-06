import crypto from "crypto";
import { Request } from "express";
import { addYears } from "date-fns";

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

export const hash = (data: string) =>
  crypto.createHash("sha256").update(data).digest("hex");

/**
 * Determines expiry based on edition number.
 * Edition 00 → 1 year
 * All following editions → 2 years
 */
export function getEditionExpiry(editionNumber: number) {
  const now = new Date();
  return editionNumber === 0 ? addYears(now, 1) : addYears(now, 2);
}

export const padNumber = (num: number) => {
  return String(num).padStart(2, "0");
};
