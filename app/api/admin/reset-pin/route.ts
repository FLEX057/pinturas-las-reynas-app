import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { z } from "zod";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const Body = z.object({
  user_name: z.string().min(1),
  new_pin: z.string().min(4).max(10),
});

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Formato inválido", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { user_name, new_pin } = parsed.data;
    const pin_hash = await bcrypt.hash(new_pin, 10);

    const { data, error } = await supabase
      .from("users")
      .update({ pin_hash })
      .eq("name", user_name)
      .select("id,name,role,branch_id,active")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "No se pudo actualizar" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, user: data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Error interno" },
      { status: 500 }
    );
  }
}