import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function firstObj<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}
function safeNum(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mix_id = (url.searchParams.get("mix_id") || "").trim();

    if (!mix_id) {
      return NextResponse.json({ ok: false, error: "mix_id requerido" }, { status: 400 });
    }

    const { data: mix, error: mixErr } = await supabase
      .from("mixes")
      .select("id,mix_code,folio_num,note,created_at,branch_id,user_id,branches(name),users(name)")
      .eq("id", mix_id)
      .single();

    if (mixErr || !mix) {
      return NextResponse.json({ ok: false, error: mixErr?.message ?? "No encontrado" }, { status: 404 });
    }

    const branchRel = firstObj<{ name: string }>((mix as any).branches);
    const userRel = firstObj<{ name: string }>((mix as any).users);

    const { data: items, error: itErr } = await supabase
      .from("mix_items")
      .select("amount,inks(code,name)")
      .eq("mix_id", mix_id);

    if (itErr) return NextResponse.json({ ok: false, error: itErr.message }, { status: 500 });

    const rows = (items ?? [])
      .map((it: any) => {
        const ink = firstObj<{ code: string; name: string }>(it.inks);
        return {
          ink_code: String(ink?.code ?? "").trim(),
          ink_name: String(ink?.name ?? "").trim(),
          amount: safeNum(it.amount) ?? 0,
        };
      })
      .filter((r) => r.ink_code);

    return NextResponse.json({
      ok: true,
      mix: {
        id: (mix as any).id,
        mix_code: (mix as any).mix_code ?? null,
        folio_num: safeNum((mix as any).folio_num),
        note: (mix as any).note ?? null,
        created_at: (mix as any).created_at,
        branch_id: (mix as any).branch_id,
        user_id: (mix as any).user_id,
        branch_name: branchRel?.name ?? "",
        user_name: userRel?.name ?? "",
      },
      items: rows,
    });
  } catch (e: any) {
    console.error("mixes/get error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}