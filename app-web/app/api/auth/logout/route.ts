import { NextRequest, NextResponse } from "next/server";
import { apiOk, withApiRoute } from "@/shared/api";
import { authService } from "@/features/auth/services/auth-service";
import { SESSION_COOKIE_NAME } from "@/features/auth/session-cookie";

/** Cierre de sesion: revoca la sesion activa y elimina la cookie. */
export const POST = withApiRoute(async (req: NextRequest) => {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  let message: string | undefined;

  if (token) {
    const context = await authService.resolveContext(token);
    if (context) {
      const result = await authService.signOut(context.sessionId, context.user.id);
      message = result.message;
    }
  }

  const response: NextResponse = apiOk({}, message);
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
});
