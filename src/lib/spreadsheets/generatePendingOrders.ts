// src/lib/spreadsheets/generatePendingOrdersSheet.ts
import ExcelJS from "exceljs";
import { Db } from "@/infra";

export async function generatePendingOrdersSheet(db: Db) {
  const orders = await db.order.findMany({
    include: {
      user: { select: { email: true, name: true } },
      edition: { select: { code: true, title: true } },
      preorder: { select: { choice: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Pending Orders");

  sheet.columns = [
    { header: "Order ID", key: "id", width: 24 },
    { header: "User", key: "user", width: 30 },
    { header: "Edition", key: "edition", width: 10 },
    { header: "Delivery Method", key: "deliveryMethod", width: 10 },
    { header: "Status", key: "status", width: 12 },
    { header: "Created At", key: "createdAt", width: 24 },
  ];

  for (const o of orders) {
    sheet.addRow({
      id: o.id,
      user: `${o.user.name || ""} <${o.user.email}>`,
      edition: o.edition?.code,
      deliveryMethod: o.preorder?.choice,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
    });
  }

  return workbook.xlsx.writeBuffer();
}
