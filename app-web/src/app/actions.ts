"use server";

import * as XLSX from "xlsx";
import {
  construirFilaCompleta,
  construirFilaDescuentoMasivo,
  construirFilaMargenMasivo,
  construirFilasGestionGlobal,
  construirFilasMayoreodMasivo,
  construirFilaDesdeVariacion,
  type CatalogoContext,
} from "@/lib/engine";
import { estaEnAmbito } from "@/lib/catalog";
import type {
  FilaResultado,
  ArticuloCatalogo,
  CriteriosArticulo,
  Identidad,
  ParametrosSolicitud,
  ProcesoKey,
  Rol,
  Solicitud,
  TipoVariacion,
} from "@/lib/domain-types";
import type { NivelPrecio } from "@/lib/types";
import { nombreArchivoS3, nuevoIdProcesoSP } from "@/lib/ids";
import { esEjecucionSoftlandBloqueada, esModoDemo, esModoSoloLectura, esModoSoloPortal, objetoPortal } from "@/server/companies";
import { listarCatalogo, listarCatalogoPaginado, listarNivelesPrecio } from "@/server/pricing-repository";
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
  const companiaNormalizada = (compania ?? "").trim().toUpperCase();
  if (!normalizado || !companiaNormalizada) return undefined;

  const pool = await getPortalPool();
  const mssql = await import("mssql");
  const q = await pool
    .request()
    .input("email", mssql.VarChar(120), normalizado)
    .input("compania", mssql.VarChar(20), companiaNormalizada)
    .query(
      `SELECT TOP (1)
              U.IDP_SUBJECT,
              U.EMAIL,
              U.NOMBRE,
              U.ROL_GLOBAL
         FROM ${objetoPortal("USUARIO")} U
         INNER JOIN ${objetoPortal("USUARIO_AMBITO")} UA
                 ON UA.ID_USUARIO = U.ID_USUARIO
        WHERE LOWER(U.EMAIL) = @email
          AND U.ACTIVO = 'S'
          AND UA.COMPANIA = @compania
          AND U.ROL_GLOBAL IN ('OPERADOR', 'APROBADOR')
        ORDER BY U.ROL_GLOBAL`,
    );
  const r = q.recordset[0] as Record<string, unknown> | undefined;
  if (!r) return undefined;
  const rol = String(r.ROL_GLOBAL ?? "");
  if (rol !== "OPERADOR" && rol !== "APROBADOR") return undefined;
  return {
    email: String(r.EMAIL),
    nombre: String(r.NOMBRE),
    rol: rol as Identidad["rol"],
    color: String(r.COLOR ?? "#52525b"),
    compania: companiaNormalizada,
    idpSubject: r.IDP_SUBJECT == null ? null : String(r.IDP_SUBJECT).trim() || null,
  };
}

function errorSoloLectura(): { ok: false; error: string } {
  return { ok: false, error: "El sistema está en modo solo lectura. No se permiten cambios ni ejecuciones." };
}

function errorSoloPortal(): { ok: false; error: string } {
  return { ok: false, error: "La aplicación está en modo de simulación segura: no se ejecutan procedimientos ni cambios sobre Softland." };
}

function normalizarEncabezado(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizarMargenUtilidadMinimo(porcentaje: number | null | undefined): number | undefined {
  if (porcentaje == null || !Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje >= 100) return undefined;
  return porcentaje / 100;
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
    margenUtilidadMin: normalizarMargenUtilidadMinimo(articulo.margenUtilidadMinPorcentaje),
    categoria: articulo.clasificacion1 ?? "",
    categoriaDescripcion: articulo.clasificacion1Descripcion ?? "",
    subcategoria: articulo.clasificacion2 ?? "",
    subcategoriaDescripcion: articulo.clasificacion2Descripcion ?? "",
    grupo,
    marca: articulo.clasificacion3 ?? "",
    marcaDescripcion: articulo.clasificacion3Descripcion ?? "",
    marcaGrupoCompra: articulo.clasificacion4 ?? "",
    marcaGrupoCompraDescripcion: articulo.clasificacion4Descripcion ?? "",
    bdf: articulo.clasificacion5 ?? "",
    bdfDescripcion: articulo.clasificacion5Descripcion ?? "",
  };
}

