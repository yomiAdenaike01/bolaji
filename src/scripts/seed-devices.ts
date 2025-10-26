import { config } from "dotenv";
config();
import { PrismaClient } from "../generated/prisma/client";
import { createDeviceFingerprint } from "../utils";
const prisma = new PrismaClient();

async function seedDevices() {
  const userId = "cmh583kf60000plviuy28xyyv";

  const devices = Array.from({ length: 5 }).map((_, i) => {
    const userAgent = `Mozilla/5.0 (Test Device ${i + 1})`;
    return {
      userId,
      fingerprint: createDeviceFingerprint({
        headers: {
          ["user-agent"]: userAgent,
        },
        ip: "127.0.0.1",
      } as any),
      userAgent,
    };
  });

  await prisma.device.createMany({
    data: devices,
    skipDuplicates: true,
  });

  console.log("✅ 5 devices created successfully for user:", userId);
  await prisma.$disconnect();
}

seedDevices().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
