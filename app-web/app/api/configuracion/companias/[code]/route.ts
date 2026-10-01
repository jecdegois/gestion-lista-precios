import { apiBadRequest, apiServiceResult, parseJsonBody, withAdmin } from "@/shared/api";
import { requestContext } from "@/features/auth/api/request-context";
import { UpdateCompanySchema } from "@/features/settings/schemas/company-schema";
import { settingsService } from "@/features/settings/services/settings-service";
import { getIdentidad } from "@/server/session";

/** Edita nombre, esquema SQL, país, moneda y color de marca de una compañía (el código no cambia). */
export const PATCH = withAdmin<{ params: { code: string } }>(async (req, session, { params }) => {
  const parsed = UpdateCompanySchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) return apiBadRequest(parsed.error.issues[0]?.message ?? "Datos inválidos");

  return apiServiceResult(await settingsService.updateCompany(session, params.code, parsed.data, requestContext(req)));
});

/** Elimina (desactiva) la compañía; no se permite sobre la que el administrador tiene activa. */
export const DELETE = withAdmin<{ params: { code: string } }>(async (req, session, { params }) =>
  apiServiceResult(
    await settingsService.deleteCompany(session, params.code, getIdentidad(session).compania, requestContext(req)),
  ),
);
