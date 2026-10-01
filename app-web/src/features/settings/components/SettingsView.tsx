"use client";

import { useState } from "react";
import Icon from "@/shared/components/ui/Icon";
import { notify } from "@/shared/notifications/notify";
import ResponsiveDataTable from "@/shared/components/ui/ResponsiveDataTable";
import { useCurrentUser } from "@/shared/components/layout/PortalProviders";
import { useCompanySettings } from "../hooks/useCompanySettings";
import type { CompanyListItem } from "../types";
import CompanyModal from "./CompanyModal";
import DeleteCompanyModal from "./DeleteCompanyModal";
import { companyColumns } from "./table/company-columns";

/** Configuración: gestión de las compañías (alta y edición en `CompanyModal`). */
export default function SettingsView() {
  const user = useCurrentUser();
  const { companies, loading, save, create, remove } = useCompanySettings();
  // null: cerrado; "new": alta; una compañía: edición.
  const [modal, setModal] = useState<"new" | CompanyListItem | null>(null);
  const [toDelete, setToDelete] = useState<CompanyListItem | null>(null);
  const columns = companyColumns({ inUseCode: user.compania, onEdit: setModal, onDelete: handleDelete });

  // La compañía en uso no se elimina (la API también lo valida): solo se avisa.
  function handleDelete(company: CompanyListItem) {
    if (company.code === user.compania) notify.error("No puede eliminar la compañía que está usando; cambie de compañía primero");
    else setToDelete(company);
  }

  return (
    <div className="flex flex-col gap-4">
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
          onSubmit={({ code, ...input }, logo) => (modal === "new" ? create({ code, ...input }, logo) : save(modal.code, input, logo))}
        />
      )}

      {toDelete && (
        <DeleteCompanyModal company={toDelete} onClose={() => setToDelete(null)} onConfirm={() => remove(toDelete.code)} />
      )}
    </div>
  );
}
