import ExcelJS from "exceljs";
import { Db } from "@/infra/index.js";
import { logger } from "@/lib/logger.js";

/**
 * Generates a Preorder Email Status Report
 * - Combines job runtime data (successful/failed sends)
 * - Fetches click data from the DB (User.preorderLinkClickedAt)
 */
export async function generateWaitlistEmailSummary(
  successful: { name: string; email: string }[],
  failed: { name: string; email: string; error: string }[],
  db?: Db,
) {
  logger.info("[Report] Generating preorder email status report...");

  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet("Summary");
  const sentSheet = workbook.addWorksheet("Sent Successfully");
  const failedSheet = workbook.addWorksheet("Failed Sends");

  // Optional DB integration — if db is provided, enrich users with click info
  let enriched = [] as {
    name: string;
    email: string;
    clicked: boolean;
    clickedAt: Date | null;
  }[];

  if (db) {
    const emails = successful.map((u) => u.email);
    const users = await db.user.findMany({
      where: { email: { in: emails } },
      select: {
        email: true,
        name: true,
        preorderLinkClickedAt: true,
      },
    });

    const userByEmail = Object.fromEntries(users.map((u) => [u.email, u]));
    enriched = successful.map((u) => {
      const match = userByEmail[u.email];
      return {
        name: u.name,
        email: u.email,
        clicked: !!match?.preorderLinkClickedAt,
        clickedAt: match?.preorderLinkClickedAt ?? null,
      };
    });
  } else {
    // fallback: basic rows only
    enriched = successful.map((u) => ({
      ...u,
      clicked: false,
      clickedAt: null,
    }));
  }

  const clicked = enriched.filter((u) => u.clicked);
  const notClicked = enriched.filter((u) => !u.clicked);

  const totalSent = enriched.length;
  const totalFailed = failed.length;
  const totalClicked = clicked.length;
  const clickRate =
    totalSent > 0 ? ((totalClicked / totalSent) * 100).toFixed(1) : "0";

  // 🧮 --- Summary Sheet ---
  summary.columns = [
    { header: "Metric", key: "metric", width: 30 },
    { header: "Count", key: "count", width: 15 },
    { header: "Notes", key: "notes", width: 40 },
  ];
  summary.addRow({ metric: "Total Emails Sent", count: totalSent });
  summary.addRow({ metric: "Failed Emails", count: totalFailed });
  summary.addRow({ metric: "Links Clicked", count: totalClicked });
  summary.addRow({ metric: "Not Yet Clicked", count: notClicked.length });
  summary.addRow({
    metric: "Click Rate (%)",
    count: clickRate,
    notes: `${totalClicked}/${totalSent} users clicked their link`,
  });
  summary.getRow(1).font = { bold: true };

  // 🟢 --- Sent Successfully Sheet ---
  sentSheet.columns = [
    { header: "Name", key: "name", width: 25 },
    { header: "Email", key: "email", width: 35 },
    { header: "Clicked?", key: "clicked", width: 15 },
    { header: "Clicked At", key: "clickedAt", width: 25 },
  ];

  for (const row of enriched) {
    sentSheet.addRow({
      name: row.name ?? "—",
      email: row.email,
      clicked: row.clicked ? "✅ Yes" : "❌ No",
      clickedAt: row.clickedAt ? row.clickedAt.toISOString() : "—",
    });
  }

  sentSheet.getRow(1).font = { bold: true };

  // 🔴 --- Failed Sends Sheet ---
  failedSheet.columns = [
    { header: "Name", key: "name", width: 25 },
    { header: "Email", key: "email", width: 35 },
    { header: "Error", key: "error", width: 50 },
  ];

  for (const f of failed) {
    failedSheet.addRow({
      name: f.name ?? "—",
      email: f.email,
      error: f.error ?? "Unknown error",
    });
  }

  failedSheet.getRow(1).font = { bold: true };

  const filename = `Preorder_Email_Report_${new Date()
    .toISOString()
    .slice(0, 10)}.xlsx`;

  logger.info(
    `[Report] Generated preorder email status report: ${totalSent} sent (${totalClicked} clicked, ${totalFailed} failed)`,
  );

  return {
    buffer: await workbook.xlsx.writeBuffer(),
    filename,
  };
}
