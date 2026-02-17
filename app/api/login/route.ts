import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const Body = z.object({
  name: z.string().min(2).max(80),
  pin: z.string().min(4).max(10),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Formato inválido" }, { status: 400 });
  }

  const name = parsed.data.name.trim();
  const pin = parsed.data.pin;

  // Busca por nombre exacto (si quieres lo hacemos “insensible a mayúsculas” después)
  const { data: u, error } = await supabase
    .from("users")
    .select("id,name,role,branch_id,pin_hash,active")
    .eq("name", name)
    .eq("active", true)
    .single();

  if (error || !u) {
    return NextResponse.json({ ok: false, error: "Usuario o PIN incorrecto" }, { status: 401 });
  }

  const match = await bcrypt.compare(pin, u.pin_hash);
  if (!match) {
    return NextResponse.json({ ok: false, error: "Usuario o PIN incorrecto" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    user: { id: u.id, name: u.name, role: u.role, branch_id: u.branch_id },
  });
}