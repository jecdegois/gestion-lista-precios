"use client";

import type { FilaPrecio } from "@/shared/types/domain-types";
import TablaImpactoDescuentoManual from "@/features/solicitudes/components/tables/TablaImpactoDescuentoManual";

export default function TablaImpactoActualizacionMasiva({
  filas,
  soloPrecioSolicitado = false,
  mostrarErrores = false,
}: {
  filas: FilaPrecio[];
  soloPrecioSolicitado?: boolean;
  /** Cuando true (hay filas inválidas en modal de revisión), usa modo completo para mostrar causa de error. */
  mostrarErrores?: boolean;
}) {
  const modo = mostrarErrores ? "precioBase" : soloPrecioSolicitado ? "precioBaseRevision" : "precioBase";
  return <TablaImpactoDescuentoManual filas={filas} modo={modo} />;
}
