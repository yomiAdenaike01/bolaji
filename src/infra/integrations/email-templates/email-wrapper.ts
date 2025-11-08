const LOGO_URL = `${process.env.SERVER_URL}/images/logo.png`;

export const wrap = (title: string, body: string) => `
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
