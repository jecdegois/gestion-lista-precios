"use server";

import * as XLSX from "xlsx";
import {
  construirFilaCompleta,
  construirFilaDescuentoMasivo,
  construirFilaMargenMasivo,
  construirFilasGestionGlobal,
  construirFilasMayoreodMasivo,
} from "@/lib/engine";
import { estaEnAmbito } from "@/lib/catalog";
import { esFilaMargen } from "@/lib/domain-types";
import type {
  FilaResultado,
  ParametrosSolicitud,
  ProcesoKey,
  Rol,
  Solicitud,
  TipoVariacion,
} from "@/lib/domain-types";
import { nombreArchivoS3, nuevoIdProcesoSP } from "@/lib/ids";
import { esModoDemo } from "@/server/companies";
import {
  ejecutarSpGestionListas,
  ejecutarSpMargen,
  upsertUdf,
} from "@/server/pricing-repository";
import {
  actualizarSolicitud,
  agregarSolicitud,
  listarEventos,
  listarSolicitudes,
  obtenerSolicitud,
  registrarEvento,
  siguienteCodigoSolicitud,
} from "@/server/portal-repository";

const ENCABEZADO_CODIGO = "codigo articulo";
const ENCABEZADO_PORCENTAJE = "porcentaje reduccion";
const ENCABEZADO_LEGADO = "factor reduccion";

function normalizarEncabezado(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Consultas (lectura de estado del flujo)
// ---------------------------------------------------------------------------
export async function obtenerSolicitudes(): Promise<Solicitud[]> {
  return await listarSolicitudes();
}

export async function obtenerAuditoria(compania?: string) {
  return await listarEventos(compania);
}

// ---------------------------------------------------------------------------
// Parseo de Excel (previsualizacion; NO toca la BD)
// ---------------------------------------------------------------------------
export interface ResultadoParseo {
  ok: boolean;
  error?: string;
  filas: FilaResultado[];
  archivoNombre?: string;
  archivoS3Key?: string;
}

export async function parsearExcel(formData: FormData): Promise<ResultadoParseo> {
  const procesoKey = String(formData.get("proceso") ?? "") as ProcesoKey;
  const file = formData.get("archivo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Debe adjuntar un archivo .xlsx.", filas: [] };
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, error: "Formato no soportado. Use un archivo .xlsx.", filas: [] };
  }

  let rows: unknown[][];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];
  } catch {
    return { ok: false, error: "No fue posible leer el archivo Excel.", filas: [] };
  }

  const archivoS3Key = "erp-precios-uploads/" + nombreArchivoS3("carga", "xlsx");

  if (procesoKey === "MARGEN_UTILIDAD_MASIVO") {
    const enc = rows[0] ?? [];
    if (normalizarEncabezado(enc[1]) === ENCABEZADO_LEGADO) {
      return { ok: false, error: "Plantilla obsoleta: 'Factor Reduccion' ya no se admite. Use 'Porcentaje Reduccion' (10 = 10%).", filas: [] };
    }
    if (normalizarEncabezado(enc[0]) !== ENCABEZADO_CODIGO || normalizarEncabezado(enc[1]) !== ENCABEZADO_PORCENTAJE) {
      return { ok: false, error: "Encabezados invalidos: se requieren 'Codigo Articulo' y 'Porcentaje Reduccion'.", filas: [] };
    }
    const dataRows = rows.slice(1).filter((r) => Array.isArray(r) && r.length > 0);
    const filas = dataRows.map((r, idx) =>
      construirFilaMargenMasivo({
        fila: idx + 2,
        codigo: r[0] !== undefined ? String(r[0]).trim() : "",
        porcentajeReduccionRaw: r[1] !== undefined ? String(r[1]).trim() : "",
      }),
    );
    return { ok: true, filas, archivoNombre: file.name, archivoS3Key };
  }

  const esDescuento = procesoKey === "DESCUENTO_LISTA_PRECIO";
  const dataRows = rows.slice(1).filter((r) => Array.isArray(r) && r.length > 0);
  const filas = dataRows.map((r, idx) => {
    if (esDescuento) {
      return construirFilaDescuentoMasivo(
        {
          fila: idx + 1,
          listaCodigo: r[0] !== undefined ? String(r[0]).trim() : null,
          codigo: r[1] !== undefined ? String(r[1]).trim() : "",
          tipoVariacion: "AUMENTO",
          valorPropuestoRaw: r[2] !== undefined ? String(r[2]).trim() : "",
        },
        true,
      );
    }
    return construirFilaCompleta(
      {
        fila: idx + 1,
        codigo: r[0] !== undefined ? String(r[0]).trim() : "",
        tipoVariacion: "AUMENTO",
        valorPropuestoRaw: r[1] !== undefined ? String(r[1]).trim() : "",
      },
      "factor",
    );
  });
  return { ok: true, filas, archivoNombre: file.name, archivoS3Key };
}

