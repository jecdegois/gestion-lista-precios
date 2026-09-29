import { EstadoRedondeoBadge } from "@/components/Badges";
import { calcularCostoMinimoArticulo } from "@/lib/catalog";
import type { ArticuloCatalogo } from "@/lib/domain-types";
import type { PreviewRedondeo } from "@/lib/preview";
import { Monto } from "@/shared/components/layout/PortalProviders";

function InfoCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card p-2.5">
      <p className="text-[10px] text-zinc-400">{label}</p>
      <p className="text-xs font-medium">{value}</p>
    </div>
  );
}

/** Precios del artículo seleccionado y vista previa del redondeo con el descuento capturado. */
export default function ArticleSummary({ article, preview }: { article: ArticuloCatalogo; preview: PreviewRedondeo | null }) {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <InfoCard label="Descripción" value={article.descripcion} />
        <InfoCard label="Precio Actual" value={<Monto n={article.precioActual} />} />
        <InfoCard label="Precio Calc. Base" value={preview ? <Monto n={preview.precioOriginal} /> : "—"} />
        <InfoCard label="Precio Red." value={preview?.precioRedondeado != null ? <Monto n={preview.precioRedondeado} /> : "—"} />
        <InfoCard label="Costo Mínimo" value={<Monto n={calcularCostoMinimoArticulo(article)} />} />
      </div>
      {preview && <EstadoRedondeoBadge estado={preview.estado} banda={preview.banda} />}
    </>
  );
}
