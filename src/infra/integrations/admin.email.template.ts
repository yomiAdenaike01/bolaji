import { Address } from "@/generated/prisma/client";

export enum AdminEmailType {
  NEW_USER = "NEW_USER",
  NEW_PREORDER = "NEW_PREORDER",
  SUBSCRIPTION_STARTED = "SUBSCRIPTION_STARTED",
  SUBSCRIPTION_CANCELED = "SUBSCRIPTION_CANCELED",
  SUPPORT_TICKET_CREATED = "SUPPORT_TICKET_CREATED",
  WAITLIST_PREORDER_RELEASE_SUMMARY = "WAITLIST_PREORDER_RELEASE_SUMMARY",
}

export type AdminEmailContent = {
  [AdminEmailType.WAITLIST_PREORDER_RELEASE_SUMMARY]: {
    totalSent: number;
    totalFailed: number;
  };
  [AdminEmailType.NEW_USER]: {
    name: string;
    email: string;
    address?: Address;
  };
  [AdminEmailType.NEW_PREORDER]: {
    name: string;
    email: string;
    plan: string;
    editionCode: string;
    amount: string;
    address?: Address;
  };
  [AdminEmailType.SUBSCRIPTION_STARTED]: {
    name: string;
    email: string;
    plan: string;
    periodStart: string;
    periodEnd: string;
  };
  [AdminEmailType.SUBSCRIPTION_CANCELED]: {
    name: string;
    email: string;
    plan: string;
    canceledAt: string;
  };
  [AdminEmailType.SUPPORT_TICKET_CREATED]: {
    name: string;
    email: string;
    subject: string;
    category: string;
    ticketId: string;
  };
};

const renderAddress = (address?: Address) => {
  if (!address) return "<p><i>No address on file.</i></p>";

  return `
    <div style="margin-top: 8px; padding: 8px; background: #f8f9fa; border-radius: 6px;">
      <p><b>Address:</b></p>
      <p>
        ${address.fullName ? `${address.fullName}<br>` : ""}
        ${address.line1}<br>
        ${address.line2 ? `${address.line2}<br>` : ""}
        ${address.city}, ${address.state ?? ""} ${address.postalCode}<br>
        ${address.country}<br>
        ${address.phone ? `<b>Phone:</b> ${address.phone}<br>` : ""}
      </p>
    </div>
  `;
};

export const adminEmailTemplates: {
  [K in AdminEmailType]: (content: AdminEmailContent[K]) => string;
} = {
  [AdminEmailType.WAITLIST_PREORDER_RELEASE_SUMMARY]: ({
    totalSent,
    totalFailed,
  }) => `
  <h2>📬 Waitlist Preorder Release Summary</h2>
  <p><b>Emails Sent:</b> ${totalSent}</p>
  <p><b>Failed Sends:</b> ${totalFailed}</p>
  <p>The attached report contains detailed results.</p>
`,
  [AdminEmailType.NEW_USER]: ({ name, email, address }) => `
    <h2>👤 New User Registered</h2>
    <p><b>Name:</b> ${name}</p>
    <p><b>Email:</b> ${email}</p>
    ${renderAddress(address)}
  `,

  [AdminEmailType.NEW_PREORDER]: ({
    name,
    email,
    plan,
    editionCode,
    amount,
    address,
  }) => `
    <h2>🧾 New Preorder Placed</h2>
    <p><b>User:</b> ${name} (${email})</p>
    <p><b>Edition:</b> ${editionCode}</p>
    <p><b>Plan:</b> ${plan}</p>
    <p><b>Amount:</b> ${amount}</p>
    ${renderAddress(address)}
  `,

  [AdminEmailType.SUBSCRIPTION_STARTED]: ({
    name,
    email,
    plan,
    periodStart,
    periodEnd,
  }) => `
    <h2>💳 New Subscription Started</h2>
    <p><b>User:</b> ${name} (${email})</p>
    <p><b>Plan:</b> ${plan}</p>
    <p><b>Period:</b> ${periodStart} → ${periodEnd}</p>
  `,

  [AdminEmailType.SUBSCRIPTION_CANCELED]: ({
    name,
    email,
    plan,
    canceledAt,
  }) => `
    <h2>⛔ Subscription Canceled</h2>
    <p><b>User:</b> ${name} (${email})</p>
    <p><b>Plan:</b> ${plan}</p>
    <p><b>Canceled At:</b> ${canceledAt}</p>
  `,

  [AdminEmailType.SUPPORT_TICKET_CREATED]: ({
    name,
    email,
    subject,
    category,
    ticketId,
  }) => `
    <h2>💬 New Support Ticket</h2>
    <p><b>User:</b> ${name} (${email})</p>
    <p><b>Subject:</b> ${subject}</p>
    <p><b>Category:</b> ${category}</p>
    <p><b>Ticket ID:</b> ${ticketId}</p>
  `,
};

export const adminEmailSubjects: Record<AdminEmailType, string> = {
  [AdminEmailType.NEW_USER]: "👤 New User Registered",
  [AdminEmailType.NEW_PREORDER]: "🧾 New Preorder Placed",
  [AdminEmailType.SUBSCRIPTION_STARTED]: "💳 New Subscription Started",
  [AdminEmailType.SUBSCRIPTION_CANCELED]: "⛔ Subscription Canceled",
  [AdminEmailType.SUPPORT_TICKET_CREATED]: "💬 New Support Ticket Created",
  [AdminEmailType.WAITLIST_PREORDER_RELEASE_SUMMARY]:
    "Bolaji Editions — Waitlist Preorder Release Summary",
};
