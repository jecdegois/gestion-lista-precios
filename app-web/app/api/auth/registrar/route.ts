import { apiBadRequest, apiServiceResult, parseJsonBody, withApiRoute } from "@/shared/api";
import { requestContext } from "@/features/auth/api/request-context";
import { SignUpSchema } from "@/features/auth/schemas/auth-schema";
import { authService } from "@/features/auth/services/auth-service";

const INVALID_INPUT = "Datos inválidos";

/** Registro de solicitud de acceso (cuenta pendiente de aprobacion). */
export const POST = withApiRoute(async (req: Request) => {
  const body = await parseJsonBody(req);
  const parsed = SignUpSchema.safeParse(body);
  if (!parsed.success) return apiBadRequest(INVALID_INPUT);

  return apiServiceResult(await authService.signUp(parsed.data, requestContext(req)));
});
