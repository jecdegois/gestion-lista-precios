USE [MAR];
GO

/*
  Ajustar el tipo al tipo real de ARTICULO_PRECIO.PRECIO si TI confirma
  que DECIMAL(28,8) no es compatible con el ERP.
*/
IF COL_LENGTH('COFER.ARTICULO_PRECIO','U_PRECIO_TECNICO') IS NULL
BEGIN
    ALTER TABLE COFER.ARTICULO_PRECIO
      ADD U_PRECIO_TECNICO DECIMAL(28,8) NULL;
END;
GO

/*
  Carga inicial única: ejecutar antes del primer redondeo y solamente sobre
  listas raíz cuyos precios actuales todavía sean los originales aprobados.
  Costa Rica: MAYOREO. Venezuela: MAYOREOD.
*/
UPDATE AP
SET AP.U_PRECIO_TECNICO=CAST(AP.PRECIO AS DECIMAL(28,8))
FROM COFER.ARTICULO_PRECIO AP
JOIN COFER.VERSION_NIVEL VN
  ON VN.NIVEL_PRECIO=AP.NIVEL_PRECIO
 AND VN.VERSION=AP.VERSION
 AND VN.ESTADO='A'
WHERE AP.NIVEL_PRECIO IN ('MAYOREO','MAYOREOD')
  AND AP.U_PRECIO_TECNICO IS NULL;
GO

/*
  El proceso que importa o mantiene una lista raíz debe escribir el importe
  original en U_PRECIO_TECNICO. El job de publicación calculará PRECIO.

  Ejemplo controlado para un artículo:

  UPDATE COFER.ARTICULO_PRECIO
  SET U_PRECIO_TECNICO=@NUEVO_PRECIO_ORIGINAL,
      FECHA_ULT_MODIF=GETDATE(),
      USUARIO_ULT_MODIF=@USUARIO
  WHERE NIVEL_PRECIO=@LISTA_BASE
    AND VERSION=@VERSION
    AND ARTICULO=@ARTICULO
    AND VERSION_ARTICULO=@VERSION_ARTICULO
    AND MONEDA=@MONEDA;
*/
