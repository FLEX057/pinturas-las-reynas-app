import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminKey } from "../../_guard";

export const runtime = "nodejs";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: Request) {
  const deny = requireAdminKey(req);
  if (deny) return deny;

  const { data, error } = await supabase
    .from("users")
    .select("id,name,role,branch_id,active,created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, users: data ?? [] });
}