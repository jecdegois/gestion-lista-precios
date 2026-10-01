"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ColorInput from "@/shared/components/ui/ColorInput";
import FormField from "@/shared/components/ui/FormField";
import Modal from "@/shared/components/ui/Modal";
import { CompanyFormSchema, type CreateCompanyInput } from "../schemas/company-schema";
import type { LogoChange } from "../hooks/useCompanySettings";
import type { CompanySettings } from "../types";
import { DEFAULT_BRAND_COLOR } from "../utils/brand-color";
import LogoInput from "./LogoInput";

const EMPTY: CreateCompanyInput = {
  code: "",
  name: "",
  sqlSchema: "",
  country: "",
  currencySymbol: "",
  brandColor: DEFAULT_BRAND_COLOR,
};

/**
 * Alta y edición de compañía (con `company`, el código queda fijo).
 * Valida en cliente con el mismo schema que la API.
 */
export default function CompanyModal({
  company,
  onClose,
  onSubmit,
}: {
  company?: CompanySettings;
  onClose: () => void;
  onSubmit: (input: CreateCompanyInput, logo: LogoChange) => Promise<boolean>;
}) {
  const editing = !!company;
  const [logo, setLogo] = useState<LogoChange>(undefined);
  const [logoError, setLogoError] = useState<string>();
  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(CompanyFormSchema), defaultValues: company ? { ...company } : EMPTY });

  async function submit(input: CreateCompanyInput) {
    if (await onSubmit(input, logo)) onClose();
  }

  return (
    <Modal
      title={editing ? `Editar ${company.name}` : "Nueva compañía"}
      onClose={onClose}
      onSubmit={handleSubmit(submit)}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-default" disabled={isSubmitting}>
            {isSubmitting ? "Guardando…" : editing ? "Guardar cambios" : "Crear compañía"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Código" hint={editing ? "No se puede cambiar" : "Único; p. ej. COFERSA"} error={errors.code?.message}>
          <input className="input uppercase" {...register("code")} maxLength={30} autoFocus={!editing} disabled={editing} />
        </FormField>
        <FormField label="Nombre" error={errors.name?.message}>
          <input className="input" {...register("name")} maxLength={100} />
        </FormField>
        <FormField label="Esquema SQL" error={errors.sqlSchema?.message}>
          <input className="input uppercase" {...register("sqlSchema")} maxLength={30} placeholder={watch("code").toUpperCase()} />
        </FormField>
        <FormField label="País" hint="Código de 2 letras; p. ej. VE" error={errors.country?.message}>
          <input className="input uppercase" {...register("country")} maxLength={2} />
        </FormField>
        <FormField label="Moneda" hint="Símbolo; p. ej. Bs." error={errors.currencySymbol?.message}>
          <input className="input" {...register("currencySymbol")} maxLength={5} />
        </FormField>
        <FormField label="Color de marca" error={errors.brandColor?.message}>
          <Controller
            control={control}
            name="brandColor"
            render={({ field }) => <ColorInput label="Color de marca" value={field.value} onChange={field.onChange} />}
          />
        </FormField>
        <FormField label="Logo" hint="PNG, JPEG o WebP de hasta 512 KB; se muestra en el header" error={logoError} className="sm:col-span-2">
          <LogoInput currentUrl={company?.logoUrl ?? null} value={logo} onChange={setLogo} onError={setLogoError} />
        </FormField>
      </div>
    </Modal>
  );
}
