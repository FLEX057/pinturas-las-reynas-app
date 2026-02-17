import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function clampInt(v: any, def: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function parseYMD(ymd: string) {
  // espera "YYYY-MM-DD"
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, mo, d };
}

function localMidnightISO(ymd: string) {
  const p = parseYMD(ymd);
  if (!p) return null;
  // Date en horario local del server -> a ISO (UTC) para supabase
  const dt = new Date(p.y, p.mo - 1, p.d, 0, 0, 0, 0);
  return dt.toISOString();
}

function localNextDayMidnightISO(ymd: string) {
  const p = parseYMD(ymd);
  if (!p) return null;
  const dt = new Date(p.y, p.mo - 1, p.d, 0, 0, 0, 0);
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    // ✅ Compatibilidad: branch_id / branch / branchId
    const branch_id =
      url.searchParams.get("branch_id") ||
      url.searchParams.get("branch") ||
      url.searchParams.get("branchId") ||
      "";

    if (!branch_id) {
      return NextResponse.json({ ok: false, error: "branch_id requerido" }, { status: 400 });
    }

    const limit = clampInt(url.searchParams.get("limit"), 200, 1, 1000);

    const from = (url.searchParams.get("from") || "").trim(); // YYYY-MM-DD
    const to = (url.searchParams.get("to") || "").trim();     // YYYY-MM-DD

    let q = supabase
      .from("mixes")
      .select("id, mix_code, folio_num, note, created_at, branch_id, user_id")
      .eq("branch_id", branch_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    // ✅ Si hay rango, incluir TODO el día "to" (hasta el inicio del siguiente día)
    if (from && to) {
      const fromISO = localMidnightISO(from);
      const toISO = localNextDayMidnightISO(to);

      if (!fromISO || !toISO) {
        return NextResponse.json({ ok: false, error: "from/to inválidos (usa YYYY-MM-DD)" }, { status: 400 });
      }

      q = q.gte("created_at", fromISO).lt("created_at", toISO);
    }

    const { data, error } = await q;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, mixes: Array.isArray(data) ? data : [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}