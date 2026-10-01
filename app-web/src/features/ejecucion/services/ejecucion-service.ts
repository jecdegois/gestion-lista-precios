import type { Identidad, EjecucionKey, EstadoEjecucion } from "@/shared/types/domain-types";
import { resolverCompania } from "@/server/companies";
import { ejecucionRepository, type EjecucionSpPreciosInput } from "../repository/ejecucion-repository";

export async function crearEjecucion(identidad: Identidad, input: {
  tipo: EjecucionKey;
  parametros: Record<string, unknown>;
  spNombre: string;
  observaciones?: string | null;
}) {
  return { ok: true as const, ejecucion: await ejecucionRepository.crear(identidad.compania!, identidad.email, identidad.nombre, input) };
}

export async function actualizarEjecucion(identidad: Identidad, id: string, input: {
  estado: EstadoEjecucion;
  totalArticulos?: number | null;
  exitosos?: number | null;
  fallidos?: number | null;
  observaciones?: string | null;
  codigoError?: string | null;
  mensajeError?: string | null;
}) {
  return { ok: true as const, ejecucion: await ejecucionRepository.actualizar(identidad.compania!, id, input) };
}

export async function listarEjecuciones(identidad: Identidad, tipo: EjecucionKey) {
  return { ok: true as const, ejecuciones: await ejecucionRepository.listar(identidad.compania!, tipo) };
}

/**
 * Orquesta la ejecucion completa de SP_GESTION_LISTAS_PRECIOS_FULL:
 *   1. Crea el registro en EJECUCION_LOG con estado EN_PROCESO.
 *   2. Invoca el SP contra Softland.
 *   3. Actualiza el log con COMPLETADO + filas afectadas, o con ERROR + mensaje.
 *
 * Garantia: si ocurre cualquier error despues de crear el log, el registro
 * se cierra con estado ERROR antes de retornar. Nunca lanza al caller.
 */
export async function ejecutarSpPrecios(identidad: Identidad, input: EjecucionSpPreciosInput) {
  const compania = identidad.compania!;
  const schema   = resolverCompania(compania).schema;

  // Helpers para construir el EXEC
  const q  = (v: string) => `'${v.replace(/'/g, "''")}'`;
  const qn = (v: string | null | undefined) => (v ? q(v) : "NULL");
  const bit = (v: boolean) => (v ? "1" : "0");
  const execStr = (
    `EXEC [${schema}].[SP_GESTION_LISTAS_PRECIOS_FULL]` +
    ` ${q(input.nivelPrecio)},` +
    ` ${qn(input.moneda)},` +
    ` ${q(input.fechaInicio)},` +
    ` ${q(input.fechaFin)},` +
    ` ${q(input.nivelPrecioBase)},` +
    ` ${qn(input.monedaBase)},` +
    ` ${input.factorMultiplicador.toFixed(8)},` +
    ` ${input.version},` +
    ` ${q(input.usuarioSolicitante ?? "")},` +
    ` ${bit(input.validarPrecioBajoCosto)},` +
    ` ${bit(input.exigirFactorConfigurado)},` +
    ` ${input.excepcionesArticulos == null ? "NULL" : `'${input.excepcionesArticulos.replace(/'/g, "''")}'`},` +
    ` ${bit(input.validarPrecioBajoMargenMin)};`
  ).slice(0, 500);

  // 1 — Crear registro inicial EN_PROCESO
  const logInicio = await ejecucionRepository.crear(compania, identidad.email, identidad.nombre, {
    tipo: "EJECUCION_PRECIOS",
    parametros: { ...input },
    spNombre: "SP_GESTION_LISTAS_PRECIOS_FULL",
    observaciones: execStr,
  });

  // Helper para cerrar el log con ERROR — se llama en cualquier rama de fallo
  async function cerrarConError(err: unknown) {
    const esError = err instanceof Error;
    const codigo  = esError && "number" in err
      ? String((err as { number: number }).number)
      : "SP_ERROR";
    const mensaje = esError ? err.message : String(err);
    try {
      const logError = await ejecucionRepository.actualizar(compania, logInicio.id, {
        estado: "ERROR",
        totalArticulos: null,
        exitosos: null,
        fallidos: null,
        observaciones: "El SP retorno un error. Ver MENSAJE_ERROR para detalle.",
        codigoError: codigo.slice(0, 40),
        mensajeError: mensaje.slice(0, 1000),
      });
      return { ok: false as const, ejecucion: logError, error: mensaje };
    } catch {
      // Si tampoco se pudo actualizar el log, al menos retornamos el log de inicio
      return { ok: false as const, ejecucion: logInicio, error: mensaje };
    }
  }

  // 2 — Ejecutar SP contra Softland
  try {
    const resultado = await ejecucionRepository.ejecutarSpPrecios(compania, input);

    // 3a — SP OK: actualizar log con COMPLETADO
    const logFin = await ejecucionRepository.actualizar(compania, logInicio.id, {
      estado: "COMPLETADO",
      totalArticulos: resultado.filasAfectadas,
      exitosos: resultado.filasAfectadas,
      fallidos: 0,
      observaciones: resultado.observaciones,
      codigoError: null,
      mensajeError: null,
    });

    return { ok: true as const, ejecucion: logFin };

  } catch (err: unknown) {
    return cerrarConError(err);
  }
}
