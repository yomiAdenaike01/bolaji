import { PlanType } from "@/generated/prisma/enums";
import { EmailType, EmailContentMap } from "./email-types";
const LOGO_URL =
  "https://static.wixstatic.com/media/7ec957_cdb075d0cbbe459ebbb49f125106e1fb~mv2.png/v1/fill/w_99,h_66,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/Ade_Logo_Black.png";

const renderPassword = (password: string) => {
  return `<div style="margin-top:24px;background:#f5f5f5;padding:16px;border-radius:8px;text-align:center;">
        <p style="font-family:Inter,Arial,sans-serif;color:#333;font-size:14px;margin-bottom:8px;">
          Your temporary password:
        </p>
        <div style="display:inline-block;background:#111;color:#fff;padding:10px 20px;border-radius:6px;font-weight:600;font-size:16px;letter-spacing:1px;">
          ${password}
        </div>
         <p style="font-family:Inter,Arial,sans-serif;color:#666;font-size:13px;margin-top:20px;line-height:1.5;">
        You can change this password anytime from your account settings after signing in.
      </p>
      </div>`;
};

const wrap = (title: string, body: string) => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f9f9f9;-webkit-font-smoothing:antialiased;">
    <table align="center" cellpadding="0" cellspacing="0" width="100%" style="background:#f9f9f9;padding:40px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #eee;">
            <!-- Header with logo -->
            <tr>
              <td align="center" style="padding:40px 0 20px 0;">
                <img src="${LOGO_URL}" alt="Bolaji Editions" width="120" height="auto" style="display:block;margin:0 auto;" />
              </td>
            </tr>
            <!-- Subheading -->
            <tr>
              <td style="padding:0 40px 20px;text-align:center;">
                <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,Arial,sans-serif;color:#777;font-size:14px;margin:0;">
                  ${title}
                </p>
              </td>
            </tr>
            <!-- Main content -->
            <tr>
              <td style="padding:0 40px 40px;">
                ${body}
              </td>
            </tr>
          </table>
          <p style="font-family:Inter,Arial,sans-serif;color:#999;font-size:12px;margin-top:24px;">
            © ${new Date().getFullYear()} Bolaji Editions — all rights reserved.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

