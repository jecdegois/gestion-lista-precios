import { randomUUID } from "node:crypto";
import { prisma } from "@/server/prisma";
import { fileStorage } from "@/server/storage";
import type { CompanySettings } from "../types";
import type { CreateCompanyInput, UpdateCompanyInput } from "../schemas/company-schema";
import { companyLogoUrl } from "../utils/company-logo";

const select = {
  code: true,
  name: true,
  sqlSchema: true,
  country: true,
  currencySymbol: true,
  brandColor: true,
  logoUpdatedAt: true,
} as const;

type Row = Omit<CompanySettings, "logoUrl"> & { logoUpdatedAt: Date | null };

function toSettings({ logoUpdatedAt, ...row }: Row): CompanySettings {
  return { ...row, logoUrl: companyLogoUrl(row.code, logoUpdatedAt) };
}

export const companiesRepository = {
  async list(): Promise<CompanySettings[]> {
    const rows = await prisma.company.findMany({ where: { isActive: true }, select, orderBy: { code: "asc" } });
    return rows.map(toSettings);
  },

  /** Solo compañías activas. */
  async find(code: string): Promise<CompanySettings | null> {
    const row = await prisma.company.findUnique({ where: { code, isActive: true }, select });
    return row && toSettings(row);
  },

  /** Estado de la fila aunque esté desactivada (el código sigue ocupado). */
  findStatus(code: string) {
    return prisma.company.findUnique({ where: { code }, select: { isActive: true } });
  },

  /** Alta; si el código pertenece a una compañía desactivada, la reactiva con los datos nuevos. */
  async create(input: CreateCompanyInput, reactivate = false): Promise<CompanySettings> {
    const row = reactivate
      ? await prisma.company.update({ where: { code: input.code }, data: { ...input, isActive: true }, select })
      : await prisma.company.create({ data: input, select });
    return toSettings(row);
  },

  /** Baja lógica: la compañía deja de listarse y se revocan las asignaciones de usuarios. Devuelve cuántas. */
  async deactivate(code: string): Promise<number> {
    return prisma.$transaction(async (tx) => {
      await tx.company.update({ where: { code }, data: { isActive: false } });
      const { count } = await tx.userCompany.updateMany({
        where: { company: code, isActive: true, revokedAt: null },
        data: { isActive: false, revokedAt: new Date() },
      });
      return count;
    });
  },

  async update(code: string, input: UpdateCompanyInput): Promise<CompanySettings> {
    return toSettings(await prisma.company.update({ where: { code }, data: input, select }));
  },

  /**
   * Guarda el archivo del logo y su clave en la compañía; `null` lo quita. Cada carga usa una clave nueva
   * y el archivo anterior se borra después de actualizar la fila (si algo falla, la fila nunca apunta a un archivo borrado).
   */
  async setLogo(code: string, logo: { bytes: Uint8Array; mimeType: string } | null): Promise<CompanySettings> {
    const previous = await prisma.company.findUnique({ where: { code }, select: { logoKey: true } });

    let data = { logoKey: null as string | null, logoMimeType: null as string | null, logoUpdatedAt: null as Date | null };
    if (logo) {
      const logoKey = `company-logos/${randomUUID()}.${logo.mimeType.split("/")[1]}`;
      await fileStorage.put(logoKey, logo.bytes);
      data = { logoKey, logoMimeType: logo.mimeType, logoUpdatedAt: new Date() };
    }

    const company = toSettings(await prisma.company.update({ where: { code }, data, select }));
    if (previous?.logoKey) await fileStorage.delete(previous.logoKey);
    return company;
  },

  /** Bytes y tipo del logo, o `null` si la compañía no tiene (o falta el archivo). */
  async getLogo(code: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
    const row = await prisma.company.findUnique({ where: { code }, select: { logoKey: true, logoMimeType: true } });
    if (!row?.logoKey || !row.logoMimeType) return null;
    const bytes = await fileStorage.get(row.logoKey);
    return bytes && { bytes, mimeType: row.logoMimeType };
  },
};
