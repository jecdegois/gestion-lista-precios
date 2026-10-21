import { apiBadRequest, apiServiceResult, apiUnauthorized, withAdmin, withApiRoute } from "@/shared/api";
import { requestContext } from "@/features/auth/api/request-context";
import { companiesRepository } from "@/features/settings/repository/companies-repository";
import { settingsService } from "@/features/settings/services/settings-service";
import { getServerSession } from "@/server/session";

type Ctx = { params: Promise<{ code: string }> };

/** Imagen del logo (cualquier sesión válida: se muestra en el header). La URL lleva `?v=` y se cachea. */
export const GET = (req: Request, { params }: Ctx) =>
  withApiRoute(async () => {
    if (!(await getServerSession())) return apiUnauthorized("Sesión no válida");
    const logo = await companiesRepository.getLogo((await params).code);
    if (!logo) return new Response(null, { status: 404 });

    return new Response(new Uint8Array(logo.bytes), {
      headers: {
        "Content-Type": logo.mimeType,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  })(req);

/** Carga o reemplaza el logo (multipart, campo `file`). */
export const POST = withAdmin<Ctx>(async (req, session, { params }) => {
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return apiBadRequest("Seleccione una imagen");

  return apiServiceResult(await settingsService.setCompanyLogo(session, (await params).code, file, requestContext(req)));
});

/** Quita el logo; el header vuelve a mostrar las iniciales. */
export const DELETE = withAdmin<Ctx>(async (req, session, { params }) =>
  apiServiceResult(await settingsService.setCompanyLogo(session, (await params).code, null, requestContext(req))),
);
