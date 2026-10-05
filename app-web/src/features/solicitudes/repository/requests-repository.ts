import "server-only";
import type { EstadoSolicitud, FilaMargen, FilaPrecio, FilaResultado, Solicitud, ValidacionPrecio } from "@/shared/types/domain-types";
import { assertEscrituraPortalHabilitada, esModoDemo, objetoPortal } from "@/server/companies";
import { plano, portalDb } from "@/server/db";
import { fmtFechaBd } from "@/shared/utils/format";
import {
  agregarSolicitud as demoAgregar,
  actualizarSolicitud as demoActualizar,
  listarSolicitudes as demoListarSolicitudes,
  obtenerSolicitud as demoObtener,
  siguienteSeq as demoSeq,
} from "./demo-store";

/**
 * Repositorio del PORTAL (estado maker-checker): solicitudes y su detalle.
 * Escribe SIEMPRE en la base PORTAL_PRECIOS, esquema de la empresa (no toca Softland). La
 * auditoría vive en `features/auditoria/repository/audit-repository.ts`.
 *
 * En DEMO_MODE usa el store en memoria (demo-store); en modo real persiste
 * con $queryRawUnsafe calificando explícitamente el esquema de la empresa,
 * porque Prisma SQL Server ignora el parámetro `schema=` de la URL para queries ORM.
 */

async function listarSolicitudes(compania: string): Promise<Solicitud[]> {
  const companiaNormalizada = compania.trim().toUpperCase();
  if (esModoDemo()) {
    return demoListarSolicitudes().filter((solicitud) => !companiaNormalizada || solicitud.compania === companiaNormalizada);
  }

  const tabSol = objetoPortal(companiaNormalizada, "SOLICITUD");
  const tabDet = objetoPortal(companiaNormalizada, "SOLICITUD_DETALLE");
  const rows = await portalDb(companiaNormalizada).$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT S.*, D.*
       FROM ${tabSol} S
       LEFT JOIN ${tabDet} D ON D.ID_SOLICITUD = S.ID_SOLICITUD
      WHERE S.COMPANIA = @P1
      ORDER BY S.FECHA_CREACION DESC`,
    companiaNormalizada,
  );
  // Agrupar filas por solicitud
  const map = new Map<string, { cab: Record<string, unknown>; det: Record<string, unknown>[] }>();
  for (const row of rows) {
    const id = String(row.CODIGO_SOLICITUD ?? row.ID_SOLICITUD);
    if (!map.has(id)) map.set(id, { cab: row, det: [] });
    if (row.ID_DETALLE != null) map.get(id)!.det.push(row);
  }
  return [...map.values()].map(({ cab, det }) => mapSolicitud(cab, det));
}

export interface PaginaSolicitudes {
  solicitudes: Solicitud[];
  total: number;
  hasMore: boolean;
  nextOffset: number | null;
}

/**
 * Cabeceras de solicitudes paginadas, SIN detalle de filas.
 * Las filas de detalle se obtienen con `obtenerSolicitud` al abrir el modal.
 * @param email  Si se indica, filtra por SOLICITANTE_EMAIL (mis solicitudes).
 *               Si es null/undefined, trae todas las de la compañía (bandeja).
 */
async function listarSolicitudesPaginado(
  compania: string,
  offset: number,
  limit: number,
  email?: string | null,
  proceso?: string | null,
): Promise<PaginaSolicitudes> {
  const companiaNormalizada = compania.trim().toUpperCase();
  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.min(Math.max(limit, 1), 100);

  if (esModoDemo()) {
    const todas = demoListarSolicitudes().filter(
      (s) =>
        (!companiaNormalizada || s.compania === companiaNormalizada) &&
        (!email || s.solicitanteEmail === email) &&
        (!proceso || s.proceso === proceso),
    );
    const pagina = todas.slice(safeOffset, safeOffset + safeLimit);
    const hasMore = safeOffset + pagina.length < todas.length;
    return {
      solicitudes: pagina,
      total: todas.length,
      hasMore,
      nextOffset: hasMore ? safeOffset + pagina.length : null,
    };
  }

  const db = portalDb(companiaNormalizada);
  const tabSol = objetoPortal(companiaNormalizada, "SOLICITUD");

  // WHERE base
  const params: unknown[] = [companiaNormalizada];
  let where = `COMPANIA = @P1`;
  if (email?.trim()) {
    params.push(email.trim());
    where += ` AND SOLICITANTE_EMAIL = @P${params.length}`;
  }
  if (proceso?.trim()) {
    params.push(proceso.trim());
    where += ` AND PROCESO = @P${params.length}`;
  }

  const [countRows, rows] = await Promise.all([
    db.$queryRawUnsafe<{ n: number | bigint }[]>(
      `SELECT COUNT(*) AS n FROM ${tabSol} WHERE ${where}`,
      ...params,
    ),
    db.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM ${tabSol} WHERE ${where}
       ORDER BY FECHA_CREACION DESC
       OFFSET @P${params.length + 1} ROWS FETCH NEXT @P${params.length + 2} ROWS ONLY`,
      ...params,
      safeOffset,
      safeLimit,
    ),
  ]);

  const total = Number(countRows[0].n);
  const solicitudes = rows.map((r) => mapSolicitudCabecera(plano(r)));
  const hasMore = safeOffset + solicitudes.length < total;
  return {
    solicitudes,
    total,
    hasMore,
    nextOffset: hasMore ? safeOffset + solicitudes.length : null,
  };
}

