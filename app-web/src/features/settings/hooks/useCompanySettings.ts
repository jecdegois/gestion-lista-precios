"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/shared/components/layout/PortalProviders";
import { createCompany, getCompanies, updateCompany } from "../api/settings-api";
import type { CreateCompanyInput, UpdateCompanyInput } from "../schemas/company-schema";
import type { CompanyListItem } from "../types";

/** Compañías con su configuración; guardar refresca el layout para aplicar el color al instante. */
export function useCompanySettings() {
  const router = useRouter();
  const pushToast = useToast();
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await getCompanies();
    if (res.ok) setCompanies(res.data.companies);
    else pushToast(res.error, "error");
    setLoading(false);
  }, [pushToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Devuelve si se guardó. */
  async function save(code: string, input: UpdateCompanyInput) {
    return run(updateCompany(code, input));
  }

  /** Devuelve si se creó. */
  async function create(input: CreateCompanyInput) {
    return run(createCompany(input));
  }

  async function run(action: ReturnType<typeof updateCompany>) {
    const res = await action;
    if (!res.ok) {
      pushToast(res.error, "error");
      return false;
    }
    pushToast(res.message ?? "Configuración guardada", "success");
    await refresh();
    router.refresh();
    return true;
  }

  return { companies, loading, save, create };
}
