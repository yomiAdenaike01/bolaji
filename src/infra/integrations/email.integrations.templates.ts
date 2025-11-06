import { PlanType } from "@/generated/prisma/enums";
import { EmailType, EmailContentMap } from "./email-types";

const LOGO_URL = `${process.env.SERVER_URL}/images/logo.png`;

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
  [EmailType.PREORDER_RELEASED]: ({ name, preorderLink, password }) =>
    wrap(
      "Edition 00 — Private Access Now Open",
      `
  <!-- Hero Image -->
  <div style="text-align:center;margin-bottom:24px;">
    <img 
      src="https://framerusercontent.com/images/G2p7Ep8Gm07WQuiOpA2frgrrB0.jpg?scale-down-to=600&width=526&height=526"
      alt="Bolaji Editions — Edition 00"
      style="max-width:100%;height:auto;border-radius:8px;"
    />
  </div>

  <!-- Header -->
  <h2 style="font-family:'Georgia','Times New Roman',serif;font-weight:400;color:#111;font-size:22px;margin:0 0 16px 0;">
    You’re the First to Know
  </h2>

  <!-- Subheader -->
  <h3 style="font-family:'Georgia','Times New Roman',serif;font-weight:400;color:#444;font-size:18px;margin:0 0 24px 0;">
    Bolaji Editions begins here
  </h3>

  <!-- Intro -->
  <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin:0 0 20px;">
    Hi ${name.split(" ")[0]},<br><br>
    We’re excited to invite you to reserve <strong>Bolaji&nbsp;Edition&nbsp;00</strong> — the inaugural release
    in <strong>Bolaji’s ongoing exploration of art, form, and design.</strong><br><br>
    You’re receiving this as part of our <strong>waitlist community</strong>, meaning you’re one of the first to know:
  </p>

  <!-- Context -->
  <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin:0 0 18px;">
    <strong>Bolaji&nbsp;Editions</strong> is a new monthly art publication direct from the studio of multidisciplinary artist 
    <strong>Adébayo&nbsp;Bolaji</strong>.
  </p>

  <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin:0 0 18px;">
    <strong>Bolaji&nbsp;Editions</strong> is a <strong>12 part</strong> collectable art experience. Each edition is released monthly, forming a complete set over a year. Edition 00 is the special prelaunch limited edition from <strong>Today</strong>. The full ongoing Bolaji Editions subscription begins with the <strong>first</strong> Edition 01 starting in <strong>December 2025</strong>. 
  </p>

  <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin-bottom:18px;">
      Everyone can subscribe for the ongoing editions from the <strong>9th November - our launch day</strong>.
    </p>

  <!-- List -->
  <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin:0 0 18px;">
    Each month offers a singular, curated experience of:
  </p>
  <ul style="font-family:Inter,Arial,sans-serif;font-size:15px;color:#222;line-height:1.8;margin:0 0 20px 20px;padding:0;">
    <li>Poetic writings not published anywhere else</li>
    <li>QR-coded video content including performances, teachings, and interviews</li>
    <li>Short films, visual artworks, and exclusive sound</li>
    <li>Artistic encounters you won’t find on social media or streaming platforms</li>
  </ul>

  <!-- Edition Info -->
  <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin:0 0 20px;">
    The inaugural <strong>Edition&nbsp;00</strong> is a one-time-only print release limited to just <strong>300&nbsp;physical&nbsp;copies</strong>, also, there is a digital version
    and acts as the gateway into this world. It includes <em>Part&nbsp;One</em> of Bolaji’s new  <strong>“100&nbsp;People”</strong> short film 
   titled <strong>"What we reach for"</strong>, only viewable via this Edition.
  </p>

  <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin:0 0 20px;">
    This is early private access before subscriptions open publicly on <strong>November 9th</strong>. 
  </p>

  <!-- Password Block -->
  <div style="text-align:center;margin:32px 0;">
    <p style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#555;margin-bottom:8px;">
      Use the password below to enter the private preorder portal and secure your copy:
    </p>
    <div style="display:inline-block;background:#111;color:#fff;padding:12px 24px;
                border-radius:8px;font-weight:600;letter-spacing:1.2px;font-size:16px;
                font-family:Inter,Arial,sans-serif;">
      ${password}
    </div>
  </div>

  <!-- CTA -->
  <div style="text-align:center;margin:32px 0;">
    <a href="${preorderLink}" 
       style="background:#6C63FF;color:#fff;text-decoration:none;
              padding:14px 32px;border-radius:6px;font-family:Inter,Arial,sans-serif;
              font-size:15px;display:inline-block;font-weight:500;">
       Enter Private Access Page →
    </a>
  </div>

  <!-- Outro -->
  <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin:0 0 20px;">
    This is not just a magazine. It’s a living archive — an artist’s internal studio shared through paper, 
    performance, and poetic thought.<br><br>
    <strong>Secure your copy today.</strong> Only 300 available.
  </p>

  <!-- Signature -->
  <p style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#777;margin:20px 0 0;">
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

    ${
      newPassword
        ? `
        <div style="background:#F8F8F8;border-radius:8px;padding:16px 20px;margin:20px 0;">
          <p style="font-family:Inter,Arial,sans-serif;color:#111;font-size:15px;margin:0 0 6px;">
            An account has been created for you to manage your editions and access future releases.
          </p>
          <p style="font-family:Inter,Arial,sans-serif;color:#333;font-size:14px;margin:0;">
            <strong>Your account password:</strong>
            <span style="display:inline-block;background:#fff;border:1px solid #ddd;border-radius:6px;padding:6px 10px;font-family:monospace;font-size:14px;margin-left:6px;">
              ${newPassword}
            </span>
          </p>
          <p style="font-family:Inter,Arial,sans-serif;color:#666;font-size:13px;margin-top:8px;">
            You can change your password anytime from your account settings after logging in. Please note, you will not be able to access your preordered Digital Edition before it's release on <strong>9th Novemeber</strong>.
          </p>
        </div>
        `
        : ""
    }

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
    isPrerelease = false,
  }) =>
    wrap(
      "Your Subscription Has Begun",
      `
      <h2 style="font-family:'Georgia','Times New Roman',serif;color:#111;font-weight:400;font-size:22px;margin-bottom:20px;">
        Welcome back, ${name.split(" ")[0]}!
      </h2>

      <p style="font-family:Inter,Arial,sans-serif;color:#222;font-size:15px;line-height:1.7;margin:0 0 14px;">
        Your Bolaji Editions <strong>${planType}</strong> subscription ${isPrerelease ? "will be active from the 1st December" : "is now active"}. ${
          isPrerelease
            ? planType !== PlanType.DIGITAL
              ? "Edition 01 releases on 1st December"
              : `You will receive your first edition in <strong>December</strong> along with an email notifying you of it's release.`
            : ""
        }
        Every month, a new edition is released and a notification will appear in your account as soon as they are published. ${`Your full access will begin from the 1st December with Edition ${nextEdition}`}
      </p>

      <p style="font-family:Inter,Arial,sans-serif;color:#444;font-size:14px;line-height:1.6;margin:0 0 20px;">
        You’ll automatically receive each new Edition as it’s released every month.
        ${
          planType === PlanType.DIGITAL
            ? "Your digital editions will appear in your account as soon as they’re published."
            : ""
        }
      </p>

      <p style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#555;line-height:1.6;margin:0 0 16px;">
        We’re thrilled to have you on this journey. Each month, your subscription supports
        independent artists and creative craftsmanship. ${planType === PlanType.DIGITAL ? "Please remmeber to use your username and unique password anytime you want to access your digital subscription." : ""}
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
  [EmailType.EDITION_00_DIGITAL_RELEASE]: ({
    name,
    accessLink,
    subscribeLink,
  }) =>
    wrap(
      "Your Access to Bolaji Editions 0.0 Is Now Live",
      `
    <h1 style="font-family:'Georgia','Times New Roman',serif;font-weight:400;font-size:28px;margin-bottom:18px;color:#111;text-align:center;">
      Welcome — Your Digital Experience Begins Now
    </h1>

    <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin-bottom:18px;">
      Hi ${name.split(" ")[0]},
    </p>

    <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin-bottom:18px;">
      We’re delighted to let you know that your access to <strong>Bolaji&nbsp;Editions&nbsp;0.0</strong> is now live and ready to explore.
    </p>

    <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin-bottom:18px;">
      This inaugural edition marks the beginning of something entirely new — a monthly art publication blending physical and digital form, straight from the studio of multidisciplinary artist <strong>Adébayo&nbsp;Bolaji</strong>.
    </p>

    <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin-bottom:18px;">
      If you’ve already subscribed to the ongoing series, <strong>Edition&nbsp;0.1</strong> will unlock on <strong>1&nbsp;December</strong>.
    </p>

    <p style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;margin-bottom:24px;">
      If you haven’t subscribed yet, we’d love for you to continue the journey. Discover what’s next in this first-of-its-kind monthly publication — rich with artwork, writings, film, music, interviews and more.
    </p>

    <div style="text-align:center;margin-top:36px;">
      <a href="${accessLink}" style="display:inline-block;background:#6C63FF;color:#fff !important;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:500;font-family:'Courier New',Courier,monospace;">
        Access My Edition 0.0
      </a>
      ${
        subscribeLink
          ? `<a href="${subscribeLink}" style="display:inline-block;background:#F1F0FF;color:#111 !important;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:500;font-family:'Courier New',Courier,monospace;margin-left:8px;">
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
    "Bolaji Editions - You're one of the first, preorders now open. Only 48 hours",
  [EmailType.PREORDER_PAYMENT_FAILED]:
    "Your preorder payment didn’t go through — retry now",
  [EmailType.NEW_EDITION_RELEASED]:
    "A new Bolaji Edition has arrived — explore now!",
  [EmailType.SUBSCRIPTION_STARTED]:
    "Your Bolaji Editions subscription is now active!",
  [EmailType.SUBSCRIPTION_FAILED_TO_START]:
    "We couldn’t start your subscription — please retry",
};
