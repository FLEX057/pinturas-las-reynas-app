import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function deny(msg = "No autorizado") {
  return NextResponse.json({ ok: false, error: msg }, { status: 401 });
}

function parseYmd(ymd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return { y, mo, d };
}

function localDayStartISO(ymd: string) {
  const p = parseYmd(ymd);
  if (!p) return null;
  return new Date(p.y, p.mo, p.d, 0, 0, 0, 0).toISOString();
}

function localDayEndISO(ymd: string) {
  const p = parseYmd(ymd);
  if (!p) return null;
  return new Date(p.y, p.mo, p.d, 23, 59, 59, 999).toISOString();
}

function todayYmdLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function safeNum(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

export async function GET(req: Request) {
  try {
    // ✅ Admin key
    const key = req.headers.get("x-admin-key") || "";
    if (!process.env.ADMIN_API_KEY) return deny("Falta ADMIN_API_KEY en .env");
    if (!key || key !== process.env.ADMIN_API_KEY) return deny();

    const url = new URL(req.url);

    const branch_id = (url.searchParams.get("branch_id") || "").trim(); // opcional
    const from = (url.searchParams.get("from") || "").trim(); // opcional
    const to = (url.searchParams.get("to") || "").trim(); // opcional
    const limit = safeNum(url.searchParams.get("limit")) ?? 200;

    // ✅ Default: HOY
    const fromYmd = from || todayYmdLocal();
    const toYmd = to || todayYmdLocal();

    const startISO = localDayStartISO(fromYmd);
    const endISO = localDayEndISO(toYmd);

    if (!startISO || !endISO) {
      return NextResponse.json(
        { ok: false, error: "from/to inválidos (usa YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    let q = supabase
      .from("mixes")
      .select("id,mix_code,folio_num,folio,note,created_at,branch_id,user_id")
      .gte("created_at", startISO)
      .lte("created_at", endISO)
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(500, Number(limit))));

    if (branch_id) q = q.eq("branch_id", branch_id);

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const mixes = (data ?? []).map((m: any) => ({
      id: m.id,
      mix_code: m.mix_code ?? null,
      folio_num: safeNum(m.folio_num) ?? safeNum(m.folio) ?? null,
      note: m.note ?? null,
      created_at: m.created_at,
      branch_id: m.branch_id,
      user_id: m.user_id,
    }));

    return NextResponse.json({ ok: true, mixes });
  } catch (e: any) {
    console.error("admin/mixes/history error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}