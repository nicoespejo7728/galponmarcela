/* La balanza del mesón, conectada por USB.

   La balanza es de las que se enchufan al computador por un cable USB que por
   dentro es un puerto serie (RS-232). El navegador puede leer ese puerto —
   Chrome tiene Web Serial desde 2021— así que no hace falta instalar ningún
   programa aparte: el sistema le pide el puerto al computador una vez, y
   después lo abre solo.

   El problema es que "balanza serial" no es un formato: es un enchufe. Cada
   fabricante manda lo que quiere, a la velocidad que quiere. Las que se venden
   acá vienen sin manual y sin marca, y la que compró Nico todavía no llega,
   así que este archivo no puede escribirse contra un formato concreto. Lo que
   hace en cambio es reconocer las familias que existen y probarlas todas
   contra la balanza que haya enchufada, hasta que una calce.

   Son dos preguntas independientes:

   1. **¿Habla sola o hay que preguntarle?** Muchas balanzas de mesón mandan el
      peso sin parar, varias veces por segundo. Otras se quedan mudas hasta que
      uno les manda un byte (ENQ, o "W", o "S") y recién ahí contestan.
   2. **¿A qué velocidad?** Casi siempre 9600, pero hay de 4800, 2400 y 19200.
      A la velocidad equivocada no llega silencio: llega basura, que es peor,
      porque parece que está hablando.

   Y una tercera que no se puede adivinar sola: **¿en qué unidad?** Si la trama
   dice "kg" o "g" está resuelto. Si manda el número pelado —y varias lo
   hacen— no hay forma de saber si "1.234" es un kilo y fracción o mil
   doscientos gramos. Eso se pregunta una vez, mirando la pantalla de la
   balanza, y queda guardado. */

/* Las velocidades, en orden de qué tan probable es cada una. */
export const BAUDIOS = [9600, 4800, 19200, 2400, 38400, 115200];

/* Las formas de pedirle el peso. `bytes` en null significa que no hay que
   pedirle nada: la balanza habla sola. */
export const PREGUNTAS = [
  { id: "sola", nombre: "habla sola", bytes: null },
  { id: "enq", nombre: "se le pide con ENQ", bytes: [0x05] },
  { id: "w", nombre: "se le pide con W", bytes: "W\r" },
  { id: "s", nombre: "se le pide con S", bytes: "S\r\n" },
  { id: "p", nombre: "se le pide con P", bytes: "P\r\n" },
  { id: "cr", nombre: "se le pide con un Enter", bytes: "\r" },
];

/* El orden en que se prueban las combinaciones. No es el producto cartesiano
   en cualquier orden: 9600 y "habla sola" cubre la enorme mayoría, y probar
   eso primero hace que la balanza típica se encuentre en menos de dos
   segundos en vez de en veinte. */
export function combinaciones() {
  const lista = [];
  for (const baudios of BAUDIOS) {
    for (const pregunta of PREGUNTAS) lista.push({ baudios, pregunta: pregunta.id });
  }
  return lista;
}

export const UNIDADES = {
  kg: 1, kgs: 1, kilo: 1, kilos: 1, k: 1,
  g: 0.001, gr: 0.001, grs: 0.001, gm: 0.001, gramos: 0.001,
  lb: 0.45359237, lbs: 0.45359237,
  oz: 0.028349523125,
};

/* Cuando la trama no dice la unidad hay que suponerla, y suponer mal significa
   cobrar mil veces de más o de menos. Así que se supone lo más conservador —
   kilos, que es lo que manda casi toda balanza de mesón— y la pantalla de
   diagnóstico obliga a confirmarlo contra lo que muestra el visor. */
export const UNIDAD_POR_OMISION = "kg";

