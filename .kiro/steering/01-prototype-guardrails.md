\---

inclusion: fileMatch

fileMatch: "Product-Definition/mockups/\*\*/\*.html, Product-Definition/mockups/\*\*/\*.js, Product-Definition/mockups/\*\*/\*.css"

\---



\# Reglas Inviolables de Arquitectura y Anti-Regresión (Mockups)



\## OBJETIVO

Proteger el código del prototipo en `Product-Definition/mockups/` contra regresiones históricas. Estas soluciones han sido validadas tras errores previos. \*\*Queda estrictamente prohibido modificarlas o revertirlas sin confirmación explícita.\*\*



\## 1. SISTEMA DE COMBOBOX (CRÍTICO)



\- \*\*Overflow de Contenedores Padre:\*\* Mantener `overflow: visible` en todos los contenedores padre (`.fp-compact`, `.fp`, `.fp-r1`, `.fp-r2`). NUNCA agregar `overflow: hidden`, `overflow: auto` ni `overflow-x: auto`.

\- \*\*Posicionamiento Fixed:\*\* Los dropdowns (`.combo-dd`) usan `position: fixed` mediante `positionDD(inputId, ddId)`. Prohibido cambiar a `position: absolute` sin auditar todos los contenedores superiores.

\- \*\*Event Bubbling:\*\*

&#x20; - Cierre global debe validar: `if (e.target.closest('.combo-w')) return;`

&#x20; - Opciones de dropdown deben incluir `ev.stopPropagation()`.

\- \*\*Triggers obligatorios:\*\* Todos los inputs de filtro (Cliente, Negocio, Tipo, Subtipo, Estado, Responsable, Categoría) DEBEN llevar los atributos `onfocus` Y `onclick`.

\- \*\*Prohibición de Select Nativo:\*\* Todos los filtros son Combobox personalizadas (`combo-w`, `combo-in`, `combo-dd`, `combo-clr`). NUNCA revertir a `<select class="fs">`.



\## 2. SEGURIDAD DOM Y NULL-SAFETY



Aplica estos patrones de verificación previa al interactuar con el DOM:



```javascript

// Panel de Aprobaciones / Tab Activo

const at = document.querySelector('.apm-tab.act');

renderApTab(at ? at.dataset.aptab : 'fichas');



// Cambio de Tab

function switchApTab(btn) {

&#x20; if (btn) btn.classList.add('act');

}



// Cierre de Modales (Triple comprobación)

function closeApprovalPanel(ev) {

&#x20; if (ev \&\& ev.target \&\& ev.target !== overlay) return;

&#x20; // Lógica de cierre

}

