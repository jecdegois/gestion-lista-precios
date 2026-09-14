import "server-only";
import type { EventoAuditoria, EventoTipo, Rol, Solicitud } from "@/lib/domain-types";
import { assertEscrituraPortalHabilitada, esModoDemo, objetoPortal } from "./companies";
import {
  agregarSolicitud as demoAgregar,
  actualizarSolicitud as demoActualizar,
  listarEventos as demoListarEventos,
  listarSolicitudes as demoListarSolicitudes,
  obtenerSolicitud as demoObtener,
  registrarEvento as demoRegistrarEvento,
  siguienteSeq as demoSeq,
} from "./requests-store";
import { getPortalPool } from "./db";

/**
 * Repositorio del PORTAL (estado maker-checker): solicitudes, detalle y
 * auditoría. Escribe SIEMPRE en el esquema [PORTAL_PRECIOS] (no toca Softland).
 *
 * En DEMO_MODE usa el store en memoria (requests-store); en modo real persiste
 * en las tablas del esquema del portal. Toda la API es async para servir a
 * ambos modos de forma uniforme.
 */

export async function listarSolicitudes(compania?: string): Promise<Solicitud[]> {
  const companiaNormalizada = compania?.trim().toUpperCase();
  if (esModoDemo()) {
    return demoListarSolicitudes().filter((solicitud) => !companiaNormalizada || solicitud.compania === companiaNormalizada);
  }

  const pool = await getPortalPool();
  const sp = objetoPortal("SOLICITUD");
  const spd = objetoPortal("SOLICITUD_DETALLE");
  const mssql = await import("mssql");
  const cab = companiaNormalizada
    ? await pool
      .request()
      .input("comp", mssql.VarChar(20), companiaNormalizada)
      .query(`SELECT * FROM ${sp} WHERE COMPANIA = @comp ORDER BY FECHA_ENVIO DESC`)
    : await pool.request().query(`SELECT * FROM ${sp} ORDER BY FECHA_ENVIO DESC`);
  const det = companiaNormalizada
    ? await pool
      .request()
      .input("comp", mssql.VarChar(20), companiaNormalizada)
      .query(`SELECT D.* FROM ${spd} D INNER JOIN ${sp} S ON S.ID_SOLICITUD = D.ID_SOLICITUD WHERE S.COMPANIA = @comp`)
    : await pool.request().query(`SELECT * FROM ${spd}`);

  return cab.recordset.map((r: Record<string, unknown>) =>
    mapSolicitud(r, det.recordset.filter((d: Record<string, unknown>) => d.ID_SOLICITUD === r.ID_SOLICITUD)),
  );
}

export async function obtenerSolicitud(codigo: string): Promise<Solicitud | undefined> {
  if (esModoDemo()) return demoObtener(codigo);
  const pool = await getPortalPool();
  const sp = objetoPortal("SOLICITUD");
  const spd = objetoPortal("SOLICITUD_DETALLE");
  const mssql = await import("mssql");
  const cab = await pool.request().input("cod", mssql.VarChar(20), codigo).query(`SELECT * FROM ${sp} WHERE CODIGO_SOLICITUD = @cod`);
  const r = cab.recordset[0];
  if (!r) return undefined;
  const det = await pool
    .request()
    .input("id", mssql.UniqueIdentifier, String(r.ID_SOLICITUD))
    .query(`SELECT * FROM ${spd} WHERE ID_SOLICITUD = @id`);
  return mapSolicitud(r, det.recordset);
}

export async function siguienteCodigoSolicitud(): Promise<string> {
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) return "SOL-" + (10450 + demoSeq());
  const pool = await getPortalPool();
  const q = await pool.request().query(`SELECT NEXT VALUE FOR ${objetoPortal("SEQ_SOLICITUD")} AS n`);
  return "SOL-" + q.recordset[0].n;
}

