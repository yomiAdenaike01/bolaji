// infra/integrations/base.email.integration.ts
import { logger } from "@/lib/logger.js";
import { Attachment, Resend } from "resend";

export abstract class BaseEmailIntegration {
  protected readonly integration: Resend;
  protected abstract readonly sourceEmailAddr: string;

  constructor(apiKey: string) {
    this.integration = new Resend(apiKey);
  }

  /**
   * Generic retry wrapper for rate limits / transient failures
   */
  protected async sendWithRetry<T>(
    fn: () => Promise<T>,
    retries = 3,
  ): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err: any) {
        const code = err?.statusCode ?? err?.response?.status;
        if (code === 429 && i < retries - 1) {
          const wait = 2000 * (i + 1);
          logger.warn(
            `[EmailIntegration] Rate limited. Retrying in ${wait}ms...`,
          );
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        logger.error(err, `[EmailIntegration] Attempt ${i + 1} failed`);
        if (i === retries - 1) throw err;
      }
    }
    throw new Error("All retry attempts failed");
  }

  /**
   * Core send wrapper — subclasses call this
   */
  protected async performSend({
    to,
    html,
    subject,
    attachments,
  }: {
    to: string;
    html: string;
    subject: string;
    attachments?: Attachment[] | undefined;
  }) {
    return await this.sendWithRetry(() =>
      this.integration.emails.send({
        from: `Bolaji Editions <${this.sourceEmailAddr}>`,
        to,
        html,
        subject,
        attachments,
      }),
    );
  }
}
