import { PreorderReleaseContent } from "../email-types.js";
import { wrap } from "./email-wrapper.js";

export const getPreorderReleaseContent = ({
  name,
  preorderLink,
  password,
}: PreorderReleaseContent) =>
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
    Hi ${name.split(" ")[0]},
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
  <!-- Signature -->
  <p style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#777;margin:20px 0 0;">
    With gratitude,<br><strong>The Bolaji&nbsp;Editions Team</strong>
  </p>
  `,
  );
