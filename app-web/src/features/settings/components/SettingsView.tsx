"use client";

import { useState } from "react";
import Icon from "@/shared/components/ui/Icon";
import ResponsiveDataTable from "@/shared/components/ui/ResponsiveDataTable";
import { useCurrentUser } from "@/shared/components/layout/PortalProviders";
import { useCompanySettings } from "../hooks/useCompanySettings";
import type { CompanyListItem } from "../types";
import CompanyModal from "./CompanyModal";
import { companyColumns } from "./table/company-columns";

/** Configuración: compañía en uso y gestión de las compañías (alta y edición en `CompanyModal`). */
export default function SettingsView() {
  const user = useCurrentUser();
  const { companies, loading, save, create } = useCompanySettings();
  // null: cerrado; "new": alta; una compañía: edición.
  const [modal, setModal] = useState<"new" | CompanyListItem | null>(null);
  const current = companies.find((c) => c.code === user.compania);
  const columns = companyColumns({ inUseCode: user.compania, onEdit: setModal });

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg flex-none" style={{ background: "var(--accent)" }} aria-hidden />
        <div>
          <p className="text-xs text-zinc-500">Compañía en uso</p>
          <p className="text-sm font-semibold text-zinc-900">
            {current?.name ?? user.compania ?? "Sin compañía asignada"}
            {[current?.country, current?.currencySymbol].filter(Boolean).map((v) => (
              <span key={v} className="font-normal text-zinc-500"> · {v}</span>
            ))}
          </p>
          <p className="text-xs text-zinc-500">
            {user.compania
              ? "Su color de marca se aplica a los acentos del portal."
              : "Sin compañía asignada se usa el color por defecto."}
          </p>
        </div>
      </section>

      <div className="flex justify-end">
        <button className="btn btn-default" onClick={() => setModal("new")}>
          <Icon name="plus" className="w-4 h-4" /> Nueva compañía
        </button>
      </div>

      <ResponsiveDataTable<CompanyListItem>
        rows={companies}
        columns={columns}
        rowKey={(c) => c.code}
        loading={loading}
        onRowActivate={setModal}
        rowClassName={(c) => (c.code === user.compania ? "bg-zinc-50" : "")}
        emptyTitle="No hay compañías activas"
        emptyDescription="Cree una con «Nueva compañía»."
        tableHeightClass="max-h-[70vh]"
      />

      {modal && (
        <CompanyModal
          company={modal === "new" ? undefined : modal}
          onClose={() => setModal(null)}
          onSubmit={({ code, ...input }) => (modal === "new" ? create({ code, ...input }) : save(modal.code, input))}
        />
      )}
    </div>
  );
}
