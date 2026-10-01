import { apiRequest } from "@/shared/api/api-request";
import type { CreateCompanyInput, UpdateCompanyInput } from "../schemas/company-schema";
import type { CompanyListItem, CompanySettings } from "../types";

export function getCompanies() {
  return apiRequest<{ companies: CompanyListItem[] }>("/api/configuracion/companias");
}

export function createCompany(input: CreateCompanyInput) {
  return apiRequest<{ company: CompanySettings }>("/api/configuracion/companias", { method: "POST", body: input });
}

export function updateCompany(code: string, input: UpdateCompanyInput) {
  return apiRequest<{ company: CompanySettings }>(`/api/configuracion/companias/${encodeURIComponent(code)}`, {
    method: "PATCH",
    body: input,
  });
}
