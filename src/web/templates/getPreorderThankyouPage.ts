import { PlanType } from "@/generated/prisma/enums";

export const getThankYouPage = ({
  name,
  plan,
  password,
  redirectUrl,
}: {
  name?: string;
  plan: PlanType;
  password: string;
  redirectUrl: string;
}) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Bolaji Editions — Thank You</title>
    <style>
      :root {
        --tint: #6C63FF;
        --bg: #F9F8FF;
        --text: #111;
        --muted: #666;
        --success: #2A9D8F;
      }

      body {
        font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
        background: var(--bg);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        margin: 0;
        color: var(--text);
      }

      .card {
        background: #fff;
        padding: 48px 36px;
        border-radius: 16px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
        max-width: 460px;
        width: 90%;
        text-align: center;
        animation: fadeIn 0.4s ease-out;
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      img.logo {
        width: 100px;
        height: auto;
        margin-bottom: 16px;
      }

      h2 {
        font-family: 'Georgia', 'Times New Roman', serif;
        font-weight: 400;
        font-size: 1.7rem;
        margin: 0 0 8px 0;
        color: var(--text);
      }

      p {
        font-size: 0.92rem;
        color: var(--muted);
        margin: 0 0 18px 0;
        line-height: 1.6;
      }

      .password-box {
        background: var(--bg);
        border: 1px solid #E0E0E0;
        border-radius: 10px;
        padding: 12px 14px;
        font-size: 15px;
        font-weight: 500;
        color: var(--text);
        margin: 10px 0 20px 0;
        letter-spacing: 0.3px;
      }

      button.primary {
        background-color: var(--tint);
        color: #fff;
        border: none;
        border-radius: 10px;
        padding: 12px;
        font-size: 15px;
        font-weight: 500;
        width: 100%;
        cursor: pointer;
        transition: background 0.25s ease, transform 0.1s ease;
      }

      button.primary:hover {
        background-color: #5A52E0;
      }

      button.primary:active {
        transform: scale(0.98);
      }

      .subscribe-box {
        margin-top: 24px;
        background: var(--bg);
        border: 1px solid #E2E0DC;
        border-radius: 14px;
        padding: 20px;
      }

      .subscribe-box h3 {
        margin-top: 0;
        margin-bottom: 8px;
        font-family: 'Georgia', serif;
        font-weight: 400;
        font-size: 1.1rem;
        color: var(--text);
      }

      .subscribe-box p {
        color: var(--muted);
        font-size: 0.9rem;
        margin-bottom: 16px;
      }

      .subscribe-box form {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .subscribe-box input[type="email"] {
        padding: 12px 14px;
        border-radius: 10px;
        border: 1px solid #ddd;
        font-size: 14px;
        outline: none;
      }

      .subscribe-box input[type="email"]:focus {
        border-color: var(--tint);
      }

      .subscribe-box button {
        background: var(--tint);
        color: #fff;
        border: none;
        border-radius: 10px;
        padding: 12px;
        font-size: 15px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.25s ease;
      }

      .subscribe-box button:hover {
        background-color: #5A52E0;
      }

      .note {
        font-size: 13px;
        color: var(--muted);
        margin-top: 20px;
        background: rgba(108, 99, 255, 0.05);
        border-radius: 8px;
        padding: 10px 12px;
        border: 1px solid rgba(108, 99, 255, 0.15);
      }

      footer {
        text-align: center;
        margin-top: 24px;
        font-size: 12px;
        color: #999;
      }

      @media (max-width: 480px) {
        .card {
          padding: 36px 24px;
        }
      }
    </style>
  </head>

  <body>
    <div class="card">
      <img
        src="https://static.wixstatic.com/media/7ec957_cdb075d0cbbe459ebbb49f125106e1fb~mv2.png/v1/fill/w_99,h_66,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/Ade_Logo_Black.png"
        alt="Bolaji Editions"
        class="logo"
      />

      <h2>Thank You${name ? `, ${name.split(" ")[0]}` : ""} ✨</h2>

      ${
        plan === "DIGITAL"
          ? `<p>Your <strong>Digital Edition</strong> is now unlocked.  
             You can log in right away to begin exploring your first Bolaji Edition.</p>`
          : `<p>Your <strong>${plan === "FULL" ? "Full" : "Physical"} Edition</strong> preorder is confirmed.  
             We’ll reach out shortly with shipping details and your next steps.</p>`
      }

      <p>Your new login password:</p>
      <div class="password-box">${password}</div>

      <button class="primary" onclick="window.location.replace('${redirectUrl}')">
        Go to Site →
      </button>

      ${
        plan === "DIGITAL"
          ? `<div class="note">Use your password above to log in and access your digital edition immediately.</div>`
          : `<div class="note">Keep your password safe — we’ll notify you when your physical edition ships.</div>`
      }

      <div class="subscribe-box">
        <h3>Subscribe for Ongoing Editions</h3>
        <p>Be among the first to receive future Bolaji Editions as they’re released.</p>
        <form action="/subscribe" method="POST">
          <input type="email" name="email" placeholder="Enter your email" required />
          <button type="submit">Subscribe</button>
        </form>
      </div>
    </div>

    <footer>© ${new Date().getFullYear()} Bolaji Editions</footer>
  </body>
</html>`;
