import { PlanType } from "@/generated/prisma/enums";

export enum EmailType {
  REGISTER = "REGISTER",
  PREORDER_CONFIRMATION = "PREORDER_CONFIRMATION",
  PAYMENT_FAILED = "PAYMENT_FAILED",
  PASSWORD_RESET = "PASSWORD_RESET",
  SUBSCRIPTION_RENEWED = "SUBSCRIPTION_RENEWED",
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
}

export const templates: {
  [K in EmailType]: (content: EmailContentMap[K]) => string;
} = {
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
};
