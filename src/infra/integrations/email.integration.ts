import { logger } from "@/lib/logger";
import { log } from "console";
import z from "zod";

export enum EmailType {
  REGISTER = "REGISTER",
}
const retry = async <T>({
  retryCount,
  callback,
  delay = 200,
}: {
  delay?: number;
  retryCount: number;
  callback: () => T;
}) => {
  let lastError = null;
  for (let i = 0; i < retryCount; i++) {
    try {
      const result = await callback();
      return result;
    } catch (error) {
      logger.error(
        `Retry attempt ${i}/${retryCount} failed: ${error instanceof Error ? error.message : error}`,
      );
      lastError = error;
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw lastError;
};

export class EmailIntegration {
  async sendEmail<T extends Record<string, string>>(input: {
    metaData?: T;
    email: string;
    type: EmailType;
  }) {
    const parsed = z
      .object({
        email: z.email().min(1),
        type: z.enum(EmailType),
      })
      .parse(input);
    logger.debug(
      `Sending email=${input.email} type=${input.type} metaData=${input.metaData}`,
    );
    await retry({
      retryCount: 3,
      async callback() {},
    });
  }
}