// ---------------------------------------------------------------------------
// Simulacion manual (previsualizacion; NO toca la BD)
// ---------------------------------------------------------------------------
export interface SimularManualInput {
  proceso: ProcesoKey;
  nivel?: string;
  factor?: string;
  tipoVariacion?: TipoVariacion;
  grupoArticulos?: string;
  items?: { codigo: string; listaCodigo: string; tipoVariacion: TipoVariacion; variacionPorcentaje: string }[];
}

export async function simularManual(input: SimularManualInput): Promise<{ ok: boolean; filas: FilaResultado[] }> {
  const magnitud = input.factor ?? "";
  const tv = input.tipoVariacion ?? "AUMENTO";
  if (input.proceso === "MAYOREOD_MASIVO" && input.grupoArticulos) {
    return { ok: true, filas: construirFilasMayoreodMasivo(input.grupoArticulos, magnitud, tv, magnitud) };
  }
  if (input.proceso === "DESCUENTO_LISTA_PRECIO" && input.items) {
    const filas = input.items.map((it, idx) =>
      construirFilaDescuentoMasivo({
        fila: idx + 1,
        codigo: it.codigo,
        listaCodigo: it.listaCodigo,
        tipoVariacion: it.tipoVariacion,
        variacionPorcentaje: it.variacionPorcentaje,
      }),
    );
    return { ok: true, filas };
  }
  // FACTOR_PRECIO (Gestion Global)
  if (input.nivel) {
    return { ok: true, filas: construirFilasGestionGlobal(input.nivel, magnitud, tv, magnitud) };
  }
  return { ok: true, filas: [] };
}

// ---------------------------------------------------------------------------
// Envio de solicitud (queda PENDIENTE; NO toca la BD productiva)
// ---------------------------------------------------------------------------
export interface EnviarSolicitudInput {
  proceso: ProcesoKey;
  modalidad: "manual" | "excel";
  usuarioEmail: string;
  usuarioNombre: string;
  usuarioRol: Rol;
  compania: string;
  parametros: ParametrosSolicitud;
  filas: FilaResultado[];
  archivoNombre?: string | null;
  archivoS3Key?: string | null;
}

export async function enviarSolicitud(input: EnviarSolicitudInput): Promise<{ ok: boolean; error?: string; solicitud?: Solicitud }> {
  // Revalidacion defensiva de ambito (equivalente a la del backend real).
  if (!estaEnAmbito(input.compania, input.compania, null)) {
    return { ok: false, error: "Esta solicitud está fuera de su ámbito autorizado (compañía o lista). No puede enviarse." };
  }
  const codigo = await siguienteCodigoSolicitud();
  const solicitud: Solicitud = {
    id: codigo,
    proceso: input.proceso,
    modalidad: input.modalidad,
    compania: input.compania,
    solicitanteNombre: input.usuarioNombre,
    solicitanteEmail: input.usuarioEmail,
    parametros: input.parametros,
    filas: input.filas,
    archivoNombre: input.archivoNombre ?? null,
    archivoS3Key: input.archivoS3Key ?? null,
    fechaEnvio: new Date().toLocaleString("es-CR", { hour12: false }),
    estado: "PENDIENTE",
    motivoRechazo: null,
    idProcesoSP: null,
  };
  await agregarSolicitud(solicitud);
  await registrarEvento("SOLICITUD_ENVIADA", input.usuarioNombre, input.usuarioRol, input.compania, solicitud.id, null, input.usuarioEmail);
  return { ok: true, solicitud };
}