/* ---------------------------------------------------------------------
   Leer una trama

   Todo lo que mandan estas balanzas cae en una de estas formas:

     ST,GS,+  1.234kg     CAS, A&D, Excell y la mayoría de las chinas
     US,NT,+  0.500 kg    lo mismo, inestable (US) y peso neto (NT)
     +0001.234kg          sin encabezado
     \x02?001.234\r       Toledo 8217: STX, byte de estado, peso, CR
     \x0201.234\x03X      Systel: STX, peso, ETX, XOR de control
     S S      1.234 kg    Mettler MT-SICS
       1.234 kg           el número pelado

   En vez de escribir un lector por cada una —que es lo que uno haría con el
   manual en la mano— se busca lo único que todas comparten: un número, y a
   veces una unidad pegada. Reconocer de más es barato; el riesgo real es
   confundir basura con un peso, y de eso se encarga `pareceBasura`. */

const MARCAS_INESTABLE = /\b(US|U|MOV|UNSTABLE)\b/;
const MARCAS_ESTABLE = /\b(ST|S|STABLE)\b/;

export function leerTrama(crudo) {
  const texto = String(crudo || "");
  /* El 0x11 solo, sin nada más, es "todavía se está moviendo" en varias
     balanzas. No es un peso ni es basura: es un "espera". */
  if (/^[\x11\x00-\x08\x0b\x0c\x0e-\x1f\s]*$/.test(texto)) return null;

  const limpio = texto
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ")   // control, menos \t \n \r
    .replace(/\s+/g, " ")
    .trim();
  if (!limpio) return null;

  /* El signo puede venir despegado del número: varias balanzas mandan el peso
     en un campo de ancho fijo y el "-" queda al principio del campo, con los
     espacios de relleno en medio ("ST,GS,-  0.020kg"). Perder ese signo
     convierte una tara en un cobro. */
  const NUMERO = "[+-]?\\s*\\d{1,7}(?:[.,]\\d{1,4})?";
  const sinRelleno = (n) => String(n).replace(/\s+/g, "");

  /* Primero se busca un número CON unidad pegada: es la lectura segura,
     porque la unidad ancla cuál de los números de la trama es el peso. */
  const conUnidad = limpio.match(
    new RegExp(`(${NUMERO})\\s*(kgs?|kilos?|grs?|gm|gramos|g|lbs?|oz)\\b`, "i"));

  let numero, unidad;
  if (conUnidad) {
    numero = sinRelleno(conUnidad[1]);
    unidad = conUnidad[2].toLowerCase();
  } else {
    /* Sin unidad: se toma el número más largo de la trama. En "ST,GS,+  1.234"
       los candidatos son "1.234" y nada más; en "02,+0001.234" gana el largo.
       Se prefiere el que tenga coma decimal, que es el que se parece a un
       peso. */
    const numeros = (limpio.match(new RegExp(NUMERO, "g")) || [])
      .map(sinRelleno)
      .filter(n => /\d/.test(n));
    if (!numeros.length) return null;
    numero = numeros
      .slice()
      .sort((a, b) => {
        const decA = /[.,]/.test(a) ? 1 : 0, decB = /[.,]/.test(b) ? 1 : 0;
        return (decB - decA) || (b.replace(/\D/g, "").length - a.replace(/\D/g, "").length);
      })[0];
    unidad = null;
  }

  const valor = Number(String(numero).replace(",", "."));
  if (!Number.isFinite(valor)) return null;

  /* La estabilidad solo se cree si viene dicha. Callado se toma por estable:
     una balanza que no informa estabilidad está mandando su peso final. */
  const cabeza = limpio.slice(0, 12).toUpperCase();
  const inestable = MARCAS_INESTABLE.test(cabeza) && !/\bST\b/.test(cabeza);
  const estable = !inestable;

  return {
    valor,
    unidad,                                   // null si la trama no la dice
    estable,
    /* En kilos solo si la trama trae la unidad. Si no, quien llama decide,
       con lo que se haya confirmado en el diagnóstico. */
    kilos: unidad ? valor * (UNIDADES[unidad] ?? 1) : null,
    crudo: texto,
    limpio,
  };
}

