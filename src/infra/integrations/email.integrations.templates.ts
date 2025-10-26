import { PlanType } from "@/generated/prisma/enums";

export enum EmailType {
  REGISTER = "REGISTER",
  PREORDER_CONFIRMATION = "PREORDER_CONFIRMATION",
  PAYMENT_FAILED = "PAYMENT_FAILED",
  PASSWORD_RESET = "PASSWORD_RESET",
  SUBSCRIPTION_RENEWED = "SUBSCRIPTION_RENEWED",
  PREORDER_RELEASED = "PREORDER_RELEASED",
}

export interface EmailContentMap {
  [EmailType.REGISTER]: {
    name: string;
    email: string;
  };
  [EmailType.PREORDER_CONFIRMATION]: {
    name: string;
    email: string;
    editionCode: string;
    plan: PlanType;
  };
  [EmailType.PAYMENT_FAILED]: {
    name: string;
    email: string;
    reason?: string;
  };
  [EmailType.PASSWORD_RESET]: {
    name: string;
    email: string;
    resetLink: string;
  };
  [EmailType.SUBSCRIPTION_RENEWED]: {
    name: string;
    email: string;
    nextEdition: string;
  };
  [EmailType.PREORDER_RELEASED]: {
    name: string;
    preorderLink: string;
  };
}

export const templates: {
  [K in EmailType]: (content: EmailContentMap[K]) => string;
} = {
  [EmailType.PREORDER_RELEASED]: ({ name, preorderLink }) => {
    return `<table align="center" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.05);">
      <tr>
        <td style="padding: 40px 40px 30px;">
          <h2 style="font-size: 24px; margin-bottom: 12px; color: #3b1e5e;">Edition 00 — Pre-Orders Now Open</h2>
          <p style="font-size: 16px; line-height: 1.6; margin: 0;">
            Hi ${name.split(" ")[0]},<br /><br />
            We’re thrilled to invite you to be among the first to experience 
            <strong>Bolaji Edition 00</strong>. As a valued member of our waitlist, 
            you have exclusive early access to preorder before the public release.
          </p>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding: 20px;">
          <a href="${preorderLink}" 
             style="background-color: #6b21a8; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; display: inline-block;">
             Pre-Order Edition 00 Now
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 40px 40px;">
          <p style="font-size: 15px; line-height: 1.6; color: #444;">
            Each edition celebrates creativity, craft, and community — 
            available in both digital and physical formats. 
            Secure your copy today before this limited release sells out.
          </p>
          <p style="font-size: 14px; color: #777;">
            Thank you for being part of our journey.<br />
            <strong>The Bolaji Editions Team</strong>
          </p>
        </td>
      </tr>
    </table>`;
  },
  [EmailType.REGISTER]: ({ name, email }) => `
    <h2>Welcome${name ? `, ${name}` : ""}!</h2>
    <p>Your account (${email}) has been successfully created.</p>
    <p>Start exploring exclusive Bolaji Editions now.</p>
  `,

  [EmailType.PREORDER_CONFIRMATION]: ({ name, editionCode, plan }) => `
    <h2>Thank you, ${name}!</h2>
    <p>Your preorder for <strong>Bolaji Edition ${editionCode}</strong> is confirmed.</p>
    <p> The edition will be avaliable on the website soon. ${plan === PlanType.DIGITAL ? "" : "We’ll notify you when your physicall copy is shipped."}</p>
  `,

  [EmailType.PAYMENT_FAILED]: ({ name, reason }) => `
    <h2>Hello ${name},</h2>
    <p>We couldn’t process your latest payment.</p>
    ${reason ? `<p>Reason: ${reason}</p>` : ""}
    <p>Please update your payment details to continue your subscription.</p>
  `,

  [EmailType.PASSWORD_RESET]: ({ name, resetLink }) => `
    <h2>Hello ${name},</h2>
    <p>We received a request to reset your password.</p>
    <p><a href="${resetLink}">Click here to reset your password</a></p>
    <p>If you didn’t request this, you can safely ignore this email.</p>
  `,

  [EmailType.SUBSCRIPTION_RENEWED]: ({ name, nextEdition }) => `
    <h2>Hi ${name},</h2>
    <p>Your Bolaji Editions subscription has been renewed successfully.</p>
    <p>Next up: <strong>Edition ${nextEdition}</strong>.</p>
    <p>We’ll send you a reminder when it’s ready.</p>
  `,
};

export const subjects: Record<EmailType, string> = {
  [EmailType.REGISTER]: "Welcome to Bolaji Editions — your account is ready!",
  [EmailType.PREORDER_CONFIRMATION]: "Your Edition preorder is confirmed!",
  [EmailType.PAYMENT_FAILED]: "Payment issue — please update your details",
  [EmailType.PASSWORD_RESET]: "Reset your Bolaji Editions password",
  [EmailType.SUBSCRIPTION_RENEWED]:
    "Your Bolaji Editions subscription has renewed",
  [EmailType.PREORDER_RELEASED]:
    "Edition 00 has arrived — your preorder is ready!",
};
