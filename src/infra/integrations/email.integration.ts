import { Config } from "@/config";
import { logger } from "@/lib/logger";
import { Resend } from "resend";
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
  private readonly integration!: Resend;
  constructor(
    apiKey: string,
    private readonly sourceEmailAddr: string,
  ) {
    this.integration = new Resend(apiKey);
  }
  private getEmailTemplate(
    emailType: EmailType,
    content: Record<string, string>,
  ): string {
    return "";
  }
  async sendEmail<T extends Record<string, string>>(input: {
    content: T;
    email: string;
    type: EmailType;
    subject: string;
  }) {
    const { email, type, subject } = z
      .object({
        email: z.email().min(1),
        subject: z.string().min(1),
        type: z.enum(EmailType),
        content: z.object(),
      })
      .parse(input);
    logger.debug(
      `Sending email=${input.email} type=${input.type} metaData=${input.content}`,
    );
    await this.integration.emails.send({
      from: this.sourceEmailAddr,
      to: email,
      html: this.getEmailTemplate(type, input.content),
      subject,
    });
  }
}
