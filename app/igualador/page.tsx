"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Role = "admin" | "cashier" | "mixer";
type User = { id: string; name: string; role: Role; branch_id: string | null };

type Branch = { id: string; name: string };

type Ink = { id: string; code: string; name: string; active: boolean };

type Item = { ink_code: string; ink_name: string; amount: string };

type MixRow = {
  id: string;
  branch_id: string;
  user_id: string;
  folio_num: number | null;
  note: string | null;
  created_at: string;
};

type PreviewItem = { code: string; name: string; qty: string };
type Preview = {
  id: string;
  folio_num: number | null;
  note: string | null;
  created_at: string | null;
  items: PreviewItem[];
};

function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function safeJson(raw: string) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function makeToParam(toYmd: string, include: boolean) {
  if (!toYmd) return "";
  if (!include) return toYmd;
  const d = new Date(`${toYmd}T00:00:00`);
  return ymd(addDays(d, 1));
}
function safeNum(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

const INP =
  "mt-1 w-full border-2 border-black/40 rounded-xl px-3 py-2 bg-white text-neutral-950 font-semibold placeholder:text-neutral-600 focus:border-yellow-400 focus:outline-none";
const SEL =
  "mt-2 w-full border-2 border-black/40 rounded-xl px-3 py-2 bg-white text-neutral-950 font-semibold focus:border-yellow-400 focus:outline-none";
const BTN_Y =
  "bg-yellow-400 text-black font-semibold rounded-xl px-4 py-2 hover:bg-yellow-300 border-2 border-black";
const BTN_B =
  "bg-black text-yellow-400 font-semibold rounded-xl px-4 py-2 hover:bg-neutral-900 border-2 border-black";
const BTN_W =
  "bg-white text-black font-semibold rounded-xl px-4 py-2 border-2 border-black/20 hover:border-black/40 rounded-xl";

const ACTIVE_BRANCH_KEY = "plr_active_branch";

export default function IgualadorPage() {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [msg, setMsg] = useState("");

  // sucursales (rotación)
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string>("");

  // inks / captura
  const [inks, setInks] = useState<Ink[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCode, setSelectedCode] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<Item[]>([]);

  // historial
  const [hPreset, setHPreset] = useState<"today" | "yesterday" | "last7" | "last30" | "custom">("today");
  const [hFrom, setHFrom] = useState<string>(ymd(new Date()));
  const [hTo, setHTo] = useState<string>(ymd(new Date()));
  const [hIncludeToday, setHIncludeToday] = useState(true);
  const [hLimit, setHLimit] = useState("200");
  const [hQuery, setHQuery] = useState("");
  const [history, setHistory] = useState<MixRow[]>([]);
  const [hError, setHError] = useState("");

  // vista previa modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pError, setPError] = useState("");
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  // auth
  useEffect(() => {
    try {
      const raw = localStorage.getItem("plr_user");
      if (!raw) {
        window.location.href = "/login";
        return;
      }
      const u = JSON.parse(raw) as User;
      setUser(u);

      if (u.role === "cashier") window.location.href = "/caja";
      if (u.role === "admin") window.location.href = "/admin";
    } catch {
      localStorage.removeItem("plr_user");
      window.location.href = "/login";
    }
  }, []);

  function logout() {
    localStorage.removeItem("plr_user");
    window.location.href = "/login";
  }

  // cargar sucursales
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/branches/list", { cache: "no-store" });
        const raw = await res.text();
        const data = safeJson(raw);
        if (!res.ok || !data?.ok) return;
        const list: Branch[] = Array.isArray(data.branches) ? data.branches : [];
        setBranches(list);
      } catch {}
    })();
  }, []);

  // decidir sucursal activa (preferimos la guardada; si no, la del usuario; si no, primera)
  useEffect(() => {
    if (!mounted) return;
    if (!branches.length) return;

    const saved = localStorage.getItem(ACTIVE_BRANCH_KEY) || "";
    const savedOk = saved && branches.some((b) => b.id === saved);

    if (savedOk) {
      setActiveBranchId(saved);
      return;
    }

    const userBranchOk = user?.branch_id && branches.some((b) => b.id === user.branch_id);
    if (userBranchOk) {
      setActiveBranchId(user!.branch_id!);
      localStorage.setItem(ACTIVE_BRANCH_KEY, user!.branch_id!);
      return;
    }

    // fallback: primera sucursal
    setActiveBranchId(branches[0].id);
    localStorage.setItem(ACTIVE_BRANCH_KEY, branches[0].id);
  }, [mounted, branches, user?.branch_id]);

  function onChangeActiveBranch(id: string) {
    setActiveBranchId(id);
    localStorage.setItem(ACTIVE_BRANCH_KEY, id);
    // refresca historial en cuanto cambie
    loadHistoryDebounced();
  }

  const activeBranchName = useMemo(() => {
    const b = branches.find((x) => x.id === activeBranchId);
    return b?.name ?? "—";
  }, [branches, activeBranchId]);

  const canUse = useMemo(() => user?.role === "mixer" && !!activeBranchId, [user, activeBranchId]);

  // cargar tintas
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/inks/list", { cache: "no-store" });
        const raw = await res.text();
        const data = safeJson(raw);
        if (!res.ok || !data?.ok) return;
        setInks((data.inks ?? []).filter((x: any) => x.active !== false));
      } catch {}
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return inks;
    return inks.filter((i) => `${i.code} ${i.name}`.toLowerCase().includes(q));
  }, [inks, search]);

  const selectedInk = useMemo(() => {
    if (!selectedCode) return null;
    return inks.find((i) => i.code === selectedCode) ?? null;
  }, [inks, selectedCode]);

  function addItem() {
    setMsg("");
    if (!selectedInk) return setMsg("Selecciona una tinta.");
    const amt = n(amount);
    if (!amt || amt <= 0) return setMsg("Cantidad inválida.");

    setItems((prev) => {
      const idx = prev.findIndex((p) => p.ink_code === selectedInk.code);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], amount: String(n(copy[idx].amount) + amt) };
        return copy;
      }
      return [...prev, { ink_code: selectedInk.code, ink_name: selectedInk.name, amount: String(amt) }];
    });

    setAmount("");
  }

  function removeItem(code: string) {
    setItems((prev) => prev.filter((p) => p.ink_code !== code));
  }

  async function saveMix() {
    setMsg("");
    if (!user) return;
    if (!canUse) return setMsg("Selecciona una sucursal activa.");
    if (items.length === 0) return setMsg("Agrega al menos una tinta.");

    const payload = {
      branch_id: activeBranchId,
      user_id: user.id,
      note: note.trim() ? note.trim() : null,
      items: items.map((it) => ({ ink_code: it.ink_code, amount: n(it.amount) })),
    };

    const res = await fetch("/api/mixes/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const raw = await res.text();
    const data = safeJson(raw);

    if (!res.ok || !data?.ok) {
      console.error("mix create:", res.status, raw);
      return setMsg(data?.error || `Error (HTTP ${res.status})`);
    }

    const folioNum = safeNum(data.folio_num);
    const folioTxt = folioNum && folioNum > 0 ? `Folio ${folioNum}` : "Guardado";
    setMsg(`✅ Mezcla guardada (${activeBranchName}): ${folioTxt}`);

    setItems([]);
    setNote("");

    window.open(`/api/mixes/pdf?mix_id=${encodeURIComponent(data.mix_id)}&macro=1`, "_blank");

    loadHistoryDebounced();
  }

  // presets historial
  useEffect(() => {
    const today = new Date();
    if (hPreset === "today") {
      setHFrom(ymd(today));
      setHTo(ymd(today));
    } else if (hPreset === "yesterday") {
      const y = addDays(today, -1);
      setHFrom(ymd(y));
      setHTo(ymd(y));
    } else if (hPreset === "last7") {
      setHFrom(ymd(addDays(today, -6)));
      setHTo(ymd(today));
    } else if (hPreset === "last30") {
      setHFrom(ymd(addDays(today, -29)));
      setHTo(ymd(today));
    }
  }, [hPreset]);

  // load history (debounce)
  const loadTimer = useRef<any>(null);
  function loadHistoryDebounced() {
    if (loadTimer.current) clearTimeout(loadTimer.current);
    loadTimer.current = setTimeout(() => loadHistory(), 250);
  }

  useEffect(() => {
    if (!mounted || !user) return;
    if (user.role !== "mixer") return;
    if (!activeBranchId) return;
    loadHistoryDebounced();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, user?.id, activeBranchId, hPreset, hFrom, hTo, hIncludeToday, hLimit]);

  async function loadHistory() {
    setHError("");
    if (!activeBranchId) return;

    const lim = Number(hLimit) || 200;
    const qs = new URLSearchParams();
    qs.set("branch_id", activeBranchId);
    qs.set("limit", String(lim));

    const toParam = makeToParam(hTo, hIncludeToday);
    if (hFrom && toParam) {
      qs.set("from", hFrom);
      qs.set("to", toParam);
    }

    const res = await fetch(`/api/mixes/recent?${qs.toString()}`, { cache: "no-store" });
    const raw = await res.text();
    const data = safeJson(raw);

    if (!res.ok || !data?.ok) {
      console.error("history:", res.status, raw);
      setHistory([]);
      setHError(data?.error || `Error historial (HTTP ${res.status})`);
      return;
    }

    const arr = Array.isArray(data.mixes) ? data.mixes : [];
    setHistory(arr);
  }

  const historyFiltered = useMemo(() => {
    const q = hQuery.trim().toLowerCase();
    if (!q) return history;

    const asNum = Number(q);
    const byFolio = Number.isFinite(asNum) && asNum > 0;

    return history.filter((m) => {
      const folioOk = byFolio ? Number(m.folio_num) === asNum : true;
      const noteOk = (m.note ?? "").toLowerCase().includes(q);
      return byFolio ? folioOk : noteOk;
    });
  }, [history, hQuery]);

  async function openPreview(mix_id: string) {
    setPError("");
    setPreview(null);
    setPreviewOpen(true);

    try {
      const res = await fetch(`/api/mixes/get?mix_id=${encodeURIComponent(mix_id)}`, { cache: "no-store" });
      const raw = await res.text();
      const data = safeJson(raw);

      if (!res.ok || !data?.ok) {
        setPError(data?.error || `Error vista previa (HTTP ${res.status})`);
        return;
      }

      const mix = data.mix ?? data;
      const created_at: string | null = mix?.created_at ?? data.created_at ?? null;
      const folio_num: number | null = safeNum(mix?.folio_num ?? data.folio_num);
      const noteVal: string | null = (mix?.note ?? data.note ?? null) as any;

      const itemsArr = Array.isArray(data.items) ? data.items : Array.isArray(mix?.items) ? mix.items : [];
      const mapped: PreviewItem[] = itemsArr.map((it: any) => ({
        code: String(it.code ?? it.ink_code ?? "").trim(),
        name: String(it.name ?? it.ink_name ?? "").trim(),
        qty: String(it.qty ?? it.amount ?? "").trim(),
      }));

      setPreview({
        id: String(mix?.id ?? data.id ?? mix_id),
        folio_num,
        note: noteVal,
        created_at,
        items: mapped.filter((x) => x.code),
      });

      setTimeout(() => modalRef.current?.focus(), 50);
    } catch (e: any) {
      setPError(e?.message ?? "Error vista previa");
    }
  }

  function closePreview() {
    setPreviewOpen(false);
    setPreview(null);
    setPError("");
  }

  function reprint(mix_id: string) {
    window.open(`/api/mixes/pdf?mix_id=${encodeURIComponent(mix_id)}&macro=1`, "_blank");
  }

  if (!mounted || !user) return null;

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* TOPBAR */}
      <div className="bg-black text-yellow-400">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 bg-white rounded-xl p-1 flex items-center justify-center border border-yellow-300/40">
              <img src="/logo.png" className="h-12 w-12 object-contain" alt="Logo" />
            </div>
            <div>
              <div className="text-lg font-bold">Igualador</div>
              <div className="text-xs text-yellow-200">{user.name}</div>
            </div>
          </div>
          <button className={BTN_Y} onClick={logout}>
            Salir
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6 grid gap-6">
        {/* SUCURSAL ACTIVA */}
        <section className="bg-white border-2 border-black/10 rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-bold text-black">Sucursal activa (rotación)</div>
              <div className="text-sm text-neutral-950 font-semibold">
                Todo se guarda y se consulta según esta sucursal.
              </div>
            </div>
          </div>

          <div className="mt-3 grid md:grid-cols-2 gap-3 items-end">
            <div>
              <div className="text-sm font-semibold text-black">Sucursal</div>
              <select className={SEL} value={activeBranchId} onChange={(e) => onChangeActiveBranch(e.target.value)}>
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-sm text-neutral-950 font-semibold">
              Actual: <span className="font-black">{activeBranchName}</span>
            </div>
          </div>

          {!activeBranchId && (
            <div className="mt-3 text-sm font-semibold text-red-700">
              Selecciona una sucursal para poder guardar / ver historial.
            </div>
          )}
        </section>

        {/* CAPTURA */}
        <section className="bg-white border-2 border-black/10 rounded-2xl p-5">
          <div className="font-bold text-black">Agregar tinta</div>
          <div className="text-sm text-neutral-950 font-semibold">Solo necesitas escribir cantidad.</div>

          <div className="mt-4 grid md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <div className="text-sm font-semibold text-black">Buscar</div>
              <input className={INP} value={search} onChange={(e) => setSearch(e.target.value)} />
              <select className={SEL} value={selectedCode} onChange={(e) => setSelectedCode(e.target.value)}>
                <option value="">Selecciona…</option>
                {filtered.slice(0, 120).map((i) => (
                  <option key={i.code} value={i.code}>
                    {i.code} — {i.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-sm font-semibold text-black">Cantidad</div>
              <input className={INP} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
              <button
                className="mt-2 w-full bg-yellow-400 text-black font-semibold rounded-xl px-3 py-2 border-2 border-black"
                onClick={addItem}
              >
                Agregar
              </button>
            </div>
          </div>
        </section>

        {/* LISTA + GUARDAR */}
        <section className="bg-white border-2 border-black/10 rounded-2xl p-5">
          <div className="font-bold text-black">Lista</div>

          <div className="mt-3 overflow-auto">
            <table className="w-full text-sm text-neutral-950">
              <thead>
                <tr className="text-left border-b border-black/20">
                  <th className="py-2 pr-3">Código</th>
                  <th className="py-2 pr-3">Tinta</th>
                  <th className="py-2 pr-3">Cantidad</th>
                  <th className="py-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.ink_code} className="border-b border-black/10">
                    <td className="py-2 pr-3 font-mono font-semibold">{it.ink_code}</td>
                    <td className="py-2 pr-3">{it.ink_name}</td>
                    <td className="py-2 pr-3">{it.amount}</td>
                    <td className="py-2">
                      <button
                        className="underline decoration-yellow-400 decoration-2 font-semibold"
                        onClick={() => removeItem(it.ink_code)}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-neutral-700">
                      Sin tintas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <div className="text-sm font-semibold text-black">Nota</div>
            <input className={INP} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="mt-4 flex gap-2 items-center flex-wrap">
            <button className={BTN_B} onClick={saveMix} disabled={!activeBranchId}>
              Guardar y generar ticket
            </button>
            {msg && <div className="text-sm text-neutral-950 font-semibold whitespace-pre-wrap">{msg}</div>}
          </div>
        </section>

        {/* HISTORIAL */}
        <section className="bg-white border-2 border-black/10 rounded-2xl p-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="font-bold text-black">Historial (reimpresión)</div>
              <div className="text-sm text-neutral-950 font-semibold">
                Sucursal: <span className="font-black">{activeBranchName}</span>
              </div>
            </div>
            <button className={BTN_W} onClick={() => loadHistoryDebounced()}>
              Actualizar
            </button>
          </div>

          <div className="mt-4 grid md:grid-cols-6 gap-3">
            <div className="md:col-span-2">
              <div className="text-sm font-semibold text-black">Rango</div>
              <select className={SEL} value={hPreset} onChange={(e) => setHPreset(e.target.value as any)}>
                <option value="today">Hoy</option>
                <option value="yesterday">Ayer</option>
                <option value="last7">Últimos 7 días</option>
                <option value="last30">Últimos 30 días</option>
                <option value="custom">Personalizado</option>
              </select>
            </div>

            <div>
              <div className="text-sm font-semibold text-black">Desde</div>
              <input className={INP} type="date" value={hFrom} onChange={(e) => setHFrom(e.target.value)} disabled={hPreset !== "custom"} />
            </div>

            <div>
              <div className="text-sm font-semibold text-black">Hasta</div>
              <input className={INP} type="date" value={hTo} onChange={(e) => setHTo(e.target.value)} disabled={hPreset !== "custom"} />
            </div>

            <div className="md:col-span-2">
              <div className="text-sm font-semibold text-black">Límite</div>
              <input className={INP} value={hLimit} onChange={(e) => setHLimit(e.target.value)} />
            </div>

            <div className="md:col-span-2 flex items-end">
              <label className="text-sm font-semibold text-neutral-950 flex items-center gap-2">
                <input type="checkbox" checked={hIncludeToday} onChange={(e) => setHIncludeToday(e.target.checked)} />
                Incluir “hoy” completo
              </label>
            </div>

            <div className="md:col-span-4">
              <div className="text-sm font-semibold text-black">Buscar (folio o nota)</div>
              <input className={INP} value={hQuery} onChange={(e) => setHQuery(e.target.value)} placeholder="Ej: 12 (folio) o 'blanco' (nota)" />
            </div>
          </div>

          {hError && <div className="mt-3 text-sm font-semibold text-red-700">{hError}</div>}

          <div className="mt-4 overflow-auto">
            <table className="w-full text-sm text-neutral-950">
              <thead>
                <tr className="text-left border-b border-black/20">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Folio</th>
                  <th className="py-2 pr-3">Nota</th>
                  <th className="py-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {historyFiltered.slice(0, 200).map((m) => {
                  const dt = new Date(m.created_at);
                  const folio = Number.isFinite(Number(m.folio_num)) && Number(m.folio_num) > 0 ? `Folio ${Number(m.folio_num)}` : "—";
                  return (
                    <tr key={m.id} className="border-b border-black/10">
                      <td className="py-2 pr-3">{dt.toLocaleString("es-MX")}</td>
                      <td className="py-2 pr-3 font-black">{folio}</td>
                      <td className="py-2 pr-3">{m.note ?? ""}</td>
                      <td className="py-2">
                        <div className="flex gap-3 flex-wrap">
                          <button className="underline decoration-yellow-400 decoration-2 font-semibold" onClick={() => reprint(m.id)}>
                            Reimprimir
                          </button>
                          <button className="underline decoration-yellow-400 decoration-2 font-semibold" onClick={() => openPreview(m.id)}>
                            Vista previa
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {historyFiltered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-neutral-700">
                      Sin mezclas en el rango.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* MODAL VISTA PREVIA */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onMouseDown={closePreview}>
          <div
            className="w-full max-w-3xl bg-white rounded-2xl border-2 border-black/20 shadow-xl p-5 outline-none"
            onMouseDown={(e) => e.stopPropagation()}
            tabIndex={-1}
            ref={modalRef}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-bold text-black">Vista previa</div>
              <button className={BTN_W} onClick={closePreview}>
                Cerrar
              </button>
            </div>

            {pError && <div className="mt-3 text-sm font-semibold text-red-700">{pError}</div>}

            {!pError && !preview && <div className="mt-4 text-sm text-neutral-950 font-semibold">Cargando…</div>}

            {preview && (
              <div className="mt-4 grid gap-3">
                <div className="text-sm text-neutral-950 font-semibold">
                  Folio:{" "}
                  <span className="font-black">
                    {preview.folio_num && preview.folio_num > 0 ? `Folio ${preview.folio_num}` : "—"}
                  </span>
                </div>

                <div className="text-sm text-neutral-950 font-semibold">
                  Fecha:{" "}
                  <span className="font-black">
                    {preview.created_at ? new Date(preview.created_at).toLocaleString("es-MX") : "—"}
                  </span>
                </div>

                {preview.note && (
                  <div className="text-sm text-neutral-950 font-semibold">
                    Nota: <span className="font-black">{preview.note}</span>
                  </div>
                )}

                <div className="overflow-auto">
                  <table className="w-full text-sm text-neutral-950">
                    <thead>
                      <tr className="text-left border-b border-black/20">
                        <th className="py-2 pr-3">Código</th>
                        <th className="py-2 pr-3">Tinta</th>
                        <th className="py-2 pr-3">Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(preview.items ?? []).map((it, idx) => (
                        <tr key={`${it.code}-${idx}`} className="border-b border-black/10">
                          <td className="py-2 pr-3 font-mono font-semibold">{it.code}</td>
                          <td className="py-2 pr-3">{it.name}</td>
                          <td className="py-2 pr-3">{it.qty}</td>
                        </tr>
                      ))}
                      {(!preview.items || preview.items.length === 0) && (
                        <tr>
                          <td colSpan={3} className="py-4 text-neutral-700">
                            Sin detalle.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button className={BTN_B} onClick={() => reprint(preview.id)}>
                    Reimprimir
                  </button>
                  <button className={BTN_W} onClick={closePreview}>
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}