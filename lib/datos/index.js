import { obtenerCliente } from "@/lib/supabase/cliente";
import { cargarCatalogos } from "@/lib/datos/catalogos";
import { configuracion, productos, proveedores, trabajadores, usuarios } from "@/lib/datos/colecciones/catalogo";
import {
  ventas, movimientos, turnosAbiertos, turnosCerrados, facturas,
  lineasDeCompra, conteos, transformaciones, comentarios, feriados, faltasDePan,
} from "@/lib/datos/colecciones/operacion";
import { guardarPaginasDeFactura, leerPaginasDeFactura } from "@/lib/datos/imagenes";

/* Puente entre las pantallas y la base de datos.

   El sistema fue escrito contra un almacenamiento de tipo "una llave, un JSON":
   cada pantalla pide la lista completa y guarda la lista completa. Este módulo
   mantiene ese contrato hacia afuera —para no reescribir las 12 pestañas— y por
   dentro traduce a consultas sobre las 30 tablas del esquema galpon.

   La pieza clave es la copia de la última lectura: al guardar se compara contra
   ella y solo se manda a la base lo que cambió de verdad. */

const COLECCIONES = {
  "business-settings": configuracion,
  "products-catalog": productos,
  "suppliers": proveedores,
  "workers": trabajadores,
  "users": usuarios,
  "sales-log": ventas,
  "movements-log": movimientos,
  "open-shifts": turnosAbiertos,
  "shifts-log": turnosCerrados,
  "invoices-index": facturas,
  "purchase-items-log": lineasDeCompra,
  "inventory-counts": conteos,
  "transformations-log": transformaciones,
  "marcelita-feedback": comentarios,
  "bread-holidays": feriados,
  "bread-shortages": faltasDePan,
};

/* Copia de lo último que se leyó o escribió, por colección. */
const instantaneas = new Map();

/* Quién está operando. Lo fija la pantalla de ingreso y se usa para llenar los
   campos "registrado por" que antes se guardaban como texto con el nombre. */
let usuarioActual = null;
export function fijarUsuarioActual(id) { usuarioActual = id || null; }
export function usuarioActualId() { return usuarioActual; }

/* Marca de tiempo de la última escritura. La sincronización periódica la usa
   para no pisar algo que este mismo dispositivo acaba de guardar. */
let ultimaEscritura = 0;
export function momentoUltimaEscritura() { return ultimaEscritura; }

function copiar(v) {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

/* ---------------------------------------------------------------------
   Lectura
   --------------------------------------------------------------------- */

export async function cargarJSON(clave, respaldo, opciones) {
  try {
    return await cargarJSONEstricto(clave, opciones);
  } catch (e) {
    console.error("[datos] no se pudo leer", clave, e);
    return respaldo;
  }
}

/* `opciones.reciente` pide solo los últimos días en vez de todo el historial.
   Lo usa la sincronización entre cajas, que corre cada 15 segundos y solo
   necesita enterarse de lo que acaba de pasar en otra pantalla. */
export async function cargarJSONEstricto(clave, opciones = {}) {
  if (clave.startsWith("invoice-image:")) {
    return await leerPaginasDeFactura(clave.slice("invoice-image:".length));
  }

  const coleccion = COLECCIONES[clave];
  if (!coleccion) throw new Error(`Colección desconocida: ${clave}`);

  await cargarCatalogos();
  const valor = await coleccion.leer(opciones);

  if (opciones.reciente) {
    // Una lectura parcial no puede reemplazar la copia de referencia: si lo
    // hiciera, el siguiente guardado creería que todo lo anterior se borró.
    // Se fusiona por identificador sobre lo que ya había.
    fusionarInstantanea(clave, valor);
  } else {
    instantaneas.set(clave, copiar(valor));
  }
  return valor;
}

function fusionarInstantanea(clave, parcial) {
  if (!Array.isArray(parcial)) return;
  const previa = instantaneas.get(clave);
  if (!Array.isArray(previa)) {
    instantaneas.set(clave, copiar(parcial));
    return;
  }
  const porId = new Map(previa.map((x) => [x?.id, x]));
  for (const x of parcial) if (x?.id) porId.set(x.id, x);
  instantaneas.set(clave, copiar(Array.from(porId.values())));
}

/* ---------------------------------------------------------------------
   Escritura
   --------------------------------------------------------------------- */

/* `opciones.origen` indica por qué cambió el stock (venta, merma, recepción…).
   Lo pasan las pantallas que mueven inventario, y es lo que queda escrito en el
   kárdex para poder reconstruir de dónde salió cada unidad. */
export async function guardarJSON(clave, valor, opciones = {}) {
  try {
    if (clave.startsWith("invoice-image:")) {
      await guardarPaginasDeFactura(clave.slice("invoice-image:".length), valor);
      ultimaEscritura = Date.now();
      return true;
    }

    const coleccion = COLECCIONES[clave];
    if (!coleccion) throw new Error(`Colección desconocida: ${clave}`);

    // Si nunca se leyó en esta sesión, se lee primero: sin la copia previa no
    // hay con qué comparar y se reinsertaría todo.
    if (!instantaneas.has(clave)) {
      await cargarCatalogos();
      instantaneas.set(clave, copiar(await coleccion.leer()));
    }

    if (!usuarioActual && !opciones.idUsuario) {
      throw new Error("Tu sesión expiró. Vuelve a entrar al sistema para guardar.");
    }

    const anterior = instantaneas.get(clave);
    await coleccion.escribir(valor, anterior, {
      ...opciones,
      idUsuario: opciones.idUsuario || usuarioActual,
    });

    instantaneas.set(clave, copiar(valor));
    ultimaEscritura = Date.now();
    return true;
  } catch (e) {
    console.error("[datos] no se pudo guardar", clave, e);
    // Se propaga para que la pantalla pueda avisar en vez de fingir que guardó.
    throw e;
  }
}

/* Olvida las copias en memoria. Se usa al cerrar sesión, para que la siguiente
   persona no arrastre el estado de la anterior. */
export function olvidarInstantaneas() {
  instantaneas.clear();
  usuarioActual = null;
}

/* ---------------------------------------------------------------------
   PIN de administrador

   El PIN ya no viaja al navegador: se guarda con bcrypt y se comprueba en la
   base. Estas funciones reemplazan la comparación `pin === settings.adminPin`.
   --------------------------------------------------------------------- */

export async function verificarPin(pin) {
  const sb = obtenerCliente();
  const { data, error } = await sb.rpc("verificar_pin", { p_pin: String(pin || "") });
  if (error) {
    console.error("[datos] no se pudo verificar el PIN", error);
    return false;
  }
  return data === true;
}

export async function cambiarPin(pin) {
  const sb = obtenerCliente();
  const { error } = await sb.rpc("cambiar_pin", { p_pin: String(pin || "") });
  if (error) throw new Error(error.message);
  return true;
}
