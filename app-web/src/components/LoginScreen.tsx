"use client";

import { useState } from "react";
import Icon, { initials } from "./Icon";
import { IDENTIDADES } from "@/lib/catalog";
import { resolverIdentidad } from "@/app/actions";
import type { Identidad } from "@/lib/domain-types";

export default function LoginScreen({ onLogin, demo }: { onLogin: (i: Identidad) => void; demo: boolean }) {
  const [selectedEmail, setSelectedEmail] = useState("");
  const [realEmail, setRealEmail] = useState("");
  const [compania, setCompania] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleRealContinue() {
    if (!realEmail.trim() || isLoading) return;
    setIsLoading(true);
    setError("");
    try {
      const identity = await resolverIdentidad(realEmail, compania);
      if (!identity) {
        setError("No se encontró un usuario activo con ámbito OPERADOR o APROBADOR para los datos indicados.");
        return;
      }
      onLogin(identity);
    } catch {
      setError("No fue posible consultar la identidad en el Portal. Verifique la configuración de SQL Server.");
    } finally {
      setIsLoading(false);
    }
  }

  if (!demo) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-10 bg-white">
        <div className="relative w-full max-w-md">
          <div className="text-center mb-10">
            <div className="w-14 h-14 rounded-lg bg-zinc-900 flex items-center justify-center text-white font-bold text-lg mx-auto mb-4 shadow-md">
              GP
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 mb-1">Gestión Masiva de Precios</h1>
            <p className="text-zinc-500 text-sm">Sistema de automatización de listas de precio</p>
          </div>

          <div className="card p-8 shadow-lg border border-zinc-100">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-zinc-900 mb-1">Seleccione su cuenta</h2>
              <p className="text-zinc-500 text-sm">Ingrese sus datos corporativos para continuar</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5" htmlFor="real-login-email">Correo corporativo</label>
                <input
                  id="real-login-email"
                  data-testid="real-login-email-input"
                  type="email"
                  value={realEmail}
                  onChange={(e) => setRealEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleRealContinue(); }}
                  placeholder="usuario@empresa.com"
                  className="input w-full"
                  autoComplete="username"
                  disabled={isLoading}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5" htmlFor="real-login-company">Compañía</label>
                <input
                  id="real-login-company"
                  data-testid="real-login-company-input"
                  value={compania}
                  onChange={(e) => setCompania(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleRealContinue(); }}
                  placeholder="FEBECA"
                  className="input w-full"
                  autoComplete="organization"
                  disabled={isLoading}
                />
              </div>
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700" role="alert">
                  <Icon name="alertTriangle" className="w-3.5 h-3.5 inline mr-1.5" />
                  {error}
                </div>
              )}
              <button
                type="button"
                data-testid="real-login-submit-button"
                disabled={!realEmail.trim() || isLoading}
                onClick={() => void handleRealContinue()}
                className="w-full btn btn-default"
              >
                {isLoading ? (
                  <><Icon name="loader" className="w-4 h-4" spin /> Consultando identidad...</>
                ) : (
                  <><Icon name="check" className="w-4 h-4" /> Continuar</>
                )}
              </button>
            </div>
          </div>

          <div className="mt-6 text-center space-y-1">
            <p className="text-zinc-500 text-xs">La compañía se asigna explícitamente según los permisos de cada usuario.</p>
          </div>
        </div>
      </div>
    );
  }

  const usuariosDisponibles = IDENTIDADES.filter((i) => i.rol !== "SIN_PERMISO");
  const selectedIdentity = IDENTIDADES.find((i) => i.email === selectedEmail);
  const sinAcceso = selectedIdentity?.rol === "SIN_PERMISO";

  function handleDemoContinue() {
    if (!selectedEmail || isLoading) return;
    setIsLoading(true);
    setTimeout(() => {
      const identity = IDENTIDADES.find((i) => i.email === selectedEmail);
      if (identity) onLogin(identity);
      setIsLoading(false);
    }, 1200);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10 bg-white">
      <div className="relative w-full max-w-md">
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-lg bg-zinc-900 flex items-center justify-center text-white font-bold text-lg mx-auto mb-4 shadow-md">GP</div>
          <h1 className="text-2xl font-bold text-zinc-900 mb-1">Gestión Masiva de Precios</h1>
          <p className="text-zinc-500 text-sm">Sistema de automatización de listas de precio</p>
        </div>

        <div className="card p-8 shadow-lg border border-zinc-100">
          {!selectedEmail ? (
            <div className="space-y-5">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-zinc-900 mb-1">Seleccione su cuenta</h2>
                <p className="text-zinc-500 text-sm">Elija un usuario para continuar</p>
              </div>
              <div className="space-y-2">
                {usuariosDisponibles.map((identity) => (
                  <button key={identity.email} type="button" onClick={() => setSelectedEmail(identity.email)} className="w-full text-left p-3.5 rounded-lg border-2 border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 transition-all cursor-pointer group">
                    <div className="flex items-center gap-3">
                      <span className="avatar w-11 h-11 text-sm" style={{ background: identity.color }}>{initials(identity.nombre)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-900">{identity.nombre}</p>
                        <p className="text-xs text-zinc-500 mono truncate">{identity.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="badge badge-outline text-[11px]">{identity.rol}</span>
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity"><Icon name="chevronRight" className="w-4 h-4 text-zinc-400" /></span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 space-y-1">
                <p className="font-medium flex items-center gap-1.5"><Icon name="info" className="w-3.5 h-3.5" /> {usuariosDisponibles.length} usuario(s) disponible(s)</p>
                <p className="text-[11px]">Acceso simulado para desarrollo local.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-zinc-900 mb-1">Confirmación de cuenta</h2>
                <p className="text-zinc-500 text-sm">Verifique sus datos antes de continuar</p>
              </div>
              <div className="rounded-lg border-2 border-zinc-300 bg-gradient-to-br from-zinc-50 to-white p-5">
                <div className="flex items-center gap-4 mb-5">
                  <span className="avatar w-14 h-14 text-lg" style={{ background: selectedIdentity!.color }}>{initials(selectedIdentity!.nombre)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-900 font-semibold text-sm">{selectedIdentity!.nombre}</p>
                    <p className="text-zinc-500 text-xs mono truncate">{selectedIdentity!.email}</p>
                  </div>
                </div>
                <div className="space-y-2.5 border-t border-zinc-200 pt-4">
                  <div className="flex justify-between items-center"><span className="text-xs text-zinc-600 font-medium">Compañía</span><span className="text-sm text-zinc-900 font-semibold">{selectedIdentity!.compania || "—"}</span></div>
                  <div className="flex justify-between items-center"><span className="text-xs text-zinc-600 font-medium">Rol</span><span className="text-sm font-semibold text-blue-600">{selectedIdentity!.rol}</span></div>
                  {sinAcceso && <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg"><p className="text-red-700 text-xs flex items-center gap-1.5 font-medium"><Icon name="alertTriangle" className="w-3.5 h-3.5 flex-none" /> Esta cuenta no tiene permisos para acceder al módulo</p></div>}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setSelectedEmail("")} disabled={isLoading} className="flex-1 btn btn-secondary"><Icon name="x" className="w-4 h-4" /> Cambiar</button>
                <button type="button" disabled={!selectedEmail || isLoading || sinAcceso} onClick={handleDemoContinue} className="flex-1 btn btn-default">
                  {isLoading ? <><Icon name="loader" className="w-4 h-4" spin /> Autenticando...</> : <><Icon name="check" className="w-4 h-4" /> Continuar</>}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="mt-6 text-center space-y-1"><p className="text-zinc-500 text-xs">Modo demo explícito para desarrollo local.</p></div>
        {isLoading && <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="bg-white rounded-lg p-6 text-center"><div className="w-10 h-10 border-4 border-zinc-300 border-t-zinc-900 rounded-full animate-spin mx-auto mb-3" /><p className="text-zinc-900 text-sm font-medium">Iniciando sesión...</p><p className="text-zinc-500 text-xs mt-1">Validando identidad simulada</p></div></div>}
      </div>
    </div>
  );
}
