/* Traducción entre el vocabulario de la aplicación y el de la base de datos.

   La aplicación nació guardando textos legibles ("Compra de mercadería",
   "Débito", "Daño o rotura"). En Postgres esos textos son tipos enumerados en
   minúscula y sin tildes, para que la base pueda rechazar un valor inválido.
   Aquí vive la traducción en los dos sentidos, en un solo lugar. */

function invertir(mapa) {
  return Object.fromEntries(Object.entries(mapa).map(([k, v]) => [v, k]));
}

/* --- Método de pago --- */
export const A_METODO_PAGO = {
  Efectivo: "efectivo",
  "Débito": "debito",
  "Crédito": "credito",
  Transferencia: "transferencia",
};
export const DESDE_METODO_PAGO = invertir(A_METODO_PAGO);

/* --- Categoría de movimiento del libro de caja --- */
export const A_CATEGORIA_MOVIMIENTO = {
  Venta: "venta",
  "Consumo interno": "consumo_interno",
  "Compra de mercadería": "compra_mercaderia",
  "Entrada libre": "entrada_libre",
  Merma: "merma",
  Sueldos: "sueldo",
  "Ajuste de inventario": "ajuste_inventario",
  "Transformación de productos": "transformacion",
  "Ventas históricas": "venta_historica",
  "Compras históricas": "compra_historica",
  "Sueldos históricos": "sueldo_historico",
  "Gastos históricos": "gasto_historico",
  General: "general",
};
export const DESDE_CATEGORIA_MOVIMIENTO = invertir(A_CATEGORIA_MOVIMIENTO);

/* --- Motivo de merma --- */
export const A_MOTIVO_MERMA = {
  "Pérdida": "perdida",
  Robo: "robo",
  Vencimiento: "vencimiento",
  "Daño o rotura": "dano_rotura",
  Otro: "otro",
};
export const DESDE_MOTIVO_MERMA = invertir(A_MOTIVO_MERMA);

/* --- Tipo de comentario del equipo --- */
export const A_TIPO_FEEDBACK = {
  Sugerencia: "sugerencia",
  "Falla o error": "falla",
  Comentario: "comentario",
};
export const DESDE_TIPO_FEEDBACK = invertir(A_TIPO_FEEDBACK);

/* Traduce con respaldo: si llega un valor que no está en el mapa (por ejemplo
   una categoría que alguien escribió a mano), se usa el valor por defecto en
   vez de dejar que la base rechace la fila entera. */
export function traducir(mapa, valor, respaldo) {
  if (valor == null) return respaldo;
  const directo = mapa[valor];
  if (directo) return directo;
  // Segundo intento sin distinguir mayúsculas ni espacios sobrantes
  const buscado = String(valor).trim().toLowerCase();
  for (const [k, v] of Object.entries(mapa)) {
    if (k.toLowerCase() === buscado) return v;
  }
  return respaldo;
}

/* Números: la base usa numeric y el cliente de Supabase los devuelve como
   string cuando la precisión excede la de un número de JavaScript. Toda la
   aplicación asume números, así que se normalizan al leer. */
export function num(v, respaldo = 0) {
  if (v === null || v === undefined || v === "") return respaldo;
  const n = Number(v);
  return Number.isFinite(n) ? n : respaldo;
}

/* Identificadores: la aplicación los genera con crypto.randomUUID(), pero los
   datos migrados desde la versión anterior podrían traer los antiguos
   ("prod_lx3k_ab12"). Esta función detecta si algo es un uuid válido para no
   mandar a la base un identificador que va a rechazar. */
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function esUuid(v) {
  return typeof v === "string" && RE_UUID.test(v);
}
export function nuevoId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Respaldo para navegadores antiguos sin crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* Compara dos objetos por los campos que se guardan, para no mandar a la base
   una actualización cuando en realidad no cambió nada. */
export function distintos(a, b, campos) {
  return campos.some((c) => {
    const x = a?.[c];
    const y = b?.[c];
    if (typeof x === "number" || typeof y === "number") {
      return num(x, null) !== num(y, null);
    }
    return (x ?? null) !== (y ?? null);
  });
}

/* Clave de comparación de nombres: sin distinguir mayúsculas, tildes ni
   espacios sobrantes. Es la misma normalización que usaba la aplicación para no
   terminar con "Bebidas", "bebidas" y "BEBIDAS" como tres secciones distintas. */
export function clave(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
