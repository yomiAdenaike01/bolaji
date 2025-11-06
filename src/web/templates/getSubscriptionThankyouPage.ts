export const getSubscriptionThankYouPage = (
  redirectUrl: string,
  isPrerelease = false,
) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Bolaji Editions — Subscription Confirmed</title>
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
      }

      p {
        font-size: 0.94rem;
        color: var(--muted);
        margin: 0 0 16px 0;
        line-height: 1.65;
      }

      .highlight {
        display: inline-block;
        background-color: var(--tint);
        color: #fff;
        border-radius: 10px;
        padding: 10px 16px;
        font-weight: 500;
        margin: 12px 0 8px 0;
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

      <h2>Subscription Confirmed</h2>

      <p>Thank you for subscribing to <strong>Bolaji Editions</strong>.  
      ${isPrerelease ? "Your first edition will be released from 1st Decemeber." : ""} 
      Every month a new edition is released. You’ll receive ongoing access to each new edition.</p>

      <p>An email has been sent for your confirmation.</p>


      <button class="primary" onclick="window.location.replace('${redirectUrl}')">
        Go to Home
      </button>
    </div>

    <footer>© ${new Date().getFullYear()} Bolaji Editions</footer>
  </body>
</html>`;
