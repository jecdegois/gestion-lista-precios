"use client";

import Icon from "./Icon";
import type { EstadoRedondeo } from "@/lib/rounding";
import type { EstadoSolicitud } from "@/lib/domain-types";

export function EstadoBadge({ estado }: { estado: EstadoSolicitud | string }) {
  const map: Record<string, { cls: string; dot: string | null; label: string; pulse: boolean }> = {
    BORRADOR: { cls: "badge-outline", dot: "#71717A", label: "Borrador", pulse: false },
    PENDIENTE: { cls: "badge-pendiente", dot: "#B45309", label: "Pendiente de aprobación", pulse: false },
    CANCELACION_SOLICITADA: { cls: "badge-conerrores", dot: "#C2410C", label: "Cancelación solicitada", pulse: false },
    CANCELADO: { cls: "badge-rechazado", dot: "#B91C1C", label: "Cancelado", pulse: false },
    EN_PROCESO: { cls: "badge-enproceso", dot: "#4338CA", label: "En proceso", pulse: true },
    PROCESADO: { cls: "badge-aprobado", dot: "#15803D", label: "Procesado", pulse: false },
    PROCESADO_CON_ERRORES: { cls: "badge-conerrores", dot: "#C2410C", label: "Procesado con errores", pulse: false },
    RECHAZADO: { cls: "badge-rechazado", dot: "#B91C1C", label: "Rechazado", pulse: false },
    ERROR_EJECUCION: { cls: "badge-error", dot: null, label: "Error de ejecución", pulse: false },
  };
  const cfg = map[estado] ?? { cls: "badge-outline", dot: null, label: String(estado), pulse: false };
  return (
    <span className={"badge " + cfg.cls}>
      {cfg.dot && <span className={"dot" + (cfg.pulse ? " dot-pulse" : "")} style={{ background: cfg.dot }} />}
      {estado === "ERROR_EJECUCION" && <Icon name="alertTriangle" className="w-3 h-3" />}
      {cfg.label}
    </span>
  );
}

export function EstadoRedondeoBadge({
  estado,
  banda,
}: {
  estado: EstadoRedondeo | null;
  banda?: { numero: number; intervalo: string } | null;
}) {
  if (estado === "FUERA_DE_RANGO") {
    return (
      <span className="badge badge-costo" title="Precio fuera del rango [0,01 – 100.000,00]">
        <Icon name="alertTriangle" className="w-3 h-3" /> Fuera de rango
      </span>
    );
  }
  if (estado === "ALERTA_MARGEN") {
    return (
      <span className="badge badge-costo" title="El precio redondeado quedó por debajo del Costo Mínimo del Artículo">
        <Icon name="alertTriangle" className="w-3 h-3" /> Alerta de Margen
      </span>
    );
  }
  if (estado === "CALCULADO") {
    const t = banda ? `Banda ${banda.numero} · ${banda.intervalo}` : "";
    return (
      <span className="badge badge-ok" title={t}>
        <Icon name="check" className="w-3 h-3" /> Calculado
      </span>
    );
  }
  return <span className="badge badge-outline">—</span>;
}
