import { PlanType } from "@/generated/prisma/enums";
import { EmailType, EmailContentMap } from "./email-types";
import { format } from "date-fns";
import { EDITION_00_RELEASE } from "@/constants";
import { getPreorderReleaseContent } from "./email-templates/preorder-rekease";
import { wrap } from "./email-templates/email-wrapper";

const formatDate = (date: Date | string | number) => {
  const day = format(date, "d"); // day number without leading zero
  const month = format(date, "MMMM"); // full month name

  // Compute ordinal suffix
  const dayNum = parseInt(day, 10);
  const suffix =
    dayNum % 10 === 1 && dayNum !== 11
      ? "st"
      : dayNum % 10 === 2 && dayNum !== 12
        ? "nd"
        : dayNum % 10 === 3 && dayNum !== 13
          ? "rd"
          : "th";

  return `${day}${suffix} ${month}`;
};

const defaultPasswordSubtitle =
  "You can change this password anytime from your account settings after signing in.";

const renderPassword = (password: string, subtitle?: string) => {
  return `<div style="margin-top:24px;background:#f5f5f5;padding:16px;border-radius:8px;text-align:center;">
        <p style="font-family:Inter,Arial,sans-serif;color:#333;font-size:14px;margin-bottom:8px;">
          Your password:
        </p>
        <div style="display:inline-block;background:#111;color:#fff;padding:10px 20px;border-radius:6px;font-weight:600;font-size:16px;letter-spacing:1px;">
          ${password}
        </div>
         <p style="font-family:Inter,Arial,sans-serif;color:#666;font-size:13px;margin-top:20px;line-height:1.5;">
        ${subtitle || defaultPasswordSubtitle}
      </p>
      </div>`;
};

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

  [EmailType.NEW_EDITION_RELEASED]: ({ name, editionTitle, editionCode }) =>
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

    <p style="font-size:15px;line-height:1.6;color:#444;">
      Thank you for being part of the Bolaji Editions journey. We can’t wait
      for you to experience this new chapter.
    </p>

    <p style="font-size:14px;color:#777;">
      — The Bolaji Editions Team
    </p>
  `,
    ),
  [EmailType.PREORDER_RELEASED]: getPreorderReleaseContent,
  [EmailType.PREORDER_RELEASED_REMINDER]: getPreorderReleaseContent,
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

  [EmailType.PREORDER_CONFIRMATION]: ({
    name,
    editionCode,
    plan,
    newPassword,
  }) =>
    wrap(
      "Your Preorder is Confirmed",
      `
    <h2 style="font-family:'Georgia','Times New Roman',serif;color:#111;font-weight:400;font-size:22px;margin-bottom:20px;">
      Thank you, ${name.split(" ")[0]}!
    </h2>

    <p style="font-family:Inter,Arial,sans-serif;color:#222;font-size:15px;line-height:1.7;margin:0 0 12px;">
      Your preorder for <strong>Bolaji Edition&nbsp;${editionCode}</strong> is now confirmed.
    </p>

    <p style="font-family:Inter,Arial,sans-serif;color:#555;font-size:14px;line-height:1.6;margin:0 0 16px;">
      ${
        plan === PlanType.DIGITAL
          ? `You’ll receive an email as soon as the digital edition releases.`
          : `We’ll notify you when your physical edition is being prepared for shipment.`
      }
    </p>

    ${newPassword ? renderPassword(newPassword, `You'll be able to login from <strong>${formatDate(EDITION_00_RELEASE)}</strong>. ${defaultPasswordSubtitle}`) : ""}

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
  // TODO: Update if edition 1 isn't out yet, then it should say the subscription will be active from the 1st December
  [EmailType.SUBSCRIPTION_STARTED]: ({
    name,
    planType,
    nextEdition,
    newPassword,
    isPrerelease = false,
  }) => {
    return wrap(
      "Your Subscription Has Begun",
      `
    <h2 style="font-family:'Georgia','Times New Roman',serif;color:#111;font-weight:400;font-size:22px;margin-bottom:20px;">
      Welcome back, ${name.split(" ")[0]}!
    </h2>

    <p style="font-family:Inter,Arial,sans-serif;color:#222;font-size:15px;line-height:1.7;margin:0 0 14px;">
      Your Bolaji Editions <strong>${planType}</strong> subscription ${
        isPrerelease ? "will be active from the 1st December" : "is now active"
      }. ${
        isPrerelease
          ? planType !== PlanType.DIGITAL
            ? "Edition 01 releases on 1st December."
            : `You will receive your first edition in <strong>December</strong> along with an email notifying you of its release.`
          : ""
      }
      Every month, a new edition is released, and a notification will appear in your account as soon as they are published.
      Your full access will begin from the 1st December with Edition ${nextEdition}.
    </p>

    <p style="font-family:Inter,Arial,sans-serif;color:#444;font-size:14px;line-height:1.6;margin:0 0 20px;">
      You’ll automatically receive each new Edition as it’s released every month.
      ${
        planType === PlanType.DIGITAL || planType === PlanType.FULL
          ? "Your digital editions will appear in your account as soon as they’re published."
          : ""
      }
      ${planType === PlanType.FULL || planType === PlanType.PHYSICAL ? "You will be notified when your edition has been released for shipping" : ""} 
    </p>

    ${newPassword ? renderPassword(newPassword, isPrerelease ? `You'll be able to login from <strong>1st December</strong>. ${defaultPasswordSubtitle}` : "") : ""}

    <p style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#555;line-height:1.6;margin:0 0 16px;">
      We’re thrilled to have you on this journey. Each month, your subscription supports
      independent artists and creative craftsmanship.
      ${
        planType === PlanType.DIGITAL
          ? "Please remember to use your username and unique password anytime you want to access your digital subscription."
          : ""
      }
    </p>

    <p style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#777;margin-top:16px;">
      With appreciation,<br><strong>The Bolaji&nbsp;Editions Team</strong>
    </p>
  `,
    );
  },

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
  [EmailType.EDITION_00_DIGITAL_RELEASE]: ({
    name,
    subscribeLink,
    resetPasswordLink,
    planType,
  }) =>
    wrap(
      `${planType !== PlanType.PHYSICAL ? "Bolaji Editions 0.0 Is Now Live" : "Bolaji Editions is now launched"} `,
      `
    <h1 style="font-family:'Georgia','Times New Roman',serif;font-weight:400;font-size:28px;margin-bottom:18px;color:#111;text-align:center;">
      ${planType === PlanType.PHYSICAL ? "Bolaji Editions has officially launched" : "Welcome, Your Digital Experience Begins Now"} 
    </h1>

    <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin-bottom:18px;">
      Hi ${name.split(" ")[0]},
    </p>

    <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin-bottom:18px;">
      ${planType !== PlanType.PHYSICAL ? `We’re delighted to let you know that your access to <strong>Bolaji&nbsp;Editions&nbsp;0.0</strong> is now live and ready to explore. You will need to go <a href='${resetPasswordLink}'>here</a> to reset your password. ${planType === PlanType.FULL ? "You will also be notified when your edition is on it's way." : ""}` : "We’re delighted to let you know that <strong>Bolaji&nbsp;Editions&nbsp;0.0</strong> is now released, you will be notified when your edition is on it's way."}
    </p>

    <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin-bottom:18px;">
      This inaugural edition marks the beginning of something entirely new a monthly art publication blending physical and digital form, straight from the studio of multidisciplinary artist <strong>Adébayo&nbsp;Bolaji</strong>.
    </p>

    <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin-bottom:18px;">
      If you’ve already subscribed to the ongoing series, <strong>Edition&nbsp;01</strong> will unlock on <strong>1&nbsp;December</strong>.
    </p>

    <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin-bottom:24px;">
      If you haven’t subscribed yet, we’d love for you to continue the journey. Discover what’s next in this first-of-its-kind monthly publication rich with artwork, writings, film, music, interviews and more.
    </p>

    <div style="text-align:center;margin-top:36px;">
      ${
        subscribeLink
          ? `<a href="${subscribeLink}" style="display:inline-block;background:#F1F0FF;color:#111 !important;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:500;font-family:Inter,Arial,sans-serif;margin-left:8px;">
              Subscribe for Ongoing Editions
            </a>`
          : ""
      }
    </div>
    `,
    ),
};

export const subjects: Record<EmailType, string> = {
  [EmailType.EDITION_00_DIGITAL_RELEASE]:
    "Your Access to Bolaji Editions 0.0 Is Now Live",
  [EmailType.REGISTER]: "Welcome to Bolaji Editions — your account is ready!",
  [EmailType.PREORDER_CONFIRMATION]: "Your Edition preorder is confirmed!",
  [EmailType.PAYMENT_FAILED]: "Payment issue — please update your details",
  [EmailType.PASSWORD_RESET]: "Reset your Bolaji Editions password",
  [EmailType.SUBSCRIPTION_RENEWED]:
    "Your Bolaji Editions subscription has renewed",
  [EmailType.PREORDER_RELEASED]:
    "Bolaji Editions - You're one of the first, preorders now open. Only 48 hours to preorder",
  [EmailType.PREORDER_PAYMENT_FAILED]:
    "Your preorder payment didn’t go through — retry now",
  [EmailType.NEW_EDITION_RELEASED]:
    "A new Bolaji Edition has arrived — explore now!",
  [EmailType.SUBSCRIPTION_STARTED]:
    "Your Bolaji Editions subscription is now active!",
  [EmailType.SUBSCRIPTION_FAILED_TO_START]:
    "We couldn’t start your subscription — please retry",
  [EmailType.PREORDER_RELEASED_REMINDER]:
    "Bolaji Editions - You're one of the first, preorders now open. Only 24 hours to preorder",
};
