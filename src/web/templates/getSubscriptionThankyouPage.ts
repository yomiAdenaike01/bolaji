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
        max-width: 520px;
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
        margin: 0 0 18px 0;
      }

      p, li {
        font-size: 0.95rem;
        color: var(--muted);
        margin: 0 0 16px 0;
        line-height: 1.7;
      }

      .section {
        margin-top: 22px;
        text-align: left;
      }

      .section-title {
        font-weight: 600;
        margin-bottom: 8px;
        color: var(--text);
        font-size: 0.95rem;
      }

      ul {
        padding-left: 18px;
        margin: 0;
      }

      li {
        margin-bottom: 8px;
        font-size: 0.92rem;
        color: var(--muted);
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
        margin-top: 28px;
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

      <p>
        Thank you for subscribing to <strong>Bolaji Editions</strong>.
        We’re really glad you’re here and excited to have you as part of this growing creative space.
      </p>

      <p>
        Bolaji Editions is released on a monthly cycle.
        This means your subscription begins with the next edition release.
        ${isPrerelease ? "<br/><br/><strong>Your first edition will be released from 1st December.</strong>" : ""}
      </p>

      <div class="section">
        <div class="section-title">What happens next:</div>
        <ul>
          <li>Your first digital edition will be available at the start of the next monthly release cycle.</li>
          <li>You’ll receive an email as soon as your edition is live and ready to access.</li>
          <li>If you’ve subscribed to the physical edition, we’ll also email you when your copy is released and on its way to you.</li>
        </ul>
      </div>

      <p>
        If you have any questions at all, we’re here to help.
        <br/><br/>
        <strong>Welcome to Bolaji Editions.</strong>
      </p>

      <button class="primary" onclick="window.location.replace('${redirectUrl}')">
        Go to Home
      </button>
    </div>

    <footer>© ${new Date().getFullYear()} Bolaji Editions</footer>
  </body>
</html>`;