async function obtenerSolicitud(compania: string, codigo: string): Promise<Solicitud | undefined> {
  if (esModoDemo()) return demoObtener(codigo);
  const tabSol = objetoPortal(compania, "SOLICITUD");
  const tabDet = objetoPortal(compania, "SOLICITUD_DETALLE");
  const rows = await portalDb(compania).$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT S.*, D.ID_DETALLE, D.SKU, D.DESCRIPCION, D.PRECIO_ACTUAL, D.COSTO,
            D.FACTOR_APLICADO, D.PRECIO_SIMULADO, D.PORCENTAJE_MARGEN,
            D.ESTADO_FILA, D.MENSAJE_ERROR, D.FACTOR_SOLICITADO, D.LISTA_PRECIO, D.CAUSA
       FROM ${tabSol} S
       LEFT JOIN ${tabDet} D ON D.ID_SOLICITUD = S.ID_SOLICITUD
      WHERE S.CODIGO_SOLICITUD = @P1
      ORDER BY D.ID_DETALLE ASC`,
    codigo,
  );
  if (!rows.length) return undefined;
  const cab = rows[0];
  const det = rows.filter((r) => r.ID_DETALLE != null);
  return mapSolicitud(cab, det);
}

async function siguienteCodigoSolicitud(compania: string): Promise<string> {
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) return "SOL-" + (10450 + demoSeq());
  // Prisma no modela secuencias; el SQL crudo no toma el schema de la URL, por eso se califica.
  const seq = objetoPortal(compania, "SEQ_SOLICITUD");
  const [q] = await portalDb(compania).$queryRawUnsafe<{ n: number | bigint }[]>(`SELECT NEXT VALUE FOR ${seq} AS n`);
  return "SOL-" + String(q.n);
}

async function agregarSolicitud(s: Solicitud): Promise<void> {
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) {
    demoAgregar(s);
    return;
  }
  const lista = String(s.parametros.nivelPrecio ?? s.parametros.listaBase ?? s.parametros.nivel ?? "").trim();
  // Prisma SQL Server no respeta el parámetro `schema=` de la URL para queries ORM
  // (solo lo usa en $queryRaw). Se usa $executeRawUnsafe con esquema calificado explícitamente,
  // igual que siguienteCodigoSolicitud y actualizarFactorAplicadoDetalles.
  const tabSol = objetoPortal(s.compania, "SOLICITUD");
  const tabDet = objetoPortal(s.compania, "SOLICITUD_DETALLE");
  const db = portalDb(s.compania);
  const parametrosJson = JSON.stringify({ ...s.parametros, filas: s.filas });

  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO ${tabSol}
         (CODIGO_SOLICITUD, COMPANIA, PROCESO, TIPO_PROCESO, MODALIDAD,
          LISTA_PRECIO, SOLICITANTE_EMAIL, SOLICITANTE_NOMBRE, ESTADO,
          PARAMETROS_JSON, ARCHIVO_NOMBRE, ARCHIVO_S3_KEY)
       VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, @P8, @P9, @P10, @P11, @P12)`,
      s.id,
      s.compania,
      s.proceso,
      s.proceso,
      s.modalidad,
      lista || null,
      s.solicitanteEmail,
      s.solicitanteNombre,
      s.estado ?? "PENDIENTE",
      parametrosJson,
      s.archivoNombre ?? null,
      s.archivoS3Key ?? null,
    );

    if (s.filas.length > 0) {
      // Obtener el ID recién insertado para relacionar el detalle
      const [{ id }] = await tx.$queryRawUnsafe<{ id: number }[]>(
        `SELECT TOP 1 ID_SOLICITUD AS id FROM ${tabSol} WHERE CODIGO_SOLICITUD = @P1`,
        s.id,
      );
      for (const f of s.filas) {
        const d = detalleData(f, s.proceso);
        await tx.$executeRawUnsafe(
          `INSERT INTO ${tabDet}
             (ID_SOLICITUD, SKU, DESCRIPCION, PRECIO_ACTUAL, COSTO,
              FACTOR_APLICADO, PRECIO_SIMULADO, PORCENTAJE_MARGEN,
              ESTADO_FILA, MENSAJE_ERROR, FACTOR_SOLICITADO, LISTA_PRECIO, CAUSA)
           VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, @P8, @P9, @P10, @P11, @P12, @P13)`,
          id,
          d.SKU,
          d.DESCRIPCION ?? null,
          d.PRECIO_ACTUAL,
          d.COSTO,
          d.FACTOR_APLICADO,
          d.PRECIO_SIMULADO,
          d.PORCENTAJE_MARGEN ?? null,
          d.ESTADO_FILA,
          d.MENSAJE_ERROR ?? null,
          d.FACTOR_SOLICITADO ?? null,
          d.LISTA_PRECIO ?? null,
          d.CAUSA ?? null,
        );
      }
    }
  });
}

