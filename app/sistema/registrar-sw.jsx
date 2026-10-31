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
   cliente al frente.

   Queda, sin embargo, un agujero específico del celular y la tablet (reporte
   de Fran, oct. 2026: conteos, ventas, recepciones y ediciones que funcionan
   en el computador pero no ahí). En el computador la pestaña se recarga sola
   con cualquier excusa —se cierra al terminar el día, el sistema operativo la
   repone— y así termina bajando, tarde o temprano, cada arreglo que se sube.
   El teléfono y la tablet, en cambio, quedan con la misma pestaña (o la app
   instalada desde la pantalla de inicio) abierta durante días: el trabajador
   de servicio se actualiza solo en segundo plano, pero el JavaScript que ya
   está corriendo en esa pestaña sigue siendo el de ANTES hasta que alguien la
   recargue — y una app instalada no tiene ni botón de recargar a la vista.
   El resultado es justo lo reportado: funciones que ya se habían arreglado
   siguen fallando ahí, porque esa pestaña nunca llegó a bajar el arreglo.

   Lo de abajo avisa cuando eso pasa, en vez de dejarlo pasar en silencio:

   - Pide revisar si hay una versión nueva cada vez que la pantalla vuelve a
     estar visible (el momento en que alguien prende el teléfono y sigue
     donde quedó) — sin esto, una pestaña que nunca se recarga tampoco vuelve
     a preguntarle al servidor por una versión más nueva.
   - Si el trabajador de servicio efectivamente cambia de versión, se avisa a
     la pantalla principal (evento "galpon:actualizacion-disponible") para
     que muestre un aviso.

   A propósito NUNCA se recarga sola: una venta o una recepción a medio
   escribir no puede desaparecer porque llegó una versión nueva de fondo. Que
   decida la persona, cuando le quede bien. */
export default function RegistrarSW() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // Solo sobre HTTPS (o localhost). En cualquier otro lado el navegador lo
    // rechaza igual, así que ni se intenta.
    const seguro = window.isSecureContext;
    if (!seguro) return;

    let cancelado = false;
    let registro = null;
    // El controlador que ya había ANTES de que esta pestaña detecte ningún
    // cambio. Si sigue siendo null cuando el navegador recién toma control
    // por primera vez —una instalación nueva, donde nadie controlaba nada
    // todavía— no hay ninguna versión "más vieja" de la que avisar: ese
    // primer "controllerchange" no es una actualización, es el arranque.
    let controladorPrevio = navigator.serviceWorker.controller;

    function avisarNuevaVersion() {
      window.dispatchEvent(new Event("galpon:actualizacion-disponible"));
    }

    function onControllerChange() {
      if (controladorPrevio) avisarNuevaVersion();
      controladorPrevio = navigator.serviceWorker.controller;
    }

    function onVisible() {
      if (document.visibilityState === "visible") registro?.update().catch(() => {});
    }

    const instalar = () => {
      if (cancelado) return;
      navigator.serviceWorker.register("/sw.js", { scope: "/sistema" })
        .then((r) => {
          if (cancelado) return;
          registro = r;
          navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
          document.addEventListener("visibilitychange", onVisible);
        })
        .catch((e) => console.warn("[sw] no se pudo instalar", e));
    };

    if (document.readyState === "complete") instalar();
    else window.addEventListener("load", instalar, { once: true });

    return () => {
      cancelado = true;
      window.removeEventListener("load", instalar);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
