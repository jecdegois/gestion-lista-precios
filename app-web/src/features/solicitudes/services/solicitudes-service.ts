import "server-only";
import { BORRADORES_HABILITADOS, estaEnAmbito } from "@/features/solicitudes/utils/catalog";
import { nombreArchivoS3, nuevoIdProcesoSP } from "@/features/solicitudes/utils/ids";
import type {
  CriteriosArticulo,
  FilaMargen,
  FilaPrecio,
  FilaResultado,
  Identidad,
  ParametrosSolicitud,
  ProcesoKey,
  Rol,
  Solicitud,
} from "@/shared/types/domain-types";
import { esFilaMargen, esFilaProcesable } from "@/shared/types/domain-types";
import { calcularVariacion, construirFilaSolicitud } from "@/features/solicitudes/utils/engine";
import { esModoDemo, esModoSoloLectura, esModoSoloPortal } from "@/server/companies";
import { auditRepository } from "@/features/auditoria/repository/audit-repository";
import { requestsRepository as repo } from "../repository/requests-repository";
import { pricingRepository } from "../repository/pricing-repository";
import { nivelesSolicitadosCanonicos, cargarContextosPorLista, crearContextoCatalogo, resolverNivelPrecio } from "./catalog-context";
import {
  obtenerCatalogoSolicitud,
  paginaArticulos,
  parsearExcel,
  simularGestionGlobalPaginado,
  simularManual,
  type SimularGestionGlobalPaginadoInput,
} from "./simulation-service";
import { FilaEntradaSchema, SolicitudSchema } from "../schemas/solicitud-schema";
import type {
  CancelacionInput,
  DecisionCancelacionInput,
  FilaEntrada,
  RechazoInput,
  SimularManualInput,
  SolicitudInput,
} from "../schemas/solicitud-schema";

function errorSoloLectura(): { ok: false; error: string } {
  return { ok: false, error: "El sistema está en modo solo lectura. No se permiten cambios ni ejecuciones." };
}

function errorSoloPortal(): { ok: false; error: string } {
  return { ok: false, error: "La aplicación está en modo de simulación segura: no se ejecutan procedimientos ni cambios sobre Softland." };
}

const LISTA_PRECIO_BASE = "MAYOREOD";

const ESTADO_CAMBIADO = { ok: false as const, error: "La solicitud cambió de estado mientras se procesaba (otro usuario ya actuó sobre ella). Actualice la vista." };

// ---------------------------------------------------------------------------
// Envio de solicitud (queda PENDIENTE; NO toca la BD productiva)
// ---------------------------------------------------------------------------
interface EnviarSolicitudInput {
  proceso: ProcesoKey;
  modalidad: "manual" | "excel";
  usuarioEmail: string;
  usuarioNombre: string;
  usuarioRol: Rol;
  compania: string;
  parametros: ParametrosSolicitud;
  filas: FilaEntrada[];
  archivoNombre?: string | null;
  archivoS3Key?: string | null;
  borradorId?: string | null;
}

type Preparada = { ok: false; error: string } | { ok: true; solicitud: Omit<Solicitud, "id"> };

/**
 * Valida la solicitud contra Softland y RECALCULA sus filas en servidor: no se
 * confía en `validacion`/precios del cliente. Común a envío y borrador.
 */
