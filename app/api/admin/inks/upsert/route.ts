import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAdminKey } from "../../_guard";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const Body = z.object({
  id: z.string().uuid().optional().nullable(),
  code: z.string().min(1).max(50).transform((v) => v.trim()),
  name: z.string().min(1).max(120).transform((v) => v.trim()),
  active: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  const deny = requireAdminKey(req);
  if (deny) return deny;

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Formato inválido" }, { status: 400 });
  }

  const { id, code, name, active } = parsed.data;

  // 1) si viene id => update directo
  if (id) {
    const { data, error } = await supabase
      .from("inks")
      .update({ code, name, active })
      .eq("id", id)
      .select("id,code,name,active,created_at")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, ink: data, mode: "update_by_id" });
  }

  // 2) si no viene id => buscamos por code
  const { data: existing, error: findErr } = await supabase
    .from("inks")
    .select("id")
    .eq("code", code)
    .maybeSingle();

  if (findErr) return NextResponse.json({ ok: false, error: findErr.message }, { status: 500 });

  if (existing?.id) {
    const { data, error } = await supabase
      .from("inks")
      .update({ name, active })
      .eq("id", existing.id)
      .select("id,code,name,active,created_at")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, ink: data, mode: "update_by_code" });
  }

  // 3) si no existe => insert
  const { data, error } = await supabase
    .from("inks")
    .insert({ code, name, active })
    .select("id,code,name,active,created_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ink: data, mode: "insert" });
}