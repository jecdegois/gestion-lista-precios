import NewRequestView from "@/features/solicitudes/components/new-request/NewRequestView";
import { esModoSoloLectura, esModoSoloPortal } from "@/server/companies";

export const metadata = { title: "Margen de Utilidad — Nueva solicitud" };

export default function NewRequestPage() {
  return <NewRequestView process="MARGEN_UTILIDAD_MASIVO" readOnly={esModoSoloLectura()} consultOnly={esModoSoloPortal()} />;
}