async function prepararSolicitud(input: EnviarSolicitudInput, estado: "PENDIENTE" | "BORRADOR"): Promise<Preparada> {
  const niveles = await pricingRepository.listPriceLevels(input.compania);
  const listasEnFilas = input.proceso === "DESCUENTO_LISTA_PRECIO"
    ? input.filas.flatMap((fila) => fila.listaCodigo ? [fila.listaCodigo] : [])
    : [];
  const valoresParametros = [input.parametros.nivelPrecio, input.parametros.listaBase, input.parametros.nivel]
    .filter((valor): valor is string => Boolean(valor?.trim()));
  const nivelesParametros = nivelesSolicitadosCanonicos(niveles, valoresParametros);
  // Las listas de los parámetros deben existir; una lista inválida en una fila de Descuento
  // solo invalida esa fila (se descarta igual que un código inválido).
  const nivelesCanonicos = [...new Set([...nivelesParametros, ...nivelesSolicitadosCanonicos(niveles, listasEnFilas)])];
  if (
    nivelesCanonicos.length === 0 ||
    nivelesParametros.length !== new Set(valoresParametros.map((valor) => valor.trim().toLowerCase())).size
  ) {
    return { ok: false, error: "La solicitud contiene una lista que no existe en los maestros de Softland." };
  }

  // Precio Base escribe siempre en MAYOREOD (updateBasePrices): se valida contra esa lista.
  const nivelSolicitud = input.proceso === "MAYOREOD_MASIVO" ? LISTA_PRECIO_BASE : nivelesParametros[0] ?? nivelesCanonicos[0];
  const listaPredeterminada = resolverNivelPrecio(niveles, nivelSolicitud);
  if (!listaPredeterminada) {
    return { ok: false, error: "La solicitud no contiene una lista de precio válida." };
  }
  // Solo Descuento admite una lista por fila; el resto usa la lista de la solicitud.
  const listaDeFila = (fila: FilaEntrada): string | undefined =>
    input.proceso === "DESCUENTO_LISTA_PRECIO" && fila.listaCodigo
      ? resolverNivelPrecio(niveles, fila.listaCodigo)
      : listaPredeterminada;

  const base = {
    proceso: input.proceso,
    modalidad: input.modalidad,
    compania: input.compania,
    solicitanteNombre: input.usuarioNombre,
    solicitanteEmail: input.usuarioEmail,
    idpOperador: input.usuarioEmail.trim().toLowerCase(),
    archivoNombre: input.archivoNombre ?? null,
    archivoS3Key: input.archivoS3Key ?? null,
    fechaEnvio: new Date().toLocaleString("es-CR", { hour12: false }),
    fechaCreacion: new Date().toISOString(),
    estado,
    motivoRechazo: null,
    idProcesoSP: null,
    lista: listaPredeterminada,
  };

  if (input.proceso === "FACTOR_PRECIO") {
    // El multiplicador se deriva en servidor de tipo + magnitud (no se toma del cliente).
    const variacion = calcularVariacion(input.parametros.tipoVariacion, input.parametros.factor);
    if (!variacion.valido) {
      return { ok: false, error: variacion.causa ?? "La variación de Gestión Global no es válida." };
    }
    const parametros = { ...input.parametros, multiplicador: variacion.factor };
    // Gestión Global persiste una sola fila resumen con los parámetros de la
    // operación. El detalle artículo por artículo es informativo y se consulta
    // en tiempo real desde Softland al abrir el modal — no se persiste.
    return { ok: true, solicitud: { ...base, parametros, filas: [construirFilaResumenGestionGlobal(parametros, listaPredeterminada)] } };
  }

  const contextosPorLista = await cargarContextosPorLista(
    input.compania,
    niveles,
    [...new Set([...nivelesCanonicos, listaPredeterminada])],
    input.filas.map((fila) => fila.codigo),
  );
  const contextoVacio = crearContextoCatalogo(niveles, []);
  const filas: FilaResultado[] = input.filas.map((entrada) => {
    const lista = listaDeFila(entrada);
    const fila = construirFilaSolicitud(input.proceso, input.modalidad, entrada, (lista && contextosPorLista.get(lista)) || contextoVacio);
    return { ...fila, lista };
  });

  // Carga parcial: se descartan las filas con error duro (código inválido, precio cero,
  // formato incorrecto). Las de hallazgo de margen se incluyen.
  const filasParaProcesar = filas.filter(esFilaProcesable);

  const hayArticuloFueraDeLista = filasParaProcesar.some((fila) => {
    const contexto = fila.lista ? contextosPorLista.get(fila.lista) : undefined;
    return !contexto?.articulos[fila.codigo];
  });
  if (filasParaProcesar.length === 0 || hayArticuloFueraDeLista) {
    return { ok: false, error: "La solicitud contiene un artículo que no existe en la lista de precio seleccionada en Softland." };
  }

  return { ok: true, solicitud: { ...base, parametros: input.parametros, filas: filasParaProcesar } };
}

function errorRegistro(error: unknown, prefijo: string): { ok: false; error: string } {
  const detalle = error instanceof Error ? error.message.replace(/\s+/g, " ").trim() : "Error de base de datos no identificado.";
  if (detalle.includes("CK_PP_SOL_TIPO")) return { ok: false, error: `TIPO_PROCESO rechazado por CK_PP_SOL_TIPO: ${detalle}` };
  return { ok: false, error: `${prefijo}: ${detalle}` };
}

/**
 * Persiste la solicitud preparada: nueva (nextCode) o reemplazando un borrador
 * propio (mismo código; el repo verifica atómicamente que siga en BORRADOR).
 */
async function persistirSolicitud(
  input: EnviarSolicitudInput,
  estado: "PENDIENTE" | "BORRADOR",
): Promise<{ ok: false; error: string } | { ok: true; solicitud: Solicitud }> {
  if (esModoSoloLectura()) return errorSoloLectura();
  const preparada = await prepararSolicitud(input, estado);
  if (!preparada.ok) return preparada;
  const prefijo = estado === "BORRADOR" ? "No fue posible guardar el borrador" : "No fue posible registrar la solicitud en el Portal";
  let solicitud: Solicitud;
  try {
    if (input.borradorId) {
      solicitud = { ...preparada.solicitud, id: input.borradorId };
      if (!(await repo.replaceDraft(solicitud))) {
        return { ok: false, error: "El borrador no existe, ya fue enviado o no le pertenece." };
      }
    } else {
      solicitud = { ...preparada.solicitud, id: await repo.nextCode(input.compania) };
      await repo.create(solicitud);
    }
  } catch (error) {
    return errorRegistro(error, prefijo);
  }
  const event = estado === "BORRADOR" ? "SOLICITUD_GUARDADA_BORRADOR" : input.borradorId ? "BORRADOR_ENVIADO" : "SOLICITUD_ENVIADA";
  try {
    await auditRepository.record({ event, user: input.usuarioNombre, role: input.usuarioRol, company: input.compania, requestId: solicitud.id, userEmail: input.usuarioEmail });
  } catch (error) {
    return errorRegistro(error, `Solicitud ${solicitud.id} registrada pero no se pudo auditar el evento`);
  }
  return { ok: true, solicitud };
}