// ---------------------------------------------------------------------------
// Revision (registra que el aprobador revisó; NO toca la BD)
// ---------------------------------------------------------------------------
export async function registrarRevision(
  solicitudId: string,
  usuarioNombre: string,
  usuarioRol: Rol,
  compania: string,
): Promise<void> {
  const s = await obtenerSolicitud(solicitudId);
  if (s && s.estado === "PENDIENTE") {
    await registrarEvento("SIMULACION_REVISADA", usuarioNombre, usuarioRol, compania, solicitudId, null);
  }
}

// ---------------------------------------------------------------------------
// Rechazo (motivo obligatorio; NO toca la BD)
// ---------------------------------------------------------------------------
export async function rechazarSolicitud(
  solicitudId: string,
  motivo: string,
  usuarioNombre: string,
  usuarioRol: Rol,
): Promise<{ ok: boolean; error?: string }> {
  const s = await obtenerSolicitud(solicitudId);
  if (!s) return { ok: false, error: "Solicitud no encontrada." };
  if (!motivo || motivo.trim().length === 0) return { ok: false, error: "El motivo de rechazo es obligatorio." };
  await actualizarSolicitud(solicitudId, { estado: "RECHAZADO", motivoRechazo: motivo.trim() });
  await registrarEvento("SOLICITUD_RECHAZADA", usuarioNombre, usuarioRol, s.compania, solicitudId, null);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// APROBACION — REGLA DE ORO: aqui y solo aqui se ejecuta el SP/UDF real.
// ---------------------------------------------------------------------------
export interface AprobarInput {
  solicitudId: string;
  aprobadorNombre: string;
  aprobadorEmail: string;
  aprobadorRol: Rol;
}

export async function aprobarSolicitud(input: AprobarInput): Promise<{ ok: boolean; error?: string; idProcesoSP?: string }> {
  const s = await obtenerSolicitud(input.solicitudId);
  if (!s) return { ok: false, error: "Solicitud no encontrada." };
  if (s.estado !== "PENDIENTE") return { ok: false, error: "La solicitud no está pendiente de aprobación." };
  // Bloqueo estricto de autoaprobación (segregación de funciones).
  if (s.solicitanteEmail === input.aprobadorEmail) {
    return { ok: false, error: "No puede aprobar su propia solicitud (segregación de funciones)." };
  }
  if (input.aprobadorRol !== "APROBADOR") {
    return { ok: false, error: "Solo un Aprobador puede autorizar la ejecución." };
  }
  if (!estaEnAmbito(s.compania, s.compania, null)) {
    return { ok: false, error: "La solicitud está fuera de su ámbito autorizado." };
  }

  const idProcesoSP = nuevoIdProcesoSP();
  await actualizarSolicitud(input.solicitudId, {
    estado: "EN_PROCESO",
    idProcesoSP,
    autorizadoPor: input.aprobadorNombre,
    autorizadoPorEmail: input.aprobadorEmail,
    ultimaActualizacion: new Date().toLocaleString("es-CR", { hour12: false }),
  });
  await registrarEvento("EJECUCION_ENCOLADA", input.aprobadorNombre, input.aprobadorRol, s.compania, s.id, idProcesoSP);

  // REGLA DE ORO: EXECUTE del SP/UDF real SOLO al aprobar y solo fuera de DEMO_MODE.
  if (!esModoDemo()) {
    void ejecutarProcesamientoReal(s.id, s.compania, input.aprobadorNombre);
  } else {
    // En demo, el "worker" corre en el store con un retardo perceptible (paridad mock).
    void simularProcesamientoDemo(s.id);
  }

  return { ok: true, idProcesoSP };
}

/**
 * Procesamiento REAL: ejecuta el SP por cada artículo válido de la solicitud
 * sobre la base de la compañía activa. Solo se invoca desde aprobarSolicitud.
 */
async function ejecutarProcesamientoReal(solicitudId: string, compania: string, aprobador: string): Promise<void> {
  const s = await obtenerSolicitud(solicitudId);
  if (!s) return;
  const filas = [...s.filas];
  let fallidos = 0;
  const nivelPrecio = s.parametros.nivelPrecio ?? "MayoreoD";
  const esProcesoMargen = s.proceso === "MARGEN_UTILIDAD_MASIVO";

  if (esProcesoMargen) {
    // 1) Llenado de la UDF U_FACTOR_REDUCCION_MARGEN con el porcentaje cargado
    //    por artículo, usando el mapa de objetos SQL configurable de la compañía.
    // 2) Ejecución del SP de margen por artículo válido (persiste el mínimo).
    for (const f of filas) {
      if (!f.validacion.valido) {
        fallidos++;
        continue;
      }
      try {
        if (esFilaMargen(f) && f.porcentajeReduccion != null) {
          await upsertUdf(compania, f.codigo, f.descripcion, f.porcentajeReduccion, aprobador);
        }
        await ejecutarSpMargen(compania, nivelPrecio, 1, f.codigo, aprobador);
      } catch {
        fallidos++;
        f.validacion.valido = false;
      }
    }
  } else {
    // Procesos de precio: se dispara una sola vez el SP de gestión de listas
    // con redondeo para la lista/versión de la solicitud.
    fallidos = filas.filter((f) => !f.validacion.valido).length;
    try {
      await ejecutarSpGestionListas(compania, nivelPrecio, 1, aprobador);
    } catch {
      // Si el SP falla, se marca la corrida como fallida completa.
      fallidos = filas.length;
      filas.forEach((f) => {
        f.validacion.valido = false;
      });
    }
  }

  await finalizarProcesamiento(solicitudId, filas, fallidos, aprobador);
}

/** Worker DEMO: retardo perceptible y cómputo de resultado sin tocar BD. */
async function simularProcesamientoDemo(solicitudId: string): Promise<void> {
  const s = await obtenerSolicitud(solicitudId);
  if (!s) return;
  await new Promise((r) => setTimeout(r, 6000));
  const filas = [...s.filas];
  const fallidos = filas.filter((f) => !f.validacion.valido).length;
  await finalizarProcesamiento(solicitudId, filas, fallidos, s.autorizadoPor ?? "Aprobador");
}

async function finalizarProcesamiento(solicitudId: string, filas: FilaResultado[], fallidos: number, aprobador: string): Promise<void> {
  const s = await obtenerSolicitud(solicitudId);
  if (!s) return;
  const total = filas.length;
  const exitosos = total - fallidos;
  const estadoFinal =
    fallidos === 0 ? "PROCESADO" : fallidos === total ? "ERROR_EJECUCION" : "PROCESADO_CON_ERRORES";
  await actualizarSolicitud(solicitudId, {
    estado: estadoFinal,
    resultado: {
      totalLote: total,
      exitosos,
      fallidos,
      filas,
      estadoFinal,
      logS3Key: "erp-precios-logs/" + nombreArchivoS3("log-auditoria-" + solicitudId, "csv"),
      aprobadoPor: aprobador,
      aprobadoPorEmail: s.autorizadoPorEmail ?? "",
    },
    ultimaActualizacion: new Date().toLocaleString("es-CR", { hour12: false }),
  });
  await registrarEvento("EJECUCION_FINALIZADA", aprobador, "APROBADOR", s.compania, solicitudId, s.idProcesoSP);
}
