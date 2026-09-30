"use client";

import { PROCESOS } from "@/lib/catalog";
import type { ProcesoKey } from "@/lib/domain-types";
import { useCurrentUser } from "@/shared/components/layout/PortalProviders";
import ProcessTabs from "../ProcessTabs";
import CompanyContext, { type CatalogStatus } from "./CompanyContext";
import DraftBanner from "./DraftBanner";

/** Marco común de los formularios de Nueva Solicitud: borrador, pestañas, descripción y compañía. */
export default function ProcessFormLayout({
  process,
  draftId,
  onDiscardDraft,
  catalogStatus,
  children,
}: {
  process: ProcesoKey;
  draftId: string | null;
  onDiscardDraft: () => void;
  catalogStatus: CatalogStatus;
  children: React.ReactNode;
}) {
  const company = useCurrentUser().compania ?? "";
  return (
    <div className="card p-5">
      {draftId && <DraftBanner id={draftId} onDiscard={onDiscardDraft} />}
      <ProcessTabs />
      <h3 className="text-sm font-semibold mb-1">{PROCESOS[process].desc}</h3>
      <CompanyContext company={company} status={catalogStatus} />
      {children}
    </div>
  );
}
