export const getNoAccessPage = () => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Bolaji Editions — Invitation Only</title>
    <style>
      :root {
        --tint: #6C63FF;
        --bg: #F9F8FF;
        --text: #111;
        --muted: #666;
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
        text-align: center;
      }

      .card {
        background: #fff;
        padding: 48px 36px;
        border-radius: 16px;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.03);
        max-width: 460px;
      }

      h1 {
        font-family: 'Georgia', 'Times New Roman', serif;
        font-weight: 400;
        font-size: 26px;
        margin-bottom: 12px;
      }

      p {
        font-size: 15px;
        line-height: 1.7;
        color: var(--muted);
        margin-bottom: 20px;
      }

      a.button {
        display: inline-block;
        background: var(--tint);
        color: #fff !important;
        text-decoration: none;
        font-family: 'Courier New', Courier, monospace;
        padding: 14px 28px;
        border-radius: 8px;
        font-weight: 500;
      }

      a.button:hover {
        background: #5a52e0;
      }

      .footer {
        font-size: 13px;
        color: #777;
        margin-top: 32px;
      }

      .support {
        margin-top: 16px;
        font-size: 14px;
        color: var(--muted);
      }

      .support a {
        color: var(--tint);
        text-decoration: none;
        font-weight: 500;
      }

      .support a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Private Access Required</h1>
      <p>
        This space is part of <strong>Bolaji&nbsp;Editions</strong>, a limited artist-led experience
        currently available to those who’ve joined the waiting list or preordered an edition.
      </p>
      <p>
        If you have a preorder link or invitation, please return using that link to access your private area.
      </p>
      <div class="support">
        Experiencing any issues? Contact our support team at
        <a href="mailto:support@bolaji.studio?subject=Access%20Issue%20—%20Bolaji%20Editions&body=Hello%20Bolaji%20Editions%20Team%2C%0A%0AI%27m%20experiencing%20an%20issue%20accessing%20my%20private%20area.%20Here%20are%20the%20details%3A%0A%0A%E2%80%A2%20Name%3A%20%0A%E2%80%A2%20Email%3A%20%0A%E2%80%A2%20Issue%20description%3A%20%0A%0AThank%20you%2C%0A%5BYour%20Name%5D">
          support@bolaji.studio
        </a>
      </div>
      <div class="footer">
        Bolaji Editions © 2025
      </div>
    </div>
  </body>
</html>`;
