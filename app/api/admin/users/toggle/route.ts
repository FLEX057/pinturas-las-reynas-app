import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAdminKey } from "../../_guard";

export const runtime = "nodejs";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const Body = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
});

export async function POST(req: Request) {
  const deny = requireAdminKey(req);
  if (deny) return deny;

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Formato inválido" }, { status: 400 });

  const { id, active } = parsed.data;

  const { data, error } = await supabase
    .from("users")
    .update({ active })
    .eq("id", id)
    .select("id,name,role,branch_id,active,created_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, user: data });
}