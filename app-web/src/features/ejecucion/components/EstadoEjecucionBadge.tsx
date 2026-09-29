import type { EstadoEjecucion } from "@/lib/domain-types";

const ESTADO_STYLES: Record<EstadoEjecucion, { cls: string; label: string }> = {
  PENDIENTE:              { cls: "badge-pendiente",  label: "Pendiente"             },
  EN_PROCESO:             { cls: "badge-enproceso",  label: "En proceso"            },
  COMPLETADO:             { cls: "badge-aprobado",   label: "Completado"            },
  COMPLETADO_CON_ERRORES: { cls: "badge-conerrores", label: "Completado c/ errores" },
  ERROR:                  { cls: "badge-error",      label: "Error"                 },
};

export default function EstadoEjecucionBadge({ estado }: { estado: EstadoEjecucion }) {
  const { cls, label } = ESTADO_STYLES[estado] ?? { cls: "badge-outline", label: estado };
  return (
    <span className={`badge ${cls}`}>
      {estado === "EN_PROCESO" && (
        <span className="dot dot-pulse" style={{ background: "currentColor" }} />
      )}
      {label}
    </span>
  );
}
