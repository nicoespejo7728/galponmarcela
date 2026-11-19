/* Tarjetas NFC, del lado del navegador (migración 0043).

   El lector NFC que llegó funciona "escribiendo" el número de la tarjeta
   como si fuera un teclado — exactamente igual que el lector de código de
   barras que el sistema ya usa en Vender (ver POSView y el campo de
   escaneo). No habla PC/SC ni ningún protocolo aparte, así que NO hace
   falta ningún programa corriendo aparte en este computador (a diferencia
   de lo que se pensó al principio, cuando se asumió el otro tipo de
   lector/programador — ver el README viejo en herramientas/puente-nfc,
   que ya no hace falta instalar ni dejar corriendo).

   Cómo se distingue una tarjeta de alguien escribiendo a mano: el lector
   manda todos los caracteres del número y el Enter final en milisegundos
   (mucho más rápido que cualquier persona tecleando) — así que esto
   escucha las teclas de toda la página y, si llegan varias seguidas muy
   rápido y terminan en Enter, las toma como una tarjeta. Si se tecleó a
   mano (más lento, con pausas), no pasa nada raro: la tecla sigue su
   curso normal en el campo donde estaba el cursor, como si este archivo
   no existiera. Por eso la opción de escribir el PIN, el usuario o la
   contraseña a mano sigue funcionando igual para cualquier persona — la
   tarjeta es un atajo que se suma, nunca algo de lo que dependa nadie. */

// Qué tan juntas tienen que llegar las teclas para contar como "las mandó
// el lector", no una persona tecleando rápido. Un lector manda cada
// caracter a una fracción de milisegundo del anterior; incluso quien
// teclea muy rápido rara vez baja de unos 100ms entre tecla y tecla de
// forma sostenida, así que 30ms deja margen de sobra sin arriesgar falsos
// positivos.
const UMBRAL_RAPIDO_MS = 30;

// Las tarjetas NTAG213/215/216 (las que compró Fran) entregan el número de
// serie en 8 a 20 caracteres hexadecimales según el modelo — nadie teclea
// a mano esa cantidad de caracteres sosteniendo el ritmo de un lector.
const LARGO_MINIMO = 6;
const LARGO_MAXIMO = 32;

function crearPuenteNFC() {
  const oyentes = new Set();
  let estado = { conectado: true, ultimaTarjeta: null };
  let buffer = "";
  let ultimoMomento = 0;
  let empezado = false;

  const avisar = (cambio) => {
    estado = { ...estado, ...cambio };
    for (const o of oyentes) { try { o(estado); } catch {} }
  };

  // Si el lector escribió encima del campo que tenía el foco (el usuario,
  // el PIN, lo que fuera), lo deja limpio apenas se confirma la tarjeta —
  // tiene más sentido mostrar el resultado de la tarjeta que un número
  // suelto a medio escribir donde ya no importa.
  function limpiarCampoActivo() {
    if (typeof document === "undefined") return;
    const el = document.activeElement;
    if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return;
    const proto = el.tagName === "INPUT" ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (!setter) return;
    setter.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function manejarTecla(e) {
    const ahora = (typeof performance !== "undefined" ? performance.now() : Date.now());
    const rapido = ahora - ultimoMomento < UMBRAL_RAPIDO_MS;
    ultimoMomento = ahora;

    if (e.key === "Enter") {
      const candidato = buffer;
      buffer = "";
      if (rapido && candidato.length >= LARGO_MINIMO && candidato.length <= LARGO_MAXIMO) {
        e.preventDefault();
        e.stopPropagation();
        limpiarCampoActivo();
        avisar({ ultimaTarjeta: { uid: candidato.toUpperCase(), momento: new Date().toISOString() } });
      }
      return;
    }

    if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
      if (!rapido) buffer = ""; // se nota la pausa: es el inicio de un tecleo nuevo
      buffer += e.key;
      if (buffer.length > LARGO_MAXIMO) buffer = ""; // mucho más largo que cualquier tarjeta real: no era un lector
    } else if (e.key !== "Shift") {
      buffer = ""; // cualquier otra tecla (flechas, Backspace, etc.) corta la racha
    }
  }

  function empezar() {
    if (empezado || typeof window === "undefined") return;
    empezado = true;
    // Captura (3er argumento `true`): se entera de la tecla antes que el
    // campo de texto, para poder cancelar solo el Enter de una tarjeta
    // detectada sin afectar jamás una tecla tecleada a mano.
    window.addEventListener("keydown", manejarTecla, true);
  }

  return {
    estado: () => estado,
    /* Empieza a escuchar la primera vez que alguien llama esto — no hace
       falta llamar nada aparte. Devuelve cómo dejar de escuchar. */
    escuchar(oyente) {
      empezar();
      oyentes.add(oyente);
      oyente(estado);
      return () => oyentes.delete(oyente);
    },
  };
}

/* Una sola instancia por pestaña — igual que `balanza` en lib/balanza.js. */
export const puenteNFC = crearPuenteNFC();

/* Atajo para los formularios: llama onTarjeta(uid) cada vez que llega una
   tarjeta NUEVA mientras el formulario está abierto (no repite la misma
   si el componente se vuelve a renderizar). Devuelve la función para dejar
   de escuchar — se usa como limpieza de useEffect. */
export function escucharTarjetaNFC(onTarjeta) {
  // OJO: puenteNFC.escuchar() avisa de una con el estado actual apenas se
  // suscribe alguien (para que, por ejemplo, el punto de "lector
  // conectado" se pinte bien de entrada). Si "ultimoMomentoVisto" partiera
  // en null, ese primer aviso síncrono se tomaría como "tarjeta nueva" y
  // dispararía onTarjeta() con la ÚLTIMA tarjeta leída en toda la pestaña
  // (aunque sea de hace rato, de otro formulario) — pasaba cada vez que un
  // modal se volvía a armar (p.ej. pedir la tarjeta de respaldo después de
  // la principal): saltaba el error de "tarjeta duplicada" solo con abrir
  // el modal, sin acercar ninguna tarjeta. Por eso acá se parte sabiendo
  // cuál fue la última tarjeta ANTES de suscribirse, para que ese primer
  // aviso no cuente — solo una tarjeta de verdad nueva (con un momento
  // distinto al de ahora) dispara onTarjeta.
  let ultimoMomentoVisto = puenteNFC.estado().ultimaTarjeta?.momento ?? null;
  return puenteNFC.escuchar((estado) => {
    const t = estado.ultimaTarjeta;
    if (!t || t.momento === ultimoMomentoVisto) return;
    ultimoMomentoVisto = t.momento;
    onTarjeta(t.uid);
  });
}
