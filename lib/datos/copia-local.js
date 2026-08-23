/* La copia del almacén en el propio computador.

   Guardar las ventas sin conexión no alcanza si el sistema no llega a abrir.
   Hasta acá, todo lo que se veía en pantalla venía de la base en cada
   arranque: sin internet, la pantalla de carga se quedaba dando vueltas y no
   había caja. Da lo mismo tener una cola si nadie puede llegar a usarla.

   Así que cada lectura completa que sale bien deja su copia acá. Cuando la
   base no contesta, el sistema abre con esa copia —el catálogo, los precios,
   la gente, las ventas de los últimos días— y se puede seguir vendiendo. Puede
   estar unos minutos atrasada; es infinitamente mejor que no abrir.

   Solo se guardan las lecturas COMPLETAS. Las parciales —las que la
   sincronización pide cada quince segundos, que traen únicamente lo que
   cambió— guardarían un catálogo de tres productos encima de uno de cinco mil.
   Ese es exactamente el error que dejaría a la caja creyendo que no hay nada
   que vender. */

import { conAlmacen, ALMACEN_COPIAS } from "@/lib/datos/base-local";

/* Lo que vale la pena tener en el equipo. Se dejan fuera los historiales
   largos que no hacen falta para vender —facturas, comentarios— para no llenar
   el disco con cosas que nadie va a mirar sin conexión. */
const GUARDABLES = new Set([
  "business-settings",
  "products-catalog",
  "product-categories",
  "users",
  "customers",
  "suppliers",
  "workers",
  "open-shifts",
  "sales-log",
  "movements-log",
  "customer-ledger",
  "inventory-counts",
  // Perfiles, categorías, proveedores y clientes, que resuelven los nombres.
  "catalogos",
]);

export function seGuardaLocalmente(clave) {
  return GUARDABLES.has(clave);
}

export async function guardarCopiaLocal(clave, valor) {
  if (!seGuardaLocalmente(clave)) return;
  try {
    await conAlmacen(ALMACEN_COPIAS, "readwrite", (almacen) =>
      almacen.put({ clave, valor, guardado: new Date().toISOString() }));
  } catch (e) {
    // Disco lleno o modo privado: se sigue sin copia local. No es motivo para
    // que falle la lectura, que sí funcionó.
    console.warn("[copia local] no se pudo guardar", clave, e);
  }
}

export async function leerCopiaLocal(clave) {
  try {
    const fila = await conAlmacen(ALMACEN_COPIAS, "readonly", (almacen) => almacen.get(clave));
    return fila ? fila.valor : undefined;
  } catch (e) {
    console.warn("[copia local] no se pudo leer", clave, e);
    return undefined;
  }
}

/* Cuándo se guardó la copia más vieja de las que importan. La pantalla lo usa
   para decir "estás viendo el sistema como estaba hace X" en vez de dejar
   creer que lo que hay al frente es lo último. */
export async function edadDeLaCopia() {
  const fila = await conAlmacen(ALMACEN_COPIAS, "readonly", (almacen) => almacen.get("products-catalog"));
  return fila?.guardado || null;
}

export async function olvidarCopiaLocal() {
  await conAlmacen(ALMACEN_COPIAS, "readwrite", (almacen) => almacen.clear());
}
