import { logger } from "@/lib/logger";
import { Resend } from "resend";
import z from "zod";
import { subjects, templates } from "./email.integrations.templates";
import { EmailType, EmailContentMap } from "./email-types";
import { BaseEmailIntegration } from "./base.email.integration";

export class EmailIntegration extends BaseEmailIntegration {
  constructor(
    apiKey: string,
    protected readonly sourceEmailAddr: string,
  ) {
    super(apiKey);
    this.sourceEmailAddr = sourceEmailAddr;
  }
  getTemplate = async <K extends EmailType>(
    emailType: K,
    content: EmailContentMap[K],
  ): Promise<{ template: string; subject: string }> => {
    return {
      template: await templates[emailType](content),
      subject: subjects[emailType],
    };
  };

  async sendEmail<T extends EmailType>(input: {
    content: EmailContentMap[T];
    email: string | string[];
    type: EmailType;
    subject?: string;
    tags?: { name: string; value: string }[];
  }) {
    try {
      const { email, type, subject, tags } = z
        .object({
          email: z.email().min(1).array().or(z.email().min(1)),
          subject: z.string().min(1).optional(),
          type: z.enum(EmailType),
          content: z.object().optional(),
          tags: z
            .array(z.object({ name: z.string(), value: z.any() }))
            .optional(),
        })
        .parse(input);

      logger.info(
        `[EmailIntegration] Sending email=${input.email} type=${input.type} metaData=${input.content}`,
      );
      const emailContent = await this.getTemplate(type, input.content);

      if (Array.isArray(email)) {
        const response = await this.integration.batch.send(
          email.map((email) => {
            return {
              from: `Bolaji Editions <${this.sourceEmailAddr}>`,
              to: email,
              html: emailContent.template,
              subject: subject || emailContent.subject,
              tags,
            };
          }),
        );
        if (response.error)
          logger.error(
            response.error,
            `[EmailIntegration] Failed to send batch emails reason=${response.error.message}`,
          );
        return;
      }

      const response = await this.performSend({
        to: email,
        html: emailContent.template,
        subject: subject || emailContent.subject,
      });
      if (response.error)
        logger.error(
          response.error,
          `[EmailIntegration] Failed to send email to=${email} reason=${response.error.message}`,
        );
      return response;
    } catch (error) {
      logger.error(error, "Failed to send email");
      return null;
    }
  }
}
