/* La base de datos del propio computador.

   Guarda dos cosas, y las dos existen para lo mismo: que el almacén siga
   vendiendo cuando se corta el internet.

   - `pendientes`: las ventas hechas sin conexión, esperando subir.
   - `pines`: la huella del PIN de quienes ya se identificaron en este equipo,
     para poder reconocerlos cuando la base no contesta.

   Va todo por acá y no cada módulo por su cuenta a propósito. IndexedDB
   versiona la base entera, no cada almacén: dos módulos abriendo la misma base
   con números de versión distintos se bloquean mutuamente —el primero en
   abrir impide la actualización del segundo, y el segundo se queda esperando
   para siempre, en silencio—. Ya pasó una vez, y el síntoma era el peor
   posible: el PIN dejaba de funcionar sin conexión y nada lo explicaba. */

const NOMBRE = "galpon-local";
const VERSION = 1;
export const ALMACEN_PENDIENTES = "pendientes";
export const ALMACEN_PINES = "pines";

let promesa = null;

export function abrirBaseLocal() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!promesa) {
    promesa = new Promise((resolve) => {
      const req = indexedDB.open(NOMBRE, VERSION);
      req.onupgradeneeded = () => {
        const bd = req.result;
        if (!bd.objectStoreNames.contains(ALMACEN_PENDIENTES)) {
          bd.createObjectStore(ALMACEN_PENDIENTES, { keyPath: "id" })
            .createIndex("creado", "creado");
        }
        if (!bd.objectStoreNames.contains(ALMACEN_PINES)) {
          bd.createObjectStore(ALMACEN_PINES, { keyPath: "perfilId" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      // Sin base local el sistema tiene que seguir andando: simplemente no
      // habrá cola ni identificación sin conexión, y se avisará en su momento.
      req.onerror = () => { console.error("[local] no se pudo abrir la base del equipo", req.error); resolve(null); };
      req.onblocked = () => { console.error("[local] la base del equipo quedó bloqueada por otra pestaña"); resolve(null); };
    });
  }
  return promesa;
}

/* Una transacción sobre un almacén, envuelta en promesa. Devuelve null cuando
   no hay base local, para que quien llama pueda seguir sin romperse. */
export function conAlmacen(nombre, modo, hacer) {
  return abrirBaseLocal().then((bd) => {
    if (!bd || !bd.objectStoreNames.contains(nombre)) return null;
    return new Promise((resolve, reject) => {
      const tx = bd.transaction(nombre, modo);
      const pedido = hacer(tx.objectStore(nombre));
      tx.oncomplete = () => resolve(pedido ? pedido.result : null);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  });
}
