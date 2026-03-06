import { ShippingAddress } from "@/domain/schemas/users";
import { AdminEmailContent, AdminEmailType } from "./email-types";
import { formatDate } from "@/utils";

const LOGO_URL =
  "https://static.wixstatic.com/media/7ec957_cdb075d0cbbe459ebbb49f125106e1fb~mv2.png/v1/fill/w_99,h_66,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/Ade_Logo_Black.png";

const renderAddress = (address?: ShippingAddress) => {
  if (!address) return "<p><i>No address on file.</i></p>";
  return `
    <div style="margin-top: 8px; padding: 12px; background: #f8f9fa; border-radius: 6px;">
      <p><b>Address:</b></p>
      <p style="font-size:14px;color:#444;">
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

/** 🔧 Unified admin email layout */
const wrapAdmin = (
  title: string,
  body: string,
  actions?: { label: string; url: string }[],
) => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f9f9f9;-webkit-font-smoothing:antialiased;">
    <table align="center" cellpadding="0" cellspacing="0" width="100%" style="background:#f9f9f9;padding:40px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #eee;">
            <tr>
              <td align="center" style="padding:30px 0 16px;">
                <img src="${LOGO_URL}" alt="Bolaji Editions" width="120" style="display:block;margin:0 auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 40px;">
                <h2 style="font-family:'Georgia','Times New Roman',serif;font-weight:400;color:#111;font-size:22px;margin:0 0 20px;">
                  ${title}
                </h2>
                <div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#333;">
                  ${body}
                </div>
                ${
                  actions && actions.length
                    ? `<div style="text-align:center;margin-top:28px;">
                        ${actions
                          .map(
                            (a) => `
                            <a href="${a.url}" 
                               style="background:#6C63FF;color:#fff;text-decoration:none;padding:12px 28px;
                                      border-radius:6px;font-weight:500;font-size:14px;margin:0 8px;
                                      font-family:Inter,Arial,sans-serif;display:inline-block;">
                              ${a.label}
                            </a>`,
                          )
                          .join("")}
                      </div>`
                    : ""
                }
              </td>
            </tr>
          </table>
          <p style="font-family:Inter,Arial,sans-serif;color:#999;font-size:12px;margin-top:24px;">
            © ${new Date().getFullYear()} Bolaji Editions — Internal notification only.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

export const adminEmailTemplates: {
  [K in AdminEmailType]: (content: AdminEmailContent[K]) => string;
} = {
  [AdminEmailType.WAITLIST_PREORDER_RELEASE_SUMMARY]: ({
    totalSent,
    totalFailed,
  }) =>
    wrapAdmin(
      "📬 Waitlist Preorder Release Summary",
      `
      <p><b>Emails Sent:</b> ${totalSent}</p>
      <p><b>Failed Sends:</b> ${totalFailed}</p>
      <p>The attached report contains detailed results.</p>
      `,
    ),

  [AdminEmailType.NEW_USER]: ({ name, email, address }) =>
    wrapAdmin(
      "👤 New User Registered",
      `
      <p><b>Name:</b> ${name}</p>
      <p><b>Email:</b> ${email}</p>
      ${renderAddress(address)}
      `,
    ),

  [AdminEmailType.NEW_PREORDER]: ({
    name,
    email,
    plan,
    editionCode,
    amount,
    address,
    quantity = 1,
  }) =>
    wrapAdmin(
      "🧾 New Preorder Placed",
      `
      <p><b>User:</b> ${name} (${email})</p>
      <p><b>Edition:</b> ${editionCode}</p>
      <p><b>Plan:</b> ${plan}</p>
      <p><b>Amount:</b> ${amount}</p>
      <p><b>Quantity:</b> ${quantity}</p>
      ${renderAddress(address)}
      `,
    ),

  [AdminEmailType.SUBSCRIPTION_STARTED]: ({
    name,
    email,
    plan,
    periodStart,
    periodEnd,
  }) =>
    wrapAdmin(
      "💳 New Subscription Started",
      `
      <p><b>User:</b> ${name} (${email})</p>
      <p><b>Plan:</b> ${plan}</p>
      <p><b>Period:</b> ${formatDate(periodStart)} → ${formatDate(periodEnd)}</p>
      `,
    ),

  // 🆕 Subscription Renewed
  [AdminEmailType.SUBSCRIPTION_RENEWED]: ({
    name,
    email,
    plan,
    renewedAt,
    nextPeriodEnd,
  }) =>
    wrapAdmin(
      "🔁 Subscription Renewed",
      `
      <p><b>User:</b> ${name} (${email})</p>
      <p><b>Plan:</b> ${plan}</p>
      <p><b>Renewed At:</b> ${formatDate(renewedAt)}</p>
      <p><b>Next Period Ends:</b> ${formatDate(nextPeriodEnd)}</p>
      <p>The user's subscription has been renewed successfully and billing is complete.</p>
      `,
    ),

  [AdminEmailType.SUBSCRIPTION_CANCELED]: ({ name, email, plan, canceledAt }) =>
    wrapAdmin(
      "⛔ Subscription Canceled",
      `
      <p><b>User:</b> ${name} (${email})</p>
      <p><b>Plan:</b> ${plan}</p>
      <p><b>Canceled At:</b> ${formatDate(canceledAt)}</p>
      `,
    ),

  [AdminEmailType.SUBSCRIPTION_PAUSED]: ({
    name,
    email,
    plan,
    pausedAt,
    resumeAt,
  }) =>
    wrapAdmin(
      "⏸️ Subscription Paused",
      `
      <p><b>User:</b> ${name} (${email})</p>
      <p><b>Plan:</b> ${plan}</p>
      <p><b>Paused At:</b> ${formatDate(pausedAt)}</p>
      ${
        resumeAt
          ? `<p><b>Scheduled Resume:</b> ${formatDate(resumeAt)}</p>`
          : "<p><i>No resume date set.</i></p>"
      }
      <p>Billing is on hold until the subscription is resumed.</p>
      `,
    ),

  [AdminEmailType.SUBSCRIPTION_RESUMED]: ({
    name,
    email,
    plan,
    resumedAt,
  }) =>
    wrapAdmin(
      "▶️ Subscription Resumed",
      `
      <p><b>User:</b> ${name} (${email})</p>
      <p><b>Plan:</b> ${plan}</p>
      <p><b>Resumed At:</b> ${formatDate(resumedAt)}</p>
      <p>Renewal cycles and edition access are now active again.</p>
      `,
    ),

  [AdminEmailType.SUPPORT_TICKET_CREATED]: ({
    name,
    email,
    subject,
    category,
    ticketId,
  }) =>
    wrapAdmin(
      "💬 New Support Ticket",
      `
      <p><b>User:</b> ${name} (${email})</p>
      <p><b>Subject:</b> ${subject}</p>
      <p><b>Category:</b> ${category}</p>
      <p><b>Ticket ID:</b> ${ticketId}</p>
      `,
    ),

  // 🆕 Publish / Add Edition
  [AdminEmailType.EDITION_PUBLISH_REQUEST]: ({
    editionCode,
    editionTitle,
    editionId,
    totalPreorders,
  }) =>
    wrapAdmin(
      `📖 Edition ${editionCode} Ready for Publishing`,
      `
      <p><b>Edition:</b> ${editionTitle} (${editionCode})</p>
      <p><b>Total Preorders:</b> ${totalPreorders}</p>
      <p>This edition is ready to be published. You can either publish it to make it available for subscribers, or add a new edition to continue the cycle.</p>
      `,
    ),
  [AdminEmailType.SUBSCRIBER_DAILY_DIGEST]: ({ timeOfDay }) =>
    wrapAdmin(
      `📊 ${timeOfDay === "night" ? "Evening" : "Morning"} Subscriber Digest`,
      `
      <p>This is your ${timeOfDay} subscriber digest for <b>${new Date().toDateString()}</b>.</p>
      <p>The attached report includes active subscriptions, edition coverage, and expiration periods.</p>
    `,
    ),
};

export const adminEmailSubjects: Record<AdminEmailType, string> = {
  [AdminEmailType.NEW_USER]: "👤 New User Registered",
  [AdminEmailType.NEW_PREORDER]: "🧾 New Preorder Placed",
  [AdminEmailType.SUBSCRIPTION_STARTED]: "💳 New Subscription Started",
  [AdminEmailType.SUBSCRIPTION_RENEWED]: "🔁 Subscription Renewed", // 👈 NEW
  [AdminEmailType.SUBSCRIPTION_CANCELED]: "⛔ Subscription Canceled",
  [AdminEmailType.SUBSCRIPTION_PAUSED]: "⏸️ Subscription Paused",
  [AdminEmailType.SUBSCRIPTION_RESUMED]: "▶️ Subscription Resumed",
  [AdminEmailType.SUPPORT_TICKET_CREATED]: "💬 New Support Ticket Created",
  [AdminEmailType.SUBSCRIBER_DAILY_DIGEST]: "Daily Subscriber Report",
  [AdminEmailType.WAITLIST_PREORDER_RELEASE_SUMMARY]:
    "Bolaji Editions — Waitlist Preorder Release Summary",
  [AdminEmailType.EDITION_PUBLISH_REQUEST]: "📖 Edition Ready for Publishing",
};
