import { obtenerCliente } from "@/lib/supabase/cliente";
import { cargarCatalogos } from "@/lib/datos/catalogos";
import { configuracion, productos, proveedores, categorias, clientes, trabajadores, usuarios, olvidarCatalogoDeProductos, unificarCategorias, unificarProductos, leerDuplicadosDescartados, descartarDuplicado, revertirDescarte } from "@/lib/datos/colecciones/catalogo";
import {
  ventas, movimientos, clienteMovimientos, proveedorMovimientos, turnosAbiertos, turnosCerrados, facturas,
  lineasDeCompra, conteos, transformaciones, comentarios, feriados, faltasDePan,
  registrarConteoRapido, ajustarStockRapido,
  registrarConsumoInterno, leerConsumosInternos, marcarConsumosDescontados,
  subirVentaCompleta, subirMovimientoSuelto,
} from "@/lib/datos/colecciones/operacion";
import {
  encolar, listarPendientes, cuantosPendientes, subirPendientes, esFalloDeRed,
} from "@/lib/datos/pendientes";
import {
  recordarPin, identificarLocalmente, cuantosPinesRecordados, olvidarPinesLocales,
} from "@/lib/datos/pin-local";
import {
  guardarCopiaLocal, leerCopiaLocal, edadDeLaCopia, olvidarCopiaLocal, seGuardaLocalmente,
} from "@/lib/datos/copia-local";
import { nuevoId } from "@/lib/datos/traduccion";
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
  /* Si el navegador YA SABE que no hay red, no se sale a preguntar: se va
     derecho a la copia del equipo. Intentarlo igual no cambia el resultado y
     cuesta caro — el arranque completo sin conexión tardaba 24 segundos en
     rendirse, con la vendedora esperando que abriera la caja. Con esto son un
     par. Ojo que `onLine` en false es una certeza; en true no promete nada
     (un módem prendido sin internet se ve "en línea"), así que solo se usa
     esta salida rápida cuando dice que no. */
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    if (seGuardaLocalmente(clave)) {
      const copia = await leerCopiaLocal(clave);
      if (copia !== undefined) {
        instantaneas.set(clave, copiar(copia));
        return copia;
      }
    }
    // Sin copia y sin red: se devuelve lo de siempre en vez de gastar segundos
    // preguntándole a una base que no puede contestar. Son los historiales
    // largos —facturas, comentarios— que no hacen falta para vender.
    return respaldo;
  }
  try {
    return await cargarJSONEstricto(clave, opciones);
  } catch (e) {
    console.error("[datos] no se pudo leer", clave, e);
    /* Antes de rendirse, lo que este computador guardó la última vez que sí
       pudo leer. Es lo que hace que el sistema abra con la conexión caída en
       vez de quedarse en la pantalla de carga. */
    if (seGuardaLocalmente(clave)) {
      const copia = await leerCopiaLocal(clave);
      if (copia !== undefined) {
        console.info("[datos]", clave, "se leyó de la copia guardada en este equipo");
        // La copia pasa a ser también la referencia para comparar al guardar:
        // sin esto, el primer guardado creería que todo lo anterior se borró.
        instantaneas.set(clave, copiar(copia));
        return copia;
      }
    }
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
    // Y la copia del disco se actualiza con el resultado de la fusión, no con
    // lo parcial: guardar los tres productos que cambiaron encima de los cinco
    // mil dejaría a la caja creyendo que no hay nada que vender.
    guardarCopiaLocal(clave, instantaneas.get(clave));
  } else {
    instantaneas.set(clave, copiar(valor));
    guardarCopiaLocal(clave, valor);
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

export { unificarCategorias, unificarProductos, leerDuplicadosDescartados, revertirDescarte };
export { leerConsumosInternos, marcarConsumosDescontados };

/* Consumo interno (migración 0020). El descuento de stock lo hace la base
   dentro de la transacción, así que acá hay que dejar la copia local al día:
   si no, la próxima escritura del catálogo compararía contra un stock viejo y
   volvería a subir el valor de antes, deshaciendo el consumo. */
export async function registrarConsumo({ perfilId, motivo, items }) {
  const id = nuevoId();
  const carga = { id, perfilId, motivo, items };
  const r = await conCola({
    id, tipo: "consumo", carga,
    hacer: () => registrarConsumoInterno(carga),
  });
  for (const it of items || []) {
    const previo = instantaneas.get("products-catalog")?.find?.((p) => p.id === it.productId);
    if (previo) {
      actualizarInstantaneaProducto(it.productId, {
        stock: Math.max(0, (Number(previo.stock) || 0) - (Number(it.qty) || 0)),
      });
    }
  }
  ultimaEscritura = Date.now();
  return id;
}

/* El descarte queda a nombre de quien lo decidió; el identificador lo pone
   esta capa, que es la que sabe quién está operando. */
export async function descartarDuplicadoDeProductos(clave, nombre, motivo) {
  return descartarDuplicado(clave, nombre, motivo, usuarioActual);
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
  /* También con plazo: sin conexión, esperar a que el navegador se rinda son
     varios segundos antes siquiera de empezar la venta. Pasado el plazo se
     resuelve con lo que recuerda el equipo. */
  let data = null, error = null;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return await identificarLocalmente(pin);
  }
  try {
    const r = await conPlazo(sb.rpc("identificar_por_pin", { p_pin: String(pin || "") }), PLAZO_VENTA);
    data = r.data; error = r.error;
  } catch (e) {
    error = e;
  }

  if (error) {
    /* Sin internet la base no puede contestar. Ahí decide lo que este mismo
       computador recuerda de quienes ya se identificaron en él (ver
       pin-local.js). Si tampoco lo sabe, se devuelve null: es "no lo puedo
       confirmar", y la pantalla lo dirá como corresponde.

       Un error que NO es de red —la función no existe, permisos— no se tapa
       con el respaldo local: eso hay que verlo, no esconderlo. */
    if (!esFalloDeRed(error)) {
      console.error("[datos] no se pudo identificar el PIN de vendedor", error);
      return null;
    }
    const local = await identificarLocalmente(pin);
    if (local) console.info("[datos] PIN identificado sin conexión, con lo que recuerda este equipo");
    return local;
  }

  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila?.id) return null;
  const perfil = { id: fila.id, name: fila.nombre, username: fila.usuario, role: fila.rol };
  // Cada identificación con conexión deja al equipo preparado para la próxima
  // vez que se caiga. No se guarda el PIN, sino una huella derivada de él.
  recordarPin(perfil, pin);
  return perfil;
}

