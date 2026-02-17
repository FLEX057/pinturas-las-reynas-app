import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const Body = z.object({
  user_id: z.string().uuid(),
  pin: z.string().min(3).max(20),
  mode: z.enum(["mixes", "cuts", "both"]).default("mixes"),
  branch_id: z.string().uuid().optional(),
});

async function assertAdmin(user_id: string, pin: string) {
  const { data, error } = await supabase
    .from("users")
    .select("id, role, pin")
    .eq("id", user_id)
    .single();

  if (error || !data) return { ok: false, error: "Usuario no encontrado" as const };
  if (String((data as any).pin ?? "") !== String(pin)) return { ok: false, error: "PIN incorrecto" as const };
  if ((data as any).role !== "admin") return { ok: false, error: "No autorizado" as const };

  return { ok: true as const };
}

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Formato inválido" }, { status: 400 });
    }

    const { user_id, pin, mode, branch_id } = parsed.data;

    const auth = await assertAdmin(user_id, pin);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

    if (mode === "mixes" || mode === "both") {
      if (branch_id) {
        const { data: mixIds, error: midErr } = await supabase
          .from("mixes")
          .select("id")
          .eq("branch_id", branch_id);

        if (midErr) return NextResponse.json({ ok: false, error: midErr.message }, { status: 500 });

        const ids = (mixIds ?? []).map((x: any) => x.id).filter(Boolean);

        if (ids.length) {
          const { error: delItemsErr } = await supabase.from("mix_items").delete().in("mix_id", ids);
          if (delItemsErr) return NextResponse.json({ ok: false, error: delItemsErr.message }, { status: 500 });
        }

        const { error: delMixErr } = await supabase.from("mixes").delete().eq("branch_id", branch_id);
        if (delMixErr) return NextResponse.json({ ok: false, error: delMixErr.message }, { status: 500 });
      } else {
        const { error: delItemsErr } = await supabase
          .from("mix_items")
          .delete()
          .neq("mix_id", "00000000-0000-0000-0000-000000000000");
        if (delItemsErr) return NextResponse.json({ ok: false, error: delItemsErr.message }, { status: 500 });

        const { error: delMixErr } = await supabase
          .from("mixes")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
        if (delMixErr) return NextResponse.json({ ok: false, error: delMixErr.message }, { status: 500 });
      }
    }

    if (mode === "cuts" || mode === "both") {
      if (branch_id) {
        const { error: delCutsErr } = await supabase.from("cuts").delete().eq("branch_id", branch_id);
        if (delCutsErr) return NextResponse.json({ ok: false, error: delCutsErr.message }, { status: 500 });
      } else {
        const { error: delCutsErr } = await supabase
          .from("cuts")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
        if (delCutsErr) return NextResponse.json({ ok: false, error: delCutsErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, mode, branch_id: branch_id ?? null });
  } catch (e: any) {
    console.error("admin/reset error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}