import { NextResponse } from "next/server";
import { listarCompanias, esModoDemo } from "@/server/companies";

/** Lista de companias disponibles para el selector multiempresa. */
export async function GET() {
  return NextResponse.json({ companias: listarCompanias(), demo: esModoDemo() });
}
