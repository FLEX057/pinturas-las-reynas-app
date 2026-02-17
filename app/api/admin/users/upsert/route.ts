import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAdminKey } from "../../_guard";

export const runtime = "nodejs";
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const Body = z.object({
  name: z.string().min(2).max(80),
  role: z.enum(["admin", "cashier", "mixer"]),
  branch_id: z.string().uuid().nullable(),
  active: z.boolean().optional().default(true),
  pin: z.string().min(4).max(10).optional(), // si viene, se actualiza
});

export async function POST(req: Request) {
  const deny = requireAdminKey(req);
  if (deny) return deny;

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Formato inválido" }, { status: 400 });

  const { name, role, branch_id, active, pin } = parsed.data;

  const payload: any = { name, role, branch_id, active };
  if (pin) payload.pin_hash = await bcrypt.hash(pin, 10);

  const { data, error } = await supabase
    .from("users")
    .upsert(payload, { onConflict: "name" })
    .select("id,name,role,branch_id,active,created_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, user: data });
}