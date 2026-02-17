import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function safeNum(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const branch_id = (url.searchParams.get("branch_id") || "").trim();
    const folioRaw = (url.searchParams.get("folio") || "").trim();
    const folio = Number(folioRaw);

    if (!branch_id) {
      return NextResponse.json({ ok: false, error: "branch_id requerido" }, { status: 400 });
    }
    if (!Number.isFinite(folio) || folio <= 0) {
      return NextResponse.json({ ok: false, error: "folio inválido" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("mixes")
      .select("id,mix_code,folio_num,note,created_at,branch_id,user_id")
      .eq("branch_id", branch_id)
      .eq("folio_num", folio)
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: error?.message ?? "No encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      mix: {
        id: (data as any).id,
        mix_code: (data as any).mix_code ?? null,
        folio_num: safeNum((data as any).folio_num),
        note: (data as any).note ?? null,
        created_at: (data as any).created_at,
        branch_id: (data as any).branch_id,
        user_id: (data as any).user_id,
      },
    });
  } catch (e: any) {
    console.error("mixes/by-folio error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}