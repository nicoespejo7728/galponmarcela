import { obtenerCliente } from "@/lib/supabase/cliente";

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

  cargaEnCurso = (async () => {
    const sb = obtenerCliente();
    const [perfiles, categorias, proveedores] = await Promise.all([
      traerTodo(() => sb.from("perfil").select("id,nombre,usuario,rol,activo,creado_at")),
      traerTodo(() => sb.from("categoria").select("id,nombre,orden,activa")),
      traerTodo(() => sb.from("proveedor").select("*")),
    ]);

    cache.perfilesPorId = new Map(perfiles.map((p) => [p.id, p]));
    cache.perfilesPorNombre = new Map(perfiles.map((p) => [clave(p.nombre), p]));
    cache.categoriasPorId = new Map(categorias.map((c) => [c.id, c]));
    cache.categoriasPorNombre = new Map(categorias.map((c) => [clave(c.nombre), c]));
    cache.proveedoresPorId = new Map(proveedores.map((p) => [p.id, p]));
    cache.cargado = true;
    return cache;
  })();

  try {
    return await cargaEnCurso;
  } finally {
    cargaEnCurso = null;
  }
}

/* Clave de comparación: sin distinguir mayúsculas, tildes ni espacios sobrantes.
   Es la misma normalización que usaba la aplicación para no duplicar secciones. */
function clave(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/* --- Personas --- */

export function nombreDePerfil(id) {
  if (!id) return "";
  return cache.perfilesPorId.get(id)?.nombre || "";
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

export function invalidarCatalogos() {
  cache.cargado = false;
}
