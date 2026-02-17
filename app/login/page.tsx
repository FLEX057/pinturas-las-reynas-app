"use client";

import React, { useEffect, useState } from "react";

type User = { id: string; name: string; role: "admin" | "cashier" | "mixer"; branch_id: string | null };

export default function LoginPage() {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => setMounted(true), []);

  async function onLogin() {
    setMsg("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, pin }),
      });

      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : null;

      if (!res.ok || !data?.ok) {
        setMsg(data?.error || `Error (HTTP ${res.status})`);
        return;
      }

      const u: User = data.user;
      localStorage.setItem("plr_user", JSON.stringify(u));

      if (u.role === "admin") window.location.href = "/admin";
      else if (u.role === "mixer") window.location.href = "/igualador";
      else window.location.href = "/caja";
    } catch (e: any) {
      console.error(e);
      setMsg(e?.message ?? "Error");
    }
  }

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="bg-black text-yellow-400">
        <div className="mx-auto max-w-xl px-4 py-6 flex items-center gap-3">
          <div className="h-14 w-14 bg-white rounded-xl p-1 flex items-center justify-center border border-yellow-300/40">
            <img src="/logo.png" className="h-12 w-12 object-contain" alt="Logo" />
          </div>
          <div>
            <div className="text-lg font-bold">Pinturas “Las Reynas”</div>
            <div className="text-xs text-yellow-200">Inicio de sesión</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="bg-white border-2 border-black/10 rounded-2xl p-6 shadow-sm">
          <div className="font-bold text-black">Entrar</div>
          <div className="text-sm text-neutral-800 mt-1">Usuario + PIN</div>

          <div className="mt-4 grid gap-3">
            <div>
              <div className="text-sm font-semibold text-black">Usuario</div>
              <input
                className="mt-1 w-full border-2 border-black/40 rounded-xl px-3 py-2 text-neutral-900 placeholder:text-neutral-500 focus:border-yellow-400 focus:outline-none"
                placeholder='Ej: "Igualador Tec"'
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <div className="text-sm font-semibold text-black">PIN</div>
              <input
                className="mt-1 w-full border-2 border-black/40 rounded-xl px-3 py-2 text-neutral-900 placeholder:text-neutral-500 focus:border-yellow-400 focus:outline-none"
                placeholder="PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                inputMode="numeric"
              />
            </div>

            <button
              className="bg-yellow-400 text-black font-semibold rounded-xl px-4 py-2 hover:bg-yellow-300 border-2 border-black"
              onClick={onLogin}
            >
              Entrar
            </button>

            {msg && <div className="text-sm text-red-700 whitespace-pre-wrap">{msg}</div>}
          </div>
        </div>
      </div>
    </main>
  );
}