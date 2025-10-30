import ExcelJS from "exceljs";
import { Db } from "@/infra";

const getOrders = async (db: Db) => {
  return db.$transaction(async (tx) => {
    const orders = await tx.order.findMany({
      include: {
        user: { select: { email: true, name: true } },
        edition: { select: { code: true, title: true } },
        preorder: { select: { choice: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const editionIds = orders
      .map((o) => o.editionId)
      .filter(Boolean) as string[];
    const userIds = orders.map((o) => o.userId);

    const shipments = await db.shipment.findMany({
      where: {
        editionId: { in: editionIds },
        userId: { in: userIds },
      },
      include: { address: true },
    });

    const shipmentMap = new Map(
      shipments.map((s) => [`${s.userId}-${s.editionId}`, s]),
    );
    return orders.map((o) => ({
      ...o,
      shipment: shipmentMap.get(`${o.userId}-${o.editionId}`),
    }));
  });
};

export async function generatePendingOrdersSheet(db: Db) {
  const orders = await getOrders(db);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Pending Orders");

  sheet.columns = [
    { header: "Order ID", key: "id", width: 24 },
    { header: "User", key: "user", width: 30 },
    { header: "Edition", key: "edition", width: 12 },
    { header: "Delivery Method", key: "deliveryMethod", width: 14 },
    { header: "Status", key: "status", width: 12 },
    { header: "Created At", key: "createdAt", width: 24 },
    { header: "Address", key: "address", width: 45 },
    { header: "Shipment Status", key: "shipmentStatus", width: 18 },
  ];

  for (const o of orders) {
    const addr = o.shipment?.address;
    const address = addr
      ? [
          addr.fullName,
          addr.line1,
          addr.line2,
          addr.city,
          addr.state,
          addr.postalCode,
          addr.country,
        ]
          .filter(Boolean)
          .join(", ")
      : "—";

    sheet.addRow({
      id: o.id,
      user: `${o.user.name || ""} <${o.user.email}>`,
      edition: o.edition?.title || o.edition?.code || "",
      deliveryMethod: o.preorder?.choice || "",
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      address,
      shipmentStatus: o.shipment?.status ?? "N/A",
    });
  }

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { horizontal: "center" };

  return workbook.xlsx.writeBuffer();
}
