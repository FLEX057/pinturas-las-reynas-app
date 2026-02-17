import { NextResponse } from "next/server";

export function requireAdminKey(req: Request) {
  const headerKey = req.headers.get("x-admin-key") || "";
  const envKey =
    process.env.ADMIN_API_KEY ||
    process.env.NEXT_PUBLIC_ADMIN_API_KEY || // por si lo pusiste aquí por error
    "";

  if (!envKey) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_API_KEY no está configurada en el servidor (.env.local)" },
      { status: 500 }
    );
  }

  if (!headerKey || headerKey !== envKey) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  return null;
}