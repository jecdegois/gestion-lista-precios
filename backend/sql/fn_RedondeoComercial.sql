USE [SOFTLANDQA]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* ============================================================================
   FUNCIÓN ESCALAR: fn_RedondeoComercial
   ----------------------------------------------------------------------------
   Motor de redondeo comercial de 12 bandas contiguas (0,01 – 100.000,00).
   Réplica exacta del algoritmo del libro Simulador_redondeo_precios.xlsm,
   documentado en docs/Informe_Reglas_Redondeo_Precios.md y validado contra
   los 27 casos de prueba oficiales (27/27 correctos).

   Tipos de redondeo:
     - "exceso"   → CEILING(P / paso) * paso           (bandas 1–4)
     - "unico"    → precio fijo 4,99                    (banda 5)
     - "terminal" → terminal más cercano por período   (bandas 6–12)

   Regla de desempate: si distancia_inferior = distancia_superior, gana el
   terminal SUPERIOR (comparación con "<" estricto).

   Rango: valores < 0,01 o > 100.000,00 devuelven NULL (estado "Fuera de rango"
   que el SP interpreta y registra en la tabla de rechazos).

   Nota de implementación: se usa DECIMAL(28,8) para el cálculo interno y se
   redondea el resultado final a 2 decimales, en línea con el algoritmo del
   libro (ROUND(...,6) para comparar distancias, ROUND(...,2) para el resultado).
   ============================================================================ */
CREATE OR ALTER FUNCTION [FEBECA].[fn_RedondeoComercial]
(
    @p_precio DECIMAL(28,8)
)
RETURNS DECIMAL(28,2)
AS
BEGIN
    -- Fuera de rango o nulo → sin precio redondeado (NULL)
    IF @p_precio IS NULL OR @p_precio < 0.01 OR @p_precio > 100000.00
        RETURN NULL;

    DECLARE @resultado DECIMAL(28,8) = NULL;
    DECLARE @tipo VARCHAR(10);
    DECLARE @paso DECIMAL(28,8);
    DECLARE @periodo DECIMAL(28,8);
    DECLARE @precioFijo DECIMAL(28,8);

    /* --------------------------------------------------------------------
       Clasificación de banda por límite superior inclusivo (P > hasta pasa
       a la siguiente banda). Se asignan los parámetros de la banda.
       -------------------------------------------------------------------- */
    IF      @p_precio <= 0.50      BEGIN SET @tipo='exceso';   SET @paso=0.01; END
    ELSE IF @p_precio <= 1.00      BEGIN SET @tipo='exceso';   SET @paso=0.05; END
    ELSE IF @p_precio <= 2.50      BEGIN SET @tipo='exceso';   SET @paso=0.10; END
    ELSE IF @p_precio <= 4.75      BEGIN SET @tipo='exceso';   SET @paso=0.25; END
    ELSE IF @p_precio <= 5.15      BEGIN SET @tipo='unico';    SET @precioFijo=4.99; END
    ELSE IF @p_precio <= 10.15     BEGIN SET @tipo='terminal'; SET @periodo=1;   END
    ELSE IF @p_precio <= 50.24     BEGIN SET @tipo='terminal'; SET @periodo=1;   END
    ELSE IF @p_precio <= 99.99     BEGIN SET @tipo='terminal'; SET @periodo=1;   END
    ELSE IF @p_precio <= 500.00    BEGIN SET @tipo='terminal'; SET @periodo=10;  END
    ELSE IF @p_precio <= 1000.00   BEGIN SET @tipo='terminal'; SET @periodo=10;  END
    ELSE IF @p_precio <= 5000.00   BEGIN SET @tipo='terminal'; SET @periodo=100; END
    ELSE                           BEGIN SET @tipo='terminal'; SET @periodo=100; END

    /* --------------------------------------------------------------------
       Tipo "Por exceso": CEILING(P / paso) * paso
       -------------------------------------------------------------------- */
    IF @tipo = 'exceso'
    BEGIN
        SET @resultado = CEILING(ROUND(@p_precio / @paso, 6)) * @paso;
        RETURN CAST(ROUND(@resultado, 2) AS DECIMAL(28,2));
    END

    /* --------------------------------------------------------------------
       Tipo "Precio único": valor fijo 4,99
       -------------------------------------------------------------------- */
    IF @tipo = 'unico'
    BEGIN
        RETURN CAST(ROUND(@precioFijo, 2) AS DECIMAL(28,2));
    END

    /* --------------------------------------------------------------------
       Tipo "Terminal más cercano": se materializan los offsets de la banda
       en una tabla, se calcula el candidato inferior (mayor <= P) y el
       superior (menor >= P), y se elige el más cercano (empate → superior).
       -------------------------------------------------------------------- */
    DECLARE @offsets TABLE (OFF_VAL DECIMAL(28,8));

    IF      @p_precio <= 10.15   INSERT INTO @offsets VALUES (0.29),(0.49),(0.69),(0.99);   -- banda 6
    ELSE IF @p_precio <= 50.24   INSERT INTO @offsets VALUES (0.49),(0.99);                 -- banda 7
    ELSE IF @p_precio <= 99.99   INSERT INTO @offsets VALUES (0.99);                        -- banda 8
    ELSE IF @p_precio <= 500.00  INSERT INTO @offsets VALUES (3),(5),(7),(9);               -- banda 9
    ELSE IF @p_precio <= 1000.00 INSERT INTO @offsets VALUES (0),(5);                       -- banda 10
    ELSE IF @p_precio <= 5000.00 INSERT INTO @offsets VALUES (30),(50),(70),(90);           -- banda 11
    ELSE                         INSERT INTO @offsets VALUES (50),(90);                     -- banda 12

    DECLARE @J DECIMAL(28,8) = FLOOR(@p_precio / @periodo) * @periodo;

    DECLARE @S DECIMAL(28,8);  -- terminal inferior (mayor candidato <= P)
    DECLARE @T DECIMAL(28,8);  -- terminal superior (menor candidato >= P)

    SELECT @S = MAX(CASE WHEN (@J + OFF_VAL) <= @p_precio THEN (@J + OFF_VAL) ELSE (@J - @periodo + OFF_VAL) END)
    FROM @offsets;

    SELECT @T = MIN(CASE WHEN (@J + OFF_VAL) >= @p_precio THEN (@J + OFF_VAL) ELSE (@J + @periodo + OFF_VAL) END)
    FROM @offsets;

    -- Desempate: "<" estricto hace que las distancias iguales caigan en @T.
    IF ROUND(@p_precio - @S, 6) < ROUND(@T - @p_precio, 6)
        SET @resultado = @S;
    ELSE
        SET @resultado = @T;

    RETURN CAST(ROUND(@resultado, 2) AS DECIMAL(28,2));
END
GO
