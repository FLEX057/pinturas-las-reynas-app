import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfISOWeek(d: Date) {
  // Lunes como inicio
  const x = new Date(d);
  const day = x.getDay(); // 0=Dom
  const diff = (day === 0 ? -6 : 1 - day);
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function bucketKey(dateISO: string, group: "day" | "week" | "month") {
  const d = new Date(dateISO);
  if (group === "day") return ymd(d);
  if (group === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  // week
  const w = startOfISOWeek(d);
  return `W-${ymd(w)}`; // etiqueta semana por lunes
}

function json(raw: string) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function guardAdmin(req: Request) {
  const want = process.env.ADMIN_API_KEY || "";
  if (!want) return { ok: false, status: 500, error: "ADMIN_API_KEY no configurada" };

  const got = req.headers.get("x-admin-key") || "";
  if (!got || got !== want) return { ok: false, status: 401, error: "No autorizado (admin key)" };

  return { ok: true, status: 200, error: "" };
}

export async function GET(req: Request) {
  try {
    const g = guardAdmin(req);
    if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });

    const url = new URL(req.url);

    const from = (url.searchParams.get("from") || "").trim(); // YYYY-MM-DD
    const to = (url.searchParams.get("to") || "").trim();     // YYYY-MM-DD
    const group = (url.searchParams.get("group") || "day").toLowerCase() as "day" | "week" | "month";

    // branch_id opcional: si no viene => todas
    const branch_id = (url.searchParams.get("branch_id") || "").trim();
    const limitRaw = (url.searchParams.get("limit") || "200").trim();
    const limit = Math.max(1, Math.min(500, Number(limitRaw) || 200));

    if (!from || !to) {
      return NextResponse.json({ ok: false, error: "from y to requeridos (YYYY-MM-DD)" }, { status: 400 });
    }
    if (!["day", "week", "month"].includes(group)) {
      return NextResponse.json({ ok: false, error: "group inválido (day|week|month)" }, { status: 400 });
    }

    // ✅ FIX “HOY”: usamos [from 00:00, to+1 00:00) para evitar broncas de UTC
    const fromISO = `${from}T00:00:00`;
    const toISO = `${ymd(addDays(new Date(`${to}T00:00:00`), 1))}T00:00:00`;

    // Traemos branches para mapear nombres (por si haces ALL)
    const brRes = await supabase.from("branches").select("id,name").order("name", { ascending: true });
    const branches = brRes.data ?? [];
    const branchMap = new Map(branches.map((b: any) => [b.id, b.name]));

    let q = supabase
      .from("mixes")
      .select("id,created_at,mix_code,folio_num,branch_id,user_id,branches(name),users(name)")
      .gte("created_at", fromISO)
      .lt("created_at", toISO)
      .order("created_at", { ascending: false });

    if (branch_id) q = q.eq("branch_id", branch_id);

    const { data: mixes, error } = await q.limit(5000);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const rows = (mixes ?? []).map((m: any) => {
      const bname =
        (Array.isArray(m.branches) ? m.branches?.[0]?.name : m.branches?.name) ??
        branchMap.get(m.branch_id) ??
        m.branch_id;

      const uname =
        (Array.isArray(m.users) ? m.users?.[0]?.name : m.users?.name) ??
        "";

      return {
        id: m.id,
        created_at: m.created_at,
        mix_code: m.mix_code,
        folio_num: m.folio_num ?? null,
        branch_id: m.branch_id,
        branch_name: bname,
        user_id: m.user_id,
        user_name: uname,
      };
    });

    // Totales por sucursal
    const totalsByBranch: Array<{ branch_id: string; branch_name: string; count: number }> = [];
    const totMap = new Map<string, { branch_id: string; branch_name: string; count: number }>();

    for (const r of rows) {
      const key = r.branch_id;
      if (!totMap.has(key)) {
        totMap.set(key, { branch_id: key, branch_name: r.branch_name, count: 0 });
      }
      totMap.get(key)!.count += 1;
    }

    for (const v of totMap.values()) totalsByBranch.push(v);
    totalsByBranch.sort((a, b) => a.branch_name.localeCompare(b.branch_name));

    // Serie por bucket (día/semana/mes) + conteo por sucursal para ese bucket
    const seriesMap = new Map<
      string,
      {
        key: string;
        label: string;
        total: number;
        by_branch: Record<string, number>;
      }
    >();

    for (const r of rows) {
      const k = bucketKey(r.created_at, group);
      if (!seriesMap.has(k)) {
        seriesMap.set(k, { key: k, label: k, total: 0, by_branch: {} });
      }
      const s = seriesMap.get(k)!;
      s.total += 1;
      s.by_branch[r.branch_id] = (s.by_branch[r.branch_id] || 0) + 1;
    }

    // orden cronológico (para gráficas)
    const series = Array.from(seriesMap.values()).sort((a, b) => {
      // day/month: string sortable, week: W-YYYY-MM-DD
      const ax = a.key.startsWith("W-") ? a.key.slice(2) : a.key;
      const bx = b.key.startsWith("W-") ? b.key.slice(2) : b.key;
      return ax.localeCompare(bx);
    });

    // recent list (para reimpresión) — ya viene desc
    const recent = rows.slice(0, limit);

    return NextResponse.json({
      ok: true,
      meta: {
        from,
        to,
        group,
        branch_id: branch_id || null,
        fromISO,
        toISO,
      },
      branches: branches.map((b: any) => ({ id: b.id, name: b.name })),
      totals_by_branch: totalsByBranch,
      series,
      recent,
      total: rows.length,
    });
  } catch (e: any) {
    console.error("admin/mixes/summary error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}