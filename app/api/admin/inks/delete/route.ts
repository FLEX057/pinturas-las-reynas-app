import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAdminKey } from "../../_guard";

export const runtime = "nodejs";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const Body = z.object({
  id: z.string().uuid(),
});

export async function POST(req: Request) {
  const deny = requireAdminKey(req);
  if (deny) return deny;

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Formato inválido" }, { status: 400 });

  const { id } = parsed.data;

  const { data, error } = await supabase
    .from("inks")
    .update({ active: false })
    .eq("id", id)
    .select("id,code,name,software_code,active")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ink: data });
}