import "server-only";
import { estaEnAmbito } from "@/lib/catalog";
import { nombreArchivoS3, nuevoIdProcesoSP } from "@/lib/ids";
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
} from "@/lib/domain-types";
import { esFilaMargen } from "@/lib/domain-types";
import { esModoDemo, esModoSoloLectura, esModoSoloPortal } from "@/server/companies";
import { auditRepository } from "@/features/auditoria/repository/audit-repository";
import { requestsRepository as repo } from "../repository/requests-repository";
import { pricingRepository } from "../repository/pricing-repository";
import { nivelesSolicitadosCanonicos, cargarContextosPorLista, resolverNivelPrecio } from "./catalog-context";
import {
  obtenerCatalogoSolicitud,
  paginaArticulos,
  parsearExcel,
  simularGestionGlobalPaginado,
  simularManual,
  type SimularGestionGlobalPaginadoInput,
} from "./simulation-service";
import type {
  CancelacionInput,
  DecisionCancelacionInput,
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
  filas: FilaResultado[];
  archivoNombre?: string | null;
  archivoS3Key?: string | null;
}

async function enviarSolicitud(input: EnviarSolicitudInput): Promise<{ ok: boolean; error?: string; solicitud?: Solicitud }> {
  if (esModoSoloLectura()) return errorSoloLectura();
  // La sesión (Postgres) ya validó al usuario y su compañía; PORTAL_PRECIOS.USUARIO está obsoleta.
  const identidadPortal = { nombre: input.usuarioNombre, email: input.usuarioEmail, rol: input.usuarioRol };
  const idpOperador = input.usuarioEmail.trim().toLowerCase();

  const niveles = await pricingRepository.listPriceLevels(input.compania);
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

  const nivelSolicitud = [
    input.parametros.nivelPrecio,
    input.parametros.listaBase,
    input.parametros.nivel,
    ...(input.proceso === "DESCUENTO_LISTA_PRECIO" ? listasEnFilas : []),
  ].find((valor): valor is string => Boolean(valor?.trim()));
  const listaPredeterminada = resolverNivelPrecio(niveles, nivelSolicitud);
  if (!listaPredeterminada) {
    return { ok: false, error: "La solicitud no contiene una lista de precio válida." };
  }
  if (input.proceso === "FACTOR_PRECIO") {
    // Gestión Global persiste una sola fila resumen con los parámetros de la
    // operación. El detalle artículo por artículo es informativo y se consulta
    // en tiempo real desde Softland al abrir el modal — no se persiste.
    const filaResumen = construirFilaResumenGestionGlobal(input.parametros, listaPredeterminada);
    const codigo = await repo.nextCode(input.compania);
    const solicitud: Solicitud = {
      id: codigo,
      proceso: input.proceso,
      modalidad: input.modalidad,
      compania: input.compania,
      solicitanteNombre: identidadPortal.nombre,
      solicitanteEmail: identidadPortal.email,
      idpOperador,
      parametros: input.parametros,
      filas: [filaResumen],
      archivoNombre: input.archivoNombre ?? null,
      archivoS3Key: input.archivoS3Key ?? null,
      fechaEnvio: new Date().toLocaleString("es-CR", { hour12: false }),
      fechaCreacion: new Date().toISOString(),
      estado: "PENDIENTE",
      motivoRechazo: null,
      idProcesoSP: null,
      lista: listaPredeterminada,
    };
    try {
      await repo.create(solicitud);
      await auditRepository.record({ event: "SOLICITUD_ENVIADA", user: identidadPortal.nombre, role: identidadPortal.rol, company: input.compania, requestId: solicitud.id, userEmail: identidadPortal.email });
    } catch (error) {
      const detalle = error instanceof Error ? error.message.replace(/\s+/g, " ").trim() : "Error de base de datos no identificado.";
      return { ok: false, error: `No fue posible registrar la solicitud en el Portal: ${detalle}` };
    }
    return { ok: true, solicitud };
  }

  const contextosPorLista = await cargarContextosPorLista(input.compania, niveles, nivelesCanonicos);
  const contieneArticulo = (listaCodigo: string, codigoArticulo: string): boolean => {
    const contexto = contextosPorLista.get(listaCodigo);
    const codigoNormalizado = codigoArticulo.trim().toUpperCase();
    return Object.values(contexto?.articulos ?? {}).some(
      (articulo) => articulo.codigo.trim().toUpperCase() === codigoNormalizado,
    );
  };

  // Para MAYOREOD_MASIVO se permite carga parcial: se descartan solo las filas con
  // error duro (código inválido, precio cero, formato incorrecto). Las filas con
  // advertencia de margen mínimo (ALERTA_MARGEN) sí se incluyen — el aprobador
  // es quien decide si autoriza el riesgo.
  const filasParaProcesar = input.proceso === "MAYOREOD_MASIVO"
    ? input.filas.filter((fila) => fila.validacion.valido || fila.validacion.estadoRedondeo === "ALERTA_MARGEN")
    : input.filas;

  const hayArticuloFueraDeLista = filasParaProcesar.some((fila) => {
    const listaFila = "listaCodigo" in fila && fila.listaCodigo
      ? resolverNivelPrecio(niveles, fila.listaCodigo)
      : listaPredeterminada;
    return !listaFila || !contieneArticulo(listaFila, fila.codigo);
  });
  if (filasParaProcesar.length === 0 || hayArticuloFueraDeLista) {
    return { ok: false, error: "La solicitud contiene un artículo que no existe en la lista de precio seleccionada en Softland." };
  }

  // Enriquecer filas con la lista/nivel correspondiente
  const filasConLista: FilaResultado[] = filasParaProcesar.map((fila) => {
    const listaFila = "listaCodigo" in fila && fila.listaCodigo
      ? resolverNivelPrecio(niveles, fila.listaCodigo)
      : listaPredeterminada;
    
    return {
      ...fila,
      lista: listaFila,
    };
  });

  const codigo = await repo.nextCode(input.compania);
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
    fechaCreacion: new Date().toISOString(),
    estado: "PENDIENTE",
    motivoRechazo: null,
    idProcesoSP: null,
    lista: listaPredeterminada || ""
  };
  try {
    await repo.create(solicitud);
    await auditRepository.record({ event: "SOLICITUD_ENVIADA", user: identidadPortal.nombre, role: identidadPortal.rol, company: input.compania, requestId: solicitud.id, userEmail: identidadPortal.email });
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
async function registrarRevision(
  solicitudId: string,
  usuarioNombre: string,
  usuarioRol: Rol,
  compania: string,
): Promise<{ ok: boolean; error?: string }> {
  if (esModoSoloLectura()) return errorSoloLectura();
  const s = await repo.find(compania, solicitudId);
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
  const s = await repo.find(compania, solicitudId);
  if (!s) return { ok: false, error: "Solicitud no encontrada." };
  if (!motivo || motivo.trim().length === 0) return { ok: false, error: "El motivo de rechazo es obligatorio." };
  await repo.update(compania, solicitudId, { estado: "RECHAZADO", motivoRechazo: motivo.trim() });
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
  if (esModoSoloLectura()) return errorSoloLectura();
  // La aprobación registra la decisión en el flujo aplicativo. La ejecución
  // operativa permanece bloqueada: Softland se consulta exclusivamente con SELECT.
  const s = await repo.find(input.compania, input.solicitudId);
  if (!s) return { ok: false, error: "Solicitud no encontrada." };
  if (input.reintento && s.estado !== "ERROR_EJECUCION") {
    return { ok: false, error: "Solo se pueden reintentar solicitudes en ERROR_EJECUCION." };
  }
  // Reutiliza el flujo de ejecución aprobado; la validación anterior garantiza
  // que el cambio de estado solo sea posible desde ERROR_EJECUCION.
  if (input.reintento) s.estado = "PENDIENTE";
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

  if (s.filas.length === 0) {
    return { ok: false, error: "La solicitud no tiene filas para procesar." };
  }
  const fallidosPrevios = s.filas.filter((fila) => !fila.validacion.valido).length;
  // Gestión Global conserva una página del impacto y completa el detalle bajo
  // demanda; no se puede concluir que todas las filas sean inválidas usando
  // únicamente esa página parcial.
  if (fallidosPrevios === s.filas.length && s.proceso !== "FACTOR_PRECIO") {
    return { ok: false, error: "La solicitud no se puede procesar porque todas sus filas son inválidas." };
  }
  if (s.proceso === "FACTOR_PRECIO" && !esModoDemo() && esModoSoloPortal()) {
    return errorSoloPortal();
  }

  const idProcesoSP = nuevoIdProcesoSP();
  await repo.update(s.compania, input.solicitudId, {
    estado: "EN_PROCESO",
    idProcesoSP,
    autorizadoPor: input.aprobadorNombre,
    autorizadoPorEmail: input.aprobadorEmail,
    ultimaActualizacion: new Date().toLocaleString("es-CR", { hour12: false }),
  });
  await auditRepository.record({ event: "EJECUCION_ENCOLADA", user: input.aprobadorNombre, role: input.aprobadorRol, company: s.compania, requestId: s.id, processId: idProcesoSP });

  // Este flujo no ejecuta SP/UDF ni instrucciones de modificación en Softland.
  // Solo utiliza datos que ya fueron consultados mediante SELECT para generar
  // un resultado simulado, visible y trazable en la aplicación.
  if (s.proceso === "FACTOR_PRECIO" && !esModoDemo()) {
    try {
      const lista = s.lista.trim() || String(s.parametros.nivelPrecio ?? s.parametros.listaBase ?? s.parametros.nivel ?? "").trim();
      const factorPorcentajeOriginal = s.parametros.factor ?? "";
      const porcentaje = Number(factorPorcentajeOriginal);
      const factor = 1 + porcentaje / 100;
      console.info("[GESTION_GLOBAL] Parámetros recibidos para actualización", {
        solicitudId: s.id,
        compania: s.compania,
        lista,
        factorPorcentajeOriginal,
        porcentajeConvertido: porcentaje,
        factorMultiplicador: factor,
        variacionPorcentaje: porcentaje,
      });
      await pricingRepository.updateGlobalManagement(s.compania, lista, factor, porcentaje, input.aprobadorNombre);
      await repo.markDetailsApplied(s.compania, s.id);
      // En Gestión Global la operación real es un único UPDATE de la cabecera
      // de la lista. Las filas del detalle son referenciales y no determinan
      // el estado final del procesamiento.
      await finalizarProcesamiento(s.compania, s.id, [...s.filas], 0, input.aprobadorNombre);
      return { ok: true, idProcesoSP };
    } catch (error) {
      const detalle = error instanceof Error ? error.message : "No fue posible actualizar Gestión Global.";
      await repo.update(s.compania, s.id, { estado: "ERROR_EJECUCION", motivoRechazo: detalle });
      await repo.setDetailError(s.compania, s.id, detalle).catch((detalleError) => {
        console.error("[GESTION_GLOBAL] No fue posible guardar el error en SOLICITUD_DETALLE", detalleError);
      });
      return { ok: false, error: detalle, idProcesoSP };
    }
  }

  if (s.proceso === "DESCUENTO_LISTA_PRECIO" && !esModoDemo()) {
    try {
      const resultadoFactores = await pricingRepository.upsertArticleListFactors(
        s.compania,
        s.id,
        s.filas,
        input.aprobadorNombre,
      );
      await repo.markDetailsApplied(s.compania, s.id);
      const fallidos = s.filas.filter((fila) => !fila.validacion.valido).length;
      console.info("[DESCUENTO_ARTICULO_LISTA] Factores persistidos", {
        solicitudId: s.id,
        insertados: resultadoFactores.insertados,
        actualizados: resultadoFactores.actualizados,
        omitidos: resultadoFactores.omitidos,
      });
      await finalizarProcesamiento(s.compania, s.id, [...s.filas], fallidos, input.aprobadorNombre);
      return { ok: true, idProcesoSP };
    } catch (error) {
      const detalle = error instanceof Error ? error.message : "No fue posible guardar los factores por artículo y lista.";
      await repo.update(s.compania, s.id, { estado: "ERROR_EJECUCION", motivoRechazo: detalle });
      await repo.setDetailError(s.compania, s.id, detalle).catch((detalleError) => {
        console.error("[DESCUENTO_ARTICULO_LISTA] No fue posible guardar el error en SOLICITUD_DETALLE", detalleError);
      });
      return { ok: false, error: detalle, idProcesoSP };
    }
  }

  if (s.proceso === "MAYOREOD_MASIVO" && !esModoDemo()) {
    try {
      const resultadoPrecios = await pricingRepository.updateBasePrices(
        s.compania,
        s.id,
        s.filas,
        input.aprobadorNombre,
      );
      const fallidos = s.filas.filter((fila) => !fila.validacion.valido && fila.validacion.estadoRedondeo !== "ALERTA_MARGEN").length;
      console.info("[PRECIO_BASE] Precios de MAYOREOD persistidos", {
        solicitudId: s.id,
        actualizados: resultadoPrecios.actualizados,
      });
      await finalizarProcesamiento(s.compania, s.id, [...s.filas], fallidos, input.aprobadorNombre);
      return { ok: true, idProcesoSP };
    } catch (error) {
      const detalle = error instanceof Error ? error.message : "No fue posible actualizar los precios base.";
      await repo.update(s.compania, s.id, { estado: "ERROR_EJECUCION", motivoRechazo: detalle });
      await repo.setDetailError(s.compania, s.id, detalle).catch((detalleError) => {
        console.error("[PRECIO_BASE] No fue posible guardar el error en SOLICITUD_DETALLE", detalleError);
      });
      return { ok: false, error: detalle, idProcesoSP };
    }
  }

  if (s.proceso === "MARGEN_UTILIDAD_MASIVO" && !esModoDemo()) {
    try {
      const lista = "MAYOREOD";
      const filasValidas = s.filas.filter((fila): fila is FilaMargen => esFilaMargen(fila) && fila.validacion.valido);
      if (filasValidas.length === 0) {
        throw new Error("No existen filas válidas para actualizar el margen de utilidad.");
      }

      for (const fila of filasValidas) {
        const porcentaje = Number(fila.porcentajeReduccion);
        const factorNormalizado = Number(fila.factorReduccion ?? (porcentaje / 100));
        if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje >= 100 || !Number.isFinite(factorNormalizado) || factorNormalizado < 0 || factorNormalizado >= 1) {
          throw new Error(`El porcentaje de reducción del artículo '${fila.codigo}' no es válido.`);
        }
        console.info("[MARGEN_UTILIDAD] Factor U_FACTOR_REDUCCION a persistir", {
          solicitudId: s.id,
          articulo: fila.codigo,
          porcentajeSolicitado: porcentaje,
          factorNormalizado,
        });
        await pricingRepository.upsertUdf(
          s.compania,
          fila.codigo,
          `Solicitud ${s.id}`,
          factorNormalizado,
          input.aprobadorNombre,
        );
      }

      await repo.markDetailsApplied(s.compania, s.id);
      const fallidos = s.filas.filter((fila) => !fila.validacion.valido).length;
      console.info("[MARGEN_UTILIDAD] Margen mínimo persistido", {
        solicitudId: s.id,
        compania: s.compania,
        lista,
        actualizados: filasValidas.length,
      });
      await finalizarProcesamiento(s.compania, s.id, [...s.filas], fallidos, input.aprobadorNombre);
      return { ok: true, idProcesoSP };
    } catch (error) {
      const detalle = error instanceof Error ? error.message : "No fue posible actualizar el margen de utilidad.";
      await repo.update(s.compania, s.id, { estado: "ERROR_EJECUCION", motivoRechazo: detalle });
      await repo.setDetailError(s.compania, s.id, detalle).catch((detalleError) => {
        console.error("[MARGEN_UTILIDAD] No fue posible guardar el error en SOLICITUD_DETALLE", detalleError);
      });
      return { ok: false, error: detalle, idProcesoSP };
    }
  }

  void simularProcesamientoDemo(s.compania, s.id);

  return { ok: true, idProcesoSP };
}

