"use server";

import * as XLSX from "xlsx";
import {
  construirFilaCompleta,
  construirFilaDescuentoMasivo,
  construirFilaMargenMasivo,
  construirFilasGestionGlobal,
  construirFilasMayoreodMasivo,
  type CatalogoContext,
} from "@/lib/engine";
import { estaEnAmbito } from "@/lib/catalog";
import { esFilaMargen } from "@/lib/domain-types";
import type {
  FilaResultado,
  ArticuloCatalogo,
  Identidad,
  ParametrosSolicitud,
  ProcesoKey,
  Rol,
  Solicitud,
  TipoVariacion,
} from "@/lib/domain-types";
import type { NivelPrecio } from "@/lib/types";
import { nombreArchivoS3, nuevoIdProcesoSP } from "@/lib/ids";
import { esModoDemo, esModoSoloLectura, objetoPortal } from "@/server/companies";
import { listarCatalogo, listarNivelesPrecio } from "@/server/pricing-repository";
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
import { getPortalPool } from "@/server/db";

const ENCABEZADO_CODIGO = "codigo articulo";
const ENCABEZADO_PORCENTAJE = "porcentaje reduccion";
const ENCABEZADO_LEGADO = "factor reduccion";

/**
 * Resuelve una identidad activa desde el Portal usando únicamente SELECT.
 * No actualiza fecha de acceso ni crea sesiones: el SSO real aún debe
 * integrarse antes de habilitar operaciones de escritura.
 */
export async function resolverIdentidad(email: string, compania?: string): Promise<Identidad | undefined> {
  const normalizado = email.trim().toLowerCase();
  if (!normalizado) return undefined;
  const pool = await getPortalPool();
  const mssql = await import("mssql");
  const q = await pool
    .request()
    .input("email", mssql.VarChar(120), normalizado)
    .query(
      `SELECT TOP (1)
              U.IDP_SUBJECT,
              U.EMAIL,
              U.NOMBRE,
              U.ROL_GLOBAL
         FROM ${objetoPortal("USUARIO")} U
        WHERE LOWER(U.EMAIL) = @email
          AND U.ROL_GLOBAL IN ('OPERADOR', 'APROBADOR')
        ORDER BY U.ROL_GLOBAL`,
    );
  const r = q.recordset[0] as Record<string, unknown> | undefined;
  if (!r) return undefined;
  const rol = String(r.ROL_GLOBAL ?? "");
  const companiaNormalizada = (compania ?? "").trim().toUpperCase();
  if (!companiaNormalizada) return undefined;
  if (rol !== "OPERADOR" && rol !== "APROBADOR") return undefined;
  return {
    email: String(r.EMAIL),
    nombre: String(r.NOMBRE),
    rol: rol as Identidad["rol"],
    color: String(r.COLOR ?? "#52525b"),
    compania: companiaNormalizada,
  };
}

function errorSoloLectura(): { ok: false; error: string } {
  return { ok: false, error: "El sistema está en modo solo lectura. No se permiten cambios ni ejecuciones." };
}

