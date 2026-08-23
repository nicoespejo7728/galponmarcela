import { obtenerCliente } from "@/lib/supabase/cliente";
import { clave } from "@/lib/datos/traduccion";
import { guardarCopiaLocal, leerCopiaLocal } from "@/lib/datos/copia-local";

/* Catálogos de apoyo: personas, secciones y proveedores.

   El sistema anterior se refería a las personas por su nombre en texto
   ("Fran"), y a las secciones también ("BEBIDAS"). La base usa claves foráneas.
   Estos catálogos mantienen en memoria la equivalencia en ambos sentidos, para
   que las pantallas puedan seguir hablando de nombres mientras la base guarda
   identificadores. */

const cache = {
  perfilesPorId: new Map(),
  perfilesPorNombre: new Map(),
  categoriasPorId: new Map(),
  categoriasPorNombre: new Map(),
  proveedoresPorId: new Map(),
  clientesPorId: new Map(),
  cargado: false,
};

/* Supabase devuelve como máximo 1000 filas por consulta. Esta función pagina
   hasta traerlas todas, para que un catálogo grande no quede cortado en silencio. */
export async function traerTodo(consultaFn, { paso = 1000, tope = 60000 } = {}) {
  const filas = [];
  for (let desde = 0; desde < tope; desde += paso) {
    const { data, error } = await consultaFn().range(desde, desde + paso - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    filas.push(...data);
    if (data.length < paso) break;
  }
  return filas;
}

/* Carga en curso, si la hay. Al abrir el sistema, las 13 colecciones se leen a
   la vez y todas piden los catálogos: sin esto, cada una arrancaría su propia
   carga —porque ninguna alcanzó a marcar la bandera— y saldrían 39 consultas
   donde bastan 3. Compartiendo la promesa, la primera carga sirve a todas. */
let cargaEnCurso = null;

export async function cargarCatalogos({ forzar = false } = {}) {
  if (cache.cargado && !forzar) return cache;
  if (cargaEnCurso && !forzar) return cargaEnCurso;

  /* Sin red, con lo que guardó el equipo. Esto importa más de lo que parece:
     cargarCatalogos() la llama CADA lectura del sistema, y en un arranque sin
     conexión eran diecisiete intentos de salir a la red, uno detrás de otro,
     cada uno esperando a que el navegador se rindiera. Diecisiete segundos
     mirando la pantalla de carga con el almacén abierto. */
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const guardado = await leerCopiaLocal("catalogos");
    if (guardado) {
      cache.perfilesPorId = new Map(guardado.perfiles.map((p) => [p.id, p]));
      cache.perfilesPorNombre = new Map(guardado.perfiles.map((p) => [clave(p.nombre), p]));
      cache.categoriasPorId = new Map(guardado.categorias.map((c) => [c.id, c]));
      cache.categoriasPorNombre = new Map(guardado.categorias.map((c) => [clave(c.nombre), c]));
      cache.proveedoresPorId = new Map(guardado.proveedores.map((p) => [p.id, p]));
      cache.clientesPorId = new Map((guardado.clientes || []).map((c) => [c.id, c]));
      cache.cargado = true;
      return cache;
    }
  }

  cargaEnCurso = (async () => {
    const sb = obtenerCliente();
    const [perfiles, categorias, proveedores] = await Promise.all([
      traerTodo(() => sb.from("perfil").select("id,nombre,usuario,rol,activo,creado_at,consumo_a_casa")),
      traerTodo(() => sb.from("categoria").select("id,nombre,orden,activa")),
      traerTodo(() => sb.from("proveedor").select("*")),
    ]);

    cache.perfilesPorId = new Map(perfiles.map((p) => [p.id, p]));
    cache.perfilesPorNombre = new Map(perfiles.map((p) => [clave(p.nombre), p]));
    cache.categoriasPorId = new Map(categorias.map((c) => [c.id, c]));
    cache.categoriasPorNombre = new Map(categorias.map((c) => [clave(c.nombre), c]));
    cache.proveedoresPorId = new Map(proveedores.map((p) => [p.id, p]));

    // Los clientes (fiado) se cargan aparte y con su propio try/catch: si la
    // migración 0012 todavía no se aplicó, la tabla "cliente" no existe
    // todavía. Sin este resguardo, un error acá tumbaría el Promise.all de
    // arriba y con él la carga de perfiles/categorías/proveedores —que son
    // la base de TODO el sistema— solo porque falta una migración de una
    // función nueva y sin relación con esas otras.
    try {
      const clientes = await traerTodo(() => sb.from("cliente").select("*"));
      cache.clientesPorId = new Map(clientes.map((c) => [c.id, c]));
    } catch (e) {
      console.error("[datos] cliente no disponible todavía (¿falta aplicar la migración 0012?)", e);
      cache.clientesPorId = new Map();
    }

    cache.cargado = true;
    // Y se deja la copia lista para el próximo arranque sin conexión.
    guardarCopiaLocal("catalogos", {
      perfiles, categorias, proveedores,
      clientes: Array.from(cache.clientesPorId.values()),
    });
    return cache;
  })();

  try {
    return await cargaEnCurso;
  } finally {
    cargaEnCurso = null;
  }
}