/**
 * Reemplaza cabecera y detalle de un borrador propio (para guardarlo de nuevo o
 * enviarlo). Devuelve false si ya no está en BORRADOR o no es del solicitante;
 * el UPDATE condicionado bloquea la fila, así dos envíos simultáneos no pasan ambos.
 */
async function reemplazarBorrador(s: Solicitud): Promise<boolean> {
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) {
    const actual = demoObtener(s.id);
    if (actual?.estado !== "BORRADOR" || actual.solicitanteEmail !== s.solicitanteEmail) return false;
    demoActualizar(s.id, s);
    return true;
  }
  const lista = String(s.parametros.nivelPrecio ?? s.parametros.listaBase ?? s.parametros.nivel ?? "").trim();
  const db = portalDb(s.compania);
  const tabSol = objetoPortal(s.compania, "SOLICITUD");
  const tabDet = objetoPortal(s.compania, "SOLICITUD_DETALLE");

  return db.$transaction(async (tx) => {
    // Bloquear y verificar que existe y sigue en BORRADOR del mismo solicitante
    const rows = await tx.$queryRawUnsafe<{ id: number }[]>(
      `SELECT TOP 1 ID_SOLICITUD AS id FROM ${tabSol}
       WHERE CODIGO_SOLICITUD = @P1 AND ESTADO = 'BORRADOR' AND SOLICITANTE_EMAIL = @P2`,
      s.id,
      s.solicitanteEmail,
    );
    if (!rows.length) return false;
    const idSolicitud = rows[0].id;

    const parametrosJson = JSON.stringify({ ...s.parametros, filas: s.filas });
    await tx.$executeRawUnsafe(
      `UPDATE ${tabSol}
          SET ESTADO = @P1, MODALIDAD = @P2, LISTA_PRECIO = @P3,
              PARAMETROS_JSON = @P4, ARCHIVO_NOMBRE = @P5, ARCHIVO_S3_KEY = @P6,
              FECHA_ULT_ESTADO = GETDATE()
        WHERE ID_SOLICITUD = @P7`,
      s.estado,
      s.modalidad,
      lista || null,
      parametrosJson,
      s.archivoNombre ?? null,
      s.archivoS3Key ?? null,
      idSolicitud,
    );

    await tx.$executeRawUnsafe(
      `DELETE FROM ${tabDet} WHERE ID_SOLICITUD = @P1`,
      idSolicitud,
    );

    for (const f of s.filas) {
      const d = detalleData(f, s.proceso);
      await tx.$executeRawUnsafe(
        `INSERT INTO ${tabDet}
           (ID_SOLICITUD, SKU, DESCRIPCION, PRECIO_ACTUAL, COSTO,
            FACTOR_APLICADO, PRECIO_SIMULADO, PORCENTAJE_MARGEN,
            ESTADO_FILA, MENSAJE_ERROR, FACTOR_SOLICITADO, LISTA_PRECIO, CAUSA)
         VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, @P8, @P9, @P10, @P11, @P12, @P13)`,
        idSolicitud,
        d.SKU,
        d.DESCRIPCION ?? null,
        d.PRECIO_ACTUAL,
        d.COSTO,
        d.FACTOR_APLICADO,
        d.PRECIO_SIMULADO,
        d.PORCENTAJE_MARGEN ?? null,
        d.ESTADO_FILA,
        d.MENSAJE_ERROR ?? null,
        d.FACTOR_SOLICITADO ?? null,
        d.LISTA_PRECIO ?? null,
        d.CAUSA ?? null,
      );
    }
    return true;
  });
}

