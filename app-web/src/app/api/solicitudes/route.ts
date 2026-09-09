import { NextResponse } from "next/server";
import { listarSolicitudes } from "@/server/portal-repository";

/**
 * Lista de solicitudes del flujo maker-checker (esquema [PORTAL_PRECIOS] o
 * memoria en demo). Sirve para el polling del estado sin bloquear la UI.
 */
export async function GET() {
  return NextResponse.json({ solicitudes: await listarSolicitudes() });
}
