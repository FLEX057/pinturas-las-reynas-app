import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Cambia esto si tu bucket se llama distinto:
const BUCKET = process.env.SUPABASE_TICKETS_BUCKET || "tickets";

function extFromName(name: string) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name || "");
  const e = (m?.[1] || "jpg").toLowerCase();
  // lista segura
  if (["jpg", "jpeg", "png", "webp", "pdf"].includes(e)) return e;
  return "jpg";
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const file = form.get("file");
    const branch_id = String(form.get("branch_id") || "").trim();

    if (!branch_id) {
      return NextResponse.json({ ok: false, error: "branch_id requerido" }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Archivo requerido (field: file)" }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const ext = extFromName(file.name);
    const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const path = `${branch_id}/${filename}`;

    // Asegura que el bucket exista (si no, Supabase devuelve error Bucket not found)
    const up = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

    if (up.error) {
      console.error("ticket upload error:", up.error);
      return NextResponse.json(
        { ok: false, error: up.error.message || "Error subiendo ticket" },
        { status: 500 }
      );
    }

    // ✅ IMPORTANTE: SIEMPRE regresar path
    return NextResponse.json({ ok: true, path });
  } catch (e: any) {
    console.error("ticket upload exception:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}