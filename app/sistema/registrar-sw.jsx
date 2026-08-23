"use client";

import { useEffect } from "react";

/* Instala el sistema en el computador.

   Sin esto, el "sin internet" duraba hasta que alguien recargara la página: el
   navegador salía a buscar el programa al servidor, no lo encontraba, y no
   había caja hasta que volviera la señal. Con el trabajador de servicio
   instalado (ver public/sw.js), el programa queda en el disco y abre igual.

   Se registra después de que la página cargó, no durante: en el arranque el
   navegador ya está bajando el catálogo, y competir por el ancho de banda con
   eso solo haría más lenta la primera pantalla, que es la que se mira con un
   cliente al frente. */
export default function RegistrarSW() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // Solo sobre HTTPS (o localhost). En cualquier otro lado el navegador lo
    // rechaza igual, así que ni se intenta.
    const seguro = window.isSecureContext;
    if (!seguro) return;

    let cancelado = false;
    const instalar = () => {
      if (cancelado) return;
      navigator.serviceWorker.register("/sw.js", { scope: "/sistema" })
        .catch((e) => console.warn("[sw] no se pudo instalar", e));
    };

    if (document.readyState === "complete") instalar();
    else window.addEventListener("load", instalar, { once: true });

    return () => { cancelado = true; window.removeEventListener("load", instalar); };
  }, []);

  return null;
}
