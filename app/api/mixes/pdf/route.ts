// app/api/mixes/pdf/route.ts
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function firstObj<T>(v: T | T[] | null | undefined): T | T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function num(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtQty(v: number) {
  const s = v.toFixed(3);
  return s.replace(/0+$/, "").replace(/\.$/, "");
}

// bwip-js wrapper
async function bwipPng(opts: any): Promise<Buffer> {
  const mod: any = await import("bwip-js");
  const bwip: any = mod?.default ?? mod;

  return await new Promise<Buffer>((resolve, reject) => {
    try {
      bwip.toBuffer(opts, (err: any, png: Buffer) => {
        if (err) return reject(err);
        resolve(png);
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function makeQR(text: string) {
  return bwipPng({
    bcid: "qrcode",
    text,
    scale: 5,
    eclevel: "M",
    includetext: false,
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mix_id = url.searchParams.get("mix_id") || "";

    if (!mix_id) {
      return Response.json({ ok: false, error: "mix_id requerido" }, { status: 400 });
    }

    const { data: mix, error: mixErr } = await supabase
      .from("mixes")
      .select("id,mix_code,folio_num,note,created_at,branches(name),users(name)")
      .eq("id", mix_id)
      .single();

    if (mixErr || !mix) {
      return Response.json({ ok: false, error: mixErr?.message ?? "No encontrado" }, { status: 404 });
    }

    const branchRel = firstObj<{ name: string }>((mix as any).branches);
    const userRel = firstObj<{ name: string }>((mix as any).users);

    const branchName = branchRel?.name ?? "";
    const userName = userRel?.name ?? "";
    const mixCode = String((mix as any).mix_code ?? "");
    const folioNum = (mix as any).folio_num ?? null;

    const titleCode =
      Number.isFinite(Number(folioNum)) && Number(folioNum) > 0 ? `Folio ${Number(folioNum)}` : mixCode;

    const { data: items, error: itErr } = await supabase
      .from("mix_items")
      .select("amount,inks(code,name)")
      .eq("mix_id", mix_id);

    if (itErr) {
      return Response.json({ ok: false, error: itErr.message }, { status: 500 });
    }

    const rows = (items ?? [])
      .map((it: any) => {
        const ink = firstObj<{ code: string; name: string }>(it.inks);
        const code = String(ink?.code ?? "").trim().toUpperCase();
        const name = String(ink?.name ?? "").trim();
        const qty = fmtQty(num(it.amount));
        return { code, name, qty };
      })
      .filter((r) => r.code && r.qty);

    if (rows.length === 0) {
      return Response.json({ ok: false, error: "No hay tintas para codificar" }, { status: 400 });
    }

    // ✅ PAYLOAD: Codigo \r Cantidad \r ... y al final Backspace
    let payload = "";
    for (const r of rows) payload += `${r.code}\r${r.qty}\r`;
    payload += "\b"; // backspace

    // PDF setup
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    let logo: any = null;
    try {
      const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
      const r = await fetch(`${base}/logo.png`, { cache: "no-store" });
      if (r.ok) logo = await pdf.embedPng(await r.arrayBuffer());
    } catch {}

    const pageW = 612;
    const pageH = 792;
    const margin = 40;
    const page = pdf.addPage([pageW, pageH]);

    const text = (t: string, x: number, y: number, s = 11, b = false) =>
      page.drawText(t, { x, y, size: s, font: b ? bold : font, color: rgb(0, 0, 0) });

    const hr = (yy: number) =>
      page.drawLine({
        start: { x: margin, y: yy },
        end: { x: pageW - margin, y: yy },
        thickness: 1,
        color: rgb(0.82, 0.82, 0.82),
      });

    // HEADER
    const top = pageH - 40;

    if (logo) {
      const w = 82;
      const h = (logo.height / logo.width) * w;
      page.drawImage(logo, { x: margin, y: top - h + 6, width: w, height: h });
    }

    text('Pinturas "Las Reynas"', margin + 110, top - 16, 18, true);
    text("Ticket de Igualacion", margin + 110, top - 38, 12);
    text(`Sucursal: ${branchName}`, margin + 110, top - 56, 11);
    text(`Igualador: ${userName}`, margin + 110, top - 72, 11);
    text(`Mezcla: ${titleCode}`, margin, top - 96, 11, true);

    let y = top - 112;
    hr(y);
    y -= 22;

    // LISTA
    text("Detalle de tintas", margin, y, 12, true);
    y -= 16;

    const colCodeX = margin;
    const colInkX = margin + 150;              // 👈 columna "Tinta"
    const colQtyX = pageW - margin - 95;

    text("Codigo", colCodeX, y, 10, true);
    text("Tinta", colInkX, y, 10, true);
    text("Cantidad", colQtyX, y, 10, true);

    y -= 8;
    hr(y);
    y -= 14;

    for (const r of rows) {
      text(r.code, colCodeX, y, 9, true);
      text(r.name.slice(0, 34), colInkX, y, 9);
      text(r.qty, colQtyX, y, 9);
      y -= 14;
      if (y < 160) break; // deja espacio abajo para QR + nota
    }

    // ✅ QR: 2 renglones debajo del último renglón de tintas, alineado a columna "Tinta"
    // (cada renglón son ~14px en este layout)
    y -= 28;

    const png = await makeQR(payload);
    const img = await pdf.embedPng(png);

    const qrSize = 120;      // ajusta si lo quieres más chico
    const qrX = colInkX;     // 👈 alineado con columna Tinta
    const qrY = y - qrSize;  // y actual ya está en el “cursor” de texto

    // si se fuera a salir de la hoja, lo subimos un poquito
    const safeQrY = Math.max(60, qrY);
    page.drawImage(img, { x: qrX, y: safeQrY, width: qrSize, height: qrSize });

    // Nota (debajo del QR, sin encimarse)
    let noteY = safeQrY - 18;
    if ((mix as any).note) {
      if (noteY < 60) noteY = 60;
      hr(noteY + 12);
      text("Nota:", margin, noteY, 9, true);
      text(String((mix as any).note).slice(0, 120), margin + 40, noteY, 9);
    }

    hr(46);
    text("QR: Codigo Enter Cantidad Enter ... y al final Backspace.", margin, 30, 9);

    const bytes = await pdf.save();
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="igualacion-${titleCode}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("mixes/pdf error:", e);
    return Response.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}