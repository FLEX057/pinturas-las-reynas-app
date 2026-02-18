import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required.`);
  return v;
}

function adminAuth(req: Request) {
  const key = req.headers.get("x-admin-key") || "";
  const expected = process.env.ADMIN_API_KEY || "";
  if (!expected || key !== expected) {
    return false;
  }
  return true;
}

export async function POST(req: Request) {
  try {
    if (!adminAuth(req)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const mix_id = String(body?.mix_id ?? "").trim();
    if (!mix_id) {
      return NextResponse.json({ ok: false, error: "mix_id requerido" }, { status: 400 });
    }

    const supabaseUrl = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // 1) borrar detalle
    const d1 = await sb.from("mix_items").delete().eq("mix_id", mix_id);
    if (d1.error) {
      return NextResponse.json({ ok: false, error: d1.error.message }, { status: 500 });
    }

    // 2) borrar encabezado
    const d2 = await sb.from("mixes").delete().eq("id", mix_id);
    if (d2.error) {
      return NextResponse.json({ ok: false, error: d2.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}