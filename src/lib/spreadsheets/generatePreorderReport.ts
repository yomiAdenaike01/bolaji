import ExcelJS from "exceljs";
import { logger } from "../logger";

import { OrderStatus, PlanType } from "@/generated/prisma/enums";
import { Db } from "@/infra";
import { PREORDER_EDITION_MAX_COPIES } from "@/constants";

/**
 * Generate a lean, fast preorder summary report for admins.
 * - Aggregates totals and statuses efficiently
 * - Avoids loading unnecessary relations
 * - Creates 2 sheets: Overview + Problem Cases
 */
export async function generatePreorderSummaryReport(db: Db) {
  logger.info("[Preorder Report] Generating preorder summary...");

  // 🚀 Fetch only required fields (minimize query size)
  const preorders = await db.preorder.findMany({
    select: {
      id: true,
      status: true,
      totalCents: true,
      choice: true,
      user: {
        select: { name: true, email: true },
      },
    },
  });

  // 🧩 Initialize aggregates (O(1) counters)
  let total = 0;
  let paid = 0;
  let failed = 0;
  let pending = 0;
  let revenue = 0;
  const byPlan = {
    [PlanType.DIGITAL]: 0,
    [PlanType.PHYSICAL]: 0,
    [PlanType.FULL]: 0,
  } as Record<PlanType, number>;

  const issues: {
    name: string;
    email: string;
    plan: PlanType;
    status: OrderStatus;
    reason: string;
  }[] = [];

  // ⚡️ Single-pass loop for all calculations
  for (const p of preorders) {
    total++;
    byPlan[p.choice]++;

    if (p.status === OrderStatus.PAID) {
      paid++;
      revenue += p.totalCents;
    } else {
      if (p.status === OrderStatus.FAILED) failed++;
      else if (p.status === OrderStatus.PENDING) pending++;

      issues.push({
        name: p.user?.name || "—",
        email: p.user?.email || "—",
        plan: p.choice,
        status: p.status,
        reason:
          p.status === OrderStatus.FAILED
            ? "Payment failed"
            : p.status === OrderStatus.PENDING
              ? "Awaiting checkout"
              : "Unknown",
      });
    }
  }

  const workbook = new ExcelJS.Workbook();

  // ---- 📊 Sheet 1: Overview
  const summary = workbook.addWorksheet("Overview");
  summary.addRow(["Metric", "Count", "Notes"]);

  summary.addRow(["Total Preorders", total]);
  summary.addRow(["Digital", byPlan[PlanType.DIGITAL]]);
  summary.addRow(["Physical", byPlan[PlanType.PHYSICAL]]);
  summary.addRow(["Full", byPlan[PlanType.FULL]]);
  summary.addRow([
    "Paid",
    paid,
    total ? `${((paid / total) * 100).toFixed(1)}% success` : "—",
  ]);
  summary.addRow(["Failed", failed]);
  summary.addRow(["Pending", pending]);
  summary.addRow(["Total Revenue (£)", (revenue / 100).toFixed(2)]);

  if (total >= PREORDER_EDITION_MAX_COPIES) {
    summary.insertRow(1, [
      "🚫 Preorder Limit Reached",
      "",
      `Preorders have hit the ${PREORDER_EDITION_MAX_COPIES}-copy cap.`,
    ]);
  }

  summary.columns.forEach((c) => (c.width = 25));
  summary.getRow(1).font = { bold: true };

  // ---- ⚠️ Sheet 2: Problem Cases
  const issuesSheet = workbook.addWorksheet("Problem Cases");
  issuesSheet.columns = [
    { header: "Name", key: "name", width: 25 },
    { header: "Email", key: "email", width: 35 },
    { header: "Plan", key: "plan", width: 15 },
    { header: "Status", key: "status", width: 15 },
    { header: "Reason / Missing Info", key: "reason", width: 45 },
  ];

  for (const issue of issues) issuesSheet.addRow(issue);

  logger.info(
    `[Preorder Report] Summary generated with ${total} preorders (${paid} paid, ${failed} failed, ${pending} pending).`,
  );

  return workbook.xlsx.writeBuffer();
}

export async function generatePreorderEmailStatusReport(
  successful: { name: string; email: string }[],
  failed: { name: string; email: string; error: string }[],
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Preorder Emails");

  sheet.columns = [
    { header: "Name", key: "name", width: 25 },
    { header: "Email", key: "email", width: 35 },
    { header: "Status", key: "status", width: 15 },
    { header: "Error (if failed)", key: "error", width: 40 },
  ];

  successful.forEach((s) =>
    sheet.addRow({ name: s.name, email: s.email, status: "SENT", error: "" }),
  );
  failed.forEach((f) =>
    sheet.addRow({
      name: f.name,
      email: f.email,
      status: "FAILED",
      error: f.error,
    }),
  );

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `preorder_release_report_${new Date().toISOString().split("T")[0]}.xlsx`;
  logger.info(`📊 Report generated: ${filename}`);
  return {
    buffer,
    filename,
  };
}
