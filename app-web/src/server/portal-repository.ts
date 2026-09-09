import "server-only";
import type { EventoAuditoria, EventoTipo, Rol, Solicitud } from "@/lib/domain-types";
import { esModoDemo, objetoPortal } from "./companies";
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

export async function listarSolicitudes(): Promise<Solicitud[]> {
  if (esModoDemo()) return demoListarSolicitudes();
  const pool = await getPortalPool();
  const sp = objetoPortal("SOLICITUD_PRECIO");
  const spd = objetoPortal("SOLICITUD_PRECIO_DETALLE");
  const cab = await pool.request().query(`SELECT * FROM ${sp} ORDER BY FECHA_ENVIO DESC`);
  const det = await pool.request().query(`SELECT * FROM ${spd}`);
  return cab.recordset.map((r: Record<string, unknown>) =>
    mapSolicitud(r, det.recordset.filter((d: Record<string, unknown>) => d.ID_SOLICITUD === r.ID_SOLICITUD)),
  );
}

export async function obtenerSolicitud(codigo: string): Promise<Solicitud | undefined> {
  if (esModoDemo()) return demoObtener(codigo);
  const pool = await getPortalPool();
  const sp = objetoPortal("SOLICITUD_PRECIO");
  const spd = objetoPortal("SOLICITUD_PRECIO_DETALLE");
  const mssql = await import("mssql");
  const cab = await pool.request().input("cod", mssql.VarChar(20), codigo).query(`SELECT * FROM ${sp} WHERE CODIGO_SOLICITUD = @cod`);
  const r = cab.recordset[0];
  if (!r) return undefined;
  const det = await pool.request().input("id", mssql.Int, r.ID_SOLICITUD).query(`SELECT * FROM ${spd} WHERE ID_SOLICITUD = @id`);
  return mapSolicitud(r, det.recordset);
}

export async function siguienteCodigoSolicitud(): Promise<string> {
  if (esModoDemo()) return "SOL-" + (10450 + demoSeq());
  const pool = await getPortalPool();
  const seq = objetoPortal("SEQ_SOLICITUD").replace(/^\[|\]$/g, "");
  const q = await pool.request().query(`SELECT NEXT VALUE FOR ${objetoPortal("SEQ_SOLICITUD")} AS n`);
  return "SOL-" + q.recordset[0].n;
}

export async function agregarSolicitud(s: Solicitud): Promise<void> {
  if (esModoDemo()) {
    demoAgregar(s);
    return;
  }
  const pool = await getPortalPool();
  const sp = objetoPortal("SOLICITUD_PRECIO");
  const spd = objetoPortal("SOLICITUD_PRECIO_DETALLE");
  const mssql = await import("mssql");
  const req = pool
    .request()
    .input("cod", mssql.VarChar(20), s.id)
    .input("comp", mssql.VarChar(20), s.compania)
    .input("proc", mssql.VarChar(30), s.proceso)
    .input("mod", mssql.VarChar(10), s.modalidad)
    .input("email", mssql.VarChar(120), s.solicitanteEmail)
    .input("nombre", mssql.VarChar(120), s.solicitanteNombre)
    .input("params", mssql.NVarChar(mssql.MAX), JSON.stringify(s.parametros ?? {}))
    .input("archNom", mssql.VarChar(260), s.archivoNombre)
    .input("archS3", mssql.VarChar(400), s.archivoS3Key);
  const ins = await req.query(
    `INSERT INTO ${sp} (CODIGO_SOLICITUD, COMPANIA, PROCESO, MODALIDAD, SOLICITANTE_EMAIL, SOLICITANTE_NOMBRE,
                        ESTADO, PARAMETROS_JSON, ARCHIVO_NOMBRE, ARCHIVO_S3_KEY, FECHA_ENVIO)
     OUTPUT INSERTED.ID_SOLICITUD
     VALUES (@cod,@comp,@proc,@mod,@email,@nombre,'PENDIENTE',@params,@archNom,@archS3,GETDATE());`,
  );
  const idSolicitud = ins.recordset[0].ID_SOLICITUD as number;
  for (const f of s.filas) {
    await insertarDetalle(pool, spd, idSolicitud, f);
  }
}

export async function actualizarSolicitud(codigo: string, patch: Partial<Solicitud>): Promise<void> {
  if (esModoDemo()) {
    demoActualizar(codigo, patch);
    return;
  }
  const pool = await getPortalPool();
  const sp = objetoPortal("SOLICITUD_PRECIO");
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
  if (esModoDemo()) {
    demoRegistrarEvento(evento, usuario, rol, compania, solicitudId, idProcesoSP);
    return;
  }
  const pool = await getPortalPool();
  const ae = objetoPortal("AUDITORIA_EVENTOS");
  const mssql = await import("mssql");
  await pool
    .request()
    .input("comp", mssql.VarChar(20), compania)
    .input("email", mssql.VarChar(120), usuarioEmail || usuario)
    .input("nombre", mssql.VarChar(120), usuario)
    .input("rol", mssql.VarChar(15), rol)
    .input("evento", mssql.VarChar(50), evento)
    .input("cod", mssql.VarChar(20), solicitudId)
    .input("proc", mssql.VarChar(30), idProcesoSP)
    .query(
      `INSERT INTO ${ae} (COMPANIA, USUARIO_EMAIL, USUARIO_NOMBRE, ROL, EVENTO, CODIGO_SOLICITUD, ID_PROCESO_SP)
       VALUES (@comp,@email,@nombre,@rol,@evento,@cod,@proc);`,
    );
}

