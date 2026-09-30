import AuditView from "@/features/auditoria/components/AuditView";

export const metadata = { title: "Auditoría — Gestión Masiva de Precios" };

export default function AuditPage() {
  return (
    <>
      <h1 className="text-xl font-bold text-zinc-900 mb-1">Auditoría y Logs</h1>
      <p className="text-sm text-zinc-500 mb-4">Trazabilidad de eventos del flujo maker-checker.</p>
      <AuditView />
    </>
  );
}
