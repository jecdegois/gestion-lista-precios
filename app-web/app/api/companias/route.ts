import { NextResponse } from "next/server";
import { cargarCompanias, listarCompanias, esModoDemo } from "@/server/companies";

// Lee de Postgres: no debe prerenderizarse en el build.
export const dynamic = "force-dynamic";

/** Lista de companias disponibles para el selector multiempresa. */
export async function GET() {
  await cargarCompanias();
  return NextResponse.json({ companias: listarCompanias(), demo: esModoDemo() });
}