function normalizarEncabezado(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function convertirArticuloMaestro(articulo: Awaited<ReturnType<typeof listarCatalogo>>[number]): ArticuloCatalogo {
  const clasificaciones = [
    articulo.clasificacion1,
    articulo.clasificacion2,
    articulo.clasificacion3,
    articulo.clasificacion4,
    articulo.clasificacion5,
  ]
    .map((clasificacion) => clasificacion?.trim())
    .filter((clasificacion): clasificacion is string => Boolean(clasificacion));
  const grupo = clasificaciones.length > 0 ? clasificaciones.join(" › ") : "Sin clasificación";

  return {
    codigo: articulo.codigo,
    descripcion: articulo.descripcion,
    precioActual: articulo.precioLista,
    costoReposicion: articulo.costoPromedio,
    margenUtilidadMin: undefined,
    categoria: articulo.clasificacion1 ?? "",
    subcategoria: articulo.clasificacion2 ?? "",
    grupo,
    marca: articulo.clasificacion3 ?? "",
    marcaGrupoCompra: articulo.clasificacion4 ?? "",
    bdf: articulo.clasificacion5 ?? "",
  };
}

function crearContextoCatalogo(niveles: NivelPrecio[], articulosMaestros: Awaited<ReturnType<typeof listarCatalogo>>): CatalogoContext {
  const articulos = articulosMaestros.map(convertirArticuloMaestro);
  const grupos: CatalogoContext["grupos"] = {};
  for (const articulo of articulos) {
    const clave = articulo.grupo || "Sin grupo";
    if (!grupos[clave]) grupos[clave] = { label: clave, articulos: [] };
    grupos[clave].articulos.push(articulo.codigo);
  }
  const nombresLista = Object.fromEntries(niveles.map((nivel) => [nivel.codigo, nivel.nombre]));
  const base = niveles.find((nivel) => nivel.codigo.toUpperCase() === "MAYOREOD") ?? niveles[0] ?? { codigo: "", nombre: "", };
  return {
    articulos: Object.fromEntries(articulos.map((articulo) => [articulo.codigo, articulo])),
    nombresLista,
    grupos,
    listaBase: { codigo: base.codigo, nombre: base.nombre, nivelPrecio: base.codigo },
  };
}

function resolverNivelPrecio(niveles: NivelPrecio[], valor: string | null | undefined): string | undefined {
  const buscado = String(valor ?? "").trim().toLowerCase();
  if (!buscado) return undefined;
  return niveles.find((nivel) => nivel.codigo.trim().toLowerCase() === buscado)?.codigo;
}

function nivelesSolicitadosCanonicos(niveles: NivelPrecio[], valores: (string | null | undefined)[]): string[] {
  return Array.from(
    new Set(
      valores
        .map((valor) => resolverNivelPrecio(niveles, valor))
        .filter((valor): valor is string => Boolean(valor)),
    ),
  );
}

export interface CatalogoSolicitud {
  niveles: NivelPrecio[];
  nivelSeleccionado: string | null;
  articulos: ArticuloCatalogo[];
  grupos: { codigo: string; nombre: string; cantidad: number }[];
}

export async function obtenerCatalogoSolicitud(compania: string, nivelPrecio?: string): Promise<CatalogoSolicitud> {
  const niveles = await listarNivelesPrecio(compania);
  const nivelSeleccionado = resolverNivelPrecio(niveles, nivelPrecio) ?? null;
  const maestros = nivelSeleccionado ? await listarCatalogo(compania, nivelSeleccionado) : [];
  const contexto = crearContextoCatalogo(niveles, maestros);
  return {
    niveles,
    nivelSeleccionado,
    articulos: Object.values(contexto.articulos),
    grupos: Object.entries(contexto.grupos).map(([codigo, grupo]) => ({ codigo, nombre: grupo.label, cantidad: grupo.articulos.length })),
  };
}

// ---------------------------------------------------------------------------
// Consultas (lectura de estado del flujo)
// ---------------------------------------------------------------------------
export async function obtenerSolicitudes(compania?: string): Promise<Solicitud[]> {
  return await listarSolicitudes(compania);
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
  const compania = String(formData.get("compania") ?? "").trim();
  const nivelPrecio = String(formData.get("nivelPrecio") ?? "").trim();
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
    const niveles = await listarNivelesPrecio(compania);
    const nivelConsulta = resolverNivelPrecio(niveles, nivelPrecio)
      ?? resolverNivelPrecio(niveles, "MAYOREOD")
      ?? niveles[0]?.codigo;
    const maestros = nivelConsulta ? await listarCatalogo(compania, nivelConsulta) : [];
    const contexto = crearContextoCatalogo(niveles, maestros);
    const dataRows = rows.slice(1).filter((r) => Array.isArray(r) && r.length > 0);
    const filas = dataRows.map((r, idx) =>
      construirFilaMargenMasivo({
        fila: idx + 2,
        codigo: r[0] !== undefined ? String(r[0]).trim() : "",
        porcentajeReduccionRaw: r[1] !== undefined ? String(r[1]).trim() : "",
      }, contexto),
    );
    return { ok: true, filas, archivoNombre: file.name, archivoS3Key };
  }

  const esDescuento = procesoKey === "DESCUENTO_LISTA_PRECIO";
  const dataRows = rows.slice(1).filter((r) => Array.isArray(r) && r.length > 0);
  const niveles = await listarNivelesPrecio(compania);
  const nivelesConsultaRaw = esDescuento
    ? dataRows.map((r) => String(r[0] ?? "").trim())
    : [nivelPrecio || niveles[0]?.codigo];
  const nivelesConsulta = nivelesSolicitadosCanonicos(niveles, nivelesConsultaRaw);
  const contexto = crearContextoCatalogo(
    niveles,
    (await Promise.all(nivelesConsulta.map((nivel) => listarCatalogo(compania, nivel)))).flat(),
  );
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
        contexto,
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
      contexto,
    );
  });
  return { ok: true, filas, archivoNombre: file.name, archivoS3Key };
}

// ---------------------------------------------------------------------------
// Simulacion manual (previsualizacion; NO toca la BD)
// ---------------------------------------------------------------------------
export interface SimularManualInput {
  proceso: ProcesoKey;
  compania: string;
  nivel?: string;
  nivelBase?: string;
  factor?: string;
  tipoVariacion?: TipoVariacion;
  grupoArticulos?: string;
  items?: { codigo: string; listaCodigo: string; tipoVariacion: TipoVariacion; variacionPorcentaje: string }[];
}

