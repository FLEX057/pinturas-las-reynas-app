import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function isAdmin(req: Request) {
  const key = req.headers.get("x-admin-key") || "";
  return !!process.env.ADMIN_API_KEY && key === process.env.ADMIN_API_KEY;
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
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const limRaw = Number(url.searchParams.get("limit") || "50");
    const limit = Number.isFinite(limRaw) && limRaw > 0 ? Math.min(limRaw, 200) : 50;

    if (!from || !to) return NextResponse.json({ ok: false, error: "from y to requeridos" }, { status: 400 });

    const dFrom = parseDate(from);
    const dTo = parseDate(to);
    if (!dFrom || !dTo) return NextResponse.json({ ok: false, error: "Fechas inválidas" }, { status: 400 });

    const nextTo = new Date(dTo);
    nextTo.setDate(nextTo.getDate() + 1);

    let q = supabase
      .from("mixes")
      .select("id,created_at,branch_id,mix_code,folio_num,note,branches(name),users(name)")
      .gte("created_at", dFrom.toISOString())
      .lt("created_at", nextTo.toISOString())
      .order("created_at", { ascending: false })
      .limit(limit);

    if (branch_id) q = q.eq("branch_id", branch_id);

    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, mixes: data ?? [] });
  } catch (e: any) {
    console.error("admin mixes recent error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}