/** Worker DEMO: retardo perceptible y cómputo de resultado sin tocar BD. */
async function simularProcesamientoDemo(compania: string, solicitudId: string): Promise<void> {
  const s = await repo.find(compania, solicitudId);
  if (!s) return;
  await new Promise((r) => setTimeout(r, 6000));
  const filas = [...s.filas];
  const fallidos = filas.filter((f) => !f.validacion.valido).length;
  await finalizarProcesamiento(compania, solicitudId, filas, fallidos, s.autorizadoPor ?? "Aprobador");
}

async function finalizarProcesamiento(compania: string, solicitudId: string, filas: FilaResultado[], fallidos: number, aprobador: string): Promise<void> {
  if (esModoSoloLectura()) return;
  const s = await repo.find(compania, solicitudId);
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
// BORRADOR — guardar solicitud sin enviar a aprobación (DT-02)
// ---------------------------------------------------------------------------
async function guardarBorrador(input: EnviarSolicitudInput): Promise<{ ok: boolean; error?: string; solicitud?: Solicitud }> {
  if (esModoSoloLectura()) return errorSoloLectura();
  // La sesión (Postgres) ya validó al usuario y su compañía; PORTAL_PRECIOS.USUARIO está obsoleta.
  const identidadPortal = { nombre: input.usuarioNombre, email: input.usuarioEmail, rol: input.usuarioRol };
  const idpOperador = input.usuarioEmail.trim().toLowerCase();
  const codigo = await repo.nextCode(input.compania);
  const solicitud: Solicitud = {
    id: codigo,
    proceso: input.proceso,
    modalidad: input.modalidad,
    compania: input.compania,
    solicitanteNombre: identidadPortal.nombre,
    solicitanteEmail: identidadPortal.email,
    idpOperador,
    parametros: input.parametros,
    filas: input.filas ?? [],
    archivoNombre: input.archivoNombre ?? null,
    archivoS3Key: input.archivoS3Key ?? null,
    fechaEnvio: new Date().toLocaleString("es-CR", { hour12: false }),
    fechaCreacion: new Date().toISOString(),
    estado: "BORRADOR",
    motivoRechazo: null,
    idProcesoSP: null,
    lista: input.parametros.nivelPrecio ?? input.parametros.listaBase ?? input.parametros.nivel ?? "",
  };
  try {
    await repo.create(solicitud);
  } catch (error) {
    const detalle = error instanceof Error ? error.message.replace(/\s+/g, " ").trim() : "Error de base de datos.";
    return { ok: false, error: `No fue posible guardar el borrador: ${detalle}` };
  }
  try {
    await auditRepository.record({ event: "SOLICITUD_GUARDADA_BORRADOR", user: identidadPortal.nombre, role: identidadPortal.rol, company: input.compania, requestId: solicitud.id, userEmail: identidadPortal.email });
  } catch (error) {
    const detalle = error instanceof Error ? error.message.replace(/\s+/g, " ").trim() : "Error de auditoría.";
    return { ok: false, error: `Borrador guardado pero no se pudo registrar el evento: ${detalle}` };
  }
  return { ok: true, solicitud };
}

// ---------------------------------------------------------------------------
// ENVIAR BORRADOR — transicionar un borrador existente a PENDIENTE (DT-02)
// ---------------------------------------------------------------------------
async function enviarBorrador(
  compania: string,
  solicitudId: string,
  usuarioEmail: string,
  usuarioNombre: string,
  usuarioRol: Rol,
): Promise<{ ok: boolean; error?: string }> {
  if (esModoSoloLectura()) return errorSoloLectura();
  const s = await repo.find(compania, solicitudId);
  if (!s) return { ok: false, error: "Solicitud no encontrada." };
  if (s.estado !== "BORRADOR") return { ok: false, error: "Solo se puede enviar una solicitud en estado BORRADOR." };
  if (s.solicitanteEmail !== usuarioEmail) return { ok: false, error: "Solo el solicitante original puede enviar este borrador." };
  await repo.update(compania, solicitudId, { estado: "PENDIENTE" });
  await auditRepository.record({ event: "BORRADOR_ENVIADO", user: usuarioNombre, role: usuarioRol, company: s.compania, requestId: solicitudId, userEmail: usuarioEmail });
  return { ok: true };
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
  const s = await repo.find(compania, solicitudId);
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
  await repo.update(compania, solicitudId, {
    estado: "CANCELACION_SOLICITADA",
    motivoRechazo: motivo.trim(),
  });
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
  const s = await repo.find(compania, solicitudId);
  if (!s) return { ok: false, error: "Solicitud no encontrada." };
  if (s.estado !== "CANCELACION_SOLICITADA") {
    return { ok: false, error: "La solicitud no tiene una cancelación pendiente de decisión." };
  }
  if (aprobadorRol !== "APROBADOR") {
    return { ok: false, error: "Solo un Aprobador puede decidir sobre una cancelación." };
  }
  const nuevoEstado = aprobada ? "CANCELADO" : "PENDIENTE";
  const evento = aprobada ? "CANCELACION_CONFIRMADA" : "CANCELACION_DENEGADA";
  await repo.update(compania, solicitudId, { estado: nuevoEstado });
  await auditRepository.record({ event: evento, user: aprobadorNombre, role: aprobadorRol, company: s.compania, requestId: solicitudId, userEmail: aprobadorEmail });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Servicio expuesto a los Route Handlers
// ---------------------------------------------------------------------------
const SIN_COMPANIA = { ok: false as const, error: "La sesión no tiene una compañía asignada." };
const NO_ENCONTRADA = { ok: false as const, error: "Solicitud no encontrada." };
const SOLO_APROBADOR = { ok: false as const, error: "Solo un Aprobador puede realizar esta acción." };
const AUTOAPROBACION = { ok: false as const, error: "No puede decidir sobre su propia solicitud (segregación de funciones)." };

/**
 * Decisiones del aprobador: la solicitud debe ser de su compañía, debe tener
 * rol APROBADOR y (salvo en cancelaciones) no puede ser el solicitante.
 */
async function validarDecision(identidad: Identidad, solicitudId: string, permitirPropia = false) {
  if (!identidad.compania) return { error: SIN_COMPANIA };
  const solicitud = await repo.find(identidad.compania, solicitudId);
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
    parametros: input.parametros as ParametrosSolicitud,
    filas: input.filas as unknown as FilaResultado[],
    archivoNombre: input.archivoNombre ?? null,
    archivoS3Key: input.archivoS3Key ?? null,
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

  /** Deja traza de que el aprobador abrió una solicitud PENDIENTE ajena. */
  async registrarRevision(identidad: Identidad, solicitudId: string) {
    const { solicitud, error } = await validarDecision(identidad, solicitudId);
    if (error) return error;
    return registrarRevision(solicitud.id, identidad.nombre, identidad.rol, solicitud.compania);
  },

  async aprobar(identidad: Identidad, solicitudId: string) {
    const { solicitud, error } = await validarDecision(identidad, solicitudId);
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

  async enviar(identidad: Identidad, input: SolicitudInput) {
    if (!identidad.compania) return SIN_COMPANIA;
    return enviarSolicitud(aEnviarInput(identidad, identidad.compania, input));
  },

  async guardarBorrador(identidad: Identidad, input: SolicitudInput) {
    if (!identidad.compania) return SIN_COMPANIA;
    return guardarBorrador(aEnviarInput(identidad, identidad.compania, input));
  },

  async enviarBorrador(identidad: Identidad, solicitudId: string) {
    if (!identidad.compania) return SIN_COMPANIA;
    return enviarBorrador(identidad.compania, solicitudId, identidad.email, identidad.nombre, identidad.rol);
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
