import NewRequestView from "@/features/solicitudes/components/new-request/NewRequestView";
import { esModoSoloLectura, esModoSoloPortal } from "@/server/companies";

export const metadata = { title: "Gestión Global — Nueva solicitud" };

export default function NewRequestPage() {
  return <NewRequestView process="FACTOR_PRECIO" readOnly={esModoSoloLectura()} consultOnly={esModoSoloPortal()} />;
}
