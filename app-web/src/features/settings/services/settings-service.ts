import type { AuthContext } from "@/shared/types/domain-types";
import { cargarCompanias } from "@/server/companies";
import { esquemasExistentes } from "@/server/db";
import { authRepository } from "@/features/auth/repository/auth-repository";
import { companiesRepository as repo } from "../repository/companies-repository";
import type { CreateCompanyInput, UpdateCompanyInput } from "../schemas/company-schema";
import type { CompanyListItem } from "../types";
import { detectLogoMimeType, LOGO_MAX_BYTES } from "../utils/company-logo";

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
    const existing = await repo.findStatus(input.code);
    if (existing?.isActive) return { ok: false as const, error: `Ya existe una compañía con el código ${input.code}` };

    const company = await repo.create(input, !!existing);
    await cargarCompanias(true);
    await authRepository.audit.record({
      event: "company_created",
      actorId: session.userId,
      actorEmail: session.email,
      company: company.code,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      details: existing ? { ...input, reactivated: true } : input,
    });
    return { ok: true as const, company, message: existing ? "Compañía reactivada" : "Compañía creada" };
  },

  /**
   * Elimina (desactiva) una compañía: deja de verse en el portal y sus usuarios pierden el acceso a ella.
   * El historial se conserva; crearla de nuevo con el mismo código la reactiva.
   */
  async deleteCompany(session: AuthContext, code: string, activeCompany: string | null, ctx: RequestContext) {
    if (!(await repo.find(code))) return { ok: false as const, error: "La compañía no existe" };
    if (code === activeCompany) return { ok: false as const, error: "No puede eliminar la compañía que está usando; cambie de compañía primero" };

    const revokedAssignments = await repo.deactivate(code);
    await cargarCompanias(true);
    await authRepository.audit.record({
      event: "company_deleted",
      actorId: session.userId,
      actorEmail: session.email,
      company: code,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      details: { revokedAssignments },
    });
    return { ok: true as const, message: "Compañía eliminada" };
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

  /** Carga (o quita, con `file` null) el logo; valida tamaño y tipo real por la firma del archivo. */
  async setCompanyLogo(session: AuthContext, code: string, file: File | null, ctx: RequestContext) {
    if (!(await repo.find(code))) return { ok: false as const, error: "La compañía no existe" };

    let logo: { bytes: Uint8Array; mimeType: string } | null = null;
    if (file) {
      if (file.size > LOGO_MAX_BYTES) return { ok: false as const, error: `El logo no puede superar ${LOGO_MAX_BYTES / 1024} KB` };
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mimeType = detectLogoMimeType(bytes);
      if (!mimeType) return { ok: false as const, error: "El logo debe ser una imagen PNG, JPEG o WebP" };
      logo = { bytes, mimeType };
    }

    const company = await repo.setLogo(code, logo);
    await authRepository.audit.record({
      event: logo ? "company_logo_updated" : "company_logo_removed",
      actorId: session.userId,
      actorEmail: session.email,
      company: code,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      details: logo ? { mimeType: logo.mimeType, bytes: logo.bytes.length } : undefined,
    });
    return { ok: true as const, company, message: logo ? "Logo actualizado" : "Logo eliminado" };
  },
};