/* Convierte a kilos una lectura sin unidad, usando la que se confirmó. */
export function aKilos(lectura, unidadSupuesta = UNIDAD_POR_OMISION) {
  if (!lectura) return null;
  if (lectura.kilos !== null) return lectura.kilos;
  const factor = UNIDADES[String(unidadSupuesta).toLowerCase()] ?? 1;
  return lectura.valor * factor;
}

/* ¿Esto es basura de velocidad equivocada?

   A la velocidad equivocada el puerto no queda mudo: entrega bytes al azar. Y
   entre bytes al azar tarde o temprano aparece algo con forma de número, así
   que "pude leer un número" no alcanza como prueba de que la velocidad es la
   correcta. Lo que no aparece en la basura es CONSTANCIA: tramas parecidas,
   del mismo largo, una tras otra, con el mismo separador. */
export function pareceBasura(texto) {
  const t = String(texto || "");
  if (!t) return true;
  let raros = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    const imprimible = (c >= 0x20 && c <= 0x7e) || c === 0x0d || c === 0x0a
      || c === 0x02 || c === 0x03 || c === 0x05 || c === 0x11 || c === 0x09;
    if (!imprimible) raros++;
  }
  return raros / t.length > 0.25;
}

/* ---------------------------------------------------------------------
   Partir el flujo en tramas

   Las balanzas separan con retorno de carro, con salto de línea o con ETX. Y
   algunas no separan con nada: mandan un bloque de largo fijo y se callan unos
   milisegundos. Por eso además del separador hay un cierre por silencio: si
   pasaron 120 ms sin que llegue un byte, lo que haya en el buffer es una
   trama completa. */
export const SILENCIO_MS = 120;

export function crearPartidor(alTener) {
  let buffer = "";
  let reloj = null;

  const soltar = () => {
    reloj = null;
    const t = buffer;
    buffer = "";
    if (t.trim() || /[\x02\x03\x11]/.test(t)) alTener(t);
  };

  return {
    empujar(texto) {
      buffer += texto;
      let corte;
      while ((corte = buffer.search(/[\r\n\x03]/)) >= 0) {
        const trama = buffer.slice(0, corte);
        buffer = buffer.slice(corte + 1);
        if (trama.trim() || /[\x02\x11]/.test(trama)) alTener(trama);
      }
      if (reloj) clearTimeout(reloj);
      if (buffer) reloj = setTimeout(soltar, SILENCIO_MS);
    },
    cerrar() {
      if (reloj) clearTimeout(reloj);
      if (buffer.trim()) alTener(buffer);
      buffer = "";
    },
  };
}

/* ---------------------------------------------------------------------
   El puerto

   Todo lo de abajo toca `navigator.serial`, que existe en Chrome y Edge de
   computador. En el teléfono no existe —ni en Android ni en iPhone— y eso no
   se arregla con código: no hay forma de leer un puerto USB desde el navegador
   del teléfono. La caja del computador usa la balanza; el teléfono sigue
   escribiendo los gramos a mano, como hasta ahora. */

export function hayWebSerial() {
  return typeof navigator !== "undefined" && !!navigator.serial;
}

export function porQueNoSePuede() {
  if (typeof navigator === "undefined") return "Todavía no cargó la página.";
  if (navigator.serial) return null;
  const ua = String(navigator.userAgent || "");
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return "El iPhone y el iPad no pueden leer un puerto USB desde el navegador — no hay permiso que activar, Safari no tiene esa función. La balanza funciona en el computador de la caja.";
  }
  if (/Android/i.test(ua)) {
    return "Chrome de Android no puede leer un puerto USB. La balanza funciona en el computador de la caja.";
  }
  if (/Firefox/i.test(ua)) {
    return "Firefox no puede leer puertos USB. Abre el sistema en Chrome o en Edge para usar la balanza.";
  }
  if (/Safari/i.test(ua)) {
    return "Safari no puede leer puertos USB. Abre el sistema en Chrome o en Edge para usar la balanza.";
  }
  return "Este navegador no puede leer puertos USB. Se necesita Chrome o Edge, en un computador.";
}

