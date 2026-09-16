"use client";

import { useMemo } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TableColumn<Row> {
  key: string;
  header: string;
  headerClass?: string;
  cellClass?: string;
  align?: "left" | "center" | "right";
  value?: (row: Row) => ReactNode;
  render?: (row: Row) => ReactNode;
}

interface ResponsiveDataTableProps<Row> {
  rows: readonly Row[];
  columns: readonly TableColumn<Row>[];
  rowKey: (row: Row) => string;
  loading?: boolean;
  error?: boolean;
  errorText?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  meta?: PageMeta | null;
  page?: number;
  limit?: number;
  pageSizes?: readonly number[];
  redirectOnRowClick?: boolean;
  getRowDestination?: (row: Row) => string | undefined;
  tableHeightClass?: string;
  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  onRowActivate?: (row: Row) => void;
  rowClassName?: (row: Row) => string;
}

const ALIGNMENT_CLASSES: Record<NonNullable<TableColumn<unknown>["align"]>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function contentFor<Row>(row: Row, column: TableColumn<Row>): ReactNode {
  if (column.render) return column.render(row);
  if (column.value) return column.value(row);
  return "";
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("button, a, input, select, textarea, [role='button'], [role='link']"));
}

export default function ResponsiveDataTable<Row>({
  rows,
  columns,
  rowKey,
  loading = false,
  error = false,
  errorText = "Error al cargar los datos.",
  emptyTitle = "No hay registros",
  emptyDescription = "Intenta ajustar los filtros.",
  meta = null,
  page = 1,
  limit = 20,
  pageSizes = [10, 20, 50],
  redirectOnRowClick = false,
  getRowDestination,
  tableHeightClass = "max-h-[56vh] sm:max-h-[58vh] md:max-h-[64vh] lg:max-h-[70vh] xl:max-h-[74vh]",
  onPageChange,
  onLimitChange,
  onRowActivate,
  rowClassName,
}: ResponsiveDataTableProps<Row>) {
  const totalPages = meta?.totalPages ?? 1;
  const safePage = Math.min(Math.max(page, 1), Math.max(totalPages, 1));
  const hasPagination = Boolean(meta && meta.total > 0 && totalPages > 1);
  const columnAlignment = useMemo(
    () => columns.map((column) => ALIGNMENT_CLASSES[column.align ?? "left"]),
    [columns],
  );

  function activateRow(row: Row, event?: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) {
    if (!redirectOnRowClick || !getRowDestination || (event && isInteractiveTarget(event.target))) return;
    const destination = getRowDestination(row);
    if (!destination) return;
    onRowActivate?.(row);
    window.location.assign(destination);
  }

  function handleRowKeyDown(row: Row, event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activateRow(row, event);
  }

  if (loading) {
    return <div className={`card flex items-center justify-center border-dashed text-sm text-zinc-500 ${tableHeightClass}`}>Cargando...</div>;
  }

  if (error) {
    return <div className={`card flex items-center justify-center border-red-200 bg-red-50 px-4 text-center text-sm text-red-700 ${tableHeightClass}`}>{errorText}</div>;
  }

  if (rows.length === 0) {
    return (
      <div className={`card flex flex-col items-center justify-center px-4 text-center ${tableHeightClass}`}>
        <p className="text-sm font-medium text-zinc-600">{emptyTitle}</p>
        <p className="mt-1 text-xs text-zinc-400">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div>
      <div className={`card hidden overflow-hidden md:block ${tableHeightClass}`}>
        <div className="overflow-auto" style={{ maxHeight: "inherit" }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-50 text-xs text-zinc-500">
              <tr>
                {columns.map((column, index) => (
                  <th key={column.key} scope="col" className={`whitespace-nowrap px-3 py-2 font-medium ${columnAlignment[index]} ${column.headerClass ?? ""}`}>
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => {
                const interactive = Boolean(redirectOnRowClick && getRowDestination?.(row));
                return (
                  <tr
                    key={rowKey(row)}
                    className={`transition-colors ${rowClassName?.(row) ?? ""} ${interactive ? "cursor-pointer hover:bg-zinc-50 focus:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-zinc-400" : ""}`}
                    tabIndex={interactive ? 0 : undefined}
                    role={interactive ? "link" : undefined}
                    aria-label={interactive ? `Abrir detalle de ${rowKey(row)}` : undefined}
                    onClick={(event) => activateRow(row, event)}
                    onKeyDown={(event) => handleRowKeyDown(row, event)}
                  >
                    {columns.map((column, index) => (
                      <td key={column.key} className={`px-3 py-2 ${columnAlignment[index]} ${column.cellClass ?? ""}`}>
                        {contentFor(row, column)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2 md:hidden">
        {rows.map((row) => {
          const interactive = Boolean(redirectOnRowClick && getRowDestination?.(row));
          return (
            <div
              key={rowKey(row)}
              className={`card p-3 ${rowClassName?.(row) ?? ""} ${interactive ? "cursor-pointer hover:bg-zinc-50 focus:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400" : ""}`}
              tabIndex={interactive ? 0 : undefined}
              role={interactive ? "link" : undefined}
              aria-label={interactive ? `Abrir detalle de ${rowKey(row)}` : undefined}
              onClick={(event) => activateRow(row, event)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                activateRow(row, event);
              }}
            >
              <dl className="space-y-2">
                {columns.map((column, index) => (
                  <div key={column.key} className="grid grid-cols-[minmax(0,38%)_1fr] gap-2 text-xs">
                    <dt className={`font-medium text-zinc-500 ${columnAlignment[index]}`}>{column.header}</dt>
                    <dd className={`min-w-0 text-zinc-800 ${columnAlignment[index]} ${column.cellClass ?? ""}`}>{contentFor(row, column)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>

      {hasPagination && meta && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
          <span>Página {safePage} de {meta.totalPages} · {meta.total} registros</span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1">
              Filas
              <select
                className="rounded border border-zinc-200 bg-white px-1.5 py-1"
                value={limit}
                aria-label="Filas por página"
                onChange={(event) => {
                  const nextLimit = Number(event.target.value);
                  onLimitChange?.(nextLimit);
                  onPageChange?.(1);
                }}
              >
                {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <button className="btn btn-outline" disabled={safePage <= 1} onClick={() => onPageChange?.(safePage - 1)}>Anterior</button>
            <button className="btn btn-outline" disabled={safePage >= meta.totalPages} onClick={() => onPageChange?.(safePage + 1)}>Siguiente</button>
          </div>
        </div>
      )}
    </div>
  );
}