/**
 * Con `desde`, solo actualiza si el estado actual está en esa lista (UPDATE
 * condicionado, atómico): devuelve false si otra petición ya cambió el estado.
 */
async function actualizarSolicitud(
  compania: string,
  codigo: string,
  patch: Partial<Solicitud>,
  desde?: EstadoSolicitud[],
): Promise<boolean> {
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) {
    const actual = demoObtener(codigo);
    if (!actual || (desde && !desde.includes(actual.estado))) return false;
    demoActualizar(codigo, patch);
    return true;
  }
  const db = portalDb(compania);
  const tabSol = objetoPortal(compania, "SOLICITUD");

  // Construir SET dinámico con parámetros posicionales
  const setClauses: string[] = ["FECHA_ULT_ESTADO = GETDATE()"];
  const params: unknown[] = [];

  function addParam(clause: string, value: unknown) {
    params.push(value);
    setClauses.push(`${clause} = @P${params.length}`);
  }

  if (patch.estado !== undefined) addParam("ESTADO", patch.estado);
  if (patch.motivoRechazo !== undefined) addParam("MOTIVO_RECHAZO", patch.motivoRechazo);
  if (patch.idProcesoSP !== undefined) addParam("ID_PROCESO_SP", patch.idProcesoSP);
  if (patch.autorizadoPor !== undefined) addParam("APROBADOR_NOMBRE", patch.autorizadoPor);
  if (patch.autorizadoPorEmail !== undefined) addParam("APROBADOR_EMAIL", patch.autorizadoPorEmail);
  if (patch.resultado) {
    addParam("TOTAL_REGISTROS", patch.resultado.totalLote);
    addParam("EXITOSOS", patch.resultado.exitosos);
    addParam("FALLIDOS", patch.resultado.fallidos);
    addParam("LOG_S3_KEY", patch.resultado.logS3Key);
  }

  // WHERE con codigo y estados opcionales
  params.push(codigo);
  const pCodigo = params.length;
  let where = `CODIGO_SOLICITUD = @P${pCodigo}`;
  if (desde?.length) {
    const placeholders = desde.map((_, i) => {
      params.push(desde[i]);
      return `@P${params.length}`;
    });
    where += ` AND ESTADO IN (${placeholders.join(", ")})`;
  }

  const sql = `UPDATE ${tabSol} SET ${setClauses.join(", ")} WHERE ${where}`;
  const affected = await db.$executeRawUnsafe(sql, ...params);
  return affected > 0;
}