/* Pedirle el puerto al computador. Tiene que salir de un clic de una persona
   —lo exige el navegador, y está bien que lo exija: es hardware— así que esto
   se llama desde el botón y no al cargar la página. */
export async function pedirPuerto() {
  if (!hayWebSerial()) throw new Error(porQueNoSePuede());
  return await navigator.serial.requestPort();
}

/* Los puertos que ya se autorizaron antes en este computador. Chrome los
   recuerda, así que a partir de la segunda vez la balanza se conecta sola. */
export async function puertosAutorizados() {
  if (!hayWebSerial()) return [];
  try { return await navigator.serial.getPorts(); } catch { return []; }
}

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

function aBytes(x) {
  if (x == null) return null;
  if (typeof x === "string") return new TextEncoder().encode(x);
  return new Uint8Array(x);
}

/* Abre el puerto y levanta las señales.

   Lo de las señales importa más de lo que parece: muchos adaptadores USB-serie
   baratos, y algunas balanzas, sacan su corriente de las líneas DTR y RTS. Sin
   levantarlas el puerto abre perfecto y no llega nunca un byte, y uno se pasa
   la tarde creyendo que el cable está malo. */
async function abrir(puerto, baudios) {
  await puerto.open({ baudRate: baudios, dataBits: 8, stopBits: 1, parity: "none", bufferSize: 4096, flowControl: "none" });
  try { await puerto.setSignals({ dataTerminalReady: true, requestToSend: true }); } catch { /* no todos lo permiten */ }
}

async function cerrar(puerto) {
  try { await puerto.close(); } catch { /* ya estaba cerrado */ }
}

/* Escucha el puerto un rato y devuelve lo que llegó, ya partido en tramas.
   Se usa tanto para descubrir la balanza como para el diagnóstico. */
async function escuchar(puerto, { pregunta, ms }) {
  const tramas = [];
  const partidor = crearPartidor(t => tramas.push(t));
  let crudo = "";

  const lector = puerto.readable.getReader();
  const decodificador = new TextDecoder("latin1");   // nunca falla: 1 byte = 1 char

  const bytes = aBytes(pregunta?.bytes);
  let soltarEscritor = null;
  if (bytes && puerto.writable) {
    const escritor = puerto.writable.getWriter();
    const mandar = async () => { try { await escritor.write(bytes); } catch { /* se cayó */ } };
    await mandar();
    const repreguntar = setInterval(mandar, 350);
    soltarEscritor = () => { clearInterval(repreguntar); try { escritor.releaseLock(); } catch {} };
  }

  const corte = setTimeout(() => { try { lector.cancel(); } catch {} }, ms);
  try {
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      const texto = decodificador.decode(value);
      crudo += texto;
      partidor.empujar(texto);
    }
  } catch { /* cancelado por el corte */ }
  finally {
    clearTimeout(corte);
    if (soltarEscritor) soltarEscritor();
    partidor.cerrar();
    try { lector.releaseLock(); } catch {}
  }

  return { tramas, crudo };
}

/* ¿Lo que llegó es una balanza hablando?

   Se pide más que "una trama se pudo leer": se pide que al menos dos tramas
   den un número, que ninguna sea basura de velocidad equivocada, y que los
   valores sean creíbles para una balanza de mesón (nada de treinta mil kilos).
   Con menos que eso se corre el riesgo de fijar una velocidad equivocada que
   funciona hoy y falla la primera vez que alguien pesa medio kilo. */
export function evaluar(tramas, unidadSupuesta = UNIDAD_POR_OMISION) {
  const utiles = [];
  let basura = 0;
  for (const t of tramas) {
    if (pareceBasura(t)) { basura++; continue; }
    const l = leerTrama(t);
    if (l) utiles.push(l);
  }
  if (basura > tramas.length / 4) return { sirve: false, motivo: "llegó basura — no es esta velocidad" };
  if (utiles.length < 2) return { sirve: false, motivo: utiles.length ? "llegó una sola lectura" : "no llegó ninguna lectura" };

  const kilos = utiles.map(l => aKilos(l, unidadSupuesta));
  const fuera = kilos.filter(k => !Number.isFinite(k) || Math.abs(k) > 300);
  if (fuera.length) return { sirve: false, motivo: "los números no parecen un peso" };

  return {
    sirve: true,
    lecturas: utiles,
    ultima: utiles[utiles.length - 1],
    diceUnidad: utiles.some(l => l.unidad),
    ejemplo: utiles[utiles.length - 1].crudo,
  };
}

