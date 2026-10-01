export type CompanySettings = {
  code: string;
  name: string;
  sqlSchema: string;
  country: string;
  currencySymbol: string;
  brandColor: string;
};

/**
 * Fila del listado: si su esquema existe en Softland y en PORTAL_PRECIOS.
 * `null` cuando SQL Server no respondió y no se pudo verificar.
 */
export type CompanyListItem = CompanySettings & { schemaStatus: { softland: boolean; portal: boolean } | null };
