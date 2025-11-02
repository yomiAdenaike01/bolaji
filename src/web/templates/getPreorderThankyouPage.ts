import { PREORDER_OPENING_DATETIME } from "@/constants";
import { PlanType } from "@/generated/prisma/enums";

export const getThankYouPage = ({
  name,
  plan,
  redirectUrl,
}: {
  name?: string;
  plan: PlanType;
  redirectUrl: string;
}) => {
  const formattedDate = PREORDER_OPENING_DATETIME.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Bolaji Editions — Thank You</title>
    <style>
      :root {
        --tint: #6C63FF;
        --bg: #F9F8FF;
        --text: #111;
        --muted: #555;
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
        max-width: 480px;
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
        margin-bottom: 20px;
      }

      h2 {
        font-family: 'Georgia', 'Times New Roman', serif;
        font-weight: 400;
        font-size: 1.7rem;
        margin: 0 0 14px 0;
        color: var(--text);
      }

      p {
        font-size: 0.94rem;
        color: var(--muted);
        margin: 0 0 16px 0;
        line-height: 1.65;
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
        margin-top: 12px;
      }

      button.primary:hover { background-color: #5A52E0; }
      button.primary:active { transform: scale(0.98); }

      .subscribe-box {
        margin-top: 28px;
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

      footer {
        text-align: center;
        margin-top: 24px;
        font-size: 12px;
        color: #999;
      }

      @media (max-width: 480px) {
        .card { padding: 36px 24px; }
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

      <h2>Thank You${name ? `, ${name.split(" ")[0]}` : ""}</h2>

      <p>Your <strong>${
        plan === PlanType.FULL
          ? "Full"
          : plan === PlanType.PHYSICAL
            ? "Physical"
            : "Digital"
      } Edition</strong> preorder has been received.</p>

      <p>Edition 00 officially releases on <strong>${formattedDate}</strong>.  
      You’ll receive an email when your edition unlocks — it will include your login password and access details.</p>

      <p>Thank you for supporting the beginning of Bolaji Editions.  
      We can’t wait for you to experience it.</p>

      <button class="primary" onclick="window.location.replace('${redirectUrl}')">
        Return to Site
      </button>

    <footer>© ${new Date().getFullYear()} Bolaji Editions</footer>
  </body>
</html>`;
};
