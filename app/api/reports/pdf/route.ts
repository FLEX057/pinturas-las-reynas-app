import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const money = (n: number) => n.toFixed(2);
const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const branch_id = url.searchParams.get("branch_id")!;
    const from = url.searchParams.get("from")!;
    const to = url.searchParams.get("to")!;
    const only_diffs = url.searchParams.get("only_diffs") === "1";

    if (!branch_id || !from || !to) {
      return Response.json({ ok: false, error: "Parámetros incompletos" }, { status: 400 });
    }

    const { data: branch } = await supabase
      .from("branches")
      .select("name")
      .eq("id", branch_id)
      .single();

    let q = supabase
      .from("cuts")
      .select("*")
      .eq("branch_id", branch_id)
      .gte("cut_date", from)
      .lte("cut_date", to)
      .order("cut_date", { ascending: true })
      .order("folio_num", { ascending: true });

    if (only_diffs) q = q.neq("diff", 0);

    const { data: rows } = await q;

    const totals = (rows ?? []).reduce(
      (a: any, r: any) => {
        a.cash += num(r.cash);
        a.card += num(r.card);
        a.transfer += num(r.transfer);
        a.total += num(r.total_day);
        a.diff += num(r.diff);
        return a;
      },
      { cash: 0, card: 0, transfer: 0, total: 0, diff: 0 }
    );

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // Logo (public/logo.png)
    let logo: any;
    try {
      const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
      const r = await fetch(`${base}/logo.png`, { cache: "no-store" });
      if (r.ok) logo = await pdf.embedPng(await r.arrayBuffer());
    } catch {}

    const pageW = 612;
    const pageH = 792;

    const page = pdf.addPage([pageW, pageH]);

    const margin = 40;
    const line = 16;

    const text = (t: string, x: number, y: number, s = 11, b = false) =>
      page.drawText(t, { x, y, size: s, font: b ? bold : font });

    const hr = (yy: number) =>
      page.drawLine({
        start: { x: margin, y: yy },
        end: { x: pageW - margin, y: yy },
        thickness: 1,
        color: rgb(0.75, 0.75, 0.75),
      });

    // =========================
    // HEADER (con espacio fijo)
    // =========================
    const headerTop = pageH - 42;           // arriba
    const headerHeight = 92;               // alto reservado para logo + título (evita sobreposición)
    const headerBottom = headerTop - headerHeight;

    // Fondo sutil del header (opcional, muy ligero)
    page.drawRectangle({
      x: margin,
      y: headerBottom - 8,
      width: pageW - margin * 2,
      height: headerHeight + 16,
      color: rgb(0.97, 0.97, 0.97),
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 1,
    });

    // Logo a la izquierda
    if (logo) {
      const w = 80;
      const h = (logo.height / logo.width) * w;
      const logoY = headerTop - h; // alineado arriba
      page.drawImage(logo, { x: margin + 10, y: logoY, width: w, height: h });
    }

    // Títulos a la derecha del logo
    const titleX = margin + 110;
    text('Pinturas "Las Reynas"', titleX, headerTop - 20, 18, true);
    text("Reporte de cortes", titleX, headerTop - 44, 12, false);

    // Meta (sucursal / periodo) debajo del título
    text(`Sucursal: ${branch?.name ?? ""}`, titleX, headerTop - 66, 11, false);
    text(`Periodo: ${from} a ${to}`, titleX, headerTop - 82, 11, false);

    // Línea divisoria debajo del header (SIEMPRE debajo del logo)
    hr(headerBottom - 12);

    // y inicial ya debajo del header
    let y = headerBottom - 34;

    // =========================
    // RESUMEN
    // =========================
    text("Resumen general", margin, y, 13, true);
    y -= line * 1.4;

    text(`Efectivo: $${money(totals.cash)}`, margin, y);
    text(`Tarjeta: $${money(totals.card)}`, margin + 220, y);
    y -= line;

    text(`Transferencia: $${money(totals.transfer)}`, margin, y);
    text(`Total del día: $${money(totals.total)}`, margin + 220, y);
    y -= line;

    text(`Diferencia acumulada: $${money(totals.diff)}`, margin, y, 11, true);
    y -= line * 1.2;

    hr(y);
    y -= line * 1.4;

    // =========================
    // TABLA (más legible)
    // =========================
    text("Detalle de cortes", margin, y, 13, true);
    y -= line * 1.3;

    // Encabezados
    const cols = {
      date: margin,
      folio: margin + 78,
      type: margin + 130,
      total: margin + 200,
      diff: margin + 275,
      pay: margin + 350,   // pagos
    };

    text("Fecha", cols.date, y, 10, true);
    text("Folio", cols.folio, y, 10, true);
    text("Tipo", cols.type, y, 10, true);
    text("Total", cols.total, y, 10, true);
    text("Dif", cols.diff, y, 10, true);

    // ✅ nombres completos en 2 renglones
    text("Efectivo / Tarjeta", cols.pay, y, 10, true);
    text("Transferencia", cols.pay, y - 12, 10, true);

    y -= line * 1.3;
    hr(y);
    y -= line * 0.9;

    // Helper: salto de página simple (por si crece)
    const ensureSpace = (need: number) => {
      if (y - need < 60) {
        // (sin multi página por ahora; si quieres te lo hago multipágina)
        // Solo evitamos que se empalme con footer
        y = 80;
      }
    };

    for (const r of rows ?? []) {
      ensureSpace(40);

      text(String(r.cut_date ?? ""), cols.date, y, 10);
      text(String(r.folio_num ?? ""), cols.folio, y, 10);
      text(String(r.cut_type ?? ""), cols.type, y, 10);
      text(`$${money(num(r.total_day))}`, cols.total, y, 10);
      text(`$${money(num(r.diff))}`, cols.diff, y, 10);

      // Pagos en 2 renglones con nombres completos
      const p1 = `Efectivo: ${money(num(r.cash))}  Tarjeta: ${money(num(r.card))}`;
      const p2 = `Transferencia: ${money(num(r.transfer))}`;
      text(p1, cols.pay, y, 9);
      text(p2, cols.pay, y - 12, 9);

      y -= line * 1.5;

      if (r.diff_reason || r.note || r.extra_reference) {
        const extra = [
          r.extra_reference && `Extra: ${r.extra_reference}`,
          r.diff_reason && `Motivo: ${r.diff_reason}`,
          r.note && `Nota: ${r.note}`,
        ]
          .filter(Boolean)
          .join(" • ");

        text(extra, margin + 10, y, 9);
        y -= line * 1.1;
      }

      // separación entre registros
      y -= 4;
    }

    // =========================
    // FOOTER
    // =========================
    const now = new Date().toLocaleString("es-MX");
    hr(46);
    text(`Generado el ${now}`, margin, 30, 9);

    const bytes = await pdf.save();
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="reporte-${branch?.name ?? "sucursal"}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error(e);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}