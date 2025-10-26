import ExcelJS from "exceljs";
import { logger } from "../logger";

export async function generatePreorderReport(
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
