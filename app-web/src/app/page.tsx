import PortalApp from "@/components/PortalApp";
import { esModoDemo, esModoSoloLectura, esModoSoloPortal } from "@/server/companies";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <PortalApp demo={esModoDemo()} readOnly={esModoSoloLectura()} portalOnly={esModoSoloPortal()} />;
}