// ---------------------------------------------------------------------------
// Revision (registra que el aprobador revisó; NO toca la BD)
// ---------------------------------------------------------------------------
async function registrarRevision(
  solicitudId: string,
  usuarioNombre: string,
  usuarioRol: Rol,
  compania: string,
): Promise<{ ok: boolean; error?: string }> {
  if (esModoSoloLectura()) return errorSoloLectura();
  // Usar findHeader para evitar cargar 10K+ filas
  const s = await repo.findHeader(compania, solicitudId);
  if (s && s.estado === "PENDIENTE") {
    await auditRepository.record({ event: "SIMULACION_REVISADA", user: usuarioNombre, role: usuarioRol, company: compania, requestId: solicitudId });
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Rechazo (motivo obligatorio; NO toca la BD)
// ---------------------------------------------------------------------------
async function rechazarSolicitud(
  compania: string,
  solicitudId: string,
  motivo: string,
  usuarioNombre: string,
  usuarioRol: Rol,
): Promise<{ ok: boolean; error?: string }> {
  if (esModoSoloLectura()) return errorSoloLectura();
  // Usar findHeader para evitar cargar 10K+ filas
  const s = await repo.findHeader(compania, solicitudId);
  if (!s) return { ok: false, error: "Solicitud no encontrada." };
  if (!motivo || motivo.trim().length === 0) return { ok: false, error: "El motivo de rechazo es obligatorio." };
  if (!(await repo.update(compania, solicitudId, { estado: "RECHAZADO", motivoRechazo: motivo.trim() }, ["PENDIENTE"]))) {
    return ESTADO_CAMBIADO;
  }
  await auditRepository.record({ event: "SOLICITUD_RECHAZADA", user: usuarioNombre, role: usuarioRol, company: s.compania, requestId: solicitudId });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// APROBACION — conserva la decisión maker-checker, pero este aplicativo no
// ejecuta SP ni mutaciones sobre Softland. Solo se permiten consultas SELECT.
// ---------------------------------------------------------------------------
interface AprobarInput {
  compania: string;
  solicitudId: string;
  aprobadorNombre: string;
  aprobadorEmail: string;
  aprobadorRol: Rol;
  reintento?: boolean;
}

async function aprobarSolicitud(input: AprobarInput): Promise<{ ok: boolean; error?: string; idProcesoSP?: string }> {
  console.info("[APROBAR] Iniciando aprobación", { solicitudId: input.solicitudId, compania: input.compania });
  if (esModoSoloLectura()) {
    console.info("[APROBAR] Bloqueado: modo solo lectura");
    return errorSoloLectura();
  }
  
  // Primero obtenemos solo la cabecera (rápido) para validaciones básicas
  const cabecera = await repo.findHeader(input.compania, input.solicitudId);
  if (!cabecera) {
    console.info("[APROBAR] Solicitud no encontrada");
    return { ok: false, error: "Solicitud no encontrada." };
  }
  console.info("[APROBAR] Cabecera encontrada", { proceso: cabecera.proceso, estado: cabecera.estado });
  
  if (input.reintento && cabecera.estado !== "ERROR_EJECUCION") {
    console.info("[APROBAR] Bloqueado: reintento pero estado no es ERROR_EJECUCION");
    return { ok: false, error: "Solo se pueden reintentar solicitudes en ERROR_EJECUCION." };
  }
  
  let estadoActual = cabecera.estado;
  if (input.reintento) estadoActual = "PENDIENTE";
  if (estadoActual !== "PENDIENTE") {
    console.info("[APROBAR] Bloqueado: estado no es PENDIENTE", { estado: estadoActual });
    return { ok: false, error: "La solicitud no está pendiente de aprobación." };
  }
  
  // Bloqueo estricto de autoaprobación (segregación de funciones).
  if (cabecera.solicitanteEmail === input.aprobadorEmail) {
    console.info("[APROBAR] Bloqueado: autoaprobación", { solicitante: cabecera.solicitanteEmail, aprobador: input.aprobadorEmail });
    return { ok: false, error: "No puede aprobar su propia solicitud (segregación de funciones)." };
  }
  if (input.aprobadorRol !== "APROBADOR") {
    console.info("[APROBAR] Bloqueado: rol no es APROBADOR", { rol: input.aprobadorRol });
    return { ok: false, error: "Solo un Aprobador puede autorizar la ejecución." };
  }
  if (!estaEnAmbito(cabecera.compania, cabecera.compania)) {
    console.info("[APROBAR] Bloqueado: fuera de ámbito");
    return { ok: false, error: "La solicitud está fuera de su ámbito autorizado." };
  }

  // Consultar conteo de filas sin cargarlas todas
  const { total: totalFilas, totalHallazgos } = await repo.countDetails(input.compania, input.solicitudId);
  console.info("[APROBAR] Conteo de filas", { totalFilas, totalHallazgos });
  
  if (totalFilas === 0 && cabecera.proceso !== "FACTOR_PRECIO") {
    console.info("[APROBAR] Bloqueado: sin filas");
    return { ok: false, error: "La solicitud no tiene filas para procesar." };
  }

  if (cabecera.proceso === "FACTOR_PRECIO" && !esModoDemo() && esModoSoloPortal()) {
    console.info("[APROBAR] Bloqueado: FACTOR_PRECIO en modo solo portal");
    return errorSoloPortal();
  }

  console.info("[APROBAR] Tomando solicitud para procesamiento");
  const idProcesoSP = nuevoIdProcesoSP();
  // Toma la solicitud de forma atómica: si dos aprobadores aprueban a la vez, solo uno ejecuta.
  const t0 = Date.now();
  console.info("[APROBAR] Ejecutando repo.update para cambiar estado a EN_PROCESO...", { timestamp: new Date().toISOString() });
  const tomada = await repo.update(cabecera.compania, input.solicitudId, {
    estado: "EN_PROCESO",
    idProcesoSP,
    autorizadoPor: input.aprobadorNombre,
    autorizadoPorEmail: input.aprobadorEmail,
    ultimaActualizacion: new Date().toLocaleString("es-CR", { hour12: false }),
  }, [input.reintento ? "ERROR_EJECUCION" : "PENDIENTE"]);
  console.info("[APROBAR] repo.update completado", { tomada, duracionMs: Date.now() - t0 });
  if (!tomada) return ESTADO_CAMBIADO;
  
  console.info("[APROBAR] Registrando auditoría...");
  await auditRepository.record({ event: "EJECUCION_ENCOLADA", user: input.aprobadorNombre, role: input.aprobadorRol, company: cabecera.compania, requestId: cabecera.id, processId: idProcesoSP });
  console.info("[APROBAR] Auditoría registrada. Lanzando proceso en background...");

  // Ejecutar el proceso según el tipo - ahora en background con fire-and-forget
  void ejecutarProcesoEnBackground(cabecera, input, idProcesoSP, totalFilas);
  
  console.info("[APROBAR] Retornando respuesta OK al cliente");
  return { ok: true, idProcesoSP };
}

/** Ejecuta el proceso en background sin bloquear la respuesta HTTP. */
async function ejecutarProcesoEnBackground(
  cabecera: Solicitud,
  input: AprobarInput,
  idProcesoSP: string,
  totalFilas: number,
): Promise<void> {
  const { proceso, compania, id: solicitudId } = cabecera;
  const lista = cabecera.lista.trim() || String(cabecera.parametros.nivelPrecio ?? cabecera.parametros.listaBase ?? cabecera.parametros.nivel ?? "").trim();

  console.info("[BACKGROUND] Iniciando ejecución en background", { solicitudId, proceso, totalFilas });

  try {
    // Gestión Global: no necesita filas del detalle, solo actualiza la cabecera de la lista
    if (proceso === "FACTOR_PRECIO" && !esModoDemo()) {
      const factorPorcentajeOriginal = cabecera.parametros.factor ?? "";
      const variacion = calcularVariacion(cabecera.parametros.tipoVariacion, factorPorcentajeOriginal);
      const tipoVariacion = cabecera.parametros.tipoVariacion;
      if (!variacion.valido || variacion.factor == null || variacion.magnitud == null || !tipoVariacion) {
        throw new Error(variacion.causa ?? "La variación de Gestión Global no es válida.");
      }
      console.info("[GESTION_GLOBAL] Ejecutando actualización", { solicitudId, lista, factor: variacion.factor });
      await pricingRepository.updateGlobalManagement(compania, lista, variacion.factor, tipoVariacion, variacion.magnitud, input.aprobadorNombre);
      await repo.markDetailsApplied(compania, solicitudId);
      await finalizarProcesamientoSinFilas(compania, solicitudId, totalFilas, 0, input.aprobadorNombre);
      return;
    }

    // Descuento por Artículo-Lista: procesar en lotes
    if (proceso === "DESCUENTO_LISTA_PRECIO" && !esModoDemo()) {
      console.info("[DESCUENTO_ARTICULO_LISTA] Iniciando procesamiento por lotes", { solicitudId, totalFilas });
      const resultado = await pricingRepository.upsertArticleListFactorsBatched(compania, solicitudId, input.aprobadorNombre);
      await repo.markDetailsApplied(compania, solicitudId);
      console.info("[DESCUENTO_ARTICULO_LISTA] Procesamiento completado", { ...resultado });
      await finalizarProcesamientoSinFilas(compania, solicitudId, resultado.total, resultado.fallidos, input.aprobadorNombre);
      return;
    }

    // Precio Base (MAYOREOD): procesar en lotes
    if (proceso === "MAYOREOD_MASIVO" && !esModoDemo()) {
      console.info("[PRECIO_BASE] Iniciando procesamiento por lotes", { solicitudId, totalFilas });
      const resultado = await pricingRepository.updateBasePricesBatched(compania, solicitudId, input.aprobadorNombre);
      console.info("[PRECIO_BASE] Procesamiento completado", { ...resultado });
      await finalizarProcesamientoSinFilas(compania, solicitudId, resultado.total, resultado.fallidos, input.aprobadorNombre);
      return;
    }

    // Margen de Utilidad: procesar en lotes
    if (proceso === "MARGEN_UTILIDAD_MASIVO" && !esModoDemo()) {
      console.info("[MARGEN_UTILIDAD] Iniciando procesamiento por lotes", { solicitudId, totalFilas });
      const resultado = await pricingRepository.upsertUdfsBatched(compania, solicitudId, input.aprobadorNombre);
      await repo.markDetailsApplied(compania, solicitudId);
      console.info("[MARGEN_UTILIDAD] Procesamiento completado", { ...resultado });
      await finalizarProcesamientoSinFilas(compania, solicitudId, resultado.total, resultado.fallidos, input.aprobadorNombre);
      return;
    }

    // Fallback: modo demo o proceso no reconocido
    console.info("[APROBAR] Ejecutando simulación demo", { solicitudId, proceso });
    await simularProcesamientoDemo(compania, solicitudId);
  } catch (error) {
    const detalle = error instanceof Error ? error.message : "Error durante el procesamiento.";
    console.error("[APROBAR] Error en procesamiento", { solicitudId, proceso, error: detalle });
    await repo.update(compania, solicitudId, { estado: "ERROR_EJECUCION", motivoRechazo: detalle });
    await repo.setDetailError(compania, solicitudId, detalle).catch((e) => {
      console.error("[APROBAR] No fue posible guardar el error en SOLICITUD_DETALLE", e);
    });
  }
}

/** Finaliza el procesamiento usando conteos en lugar de filas en memoria. */
async function finalizarProcesamientoSinFilas(
  compania: string,
  solicitudId: string,
  total: number,
  fallidos: number,
  aprobador: string,
): Promise<void> {
  if (esModoSoloLectura()) return;
  const s = await repo.findHeader(compania, solicitudId);
  if (!s) return;
  const exitosos = total - fallidos;
  const estadoFinal =
    fallidos === 0 ? "PROCESADO" : fallidos === total ? "ERROR_EJECUCION" : "PROCESADO_CON_ERRORES";
  await repo.update(compania, solicitudId, {
    estado: estadoFinal,
    resultado: {
      totalLote: total,
      exitosos,
      fallidos,
      filas: [], // No guardamos filas en memoria para solicitudes grandes
      estadoFinal,
      logS3Key: "erp-precios-logs/" + nombreArchivoS3("log-auditoria-" + solicitudId, "csv"),
      aprobadoPor: aprobador,
      aprobadoPorEmail: s.autorizadoPorEmail ?? "",
    },
    ultimaActualizacion: new Date().toLocaleString("es-CR", { hour12: false }),
  });
  await auditRepository.record({ event: "EJECUCION_FINALIZADA", user: aprobador, role: "APROBADOR", company: compania, requestId: solicitudId, processId: s.idProcesoSP });
}

/** Worker DEMO: retardo perceptible y cómputo de resultado sin tocar BD. */
async function simularProcesamientoDemo(compania: string, solicitudId: string): Promise<void> {
  const s = await repo.find(compania, solicitudId);
  if (!s) return;
  await new Promise((r) => setTimeout(r, 6000));
  const filas = [...s.filas];
  const fallidos = filas.filter((f) => !esFilaProcesable(f)).length;
  await finalizarProcesamiento(compania, solicitudId, filas, fallidos, s.autorizadoPor ?? "Aprobador");
}

async function finalizarProcesamiento(compania: string, solicitudId: string, filas: FilaResultado[], fallidos: number, aprobador: string): Promise<void> {
  if (esModoSoloLectura()) return;
  // Usar findHeader - solo necesitamos la cabecera para actualizar el estado
  const s = await repo.findHeader(compania, solicitudId);
  if (!s) return;
  const total = filas.length;
  const exitosos = total - fallidos;
  const estadoFinal =
    fallidos === 0 ? "PROCESADO" : fallidos === total ? "ERROR_EJECUCION" : "PROCESADO_CON_ERRORES";
  await repo.update(compania, solicitudId, {
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
  await auditRepository.record({ event: "EJECUCION_FINALIZADA", user: aprobador, role: "APROBADOR", company: s.compania, requestId: solicitudId, processId: s.idProcesoSP });
}

// ---------------------------------------------------------------------------
// ENVIAR BORRADOR desde "Mis solicitudes" (sin formulario): se re-prepara con lo
// capturado que guardó el borrador; precios, costos y flags se validan al enviar.
// ---------------------------------------------------------------------------
async function enviarBorradorGuardado(identidad: Identidad, compania: string, solicitudId: string) {
  const s = await repo.find(compania, solicitudId);
  if (!s || s.estado !== "BORRADOR" || s.solicitanteEmail !== identidad.email) {
    return { ok: false as const, error: "El borrador no existe, ya fue enviado o no le pertenece." };
  }
  const filas = FilaEntradaSchema.array().safeParse(s.filas);
  const parametros = SolicitudSchema.shape.parametros.safeParse(s.parametros);
  if (!filas.success || !parametros.success) {
    return { ok: false as const, error: "El borrador no tiene datos válidos. Ábralo, vuelva a cargar los datos y envíelo." };
  }
  return persistirSolicitud(
    aEnviarInput(identidad, compania, {
      proceso: s.proceso,
      modalidad: s.modalidad,
      parametros: parametros.data,
      filas: filas.data,
      archivoNombre: s.archivoNombre,
      archivoS3Key: s.archivoS3Key,
      borradorId: s.id,
    }),
    "PENDIENTE",
  );
}

// ---------------------------------------------------------------------------
// CANCELACIÓN — solicitar y decidir sobre cancelación de solicitud (DT-03)
// ---------------------------------------------------------------------------
async function solicitarCancelacion(
  compania: string,
  solicitudId: string,
  motivo: string,
  usuarioEmail: string,
  usuarioNombre: string,
  usuarioRol: Rol,
): Promise<{ ok: boolean; error?: string }> {
  if (esModoSoloLectura()) return errorSoloLectura();
  // Usar findHeader - solo necesitamos la cabecera para validar estado y email
  const s = await repo.findHeader(compania, solicitudId);
  if (!s) return { ok: false, error: "Solicitud no encontrada." };
  if (s.estado !== "PENDIENTE") {
    return { ok: false, error: "Solo se puede solicitar la cancelación de una solicitud PENDIENTE." };
  }
  if (s.solicitanteEmail !== usuarioEmail) {
    return { ok: false, error: "Solo el solicitante original puede pedir la cancelación." };
  }
  if (!motivo || motivo.trim().length === 0) {
    return { ok: false, error: "El motivo de cancelación es obligatorio." };
  }
  const actualizada = await repo.update(compania, solicitudId, {
    estado: "CANCELACION_SOLICITADA",
    motivoRechazo: motivo.trim(),
  }, ["PENDIENTE"]);
  if (!actualizada) return ESTADO_CAMBIADO;
  await auditRepository.record({ event: "CANCELACION_SOLICITADA", user: usuarioNombre, role: usuarioRol, company: s.compania, requestId: solicitudId, userEmail: usuarioEmail });
  return { ok: true };
}

async function decidirCancelacion(
  compania: string,
  solicitudId: string,
  aprobada: boolean,
  aprobadorEmail: string,
  aprobadorNombre: string,
  aprobadorRol: Rol,
): Promise<{ ok: boolean; error?: string }> {
  if (esModoSoloLectura()) return errorSoloLectura();
  // Usar findHeader - solo necesitamos la cabecera para validar estado y rol
  const s = await repo.findHeader(compania, solicitudId);
  if (!s) return { ok: false, error: "Solicitud no encontrada." };
  if (s.estado !== "CANCELACION_SOLICITADA") {
    return { ok: false, error: "La solicitud no tiene una cancelación pendiente de decisión." };
  }
  if (aprobadorRol !== "APROBADOR") {
    return { ok: false, error: "Solo un Aprobador puede decidir sobre una cancelación." };
  }
  const nuevoEstado = aprobada ? "CANCELADO" : "PENDIENTE";
  const evento = aprobada ? "CANCELACION_CONFIRMADA" : "CANCELACION_DENEGADA";
  if (!(await repo.update(compania, solicitudId, { estado: nuevoEstado }, ["CANCELACION_SOLICITADA"]))) return ESTADO_CAMBIADO;
  await auditRepository.record({ event: evento, user: aprobadorNombre, role: aprobadorRol, company: s.compania, requestId: solicitudId, userEmail: aprobadorEmail });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Servicio expuesto a los Route Handlers
// ---------------------------------------------------------------------------
const SIN_COMPANIA = { ok: false as const, error: "La sesión no tiene una compañía asignada." };
const BORRADORES_DESHABILITADOS = { ok: false as const, error: "Los borradores están deshabilitados temporalmente. Envíe la solicitud directamente." };
const NO_ENCONTRADA = { ok: false as const, error: "Solicitud no encontrada." };
const SOLO_APROBADOR = { ok: false as const, error: "Solo un Aprobador puede realizar esta acción." };
const AUTOAPROBACION = { ok: false as const, error: "No puede decidir sobre su propia solicitud (segregación de funciones)." };

/**
 * Decisiones del aprobador: la solicitud debe ser de su compañía, debe tener
 * rol APROBADOR y (salvo en cancelaciones) no puede ser el solicitante.
 */
async function validarDecision(identidad: Identidad, solicitudId: string, permitirPropia = false) {
  console.info("[validarDecision] Iniciando", { solicitudId, compania: identidad.compania });
  if (!identidad.compania) return { error: SIN_COMPANIA };
  // Para validar la decisión solo necesitamos la cabecera, no las filas
  console.info("[validarDecision] Buscando cabecera de solicitud (sin filas)...");
  const solicitud = await repo.findHeader(identidad.compania, solicitudId);
  console.info("[validarDecision] Cabecera encontrada", { encontrada: !!solicitud });
  if (!solicitud || !estaEnAmbito(identidad.compania, solicitud.compania)) return { error: NO_ENCONTRADA };
  if (identidad.rol !== "APROBADOR") return { error: SOLO_APROBADOR };
  if (!permitirPropia && solicitud.solicitanteEmail === identidad.email) return { error: AUTOAPROBACION };
  return { solicitud };
}

/**
 * La identidad (email, nombre, rol, compañía) siempre llega desde la sesion del
 * servidor; nunca desde el body.
 */
function aEnviarInput(identidad: Identidad, compania: string, input: SolicitudInput): EnviarSolicitudInput {
  return {
    proceso: input.proceso,
    modalidad: input.modalidad,
    usuarioEmail: identidad.email,
    usuarioNombre: identidad.nombre,
    usuarioRol: identidad.rol,
    compania,
    parametros: input.parametros,
    filas: input.filas,
    archivoNombre: input.archivoNombre ?? null,
    archivoS3Key: input.archivoS3Key ?? null,
    borradorId: input.borradorId ?? null,
  };
}

export const solicitudesService = {
  async catalogoGestionGlobal(identidad: Identidad) {
    if (!identidad.compania) return SIN_COMPANIA;
    const [listas, niveles] = await Promise.all([
      pricingRepository.listGlobalManagement(identidad.compania),
      pricingRepository.listPriceLevels(identidad.compania),
    ]);
    return { ok: true as const, listas, niveles };
  },

  async catalogoSolicitud(identidad: Identidad, nivel: string | undefined, incluirArticulos: boolean) {
    if (!identidad.compania) return SIN_COMPANIA;
    return { ok: true as const, ...(await obtenerCatalogoSolicitud(identidad.compania, nivel, incluirArticulos)) };
  },

  async simularGestionGlobal(identidad: Identidad, input: Omit<SimularGestionGlobalPaginadoInput, "compania">) {
    if (!identidad.compania) return SIN_COMPANIA;
    const res = await simularGestionGlobalPaginado({ ...input, compania: identidad.compania });
    return res.ok ? { ...res, ok: true as const } : { ok: false as const, error: res.error ?? "No fue posible calcular la página de impacto." };
  },

  async paginaArticulos(identidad: Identidad, nivelPrecio: string, search: string, offset: number, maxRecords: number) {
    if (!identidad.compania) return SIN_COMPANIA;
    return { ok: true as const, ...(await paginaArticulos(identidad.compania, nivelPrecio, search, offset, maxRecords)) };
  },

  async simularManual(identidad: Identidad, input: SimularManualInput) {
    if (!identidad.compania) return SIN_COMPANIA;
    const res = await simularManual({
      ...input,
      criteriosArticulo: input.criteriosArticulo as CriteriosArticulo | undefined,
      compania: identidad.compania,
    });
    return res.ok ? res : { ok: false, error: "La compañía, lista o artículo no coincide con los maestros de Softland." };
  },

  /** Parsea la plantilla Excel (previsualizacion; no toca la BD). */
  async parsearExcel(identidad: Identidad, formData: FormData) {
    if (!identidad.compania) return SIN_COMPANIA;
    formData.set("compania", identidad.compania);
    return parsearExcel(formData);
  },

  /** Bandeja: solicitudes enviadas (no borradores) de la compañía en sesion. */
  async listarBandeja(identidad: Identidad) {
    if (!identidad.compania) return SIN_COMPANIA;
    const solicitudes = (await repo.list(identidad.compania)).filter((s) => s.estado !== "BORRADOR");
    return { ok: true as const, solicitudes };
  },

  /** Bandeja paginada: solo cabeceras, sin detalle de filas. */
  async listarBandejaPaginada(identidad: Identidad, offset: number, limit: number) {
    if (!identidad.compania) return SIN_COMPANIA;
    const pagina = await repo.listPaged(identidad.compania, offset, limit);
    // Filtrar borradores del total es complicado sin un COUNT separado, pero
    // los borradores no existen en la bandeja (se crean en estado BORRADOR y
    // el repo ya filtra por estado en el service — aquí filtramos post-paginación
    // solo los que pudieran colarse por la query genérica).
    const solicitudes = pagina.solicitudes.filter((s) => s.estado !== "BORRADOR");
    return {
      ok: true as const,
      solicitudes,
      total: pagina.total,
      hasMore: pagina.hasMore,
      nextOffset: pagina.nextOffset,
    };
  },

  /** Detalle completo de una solicitud para el modal (cabecera + filas de SOLICITUD_DETALLE). */
  async obtenerSolicitudDetalle(identidad: Identidad, solicitudId: string) {
    if (!identidad.compania) return SIN_COMPANIA;
    const solicitud = await repo.find(identidad.compania, solicitudId);
    if (!solicitud) return { ok: false as const, error: "Solicitud no encontrada." };
    return { ok: true as const, solicitud };
  },

  /** Cabecera de una solicitud SIN filas de detalle (para carga inicial rápida del modal). */
  async obtenerSolicitudCabecera(identidad: Identidad, solicitudId: string) {
    if (!identidad.compania) return SIN_COMPANIA;
    const solicitud = await repo.findHeader(identidad.compania, solicitudId);
    if (!solicitud) return { ok: false as const, error: "Solicitud no encontrada." };
    return { ok: true as const, solicitud };
  },

  /** Detalle paginado de una solicitud (filas de SOLICITUD_DETALLE con offset/limit). */
  async obtenerSolicitudDetallePaginado(
    identidad: Identidad,
    solicitudId: string,
    offset: number,
    limit: number,
  ) {
    if (!identidad.compania) return SIN_COMPANIA;
    const pagina = await repo.findDetailPaged(identidad.compania, solicitudId, offset, limit);
    if (!pagina) return { ok: false as const, error: "Solicitud no encontrada." };
    return { ok: true as const, ...pagina };
  },

  /** Hallazgos paginados de una solicitud (solo filas con advertencia de margen/costo). */
  async obtenerSolicitudHallazgosPaginado(
    identidad: Identidad,
    solicitudId: string,
    offset: number,
    limit: number,
  ) {
    if (!identidad.compania) return SIN_COMPANIA;
    const pagina = await repo.findHallazgosPaged(identidad.compania, solicitudId, offset, limit);
    if (!pagina) return { ok: false as const, error: "Solicitud no encontrada." };
    return { ok: true as const, ...pagina };
  },

  /** Deja traza de que el aprobador abrió una solicitud PENDIENTE ajena. */
  async registrarRevision(identidad: Identidad, solicitudId: string) {
    const { solicitud, error } = await validarDecision(identidad, solicitudId);
    if (error) return error;
    return registrarRevision(solicitud.id, identidad.nombre, identidad.rol, solicitud.compania);
  },

  async aprobar(identidad: Identidad, solicitudId: string) {
    console.info("[solicitudesService.aprobar] Iniciando", { solicitudId, email: identidad.email });
    const { solicitud, error } = await validarDecision(identidad, solicitudId);
    console.info("[solicitudesService.aprobar] validarDecision completado", { tieneError: !!error, tieneSolicitud: !!solicitud });
    if (error) return error;
    return aprobarSolicitud({
      compania: solicitud.compania,
      solicitudId,
      aprobadorNombre: identidad.nombre,
      aprobadorEmail: identidad.email,
      aprobadorRol: identidad.rol,
    });
  },

  async reintentar(identidad: Identidad, solicitudId: string) {
    const { solicitud, error } = await validarDecision(identidad, solicitudId);
    if (error) return error;
    return aprobarSolicitud({
      compania: solicitud.compania,
      solicitudId,
      aprobadorNombre: identidad.nombre,
      aprobadorEmail: identidad.email,
      aprobadorRol: identidad.rol,
      reintento: true,
    });
  },

  async rechazar(identidad: Identidad, solicitudId: string, input: RechazoInput) {
    const { solicitud, error } = await validarDecision(identidad, solicitudId);
    if (error) return error;
    return rechazarSolicitud(solicitud.compania, solicitudId, input.motivo, identidad.nombre, identidad.rol);
  },

  async decidirCancelacion(identidad: Identidad, solicitudId: string, input: DecisionCancelacionInput) {
    const { solicitud, error } = await validarDecision(identidad, solicitudId, true);
    if (error) return error;
    return decidirCancelacion(solicitud.compania, solicitudId, input.aprobada, identidad.email, identidad.nombre, identidad.rol);
  },

  async listarMias(identidad: Identidad, proceso?: ProcesoKey) {
    if (!identidad.compania) return SIN_COMPANIA;
    const solicitudes = (await repo.list(identidad.compania)).filter(
      (s) => s.solicitanteEmail === identidad.email && (!proceso || s.proceso === proceso),
    );
    return { ok: true as const, solicitudes };
  },

  async listarMiasPaginado(identidad: Identidad, proceso: ProcesoKey | undefined, offset: number, limit: number) {
    if (!identidad.compania) return SIN_COMPANIA;
    // Filtra por email y proceso directamente en SQL — una sola query, sin post-filtrado en Node.js
    const pagina = await repo.listPaged(identidad.compania, offset, limit, identidad.email, proceso ?? null);
    return {
      ok: true as const,
      solicitudes: pagina.solicitudes,
      total: pagina.total,
      hasMore: pagina.hasMore,
      nextOffset: pagina.nextOffset,
    };
  },

  /** Envía una solicitud nueva o, con `borradorId`, el borrador retomado con lo editado. */
  async enviar(identidad: Identidad, input: SolicitudInput) {
    if (input.borradorId && !BORRADORES_HABILITADOS) return BORRADORES_DESHABILITADOS;
    if (!identidad.compania) return SIN_COMPANIA;
    return persistirSolicitud(aEnviarInput(identidad, identidad.compania, input), "PENDIENTE");
  },

  /** Crea un borrador o, con `borradorId`, actualiza el existente. */
  async guardarBorrador(identidad: Identidad, input: SolicitudInput) {
    if (!BORRADORES_HABILITADOS) return BORRADORES_DESHABILITADOS;
    if (!identidad.compania) return SIN_COMPANIA;
    return persistirSolicitud(aEnviarInput(identidad, identidad.compania, input), "BORRADOR");
  },

  async enviarBorrador(identidad: Identidad, solicitudId: string) {
    if (!BORRADORES_HABILITADOS) return BORRADORES_DESHABILITADOS;
    if (!identidad.compania) return SIN_COMPANIA;
    return enviarBorradorGuardado(identidad, identidad.compania, solicitudId);
  },

  async solicitarCancelacion(identidad: Identidad, solicitudId: string, input: CancelacionInput) {
    if (!identidad.compania) return SIN_COMPANIA;
    return solicitarCancelacion(identidad.compania, solicitudId, input.motivo, identidad.email, identidad.nombre, identidad.rol);
  },
};

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Construye la fila resumen que se persiste en SOLICITUD_DETALLE para una
 * solicitud de Gestión Global. El detalle artículo por artículo es informativo
 * y se consulta en tiempo real desde Softland al abrir el modal.
 *
 * Campos sin sentido para este proceso (precio por artículo, costo) reciben
 * valores neutros (0 / null) que satisfacen los constraints NOT NULL de BD.
 */
function construirFilaResumenGestionGlobal(
  parametros: ParametrosSolicitud,
  lista: string,
): FilaPrecio {
  const factor = Number(parametros.factor ?? 0);
  const multiplicador = Number(
    parametros.multiplicador ?? (1 + factor / 100),
  );
  const tipo =
    parametros.tipoVariacion === "DISMINUCION" ? "DISMINUCION" : "AUMENTO";
  const descripcion =
    `Gestión Global · ${lista} · ${tipo} ${factor}%`.slice(0, 200);

  return {
    fila: 1,
    codigo: "GESTION_GLOBAL",
    descripcion,
    lista,
    listaCodigo: lista,
    tipoVariacion: tipo,
    variacionPorcentaje: factor,
    valorPropuestoRaw: String(multiplicador),
    factorPropuesto: multiplicador,
    multiplicador,
    precioCalculado: 0,
    validacion: {
      valido: true,
      precioActual: 0,
      precioPropuesto: 0,
      factorPropuesto: multiplicador,
      precioRedondeado: 0,
      estadoRedondeo: null,
      bandaRedondeo: null,
      margenMinimo: null,
      costoMinimo: null,
      costo: 0,
      precioMin: null,
      causa: null,
    },
  };
}
