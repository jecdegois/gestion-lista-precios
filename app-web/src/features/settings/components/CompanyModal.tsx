"use client";

import { useState } from "react";
import ColorInput from "@/shared/components/ui/ColorInput";
import FormField from "@/shared/components/ui/FormField";
import Modal from "@/shared/components/ui/Modal";
import { CreateCompanySchema, type CreateCompanyInput } from "../schemas/company-schema";
import type { CompanySettings } from "../types";
import { DEFAULT_BRAND_COLOR } from "../utils/brand-color";

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
  onSubmit: (input: CreateCompanyInput) => Promise<boolean>;
}) {
  const editing = !!company;
  const [data, setData] = useState<CreateCompanyInput>(company ? { ...company } : EMPTY);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const set = (field: keyof CreateCompanyInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setData((d) => ({ ...d, [field]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // El esquema SQL toma el código cuando se deja vacío.
    const parsed = CreateCompanySchema.safeParse({ ...data, sqlSchema: data.sqlSchema.trim() || data.code });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setError("");
    setSubmitting(true);
    const ok = await onSubmit(parsed.data);
    setSubmitting(false);
    if (ok) onClose();
  }

  return (
    <Modal
      title={editing ? `Editar ${company.name}` : "Nueva compañía"}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-default" disabled={submitting}>
            {submitting ? "Guardando…" : editing ? "Guardar cambios" : "Crear compañía"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Código" hint={editing ? "No se puede cambiar" : "Único; p. ej. COFERSA"}>
          <input
            className="input uppercase"
            value={data.code}
            onChange={set("code")}
            maxLength={30}
            autoFocus={!editing}
            disabled={editing}
            required
          />
        </FormField>
        <FormField label="Nombre">
          <input className="input" value={data.name} onChange={set("name")} maxLength={100} required />
        </FormField>
        <FormField label="Esquema SQL" hint="Esquema en SQL Server; vacío usa el código">
          <input
            className="input uppercase"
            value={data.sqlSchema}
            onChange={set("sqlSchema")}
            maxLength={30}
            placeholder={data.code.toUpperCase()}
          />
        </FormField>
        <FormField label="País" hint="Código de 2 letras; p. ej. VE">
          <input className="input uppercase" value={data.country} onChange={set("country")} maxLength={2} />
        </FormField>
        <FormField label="Moneda" hint="Símbolo; p. ej. Bs.">
          <input className="input" value={data.currencySymbol} onChange={set("currencySymbol")} maxLength={5} required />
        </FormField>
        <FormField label="Color de marca">
          <ColorInput
            label="Color de marca"
            value={data.brandColor}
            onChange={(brandColor) => setData((d) => ({ ...d, brandColor }))}
          />
        </FormField>
        {error && <p role="alert" className="sm:col-span-2 text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
