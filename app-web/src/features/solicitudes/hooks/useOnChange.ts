"use client";

import { useEffect, useRef } from "react";

/**
 * Ejecuta `onChange` cuando `key` cambia respecto del render anterior (no en el montaje).
 * Se usa para invalidar la simulación cuando cambian los parámetros del formulario.
 */
export function useOnChange(key: string, onChange: () => void) {
  const previousKey = useRef(key);
  const callback = useRef(onChange);
  callback.current = onChange;

  useEffect(() => {
    if (previousKey.current === key) return;
    previousKey.current = key;
    callback.current();
  }, [key]);
}
