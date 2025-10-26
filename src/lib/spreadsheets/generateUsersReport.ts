import ExcelJS from "exceljs";
import { Db } from "@/infra";

export async function generateUsersReportSheet(
  db: Db,
): Promise<ExcelJS.Buffer> {
  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Users");

  sheet.columns = [
    { header: "User ID", key: "id", width: 36 },
    { header: "Name", key: "name", width: 25 },
    { header: "Email", key: "email", width: 30 },
    { header: "Created At", key: "createdAt", width: 20 },
  ];

  for (const user of users) {
    sheet.addRow({
      id: user.id,
      name: user.name ?? "—",
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    });
  }

  sheet.getRow(1).font = { bold: true };
  sheet.eachRow((row, idx) => {
    if (idx % 2 === 0)
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8F8F8" },
      };
  });

  return workbook.xlsx.writeBuffer();
}
