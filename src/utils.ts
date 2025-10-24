import crypto from "crypto";

export const createDeviceFingerprint = (req: any) => {
  const ua = req.headers["user-agent"] ?? "unknown";
  const ip = req.ip ?? "unknown";
  return crypto.createHash("sha256").update(`${ua}-${ip}`).digest("hex");
};
