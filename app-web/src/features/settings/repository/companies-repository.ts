import { prisma } from "@/server/prisma";
import type { CompanySettings } from "../types";
import type { CreateCompanyInput, UpdateCompanyInput } from "../schemas/company-schema";

const select = { code: true, name: true, sqlSchema: true, country: true, currencySymbol: true, brandColor: true } as const;

export const companiesRepository = {
  list(): Promise<CompanySettings[]> {
    return prisma.company.findMany({ where: { isActive: true }, select, orderBy: { code: "asc" } });
  },

  find(code: string): Promise<CompanySettings | null> {
    return prisma.company.findUnique({ where: { code }, select });
  },

  create(input: CreateCompanyInput): Promise<CompanySettings> {
    return prisma.company.create({ data: input, select });
  },

  update(code: string, input: UpdateCompanyInput): Promise<CompanySettings> {
    return prisma.company.update({ where: { code }, data: input, select });
  },
};
