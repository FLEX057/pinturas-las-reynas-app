"use client";

import React, { useEffect, useMemo, useState } from "react";

type Branch = { id: string; name: string };
type User = { id: string; name: string; role: "admin" | "cashier" | "mixer"; branch_id: string | null };

type CutRow = {
  id: string;
  cut_type: "DAY" | "EXTRA";
  cut_date: string;
  folio_num: number;
  cash: number;
  card: number;
  transfer: number;
  total_day: number;
  sum_methods: number;
  diff: number;
  diff_reason: string | null;
  note: string | null;
  ticket_path: string;
  extra_reference: string | null;
  created_at: string;
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function money(v: any) {
  return n(v).toFixed(2);
}

export default function CajaPage() {
  const [mounted, setMounted] = useState(false);

  const [user, setUser] = useState<User | null>(null);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");

  const [cutDate, setCutDate] = useState(todayISO());
  const [cutType, setCutType] = useState<"DAY" | "EXTRA">("DAY");
  const [cash, setCash] = useState("0");
  const [card, setCard] = useState("0");
  const [transfer, setTransfer] = useState("0");
  const [totalDay, setTotalDay] = useState("0");
  const [diffReason, setDiffReason] = useState("");
  const [note, setNote] = useState("");
  const [extraRef, setExtraRef] = useState("");

  const [ticketFile, setTicketFile] = useState<File | null>(null);
  const [ticketPreview, setTicketPreview] = useState<string>("");
  const [ticketPath, setTicketPath] = useState<string>("");

  const [history, setHistory] = useState<CutRow[]>([]);
  const [q, setQ] = useState("");

  const [repFrom, setRepFrom] = useState(todayISO());
  const [repTo, setRepTo] = useState(todayISO());
  const [repOnlyDiffs, setRepOnlyDiffs] = useState(false);

  const [msg, setMsg] = useState<string>("");

  useEffect(() => setMounted(true), []);

  // Cargar sesión (si no existe -> /login)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("plr_user");
      if (!raw) {
        window.location.href = "/login";
        return;
      }
      const u = JSON.parse(raw) as User;
      setUser(u);

      // si no es cashier, aquí no debe estar
      if (u.role !== "cashier" && u.role !== "admin") {
        window.location.href = u.role === "mixer" ? "/igualador" : "/login";
        return;
      }

      if (u.role === "cashier" && u.branch_id) setSelectedBranchId(u.branch_id);
    } catch {
      window.location.href = "/login";
    }
  }, []);

  // miniatura ticket
  useEffect(() => {
    if (!ticketFile) {
      setTicketPreview("");
      return;
    }
    if (ticketFile.type.startsWith("image/")) {
      const url = URL.createObjectURL(ticketFile);
      setTicketPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setTicketPreview("");
  }, [ticketFile]);

  // cargar sucursales
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/branches/list", { cache: "no-store" });
        const raw = await res.text();
        const data = raw ? JSON.parse(raw) : null;
        if (!res.ok || !data?.ok) return;
        setBranches(data.branches ?? []);
      } catch {}
    })();
  }, []);

  const branchName = useMemo(() => {
    const id = selectedBranchId || user?.branch_id || "";
    return branches.find((b) => b.id === id)?.name || (id ? id : "");
  }, [branches, selectedBranchId, user]);

  const sumMethods = useMemo(() => n(cash) + n(card) + n(transfer), [cash, card, transfer]);
  const diffLive = useMemo(() => n(totalDay) - sumMethods, [totalDay, sumMethods]);
  const hasDiff = useMemo(() => Math.abs(diffLive) > 0.0001, [diffLive]);

  function logout() {
    localStorage.removeItem("plr_user");
    window.location.href = "/login";
  }

  async function refreshHistory() {
    if (!user) return;
    const branch_id = selectedBranchId || user.branch_id || "";
    if (!branch_id) return;

    try {
      const res = await fetch(
        `/api/cuts/list?branch_id=${encodeURIComponent(branch_id)}&q=${encodeURIComponent(q)}`,
        { cache: "no-store" }
      );
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : null;
      if (!res.ok || !data?.ok) {
        setHistory([]);
        return;
      }
      setHistory(data.rows ?? []);
    } catch {
      setHistory([]);
    }
  }

  useEffect(() => {
    if (!user) return;
    refreshHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedBranchId]);

  async function uploadTicket(): Promise<string | null> {
    if (!ticketFile) {
      setMsg("Falta subir el ticket (obligatorio).");
      return null;
    }

    const branch_id = selectedBranchId || user?.branch_id || "";
    if (!branch_id) {
      setMsg("Selecciona sucursal.");
      return null;
    }

    const fd = new FormData();
    fd.append("branch_id", branch_id);
    fd.append("file", ticketFile);

    const res = await fetch("/api/ticket/upload", { method: "POST", body: fd });
    const raw = await res.text();
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {}

    if (!res.ok || !data?.ok || !data.path) {
      console.error("upload error:", res.status, raw);
      setMsg("Error subiendo ticket.");
      return null;
    }

    setTicketPath(data.path);
    return data.path as string;
  }

  async function onSave() {
    if (!user) return;
    setMsg("");

    const branch_id = selectedBranchId || user.branch_id || "";
    if (!branch_id) return setMsg("Selecciona sucursal.");

    if (hasDiff && diffReason.trim().length === 0) {
      setMsg("Hay diferencia. Escribe el motivo antes de guardar.");
      return;
    }

    const path = await uploadTicket();
    if (!path) return;

    const payload = {
      branch_id,
      user_id: user.id,
      cut_type: cutType,
      cut_date: cutDate,
      cash: n(cash),
      card: n(card),
      transfer: n(transfer),
      total_day: n(totalDay),
      diff_reason: diffReason.trim() ? diffReason.trim() : null,
      note: note.trim() ? note.trim() : null,
      ticket_path: path,
      extra_reference: cutType === "EXTRA" ? (extraRef.trim() ? extraRef.trim() : "Corte extra") : null,
    };

    const res = await fetch("/api/cuts/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const raw = await res.text();
    const data = raw ? JSON.parse(raw) : null;

    if (!res.ok || !data?.ok) {
      console.error("save:", res.status, raw);
      setMsg(data?.error ? `Error: ${data.error}` : `Error (HTTP ${res.status})`);
      return;
    }

    const savedAs: "DAY" | "EXTRA" = (data.final_cut_type as any) || cutType;
    setMsg(savedAs === "EXTRA" ? "✅ Corte extra guardado." : "✅ Corte del día guardado.");

    setTicketFile(null);
    setTicketPreview("");
    setTicketPath("");
    setDiffReason("");
    setNote("");
    setExtraRef("");

    await refreshHistory();
  }

  async function openReportPdf() {
    if (!user) return;
    const branch_id = selectedBranchId || user.branch_id || "";
    if (!branch_id) return setMsg("Selecciona sucursal.");

    const url =
      `/api/reports/pdf?branch_id=${encodeURIComponent(branch_id)}` +
      `&from=${encodeURIComponent(repFrom)}` +
      `&to=${encodeURIComponent(repTo)}` +
      (repOnlyDiffs ? `&only_diffs=1` : ``);

    window.open(url, "_blank");
  }

  async function openTicket(cut: CutRow) {
    try {
      const res = await fetch(`/api/ticket/signed?path=${encodeURIComponent(cut.ticket_path)}`, { cache: "no-store" });
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : null;
      if (!res.ok || !data?.ok || !data.url) return setMsg("No se pudo abrir ticket.");
      window.open(data.url, "_blank");
    } catch {
      setMsg("No se pudo abrir ticket.");
    }
  }

  if (!mounted || !user) return null;

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="bg-black text-yellow-400">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 bg-white rounded-xl p-1 flex items-center justify-center border border-yellow-300/40">
              <img src="/logo.png" className="h-12 w-12 object-contain" alt="Logo" />
            </div>
            <div>
              <div className="text-lg font-bold">Caja</div>
              <div className="text-xs text-yellow-200">{user.name} ({user.role})</div>
            </div>
          </div>
          <button className="bg-yellow-400 text-black font-semibold rounded-xl px-3 py-1 border-2 border-black" onClick={logout}>
            Salir
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 grid gap-6">
        {/* Sucursal */}
        <section className="bg-white border-2 border-black/10 rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-bold text-black">Sucursal</div>
              <div className="text-sm text-neutral-800 mt-1">
                Actual: <span className="font-semibold">{branchName || "—"}</span>
              </div>
            </div>

            <select
              className="border-2 border-black/40 rounded-xl px-3 py-2 text-neutral-900 focus:border-yellow-400 focus:outline-none"
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              disabled={user.role === "cashier" && !!user.branch_id}
            >
              <option value="">Seleccionar…</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </section>

        {/* Nuevo corte */}
        <section className="bg-white border-2 border-black/10 rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="font-bold text-black">Nuevo corte</div>
              <div className="text-sm text-neutral-800 mt-1">Efectivo / Tarjeta / Transferencia / Total</div>
            </div>

            <div className="flex items-center gap-2">
              <select className="border-2 border-black/40 rounded-xl px-3 py-2" value={cutType} onChange={(e)=>setCutType(e.target.value as any)}>
                <option value="DAY">DAY</option>
                <option value="EXTRA">EXTRA</option>
              </select>
              <input className="border-2 border-black/40 rounded-xl px-3 py-2" type="date" value={cutDate} onChange={(e)=>setCutDate(e.target.value)} />
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-3 mt-4">
            <Field label="Efectivo" value={cash} setValue={setCash} />
            <Field label="Tarjeta" value={card} setValue={setCard} />
            <Field label="Transferencia" value={transfer} setValue={setTransfer} />
            <Field label="Total del día" value={totalDay} setValue={setTotalDay} />
          </div>

          <div className="mt-4 grid md:grid-cols-3 gap-3">
            <Stat title="Suma (E+T+Tr)" value={`$${money(sumMethods)}`} />
            <Stat title="Total del día" value={`$${money(totalDay)}`} />
            <Stat title="Diferencia" value={`$${money(diffLive)}`} emphasis={hasDiff ? "warn" : "ok"} />
          </div>

          {hasDiff && (
            <div className="mt-3 p-3 rounded-xl border-2 border-yellow-400 bg-yellow-50 text-black">
              <div className="font-semibold">⚠️ Hay diferencia.</div>
              <div className="text-sm text-neutral-900">Para guardar, escribe el motivo.</div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3 mt-3">
            <div>
              <div className="text-sm font-semibold text-black">Ticket del sistema (obligatorio)</div>
              <input
                className="mt-1 w-full border-2 border-black/40 rounded-xl px-3 py-2 bg-white"
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setTicketFile(e.target.files?.[0] ?? null)}
              />

              {ticketPreview && (
                <img src={ticketPreview} className="mt-2 max-h-40 rounded-xl border-2 border-black/20 object-contain bg-white" alt="Ticket" />
              )}

              <div className="text-xs text-neutral-800 mt-2">
                {ticketPath ? <>Path: <span className="font-mono text-black">{ticketPath}</span></> : "Aún no se sube."}
              </div>
            </div>

            <div>
              {cutType === "EXTRA" && (
                <>
                  <div className="text-sm font-semibold text-black">Referencia (EXTRA)</div>
                  <input
                    className="mt-1 w-full border-2 border-black/40 rounded-xl px-3 py-2"
                    placeholder="Ej: Venta extraordinaria"
                    value={extraRef}
                    onChange={(e) => setExtraRef(e.target.value)}
                  />
                </>
              )}

              <div className="mt-3 text-sm font-semibold text-black">Motivo diferencia (si aplica)</div>
              <input
                className="mt-1 w-full border-2 border-black/40 rounded-xl px-3 py-2"
                placeholder={hasDiff ? "Obligatorio" : "Opcional"}
                value={diffReason}
                onChange={(e) => setDiffReason(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-3">
            <div className="text-sm font-semibold text-black">Nota</div>
            <input className="mt-1 w-full border-2 border-black/40 rounded-xl px-3 py-2" value={note} onChange={(e)=>setNote(e.target.value)} />
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button className="bg-black text-yellow-400 font-semibold rounded-xl px-4 py-2 border-2 border-black" onClick={onSave}>
              Guardar corte
            </button>
            {msg && <div className="text-sm text-neutral-900 whitespace-pre-wrap">{msg}</div>}
          </div>
        </section>

        {/* Reportes */}
        <section className="bg-white border-2 border-black/10 rounded-2xl shadow-sm p-5">
          <div className="font-bold text-black">Reportes PDF</div>
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <input className="border-2 border-black/40 rounded-xl px-3 py-2" type="date" value={repFrom} onChange={(e)=>setRepFrom(e.target.value)} />
            <input className="border-2 border-black/40 rounded-xl px-3 py-2" type="date" value={repTo} onChange={(e)=>setRepTo(e.target.value)} />
            <label className="flex items-center gap-2 text-sm text-neutral-900">
              <input type="checkbox" checked={repOnlyDiffs} onChange={(e)=>setRepOnlyDiffs(e.target.checked)} />
              Solo diferencias
            </label>
            <button className="bg-yellow-400 text-black font-semibold rounded-xl px-4 py-2 border-2 border-black" onClick={openReportPdf}>
              Descargar PDF
            </button>
          </div>
        </section>

        {/* Historial */}
        <section className="bg-white border-2 border-black/10 rounded-2xl shadow-sm p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="font-bold text-black">Historial</div>
            <div className="flex items-center gap-2">
              <input className="border-2 border-black/40 rounded-xl px-3 py-2" placeholder="Buscar" value={q} onChange={(e)=>setQ(e.target.value)} />
              <button className="bg-yellow-400 text-black font-semibold rounded-xl px-4 py-2 border-2 border-black" onClick={refreshHistory}>
                Buscar
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-auto">
            <table className="w-full text-sm text-neutral-900">
              <thead>
                <tr className="text-left border-b border-black/20">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Folio</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">E/T/Tr</th>
                  <th className="py-2 pr-3">Total</th>
                  <th className="py-2 pr-3">Dif</th>
                  <th className="py-2 pr-3">Motivo</th>
                  <th className="py-2">Ticket</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-black/10">
                    <td className="py-2 pr-3">{h.cut_date}</td>
                    <td className="py-2 pr-3">{h.folio_num}</td>
                    <td className="py-2 pr-3">{h.cut_type}</td>
                    <td className="py-2 pr-3">{money(h.cash)} / {money(h.card)} / {money(h.transfer)}</td>
                    <td className="py-2 pr-3">${money(h.total_day)}</td>
                    <td className="py-2 pr-3">${money(h.diff)}</td>
                    <td className="py-2 pr-3">{h.diff_reason || "—"}</td>
                    <td className="py-2">
                      <button className="underline decoration-yellow-400 decoration-2" onClick={()=>openTicket(h)}>
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr><td colSpan={8} className="py-4 text-neutral-700">Sin registros.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({ label, value, setValue }: { label: string; value: string; setValue: (v: string) => void }) {
  return (
    <div>
      <div className="text-sm font-semibold text-black">{label}</div>
      <input className="mt-1 w-full border-2 border-black/40 rounded-xl px-3 py-2" value={value} onChange={(e)=>setValue(e.target.value)} inputMode="decimal" />
    </div>
  );
}

function Stat({ title, value, emphasis }: { title: string; value: string; emphasis?: "ok" | "warn" }) {
  const box = emphasis === "warn" ? "border-2 border-red-600 bg-red-50" : "border-2 border-black/15 bg-white";
  const val = emphasis === "warn" ? "text-red-700 font-bold" : "text-neutral-900 font-semibold";
  return (
    <div className={`rounded-2xl p-3 ${box}`}>
      <div className="text-xs font-semibold text-neutral-700">{title}</div>
      <div className={`text-lg ${val}`}>{value}</div>
    </div>
  );
}