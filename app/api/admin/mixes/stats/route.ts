import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function isAdmin(req: Request) {
  const key = req.headers.get("x-admin-key") || "";
  return !!process.env.ADMIN_API_KEY && key === process.env.ADMIN_API_KEY;
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function parseDate(s: string) {
  const d = new Date(`${s}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function GET(req: Request) {
  try {
    if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

    const url = new URL(req.url);

    const branch_id = url.searchParams.get("branch_id") || ""; // opcional
    const preset = (url.searchParams.get("preset") || "day").toLowerCase(); // day|week|month|range
    let from = url.searchParams.get("from") || "";
    let to = url.searchParams.get("to") || "";

    const today = new Date();
    if (!from || !to) {
      if (preset === "week") {
        from = isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6));
        to = isoDate(today);
      } else if (preset === "month") {
        from = isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29));
        to = isoDate(today);
      } else {
        from = isoDate(today);
        to = isoDate(today);
      }
    }

    const dFrom = parseDate(from);
    const dTo = parseDate(to);
    if (!dFrom || !dTo) return NextResponse.json({ ok: false, error: "Fechas inválidas" }, { status: 400 });

    // to inclusive -> convertimos a < nextDay
    const nextTo = new Date(dTo);
    nextTo.setDate(nextTo.getDate() + 1);

    let q = supabase
      .from("mixes")
      .select("created_at,branch_id", { count: "exact" })
      .gte("created_at", dFrom.toISOString())
      .lt("created_at", nextTo.toISOString());

    if (branch_id) q = q.eq("branch_id", branch_id);

    // ⚠️ para contar por día traemos created_at (normalmente poco)
    const { data, error, count } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const by = new Map<string, number>();
    for (const r of data ?? []) {
      const day = String(r.created_at).slice(0, 10); // YYYY-MM-DD
      by.set(day, (by.get(day) ?? 0) + 1);
    }

    // Ordenar y rellenar días faltantes
    const out: Array<{ day: string; count: number }> = [];
    const cur = new Date(dFrom);
    while (cur.getTime() < nextTo.getTime()) {
      const key = isoDate(cur);
      out.push({ day: key, count: by.get(key) ?? 0 });
      cur.setDate(cur.getDate() + 1);
    }

    return NextResponse.json({
      ok: true,
      from,
      to,
      total: Number(count ?? 0),
      by_day: out,
    });
  } catch (e: any) {
    console.error("admin mixes stats error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}