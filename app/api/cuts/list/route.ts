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
  limit: z.coerce.number().min(1).max(500).optional().default(200),
});

async function handle(branch_id: string, limit: number) {
  const { data, error } = await supabase
    .from("cuts")
    .select(
      "id,branch_id,user_id,cut_type,cut_date,folio_num,cash,card,transfer,total_day,sum_methods,diff,diff_reason,note,ticket_path,extra_reference,created_at"
    )
    .eq("branch_id", branch_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: data ?? [] });
}

// ✅ POST (lo que usa tu UI)
export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Formato inválido", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { branch_id, limit } = parsed.data;
    return handle(branch_id, limit);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}

// ✅ GET (por si alguna vez lo llamas desde navegador)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const branch_id = String(searchParams.get("branch_id") ?? "").trim();
    const limit = Number(searchParams.get("limit") ?? "200");

    const parsed = Body.safeParse({ branch_id, limit });
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Parámetros inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    return handle(parsed.data.branch_id, parsed.data.limit);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}
