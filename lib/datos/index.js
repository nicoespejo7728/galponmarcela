import { obtenerCliente } from "@/lib/supabase/cliente";
import { cargarCatalogos } from "@/lib/datos/catalogos";
import { configuracion, productos, proveedores, categorias, clientes, trabajadores, usuarios, olvidarCatalogoDeProductos, unificarCategorias, unificarProductos } from "@/lib/datos/colecciones/catalogo";
import {
  ventas, movimientos, clienteMovimientos, proveedorMovimientos, turnosAbiertos, turnosCerrados, facturas,
  lineasDeCompra, conteos, transformaciones, comentarios, feriados, faltasDePan,
  registrarConteoRapido, ajustarStockRapido,
} from "@/lib/datos/colecciones/operacion";
import {
  guardarPaginasDeFactura, leerPaginasDeFactura,
  guardarDocumentosDeMovimiento, leerDocumentosDeMovimiento,
} from "@/lib/datos/imagenes";

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
  "product-categories": categorias,
  "customers": clientes,
  "customer-ledger": clienteMovimientos,
  "supplier-ledger": proveedorMovimientos,
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
  if (clave.startsWith("movement-doc:")) {
    return await leerDocumentosDeMovimiento(clave.slice("movement-doc:".length));
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
  for (const x of parcial) {
    if (!x?.id) continue;
    // Un registro dado de baja en otra caja llega marcado: sale de la copia de
    // referencia en vez de quedarse como si siguiera vigente.
    if (x.__eliminado) porId.delete(x.id);
    else porId.set(x.id, x);
  }
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
    if (clave.startsWith("movement-doc:")) {
      await guardarDocumentosDeMovimiento(clave.slice("movement-doc:".length), valor);
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
  olvidarCatalogoDeProductos();
  usuarioActual = null;
}

/* Corrige a mano la copia guardada de "products-catalog" después de tocar el
   stock de un producto por un camino que no pasó por guardarJSON (el ajuste
   rápido del Inventario General, ver registrarConteoInventarioGeneral más
   abajo). Sin esto, la próxima vez que alguien guarde el catálogo completo
   desde este mismo dispositivo, compararía contra un stock viejo y
   generaría un segundo ajuste de kárdex de la nada. La sincronización
   periódica (cada 15s) igual termina refrescando todo solo, así que esto
   solo cierra esa ventana corta. */
export function actualizarInstantaneaProducto(idProducto, cambios) {
  const arr = instantaneas.get("products-catalog");
  if (!Array.isArray(arr)) return;
  const i = arr.findIndex((p) => p?.id === idProducto);
  if (i >= 0) arr[i] = { ...arr[i], ...cambios };
}

/* Inventario General (agosto 2026): registra en un solo paso el conteo de UN
   producto y, si corresponde, ajusta su stock — pensado para contar cientos
   de productos sueltos desde el teléfono sin releer el catálogo completo en
   cada uno. Ver registrarConteoRapido/ajustarStockRapido en operacion.js. */
export async function registrarConteoInventarioGeneral({ product, counted }) {
  if (!usuarioActual) throw new Error("Tu sesión expiró. Vuelve a entrar al sistema para contar.");
  const expected = Number(product.stock) || 0;
  const delta = +(Number(counted) - expected).toFixed(3);

  let stockResultante = expected;
  if (delta !== 0) {
    stockResultante = await ajustarStockRapido({
      productId: product.id, delta, idUsuario: usuarioActual,
      nota: "Inventario general — corrección de conteo",
    });
    actualizarInstantaneaProducto(product.id, { stock: stockResultante });
  }

  await registrarConteoRapido({
    productId: product.id, productName: product.name, unitType: product.unitType,
    expected, counted: Number(counted) || 0, categoryName: product.category || "", idUsuario: usuarioActual,
  });

  ultimaEscritura = Date.now();
  return { stock: stockResultante, diff: delta };
}

export { unificarCategorias, unificarProductos };

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

/* Autorización de administrador para mermas y consumo interno.

   Acepta el PIN del negocio o el PIN personal de cualquier administrador
   activo (ver migración 0015): en el mesón se pide "el PIN de
   administrador" y quien autoriza escribe el suyo, que es el que recuerda.

   A diferencia de verificarPin, un fallo de la consulta no se convierte en
   "PIN incorrecto": se propaga, para que la pantalla pueda decir qué pasó de
   verdad en vez de acusar a quien lo escribió bien. */
export async function autorizarConPin(pin) {
  const sb = obtenerCliente();
  const { data, error } = await sb.rpc("autorizar_con_pin", { p_pin: String(pin || "") });
  if (error) throw new Error(error.message);
  // La función devuelve verdadero o falso y nada más. Cualquier otra cosa
  // —un cuerpo de error que no llegó como error, una respuesta a medias— es
  // un fallo de la consulta, no un PIN equivocado, y se dice como tal.
  if (typeof data !== "boolean") {
    throw new Error(
      (data && (data.message || data.hint)) ||
      "La base no respondió si el PIN es válido. ¿Falta aplicar la migración 0015?"
    );
  }
  return data;
}

export async function cambiarPin(pin) {
  const sb = obtenerCliente();
  const { error } = await sb.rpc("cambiar_pin", { p_pin: String(pin || "") });
  if (error) throw new Error(error.message);
  return true;
}

/* ---------------------------------------------------------------------
   PIN de vendedor (migración 0013)

   Identifica quién está vendiendo en una caja compartida sin pedir usuario
   ni contraseña: se llama a galpon.identificar_por_pin(), que compara el
   PIN contra los hashes en el servidor y devuelve el perfil dueño (o
   ninguno) — el hash nunca sale de la base.
   --------------------------------------------------------------------- */

export async function identificarPorPin(pin) {
  const sb = obtenerCliente();
  const { data, error } = await sb.rpc("identificar_por_pin", { p_pin: String(pin || "") });
  if (error) {
    console.error("[datos] no se pudo identificar el PIN de vendedor", error);
    return null;
  }
  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila?.id) return null;
  return { id: fila.id, name: fila.nombre, username: fila.usuario, role: fila.rol };
}
