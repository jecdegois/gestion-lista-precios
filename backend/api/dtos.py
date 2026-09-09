"""DTOs / entidades del API del modulo de Gestion Masiva de Precios (MV26020).

Modela el contrato de recepcion de solicitudes de proceso masivo y el mapeo del
archivo Excel, alineado con el Stored Procedure
[FEBECA].[SP_GESTION_LISTAS_PRECIOS_CON_REDONDEO].

Cambios funcionales reflejados en estos DTOs:

1. Ampliacion del procesamiento masivo:
   - Margen de utilidad validado dinamicamente por articulo (MARGEN_UTILIDAD_MIN)
     con fallback al parametro global `margen_minimo`.
   - Soporte de agrupacion por atributos de articulo (categoria, linea,
     proveedor, esquema de trabajo) mediante `FiltroAtributos`.

2. Cargador de Excel:
   - Se ELIMINA la columna / campo "Tipo de Variacion". La fila del Excel ya no
     especifica si el ajuste es porcentaje o monto: se recibe el FACTOR directo
     (0.95 = -5%, 1.10 = +10%) y el motor aplica factor global + redondeo.

Se usan dataclasses de la libreria estandar para no imponer dependencias
externas (Pydantic/attrs). Los tipos monetarios se modelan con Decimal para
evitar errores de coma flotante, en linea con la recomendacion del informe.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum
from typing import List, Optional


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
class ModoValidacion(str, Enum):
    """Controla que hace el SP cuando existen filas rechazadas."""

    OMITIR = "OMITIR"  # procesa las validas, omite las rechazadas
    ERROR = "ERROR"    # cancela toda la corrida si hay al menos un rechazo


class PestanaCargador(str, Enum):
    """Pestana de nivel superior del cargador de precios (Regla de Mayoreo).

    - MASIVA:       Carga Masiva (Global / Atributos / Listas Base).
    - POR_ARTICULO: Carga Por Articulo (ajuste individual).

    Ambas pestanas comparten el mismo motor (factor directo + redondeo + margen
    minimo) y ninguna requiere la columna "Tipo de Variacion".
    """

    MASIVA = "MASIVA"
    POR_ARTICULO = "POR_ARTICULO"


class EstadoRedondeo(str, Enum):
    """Estado del motor de redondeo comercial para una linea."""

    CALCULADO = "CALCULADO"
    FUERA_DE_RANGO = "FUERA_DE_RANGO"
    ALERTA_MARGEN = "ALERTA_MARGEN"


class MotivoRechazo(str, Enum):
    """Motivos de rechazo devueltos por el SP (columna MOTIVO_RECHAZO)."""

    PRECIO_BASE_INVALIDO = "PRECIO_BASE_INVALIDO"
    FACTOR_NO_CONFIGURADO = "FACTOR_NO_CONFIGURADO"
    FACTOR_LISTA_FUERA_RANGO = "FACTOR_LISTA_FUERA_RANGO"
    FACTOR_FINAL_FUERA_RANGO = "FACTOR_FINAL_FUERA_RANGO"
    PRECIO_CALCULADO_INVALIDO = "PRECIO_CALCULADO_INVALIDO"
    PRECIO_FUERA_DE_RANGO = "PRECIO_FUERA_DE_RANGO"
    PRECIO_DEBAJO_COSTO = "PRECIO_DEBAJO_COSTO"
    MARGEN_MINIMO_NO_CUMPLE = "MARGEN_MINIMO_NO_CUMPLE"


# ---------------------------------------------------------------------------
# Filtro por atributos de articulo (soporte masivo por agrupacion)
# ---------------------------------------------------------------------------
@dataclass
class FiltroAtributos:
    """Filtro opcional para restringir el universo de articulos del proceso.

    Cada atributo que se envia se traduce en un parametro del SP
    (@p_categoria, @p_linea, @p_proveedor, @p_esquema_trabajo). Los atributos en
    None no filtran (aplican a toda la lista).
    """

    categoria: Optional[str] = None
    linea: Optional[str] = None
    proveedor: Optional[str] = None
    esquema_trabajo: Optional[str] = None

    def aplica_alguno(self) -> bool:
        return any([self.categoria, self.linea, self.proveedor, self.esquema_trabajo])


# ---------------------------------------------------------------------------
# Fila del Excel (SIN "Tipo de Variacion")
# ---------------------------------------------------------------------------
@dataclass
class FilaCargaExcel:
    """Representa una fila de la plantilla de carga masiva simplificada.

    Columnas de la plantilla:
        - Descuento por Articulo: [Lista de Precio, Codigo Articulo, Factor]
        - Actualizacion Masiva:   [Codigo Articulo, Factor]

    NOTA: la antigua columna "Tipo de Variacion" fue removida. El signo del
    ajuste esta implicito en el valor del factor (0.95 = descuento 5%,
    1.10 = incremento 10%). El factor valido es > 0 y <= 2.
    """

    codigo_articulo: str
    factor: Decimal
    lista_precio: Optional[str] = None  # requerido solo en Descuento por Articulo
    fila_excel: Optional[int] = None    # numero de fila para trazabilidad de errores

    def factor_valido(self) -> bool:
        return self.factor is not None and Decimal("0") < self.factor <= Decimal("2")


# ---------------------------------------------------------------------------
# Fila de carga específica de reducción de margen (porcentaje de entrada)
# ---------------------------------------------------------------------------
@dataclass
class FilaFactorReduccionMargen:
    """Representa una fila de la plantilla de margen mínimo.

    El usuario carga ``porcentaje_reduccion`` en el rango [0, 100), por ejemplo
    10 o 10.5. La frontera de carga calcula una única vez la representación
    interna ``factor_reduccion_normalizado`` (10 -> Decimal("0.10")), que es la
    única representación permitida para UDT y Stored Procedure.

    Este contrato es deliberadamente distinto de :class:`FilaCargaExcel`, cuyo
    ``factor`` es un multiplicador de precio directo (0.95 / 1.10).
    """

    codigo_articulo: str
    porcentaje_reduccion: Decimal
    factor_reduccion_normalizado: Decimal
    fila_excel: Optional[int] = None

    def porcentaje_valido(self) -> bool:
        return Decimal("0") <= self.porcentaje_reduccion < Decimal("100")

    def factor_valido(self) -> bool:
        return Decimal("0") <= self.factor_reduccion_normalizado < Decimal("1")

    def es_consistente(self) -> bool:
        return (
            self.porcentaje_valido()
            and self.factor_valido()
            and self.factor_reduccion_normalizado == self.porcentaje_reduccion / Decimal("100")
        )

    @property
    def multiplicador_margen(self) -> Decimal:
        """Multiplicador que se aplica al margen promedio (10% -> 0.90)."""
        return Decimal("1") - self.factor_reduccion_normalizado


# ---------------------------------------------------------------------------
# Request: solicitud de proceso masivo
# ---------------------------------------------------------------------------
@dataclass
class SolicitudProcesoMasivoRequest:
    """Contrato de entrada para disparar el SP de gestion de listas de precio.

    Mapea 1:1 con los parametros de
    [FEBECA].[SP_GESTION_LISTAS_PRECIOS_CON_REDONDEO].
    """

    nivel_precio_base: str
    version: int
    fecha_inicio: str  # ISO 'YYYY-MM-DD'
    fecha_fin: str     # ISO 'YYYY-MM-DD'
    # Compania activa del contexto de sesion; determina la base de datos
    # Softland destino (arquitectura multiempresa). Requerida para enrutar el
    # SP y la lectura de la UDF al catalogo correcto.
    compania: Optional[str] = None
    factor_multiplicador: Decimal = Decimal("1")
    nivel_precio: Optional[str] = None  # None => todas las listas configuradas
    usuario: str = "SD"
    margen_minimo: Decimal = Decimal("0")  # fallback global si el articulo no define su minimo
    validar_precio_bajo_costo: bool = True
    exigir_factor_configurado: bool = False
    actualizar_lista_base: bool = False
    modo_validacion: ModoValidacion = ModoValidacion.OMITIR
    aplicar_redondeo: bool = True
    # Pestana de origen: MASIVA (global/atributos/lista) o POR_ARTICULO (individual).
    pestana: PestanaCargador = PestanaCargador.MASIVA
    filtro_atributos: FiltroAtributos = field(default_factory=FiltroAtributos)
    # Filas provenientes del Excel (solo en modalidad de carga masiva por plantilla)
    filas: List[FilaCargaExcel] = field(default_factory=list)

    def es_por_articulo(self) -> bool:
        return self.pestana == PestanaCargador.POR_ARTICULO

    def to_sp_params(self) -> dict:
        """Traduce el request a los parametros nombrados del Stored Procedure."""
        return {
            "@p_nivel_precio": self.nivel_precio,
            "@p_fecha_inicio": self.fecha_inicio,
            "@p_fecha_fin": self.fecha_fin,
            "@p_nivel_precio_base": self.nivel_precio_base,
            "@p_factor_multiplicador": self.factor_multiplicador,
            "@p_version": self.version,
            "@p_usuario_ult_modif": self.usuario,
            "@p_margen_minimo": self.margen_minimo,
            "@p_validar_precio_bajo_costo": 1 if self.validar_precio_bajo_costo else 0,
            "@p_exigir_factor_configurado": 1 if self.exigir_factor_configurado else 0,
            "@p_actualizar_lista_base": 1 if self.actualizar_lista_base else 0,
            "@p_modo_validacion": self.modo_validacion.value,
            "@p_aplicar_redondeo": 1 if self.aplicar_redondeo else 0,
            "@p_categoria": self.filtro_atributos.categoria,
            "@p_linea": self.filtro_atributos.linea,
            "@p_proveedor": self.filtro_atributos.proveedor,
            "@p_esquema_trabajo": self.filtro_atributos.esquema_trabajo,
        }


# ---------------------------------------------------------------------------
# Response: linea rechazada y estado de la solicitud
# ---------------------------------------------------------------------------
@dataclass
class LineaRechazada:
    """Una fila que no supero validaciones; mapea el detalle de rechazos del SP."""

    articulo: str
    nivel_precio: str
    motivo_rechazo: MotivoRechazo
    precio_base: Optional[Decimal] = None
    factor_final: Optional[Decimal] = None
    precio_calculado: Optional[Decimal] = None
    precio_redondeado: Optional[Decimal] = None
    precio_efectivo: Optional[Decimal] = None
    costo_prom_dol: Optional[Decimal] = None
    margen_minimo_efectivo: Optional[Decimal] = None
    margen_utilidad_calculado: Optional[Decimal] = None
    # Atributos para agrupar/reportar rechazos
    categoria: Optional[str] = None
    linea: Optional[str] = None
    proveedor: Optional[str] = None

    @property
    def es_rechazo_por_margen(self) -> bool:
        return self.motivo_rechazo == MotivoRechazo.MARGEN_MINIMO_NO_CUMPLE


@dataclass
class ResumenCorrida:
    """Resumen agregado de la corrida (primer result set del SP)."""

    run_id: str
    nivel_precio_base: str
    version_destino: int
    factor_global: Decimal
    modo_validacion: ModoValidacion
    aplica_redondeo: bool
    listas_destino: int
    articulos_base: int
    precios_evaluados: int
    precios_validos: int
    precios_insertados: int
    precios_actualizados: int
    precios_rechazados: int


@dataclass
class EstadoSolicitudResponse:
    """Respuesta del estado de una solicitud de proceso masivo.

    Incluye el resumen y el detalle de rechazos, de modo que la UI pueda
    mostrar los articulos rechazados por margen (u otro motivo) tras procesar.
    """

    resumen: ResumenCorrida
    rechazos: List[LineaRechazada] = field(default_factory=list)

    @property
    def rechazos_por_margen(self) -> List[LineaRechazada]:
        return [r for r in self.rechazos if r.es_rechazo_por_margen]

    def resumen_por_motivo(self) -> dict:
        """Conteo de rechazos agrupado por motivo (para badges/indicadores)."""
        conteo: dict = {}
        for r in self.rechazos:
            clave = r.motivo_rechazo.value
            conteo[clave] = conteo.get(clave, 0) + 1
        return conteo
