import { Db } from "@/infra";
import { logger } from "@/lib/logger";
import { generatePreorderSummaryReport } from "@/lib/spreadsheets/generatePreorderReport";
import { generateUsersReportSheet } from "@/lib/spreadsheets/generateUsersReport";
import ExcelJS from "exceljs";
import { Attachment, Resend } from "resend";
import {
  adminEmailSubjects,
  adminEmailTemplates,
} from "./admin.email.template";
import { AdminEmailContent, AdminEmailType } from "./email-types";
import { generateSubscriberReport } from "@/lib/spreadsheets/generateSubscribersReport";

const reportGenerators: Partial<
  Record<AdminEmailType, (db: Db) => Promise<ExcelJS.Buffer>>
> = {
  [AdminEmailType.NEW_USER]: generateUsersReportSheet,
  [AdminEmailType.NEW_PREORDER]: generatePreorderSummaryReport,
  [AdminEmailType.SUBSCRIBER_DAILY_DIGEST]: generateSubscriberReport, // ✅ NEW
};

export class AdminEmailIntegration {
  private readonly integration!: Resend;

  constructor(
    apiKey: string,
    private readonly adminEmailAddresses: string[],
    private readonly db: Db,
    private readonly sentFromEmaillAddress: string,
  ) {
    this.integration = new Resend(apiKey);
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

      const html = adminEmailTemplates[type](content);
      const subject = adminEmailSubjects[type];

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
        const response = await this.integration.emails.send({
          from: this.sentFromEmaillAddress,
          to: address,
          subject,
          html,
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