export async function simularManual(input: SimularManualInput): Promise<{ ok: boolean; filas: FilaResultado[] }> {
  const magnitud = input.factor ?? "";
  const tv = input.tipoVariacion ?? "AUMENTO";
  const niveles = await listarNivelesPrecio(input.compania);
  const nivelesSolicitados = input.items?.map((item) => item.listaCodigo) ?? [input.nivelBase ?? input.nivel ?? niveles[0]?.codigo];
  const nivelesSolicitadosNoVacios = nivelesSolicitados
    .filter((nivel): nivel is string => Boolean(nivel?.trim()))
    .map((nivel) => nivel.trim().toLowerCase());
  const nivelesConsulta = nivelesSolicitadosCanonicos(niveles, nivelesSolicitados);
  if (nivelesConsulta.length === 0 || nivelesConsulta.length !== new Set(nivelesSolicitadosNoVacios).size) {
    return { ok: false, filas: [] };
  }
  const articulosMaestros = (await Promise.all(
    nivelesConsulta.map((nivel) => listarCatalogo(input.compania, nivel)),
  )).flat();
  const contexto = crearContextoCatalogo(niveles, articulosMaestros);
  const nivelAplicable = resolverNivelPrecio(niveles, input.nivel);

  if (input.proceso === "MAYOREOD_MASIVO" && input.grupoArticulos) {
    return { ok: true, filas: construirFilasMayoreodMasivo(input.grupoArticulos, tv, magnitud, contexto) };
  }
  if (input.proceso === "DESCUENTO_LISTA_PRECIO" && input.items) {
    const filas = input.items.map((it, idx) =>
      construirFilaDescuentoMasivo({
        fila: idx + 1,
        codigo: it.codigo,
        listaCodigo: it.listaCodigo,
        tipoVariacion: it.tipoVariacion,
        variacionPorcentaje: it.variacionPorcentaje,
      }, false, contexto),
    );
    return { ok: true, filas };
  }
  if (nivelAplicable) {
    return { ok: true, filas: construirFilasGestionGlobal(nivelAplicable, tv, magnitud, contexto) };
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
  if (esModoSoloLectura()) return errorSoloLectura();
  // Revalidacion defensiva de ambito (equivalente a la del backend real).
  if (!estaEnAmbito(input.compania, input.compania)) {
    return { ok: false, error: "Esta solicitud está fuera de su ámbito autorizado por compañía. No puede enviarse." };
  }

  const niveles = await listarNivelesPrecio(input.compania);
  const listasEnFilas = input.filas.flatMap((fila) =>
    "listaCodigo" in fila && fila.listaCodigo ? [fila.listaCodigo] : [],
  );
  const valoresNivel = [
    input.parametros.nivelPrecio,
    input.parametros.listaBase,
    input.parametros.nivel,
    ...listasEnFilas,
  ];
  const valoresNivelNoVacios = valoresNivel.filter((valor): valor is string => Boolean(valor?.trim()));
  const nivelesCanonicos = nivelesSolicitadosCanonicos(niveles, valoresNivelNoVacios);
  if (
    nivelesCanonicos.length === 0 ||
    nivelesCanonicos.length !== new Set(valoresNivelNoVacios.map((valor) => valor.trim().toLowerCase())).size
  ) {
    return { ok: false, error: "La solicitud contiene una lista que no existe en los maestros de Softland." };
  }

  const maestros = (await Promise.all(
    nivelesCanonicos.map((nivel) => listarCatalogo(input.compania, nivel)),
  )).flat();
  const codigosMaestros = new Set(maestros.map((articulo) => articulo.codigo.trim().toUpperCase()));
  if (input.filas.length === 0 || input.filas.some((fila) => !codigosMaestros.has(fila.codigo.trim().toUpperCase()))) {
    return { ok: false, error: "La solicitud contiene un artículo que no existe en los maestros de Softland." };
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
): Promise<{ ok: boolean; error?: string }> {
  if (esModoSoloLectura()) return errorSoloLectura();
  const s = await obtenerSolicitud(solicitudId);
  if (s && s.estado === "PENDIENTE") {
    await registrarEvento("SIMULACION_REVISADA", usuarioNombre, usuarioRol, compania, solicitudId, null);
  }
  return { ok: true };
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
  if (esModoSoloLectura()) return errorSoloLectura();
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
  if (esModoSoloLectura()) return errorSoloLectura();
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
  if (!estaEnAmbito(s.compania, s.compania)) {
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
  const filaConLista = filas.find((fila) => "listaCodigo" in fila && Boolean(fila.listaCodigo));
  const nivelDesdeFila = filaConLista && "listaCodigo" in filaConLista ? filaConLista.listaCodigo : undefined;
  const nivelPrecio = s.parametros.nivelPrecio
    ?? s.parametros.nivel
    ?? nivelDesdeFila
    ?? "MAYOREOD";
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
  if (esModoSoloLectura()) return;
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
