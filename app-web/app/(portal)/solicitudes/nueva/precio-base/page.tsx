import NewRequestView from "@/features/solicitudes/components/new-request/NewRequestView";
import { esModoSoloLectura, esModoSoloPortal } from "@/server/companies";

export const metadata = { title: "Precio Base — Nueva solicitud" };

export default function NewRequestPage() {
  return <NewRequestView process="MAYOREOD_MASIVO" readOnly={esModoSoloLectura()} consultOnly={esModoSoloPortal()} />;
}
