import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaClient } from "@/generated/prisma/client";

export const initDb = () => new PrismaClient().$extends(withAccelerate());

export type Db = ReturnType<typeof initDb>;
