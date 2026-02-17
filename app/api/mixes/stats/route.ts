import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isAdmin(req: Request) {
  const key = req.headers.get("x-admin-key") || "";
  return !!process.env.ADMIN_API_KEY && key === process.env.ADMIN_API_KEY;
}

function asDateOnly(s: string) {
  return new Date(`${s}T00:00:00`);
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0 dom..6 sab
  const diff = day === 0 ? -6 : 1 - day; // lunes inicio
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function clampRange(from: Date, to: Date) {
  const f = new Date(from);
  const t = new Date(to);
  f.setHours(0, 0, 0, 0);
  t.setHours(23, 59, 59, 999);
  if (t < f) return { from: t, to: f };
  return { from: f, to: t };
}

function labelFor(group: string, d: Date) {
  if (group === "day") return ymd(d);
  if (group === "week") return `Semana ${ymd(d)}`; // d = inicio de semana
  if (group === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return ymd(d);
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function daysBetweenInclusive(from: Date, to: Date) {
  const a = new Date(from);
  const b = new Date(to);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  const ms = b.getTime() - a.getTime();
  const days = Math.floor(ms / 86400000) + 1;
  return Math.max(1, days);
}

function makePrevRange(from: Date, to: Date) {
  const lenDays = daysBetweenInclusive(from, to);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(lenDays - 1));
  return clampRange(prevFrom, prevTo);
}

export async function GET(req: Request) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const url = new URL(req.url);
    const branch_id = url.searchParams.get("branch_id") || "";
    const preset = (url.searchParams.get("preset") || "today").toLowerCase(); // today | week | month | custom
    const group = (url.searchParams.get("group") || "day").toLowerCase(); // day | week | month
    const fromQ = url.searchParams.get("from") || "";
    const toQ = url.searchParams.get("to") || "";

    const now = new Date();

    let from: Date;
    let to: Date;

    if (preset === "week") {
      const s = startOfWeek(now);
      from = new Date(s);
      to = addDays(s, 6);
    } else if (preset === "month") {
      const s = startOfMonth(now);
      from = new Date(s);
      const end = new Date(s);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      to = end;
    } else if (preset === "custom") {
      if (!fromQ || !toQ) {
        return NextResponse.json({ ok: false, error: "from y to requeridos para custom" }, { status: 400 });
      }
      from = asDateOnly(fromQ);
      to = asDateOnly(toQ);
    } else {
      from = new Date(now);
      to = new Date(now);
    }

    const r = clampRange(from, to);
    const prev = makePrevRange(r.from, r.to);

    async function fetchRows(range: { from: Date; to: Date }) {
      let q = supabase
        .from("mixes")
        .select("id, created_at, branch_id")
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString());

      if (branch_id) q = q.eq("branch_id", branch_id);

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    const rows = await fetchRows(r);
    const prevRows = await fetchRows(prev);

    // agrupar serie
    const buckets = new Map<string, { label: string; count: number; sort: number }>();

    for (const m of rows as any[]) {
      const d = new Date(m.created_at);
      let keyDate: Date;

      if (group === "month") keyDate = startOfMonth(d);
      else if (group === "week") keyDate = startOfWeek(d);
      else {
        keyDate = new Date(d);
        keyDate.setHours(0, 0, 0, 0);
      }

      const label = labelFor(group, keyDate);
      const sort = keyDate.getTime();

      const key = `${label}_${sort}`;
      const cur = buckets.get(key);
      if (cur) cur.count += 1;
      else buckets.set(key, { label, count: 1, sort });
    }

    const series = Array.from(buckets.values())
      .sort((a, b) => a.sort - b.sort)
      .map((x) => ({ label: x.label, count: x.count }));

    const total = rows.length;
    const prevTotal = prevRows.length;

    const dayCount = daysBetweenInclusive(r.from, r.to);
    const avgPerDay = total / dayCount;

    const peak = series.reduce((acc, x) => (x.count > acc.count ? x : acc), { label: "-", count: 0 });

    const delta = total - prevTotal;
    const deltaPct = prevTotal > 0 ? (delta / prevTotal) * 100 : null;

    return NextResponse.json({
      ok: true,
      total,
      from: r.from.toISOString(),
      to: r.to.toISOString(),
      group,
      branch_id: branch_id || null,
      series,
      metrics: {
        days: dayCount,
        avg_per_day: Number.isFinite(avgPerDay) ? Number(avgPerDay.toFixed(2)) : 0,
        peak_label: peak.label,
        peak_count: peak.count,
        prev_total: prevTotal,
        delta,
        delta_pct: deltaPct === null ? null : Number(deltaPct.toFixed(1)),
      },
    });
  } catch (e: any) {
    console.error("admin/mixes/stats:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}