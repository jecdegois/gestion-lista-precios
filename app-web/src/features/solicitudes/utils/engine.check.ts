/**
 * Self-check del recálculo de filas en servidor (sin framework de tests).
 * Ejecutar desde app-web: node -e "require('jiti')(process.cwd(), { alias: { '@': process.cwd() + '/src' } })('./src/features/solicitudes/utils/engine.check.ts')"
 */
import assert from "node:assert/strict";
import { FilaEntradaSchema } from "../schemas/solicitud-schema";
import { calcularVariacion, construirFilaSolicitud, type CatalogoContext } from "./engine";
import { esFilaProcesable } from "../../../shared/types/domain-types";

const contexto: CatalogoContext = {
  articulos: {
    A1: {
      codigo: "A1", descripcion: "Art 1", precioActual: 100, costoReposicion: 80, margenUtilidadMin: 0.2,
      categoria: "", subcategoria: "", grupo: "", marca: "", marcaGrupoCompra: "", bdf: "",
    },
  },
  nombresLista: { L1: "L1" },
  grupos: {},
  listaBase: { codigo: "L1", nombre: "L1", nivelPrecio: "L1" },
};

// El cliente no puede colar validacion/precios: el schema solo deja lo capturado.
const entrada = FilaEntradaSchema.parse({ codigo: "A1", valorPropuestoRaw: "5", validacion: { valido: true, precioPropuesto: 999 } });
assert.equal("validacion" in entrada, false);

// Precio Base: 5 < precio mínimo (80 / 0.8 = 100) -> ALERTA_MARGEN, precio = el capturado.
const base = construirFilaSolicitud("MAYOREOD_MASIVO", "excel", entrada, contexto);
assert.equal(base.validacion.estadoRedondeo, "ALERTA_MARGEN");
assert.equal(base.validacion.precioPropuesto, 5);

// Descuento Excel y manual dan el mismo multiplicador (10% -> 0.9).
const excel = construirFilaSolicitud("DESCUENTO_LISTA_PRECIO", "excel", { codigo: "A1", listaCodigo: "L1", variacionPorcentaje: "10" }, contexto);
const manual = construirFilaSolicitud("DESCUENTO_LISTA_PRECIO", "manual", { codigo: "A1", listaCodigo: "L1", tipoVariacion: "DISMINUCION", variacionPorcentaje: "10" }, contexto);
assert.ok("multiplicador" in excel && "multiplicador" in manual);
assert.equal(excel.multiplicador, 0.9);
assert.equal(manual.multiplicador, 0.9);

// Margen: el porcentaje se recalcula desde lo capturado.
const margen = construirFilaSolicitud("MARGEN_UTILIDAD_MASIVO", "excel", { codigo: "A1", porcentajeReduccion: 150 }, contexto);
assert.equal(margen.validacion.valido, false);

// Gestión Global: DISMINUCION baja el factor (antes se aplicaba como aumento).
assert.equal(calcularVariacion("DISMINUCION", "10").factor, 0.9);
assert.equal(calcularVariacion("AUMENTO", "10").factor, 1.1);

// Carga parcial: el hallazgo de margen se procesa (lo bloquea solo el flag de la lista);
// código inexistente y lista inválida se descartan.
assert.equal(esFilaProcesable(base), true);
assert.equal(esFilaProcesable(construirFilaSolicitud("MAYOREOD_MASIVO", "excel", { codigo: "NOEXISTE", valorPropuestoRaw: "5" }, contexto)), false);
const listaMala = construirFilaSolicitud("DESCUENTO_LISTA_PRECIO", "excel", { codigo: "A1", listaCodigo: "XX", variacionPorcentaje: "90" }, contexto);
assert.equal(esFilaProcesable(listaMala), false);
assert.equal(esFilaProcesable(margen), false);

console.log("engine.check OK");