export async function listarEventos(compania?: string): Promise<EventoAuditoria[]> {
  if (esModoDemo()) return demoListarEventos(compania);
  const pool = await getPortalPool();
  const ae = objetoPortal("AUDITORIA_EVENTOS");
  const mssql = await import("mssql");
  const q = compania
    ? await pool.request().input("comp", mssql.VarChar(20), compania).query(`SELECT TOP (200) * FROM ${ae} WHERE COMPANIA = @comp ORDER BY FECHA DESC`)
    : await pool.request().query(`SELECT TOP (200) * FROM ${ae} ORDER BY FECHA DESC`);
  return q.recordset.map((r: Record<string, unknown>) => ({
    id: String(r.ID_EVENTO),
    fecha: new Date(r.FECHA as string).toLocaleString("es-CR", { hour12: false }),
    usuario: String(r.USUARIO_NOMBRE ?? r.USUARIO_EMAIL ?? ""),
    rol: (r.ROL as Rol) ?? "OPERADOR",
    evento: r.EVENTO as EventoTipo,
    solicitudId: (r.CODIGO_SOLICITUD as string) ?? null,
    idProcesoSP: (r.ID_PROCESO_SP as string) ?? null,
    compania: String(r.COMPANIA ?? ""),
  }));
}

// ---------------------------------------------------------------------------
// Helpers de mapeo (SQL real)
// ---------------------------------------------------------------------------
type SqlPool = Awaited<ReturnType<typeof getPortalPool>>;

async function insertarDetalle(pool: SqlPool, spd: string, idSolicitud: number, f: import("@/lib/domain-types").FilaResultado): Promise<void> {
  const mssql = await import("mssql");
  const v = f.validacion as unknown as Record<string, unknown>;
  await pool
    .request()
    .input("id", mssql.Int, idSolicitud)
    .input("fila", mssql.Int, f.fila)
    .input("art", mssql.VarChar(20), f.codigo)
    .input("desc", mssql.VarChar(200), f.descripcion)
    .input("pct", mssql.Decimal(9, 4), (v.porcentajeReduccion as number) ?? null)
    .input("factNorm", mssql.Decimal(9, 6), (v.factorReduccion as number) ?? null)
    .input("precioAct", mssql.Decimal(28, 8), (v.precioActual as number) ?? null)
    .input("precioRed", mssql.Decimal(28, 8), (v.precioRedondeado as number) ?? null)
    .input("estRed", mssql.VarChar(20), (v.estadoRedondeo as string) ?? null)
    .input("margMin", mssql.Decimal(9, 6), (v.margenMinimo as number) ?? null)
    .input("valido", mssql.Char(1), v.valido ? "S" : "N")
    .input("codRech", mssql.VarChar(40), (v.codigoRechazo as string) ?? null)
    .input("causa", mssql.VarChar(400), (v.causa as string) ?? null)
    .query(
      `INSERT INTO ${spd} (ID_SOLICITUD, FILA, ARTICULO, DESCRIPCION, PORCENTAJE_REDUCCION, FACTOR_REDUCCION_NORM,
                           PRECIO_ACTUAL, PRECIO_REDONDEADO, ESTADO_REDONDEO, MARGEN_MINIMO, VALIDO, CODIGO_RECHAZO, CAUSA)
       VALUES (@id,@fila,@art,@desc,@pct,@factNorm,@precioAct,@precioRed,@estRed,@margMin,@valido,@codRech,@causa);`,
    );
}

function mapSolicitud(r: Record<string, unknown>, _detalle: Record<string, unknown>[]): Solicitud {
  // Mapeo de encabezado; el detalle real puede rehidratarse si se requiere en UI.
  let parametros = {};
  try {
    parametros = r.PARAMETROS_JSON ? JSON.parse(String(r.PARAMETROS_JSON)) : {};
  } catch {
    parametros = {};
  }
  return {
    id: String(r.CODIGO_SOLICITUD),
    proceso: r.PROCESO as Solicitud["proceso"],
    modalidad: r.MODALIDAD as Solicitud["modalidad"],
    compania: String(r.COMPANIA),
    solicitanteNombre: String(r.SOLICITANTE_NOMBRE),
    solicitanteEmail: String(r.SOLICITANTE_EMAIL),
    parametros,
    filas: [],
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