/** Guarda el error del procesamiento en las líneas de la solicitud. */
async function actualizarMensajeErrorDetalles(compania: string, codigo: string, mensaje: string): Promise<void> {
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) return;
  const tabSol = objetoPortal(compania, "SOLICITUD");
  const tabDet = objetoPortal(compania, "SOLICITUD_DETALLE");
  await portalDb(compania).$executeRawUnsafe(
    `UPDATE D SET D.MENSAJE_ERROR = @P1
       FROM ${tabDet} D
       INNER JOIN ${tabSol} S ON S.ID_SOLICITUD = D.ID_SOLICITUD
      WHERE S.CODIGO_SOLICITUD = @P2`,
    mensaje.slice(0, 400),
    codigo,
  );
}

/** Marca como aplicado el factor solicitado únicamente en filas exitosas. */
async function actualizarFactorAplicadoDetalles(compania: string, codigo: string): Promise<void> {
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) return;
  // Asignación columna-a-columna: Prisma no la soporta, queda en SQL (calificado por esquema).
  // Mismo motivo que en siguienteCodigoSolicitud: identificadores validados + valor parametrizado (@P1).
  const spd = objetoPortal(compania, "SOLICITUD_DETALLE");
  const sp = objetoPortal(compania, "SOLICITUD");
  await portalDb(compania).$executeRawUnsafe(
    `UPDATE D
        SET D.FACTOR_APLICADO = D.FACTOR_SOLICITADO
       FROM ${spd} D
       INNER JOIN ${sp} S ON S.ID_SOLICITUD = D.ID_SOLICITUD
      WHERE S.CODIGO_SOLICITUD = @P1
        AND UPPER(LTRIM(RTRIM(COALESCE(D.ESTADO_FILA, '')))) IN ('VALIDO','OK','S','SI','1')
        AND NULLIF(LTRIM(RTRIM(COALESCE(D.MENSAJE_ERROR, ''))), '') IS NULL;`,
    codigo,
  );
}
// ---------------------------------------------------------------------------
// Helpers de mapeo
// ---------------------------------------------------------------------------

function detalleData(f: FilaResultado, proceso: Solicitud["proceso"]): {
  SKU: string; DESCRIPCION: string | null; PRECIO_ACTUAL: number; COSTO: number;
  FACTOR_APLICADO: number; PRECIO_SIMULADO: number; PORCENTAJE_MARGEN: number | null;
  ESTADO_FILA: string; MENSAJE_ERROR: string | null; FACTOR_SOLICITADO: number | null;
  LISTA_PRECIO: string | null; CAUSA: string | null;
} {
  const v = f.validacion;
  const numero = (valor: unknown): number | null =>
    typeof valor === "number" && Number.isFinite(valor) ? valor : null;
  const esMargen = Object.prototype.hasOwnProperty.call(v, "factorReduccion");
  const filaMargen = esMargen ? f as FilaMargen : null;

  return {
    SKU: f.codigo || "SIN_CODIGO",
    DESCRIPCION: f.descripcion || "",
    PRECIO_ACTUAL: numero(v.precioActual) ?? 0,
    COSTO: numero(v.costo) ?? 0,
    // El procesador externo todavía no aplica el precio por fila en este
    // flujo. El esquema real de SOLICITUD_DETALLE exige FACTOR_APLICADO. Para
    // Precio Base no aplica un factor, por lo que 1.000000 representa el
    // multiplicador neutro; el precio absoluto viaja en PRECIO_SIMULADO.
    FACTOR_APLICADO: numero((f as FilaPrecio | FilaMargen).factorAplicado) ?? 1,
    PRECIO_SIMULADO: numero(proceso === "MAYOREOD_MASIVO" ? v.precioPropuesto : v.precioRedondeado ?? v.precioPropuesto) ?? 0,
    PORCENTAJE_MARGEN: esMargen ? filaMargen?.porcentajeReduccion ?? 0 : v.margenMinimo ?? 0,
    // CK_PP_SOLDET_ESTADO admite OK | ERROR | BAJO_COSTO | MARGEN_NEGATIVO; el motivo va en CAUSA.
    ESTADO_FILA: v.valido ? "OK" : "ERROR",
    MENSAJE_ERROR: (f as FilaPrecio | FilaMargen).mensajeError ?? (!v.valido ? v.causa ?? "Error no identificado" : null),
    // FACTOR_SOLICITADO representa el multiplicador persistido, no el
    // porcentaje capturado. El porcentaje queda en PARAMETROS_JSON.
    FACTOR_SOLICITADO: numero("multiplicador" in f ? f.multiplicador : null) ?? numero(v.factorPropuesto) ?? 1,
    // LISTA_PRECIO es el origen del valor que se muestra en el detalle. Para
    // descuento por artículo se guarda el código de lista de la fila.
    LISTA_PRECIO: ("listaCodigo" in f ? f.listaCodigo : null) ?? f.lista ?? "",
    CAUSA: v.causa ?? "",
  };
}

