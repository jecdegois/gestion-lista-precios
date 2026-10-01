import { NextResponse } from "next/server";
import { cargarCompanias, listarCompanias, esModoDemo } from "@/server/companies";

/** Lista de companias disponibles para el selector multiempresa. */
export async function GET() {
  await cargarCompanias();
  return NextResponse.json({ companias: listarCompanias(), demo: esModoDemo() });
}
