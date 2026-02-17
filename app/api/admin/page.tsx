"use client";

import React, { useEffect, useMemo, useState } from "react";

type Role = "admin" | "cashier" | "mixer";
type SessionUser = { id: string; name: string; role: Role; branch_id: string | null };
type Branch = { id: string; name: string };

type AppUser = { id: string; name: string; role: Role; branch_id: string | null; active: boolean };

type Ink = { id: string; code: string; name: string; active: boolean };
type Presentation = { id: string; name: string; size: number; unit: string; active: boolean };

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
  const [tab, setTab] = useState<"users" | "inks" | "pres">("users");
  const [msg, setMsg] = useState("");

  const [branches, setBranches] = useState<Branch[]>([]);
  const branchName = useMemo(() => {
    const m = new Map(branches.map((b) => [b.id, b.name]));
    return (id: string | null) => (id ? m.get(id) ?? id : "—");
  }, [branches]);

  // Users
  const [users, setUsers] = useState<AppUser[]>([]);
  const [uName, setUName] = useState("");
  const [uRole, setURole] = useState<Role>("cashier");
  const [uBranch, setUBranch] = useState("");
  const [uActive, setUActive] = useState(true);
  const [uPin, setUPin] = useState("");

  // Inks
  const [inks, setInks] = useState<Ink[]>([]);
  const [showInksInactive, setShowInksInactive] = useState(false);
  const [inkId, setInkId] = useState("");
  const [iCode, setICode] = useState("");
  const [iName, setIName] = useState("");

  // Presentations
  const [pres, setPres] = useState<Presentation[]>([]);
  const [showPresInactive, setShowPresInactive] = useState(false);
  const [presId, setPresId] = useState("");
  const [pName, setPName] = useState("");
  const [pSize, setPSize] = useState("1");
  const [pUnit, setPUnit] = useState("g");

  useEffect(() => setMounted(true), []);

  // ✅ aquí estaba tu error: NO retornamos string
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
  async function loadPres() {
    const a = await api("/api/admin/presentations/list");
    if (!a.res.ok || !a.data?.ok) return setMsg(a.data?.error || `Error presentaciones (HTTP ${a.res.status})`);
    setPres(a.data.presentations ?? []);
  }

  useEffect(() => {
    if (!mounted || !session) return;
    loadBranches();
    loadUsers();
    loadInks();
    loadPres();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, session]);

  // USERS
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
    setMsg("✅ Usuario guardado.");
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

  // INKS
  const inksShown = useMemo(
    () => (showInksInactive ? inks : inks.filter((x) => x.active !== false)),
    [inks, showInksInactive]
  );

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

  // PRESENTATIONS
  const presShown = useMemo(
    () => (showPresInactive ? pres : pres.filter((x) => x.active !== false)),
    [pres, showPresInactive]
  );

  function editPres(p: Presentation) {
    setPresId(p.id);
    setPName(p.name);
    setPSize(String(p.size));
    setPUnit(p.unit);
    setTab("pres");
    setMsg(`Editando presentación: ${p.name}`);
  }

  async function savePresentation() {
    setMsg("");
    const sizeNum = Number(pSize);
    if (!pName.trim()) return setMsg("Falta nombre.");
    if (!Number.isFinite(sizeNum) || sizeNum <= 0) return setMsg("Tamaño inválido.");
    if (!pUnit.trim()) return setMsg("Unidad inválida.");

    const payload = { id: presId || null, name: pName.trim(), size: sizeNum, unit: pUnit.trim(), active: true };

    const a = await api("/api/admin/presentations/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!a.res.ok || !a.data?.ok) return setMsg(a.data?.error || `Error (HTTP ${a.res.status})`);

    setMsg(presId ? "✅ Presentación actualizada." : "✅ Presentación creada.");
    setPresId("");
    setPName("");
    setPSize("1");
    setPUnit("g");
    loadPres();
  }

  async function togglePres(p: Presentation) {
    const a = await api("/api/admin/presentations/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, active: !p.active }),
    });
    if (!a.res.ok || !a.data?.ok) return setMsg(a.data?.error || `Error (HTTP ${a.res.status})`);
    setMsg(p.active ? "✅ Presentación desactivada (oculta)." : "✅ Presentación activada.");
    loadPres();
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
          <button className={BTN_Y} onClick={logout}>Salir</button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 grid gap-6">
        <section className="bg-white border-2 border-black/10 rounded-2xl p-5">
          <div className="font-bold text-black">Admin Key</div>
          <div className="mt-3 flex gap-2 flex-wrap items-center">
            <input className={INP} value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="ADMIN_API_KEY" />
            <button className={BTN_Y} onClick={saveKey}>Guardar</button>
            <button className={BTN_W} onClick={() => { loadUsers(); loadInks(); loadPres(); }}>Recargar</button>
          </div>
          {msg && <div className="mt-3 text-sm text-neutral-950 whitespace-pre-wrap">{msg}</div>}
        </section>

        <div className="flex gap-2 flex-wrap">
          <button className={cls(BTN_Y, tab === "users" && "ring-2 ring-black")} onClick={() => setTab("users")}>Usuarios</button>
          <button className={cls(BTN_Y, tab === "inks" && "ring-2 ring-black")} onClick={() => setTab("inks")}>Tintas</button>
          <button className={cls(BTN_Y, tab === "pres" && "ring-2 ring-black")} onClick={() => setTab("pres")}>Presentaciones</button>
        </div>

        {tab === "inks" && (
          <section className="bg-white border-2 border-black/10 rounded-2xl p-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="font-bold text-black">Tintas</div>
              <label className="text-sm text-neutral-950 font-semibold flex items-center gap-2">
                <input type="checkbox" checked={showInksInactive} onChange={(e)=>setShowInksInactive(e.target.checked)} />
                Ver desactivados
              </label>
            </div>

            <div className="mt-4 grid md:grid-cols-2 gap-3">
              <div>
                <div className="text-sm font-semibold text-black">Code</div>
                <input className={INP} value={iCode} onChange={(e)=>setICode(e.target.value)} />
              </div>
              <div>
                <div className="text-sm font-semibold text-black">Nombre</div>
                <input className={INP} value={iName} onChange={(e)=>setIName(e.target.value)} />
              </div>

              <div className="flex gap-2">
                <button className={BTN_B} onClick={saveInk}>{inkId ? "Actualizar" : "Crear"}</button>
                <button className={BTN_W} onClick={() => { setInkId(""); setICode(""); setIName(""); setMsg(""); }}>Limpiar</button>
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
                  {inksShown.map(i => (
                    <tr key={i.id} className="border-b border-black/10">
                      <td className="py-2 pr-3 font-mono">{i.code}</td>
                      <td className="py-2 pr-3">{i.name}</td>
                      <td className="py-2 pr-3">{i.active ? "Sí" : "No"}</td>
                      <td className="py-2">
                        <div className="flex gap-3 flex-wrap">
                          <button className="underline decoration-yellow-400 decoration-2 font-semibold" onClick={() => editInk(i)}>Editar</button>
                          <button className="underline decoration-yellow-400 decoration-2 font-semibold" onClick={() => toggleInk(i)}>
                            {i.active ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {inksShown.length === 0 && <tr><td colSpan={4} className="py-4 text-neutral-700">Sin tintas.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "pres" && (
          <section className="bg-white border-2 border-black/10 rounded-2xl p-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="font-bold text-black">Presentaciones</div>
              <label className="text-sm text-neutral-950 font-semibold flex items-center gap-2">
                <input type="checkbox" checked={showPresInactive} onChange={(e)=>setShowPresInactive(e.target.checked)} />
                Ver desactivadas
              </label>
            </div>

            <div className="mt-4 grid md:grid-cols-3 gap-3">
              <div>
                <div className="text-sm font-semibold text-black">Nombre</div>
                <input className={INP} value={pName} onChange={(e)=>setPName(e.target.value)} />
              </div>
              <div>
                <div className="text-sm font-semibold text-black">Tamaño</div>
                <input className={INP} value={pSize} onChange={(e)=>setPSize(e.target.value)} />
              </div>
              <div>
                <div className="text-sm font-semibold text-black">Unidad</div>
                <input className={INP} value={pUnit} onChange={(e)=>setPUnit(e.target.value)} />
              </div>

              <div className="flex gap-2 md:col-span-3">
                <button className={BTN_B} onClick={savePresentation}>{presId ? "Actualizar" : "Crear"}</button>
                <button className={BTN_W} onClick={() => { setPresId(""); setPName(""); setPSize("1"); setPUnit("g"); setMsg(""); }}>Limpiar</button>
              </div>
            </div>

            <div className="mt-5 overflow-auto">
              <table className="w-full text-sm text-neutral-950">
                <thead>
                  <tr className="text-left border-b border-black/20">
                    <th className="py-2 pr-3">Nombre</th>
                    <th className="py-2 pr-3">Tamaño</th>
                    <th className="py-2 pr-3">Unidad</th>
                    <th className="py-2 pr-3">Activo</th>
                    <th className="py-2">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {presShown.map(p => (
                    <tr key={p.id} className="border-b border-black/10">
                      <td className="py-2 pr-3">{p.name}</td>
                      <td className="py-2 pr-3">{p.size}</td>
                      <td className="py-2 pr-3">{p.unit}</td>
                      <td className="py-2 pr-3">{p.active ? "Sí" : "No"}</td>
                      <td className="py-2">
                        <div className="flex gap-3 flex-wrap">
                          <button className="underline decoration-yellow-400 decoration-2 font-semibold" onClick={() => editPres(p)}>Editar</button>
                          <button className="underline decoration-yellow-400 decoration-2 font-semibold" onClick={() => togglePres(p)}>
                            {p.active ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {presShown.length === 0 && <tr><td colSpan={5} className="py-4 text-neutral-700">Sin presentaciones.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}