/* --- Personas --- */

export function nombreDePerfil(id) {
  if (!id) return "";
  return cache.perfilesPorId.get(id)?.nombre || "";
}

/* Si el consumo interno de esta persona va a la cuenta de la casa en vez de
   a una cuenta propia por descontar del sueldo (migración 0024). Los dueños
   van así: no se descuentan nada a sí mismos, y separarlos en tres cuentas no
   contesta la pregunta que se hace, que es cuánto se llevó la casa. */
export function perfilVaALaCasa(id) {
  if (!id) return false;
  return cache.perfilesPorId.get(id)?.consumo_a_casa === true;
}

export function perfilPorNombre(nombre) {
  return cache.perfilesPorNombre.get(clave(nombre)) || null;
}

export function idDePerfil(nombre) {
  return perfilPorNombre(nombre)?.id || null;
}

export function todosLosPerfiles() {
  return Array.from(cache.perfilesPorId.values());
}

/* --- Secciones --- */

export function nombreDeCategoria(id) {
  if (!id) return "";
  return cache.categoriasPorId.get(id)?.nombre || "";
}

/* Devuelve el id de la sección, creándola si es nueva. Las secciones se
   escriben siempre en MAYÚSCULAS (un trigger de la base lo garantiza), así que
   "Bebidas" y "BEBIDAS" nunca terminan siendo dos. */
export async function asegurarCategoria(nombre) {
  const limpio = (nombre || "").toString().trim().toUpperCase();
  if (!limpio) return null;
  const existente = cache.categoriasPorNombre.get(clave(limpio));
  if (existente) return existente.id;

  const sb = obtenerCliente();
  const { data, error } = await sb
    .from("categoria")
    .insert({ nombre: limpio })
    .select("id,nombre")
    .single();

  if (error) {
    // Otra pestaña pudo haberla creado en el intervalo: se relee antes de fallar.
    await cargarCatalogos({ forzar: true });
    const reintento = cache.categoriasPorNombre.get(clave(limpio));
    if (reintento) return reintento.id;
    throw new Error(`No se pudo crear la sección "${limpio}": ${error.message}`);
  }

  cache.categoriasPorId.set(data.id, data);
  cache.categoriasPorNombre.set(clave(data.nombre), data);
  return data.id;
}

/* Usadas por la colección "product-categories" (CRUD de secciones): a
   diferencia de asegurarCategoria (que resuelve nombre→id creando si hace
   falta, sin que la pantalla sepa que se creó algo), acá la propia pantalla
   de administración ya hizo el alta/edición/baja y solo hay que mantener la
   caché al día — mismo patrón que registrarProveedor/olvidarProveedor. */
export function registrarCategoria(fila) {
  if (!fila?.id) return;
  cache.categoriasPorId.set(fila.id, fila);
  cache.categoriasPorNombre.set(clave(fila.nombre), fila);
}

export function olvidarCategoria(id) {
  const fila = cache.categoriasPorId.get(id);
  if (fila) cache.categoriasPorNombre.delete(clave(fila.nombre));
  cache.categoriasPorId.delete(id);
}

export function todasLasCategorias() {
  return Array.from(cache.categoriasPorId.values());
}

/* --- Proveedores --- */

export function nombreDeProveedor(id) {
  if (!id) return "";
  return cache.proveedoresPorId.get(id)?.nombre || "";
}

export function registrarProveedor(fila) {
  if (fila?.id) cache.proveedoresPorId.set(fila.id, fila);
}

export function olvidarProveedor(id) {
  cache.proveedoresPorId.delete(id);
}

/* --- Clientes (fiado) --- */

export function nombreDeCliente(id) {
  if (!id) return "";
  return cache.clientesPorId.get(id)?.nombre || "";
}

export function registrarCliente(fila) {
  if (fila?.id) cache.clientesPorId.set(fila.id, fila);
}

export function olvidarCliente(id) {
  cache.clientesPorId.delete(id);
}

export function invalidarCatalogos() {
  cache.cargado = false;
}
