import type { TableColumn } from "@/shared/components/ui/ResponsiveDataTable";
import ColorSwatch from "@/shared/components/ui/ColorSwatch";
import Icon from "@/shared/components/ui/Icon";
import type { CompanyListItem } from "../../types";

/** Bases donde falta el esquema de la compañía (vacío si existe o si no se pudo verificar). */
function missingSchemas(company: CompanyListItem): string[] {
  const status = company.schemaStatus;
  if (!status) return [];
  return [!status.softland && "Softland", !status.portal && "PORTAL_PRECIOS"].filter((db): db is string => !!db);
}

export function companyColumns({
  inUseCode,
  onEdit,
  onDelete,
}: {
  inUseCode: string | null;
  onEdit: (company: CompanyListItem) => void;
  onDelete: (company: CompanyListItem) => void;
}): TableColumn<CompanyListItem>[] {
  return [
    {
      key: "code",
      header: "Código",
      headerClass: "w-[110px]",
      value: (c) => <code className="mono bg-zinc-100 text-zinc-600 rounded px-1.5 py-0.5">{c.code.toLowerCase()}</code>,
    },
    {
      key: "name",
      header: "Compañía",
      headerClass: "w-[38%]",
      render: (c) => (
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-900">{c.name}</span>
            {c.code === inUseCode && <span className="badge badge-ok">En uso</span>}
          </div>
          <p className="mono text-zinc-500 mt-0.5">Esquema {c.sqlSchema}</p>
          {missingSchemas(c).map((db) => (
            <span key={db} className="badge badge-conerrores mt-1 mr-1" title={`No existe el esquema ${c.sqlSchema} en ${db}`}>
              Falta esquema en {db}
            </span>
          ))}
        </div>
      ),
    },
    { key: "country", header: "País", cellClass: "text-sm text-zinc-600", value: (c) => c.country || "—" },
    { key: "currency", header: "Moneda", cellClass: "text-sm text-zinc-600", value: (c) => c.currencySymbol || "—" },
    {
      key: "color",
      header: "Color de marca",
      value: (c) => (
        <span className="inline-flex items-center gap-2 mono text-zinc-600">
          <ColorSwatch color={c.brandColor} />
          {c.brandColor}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Acciones",
      align: "right",
      render: (c) => (
        <div className="inline-flex gap-1">
          <button className="btn btn-outline" onClick={() => onEdit(c)}>
            Editar
          </button>
          <button
            className="btn btn-ghost"
            title={`Eliminar ${c.name}`}
            aria-label={`Eliminar ${c.name}`}
            onClick={(e) => {
              // Sin propagar: la fila abriría el modal de edición.
              e.stopPropagation();
              onDelete(c);
            }}
          >
            <Icon name="trash" className="w-4 h-4 text-red-600" />
          </button>
        </div>
      ),
    },
  ];
}