function textoPrimero(...valores: unknown[]): string | undefined {
  return valores
    .map((valor) => valor == null ? undefined : String(valor))
    .find((valor) => Boolean(valor?.trim()));
}

/**
 * Mapea una fila de SOLICITUD a un objeto Solicitud SIN filas de detalle.
 * Elimina además `filas` del PARAMETROS_JSON para que la respuesta de la
 * bandeja no cargue datos que no se necesitan hasta abrir el modal.
 */
function mapSolicitudCabecera(r: Record<string, unknown>): Solicitud {
  let parametrosRaw: Record<string, unknown> = {};
  try {
    parametrosRaw = r.PARAMETROS_JSON ? (JSON.parse(String(r.PARAMETROS_JSON)) as Record<string, unknown>) : {};
  } catch {
    parametrosRaw = {};
  }
  // Eliminar las filas embedidas — solo se cargan al abrir el modal
  const { filas: _filas, articulos: _articulos, ...parametros } = parametrosRaw;
  void _filas;
  void _articulos;

  const lista =
    textoPrimero(r.LISTA_PRECIO, r.LISTA, r.NIVEL_PRECIO, parametros.nivelPrecio, parametros.listaBase) ?? "";
  return {
    id: String(r.CODIGO_SOLICITUD ?? r.ID_PROCESO),
    proceso: r.PROCESO as Solicitud["proceso"],
    modalidad: r.MODALIDAD as Solicitud["modalidad"],
    compania: String(r.COMPANIA),
    lista,
    solicitanteNombre: String(r.SOLICITANTE_NOMBRE),
    solicitanteEmail: String(r.SOLICITANTE_EMAIL),
    idpOperador: null,
    parametros,
    filas: [],
    archivoNombre: (r.ARCHIVO_NOMBRE as string) ?? null,
    archivoS3Key: (r.ARCHIVO_S3_KEY as string) ?? null,
    fechaEnvio: (() => {
      const v = r.FECHA_CREACION ?? r.FECHA_ENVIO;
      return fmtFechaBd(v as Date | string);
    })(),
    fechaCreacion: (() => {
      const v = r.FECHA_CREACION ?? r.FECHA_ENVIO;
      if (!v) return undefined;
      const d = v instanceof Date ? v : new Date(v as string);
      return isNaN(d.getTime()) ? undefined : d.toISOString();
    })(),
    estado: r.ESTADO as Solicitud["estado"],
    motivoRechazo: (r.MOTIVO_RECHAZO as string) ?? null,
    idProcesoSP: (r.ID_PROCESO_SP as string) ?? null,
    autorizadoPor: (r.APROBADOR_NOMBRE as string) ?? undefined,
    autorizadoPorEmail: (r.APROBADOR_EMAIL as string) ?? undefined,
  };
}