export async function agregarSolicitud(s: Solicitud): Promise<void> {
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) {
    demoAgregar(s);
    return;
  }
  const pool = await getPortalPool();
  const sp = objetoPortal("SOLICITUD");
  const spd = objetoPortal("SOLICITUD_DETALLE");
  const mssql = await import("mssql");
  const idpOperador = s.idpOperador?.trim();
  const listaPrecio = String(s.parametros.nivelPrecio ?? s.parametros.listaBase ?? s.parametros.nivel ?? "").trim();
  const tipoProcesoPorPestana: Record<string, string> = {
    FACTOR_PRECIO: "GESTION_GLOBAL",
    MAYOREOD_MASIVO: "ACTUALIZACION_MASIVA_PRECIOS",
    DESCUENTO_LISTA_PRECIO: "DESCUENTO_ARTICULO",
    MARGEN_UTILIDAD_MASIVO: "CARGA_MASIVA_MARGEN_UTILIDAD",
  };
  const tipoProceso = tipoProcesoPorPestana[s.proceso];
  if (!tipoProceso) {
    throw new Error(`No existe un TIPO_PROCESO Portal para la pestaña ${s.proceso}.`);
  }
  if (!idpOperador) {
    throw new Error("No se puede registrar la solicitud Portal sin IDP_OPERADOR.");
  }
  const req = pool
    .request()
    .input("cod", mssql.VarChar(20), s.id)
    .input("idProceso", mssql.VarChar(30), s.id)
    .input("comp", mssql.VarChar(20), s.compania)
    .input("tipoProceso", mssql.VarChar(30), tipoProceso)
    .input("mod", mssql.VarChar(10), s.modalidad)
    .input("listaPrecio", mssql.VarChar(30), listaPrecio || null)
    .input("idpOperador", mssql.VarChar(128), idpOperador)
    .input("email", mssql.VarChar(120), s.solicitanteEmail)
    .input("nombre", mssql.VarChar(120), s.solicitanteNombre)
    .input("params", mssql.NVarChar(mssql.MAX), JSON.stringify(s.parametros ?? {}))
    .input("archNom", mssql.VarChar(260), s.archivoNombre)
    .input("archS3", mssql.VarChar(400), s.archivoS3Key);
  const ins = await req.query(
    `INSERT INTO ${sp} (CODIGO_SOLICITUD, ID_PROCESO, COMPANIA, TIPO_PROCESO, MODALIDAD, LISTA_PRECIO,
                        IDP_OPERADOR, SOLICITANTE_EMAIL, SOLICITANTE_NOMBRE, ESTADO, PARAMETROS_JSON,
                        ARCHIVO_NOMBRE, ARCHIVO_S3_KEY, INTENTOS_REINTENTO, FECHA_CREACION,
                        FECHA_MODIFICACION, FECHA_ENVIO)
     OUTPUT INSERTED.ID_SOLICITUD
     VALUES (@cod,@idProceso,@comp,@tipoProceso,@mod,@listaPrecio,@idpOperador,@email,@nombre,'PENDIENTE',@params,
             @archNom,@archS3,0,GETDATE(),GETDATE(),GETDATE());`,
  );
  const idSolicitud = String(ins.recordset[0].ID_SOLICITUD);
  for (const f of s.filas) {
    await insertarDetalle(pool, spd, idSolicitud, f);
  }
}

export async function actualizarSolicitud(codigo: string, patch: Partial<Solicitud>): Promise<void> {
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) {
    demoActualizar(codigo, patch);
    return;
  }
  const pool = await getPortalPool();
  const sp = objetoPortal("SOLICITUD");
  const mssql = await import("mssql");
  const sets: string[] = ["FECHA_ULT_ESTADO = GETDATE()"];
  const req = pool.request().input("cod", mssql.VarChar(20), codigo);
  if (patch.estado !== undefined) { sets.push("ESTADO = @estado"); req.input("estado", mssql.VarChar(25), patch.estado); }
  if (patch.motivoRechazo !== undefined) { sets.push("MOTIVO_RECHAZO = @motivo"); req.input("motivo", mssql.VarChar(500), patch.motivoRechazo); }
  if (patch.idProcesoSP !== undefined) { sets.push("ID_PROCESO_SP = @proc"); req.input("proc", mssql.VarChar(30), patch.idProcesoSP); }
  if (patch.autorizadoPor !== undefined) { sets.push("APROBADOR_NOMBRE = @apn"); req.input("apn", mssql.VarChar(120), patch.autorizadoPor); }
  if (patch.autorizadoPorEmail !== undefined) { sets.push("APROBADOR_EMAIL = @ape"); req.input("ape", mssql.VarChar(120), patch.autorizadoPorEmail); }
  if (patch.resultado !== undefined && patch.resultado) {
    sets.push("TOTAL_REGISTROS = @tot", "EXITOSOS = @ex", "FALLIDOS = @fa", "LOG_S3_KEY = @log");
    req.input("tot", mssql.Int, patch.resultado.totalLote);
    req.input("ex", mssql.Int, patch.resultado.exitosos);
    req.input("fa", mssql.Int, patch.resultado.fallidos);
    req.input("log", mssql.VarChar(400), patch.resultado.logS3Key);
  }
  await req.query(`UPDATE ${sp} SET ${sets.join(", ")} WHERE CODIGO_SOLICITUD = @cod;`);
}

