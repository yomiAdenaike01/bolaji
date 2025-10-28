export const getErrorPage = (message: string) => `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Bolaji Editions — Access Error</title>
    <style>
      body {
        font-family: Inter, Arial, sans-serif;
        background: #faf9ff;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        margin: 0;
        color: #111;
      }
      .card {
        background: #fff;
        padding: 40px 30px;
        border-radius: 14px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        text-align: center;
        max-width: 380px;
      }
      h2 { font-family: Georgia, serif; font-weight: 400; font-size: 1.6rem; margin-bottom: 12px; }
      p { font-size: 0.9rem; color: #555; line-height: 1.6; margin-bottom: 24px; }
      a {
        display: inline-block;
        background: #6C63FF;
        color: #fff;
        text-decoration: none;
        padding: 12px 20px;
        border-radius: 8px;
        font-weight: 500;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>Access Link Invalid</h2>
      <p>${message}</p>
      <a href="https://bolaji-editions.com/waitlist">Request New Access</a>
    </div>
  </body>
</html>`;
