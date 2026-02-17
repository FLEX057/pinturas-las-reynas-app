"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Role = "admin" | "cashier" | "mixer";
type SessionUser = { id: string; name: string; role: Role; branch_id: string | null };

type Branch = { id: string; name: string };
type AppUser = { id: string; name: string; role: Role; branch_id: string | null; active: boolean; created_at?: string };
type Ink = { id: string; code: string; name: string; active: boolean; created_at?: string };

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
  branch_id?: string | null;
  user_id?: string | null;
};

function cls(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
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
  "mt-1 w-full border-2 border-black/40 rounded-xl px-3 py-2 bg-white text-neutral-950 font-semibold focus:border-yellow-400 focus:outline-none";
const BTN_Y =
  "bg-yellow-400 text-black font-semibold rounded-xl px-4 py-2 hover:bg-yellow-300 border-2 border-black";
const BTN_B =
  "bg-black text-yellow-400 font-semibold rounded-xl px-4 py-2 hover:bg-neutral-900 border-2 border-black";
const BTN_W =
  "bg-white text-black font-semibold rounded-xl px-4 py-2 border-2 border-black/20 hover:border-black/40 rounded-xl";

export default function AdminPage() {
  const [mounted, setMounted] = useState(false);
  const [session, setSession] = useState<SessionUser | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [tab, setTab] = useState<"users" | "inks" | "mixes">("users");
  const [msg, setMsg] = useState("");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [inks, setInks] = useState<Ink[]>([]);
  const [showInksInactive, setShowInksInactive] = useState(false);

  // users form
  const [uName, setUName] = useState("");
  const [uRole, setURole] = useState<Role>("cashier");
  const [uBranch, setUBranch] = useState("");
  const [uActive, setUActive] = useState(true);
  const [uPin, setUPin] = useState("");

  // inks form
  const [inkId, setInkId] = useState("");
  const [iCode, setICode] = useState("");
  const [iName, setIName] = useState("");

  // mixes analytics
  const [mixBranch, setMixBranch] = useState<string>("ALL");
  const [rangePreset, setRangePreset] = useState<"today" | "yesterday" | "last7" | "last30" | "custom">("today");
  const [from, setFrom] = useState<string>(ymd(new Date()));
  const [to, setTo] = useState<string>(ymd(new Date()));
  const [includeToday, setIncludeToday] = useState(true);
  const [limit, setLimit] = useState<string>("2000");
  const [mixes, setMixes] = useState<MixRow[]>([]);
  const [mixErr, setMixErr] = useState("");

  // compare
  const [compareOn, setCompareOn] = useState(false);
  const [cFrom, setCFrom] = useState<string>(ymd(addDays(new Date(), -7)));
  const [cTo, setCTo] = useState<string>(ymd(addDays(new Date(), -1)));
  const [cIncludeToday, setCIncludeToday] = useState(false);
  const [cMixes, setCMixes] = useState<MixRow[]>([]);
  const [cErr, setCErr] = useState("");

  // ✅ Vista previa (modal)
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pError, setPError] = useState("");
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("plr_user");
      if (!raw) {
        window.location.href = "/login";
        return;
      }
      const u = JSON.parse(raw) as SessionUser;
      setSession(u);
      if (u.role !== "admin") {
        window.location.href = "/login";
        return;
      }
      setAdminKey(localStorage.getItem("plr_admin_key") || "");
    } catch {
      localStorage.removeItem("plr_user");
      window.location.href = "/login";
    }
  }, []);

  function logout() {
    localStorage.removeItem("plr_user");
    window.location.href = "/login";
  }

  async function api(path: string, init?: RequestInit) {
    const headers: any = { ...(init?.headers || {}) };
    if (adminKey) headers["x-admin-key"] = adminKey;
    const res = await fetch(path, { cache: "no-store", ...init, headers });
    const raw = await res.text();
    const data = safeJson(raw);
    return { res, raw, data };
  }

  function saveKey() {
    localStorage.setItem("plr_admin_key", adminKey);
    setMsg("✅ Admin Key guardada.");
  }

  const branchName = useMemo(() => {
    const m = new Map(branches.map((b) => [b.id, b.name]));
    return (id: string | null | undefined) => (id ? m.get(id) ?? id : "—");
  }, [branches]);

  const userName = useMemo(() => {
    const m = new Map(users.map((u) => [u.id, u.name]));
    return (id: string | null | undefined) => (id ? m.get(id) ?? id : "—");
  }, [users]);

  async function loadBranches() {
    const a = await api("/api/branches/list");
    if (a.res.ok && a.data?.ok) setBranches(a.data.branches ?? []);
  }
  async function loadUsers() {
    const a = await api("/api/admin/users/list");
    if (!a.res.ok || !a.data?.ok) return setMsg(a.data?.error || `Error usuarios (HTTP ${a.res.status})`);
    setUsers(a.data.users ?? []);
  }
  async function loadInks() {
    const a = await api("/api/admin/inks/list");
    if (!a.res.ok || !a.data?.ok) return setMsg(a.data?.error || `Error tintas (HTTP ${a.res.status})`);
    setInks(a.data.inks ?? []);
  }

  useEffect(() => {
    if (!mounted || !session) return;
    loadBranches();
    loadUsers();
    loadInks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, session]);

  // presets fechas
  useEffect(() => {
    const today = new Date();
    if (rangePreset === "today") {
      setFrom(ymd(today));
      setTo(ymd(today));
    } else if (rangePreset === "yesterday") {
      const y = addDays(today, -1);
      setFrom(ymd(y));
      setTo(ymd(y));
    } else if (rangePreset === "last7") {
      setFrom(ymd(addDays(today, -6)));
      setTo(ymd(today));
    } else if (rangePreset === "last30") {
      setFrom(ymd(addDays(today, -29)));
      setTo(ymd(today));
    }
  }, [rangePreset]);

  async function loadMixesMain() {
    setMixErr("");
    const lim = Number(limit) || 2000;
    const toParam = makeToParam(to, includeToday);

    if (mixBranch === "ALL") {
      const all: MixRow[] = [];
      for (const b of branches) {
        const qs = new URLSearchParams();
        qs.set("branch_id", b.id);
        qs.set("limit", String(lim));
        if (from && toParam) {
          qs.set("from", from);
          qs.set("to", toParam);
        }
        const a = await api(`/api/mixes/recent?${qs.toString()}`);
        if (!a.res.ok || !a.data?.ok) {
          setMixErr(a.data?.error || `Error mezclas (HTTP ${a.res.status})`);
          continue;
        }
        const arr = Array.isArray(a.data.mixes) ? a.data.mixes : [];
        for (const r of arr) all.push(r);
      }
      all.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      setMixes(all);
      return;
    }

    if (!mixBranch) {
      setMixes([]);
      return setMixErr("Selecciona sucursal.");
    }

    const qs = new URLSearchParams();
    qs.set("branch_id", mixBranch);
    qs.set("limit", String(lim));
    if (from && toParam) {
      qs.set("from", from);
      qs.set("to", toParam);
    }

    const a = await api(`/api/mixes/recent?${qs.toString()}`);
    if (!a.res.ok || !a.data?.ok) {
      setMixes([]);
      return setMixErr(a.data?.error || `Error mezclas (HTTP ${a.res.status})`);
    }

    setMixes(Array.isArray(a.data.mixes) ? a.data.mixes : []);
  }

  async function loadMixesCompare() {
    setCErr("");
    setCMixes([]);

    if (!compareOn) return;

    const lim = Number(limit) || 2000;
    const toParam = makeToParam(cTo, cIncludeToday);

    if (mixBranch === "ALL") {
      const all: MixRow[] = [];
      for (const b of branches) {
        const qs = new URLSearchParams();
        qs.set("branch_id", b.id);
        qs.set("limit", String(lim));
        if (cFrom && toParam) {
          qs.set("from", cFrom);
          qs.set("to", toParam);
        }
        const a = await api(`/api/mixes/recent?${qs.toString()}`);
        if (!a.res.ok || !a.data?.ok) {
          setCErr(a.data?.error || `Error comparación (HTTP ${a.res.status})`);
          continue;
        }
        const arr = Array.isArray(a.data.mixes) ? a.data.mixes : [];
        for (const r of arr) all.push(r);
      }
      all.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      setCMixes(all);
      return;
    }

    if (!mixBranch) return setCErr("Selecciona sucursal.");

    const qs = new URLSearchParams();
    qs.set("branch_id", mixBranch);
    qs.set("limit", String(lim));
    if (cFrom && toParam) {
      qs.set("from", cFrom);
      qs.set("to", toParam);
    }

    const a = await api(`/api/mixes/recent?${qs.toString()}`);
    if (!a.res.ok || !a.data?.ok) {
      return setCErr(a.data?.error || `Error comparación (HTTP ${a.res.status})`);
    }

    setCMixes(Array.isArray(a.data.mixes) ? a.data.mixes : []);
  }

  // auto update en mixes cuando cambias parámetros
  useEffect(() => {
    if (!mounted || !session) return;
    if (tab !== "mixes") return;
    if (!branches.length) return;

    const t = setTimeout(() => {
      loadMixesMain();
      loadMixesCompare();
    }, 250);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tab,
    mixBranch,
    from,
    to,
    includeToday,
    limit,
    compareOn,
    cFrom,
    cTo,
    cIncludeToday,
    mounted,
    session,
    branches.length,
  ]);

  // USERS actions
  async function saveUser() {
    setMsg("");
    if (!uName.trim()) return setMsg("Falta nombre.");
    if ((uRole === "cashier" || uRole === "mixer") && !uBranch) return setMsg("Asigna sucursal.");

    const payload = {
      name: uName.trim(),
      role: uRole,
      branch_id: uRole === "admin" ? null : uBranch,
      active: uActive,
      pin: uPin.trim() ? uPin.trim() : undefined,
    };

    const a = await api("/api/admin/users/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!a.res.ok || !a.data?.ok) return setMsg(a.data?.error || `Error (HTTP ${a.res.status})`);
    setMsg("✅ Usuario guardado (si pusiste PIN, se actualizó).");
    setUPin("");
    loadUsers();
  }

  function editUser(u: AppUser) {
    setUName(u.name);
    setURole(u.role);
    setUBranch(u.branch_id ?? "");
    setUActive(u.active);
    setUPin("");
    setTab("users");
    setMsg(`Editando: ${u.name}`);
  }

  async function toggleUser(u: AppUser) {
    const a = await api("/api/admin/users/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, active: !u.active }),
    });
    if (!a.res.ok || !a.data?.ok) return setMsg(a.data?.error || `Error (HTTP ${a.res.status})`);
    setMsg(u.active ? "✅ Usuario desactivado." : "✅ Usuario activado.");
    loadUsers();
  }

  // INKS actions
  const inksShown = useMemo(() => (showInksInactive ? inks : inks.filter((x) => x.active !== false)), [inks, showInksInactive]);

  function editInk(i: Ink) {
    setInkId(i.id);
    setICode(i.code);
    setIName(i.name);
    setTab("inks");
    setMsg(`Editando tinta: ${i.code}`);
  }

  async function saveInk() {
    setMsg("");
    if (!iCode.trim()) return setMsg("Falta Code.");
    if (!iName.trim()) return setMsg("Falta nombre.");

    const payload = { id: inkId || null, code: iCode.trim(), name: iName.trim(), active: true };

    const a = await api("/api/admin/inks/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!a.res.ok || !a.data?.ok) return setMsg(a.data?.error || `Error (HTTP ${a.res.status})`);

    setMsg(inkId ? "✅ Tinta actualizada." : "✅ Tinta creada.");
    setInkId("");
    setICode("");
    setIName("");
    loadInks();
  }

  async function toggleInk(i: Ink) {
    const a = await api("/api/admin/inks/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: i.id, active: !i.active }),
    });
    if (!a.res.ok || !a.data?.ok) return setMsg(a.data?.error || `Error (HTTP ${a.res.status})`);
    setMsg(i.active ? "✅ Tinta desactivada (oculta)." : "✅ Tinta activada.");
    loadInks();
  }

  // ANALYTICS
  const mainTotal = mixes.length;
  const compTotal = cMixes.length;

  const byUser = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of mixes) m.set(x.user_id, (m.get(x.user_id) || 0) + 1);
    const arr = Array.from(m.entries()).map(([user_id, count]) => ({ user_id, count }));
    arr.sort((a, b) => b.count - a.count);
    return arr;
  }, [mixes]);

  const bestUser = byUser[0] || null;

  const byBranch = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of mixes) m.set(x.branch_id, (m.get(x.branch_id) || 0) + 1);
    const arr = Array.from(m.entries()).map(([branch_id, count]) => ({ branch_id, count }));
    arr.sort((a, b) => b.count - a.count);
    return arr;
  }, [mixes]);

  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of mixes) {
      const d = new Date(x.created_at);
      const key = ymd(d);
      m.set(key, (m.get(key) || 0) + 1);
    }
    const arr = Array.from(m.entries()).map(([day, count]) => ({ day, count }));
    arr.sort((a, b) => a.day.localeCompare(b.day));
    return arr;
  }, [mixes]);

  const maxDay = Math.max(1, ...byDay.map((x) => x.count));
  const maxUser = Math.max(1, ...byUser.map((x) => x.count));
  const maxBranch = Math.max(1, ...byBranch.map((x) => x.count));

  function reprint(mix_id: string) {
    window.open(`/api/mixes/pdf?mix_id=${encodeURIComponent(mix_id)}&macro=1`, "_blank");
  }

  async function openPreview(mix_id: string) {
    setPError("");
    setPreview(null);
    setPreviewOpen(true);

    const a = await api(`/api/mixes/get?mix_id=${encodeURIComponent(mix_id)}`);
    if (!a.res.ok || !a.data?.ok) {
      setPError(a.data?.error || `Error vista previa (HTTP ${a.res.status})`);
      return;
    }

    const mix = a.data.mix ?? a.data;
    const created_at: string | null = mix?.created_at ?? a.data.created_at ?? null;
    const folio_num: number | null = safeNum(mix?.folio_num ?? a.data.folio_num);
    const noteVal: string | null = (mix?.note ?? a.data.note ?? null) as any;
    const branch_id = mix?.branch_id ?? a.data.branch_id ?? null;
    const user_id = mix?.user_id ?? a.data.user_id ?? null;

    const itemsArr = Array.isArray(a.data.items) ? a.data.items : Array.isArray(mix?.items) ? mix.items : [];
    const mapped: PreviewItem[] = itemsArr.map((it: any) => ({
      code: String(it.code ?? it.ink_code ?? "").trim(),
      name: String(it.name ?? it.ink_name ?? "").trim(),
      qty: String(it.qty ?? it.amount ?? "").trim(),
    }));

    setPreview({
      id: String(mix?.id ?? a.data.id ?? mix_id),
      folio_num,
      note: noteVal,
      created_at,
      items: mapped.filter((x) => x.code),
      branch_id,
      user_id,
    });

    setTimeout(() => modalRef.current?.focus(), 50);
  }

  function closePreview() {
    setPreviewOpen(false);
    setPreview(null);
    setPError("");
  }

  if (!mounted || !session) return null;

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="bg-black text-yellow-400">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 bg-white rounded-xl p-1 flex items-center justify-center border border-yellow-300/40">
              <img src="/logo.png" className="h-12 w-12 object-contain" alt="Logo" />
            </div>
            <div>
              <div className="text-lg font-bold">Admin</div>
              <div className="text-xs text-yellow-200">{session.name}</div>
            </div>
          </div>
          <button className={BTN_Y} onClick={logout}>
            Salir
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 grid gap-6">
        <section className="bg-white border-2 border-black/10 rounded-2xl p-5">
          <div className="font-bold text-black">Admin Key</div>
          <div className="mt-3 flex gap-2 flex-wrap items-center">
            <input className={INP} value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="ADMIN_API_KEY" />
            <button className={BTN_Y} onClick={saveKey}>
              Guardar
            </button>
            <button
              className={BTN_W}
              onClick={() => {
                loadUsers();
                loadInks();
                if (tab === "mixes") {
                  loadMixesMain();
                  loadMixesCompare();
                }
              }}
            >
              Recargar
            </button>
          </div>
          {msg && <div className="mt-3 text-sm text-neutral-950 font-semibold whitespace-pre-wrap">{msg}</div>}
        </section>

        <div className="flex gap-2 flex-wrap">
          <button className={cls(BTN_Y, tab === "users" && "ring-2 ring-black")} onClick={() => setTab("users")}>
            Usuarios
          </button>
          <button className={cls(BTN_Y, tab === "inks" && "ring-2 ring-black")} onClick={() => setTab("inks")}>
            Tintas
          </button>
          <button className={cls(BTN_Y, tab === "mixes" && "ring-2 ring-black")} onClick={() => setTab("mixes")}>
            Mezclas
          </button>
        </div>

        {/* USERS */}
        {tab === "users" && (
          <section className="bg-white border-2 border-black/10 rounded-2xl p-5">
            <div className="font-bold text-black">Usuarios</div>

            <div className="mt-4 grid md:grid-cols-2 gap-3">
              <div>
                <div className="text-sm font-semibold text-black">Nombre</div>
                <input className={INP} value={uName} onChange={(e) => setUName(e.target.value)} />
              </div>
              <div>
                <div className="text-sm font-semibold text-black">Rol</div>
                <select className={SEL} value={uRole} onChange={(e) => setURole(e.target.value as Role)}>
                  <option value="cashier">cashier</option>
                  <option value="mixer">mixer</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <div>
                <div className="text-sm font-semibold text-black">Sucursal</div>
                <select className={SEL} value={uBranch} onChange={(e) => setUBranch(e.target.value)} disabled={uRole === "admin"}>
                  <option value="">—</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-sm font-semibold text-black">Nuevo PIN (opcional)</div>
                <input className={INP} value={uPin} onChange={(e) => setUPin(e.target.value)} />
              </div>

              <div className="flex items-center gap-2 text-sm text-neutral-950 font-semibold">
                <input type="checkbox" checked={uActive} onChange={(e) => setUActive(e.target.checked)} />
                Activo
              </div>

              <div className="flex items-end gap-2">
                <button className={BTN_B} onClick={saveUser}>
                  Guardar
                </button>
                <button
                  className={BTN_W}
                  onClick={() => {
                    setUName("");
                    setURole("cashier");
                    setUBranch("");
                    setUActive(true);
                    setUPin("");
                    setMsg("");
                  }}
                >
                  Limpiar
                </button>
              </div>
            </div>

            <div className="mt-5 overflow-auto">
              <table className="w-full text-sm text-neutral-950">
                <thead>
                  <tr className="text-left border-b border-black/20">
                    <th className="py-2 pr-3">Nombre</th>
                    <th className="py-2 pr-3">Rol</th>
                    <th className="py-2 pr-3">Sucursal</th>
                    <th className="py-2 pr-3">Activo</th>
                    <th className="py-2">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-black/10">
                      <td className="py-2 pr-3 font-semibold">{u.name}</td>
                      <td className="py-2 pr-3">{u.role}</td>
                      <td className="py-2 pr-3">{branchName(u.branch_id)}</td>
                      <td className="py-2 pr-3">{u.active ? "Sí" : "No"}</td>
                      <td className="py-2">
                        <div className="flex gap-3 flex-wrap">
                          <button className="underline decoration-yellow-400 decoration-2 font-semibold" onClick={() => editUser(u)}>
                            Editar
                          </button>
                          <button className="underline decoration-yellow-400 decoration-2 font-semibold" onClick={() => toggleUser(u)}>
                            {u.active ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-neutral-700">
                        Sin usuarios.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* INKS */}
        {tab === "inks" && (
          <section className="bg-white border-2 border-black/10 rounded-2xl p-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="font-bold text-black">Tintas</div>
                <div className="text-sm text-neutral-950 font-semibold">Desactivar = ocultar (puedes verlas con el checkbox).</div>
              </div>
              <label className="text-sm text-neutral-950 font-semibold flex items-center gap-2">
                <input type="checkbox" checked={showInksInactive} onChange={(e) => setShowInksInactive(e.target.checked)} />
                Ver desactivadas
              </label>
            </div>

            <div className="mt-4 grid md:grid-cols-2 gap-3">
              <div>
                <div className="text-sm font-semibold text-black">Code</div>
                <input className={INP} value={iCode} onChange={(e) => setICode(e.target.value)} />
              </div>
              <div>
                <div className="text-sm font-semibold text-black">Nombre</div>
                <input className={INP} value={iName} onChange={(e) => setIName(e.target.value)} />
              </div>

              <div className="flex gap-2">
                <button className={BTN_B} onClick={saveInk}>
                  {inkId ? "Actualizar" : "Crear"}
                </button>
                <button
                  className={BTN_W}
                  onClick={() => {
                    setInkId("");
                    setICode("");
                    setIName("");
                    setMsg("");
                  }}
                >
                  Limpiar
                </button>
              </div>
            </div>

            <div className="mt-5 overflow-auto">
              <table className="w-full text-sm text-neutral-950">
                <thead>
                  <tr className="text-left border-b border-black/20">
                    <th className="py-2 pr-3">Code</th>
                    <th className="py-2 pr-3">Nombre</th>
                    <th className="py-2 pr-3">Activo</th>
                    <th className="py-2">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {inksShown.map((i) => (
                    <tr key={i.id} className="border-b border-black/10">
                      <td className="py-2 pr-3 font-mono font-semibold">{i.code}</td>
                      <td className="py-2 pr-3">{i.name}</td>
                      <td className="py-2 pr-3">{i.active ? "Sí" : "No"}</td>
                      <td className="py-2">
                        <div className="flex gap-3 flex-wrap">
                          <button className="underline decoration-yellow-400 decoration-2 font-semibold" onClick={() => editInk(i)}>
                            Editar
                          </button>
                          <button className="underline decoration-yellow-400 decoration-2 font-semibold" onClick={() => toggleInk(i)}>
                            {i.active ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {inksShown.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-neutral-700">
                        Sin tintas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* MIXES */}
        {tab === "mixes" && (
          <section className="bg-white border-2 border-black/10 rounded-2xl p-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-bold text-black">Mezclas</div>
                <div className="text-sm text-neutral-950 font-semibold">Cambias parámetros y se actualiza solo.</div>
              </div>
              <div className="text-sm font-semibold text-neutral-950">
                Total: <span className="font-black">{mainTotal}</span>
                {compareOn && (
                  <span className="ml-3">
                    vs <span className="font-black">{compTotal}</span>
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 grid md:grid-cols-6 gap-3">
              <div className="md:col-span-2">
                <div className="text-sm font-semibold text-black">Sucursal</div>
                <select className={SEL} value={mixBranch} onChange={(e) => setMixBranch(e.target.value)}>
                  <option value="ALL">Todas</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <div className="text-sm font-semibold text-black">Rango</div>
                <select className={SEL} value={rangePreset} onChange={(e) => setRangePreset(e.target.value as any)}>
                  <option value="today">Hoy</option>
                  <option value="yesterday">Ayer</option>
                  <option value="last7">Últimos 7 días</option>
                  <option value="last30">Últimos 30 días</option>
                  <option value="custom">Personalizado</option>
                </select>
              </div>

              <div>
                <div className="text-sm font-semibold text-black">Desde</div>
                <input className={INP} type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={rangePreset !== "custom"} />
              </div>

              <div>
                <div className="text-sm font-semibold text-black">Hasta</div>
                <input className={INP} type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={rangePreset !== "custom"} />
              </div>

              <div className="md:col-span-2">
                <div className="text-sm font-semibold text-black">Límite</div>
                <input className={INP} value={limit} onChange={(e) => setLimit(e.target.value)} />
              </div>

              <div className="md:col-span-2 flex items-end">
                <label className="text-sm font-semibold text-neutral-950 flex items-center gap-2">
                  <input type="checkbox" checked={includeToday} onChange={(e) => setIncludeToday(e.target.checked)} />
                  Incluir “hoy” completo
                </label>
              </div>

              <div className="md:col-span-4 flex items-end gap-2">
                <label className="text-sm font-semibold text-neutral-950 flex items-center gap-2">
                  <input type="checkbox" checked={compareOn} onChange={(e) => setCompareOn(e.target.checked)} />
                  Comparar contra otro rango
                </label>
              </div>

              {compareOn && (
                <>
                  <div>
                    <div className="text-sm font-semibold text-black">Compare desde</div>
                    <input className={INP} type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-black">Compare hasta</div>
                    <input className={INP} type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} />
                  </div>
                  <div className="md:col-span-2 flex items-end">
                    <label className="text-sm font-semibold text-neutral-950 flex items-center gap-2">
                      <input type="checkbox" checked={cIncludeToday} onChange={(e) => setCIncludeToday(e.target.checked)} />
                      Incluir “hoy” completo (comparación)
                    </label>
                  </div>
                </>
              )}
            </div>

            {(mixErr || cErr) && <div className="mt-3 text-sm font-semibold text-red-700">{mixErr || cErr}</div>}

            <div className="mt-6 grid lg:grid-cols-3 gap-4">
              <div className="bg-neutral-50 border-2 border-black/10 rounded-2xl p-4">
                <div className="font-bold text-black">Mejor igualador</div>
                <div className="mt-2 text-sm text-neutral-950 font-semibold">
                  {bestUser ? (
                    <>
                      <div className="text-neutral-950 font-black">{userName(bestUser.user_id)}</div>
                      <div className="mt-1 text-neutral-950">
                        Mezclas: <b className="font-black">{bestUser.count}</b>
                      </div>
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>

              <div className="bg-neutral-50 border-2 border-black/10 rounded-2xl p-4">
                <div className="font-bold text-black">Por sucursal</div>
                <div className="mt-3 grid gap-2">
                  {byBranch.slice(0, 6).map((x) => (
                    <div key={x.branch_id}>
                      <div className="flex justify-between text-sm text-neutral-950 font-semibold">
                        <span>{branchName(x.branch_id)}</span>
                        <span className="font-black">{x.count}</span>
                      </div>
                      <div className="h-2 bg-white border border-black/10 rounded">
                        <div className="h-2 bg-black rounded" style={{ width: `${Math.round((x.count / maxBranch) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                  {byBranch.length === 0 && <div className="text-sm text-neutral-700">—</div>}
                </div>
              </div>

              <div className="bg-neutral-50 border-2 border-black/10 rounded-2xl p-4">
                <div className="font-bold text-black">Por día</div>
                <div className="mt-3 grid gap-2">
                  {byDay.slice(-7).map((x) => (
                    <div key={x.day}>
                      <div className="flex justify-between text-sm text-neutral-950 font-semibold">
                        <span>{x.day}</span>
                        <span className="font-black">{x.count}</span>
                      </div>
                      <div className="h-2 bg-white border border-black/10 rounded">
                        <div className="h-2 bg-black rounded" style={{ width: `${Math.round((x.count / maxDay) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                  {byDay.length === 0 && <div className="text-sm text-neutral-700">—</div>}
                </div>
              </div>
            </div>

            <div className="mt-6 bg-white border-2 border-black/10 rounded-2xl p-4">
              <div className="font-bold text-black">Ranking de igualadores</div>
              <div className="mt-3 grid gap-2">
                {byUser.slice(0, 10).map((x) => (
                  <div key={x.user_id}>
                    <div className="flex justify-between text-sm text-neutral-950 font-semibold">
                      <span>{userName(x.user_id)}</span>
                      <span className="font-black">{x.count}</span>
                    </div>
                    <div className="h-2 bg-white border border-black/10 rounded">
                      <div className="h-2 bg-black rounded" style={{ width: `${Math.round((x.count / maxUser) * 100)}%` }} />
                    </div>
                  </div>
                ))}
                {byUser.length === 0 && <div className="text-sm text-neutral-700">—</div>}
              </div>
            </div>

            <div className="mt-6 overflow-auto">
              <div className="font-bold text-black mb-2">Detalle</div>
              <table className="w-full text-sm text-neutral-950">
                <thead>
                  <tr className="text-left border-b border-black/20">
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Sucursal</th>
                    <th className="py-2 pr-3">Igualador</th>
                    <th className="py-2 pr-3">Folio</th>
                    <th className="py-2 pr-3">Nota</th>
                    <th className="py-2">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {mixes.slice(0, 200).map((m) => {
                    const dt = new Date(m.created_at);
                    const folio = Number.isFinite(Number(m.folio_num)) && Number(m.folio_num) > 0 ? `Folio ${Number(m.folio_num)}` : "—";
                    return (
                      <tr key={m.id} className="border-b border-black/10">
                        <td className="py-2 pr-3">{dt.toLocaleString("es-MX")}</td>
                        <td className="py-2 pr-3">{branchName(m.branch_id)}</td>
                        <td className="py-2 pr-3">{userName(m.user_id)}</td>
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
                  {mixes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-neutral-700">
                        Sin mezclas en el rango.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {mixes.length > 200 && <div className="mt-2 text-xs text-neutral-600">Mostrando 200 de {mixes.length}.</div>}
            </div>
          </section>
        )}
      </div>

      {/* ✅ MODAL VISTA PREVIA */}
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
                  Sucursal: <span className="font-black">{branchName(preview.branch_id)}</span>
                </div>
                <div className="text-sm text-neutral-950 font-semibold">
                  Igualador: <span className="font-black">{userName(preview.user_id)}</span>
                </div>
                <div className="text-sm text-neutral-950 font-semibold">
                  Folio: <span className="font-black">{preview.folio_num && preview.folio_num > 0 ? `Folio ${preview.folio_num}` : "—"}</span>
                </div>
                <div className="text-sm text-neutral-950 font-semibold">
                  Fecha: <span className="font-black">{preview.created_at ? new Date(preview.created_at).toLocaleString("es-MX") : "—"}</span>
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