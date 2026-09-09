import { NextResponse } from "next/server";
import { listarEventos } from "@/server/portal-repository";

/** Eventos de auditoria del portal (?compania=COFER opcional para filtrar). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const compania = searchParams.get("compania") ?? undefined;
  return NextResponse.json({ eventos: await listarEventos(compania) });
}