export async function registrarEvento(
  evento: EventoTipo,
  usuario: string,
  rol: Rol,
  compania: string,
  solicitudId: string | null,
  idProcesoSP: string | null,
  usuarioEmail = "",
): Promise<void> {
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) {
    demoRegistrarEvento(evento, usuario, rol, compania, solicitudId, idProcesoSP);
    return;
  }
  const pool = await getPortalPool();
  const ae = objetoPortal("AUDITORIA_PRECIOS");
  const mssql = await import("mssql");
  const payload = JSON.stringify({ usuario, compania, solicitudId });
  await pool
    .request()
    .input("proceso", mssql.VarChar(30), idProcesoSP ?? solicitudId ?? evento)
    .input("subject", mssql.VarChar(120), usuarioEmail || usuario)
    .input("rol", mssql.VarChar(15), rol)
    .input("evento", mssql.VarChar(50), evento)
    .input("payload", mssql.NVarChar(mssql.MAX), payload)
    .query(
      `INSERT INTO ${ae} (ID_PROCESO, IDP_SUBJECT, ROL, EVENTO, PAYLOAD_JSON, FECHA_EVENTO)
       VALUES (@proceso,@subject,@rol,@evento,@payload,GETDATE());`,
    );
}

export async function listarEventos(compania?: string): Promise<EventoAuditoria[]> {
  if (esModoDemo()) return demoListarEventos(compania);
  const pool = await getPortalPool();
  const ae = objetoPortal("AUDITORIA_PRECIOS");
  const mssql = await import("mssql");
  const columnas = "ID_AUDITORIA, ID_PROCESO, IDP_SUBJECT, ROL, EVENTO, PAYLOAD_JSON, FECHA_EVENTO";
  const q = compania
    ? await pool
      .request()
      .input("comp", mssql.VarChar(20), compania)
      .query(
        `SELECT TOP (200) ${columnas}
           FROM ${ae}
          WHERE ISJSON(PAYLOAD_JSON) = 1
            AND JSON_VALUE(PAYLOAD_JSON, '$.compania') = @comp
          ORDER BY FECHA_EVENTO DESC`,
      )
    : await pool.request().query(`SELECT TOP (200) ${columnas} FROM ${ae} ORDER BY FECHA_EVENTO DESC`);

  return q.recordset.map((r: Record<string, unknown>) => {
    let payload: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(String(r.PAYLOAD_JSON ?? "{}"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
    } catch {
      // Un registro histórico con JSON inválido aún debe poder visualizarse.
    }

    const rol = r.ROL === "APROBADOR" || r.ROL === "OPERADOR" ? r.ROL : "OPERADOR";
    return {
      id: String(r.ID_AUDITORIA),
      fecha: new Date(r.FECHA_EVENTO as string).toLocaleString("es-CR", { hour12: false }),
      usuario: typeof payload.usuario === "string" ? payload.usuario : String(r.IDP_SUBJECT ?? ""),
      rol: rol as Rol,
      evento: r.EVENTO as EventoTipo,
      solicitudId: typeof payload.solicitudId === "string" ? payload.solicitudId : null,
      idProcesoSP: (r.ID_PROCESO as string) ?? null,
      compania: typeof payload.compania === "string" ? payload.compania : (compania ?? ""),
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers de mapeo (SQL real)
// ---------------------------------------------------------------------------
type SqlPool = Awaited<ReturnType<typeof getPortalPool>>;

async function insertarDetalle(pool: SqlPool, spd: string, idSolicitud: string, f: import("@/lib/domain-types").FilaResultado): Promise<void> {
  const mssql = await import("mssql");
  const v = f.validacion as unknown as Record<string, unknown>;
  const valorPropuesto = "valorPropuestoRaw" in f
    ? Number.parseFloat(String(f.valorPropuestoRaw ?? "").replace(",", "."))
    : Number.NaN;
  const factorAplicado = typeof v.multiplicadorMargen === "number"
    ? v.multiplicadorMargen
    : typeof v.factorReduccion === "number"
      ? v.factorReduccion
      : Number.isFinite(valorPropuesto)
        ? valorPropuesto
        : null;
  const precioSimulado = (v.precioRedondeado as number | null) ?? (v.precioPropuesto as number | null) ?? null;
  const porcentajeMargen = (v.margenMinimo as number | null) ?? 0;
  const costo = (v.costo as number | null) ?? null;
  // CK_PP_SOLDET_ESTADO acepta el estado inicial de negocio, no el resultado de la validación local.
  const estadoFila = "PENDIENTE";
  // La causa se conserva dentro del JSON del detalle, no en una columna independiente.
  const mensajeError = null;

  await pool
    .request()
    .input("id", mssql.UniqueIdentifier, idSolicitud)
    .input("sku", mssql.VarChar(20), f.codigo)
    .input("descripcion", mssql.VarChar(200), f.descripcion)
    .input("precioActual", mssql.Decimal(28, 8), (v.precioActual as number) ?? null)
    .input("costo", mssql.Decimal(28, 8), costo)
    .input("factorAplicado", mssql.Decimal(18, 8), factorAplicado)
    .input("precioSimulado", mssql.Decimal(28, 8), precioSimulado)
    .input("porcentajeMargen", mssql.Decimal(9, 6), porcentajeMargen)
    .input("estadoFila", mssql.VarChar(20), estadoFila)
    .input("mensajeError", mssql.VarChar(400), mensajeError)
    .query(
      `INSERT INTO ${spd} (ID_SOLICITUD, SKU, DESCRIPCION, PRECIO_ACTUAL, COSTO, FACTOR_APLICADO,
                           PRECIO_SIMULADO, PORCENTAJE_MARGEN, ESTADO_FILA, MENSAJE_ERROR)
       VALUES (@id,@sku,@descripcion,@precioActual,@costo,@factorAplicado,@precioSimulado,
               @porcentajeMargen,@estadoFila,@mensajeError);`,
    );
}

function mapSolicitud(r: Record<string, unknown>, detalle: Record<string, unknown>[]): Solicitud {
  let parametros = {};
  try {
    parametros = r.PARAMETROS_JSON ? JSON.parse(String(r.PARAMETROS_JSON)) : {};
  } catch {
    parametros = {};
  }
  return {
    id: String(r.CODIGO_SOLICITUD ?? r.ID_PROCESO),
    proceso: (r.TIPO_PROCESO ?? r.PROCESO) as Solicitud["proceso"],
    modalidad: r.MODALIDAD as Solicitud["modalidad"],
    compania: String(r.COMPANIA),
    solicitanteNombre: String(r.SOLICITANTE_NOMBRE),
    solicitanteEmail: String(r.SOLICITANTE_EMAIL),
    idpOperador: (r.IDP_OPERADOR as string) ?? null,
    parametros,
    filas: detalle.map(mapDetalleFila),
    archivoNombre: (r.ARCHIVO_NOMBRE as string) ?? null,
    archivoS3Key: (r.ARCHIVO_S3_KEY as string) ?? null,
    fechaEnvio: new Date(r.FECHA_ENVIO as string).toLocaleString("es-CR", { hour12: false }),
    estado: r.ESTADO as Solicitud["estado"],
    motivoRechazo: (r.MOTIVO_RECHAZO as string) ?? null,
    idProcesoSP: (r.ID_PROCESO_SP as string) ?? null,
    autorizadoPor: (r.APROBADOR_NOMBRE as string) ?? undefined,
    autorizadoPorEmail: (r.APROBADOR_EMAIL as string) ?? undefined,
  };
}

function mapDetalleFila(d: Record<string, unknown>): import("@/lib/domain-types").FilaResultado {
  const numero = (valor: unknown): number | null => {
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
    if (typeof valor === "string" && valor.trim() !== "") {
      const convertido = Number(valor);
      return Number.isFinite(convertido) ? convertido : null;
    }
    return null;
  };
  const estadoFila = String(d.ESTADO_FILA ?? "PENDIENTE").toUpperCase();
  const precioActual = numero(d.PRECIO_ACTUAL);
  const precioSimulado = numero(d.PRECIO_SIMULADO);
  const costo = numero(d.COSTO);
  const porcentajeMargen = numero(d.PORCENTAJE_MARGEN) ?? 0;
  const factorAplicado = numero(d.FACTOR_APLICADO);

  return {
    fila: numero(d.ID_DETALLE) ?? 0,
    codigo: String(d.SKU ?? ""),
    descripcion: String(d.DESCRIPCION ?? ""),
    valorPropuestoRaw: factorAplicado === null ? undefined : String(factorAplicado),
    validacion: {
      valido: estadoFila !== "ERROR",
      precioActual,
      precioPropuesto: precioSimulado,
      precioRedondeado: precioSimulado,
      estadoRedondeo: precioSimulado === null ? null : "CALCULADO",
      bandaRedondeo: null,
      margenMinimo: porcentajeMargen,
      costo,
      costoMinimo: null,
      causa: null,
    },
  };
}
