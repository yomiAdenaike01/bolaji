import { Attachment, Resend } from "resend";
import {
  AdminEmailType,
  adminEmailTemplates,
  adminEmailSubjects,
  AdminEmailContent,
} from "./admin.email.template";
import { generatePendingOrdersSheet } from "@/lib/spreadsheets/generatePendingOrders";
import { Db } from "@/infra";

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
        return `pending_orders_${date}.xlsx`;
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
    attachPendingOrders?: boolean;
  }) {
    const html = adminEmailTemplates[opts.type](opts.content);
    const subject = adminEmailSubjects[opts.type];

    let attachments: Attachment[] = [];
    if (opts.attachPendingOrders) {
      const buffer = await generatePendingOrdersSheet(this.db);
      attachments = [
        {
          filename: this.getAdminAttachmentFilename(opts.type),
          content: Buffer.from(buffer).toString("base64"),
        },
      ];
    }

    return Promise.allSettled(
      this.adminEmailAddresses.map((address) => {
        this.integration.emails.send({
          from: this.sentFromEmaillAddress,
          to: address,
          subject,
          html,
          attachments,
        });
      }),
    );
  }
}
