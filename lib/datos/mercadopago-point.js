import { obtenerCliente } from "@/lib/supabase/cliente";

/* Cobro directo en la máquina Point, desde la pantalla de Vender.

   Qué máquina le toca a ESTE computador es una decisión de cada caja, no
   del negocio entero — por eso se guarda en este mismo navegador (no en la
   base) y cada equipo la elige una sola vez, en Ajustes. */
const CLAVE_LOCAL = "elgalpon_terminal_point";

export function terminalPointDeEsteEquipo() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CLAVE_LOCAL) || null;
  } catch {
    return null; // navegador con almacenamiento bloqueado: se sigue sin máquina asignada
  }
}

export function guardarTerminalPointDeEsteEquipo(terminalId) {
  if (typeof window === "undefined") return;
  try {
    if (terminalId) window.localStorage.setItem(CLAVE_LOCAL, terminalId);
    else window.localStorage.removeItem(CLAVE_LOCAL);
  } catch {
    // sin almacenamiento no hay dónde guardarlo — la pantalla de Ajustes
    // avisa aparte si hace falta.
  }
}

async function autorizacion() {
  const sb = obtenerCliente();
  const { data: { session } } = await sb.auth.getSession();
  return `Bearer ${session?.access_token || ""}`;
}

/* Manda el cobro a la máquina. Devuelve el id de la fila en pago_point (no
   el de Mercado Pago) — es lo que se usa después para consultar el estado. */
export async function crearCobroPoint({ monto, terminalId }) {
  const resp = await fetch("/api/mercadopago/cobrar", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: await autorizacion() },
    body: JSON.stringify({ monto, terminalId }),
  });
  const datos = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(datos?.error || `Mercado Pago respondió ${resp.status}`);
  return datos; // { id, mpOrderId }
}

export async function cancelarCobroPoint(id) {
  const resp = await fetch("/api/mercadopago/cobrar", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: await autorizacion() },
    body: JSON.stringify({ id }),
  });
  const datos = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(datos?.error || `Mercado Pago respondió ${resp.status}`);
  return datos;
}

/* Lectura directa (no pasa por guardarJSON/cargarJSON: esto no es una
   colección de pantalla, es solo el semáforo de un cobro puntual que se
   está esperando ahora mismo). */
export async function leerEstadoCobroPoint(id) {
  const sb = obtenerCliente();
  const { data, error } = await sb
    .from("pago_point").select("estado,monto_pagado").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data; // { estado, monto_pagado } o null si todavía no hay fila (no debería pasar)
}