/* Buscar la balanza: probar combinaciones hasta que una hable.

   `alProbar` se llama en cada intento para poder mostrarlo en pantalla — una
   búsqueda que puede tardar veinte segundos sin decir nada parece colgada. */
export async function descubrir(puerto, { alProbar, msPorIntento = 900, unidadSupuesta } = {}) {
  const intentos = [];
  for (const combo of combinaciones()) {
    const pregunta = PREGUNTAS.find(p => p.id === combo.pregunta);
    alProbar?.({ ...combo, nombre: pregunta.nombre });

    let resultado;
    try {
      await abrir(puerto, combo.baudios);
      const { tramas, crudo } = await escuchar(puerto, { pregunta, ms: msPorIntento });
      resultado = evaluar(tramas, unidadSupuesta);
      resultado.crudo = crudo;
      resultado.tramas = tramas;
    } catch (e) {
      resultado = { sirve: false, motivo: e?.message || "no se pudo abrir el puerto" };
    } finally {
      await cerrar(puerto);
    }

    intentos.push({ ...combo, ...resultado });
    if (resultado.sirve) {
      return { encontrada: true, baudios: combo.baudios, pregunta: combo.pregunta, ...resultado, intentos };
    }
  }
  return { encontrada: false, intentos };
}

/* ---------------------------------------------------------------------
   La balanza en marcha

   Una sola por computador: es un aparato físico, y dos partes del sistema
   leyendo el mismo puerto se pelean el flujo. Por eso esto es un objeto único
   al que se le suscriben las pantallas que quieran ver el peso. */

export const AJUSTES_GUARDADOS = "galpon.balanza";

export function leerAjustesGuardados() {
  try {
    const t = localStorage.getItem(AJUSTES_GUARDADOS);
    if (!t) return null;
    const a = JSON.parse(t);
    if (!a || !a.baudios) return null;
    return { baudios: a.baudios, pregunta: a.pregunta || "sola", unidad: a.unidad || UNIDAD_POR_OMISION };
  } catch { return null; }
}

export function guardarAjustes(a) {
  try { localStorage.setItem(AJUSTES_GUARDADOS, JSON.stringify(a)); } catch { /* modo incógnito */ }
}

export function olvidarAjustes() {
  try { localStorage.removeItem(AJUSTES_GUARDADOS); } catch {}
}

