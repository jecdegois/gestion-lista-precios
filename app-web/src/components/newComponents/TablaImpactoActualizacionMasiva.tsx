"use client";

import type { FilaPrecio } from "@/lib/domain-types";
import TablaImpactoDescuentoManual from "./TablaImpactoDescuentoManual";

export default function TablaImpactoActualizacionMasiva({
  filas,
  soloPrecioSolicitado = false,
}: {
  filas: FilaPrecio[];
  soloPrecioSolicitado?: boolean;
}) {
  return <TablaImpactoDescuentoManual filas={filas} modo={soloPrecioSolicitado ? "precioBaseRevision" : "precioBase"} />;
}