/* ---------------------------------------------------------------------
   Ventas sin conexión

   Una venta es lo único que no puede esperar: el cliente está con la plata
   en la mano. Si al cobrar no hay internet, la venta se guarda en el disco
   del computador y se sube sola cuando vuelva.

   El identificador de la boleta lo pone el navegador, así que la venta ya
   nace con su llave: subirla dos veces choca contra esa llave y se detecta,
   en vez de duplicarse. El NÚMERO de boleta, en cambio, lo asigna la base
   —una secuencia, para que las dos cajas no repitan numeración— así que una
   venta hecha sin conexión lleva un número provisorio hasta que sube.
   --------------------------------------------------------------------- */

/* Cuánto se espera a la base antes de dar la venta por encolada.

   Sin conexión, el navegador no falla al toque: reintenta, espera tiempos de
   espera de TCP, y entremedio la vendedora está mirando una pantalla que no
   reacciona con el cliente al frente. Catorce segundos, medidos. Pasado este
   plazo se guarda en la cola y listo — y si la escritura resulta que sí había
   llegado, el reintento choca con la llave repetida y no duplica nada. Ese es
   justamente el seguro que permite cortar por lo sano. */
const PLAZO_VENTA = 2500;

function conPlazo(promesa, ms) {
  return Promise.race([
    promesa,
    new Promise((_, rechazar) =>
      setTimeout(() => rechazar(new Error("Timeout: la base no contestó a tiempo")), ms)),
  ]);
}

export async function registrarVenta(venta) {
  // Sin red, derecho a la cola: intentarlo igual son cuatro segundos de
  // pantalla quieta con el cliente al frente, para llegar al mismo lugar.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await encolar({ id: venta.id, tipo: "venta", carga: { venta, idUsuario: usuarioActual } });
    return { subida: false, numeroBoleta: venta.invoiceNumber };
  }
  try {
    const r = await conPlazo(subirVentaCompleta({ venta, idUsuario: usuarioActual }), PLAZO_VENTA);
    ultimaEscritura = Date.now();
    return { subida: true, numeroBoleta: r.numeroBoleta };
  } catch (e) {
    if (!esFalloDeRed(e)) throw e;
    await encolar({ id: venta.id, tipo: "venta", carga: { venta, idUsuario: usuarioActual } });
    return { subida: false, numeroBoleta: venta.invoiceNumber };
  }
}

const MANEJADORES = {
  venta: (carga) => subirVentaCompleta(carga),
  consumo: (carga) => registrarConsumoInterno(carga),
  movimiento: (carga) => subirMovimientoSuelto(carga),
};

/* Encolar cualquiera de las tres, con el mismo criterio que la venta: sin red,
   derecho a la cola; con red, se intenta y solo se encola si falla por la red.

   Las tres se pueden reintentar sin duplicar porque las tres llevan un
   identificador puesto por el navegador. Esa es la condición para entrar acá:
   una operación que no se pueda repetir sin consecuencias no puede vivir en
   una cola que reintenta. */
async function conCola({ id, tipo, carga, hacer }) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await encolar({ id, tipo, carga });
    return { subida: false };
  }
  try {
    const r = await conPlazo(hacer(), PLAZO_VENTA);
    ultimaEscritura = Date.now();
    return { subida: true, resultado: r };
  } catch (e) {
    if (!esFalloDeRed(e)) throw e;
    await encolar({ id, tipo, carga });
    return { subida: false };
  }
}

/* Intenta subir todo lo que quedó pendiente. La llama el ciclo de
   sincronización y el evento de "volvió la conexión" del navegador. */
export async function subirLoPendiente() {
  return subirPendientes(MANEJADORES);
}

export { listarPendientes, cuantosPendientes, esFalloDeRed };
export { cuantosPinesRecordados, olvidarPinesLocales };
export { edadDeLaCopia, olvidarCopiaLocal };
