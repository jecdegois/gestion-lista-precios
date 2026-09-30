"""Procesador de la plantilla Excel de carga masiva de precios (MV26020).

Plantilla SIMPLIFICADA (sin la columna "Tipo de Variacion"):

    - Descuento por Articulo:  Lista de Precio | Codigo Articulo | Factor
    - Actualizacion Masiva:     Codigo Articulo | Factor

El usuario ya no indica si el ajuste es porcentaje o monto: se recibe el FACTOR
directo (0.95 = -5%, 1.10 = +10%). El procesador:

    1. Lee y valida cada fila (formato, factor en rango > 0 y <= 2).
    2. Calcula el precio base = precio_actual * factor_global * factor_fila.
    3. Aplica el motor de redondeo comercial (12 bandas) -> precio redondeado.
    4. Valida el margen minimo dinamico por articulo (MARGEN_UTILIDAD_MIN) con
       fallback al margen global, evaluado SOBRE EL PRECIO REDONDEADO.
    5. Marca cada fila con su estado (CALCULADO / FUERA_DE_RANGO / ALERTA_MARGEN).

El motor de redondeo es una replica exacta del algoritmo validado (27/27 casos
del informe docs/Informe_Reglas_Redondeo_Precios.md) y del usado por el SP
[FEBECA].[fn_RedondeoComercial] y el mockup React.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import List, Optional

from .dtos import EstadoRedondeo, FilaCargaExcel, FilaFactorReduccionMargen, MotivoRechazo


# ---------------------------------------------------------------------------
# Motor de redondeo comercial (12 bandas) - replica del oraculo validado
# ---------------------------------------------------------------------------
# (numero, desde, hasta, tipo, paso, periodo, offsets, precio_fijo)
_BANDAS = [
    (1, 0.01, 0.50, "exceso", 0.01, None, None, None),
    (2, 0.51, 1.00, "exceso", 0.05, None, None, None),
    (3, 1.01, 2.50, "exceso", 0.10, None, None, None),
    (4, 2.51, 4.75, "exceso", 0.25, None, None, None),
    (5, 4.76, 5.15, "unico", None, None, None, 4.99),
    (6, 5.16, 10.15, "terminal", None, 1, [0.29, 0.49, 0.69, 0.99], None),
    (7, 10.16, 50.24, "terminal", None, 1, [0.49, 0.99], None),
    (8, 50.25, 99.99, "terminal", None, 1, [0.99], None),
    (9, 100.0, 500.0, "terminal", None, 10, [3, 5, 7, 9], None),
    (10, 501.0, 1000.0, "terminal", None, 10, [0, 5], None),
    (11, 1001.0, 5000.0, "terminal", None, 100, [30, 50, 70, 90], None),
    (12, 5001.0, 100000.0, "terminal", None, 100, [50, 90], None),
]
_MIN_P, _MAX_P = 0.01, 100000.0


def _round2(x: float) -> float:
    return round(x + 1e-12, 2)


def clasificar_banda(precio: float) -> Optional[tuple]:
    if precio is None or precio < _MIN_P or precio > _MAX_P:
        return None
    n = 1
    for banda in _BANDAS[:-1]:
        if precio > banda[2]:
            n += 1
    return _BANDAS[n - 1]


def redondear_precio_comercial(precio: float) -> Optional[float]:
    """Devuelve el precio redondeado o None si esta fuera de rango."""
    banda = clasificar_banda(precio)
    if banda is None:
        return None
    _, _, _, tipo, paso, periodo, offsets, fijo = banda
    if tipo == "exceso":
        return _round2(math.ceil(round(precio / paso, 9)) * paso)
    if tipo == "unico":
        return _round2(fijo)
    # terminal mas cercano
    d = periodo
    j = math.floor(precio / d) * d
    inferiores = [(j + o) if (j + o) <= precio else (j - d + o) for o in offsets]
    superiores = [(j + o) if (j + o) >= precio else (j + d + o) for o in offsets]
    s, t = max(inferiores), min(superiores)
    # empate -> superior (< estricto)
    return _round2(s if round(precio - s, 6) < round(t - precio, 6) else t)


# ---------------------------------------------------------------------------
# Resultado del procesamiento de una fila
# ---------------------------------------------------------------------------
@dataclass
class FilaProcesada:
    fila: FilaCargaExcel
    precio_actual: Optional[float] = None
    precio_calculado: Optional[float] = None       # base, antes de redondear
    precio_redondeado: Optional[float] = None       # tras el motor de 12 bandas
    costo_prom_dol: Optional[float] = None
    margen_minimo_efectivo: Optional[float] = None
    margen_calculado: Optional[float] = None
    estado: Optional[EstadoRedondeo] = None
    motivo_rechazo: Optional[MotivoRechazo] = None
    valido: bool = True
    causa: Optional[str] = None


@dataclass
class ArticuloContext:
    """Datos del articulo necesarios para calcular precio y margen."""

    codigo: str
    precio_actual: float
    costo_prom_dol: float
    margen_utilidad_min: Optional[float] = None  # por articulo; None => usar global


# ---------------------------------------------------------------------------
# Procesador
# ---------------------------------------------------------------------------
class ExcelProcessor:
    """Procesa filas de la plantilla simplificada (sin Tipo de Variacion)."""

    def __init__(
        self,
        factor_global: float = 1.0,
        margen_minimo_global: float = 0.0,
        aplicar_redondeo: bool = True,
        validar_precio_bajo_costo: bool = True,
    ) -> None:
        self.factor_global = factor_global
        self.margen_minimo_global = margen_minimo_global
        self.aplicar_redondeo = aplicar_redondeo
        self.validar_precio_bajo_costo = validar_precio_bajo_costo

    def procesar_fila(self, fila: FilaCargaExcel, articulo: Optional[ArticuloContext]) -> FilaProcesada:
        resultado = FilaProcesada(fila=fila)

        # 1) Articulo inexistente
        if articulo is None:
            resultado.valido = False
            resultado.motivo_rechazo = MotivoRechazo.PRECIO_BASE_INVALIDO
            resultado.causa = "El codigo de articulo no existe en el catalogo activo."
            return resultado

        resultado.precio_actual = articulo.precio_actual
        resultado.costo_prom_dol = articulo.costo_prom_dol

        # 2) Factor fuera de rango (0 < factor <= 2)
        if not fila.factor_valido():
            resultado.valido = False
            resultado.motivo_rechazo = MotivoRechazo.FACTOR_FINAL_FUERA_RANGO
            resultado.causa = "El factor debe ser mayor que 0 y menor o igual que 2."
            return resultado

        # 3) Precio calculado (base) = precio_actual * factor_global * factor_fila
        factor_fila = float(fila.factor)
        precio_calculado = _round2(articulo.precio_actual * self.factor_global * factor_fila)
        resultado.precio_calculado = precio_calculado

        if precio_calculado <= 0:
            resultado.valido = False
            resultado.motivo_rechazo = MotivoRechazo.PRECIO_CALCULADO_INVALIDO
            resultado.causa = "El precio calculado debe ser mayor que cero."
            return resultado

        # 4) Redondeo comercial
        precio_redondeado = redondear_precio_comercial(precio_calculado) if self.aplicar_redondeo else precio_calculado
        resultado.precio_redondeado = precio_redondeado

        if self.aplicar_redondeo and precio_redondeado is None:
            resultado.valido = False
            resultado.estado = EstadoRedondeo.FUERA_DE_RANGO
            resultado.motivo_rechazo = MotivoRechazo.PRECIO_FUERA_DE_RANGO
            resultado.causa = "El precio calculado esta fuera del rango [0,01; 100.000,00]."
            return resultado

        precio_efectivo = precio_redondeado if precio_redondeado is not None else precio_calculado

        # 5) Margen minimo dinamico por articulo (fallback global)
        margen_min = (
            articulo.margen_utilidad_min
            if (articulo.margen_utilidad_min is not None and articulo.margen_utilidad_min > 0)
            else self.margen_minimo_global
        )
        resultado.margen_minimo_efectivo = margen_min

        if self.validar_precio_bajo_costo and articulo.costo_prom_dol is not None:
            # 5a) Precio debajo de costo
            if precio_efectivo < articulo.costo_prom_dol:
                resultado.valido = False
                resultado.estado = EstadoRedondeo.ALERTA_MARGEN
                resultado.motivo_rechazo = MotivoRechazo.PRECIO_DEBAJO_COSTO
                resultado.causa = "El precio efectivo es menor que el costo del articulo."
                return resultado

            # 5b) Margen = 1 - (costo / precio_efectivo)
            margen = 1 - (articulo.costo_prom_dol / precio_efectivo)
            resultado.margen_calculado = round(margen, 6)
            if margen < margen_min:
                resultado.valido = False
                resultado.estado = EstadoRedondeo.ALERTA_MARGEN
                resultado.motivo_rechazo = MotivoRechazo.MARGEN_MINIMO_NO_CUMPLE
                resultado.causa = (
                    "El margen resultante (%.4f) es inferior al minimo permitido (%.4f)."
                    % (margen, margen_min)
                )
                return resultado

        # OK
        resultado.estado = EstadoRedondeo.CALCULADO
        resultado.valido = True
        return resultado

    def procesar_lote(
        self,
        filas: List[FilaCargaExcel],
        catalogo: dict,
    ) -> List[FilaProcesada]:
        """Procesa un lote de filas. `catalogo` mapea codigo -> ArticuloContext."""
        return [self.procesar_fila(f, catalogo.get(f.codigo_articulo)) for f in filas]


# ---------------------------------------------------------------------------
# Lectura de plantilla (mapeo de columnas SIN Tipo de Variacion)
# ---------------------------------------------------------------------------
def parsear_plantilla(rows: List[dict], es_descuento_articulo: bool) -> List[FilaCargaExcel]:
    """Convierte filas crudas del Excel (dict por encabezado) a FilaCargaExcel.

    Encabezados esperados (sin "Tipo de Variacion"):
      - Descuento por Articulo: "Lista de Precio", "Codigo Articulo", "Factor"
      - Actualizacion Masiva:    "Codigo Articulo", "Factor"
    """
    filas: List[FilaCargaExcel] = []
    for idx, row in enumerate(rows, start=2):  # fila 1 = encabezado
        codigo = str(row.get("Codigo Articulo", "")).strip()
        factor_raw = str(row.get("Factor", "")).strip().replace(",", ".")
        try:
            factor = Decimal(factor_raw) if factor_raw else Decimal("0")
        except Exception:
            factor = Decimal("0")
        lista = None
        if es_descuento_articulo:
            lista = str(row.get("Lista de Precio", "")).strip() or None
        filas.append(
            FilaCargaExcel(
                codigo_articulo=codigo,
                factor=factor,
                lista_precio=lista,
                fila_excel=idx,
            )
        )
    return filas


# ---------------------------------------------------------------------------
# Carga específica de porcentaje de reducción de margen
# ---------------------------------------------------------------------------
ENCABEZADO_CODIGO_ARTICULO = "Codigo Articulo"
ENCABEZADO_PORCENTAJE_REDUCCION = "Porcentaje Reduccion"
_DECIMALES_FACTOR_REDUCCION = Decimal("0.0001")


def normalizar_porcentaje_reduccion_margen(valor: object) -> Decimal:
    """Convierte el porcentaje de entrada en la fracción persistible por UDT.

    Ejemplos: ``10`` -> ``Decimal("0.10")`` y ``10.5`` ->
    ``Decimal("0.105")``. Rechaza valores vacíos, no numéricos, negativos,
    100 o superiores; no infiere el formato antiguo ``0.10`` porque sería
    ambiguo (puede significar 0.10% en el contrato actual).
    """
    if valor is None:
        raise ValueError("El porcentaje de reducción es obligatorio.")

    texto = str(valor).strip().replace(",", ".")
    if not texto:
        raise ValueError("El porcentaje de reducción es obligatorio.")

    try:
        porcentaje = Decimal(texto)
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("El porcentaje de reducción debe ser numérico.") from exc

    if not porcentaje.is_finite() or porcentaje < Decimal("0") or porcentaje >= Decimal("100"):
        raise ValueError("El porcentaje de reducción debe estar en el rango [0, 100).")

    factor = porcentaje / Decimal("100")
    if factor.as_tuple().exponent < _DECIMALES_FACTOR_REDUCCION.as_tuple().exponent:
        raise ValueError(
            "El porcentaje de reducción excede la precisión permitida por FACTOR_REDUCCION DECIMAL(5,4)."
        )
    return factor


def parsear_plantilla_margen(rows: List[dict]) -> List[FilaFactorReduccionMargen]:
    """Convierte filas de la plantilla de margen a su contrato específico.

    La capa de lectura debe exigir los encabezados ``Codigo Articulo`` y
    ``Porcentaje Reduccion``. Cada fila se normaliza a la fracción que el UDT y
    el SP esperan; ninguna capa SQL vuelve a dividir entre 100.
    """
    filas: List[FilaFactorReduccionMargen] = []
    for idx, row in enumerate(rows, start=2):
        if ENCABEZADO_CODIGO_ARTICULO not in row or ENCABEZADO_PORCENTAJE_REDUCCION not in row:
            raise ValueError(
                "Plantilla de margen inválida: se requieren los encabezados "
                f"'{ENCABEZADO_CODIGO_ARTICULO}' y '{ENCABEZADO_PORCENTAJE_REDUCCION}'."
            )
        valor_porcentaje = row[ENCABEZADO_PORCENTAJE_REDUCCION]
        factor = normalizar_porcentaje_reduccion_margen(valor_porcentaje)
        porcentaje = factor * Decimal("100")
        fila = FilaFactorReduccionMargen(
            codigo_articulo=str(row[ENCABEZADO_CODIGO_ARTICULO] or "").strip(),
            porcentaje_reduccion=porcentaje,
            factor_reduccion_normalizado=factor,
            fila_excel=idx,
        )
        if not fila.es_consistente():
            raise ValueError(f"Fila {idx}: el porcentaje de reducción no es consistente con su factor normalizado.")
        filas.append(fila)
    return filas


# ---------------------------------------------------------------------------
# Regla de Mayoreo: margen minimo por articulo con factor de reduccion
# ---------------------------------------------------------------------------
FACTOR_REDUCCION_DEFAULT = 0.10  # fracción interna: 10% general por defecto


def factor_desde_udf(porcentaje_reduccion: Optional[float]) -> float:
    """Normaliza el PORCENTAJE almacenado en la UDF a la fracción de cálculo.

    Replica la lógica del SP sobre [COFER].[U_FACTOR_REDUCCION_MARGEN], cuya
    columna U_FACTOR_REDUCCION guarda el porcentaje explícito (10.00 = 10%).
    Si no hay excepción (None), aplica el 10% general por defecto (0.10).
    """
    return (porcentaje_reduccion / 100.0) if porcentaje_reduccion is not None else FACTOR_REDUCCION_DEFAULT


def calcular_margen_minimo(
    precio_lista: float,
    costo_prom_dol: float,
    factor_reduccion: Optional[float] = None,
) -> Optional[float]:
    """Replica [COFER].[SP_CALCULAR_MARGEN_MINIMO_ARTICULO] en el backend.

        Margen Promedio = (Precio Lista - Costo Promedio) / Precio Lista
        Margen Minimo   = Margen Promedio * (1 - Factor Reduccion)

    ``factor_reduccion`` es la fracción interna normalizada en [0, 1) (por
    ejemplo, un ingreso de 10% llega como 0.10). Para partir del porcentaje
    crudo de la UDF, use ``factor_desde_udf`` antes de invocar esta función.
    Si es None se usa el 10% general por defecto (0.10); no se divide otra vez
    entre 100. El resultado se acota a >= 0 y None si el precio no es positivo.
    """
    if precio_lista is None or precio_lista <= 0 or costo_prom_dol is None:
        return None
    fr = factor_reduccion if (factor_reduccion is not None) else FACTOR_REDUCCION_DEFAULT
    if fr < 0 or fr >= 1:
        raise ValueError("factor_reduccion debe ser una fracción normalizada en el rango [0, 1).")
    margen_promedio = (precio_lista - costo_prom_dol) / precio_lista
    margen_minimo = margen_promedio * (1 - fr)
    return max(0.0, round(margen_minimo, 6))
