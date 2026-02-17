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
  cut_type: z.enum(["DAY", "EXTRA"]),
  cut_date: z.string().min(10).max(10), // YYYY-MM-DD

  cash: z.number().nonnegative(),
  card: z.number().nonnegative(),
  transfer: z.number().nonnegative(),
  total_day: z.number().nonnegative(),

  diff_reason: z.string().nullable().optional(),
  note: z.string().nullable().optional(),

  ticket_path: z.string().min(1),
  extra_reference: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Formato inválido" }, { status: 400 });
    }

    const input = parsed.data;

    // 1) Si intentan DAY, revisa si ya existe un DAY en esa fecha
    let finalType: "DAY" | "EXTRA" = input.cut_type;

    if (input.cut_type === "DAY") {
      const { data: exists, error: exErr } = await supabase
        .from("cuts")
        .select("id")
        .eq("branch_id", input.branch_id)
        .eq("cut_date", input.cut_date)
        .eq("cut_type", "DAY")
        .limit(1);

      if (exErr) {
        return NextResponse.json({ ok: false, error: exErr.message }, { status: 500 });
      }

      if ((exists ?? []).length > 0) {
        finalType = "EXTRA"; // ✅ auto-extra
      }
    }

    // 2) Folio siguiente
    const { data: fol, error: folErr } = await supabase.rpc("next_folio", {
      p_branch: input.branch_id,
      p_date: input.cut_date,
    });

    if (folErr) {
      return NextResponse.json({ ok: false, error: folErr.message }, { status: 500 });
    }

    const payload = {
      branch_id: input.branch_id,
      user_id: input.user_id,
      cut_type: finalType,
      cut_date: input.cut_date,

      folio_num: Number(fol),

      cash: input.cash,
      card: input.card,
      transfer: input.transfer,
      total_day: input.total_day,

      diff_reason: input.diff_reason ?? null,
      note: input.note ?? null,

      ticket_path: input.ticket_path,

      extra_reference: finalType === "EXTRA" ? (input.extra_reference ?? "Corte extra") : null,
    };

    const { data, error } = await supabase.from("cuts").insert(payload).select("*").single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, cut: data, final_cut_type: finalType });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}