function crearContextoCatalogo(
  niveles: NivelPrecio[],
  articulosMaestros: Awaited<ReturnType<typeof listarCatalogo>>,
  listaBaseCodigo?: string,
): CatalogoContext {
  const articulos = articulosMaestros.map(convertirArticuloMaestro);
  const grupos: CatalogoContext["grupos"] = {};
  for (const articulo of articulos) {
    const clave = articulo.grupo || "Sin grupo";
    if (!grupos[clave]) grupos[clave] = { label: clave, articulos: [] };
    grupos[clave].articulos.push(articulo.codigo);
  }
  const nombresLista = Object.fromEntries(niveles.map((nivel) => [nivel.codigo, nivel.nombre]));
  const base = (listaBaseCodigo
    ? niveles.find((nivel) => nivel.codigo.toUpperCase() === listaBaseCodigo.toUpperCase())
    : undefined)
    ?? niveles.find((nivel) => nivel.codigo.toUpperCase() === "MAYOREOD")
    ?? niveles[0]
    ?? { codigo: "", nombre: "" };
  return {
    articulos: Object.fromEntries(articulos.map((articulo) => [articulo.codigo, articulo])),
    nombresLista,
    grupos,
    listaBase: { codigo: base.codigo, nombre: base.nombre, nivelPrecio: base.codigo },
  };
}

