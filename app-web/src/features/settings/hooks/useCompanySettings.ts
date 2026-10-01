"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { notify } from "@/shared/notifications/notify";
import { createCompany, deleteCompany, getCompanies, setCompanyLogo, updateCompany } from "../api/settings-api";
import type { CreateCompanyInput, UpdateCompanyInput } from "../schemas/company-schema";
import type { CompanyListItem } from "../types";

/** File = cargar, null = quitar, undefined = sin cambios. */
export type LogoChange = File | null | undefined;

/** Compañías con su configuración; guardar refresca el layout para aplicar el color al instante. */
export function useCompanySettings() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await getCompanies();
    if (res.ok) setCompanies(res.data.companies);
    else notify.error(res.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Guarda los datos y, si `logo` no es undefined, carga (File) o quita (null) el logo.
   * Devuelve si se guardó.
   */
  async function save(code: string, input: UpdateCompanyInput, logo?: LogoChange) {
    return run(() => updateCompany(code, input), code, logo);
  }

  /** Devuelve si se creó. */
  async function create(input: CreateCompanyInput, logo?: LogoChange) {
    return run(() => createCompany(input), input.code, logo);
  }

  /** Devuelve si se eliminó. */
  async function remove(code: string) {
    const res = await deleteCompany(code);
    if (!res.ok) {
      notify.error(res.error);
      return false;
    }
    notify.success(res.message ?? "Compañía eliminada");
    await refresh();
    router.refresh();
    return true;
  }

  async function run(action: () => ReturnType<typeof updateCompany>, code: string, logo: LogoChange) {
    let res = await action();
    // El logo va después: en el alta la compañía tiene que existir antes de cargarlo.
    if (res.ok && logo !== undefined) res = await setCompanyLogo(code, logo);
    if (!res.ok) {
      notify.error(res.error);
      return false;
    }
    notify.success(res.message ?? "Configuración guardada");
    await refresh();
    router.refresh();
    return true;
  }

  return { companies, loading, save, create, remove };
}
