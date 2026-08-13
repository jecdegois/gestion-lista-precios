---
inclusion: manual
---

# Directiva: COMPACTAR

Cuando el usuario escriba **COMPACTAR** (en cualquier combinación de mayúsculas/minúsculas), debes:

1. Resumir toda la conversación actual en **5 a 7 viñetas** (bullet points).
2. Cada viñeta debe capturar **contexto crítico, decisiones tomadas, y fragmentos esenciales** (archivos modificados, comandos clave, valores decididos).
3. El resultado debe ser **autocontenido**: alguien que lo pegue en un chat nuevo debe poder continuar el trabajo sin preguntar qué se hizo antes.
4. Incluir al final una línea `**Próximo paso:**` con la acción pendiente inmediata.

## Formato de salida

```
## Contexto de sesión (COMPACTADO)

- **[Tema 1]**: Resumen conciso con datos específicos (nombres, rutas, valores).
- **[Tema 2]**: Decisión tomada y justificación breve.
- **[Tema 3]**: Archivos creados/modificados con ruta completa.
- **[Tema 4]**: Configuración o parámetro clave acordado.
- **[Tema 5]**: Estado actual del trabajo (qué funciona, qué falta).
- **[Tema 6]**: (opcional) Restricción o regla descubierta durante la sesión.
- **[Tema 7]**: (opcional) Deuda técnica o pendiente menor identificado.

**Próximo paso:** [Acción concreta pendiente]
```

## Reglas

- No incluir saludos, explicaciones del formato ni meta-comentarios.
- Priorizar datos concretos sobre descripciones genéricas (rutas > "se modificó un archivo").
- Si hay código clave (un comando, un snippet de config), incluirlo inline en la viñeta.
- El tono es telegráfico: máxima densidad informativa, mínima prosa.
