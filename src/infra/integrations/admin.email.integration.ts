import { Db } from "@/infra/index.js";
import { logger } from "@/lib/logger.js";
import { generatePreorderSummaryReport } from "@/lib/spreadsheets/generatePreorderReport.js";
import { generateUsersReportSheet } from "@/lib/spreadsheets/generateUsersReport.js";
import ExcelJS from "exceljs";
import { Attachment, Resend } from "resend";
import {
  adminEmailSubjects,
  adminEmailTemplates,
} from "./admin.email.template.js";
import { AdminEmailContent, AdminEmailType } from "./email-types.js";
import { generateSubscriberReport } from "@/lib/spreadsheets/generateSubscribersReport.js";
import { BaseEmailIntegration } from "./base.email.integration.js";

const reportGenerators: Partial<
  Record<AdminEmailType, (db: Db) => Promise<ExcelJS.Buffer>>
> = {
  [AdminEmailType.NEW_USER]: generateUsersReportSheet,
  [AdminEmailType.NEW_PREORDER]: generatePreorderSummaryReport,
  [AdminEmailType.SUBSCRIBER_DAILY_DIGEST]: generateSubscriberReport, // ✅ NEW
};

export class AdminEmailIntegration extends BaseEmailIntegration {
  constructor(
    apiKey: string,
    private readonly adminEmailAddresses: string[],
    private readonly db: Db,
    protected readonly sourceEmailAddr: string,
  ) {
    super(apiKey);
  }

  private getAdminAttachmentFilename = (type: AdminEmailType): string => {
    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    switch (type) {
      case AdminEmailType.NEW_PREORDER:
        return `preorders_${date}.xlsx`;
      case AdminEmailType.NEW_USER:
        return `new_users_${date}.xlsx`;
      case AdminEmailType.SUBSCRIPTION_STARTED:
        return `active_subscriptions_${date}.xlsx`;
      case AdminEmailType.SUBSCRIPTION_CANCELED:
        return `canceled_subscriptions_${date}.xlsx`;
      case AdminEmailType.SUPPORT_TICKET_CREATED:
        return `open_support_tickets_${date}.xlsx`;
      default:
        return `report_${date}.xlsx`;
    }
  };

  getTemplate = <K extends AdminEmailType>(
    type: K,
    content: AdminEmailContent[K],
  ) => {
    return {
      template: adminEmailTemplates[type](content),
      subject: adminEmailSubjects[type],
    };
  };

  async send<K extends AdminEmailType>(opts: {
    type: K;
    content: AdminEmailContent[K];
    attachReport?: boolean;
    attachmentOverride?: {
      filename: string;
      buffer: ExcelJS.Buffer;
    };
  }) {
    try {
      const { type, content, attachReport = true, attachmentOverride } = opts;

      const { template, subject } = this.getTemplate(type, content);

      let attachments: Attachment[] = [];

      let buffer = attachmentOverride?.buffer ?? null;
      let filename = attachmentOverride?.filename ?? null;

      if (attachReport) {
        buffer = await (reportGenerators[type]?.(this.db) ??
          Promise.resolve(null));

        filename = this.getAdminAttachmentFilename(type);
      }

      if (buffer && filename)
        attachments = [
          {
            filename,
            content: Buffer.from(buffer).toString("base64"),
          },
        ];
      for (const address of this.adminEmailAddresses) {
        logger.info(
          `[AdminEmailIntegration] Sending email to=${address} type=${type} subject=${subject}`,
        );
        const response = await this.performSend({
          to: address,
          subject,
          html: template,
          attachments,
        });

        if (response.error) {
          logger.error(
            response.error,
            `[AdminEmailIntegration] Failed to send admin email to=${address} reason=${response.error.message}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      logger.error(error, `Failed to send admin email of type ${opts.type}`);
    }
  }
}
