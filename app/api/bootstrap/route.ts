import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  const pins = {
    admin: "482915",
    tec: "1234",
    granjas: "629751",
    cumbres: "904238",
  };

  const { data: branches, error: bErr } = await supabase
    .from("branches")
    .select("id,name");

  if (bErr) return NextResponse.json({ ok: false, error: bErr.message }, { status: 500 });

  const byName: Record<string, string> = {};
  (branches ?? []).forEach((b) => (byName[b.name] = b.id));

  const rows = [
    { name: "Roberto", role: "admin", branch_id: null, pin: pins.admin },
    { name: "Cajero Tec", role: "cashier", branch_id: byName["Tec"], pin: pins.tec },
    { name: "Cajero Granjas", role: "cashier", branch_id: byName["Granjas"], pin: pins.granjas },
    { name: "Cajero Cumbres", role: "cashier", branch_id: byName["Cumbres"], pin: pins.cumbres },
  ];

  for (const r of rows) {
    const pin_hash = await bcrypt.hash(r.pin, 10);
    const { error } = await supabase
      .from("users")
      .upsert(
        { name: r.name, role: r.role, branch_id: r.branch_id, pin_hash, active: true },
        { onConflict: "name" }
      );

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}