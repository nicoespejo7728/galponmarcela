/* Lo que quedó por subir cuando no había internet.

   El almacén está en un barrio y la conexión se corta. Hasta ahora eso
   significaba perder la venta: el cobro fallaba sin decir nada y no quedaba
   registro en ninguna parte. Acá vive la cola de lo que se hizo sin conexión,
   guardada en el disco del computador (IndexedDB) y no en la memoria de la
   pestaña, para que sobreviva a que alguien recargue o cierre el navegador.

   Se guarda la INTENCIÓN completa —"esta venta, con estas líneas"— y no las
   consultas sueltas que habría hecho el puente de datos. La diferencia
   importa: al subirla mañana, una consulta armada ayer contra el estado de
   ayer estaría comparando contra un catálogo que ya cambió. La intención, en
   cambio, se puede ejecutar tal cual en cualquier momento.

   El orden se respeta: se sube lo más viejo primero y, si algo falla, se
   detiene ahí en vez de seguir. Los movimientos de stock son sumas y restas
   encadenadas; adelantarse a una que falló desordenaría el kárdex. */

import { conAlmacen, ALMACEN_PENDIENTES } from "@/lib/datos/base-local";

const conCola = (modo, hacer) => conAlmacen(ALMACEN_PENDIENTES, modo, hacer);

/* Guarda una operación para subirla cuando vuelva la conexión. El id lo pone
   quien llama y es el mismo de la fila que se va a crear —el de la venta, por
   ejemplo—: así, si la subida se cortó justo después de escribir en la base,
   el reintento choca contra la llave repetida y se sabe que ya estaba hecha,
   en vez de duplicarla. */
export async function encolar({ id, tipo, carga }) {
  const registro = {
    id, tipo, carga,
    creado: new Date().toISOString(),
    intentos: 0,
    ultimoError: null,
  };
  await conCola("readwrite", (almacen) => almacen.put(registro));
  return registro;
}

export async function listarPendientes() {
  const filas = await conCola("readonly", (almacen) => almacen.getAll());
  return (filas || []).sort((a, b) => String(a.creado).localeCompare(String(b.creado)));
}

export async function cuantosPendientes() {
  const n = await conCola("readonly", (almacen) => almacen.count());
  return n || 0;
}

export async function quitarPendiente(id) {
  await conCola("readwrite", (almacen) => almacen.delete(id));
}

async function anotarIntento(registro, error) {
  await conCola("readwrite", (almacen) => almacen.put({
    ...registro,
    intentos: (registro.intentos || 0) + 1,
    ultimoError: String(error?.message || error || "").slice(0, 300),
  }));
}

/* Un error de red se reintenta para siempre; uno de datos, no. Si la base
   rechaza una venta por un motivo real —un producto que ya no existe, una
   restricción— reintentarla cada quince segundos hasta el fin de los tiempos
   solo tapa el problema y bloquea todo lo que venga detrás. */
export function esFalloDeRed(e) {
  const texto = String(e?.message || e || "").toLowerCase();
  return texto.includes("failed to fetch")
    || texto.includes("networkerror")
    || texto.includes("load failed")
    || texto.includes("network request failed")
    || texto.includes("err_internet_disconnected")
    || texto.includes("err_network")
    || texto.includes("timeout");
}

/* Sube lo que haya, en orden. `manejadores` es un objeto {tipo: función}: cada
   uno recibe la carga y hace las escrituras reales.

   Devuelve un resumen para que la pantalla pueda avisar. Se detiene en el
   primer fallo de red —no tiene sentido insistir con el resto si no hay
   internet— pero un fallo de datos no detiene la fila: ese se aparta y se
   sigue, para que una venta rechazada no deje congeladas las diez de atrás. */
export async function subirPendientes(manejadores) {
  const cola = await listarPendientes();
  if (cola.length === 0) return { subidas: 0, quedan: 0, trabadas: [] };

  let subidas = 0;
  const trabadas = [];

  for (const registro of cola) {
    const manejador = manejadores[registro.tipo];
    if (!manejador) {
      trabadas.push({ ...registro, ultimoError: `No sé cómo subir "${registro.tipo}"` });
      continue;
    }
    try {
      await manejador(registro.carga);
      await quitarPendiente(registro.id);
      subidas++;
    } catch (e) {
      if (esFalloDeRed(e)) {
        await anotarIntento(registro, e);
        break;   // sigue sin haber internet: se corta acá y se conserva el orden
      }
      await anotarIntento(registro, e);
      trabadas.push({ ...registro, ultimoError: String(e?.message || e) });
    }
  }

  return { subidas, quedan: await cuantosPendientes(), trabadas };
}
