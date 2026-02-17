import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const Body = z.object({
  branch_id: z.string().uuid(),
  user_id: z.string().uuid(),
  note: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        ink_code: z
          .string()
          .min(2)
          .max(40)
          .transform((v) => v.trim().toUpperCase()),
        amount: z.coerce.number().positive(),
      })
    )
    .min(1),
});

// código humano (por si lo quieres mostrar), pero el folio manda
function makeMixCode() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const rnd = Math.floor(Math.random() * 900000 + 100000);
  return `MIX-${y}${m}${da}-${rnd}`;
}

function isUniqueViolation(msg?: string) {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("duplicate key") ||
    m.includes("unique constraint") ||
    m.includes("ux_mixes_branch_folio")
  );
}

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Formato inválido" }, { status: 400 });
    }

    const { branch_id, user_id, note, items } = parsed.data;

    // 1) resolver tintas por code
    const codes = items.map((i) => i.ink_code);
    const { data: inks, error: inkErr } = await supabase
      .from("inks")
      .select("id,code,name,active")
      .in("code", codes);

    if (inkErr) return NextResponse.json({ ok: false, error: inkErr.message }, { status: 500 });

    const map = new Map((inks ?? []).map((i: any) => [String(i.code).toUpperCase(), i]));
    const missing = codes.filter((c) => !map.has(c));
    if (missing.length) {
      return NextResponse.json(
        { ok: false, error: `Tintas no encontradas: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    // 2) asignar folio_num por sucursal (con retry si hay choque)
    const mix_code = makeMixCode();
    let lastErr: any = null;

    for (let attempt = 1; attempt <= 8; attempt++) {
      // max folio_num por sucursal
      const { data: maxRow, error: maxErr } = await supabase
        .from("mixes")
        .select("folio_num")
        .eq("branch_id", branch_id)
        .order("folio_num", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (maxErr) {
        return NextResponse.json({ ok: false, error: maxErr.message }, { status: 500 });
      }

      const currentMax = Number(maxRow?.folio_num ?? 0);
      const nextFolio = Number.isFinite(currentMax) ? currentMax + 1 : 1;

      const { data: mix, error: mixErr } = await supabase
        .from("mixes")
        .insert({
          branch_id,
          user_id,
          mix_code,
          folio_num: nextFolio,
          note: note ?? null,
        })
        .select("id,mix_code,created_at,folio_num")
        .single();

      if (!mixErr && mix) {
        // 3) crear items
        const payload = items.map((it) => ({
          mix_id: mix.id,
          ink_id: map.get(it.ink_code)!.id,
          amount: it.amount,
        }));

        const { error: itemsErr } = await supabase.from("mix_items").insert(payload);
        if (itemsErr) return NextResponse.json({ ok: false, error: itemsErr.message }, { status: 500 });

        return NextResponse.json({
          ok: true,
          mix_id: mix.id,
          mix_code: mix.mix_code,
          folio_num: mix.folio_num ?? null,
        });
      }

      lastErr = mixErr;

      // si chocó unique, reintenta
      if (isUniqueViolation(mixErr?.message)) continue;

      // otro error: aborta
      return NextResponse.json({ ok: false, error: mixErr?.message ?? "Error" }, { status: 500 });
    }

    return NextResponse.json(
      { ok: false, error: lastErr?.message ?? "No se pudo asignar folio" },
      { status: 500 }
    );
  } catch (e: any) {
    console.error("mixes/create error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}