async function cargarContextosPorLista(
  compania: string,
  niveles: NivelPrecio[],
  listas: string[],
): Promise<Map<string, CatalogoContext>> {
  const contextos = await Promise.all(
    listas.map(async (lista) => [
      lista,
      crearContextoCatalogo(niveles, await listarCatalogo(compania, lista), lista),
    ] as const),
  );
  return new Map(contextos);
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

export async function obtenerCatalogoSolicitud(
  compania: string,
  nivelPrecio?: string,
  incluirArticulos = true,
): Promise<CatalogoSolicitud> {
  const niveles = await listarNivelesPrecio(compania);
  const nivelSeleccionado = resolverNivelPrecio(niveles, nivelPrecio) ?? null;
  const maestros = incluirArticulos && nivelSeleccionado ? await listarCatalogo(compania, nivelSeleccionado) : [];
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
  const resultado = await listarSolicitudes(compania);
  return Array.isArray(resultado) ? resultado : [];
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
  const contextosPorLista = await cargarContextosPorLista(compania, niveles, nivelesConsulta);
  const contextoVacio = crearContextoCatalogo(niveles, []);
  const filas = dataRows.map((r, idx) => {
    if (esDescuento) {
      const listaCodigo = resolverNivelPrecio(niveles, String(r[0] ?? "").trim());
      // Convertir porcentaje a factor (10 -> 0.1 para factor de 1.1)
      const porcentajeRaw = r[2] !== undefined ? String(r[2]).trim() : "";
      const porcentaje = Number.parseFloat(porcentajeRaw.replace(",", "."));
      const formatoValido = porcentajeRaw !== "" && !Number.isNaN(porcentaje) && /^\d+(\.\d+)?$/.test(porcentajeRaw);
      const factorConvertido = formatoValido ? 1 + (porcentaje / 100) : null;
      const factorTexto = factorConvertido !== null ? String(factorConvertido) : porcentajeRaw;
      
      return construirFilaDescuentoMasivo(
        {
          fila: idx + 1,
          listaCodigo: r[0] !== undefined ? String(r[0]).trim() : null,
          codigo: r[1] !== undefined ? String(r[1]).trim() : "",
          tipoVariacion: "AUMENTO",
          valorPropuestoRaw: factorTexto,
        },
        true, // factorDirecto = true, ahora valorPropuestoRaw contiene el factor convertido
        listaCodigo ? contextosPorLista.get(listaCodigo) ?? contextoVacio : contextoVacio,
      );
    }
    const listaCodigo = nivelesConsulta[0];
    return construirFilaCompleta(
      {
        fila: idx + 1,
        codigo: r[0] !== undefined ? String(r[0]).trim() : "",
        tipoVariacion: "AUMENTO",
        valorPropuestoRaw: r[1] !== undefined ? String(r[1]).trim() : "",
      },
      "factor",
      listaCodigo ? contextosPorLista.get(listaCodigo) ?? contextoVacio : contextoVacio,
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
  criteriosArticulo?: CriteriosArticulo;
  codigosArticulos?: string[];
  items?: { codigo: string; listaCodigo: string; tipoVariacion: TipoVariacion; variacionPorcentaje: string }[];
}

export async function simularManual(input: SimularManualInput): Promise<{ ok: boolean; filas: FilaResultado[] }> {
  const magnitud = input.factor ?? "";
  const tv = input.tipoVariacion ?? "AUMENTO";
  const niveles = await listarNivelesPrecio(input.compania);
  const nivelesSolicitados = input.items
    ? input.items.map((item) => item.listaCodigo)
    : input.proceso === "MAYOREOD_MASIVO"
      ? [input.nivelBase ?? input.nivel ?? niveles[0]?.codigo]
      : [input.nivel ?? input.nivelBase ?? niveles[0]?.codigo];
  const nivelesSolicitadosNoVacios = nivelesSolicitados
    .filter((nivel): nivel is string => Boolean(nivel?.trim()))
    .map((nivel) => nivel.trim().toLowerCase());
  const nivelesConsulta = nivelesSolicitadosCanonicos(niveles, nivelesSolicitados);
  if (nivelesConsulta.length === 0 || nivelesConsulta.length !== new Set(nivelesSolicitadosNoVacios).size) {
    return { ok: false, filas: [] };
  }
  const contextosPorLista = await cargarContextosPorLista(input.compania, niveles, nivelesConsulta);
  const contextoVacio = crearContextoCatalogo(niveles, []);
  const nivelAplicable = resolverNivelPrecio(niveles, input.nivel);
  const nivelBaseAplicable = resolverNivelPrecio(niveles, input.nivelBase ?? input.nivel);

  if (input.proceso === "MAYOREOD_MASIVO" && input.codigosArticulos) {
    if (input.codigosArticulos.length === 0) return { ok: false, filas: [] };
    const contexto = nivelBaseAplicable ? contextosPorLista.get(nivelBaseAplicable) ?? contextoVacio : contextoVacio;
    const grupoCriterios = Object.values(input.criteriosArticulo ?? {}).filter(Boolean).join(" / ") || "Criterios seleccionados";
    const filas = input.codigosArticulos.map((codigo, idx) => {
      const fila = construirFilaDesdeVariacion(
        { fila: idx + 1, codigo, tipoVariacion: tv, variacionPorcentaje: magnitud },
        "factor",
        contexto,
      );
      return {
        ...fila,
        lista: `${contexto.listaBase.nombre} / ${contexto.listaBase.nivelPrecio}`,
        listaCodigo: contexto.listaBase.codigo || nivelBaseAplicable || "",
        grupoArticulo: grupoCriterios,
      };
    });
    return { ok: true, filas };
  }
  if (input.proceso === "MAYOREOD_MASIVO" && input.grupoArticulos) {
    const contexto = nivelBaseAplicable ? contextosPorLista.get(nivelBaseAplicable) ?? contextoVacio : contextoVacio;
    return { ok: true, filas: construirFilasMayoreodMasivo(input.grupoArticulos, tv, magnitud, contexto) };
  }
  if (input.proceso === "DESCUENTO_LISTA_PRECIO" && input.items) {
    const filas = input.items.map((it, idx) => {
      const listaCodigo = resolverNivelPrecio(niveles, it.listaCodigo);
      const contexto = listaCodigo ? contextosPorLista.get(listaCodigo) ?? contextoVacio : contextoVacio;
      return construirFilaDescuentoMasivo({
        fila: idx + 1,
        codigo: it.codigo,
        listaCodigo: it.listaCodigo,
        tipoVariacion: it.tipoVariacion,
        variacionPorcentaje: it.variacionPorcentaje,
      }, false, contexto);
    });
    return { ok: true, filas };
  }
  if (nivelAplicable) {
    const contexto = contextosPorLista.get(nivelAplicable) ?? contextoVacio;
    return { ok: true, filas: construirFilasGestionGlobal(nivelAplicable, tv, magnitud, contexto) };
  }
  return { ok: true, filas: [] };
}

export interface SimularGestionGlobalPaginadoInput {
  compania: string;
  nivel: string;
  factor?: string;
  tipoVariacion?: TipoVariacion;
  offset?: number;
  maxRecords?: number;
}

export interface PaginaSimulacionGestionGlobal {
  ok: boolean;
  filas: import("@/lib/domain-types").FilaPrecio[];
  offset: number;
  maxRecords: number;
  hasMore: boolean;
  nextOffset: number | null;
  error?: string;
}

export async function simularGestionGlobalPaginado(input: SimularGestionGlobalPaginadoInput): Promise<PaginaSimulacionGestionGlobal> {
  const niveles = await listarNivelesPrecio(input.compania);
  const nivel = resolverNivelPrecio(niveles, input.nivel);
  if (!nivel) {
    return { ok: false, filas: [], offset: 0, maxRecords: 200, hasMore: false, nextOffset: null, error: "La lista de precio no existe en los maestros de Softland." };
  }
  const offset = Number.isInteger(input.offset) && (input.offset ?? 0) >= 0 ? input.offset as number : 0;
  const maxRecords = Number.isInteger(input.maxRecords) ? Math.min(Math.max(input.maxRecords as number, 1), 200) : 200;
  const pagina = await listarCatalogoPaginado(input.compania, nivel, "", offset, maxRecords);
  const contexto = crearContextoCatalogo(niveles, pagina.items, nivel);
  const filas = construirFilasGestionGlobal(
    nivel,
    input.tipoVariacion ?? "AUMENTO",
    input.factor ?? "",
    contexto,
  );
  return {
    ok: true,
    filas,
    offset: pagina.offset,
    maxRecords: pagina.maxRecords,
    hasMore: pagina.hasMore,
    nextOffset: pagina.nextOffset,
  };
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
  const identidadPortal = await resolverIdentidad(input.usuarioEmail, input.compania);
  const idpOperador = identidadPortal?.idpSubject?.trim() || identidadPortal?.email.trim().toLowerCase();
  if (!identidadPortal || !idpOperador) {
    return {
      ok: false,
      error: "No se puede registrar la solicitud: no se encontró una identidad activa ni un correo válido para completar IDP_OPERADOR.",
    };
  }
  // Revalidación defensiva con la identidad resuelta desde el Portal.
  if (!estaEnAmbito(identidadPortal.compania, input.compania)) {
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

  const contextosPorLista = await cargarContextosPorLista(input.compania, niveles, nivelesCanonicos);
  const listaPredeterminada = resolverNivelPrecio(
    niveles,
    input.parametros.nivelPrecio ?? input.parametros.listaBase ?? input.parametros.nivel,
  );
  const contieneArticulo = (listaCodigo: string, codigoArticulo: string): boolean => {
    const contexto = contextosPorLista.get(listaCodigo);
    const codigoNormalizado = codigoArticulo.trim().toUpperCase();
    return Object.values(contexto?.articulos ?? {}).some(
      (articulo) => articulo.codigo.trim().toUpperCase() === codigoNormalizado,
    );
  };
  const hayArticuloFueraDeLista = input.filas.some((fila) => {
    const listaFila = "listaCodigo" in fila && fila.listaCodigo
      ? resolverNivelPrecio(niveles, fila.listaCodigo)
      : listaPredeterminada;
    return !listaFila || !contieneArticulo(listaFila, fila.codigo);
  });
  if (input.filas.length === 0 || hayArticuloFueraDeLista) {
    return { ok: false, error: "La solicitud contiene un artículo que no existe en la lista de precio seleccionada en Softland." };
  }

  // Enriquecer filas con la lista/nivel correspondiente
  const filasConLista: FilaResultado[] = input.filas.map((fila) => {
    const listaFila = "listaCodigo" in fila && fila.listaCodigo
      ? resolverNivelPrecio(niveles, fila.listaCodigo)
      : listaPredeterminada;
    
    return {
      ...fila,
      lista: listaFila,
    };
  });

  const codigo = await siguienteCodigoSolicitud();
  const solicitud: Solicitud = {
    id: codigo,
    proceso: input.proceso,
    modalidad: input.modalidad,
    compania: input.compania,
    solicitanteNombre: identidadPortal.nombre,
    solicitanteEmail: identidadPortal.email,
    idpOperador,
    parametros: input.parametros,
    filas: filasConLista,
    archivoNombre: input.archivoNombre ?? null,
    archivoS3Key: input.archivoS3Key ?? null,
    fechaEnvio: new Date().toLocaleString("es-CR", { hour12: false }),
    estado: "PENDIENTE",
    motivoRechazo: null,
    idProcesoSP: null,
    lista: listaPredeterminada || ""
  };
  try {
    await agregarSolicitud(solicitud);
    await registrarEvento(
      "SOLICITUD_ENVIADA",
      identidadPortal.nombre,
      identidadPortal.rol,
      input.compania,
      solicitud.id,
      null,
      identidadPortal.email,
    );
  } catch (error) {
    const detalle = error instanceof Error ? error.message.replace(/\s+/g, " ").trim() : "Error de base de datos no identificado.";
    if (detalle.includes("CK_PP_SOL_TIPO")) {
      return {
        ok: false,
        error: `TIPO_PROCESO rechazado por CK_PP_SOL_TIPO: ${detalle}`,
      };
    }
    return {
      ok: false,
      error: `No fue posible registrar la solicitud en el Portal: ${detalle}`,
    };
  }
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
// APROBACION — conserva la decisión maker-checker, pero este aplicativo no
// ejecuta SP ni mutaciones sobre Softland. Solo se permiten consultas SELECT.
// ---------------------------------------------------------------------------
export interface AprobarInput {
  solicitudId: string;
  aprobadorNombre: string;
  aprobadorEmail: string;
  aprobadorRol: Rol;
}

export async function aprobarSolicitud(input: AprobarInput): Promise<{ ok: boolean; error?: string; idProcesoSP?: string }> {
  if (esModoSoloLectura()) return errorSoloLectura();
  // La aprobación registra la decisión en el flujo aplicativo. La ejecución
  // operativa permanece bloqueada: Softland se consulta exclusivamente con SELECT.
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

  // Este flujo no ejecuta SP/UDF ni instrucciones de modificación en Softland.
  // Solo utiliza datos que ya fueron consultados mediante SELECT para generar
  // un resultado simulado, visible y trazable en la aplicación.
  void simularProcesamientoDemo(s.id);

  return { ok: true, idProcesoSP };
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
