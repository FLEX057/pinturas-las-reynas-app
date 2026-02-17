import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function guardAdmin(req: Request) {
  const key = req.headers.get("x-admin-key") || "";
  const expected = process.env.ADMIN_API_KEY || "";
  return expected && key === expected;
}

function escCsv(v: any) {
  const s = String(v ?? "");
  // CSV RFC-ish: envolver en comillas si tiene coma/quote/salto de línea
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseISODate(s: string | null) {
  if (!s) return null;
  const t = String(s).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}

export async function GET(req: Request) {
  try {
    if (!guardAdmin(req)) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const url = new URL(req.url);
    const branch_id = (url.searchParams.get("branch_id") || "").trim(); // "" => todas
    const from = parseISODate(url.searchParams.get("from"));
    const to = parseISODate(url.searchParams.get("to"));

    if (!from || !to) {
      return NextResponse.json({ ok: false, error: "from y to requeridos (YYYY-MM-DD)" }, { status: 400 });
    }

    let q = supabase
      .from("mixes")
      .select("id,created_at,mix_code,folio_num,branch_id,user_id,branches(name),users(name)")
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59`)
      .order("created_at", { ascending: false })
      .limit(10000);

    if (branch_id) q = q.eq("branch_id", branch_id);

    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const header = [
      "created_at",
      "day",
      "branch",
      "user",
      "folio_num",
      "label",
      "mix_id",
    ];

    const lines: string[] = [];
    lines.push(header.join(","));

    for (const m of data ?? []) {
      const b = Array.isArray((m as any).branches) ? (m as any).branches[0] : (m as any).branches;
      const u = Array.isArray((m as any).users) ? (m as any).users[0] : (m as any).users;
      const created_at = String((m as any).created_at ?? "");
      const day = created_at.slice(0, 10);
      const branchName = String(b?.name ?? (m as any).branch_id ?? "");
      const userName = String(u?.name ?? (m as any).user_id ?? "");
      const folio = (m as any).folio_num ?? "";
      const label = folio ? `N${folio}` : (m as any).mix_code ?? "";
      const row = [
        escCsv(created_at),
        escCsv(day),
        escCsv(branchName),
        escCsv(userName),
        escCsv(folio),
        escCsv(label),
        escCsv((m as any).id),
      ];
      lines.push(row.join(","));
    }

    const csv = lines.join("\r\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="mezclas-${branch_id ? "sucursal" : "todas"}-${from}_a_${to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("admin/mixes/csv error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}