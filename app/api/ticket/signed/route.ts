import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const bucket = process.env.SUPABASE_TICKET_BUCKET;
    if (!bucket) {
      return NextResponse.json(
        { ok: false, error: "Falta SUPABASE_TICKET_BUCKET en .env.local" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const path = String(searchParams.get("path") ?? "").trim();

    if (!path) {
      return NextResponse.json({ ok: false, error: "path requerido" }, { status: 400 });
    }

    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 5);

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "No se pudo firmar URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, url: data.signedUrl });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}
