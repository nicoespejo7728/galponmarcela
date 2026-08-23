/* El sistema, guardado en el computador.

   Sin esto, "seguir vendiendo sin internet" duraba hasta que alguien recargara
   la página: el navegador iba a buscar el programa al servidor, no lo
   encontraba y no había caja hasta que volviera la señal.

   Este archivo se instala en el navegador y guarda el programa —el HTML, el
   JavaScript, los estilos, el logo— en el disco. Después, cada vez que se
   abre, sirve lo guardado y de paso pregunta si hay una versión más nueva.

   Lo que NO se guarda acá son los datos: el catálogo, las ventas y los precios
   viven en IndexedDB (ver copia-local.js). Las consultas a la base pasan de
   largo sin tocar esta caché — una respuesta de la base guardada de ayer sería
   peor que no tener nada, porque nadie se daría cuenta de que está vieja. */

const CACHE = "galpon-v1";

/* Lo mínimo para que la pantalla de la caja aparezca. El resto de los trozos
   de JavaScript se van guardando solos a medida que se usan. */
const IMPRESCINDIBLES = [
  "/sistema",
  "/img/logo-galpon.png",
  "/manifest.json",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(IMPRESCINDIBLES).catch((e) => {
        // Que falte uno no puede impedir la instalación: lo que sí se pudo
        // guardar ya sirve, y lo demás se guarda en el primer uso.
        console.warn("[sw] no se pudieron guardar todos los archivos base", e);
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(
        nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

function esDeLaBase(url) {
  return url.hostname.endsWith("supabase.co") || url.pathname.startsWith("/api/");
}

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;

  const url = new URL(pedido.url);
  // Los datos nunca se sirven de la caché: si la base no contesta, quien
  // decide con qué seguir es la capa de datos, que sabe de qué fecha es su
  // copia. Una respuesta vieja disfrazada de fresca sería mucho peor.
  if (esDeLaBase(url)) return;
  if (url.origin !== self.location.origin) return;

  /* Los trozos con huella en el nombre (/_next/static/…) no cambian nunca:
     se sirven de la caché sin preguntar, que es lo que hace que abra rápido. */
  const inmutable = url.pathname.startsWith("/_next/static/");

  evento.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardado = await cache.match(pedido);
    if (guardado && inmutable) return guardado;

    try {
      const respuesta = await fetch(pedido);
      if (respuesta && respuesta.status === 200 && respuesta.type === "basic") {
        cache.put(pedido, respuesta.clone());
      }
      return respuesta;
    } catch (e) {
      // Sin red: lo guardado. Y para una navegación —alguien recargó la
      // página— se devuelve la pantalla del sistema, que es la que importa.
      if (guardado) return guardado;
      if (pedido.mode === "navigate") {
        const sistema = await cache.match("/sistema");
        if (sistema) return sistema;
      }
      throw e;
    }
  })());
});
