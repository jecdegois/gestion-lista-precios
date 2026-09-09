"""Enrutamiento multiempresa / multibase de datos (MV26020).

La solucion opera en un entorno multiempresa: cada compania tiene su propia
base de datos Softland. La aplicacion identifica la compania del contexto de
la solicitud y conecta dinamicamente al catalogo correspondiente. Todas las
consultas, Stored Procedures (incluido SP_CALCULAR_MARGEN_MINIMO_ARTICULO) y la
lectura de la UDF U_FACTOR_REDUCCION_MARGEN se ejecutan sobre el catalogo de la
compania activa.

Este modulo NO abre conexiones reales: define el contrato de resolucion de
cadena de conexion y de calificacion de objetos por compania, de modo que la
capa de acceso a datos (pyodbc / SQLAlchemy) lo consuma sin acoplar la logica
de negocio a una compania fija.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional


class CompaniaNoConfigurada(Exception):
    """Se solicito una compania sin cadena de conexion / esquema registrado."""


@dataclass(frozen=True)
class ConfiguracionCompania:
    """Parametros de conexion y calificacion de objetos para una compania.

    - ``catalogo``: base de datos Softland (USE <catalogo>) de la compania.
    - ``esquema``: esquema donde viven ARTICULO_PRECIO, la UDF y el SP
      (COFER, FEBECA, SILLACA, ...).
    - ``connection_string``: DSN/cadena que la capa de datos usa para conectar.
      Se resuelve por compania; nunca se codifica una unica compania.
    """

    compania: str
    catalogo: str
    esquema: str
    connection_string: str


class EnrutadorCompania:
    """Resuelve la configuracion de conexion segun la compania de la sesion.

    El registro se inyecta desde configuracion (Parameter Store / Secrets /
    variables de entorno) para no exponer credenciales en el codigo. Cada
    compania mapea a su base de datos Softland propia.
    """

    def __init__(self, registro: Optional[Dict[str, ConfiguracionCompania]] = None) -> None:
        self._registro: Dict[str, ConfiguracionCompania] = {}
        for clave, cfg in (registro or {}).items():
            self._registro[clave.strip().upper()] = cfg

    def registrar(self, cfg: ConfiguracionCompania) -> None:
        self._registro[cfg.compania.strip().upper()] = cfg

    def resolver(self, compania: Optional[str]) -> ConfiguracionCompania:
        """Devuelve la configuracion de la compania activa o falla explicito."""
        clave = (compania or "").strip().upper()
        if not clave:
            raise CompaniaNoConfigurada("La solicitud no indica la compania activa.")
        cfg = self._registro.get(clave)
        if cfg is None:
            raise CompaniaNoConfigurada(
                f"No hay base de datos Softland configurada para la compania '{compania}'."
            )
        return cfg

    def calificar(self, compania: Optional[str], objeto: str) -> str:
        """Antepone el esquema de la compania a un objeto (tabla/SP/UDF).

        Ejemplo: calificar('COFER', 'SP_CALCULAR_MARGEN_MINIMO_ARTICULO')
        -> '[COFER].[SP_CALCULAR_MARGEN_MINIMO_ARTICULO]'.
        """
        cfg = self.resolver(compania)
        return f"[{cfg.esquema}].[{objeto}]"

    def connection_string(self, compania: Optional[str]) -> str:
        """Cadena de conexion de la base Softland de la compania activa."""
        return self.resolver(compania).connection_string
