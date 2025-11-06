import ExcelJS from "exceljs";
import { logger } from "../logger";
import {
  OrderStatus,
  PlanType,
  ShipmentStatus,
} from "@/generated/prisma/enums";
import { Db } from "@/infra";
import { PREORDER_EDITION_MAX_COPIES } from "@/constants";

function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Generates preorder summary + pending shipments
 * Includes edition 0 physical stock remaining and paid preorder details
 */
export async function generatePreorderSummaryReport(db: Db) {
  logger.info(
    "[Preorder Report] Generating preorder summary (Edition 0 only)...",
  );

  // ⚡️ Run all major queries in one transaction
  const [
    preorderAgg,
    issues,
    pendingShipments,
    paidOrders,
    editionZero,
    allPaidPreorders,
  ] = await db.$transaction(async (tx) => {
    return Promise.all([
      tx.preorder.groupBy({
        by: ["choice", "status"],
        _count: { _all: true },
        _sum: { totalCents: true },
      }),

      tx.preorder.findMany({
        where: { status: { not: OrderStatus.PAID } },
        select: {
          choice: true,
          status: true,
          user: { select: { name: true, email: true } },
        },
      }),

      tx.shipment.findMany({
        where: { status: ShipmentStatus.PENDING },
        include: {
          address: true,
          user: { select: { name: true, email: true } },
          edition: {
            select: { id: true, code: true, number: true, title: true },
          },
        },
        orderBy: [{ address: { country: "asc" } }, { createdAt: "asc" }],
      }),

      tx.order.findMany({
        where: { status: OrderStatus.PAID, editionId: { not: null } },
        select: { editionId: true, quantity: true },
      }),

      tx.edition.findUnique({
        where: { number: 0 },
        select: { id: true, maxCopies: true, title: true, code: true },
      }),

      // 🧾 NEW: all paid preorders of all types
      tx.preorder.findMany({
        where: { status: OrderStatus.PAID },
        include: {
          user: { select: { name: true, email: true } },
          edition: { select: { number: true, code: true, title: true } },
        },
        orderBy: [{ createdAt: "asc" }],
      }),
    ]);
  });

  // ---- 📊 Aggregate preorder totals
  let total = 0;
  let paid = 0;
  let failed = 0;
  let pending = 0;
  let revenue = 0;
  const byPlan: Record<PlanType, number> = {
    [PlanType.DIGITAL]: 0,
    [PlanType.PHYSICAL]: 0,
    [PlanType.FULL]: 0,
  };

  for (const row of preorderAgg as any[]) {
    total += row._count._all;
    byPlan[row.choice] += row._count._all;

    if (row.status === OrderStatus.PAID) {
      paid += row._count._all;
      revenue += row._sum.totalCents ?? 0;
    } else if (row.status === OrderStatus.FAILED) failed += row._count._all;
    else if (row.status === OrderStatus.PENDING) pending += row._count._all;
  }

  // ---- 📦 Calculate remaining physical copies for Edition 0
  const edition0Id = editionZero?.id;
  const maxCopies = editionZero?.maxCopies ?? PREORDER_EDITION_MAX_COPIES;

  const physicalSold = await db.preorder.count({
    where: {
      editionId: edition0Id,
      choice: { in: [PlanType.PHYSICAL, PlanType.FULL] },
      status: OrderStatus.PAID,
    },
  });

  const physicalRemaining = Math.max(maxCopies - physicalSold, 0);

  // ---- 🧾 Initialize Excel workbook
  const workbook = new ExcelJS.Workbook();

  // ---- 📈 Sheet 1: Overview
  const summary = workbook.addWorksheet("Overview");
  summary.addRow(["Metric", "Count", "Notes"]);
  summary.addRow(["Total Preorders", total]);
  summary.addRow(["Digital", byPlan[PlanType.DIGITAL]]);
  summary.addRow(["Physical", byPlan[PlanType.PHYSICAL]]);
  summary.addRow(["Full", byPlan[PlanType.FULL]]);
  summary.addRow([
    "Paid",
    paid,
    `${((paid / total) * 100).toFixed(1)}% success`,
  ]);
  summary.addRow(["Failed", failed]);
  summary.addRow(["Pending", pending]);
  summary.addRow(["Total Revenue (£)", (revenue / 100).toFixed(2)]);
  summary.addRow(["Edition 0 Max Copies", maxCopies]);
  summary.addRow(["Physical Copies Sold", physicalSold]);
  summary.addRow(["Physical Copies Remaining", physicalRemaining]);

  summary.columns.forEach((c) => (c.width = 30));
  summary.getRow(1).font = { bold: true };

  // ---- ⚠️ Sheet 2: Problem Cases
  const issuesSheet = workbook.addWorksheet("Problem Cases");
  issuesSheet.columns = [
    { header: "Name", key: "name", width: 25 },
    { header: "Email", key: "email", width: 35 },
    { header: "Plan", key: "plan", width: 15 },
    { header: "Status", key: "status", width: 15 },
  ];
  for (const issue of issues) {
    issuesSheet.addRow({
      name: issue.user?.name ?? "—",
      email: issue.user?.email ?? "—",
      plan: issue.choice,
      status: issue.status,
    });
  }

  // ---- 🚚 Sheet 3: Pending Shipments by Country
  const shipmentsSheet = workbook.addWorksheet("Pending Shipments by Country");
  shipmentsSheet.columns = [
    { header: "Country", key: "country", width: 20 },
    { header: "Recipient", key: "recipient", width: 25 },
    { header: "Email", key: "email", width: 30 },
    { header: "Edition", key: "edition", width: 20 },
    { header: "Quantity", key: "quantity", width: 10 },
    { header: "Address Line 1", key: "line1", width: 35 },
    { header: "City", key: "city", width: 20 },
    { header: "Postal Code", key: "postalCode", width: 15 },
    { header: "Status", key: "status", width: 15 },
    { header: "Created At", key: "createdAt", width: 20 },
  ];

  const editionQuantityMap = paidOrders.reduce<Record<string, number>>(
    (acc, o) => {
      if (o.editionId) acc[o.editionId] = (acc[o.editionId] ?? 0) + o.quantity;
      return acc;
    },
    {},
  );

  const groupedByCountry = (pendingShipments as any[]).reduce(
    (acc, s) => {
      const country = (s.address?.country ?? "Unknown").toLowerCase();
      if (!acc[country]) acc[country] = [];
      acc[country].push(s);
      return acc;
    },
    {} as Record<string, typeof pendingShipments>,
  );

  for (const [country, shipments] of Object.entries(groupedByCountry) as any) {
    const countryLabel = capitalize(country);

    shipmentsSheet.addRow({
      country: `${countryLabel} (${shipments.length} pending shipments)`,
    });
    shipmentsSheet.getRow(shipmentsSheet.lastRow?.number || 1).font = {
      bold: true,
      color: { argb: "FF444444" },
    };

    for (const s of shipments) {
      const qty = editionQuantityMap[s.edition.id] ?? 1;
      shipmentsSheet.addRow({
        country: countryLabel,
        recipient: s.user?.name ?? "—",
        email: s.user?.email ?? "—",
        edition: s.edition?.code ?? `Edition ${s.edition?.number ?? "?"}`,
        quantity: qty,
        line1: s.address?.line1 ?? "—",
        city: s.address?.city ?? "—",
        postalCode: s.address?.postalCode ?? "—",
        status: s.status,
        createdAt: s.createdAt.toISOString().split("T")[0],
      });
    }

    shipmentsSheet.addRow({});
  }

  shipmentsSheet.getRow(1).font = { bold: true };

  // ---- 💰 Sheet 4: All Paid Preorders
  const paidSheet = workbook.addWorksheet("All Paid Preorders");
  paidSheet.columns = [
    { header: "Name", key: "name", width: 25 },
    { header: "Email", key: "email", width: 30 },
    { header: "Plan", key: "plan", width: 15 },
    { header: "Edition", key: "edition", width: 20 },
    { header: "Edition Title", key: "editionTitle", width: 35 },
    { header: "Status", key: "status", width: 15 },
    { header: "Total (£)", key: "total", width: 15 },
    { header: "Created At", key: "createdAt", width: 20 },
  ];

  for (const p of allPaidPreorders as any) {
    paidSheet.addRow({
      name: p.user?.name ?? "—",
      email: p.user?.email ?? "—",
      plan: p.choice,
      edition: p.edition?.code ?? `ED${p.edition?.number ?? "?"}`,
      editionTitle: p.edition?.title ?? "—",
      status: p.status,
      total: (p.totalCents ?? 0) / 100,
      createdAt: p.createdAt.toISOString().split("T")[0],
    });
  }

  paidSheet.getRow(1).font = { bold: true };

  logger.info(
    `[Preorder Report] Edition 0: ${physicalRemaining} remaining out of ${maxCopies} total. Added ${allPaidPreorders.length} paid preorder records.`,
  );

  return workbook.xlsx.writeBuffer();
}