function mapSolicitud(r: Record<string, unknown>, detalle: Record<string, unknown>[]): Solicitud {
  let parametros = {};
  try {
    parametros = r.PARAMETROS_JSON ? JSON.parse(String(r.PARAMETROS_JSON)) : {};
  } catch {
    parametros = {};
  }
  const lista = textoPrimero(r.LISTA_PRECIO, r.LISTA, r.NIVEL_PRECIO, (parametros as Record<string, unknown>).nivelPrecio, (parametros as Record<string, unknown>).listaBase) ?? "";
  return {
    id: String(r.CODIGO_SOLICITUD ?? r.ID_PROCESO),
    proceso: r.PROCESO as Solicitud["proceso"],
    modalidad: r.MODALIDAD as Solicitud["modalidad"],
    compania: String(r.COMPANIA),
    lista,
    solicitanteNombre: String(r.SOLICITANTE_NOMBRE),
    solicitanteEmail: String(r.SOLICITANTE_EMAIL),
    idpOperador: null,
    parametros,
    // Un borrador se retoma con las filas tal como se capturaron (PARAMETROS_JSON):
    // el detalle no conserva el valor capturado (p. ej. el precio de Precio Base).
    filas: r.ESTADO === "BORRADOR" && Array.isArray((parametros as { filas?: unknown }).filas)
      ? (parametros as { filas: FilaResultado[] }).filas
      : detalle.map((d) => mapDetalleFila(d, r.PROCESO as Solicitud["proceso"], lista)),
    archivoNombre: (r.ARCHIVO_NOMBRE as string) ?? null,
    archivoS3Key: (r.ARCHIVO_S3_KEY as string) ?? null,
    fechaEnvio: (() => {
      const v = r.FECHA_CREACION ?? r.FECHA_ENVIO;
      return fmtFechaBd(v as Date | string);
    })(),
    fechaCreacion: (() => {
      const v = r.FECHA_CREACION ?? r.FECHA_ENVIO;
      if (!v) return undefined;
      const d = v instanceof Date ? v : new Date(v as string);
      return isNaN(d.getTime()) ? undefined : d.toISOString();
    })(),
    estado: r.ESTADO as Solicitud["estado"],
    motivoRechazo: (r.MOTIVO_RECHAZO as string) ?? null,
    idProcesoSP: (r.ID_PROCESO_SP as string) ?? null,
    autorizadoPor: (r.APROBADOR_NOMBRE as string) ?? undefined,
    autorizadoPorEmail: (r.APROBADOR_EMAIL as string) ?? undefined,
  };
}

