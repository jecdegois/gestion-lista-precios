/** Contexto de la peticion (ip y user-agent) para auditoria del service. */
export function requestContext(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  const userAgent = req.headers.get("user-agent") ?? undefined;
  return { ip, userAgent };
}
