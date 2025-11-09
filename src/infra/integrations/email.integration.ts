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
  getTemplate<K extends EmailType>(
    emailType: K,
    content: EmailContentMap[K],
  ): { template: string; subject: string } {
    return {
      template: templates[emailType](content),
      subject: subjects[emailType],
    };
  }

  async sendEmail<T extends EmailType>(input: {
    content: EmailContentMap[T];
    email: string;
    type: EmailType;
    subject?: string;
  }) {
    try {
      const { email, type, subject } = z
        .object({
          email: z.email().min(1),
          subject: z.string().min(1).optional(),
          type: z.enum(EmailType),
          content: z.object(),
        })
        .parse(input);

      logger.info(
        `[EmailIntegration] Sending email=${input.email} type=${input.type} metaData=${input.content}`,
      );
      const emailContent = this.getTemplate(type, input.content);
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
      return false;
    }
  }
}
