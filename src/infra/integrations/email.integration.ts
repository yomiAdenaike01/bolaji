import { logger } from "@/lib/logger";
import { Resend } from "resend";
import z from "zod";
import { subjects, templates } from "./email.integrations.templates";
import { EmailType, EmailContentMap } from "./email-types";

export class EmailIntegration {
  private readonly integration!: Resend;
  constructor(
    apiKey: string,
    private readonly sourceEmailAddr: string,
  ) {
    this.integration = new Resend(apiKey);
  }
  private getEmailTemplate<K extends EmailType>(
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
      const emailContent = this.getEmailTemplate(type, input.content);

      const response = await this.integration.emails.send({
        from: this.sourceEmailAddr,
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