export const templates: {
  [K in EmailType]: (content: EmailContentMap[K]) => string;
} = {
  [EmailType.SUBSCRIPTION_FAILED_TO_START]: ({
    name,
    plan,
    reason,
    retryLink,
  }) =>
    wrap(
      "We couldn’t start your subscription",
      `
      <h2 style="font-family:'Georgia','Times New Roman',serif;color:#111;font-weight:400;font-size:22px;margin-bottom:18px;">
        Hi ${name.split(" ")[0]},
      </h2>

      <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin-bottom:16px;">
        Unfortunately, your payment for the <strong>${plan}</strong> subscription didn’t go through, 
        so your subscription couldn’t be activated. You can use the same details as before to re-subscribe
      </p>

      ${
        reason
          ? `<p style="font-family:Inter,Arial,sans-serif;color:#555;font-size:14px;margin-bottom:16px;">
               Reason: ${reason}
             </p>`
          : ""
      }

      ${
        retryLink
          ? `<div style="text-align:center;margin:32px 0;">
               <a href="${retryLink}"
                  style="background:#6C63FF;color:#fff;text-decoration:none;
                         padding:14px 32px;border-radius:6px;
                         font-family:Inter,Arial,sans-serif;font-size:15px;
                         display:inline-block;font-weight:500;">
                 Retry Subscription →
               </a>
             </div>`
          : ""
      }

      <p style="font-family:Inter,Arial,sans-serif;color:#444;font-size:14px;line-height:1.6;">
        Don’t worry — your account is still active. You can restart your subscription anytime 
        by updating your payment method and completing checkout again.
      </p>

      <p style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#777;margin-top:16px;">
        With appreciation,<br><strong>The Bolaji&nbsp;Editions Team</strong>
      </p>
    `,
    ),
  [EmailType.PREORDER_PAYMENT_FAILED]: ({
    name,
    editionCode,
    plan,
    reason,
    retryLink,
  }) =>
    wrap(
      "Your Preorder Payment Didn’t Go Through",
      `
      <h2 style="font-family:'Georgia','Times New Roman',serif;color:#111;font-weight:400;font-size:22px;margin-bottom:18px;">
        Hi ${name.split(" ")[0]},
      </h2>
      <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin-bottom:16px;">
        We weren’t able to process your preorder payment for
        <strong>Bolaji Edition&nbsp;${editionCode}</strong>
        (${plan === PlanType.FULL ? "Full" : plan} Plan).
      </p>
      ${
        reason
          ? `<p style="font-family:Inter,Arial,sans-serif;color:#555;font-size:14px;margin-bottom:16px;">Reason: ${reason}</p>`
          : ""
      }
      ${
        retryLink
          ? `<div style="text-align:center;margin:32px 0;">
              <a href="${retryLink}"
                 style="background:#6C63FF;color:#fff;text-decoration:none;
                        padding:14px 32px;border-radius:6px;font-family:Inter,Arial,sans-serif;
                        font-size:15px;display:inline-block;font-weight:500;">
                Retry Payment →
              </a>
             </div>`
          : ""
      }
      <p style="font-family:Inter,Arial,sans-serif;color:#444;font-size:14px;line-height:1.6;">
        Don’t worry — your preorder spot remains reserved temporarily.
        Please complete the payment within 24&nbsp;hours to secure your copy of Edition&nbsp;${editionCode}.
      </p>
      <p style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#777;margin-top:16px;">
        With appreciation,<br><strong>The Bolaji&nbsp;Editions Team</strong>
      </p>
    `,
    ),

  [EmailType.NEW_EDITION_RELEASED]: ({
    name,
    editionTitle,
    editionCode,
    editionLink,
  }) =>
    wrap(
      ` ${editionTitle} — Now Available`,
      `
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px 0;color:#333;">
      Hi ${name.split(" ")[0]},<br /><br />
      We’re excited to share that <strong>${editionTitle}</strong> (${editionCode})
      has officially launched!<br /><br />
      This new release continues Bolaji’s mission of celebrating artistry,
      craftsmanship, and culture — available now in both digital and physical formats.
    </p>

    <div style="text-align:center;margin:32px 0;">
      <a href="${editionLink}" 
        style="background-color:#6b21a8;color:#ffffff;text-decoration:none;
               padding:14px 32px;border-radius:8px;font-weight:600;
               display:inline-block;font-size:15px;">
        View Edition ${editionCode}
      </a>
    </div>

    <p style="font-size:15px;line-height:1.6;color:#444;">
      Thank you for being part of the Bolaji Editions journey. We can’t wait
      for you to experience this new chapter.
    </p>

    <p style="font-size:14px;color:#777;">
      — The Bolaji Editions Team
    </p>
  `,
    ),
  [EmailType.PREORDER_RELEASED]: ({ name, preorderLink, password }) =>
    wrap(
      "Edition 00 — Private Access Now Open",
      `
    <h2 style="font-family:'Georgia','Times New Roman',serif;font-weight:400;color:#111;font-size:22px;margin:0 0 20px 0;">
      Edition 00 — Private Access Now Open
    </h2>

    <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin:0 0 18px;">
      Hi ${name.split(" ")[0]},<br><br>
      We’re excited to invite you to reserve <strong>Bolaji Edition&nbsp;00</strong> — 
      the inaugural release in our ongoing exploration of art, form, and design.<br><br>
      As part of our waitlist community, you have <b>exclusive early access</b> before the public release.
      This private access is protected by a password.
    </p>

    <div style="text-align:center;margin:28px 0;">
      <p style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#555;margin-bottom:8px;">
        Use the password below to enter the private preorder portal:
      </p>
      <div style="display:inline-block;background:#111;color:#fff;padding:12px 24px;
                  border-radius:8px;font-weight:600;letter-spacing:1.2px;font-size:16px;
                  font-family:Inter,Arial,sans-serif;">
        ${password}
      </div>
    </div>

    <div style="text-align:center;margin:32px 0;">
      <a href="${preorderLink}" 
         style="background:#6C63FF;color:#fff;text-decoration:none;
                padding:14px 32px;border-radius:6px;font-family:Inter,Arial,sans-serif;
                font-size:15px;display:inline-block;font-weight:500;">
         Enter Private Access Page →
      </a>
    </div>

    <p style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#444;line-height:1.6;margin:0 0 14px;">
      Each edition celebrates creative craftsmanship across digital and physical mediums. 
      Secure your copy today — limited quantities available.
    </p>

    <p style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#777;margin:12px 0 0;">
      With gratitude,<br><strong>The Bolaji&nbsp;Editions Team</strong>
    </p>
  `,
    ),

  [EmailType.REGISTER]: ({ name, email, password }) => {
    // 🧩 If password isn’t provided, generate one

    return wrap(
      "Welcome to Bolaji Editions",
      `
      <h2 style="font-family:'Georgia','Times New Roman',serif;color:#111;font-weight:400;font-size:22px;margin-bottom:18px;">
        Welcome${name ? `, ${name}` : ""}!
      </h2>

      <p style="font-family:Inter,Arial,sans-serif;color:#222;font-size:15px;line-height:1.7;margin:0 0 10px;">
        Your account <strong>${email}</strong> has been successfully created.
      </p>

      <p style="font-family:Inter,Arial,sans-serif;color:#444;font-size:14px;line-height:1.6;">
        Begin exploring exclusive editions, creative insights, and limited works by contemporary artists.
      </p>

      ${password ? renderPassword(password) : ""}
    `,
    );
  },

  [EmailType.PREORDER_CONFIRMATION]: ({ name, editionCode, plan }) =>
    wrap(
      "Your Preorder is Confirmed",
      `
      <h2 style="font-family:'Georgia','Times New Roman',serif;color:#111;font-weight:400;font-size:22px;margin-bottom:20px;">
        Thank you, ${name.split(" ")[0]}!
      </h2>
      <p style="font-family:Inter,Arial,sans-serif;color:#222;font-size:15px;line-height:1.7;margin:0 0 12px;">
        Your preorder for <strong>Bolaji Edition&nbsp;${editionCode}</strong> is now confirmed.
      </p>
      <p style="font-family:Inter,Arial,sans-serif;color:#555;font-size:14px;line-height:1.6;">
        ${
          plan === PlanType.DIGITAL
            ? `You’ll receive an email when the digital edition releases.`
            : `We’ll notify you when your physical edition is prepared for shipment.`
        }
      </p>
      <p style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#777;margin-top:16px;">
        — The Bolaji&nbsp;Editions Team
      </p>
    `,
    ),

  [EmailType.PAYMENT_FAILED]: ({ name, reason }) =>
    wrap(
      "Payment Issue",
      `
      <h2 style="font-family:'Georgia','Times New Roman',serif;color:#111;font-weight:400;font-size:22px;margin-bottom:16px;">
        Hello ${name.split(" ")[0]},
      </h2>
      <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin-bottom:14px;">
        We couldn’t process your most recent payment.
      </p>
      ${
        reason
          ? `<p style="font-family:Inter,Arial,sans-serif;color:#555;font-size:14px;">Reason: ${reason}</p>`
          : ""
      }
      <p style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#444;">
        Please update your payment details to ensure continued access to your subscription.
      </p>
    `,
    ),

  [EmailType.PASSWORD_RESET]: ({ name, resetLink }) =>
    wrap(
      "Reset Your Password",
      `
      <h2 style="font-family:'Georgia','Times New Roman',serif;color:#111;font-weight:400;font-size:22px;margin-bottom:16px;">
        Hi ${name.split(" ")[0]},
      </h2>
      <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin-bottom:18px;">
        We received a request to reset your password. If this was you, click the button below:
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${resetLink}" 
           style="background:#111;color:#fff;text-decoration:none;padding:14px 28px;border-radius:6px;font-size:15px;font-family:Inter,Arial,sans-serif;font-weight:500;">
           Reset Password
        </a>
      </div>
      <p style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#777;margin-top:10px;">
        If you didn’t request this, you can safely ignore this email.
      </p>
    `,
    ),
  [EmailType.SUBSCRIPTION_STARTED]: ({ name, planType, nextEdition }) =>
    wrap(
      "Your Subscription Has Begun",
      `
      <h2 style="font-family:'Georgia','Times New Roman',serif;color:#111;font-weight:400;font-size:22px;margin-bottom:20px;">
        Welcome back, ${name.split(" ")[0]}!
      </h2>

      <p style="font-family:Inter,Arial,sans-serif;color:#222;font-size:15px;line-height:1.7;margin:0 0 14px;">
        Your Bolaji Editions <strong>${planType}</strong> subscription is now active.
      </p>

      <p style="font-family:Inter,Arial,sans-serif;color:#444;font-size:14px;line-height:1.6;margin:0 0 20px;">
        You’ll automatically receive each new Edition as it’s released — 
        starting with <strong>Edition&nbsp;${nextEdition}</strong>.
        ${
          planType === PlanType.DIGITAL
            ? "Your digital editions will appear in your account as soon as they’re published."
            : "Your physical editions will be prepared and shipped upon each release."
        }
      </p>

      <div style="text-align:center;margin:32px 0;">
        <a href="https://bolajieditions.com/account" 
           style="background:#6C63FF;color:#fff;text-decoration:none;
                  padding:14px 32px;border-radius:6px;
                  font-family:Inter,Arial,sans-serif;
                  font-size:15px;display:inline-block;font-weight:500;">
           View Your Editions →
        </a>
      </div>

      <p style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#555;line-height:1.6;margin:0 0 16px;">
        We’re thrilled to have you on this journey. Each month, your subscription supports
        independent artists and creative craftsmanship.
      </p>

      <p style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#777;margin-top:16px;">
        With appreciation,<br><strong>The Bolaji&nbsp;Editions Team</strong>
      </p>
    `,
    ),

  [EmailType.SUBSCRIPTION_RENEWED]: ({ name, nextEdition }) =>
    wrap(
      "Subscription Renewed",
      `
      <h2 style="font-family:'Georgia','Times New Roman',serif;color:#111;font-weight:400;font-size:22px;margin-bottom:16px;">
        Hi ${name.split(" ")[0]},
      </h2>
      <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin-bottom:14px;">
        Your Bolaji Editions subscription has been renewed successfully.
      </p>
      <p style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#555;margin-bottom:12px;">
        Next up: <strong>Edition&nbsp;${nextEdition}</strong> — we’ll notify you when it’s released.
      </p>
      <p style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#777;margin-top:18px;">
        Thank you for being part of our creative community.
      </p>
    `,
    ),
};

export const subjects: Record<EmailType, string> = {
  [EmailType.REGISTER]: "Welcome to Bolaji Editions — your account is ready!",
  [EmailType.PREORDER_CONFIRMATION]: "Your Edition preorder is confirmed!",
  [EmailType.PAYMENT_FAILED]: "Payment issue — please update your details",
  [EmailType.PASSWORD_RESET]: "Reset your Bolaji Editions password",
  [EmailType.SUBSCRIPTION_RENEWED]:
    "Your Bolaji Editions subscription has renewed",
  [EmailType.PREORDER_RELEASED]: "Edition 00 — Preorders Now Open",
  [EmailType.PREORDER_PAYMENT_FAILED]:
    "Your preorder payment didn’t go through — retry now",
  [EmailType.NEW_EDITION_RELEASED]:
    "A new Bolaji Edition has arrived — explore now!",
  [EmailType.SUBSCRIPTION_STARTED]:
    "Your Bolaji Editions subscription is now active!",
  [EmailType.SUBSCRIPTION_FAILED_TO_START]:
    "We couldn’t start your subscription — please retry",
};
