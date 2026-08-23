/* Identificar al vendedor cuando no hay internet.

   El PIN se comprueba en la base a propósito: el hash bcrypt nunca sale del
   servidor, así que ni siquiera un navegador comprometido puede sacar los PIN
   del equipo. Es la decisión correcta y no se cambia.

   Pero deja un agujero: sin internet no se puede identificar a nadie, y sin
   identificar a nadie no se puede cobrar. De poco sirve guardar las ventas en
   una cola si no se llega a empezar ninguna.

   La salida es que cada computador recuerde a quienes YA se identificaron en
   él alguna vez, con conexión. No se guarda el PIN ni el hash del servidor:
   se guarda una huella propia del equipo, derivada del PIN con PBKDF2 y una
   sal distinta para cada persona. Con eso el computador puede contestar "este
   PIN es de Yaneth" sin poder reconstruir el PIN.

   Las cuentas del gaseoso: son PIN de cuatro a seis dígitos, o sea pocas
   combinaciones. Contra alguien que se robe el computador Y sepa dónde mirar,
   esto no es una caja fuerte —por eso van 200.000 vueltas de derivación, para
   que probarlas todas cueste horas y no segundos—. A cambio, el almacén puede
   seguir vendiendo con la conexión caída, que es un problema de todos los
   días y no una hipótesis. */

import { conAlmacen, ALMACEN_PINES } from "@/lib/datos/base-local";

const VUELTAS = 200000;
const conPines = (modo, hacer) => conAlmacen(ALMACEN_PINES, modo, hacer);

function hayCripto() {
  return typeof crypto !== "undefined" && crypto.subtle && typeof crypto.getRandomValues === "function";
}

async function derivar(pin, sal) {
  const clave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(String(pin)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: sal, iterations: VUELTAS, hash: "SHA-256" }, clave, 256);
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/* Se llama después de que el servidor confirmó de quién es el PIN. Solo así:
   nunca se recuerda un PIN que la base no haya validado antes. */
export async function recordarPin(perfil, pin) {
  if (!hayCripto() || !perfil?.id || !pin) return;
  try {
    const sal = crypto.getRandomValues(new Uint8Array(16));
    const huella = await derivar(pin, sal);
    await conPines("readwrite", (almacen) => almacen.put({
      perfilId: perfil.id,
      nombre: perfil.name,
      usuario: perfil.username,
      rol: perfil.role,
      sal: Array.from(sal),
      huella,
      guardado: new Date().toISOString(),
    }));
  } catch (e) {
    console.warn("[pin local] no se pudo recordar", e);
  }
}

/* ¿De quién es este PIN, según lo que este computador recuerda? Se prueban
   todas las huellas guardadas: son un puñado de personas, y comparar de más no
   cuesta nada. La comparación es constante en la práctica porque las huellas
   tienen todas el mismo largo. */
export async function identificarLocalmente(pin) {
  if (!hayCripto() || !pin) return null;
  try {
    const guardados = await conPines("readonly", (almacen) => almacen.getAll());
    for (const g of guardados || []) {
      const huella = await derivar(pin, new Uint8Array(g.sal));
      if (huella === g.huella) {
        return { id: g.perfilId, name: g.nombre, username: g.usuario, role: g.rol, local: true };
      }
    }
  } catch (e) {
    console.warn("[pin local] no se pudo comprobar", e);
  }
  return null;
}

/* Cuántas personas puede identificar este computador sin internet. La pantalla
   de Usuarios lo muestra: si es cero, el día que se caiga la conexión no se va
   a poder cobrar, y más vale saberlo antes. */
export async function cuantosPinesRecordados() {
  const n = await conPines("readonly", (almacen) => almacen.count());
  return n || 0;
}

export async function olvidarPinesLocales() {
  await conPines("readwrite", (almacen) => almacen.clear());
}