function crearBalanza() {
  const oyentes = new Set();
  let estado = {
    conectada: false, buscando: false, peso: null, estable: false,
    ajustes: null, error: null, ultimaCrudo: "", visto: 0,
  };
  let puerto = null;
  let cancelar = null;

  const avisar = (cambio) => {
    estado = { ...estado, ...cambio };
    for (const o of oyentes) { try { o(estado); } catch {} }
  };

  async function bombear() {
    const pregunta = PREGUNTAS.find(p => p.id === estado.ajustes.pregunta);
    const bytes = aBytes(pregunta?.bytes);
    const decodificador = new TextDecoder("latin1");
    const partidor = crearPartidor(trama => {
      const l = leerTrama(trama);
      if (!l) return;
      const kilos = aKilos(l, estado.ajustes.unidad);
      if (!Number.isFinite(kilos) || Math.abs(kilos) > 300) return;
      avisar({ peso: kilos, estable: l.estable, ultimaCrudo: trama, visto: Date.now() });
    });

    let repreguntar = null, escritor = null;
    if (bytes && puerto.writable) {
      escritor = puerto.writable.getWriter();
      const mandar = async () => { try { await escritor.write(bytes); } catch {} };
      await mandar();
      repreguntar = setInterval(mandar, 300);
    }

    const lector = puerto.readable.getReader();
    cancelar = () => { try { lector.cancel(); } catch {} };
    try {
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        partidor.empujar(decodificador.decode(value));
      }
    } catch (e) {
      if (estado.conectada) avisar({ error: "Se cortó la conexión con la balanza" });
    } finally {
      if (repreguntar) clearInterval(repreguntar);
      if (escritor) { try { escritor.releaseLock(); } catch {} }
      partidor.cerrar();
      try { lector.releaseLock(); } catch {}
      cancelar = null;
    }
  }

  return {
    estado: () => estado,
    escuchar(oyente) {
      oyentes.add(oyente);
      oyente(estado);
      return () => oyentes.delete(oyente);
    },

    /* Conectar con lo que ya se sabe. Devuelve false —sin reventar— si no hay
       nada guardado o el puerto no está: al abrir la caja no se puede parar
       todo porque la balanza esté desenchufada. */
    async conectarSolo() {
      if (!hayWebSerial() || estado.conectada) return estado.conectada;
      const ajustes = leerAjustesGuardados();
      if (!ajustes) return false;
      const puertos = await puertosAutorizados();
      if (!puertos.length) return false;
      return await this.conectar(puertos[0], ajustes);
    },

    async conectar(p, ajustes) {
      if (estado.conectada) await this.desconectar();
      try {
        puerto = p;
        await abrir(puerto, ajustes.baudios);
        avisar({ conectada: true, ajustes, error: null, peso: null });
        bombear();
        return true;
      } catch (e) {
        puerto = null;
        avisar({ conectada: false, error: e?.message || "No se pudo abrir el puerto" });
        return false;
      }
    },

    async desconectar() {
      avisar({ conectada: false, peso: null, estable: false });
      if (cancelar) cancelar();
      await esperar(60);
      if (puerto) await cerrar(puerto);
      puerto = null;
    },

    /* Buscar la balanza en un puerto recién autorizado. */
    async buscar(p, opciones = {}) {
      if (estado.conectada) await this.desconectar();
      avisar({ buscando: true, error: null });
      try {
        const hallazgo = await descubrir(p, opciones);
        avisar({ buscando: false });
        return hallazgo;
      } catch (e) {
        avisar({ buscando: false, error: e?.message || "Falló la búsqueda" });
        return { encontrada: false, intentos: [] };
      }
    },

    /* Escuchar el puerto tal cual, sin interpretar nada. Es lo que necesita la
       pantalla de diagnóstico el día que llegue la balanza: ver los bytes. */
    async espiar(p, { baudios, pregunta, ms = 2500 }) {
      if (estado.conectada) await this.desconectar();
      const preg = PREGUNTAS.find(x => x.id === pregunta) || PREGUNTAS[0];
      try {
        await abrir(p, baudios);
        const { tramas, crudo } = await escuchar(p, { pregunta: preg, ms });
        return { tramas, crudo, hex: aHex(crudo) };
      } finally {
        await cerrar(p);
      }
    },
  };
}

export function aHex(texto) {
  return Array.from(String(texto || ""))
    .map(c => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join(" ");
}

/* Los bytes de control se ven como su nombre, no como un cuadradito. Sirve
   para que en el diagnóstico se entienda qué separa las tramas. */
export function legible(texto) {
  const NOMBRES = { 0x02: "⟨STX⟩", 0x03: "⟨ETX⟩", 0x05: "⟨ENQ⟩", 0x0d: "⟨CR⟩", 0x0a: "⟨LF⟩", 0x11: "⟨DC1⟩", 0x09: "⟨TAB⟩" };
  return Array.from(String(texto || ""))
    .map(c => {
      const n = c.charCodeAt(0);
      if (NOMBRES[n]) return NOMBRES[n];
      if (n < 0x20 || n === 0x7f) return `⟨${n.toString(16).padStart(2, "0")}⟩`;
      return c;
    })
    .join("");
}

/* Una sola instancia por pestaña. */
export const balanza = crearBalanza();
