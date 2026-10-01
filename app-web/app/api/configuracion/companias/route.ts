import { apiBadRequest, apiServiceResult, parseJsonBody, withAdmin } from "@/shared/api";
import { requestContext } from "@/features/auth/api/request-context";
import { CreateCompanySchema } from "@/features/settings/schemas/company-schema";
import { settingsService } from "@/features/settings/services/settings-service";

/** Compañías activas con su país, moneda y color de marca. */
export const GET = withAdmin(async () => apiServiceResult(await settingsService.listCompanies()));

/** Alta de una compañía. */
export const POST = withAdmin(async (req, session) => {
  const parsed = CreateCompanySchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) return apiBadRequest(parsed.error.issues[0]?.message ?? "Datos inválidos");

  return apiServiceResult(await settingsService.createCompany(session, parsed.data, requestContext(req)));
});
