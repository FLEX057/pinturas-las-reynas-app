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

export async function GET(req: Request) {
  try {
    if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

    const url = new URL(req.url);
    const branch_id = url.searchParams.get("branch_id") || "";

    let q = supabase
      .from("users")
      .select("id,name,branch_id,active,role")
      .eq("role", "mixer")
      .neq("active", false)
      .order("name", { ascending: true });

    if (branch_id) q = q.eq("branch_id", branch_id);

    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, mixers: data ?? [] });
  } catch (e: any) {
    console.error("admin/users/mixers:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}