function mapDetalleFila(d: Record<string, unknown>, proceso?: Solicitud["proceso"], listaSolicitud = ""): FilaResultado {
  const numero = (valor: unknown): number | null => {
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
    if (typeof valor === "string" && valor.trim() !== "") {
      const convertido = Number(valor);
      return Number.isFinite(convertido) ? convertido : null;
    }
    return null;
  };
  const texto = (valor: unknown): string | undefined => valor == null ? undefined : String(valor);
  const textoNoVacio = (valor: unknown): string | undefined => {
    const resultado = texto(valor)?.trim();
    return resultado ? resultado : undefined;
  };
  const columna = (nombre: string): unknown => {
    if (d[nombre] !== undefined) return d[nombre];
    const clave = Object.keys(d).find((key) => key.trim().toUpperCase() === nombre.toUpperCase());
    return clave ? d[clave] : undefined;
  };
  // La tabla real usa OK/ERROR/NO_APLICADO; se aceptan también los valores
  // históricos del esquema conceptual y los indicadores S/N de versiones
  // anteriores del portal.
  const normalizarEstado = (valor: unknown): string =>
    texto(valor)
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase() ?? "";
  const estadoFila = normalizarEstado(d.ESTADO_FILA ?? d.VALIDO ?? d.ESTADO);
  const valido = ["OK", "VALIDO", "S", "SI", "TRUE", "1"].includes(estadoFila);
  const precioActual = numero(d.PRECIO_ACTUAL);  
  const precioPropuesto = numero(d.PRECIO_SIMULADO);
  const factorPropuesto = numero(d.FACTOR_SOLICITADO);
  const porcentajeSolicitado = factorPropuesto != null ? (factorPropuesto - 1) * 100 : null;
  const precioRedondeado = numero(d.PRECIO_SIMULADO);
  const esMargen = proceso === "MARGEN_UTILIDAD_MASIVO";
  const causa = textoNoVacio(d.CAUSA) ?? textoNoVacio(d.MENSAJE_ERROR) ?? null;
  const causaNormalizada = causa?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() ?? "";
  // Solo las causas de precio bajo margen/costo del engine; no los errores de dato que
  // mencionan "margen" (p. ej. "No fue posible calcular el margen (precio o costo inválido)").
  const esHallazgoMargen = !valido && /MARGEN[ _]MINIMO|DEBAJO DEL COSTO|BAJO COSTO/.test(causaNormalizada);
  const factorAplicado = numero(d.FACTOR_APLICADO);
  const mensajeError = textoNoVacio(d.MENSAJE_ERROR);
  const validacionBase: ValidacionPrecio = {
    valido,
    precioActual,
    precioPropuesto,
    factorPropuesto,
    precioRedondeado,
    estadoRedondeo: esHallazgoMargen ? "ALERTA_MARGEN" : null,
    factorReduccion: null,
    multiplicador: null,
    bandaRedondeo: null,
    margenMinimo: null,
    costo: numero(d.COSTO),
    costoMinimo: numero(d.COSTO),
    precioMin: numero(d.COSTO),
    causa,
  };

  if (esMargen) {
    const porcentajeReduccionSolicitado = numero(d.PORCENTAJE_MARGEN);
    const factorReduccionSolicitado = porcentajeReduccionSolicitado != null && porcentajeReduccionSolicitado >= 0 && porcentajeReduccionSolicitado < 100
      ? porcentajeReduccionSolicitado / 100
      : null;
    return {
      fila: numero(d.FILA) ?? numero(d.ID_DETALLE) ?? 0,
      codigo: String(d.SKU ?? ""),
      descripcion: String(d.DESCRIPCION ?? ""),
      porcentajeReduccion: porcentajeReduccionSolicitado,
      factorReduccion: factorReduccionSolicitado,
      multiplicadorMargen: factorReduccionSolicitado == null ? null : 1 - factorReduccionSolicitado,
      factorAplicado,
      mensajeError,
      validacion: {
        ...validacionBase,
        costoMinimoBase: null,
        costoMinimo: numero(d.COSTO),
        margenPromedio: numero(d.PORCENTAJE_MARGEN),
        margenSobrePrecioRedondeado: null,
        margenMinimoBase: null,
        factorPropuesto: factorReduccionSolicitado,
        porcentajeReduccion: porcentajeReduccionSolicitado,
        factorReduccion: factorReduccionSolicitado,
        multiplicadorMargen: factorReduccionSolicitado == null ? null : 1 - factorReduccionSolicitado,
        codigoRechazo: null,
        causa,
      },
    };
  }

  const listaDetalle = proceso === "DESCUENTO_LISTA_PRECIO"
    ? textoNoVacio(columna("LISTA_PRECIO"))
    : textoPrimero(columna("LISTA_PRECIO"), columna("LISTA_CODIGO"), columna("LISTA"), listaSolicitud);

  return {
    fila: numero(d.FILA) ?? numero(d.ID_DETALLE) ?? 0,
    codigo: String(d.SKU ?? ""),
    descripcion: String(d.DESCRIPCION ?? ""),
    listaCodigo: listaDetalle ?? undefined,
    grupoArticulo: undefined,
    tipoVariacion: undefined,
    variacionPorcentaje: porcentajeSolicitado ?? undefined,
    valorPropuestoRaw: factorPropuesto != null ? factorPropuesto.toFixed(4) : undefined,
    lista: listaDetalle,
    precioCalculado: numero(d.PRECIO_SIMULADO) ?? 0,
    validacion: validacionBase,
    precioMin : numero(d.COSTO) ?? 0,
    factorPropuesto: factorPropuesto ?? 0,
    multiplicador: factorPropuesto,
    factorAplicado,
    mensajeError,
  };
}

export const requestsRepository = {
  list: listarSolicitudes,
  listPaged: (compania: string, offset: number, limit: number, email?: string | null, proceso?: string | null) =>
    listarSolicitudesPaginado(compania, offset, limit, email, proceso),
  find: obtenerSolicitud,
  nextCode: siguienteCodigoSolicitud,
  create: agregarSolicitud,
  replaceDraft: reemplazarBorrador,
  update: actualizarSolicitud,
  setDetailError: actualizarMensajeErrorDetalles,
  markDetailsApplied: actualizarFactorAplicadoDetalles,
};
