import NewRequestView from "@/features/solicitudes/components/new-request/NewRequestView";
import { esModoSoloLectura, esModoSoloPortal } from "@/server/companies";

export const metadata = { title: "Descuento Artículo - Lista — Nueva solicitud" };

export default function NewRequestPage() {
  return <NewRequestView process="DESCUENTO_LISTA_PRECIO" readOnly={esModoSoloLectura()} consultOnly={esModoSoloPortal()} />;
}
