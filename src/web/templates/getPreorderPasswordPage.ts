export const getPreorderPasswordPage = (
  token: string,
  errorMessage?: string,
) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Bolaji Editions — Private Access</title>
    <style>
      :root {
        --tint: #6C63FF;
        --bg: #F9F8FF;
        --text: #111;
        --muted: #666;
        --error: #E63946;
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
        max-width: 400px;
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
        margin: 0 0 24px 0;
        line-height: 1.6;
      }

      input[type="password"] {
        width: 100%;
        padding: 12px 14px;
        border-radius: 10px;
        border: 1px solid #ddd;
        font-size: 14px;
        margin-bottom: 14px;
        outline: none;
        transition: border-color 0.2s ease;
      }

      input[type="password"]:focus {
        border-color: var(--tint);
      }

      button {
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

      button:hover {
        background-color: #5A52E0;
      }

      button:active {
        transform: scale(0.98);
      }

      .error {
        color: var(--error);
        font-size: 13px;
        margin-top: 14px;
        background: rgba(230, 57, 70, 0.05);
        padding: 8px 12px;
        border-radius: 8px;
        border: 1px solid rgba(230, 57, 70, 0.2);
        animation: shake 0.3s ease-in-out;
      }

      @keyframes shake {
        10%, 90% { transform: translateX(-1px); }
        20%, 80% { transform: translateX(2px); }
        30%, 50%, 70% { transform: translateX(-4px); }
        40%, 60% { transform: translateX(4px); }
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
    <form class="card" method="POST" action="/api/preorders/private-access">
      <img
        src="https://static.wixstatic.com/media/7ec957_cdb075d0cbbe459ebbb49f125106e1fb~mv2.png/v1/fill/w_99,h_66,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/Ade_Logo_Black.png"
        alt="Bolaji Editions"
        class="logo"
      />
      <h2>Private Access</h2>
      <p>
        Enter your exclusive password to access <strong>Edition 00</strong> — the
        private preorder experience for our early waitlist community.
      </p>

      <input
        type="password"
        name="password"
        placeholder="Enter password"
        required
      />
      <input type="hidden" name="token" value="${token || ""}" />

      <button type="submit">Continue</button>

      ${errorMessage ? `<div class="error">${errorMessage}</div>` : ""}
    </form>

    <footer>© ${new Date().getFullYear()} Bolaji Editions</footer>
  </body>
</html>`;
