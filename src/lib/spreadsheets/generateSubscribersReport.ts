// domain/reports/subscriber-editions.report.ts
import ExcelJS from "exceljs";
import { Db } from "@/infra";
import { logger } from "@/lib/logger";
import { format } from "date-fns";
import { enGB } from "date-fns/locale";
import { SubscriptionStatus } from "@/generated/prisma/enums";

type SubPeriod = {
  start: Date;
  end: Date;
};

const fmt = (d?: Date | null) =>
  d ? format(d, "yyyy-MM-dd HH:mm", { locale: enGB }) : "—";

export async function generateSubscriberReport(db: Db) {
  logger.info("[Admin Digest] Building daily subscriber + editions report…");

  // 1) Pull active subs and minimal user info
  const activeSubs = await db.subscription.findMany({
    where: { status: SubscriptionStatus.ACTIVE }, // adjust enum if different
    include: {
      user: { select: { id: true, name: true, email: true } },
      // include plan fields if you want to show tier/price/etc
    },
    orderBy: { createdAt: "asc" },
  });

  // 2) Pull all editions >= 1 (subscription editions)
  //    We load once, then filter per subscriber in-memory for speed.
  const editions = await db.edition.findMany({
    where: { number: { gt: 0 } },
    select: {
      id: true,
      number: true,
      code: true,
      title: true,
      releasedAt: true,
      releaseDate: true,
    },
    orderBy: { number: "asc" },
  });

  // Helper: pick usable release timestamp
  const getReleaseAt = (e: (typeof editions)[number]) =>
    e.releasedAt ?? e.releaseDate ?? null;

  // Helper: get a subscriber’s active period for this digest
  const getPeriod = (sub: any): SubPeriod => {
    const start = sub.currentPeriodStart ?? sub.startedAt ?? new Date(); // fallback (shouldn’t happen)
    const end =
      sub.currentPeriodEnd ??
      sub.endsAt ??
      // if open-ended, include the next 12 months by default for visibility
      new Date(new Date(start).setMonth(start.getMonth() + 12));
    return { start, end };
  };

  // 3) Build rows for Excel
  type Row = {
    subscriberName: string;
    subscriberEmail: string;
    periodStart: string;
    periodEnd: string;
    editionsCount: number;
    editionNumber: string;
    editionCode: string;
    editionTitle: string;
    editionRelease: string;
  };

  const rows: Row[] = [];
  for (const sub of activeSubs) {
    const period = getPeriod(sub);

    // editions that fall within the subscriber’s current period
    const covered = editions.filter((e) => {
      const r = getReleaseAt(e);
      if (!r) return false;
      return r >= period.start && r <= period.end;
    });

    // at least one line per covered edition; if none, add a placeholder
    if (covered.length === 0) {
      rows.push({
        subscriberName: sub.user?.name ?? "—",
        subscriberEmail: sub.user?.email ?? "—",
        periodStart: fmt(period.start),
        periodEnd: fmt(period.end),
        editionsCount: 0,
        editionNumber: "—",
        editionCode: "—",
        editionTitle: "—",
        editionRelease: "—",
      });
      continue;
    }

    for (const e of covered) {
      rows.push({
        subscriberName: sub.user?.name ?? "—",
        subscriberEmail: sub.user?.email ?? "—",
        periodStart: fmt(period.start),
        periodEnd: fmt(period.end),
        editionsCount: covered.length,
        editionNumber: String(e.number).padStart(2, "0"),
        editionCode: e.code,
        editionTitle: e.title,
        editionRelease: fmt(getReleaseAt(e)),
      });
    }
  }

  // 4) Create Excel
  const wb = new ExcelJS.Workbook();

  // Sheet: Overview
  const overview = wb.addWorksheet("Overview");
  overview.addRow(["Metric", "Value"]);
  overview.addRow(["Active subscribers", activeSubs.length]);
  overview.addRow(["Total editions considered (>= 01)", editions.length]);
  overview.getRow(1).font = { bold: true };
  overview.columns.forEach((c) => (c.width = 32));

  // Sheet: Subscribers (one row per subscriber, summary count)
  const subsSheet = wb.addWorksheet("Subscribers");
  subsSheet.columns = [
    { header: "Name", key: "name", width: 28 },
    { header: "Email", key: "email", width: 36 },
    { header: "Period Start", key: "start", width: 22 },
    { header: "Period End", key: "end", width: 22 },
    { header: "Covered Editions", key: "count", width: 18 },
  ];
  subsSheet.getRow(1).font = { bold: true };

  // Summarize covered editions by subscriber
  const byEmail = new Map<
    string,
    { name: string; start: string; end: string; count: number }
  >();
  for (const r of rows) {
    const key = r.subscriberEmail;
    const prev = byEmail.get(key);
    if (!prev) {
      byEmail.set(key, {
        name: r.subscriberName,
        start: r.periodStart,
        end: r.periodEnd,
        count: r.editionsCount,
      });
    }
  }
  for (const [email, rec] of byEmail.entries()) {
    subsSheet.addRow({
      name: rec.name,
      email,
      start: rec.start,
      end: rec.end,
      count: rec.count,
    });
  }

  // Sheet: Schedules (one row per subscriber-edition)
  const sched = wb.addWorksheet("Schedules");
  sched.columns = [
    { header: "Subscriber", key: "subscriber", width: 28 },
    { header: "Email", key: "email", width: 36 },
    { header: "Period Start", key: "start", width: 22 },
    { header: "Period End", key: "end", width: 22 },
    { header: "Edition #", key: "ednum", width: 12 },
    { header: "Edition Code", key: "edcode", width: 18 },
    { header: "Edition Title", key: "edtitle", width: 38 },
    { header: "Release (UTC)", key: "release", width: 22 },
  ];
  sched.getRow(1).font = { bold: true };

  for (const r of rows) {
    if (r.editionNumber === "—") continue; // skip placeholder here
    sched.addRow({
      subscriber: r.subscriberName,
      email: r.subscriberEmail,
      start: r.periodStart,
      end: r.periodEnd,
      ednum: r.editionNumber,
      edcode: r.editionCode,
      edtitle: r.editionTitle,
      release: r.editionRelease,
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  logger.info(
    `[Admin Digest] Built report: ${activeSubs.length} active subs, ${rows.length} schedule lines.`,
  );

  return buffer;
}
