import InboxView from "@/features/solicitudes/components/inbox/InboxView";
import { esModoSoloLectura } from "@/server/companies";

export const metadata = { title: "Bandeja de aprobación — Gestión Masiva de Precios" };

export default function InboxPage() {
  return (
    <>
      <h1 className="text-xl font-bold text-zinc-900 mb-1">Bandeja de aprobación</h1>
      <p className="text-sm text-zinc-500 mb-4">Revise las solicitudes de su compañía y consulte su detalle.</p>
      <InboxView readOnly={esModoSoloLectura()} />
    </>
  );
}
