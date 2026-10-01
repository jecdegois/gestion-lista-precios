import type { AuthContext } from "@/shared/types/domain-types";
import { cargarCompanias } from "@/server/companies";
import { esquemasExistentes } from "@/server/db";
import { authRepository } from "@/features/auth/repository/auth-repository";
import { companiesRepository as repo } from "../repository/companies-repository";
import type { CreateCompanyInput, UpdateCompanyInput } from "../schemas/company-schema";
import type { CompanyListItem } from "../types";

type RequestContext = { ip?: string; userAgent?: string };

export const settingsService = {
  async listCompanies() {
    const [rows, schemas] = await Promise.all([
      repo.list(),
      esquemasExistentes().catch((error) => {
        console.error("[configuracion] no se pudieron verificar los esquemas en SQL Server:", error);
        return null;
      }),
    ]);
    const companies: CompanyListItem[] = rows.map((c) => ({
      ...c,
      schemaStatus: schemas && {
        softland: schemas.softland.has(c.sqlSchema.toUpperCase()),
        portal: schemas.portal.has(c.sqlSchema.toUpperCase()),
      },
    }));
    return { ok: true as const, companies };
  },

  /** Alta de compañía; el código es único y queda registrado en auditoría. */
  async createCompany(session: AuthContext, input: CreateCompanyInput, ctx: RequestContext) {
    if (await repo.find(input.code)) return { ok: false as const, error: `Ya existe una compañía con el código ${input.code}` };

    const company = await repo.create(input);
    await cargarCompanias(true);
    await authRepository.audit.record({
      event: "company_created",
      actorId: session.userId,
      actorEmail: session.email,
      company: company.code,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      details: input,
    });
    return { ok: true as const, company, message: "Compañía creada" };
  },

  /** Actualiza nombre, esquema SQL, país, moneda y color; deja en auditoría el valor anterior y el nuevo. */
  async updateCompany(session: AuthContext, code: string, input: UpdateCompanyInput, ctx: RequestContext) {
    const before = await repo.find(code);
    if (!before) return { ok: false as const, error: "La compañía no existe" };

    const company = await repo.update(code, input);
    await cargarCompanias(true);
    await authRepository.audit.record({
      event: "company_settings_updated",
      actorId: session.userId,
      actorEmail: session.email,
      company: code,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      details: {
        before: {
          name: before.name,
          sqlSchema: before.sqlSchema,
          country: before.country,
          currencySymbol: before.currencySymbol,
          brandColor: before.brandColor,
        },
        after: input,
      },
    });
    return { ok: true as const, company, message: "Configuración guardada" };
  },
};
