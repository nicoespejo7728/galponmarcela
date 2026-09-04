/* Imprimir directo en la Niimbot D110, por Bluetooth, sin pasar por su
   propia aplicación (ver etiquetas-png.js para el porqué: la D110 no tiene
   controlador de impresora normal, solo habla con su app).

   La comunidad descifró el protocolo Bluetooth de estas impresoras — no es
   nada de Niimbot, es un proyecto abierto (niimblue / niimbluelib, de
   MultiMote) que un navegador puede hablar directo con la impresora usando
   Web Bluetooth, sin instalar nada. Esta pantalla lo usa así: el vendedor
   aprieta un botón, el navegador le pregunta con cuál impresora conectarse
   (el selector nativo de Bluetooth), y de ahí en más las etiquetas salen
   solas, con la cantidad de copias que se puso en pantalla — sin descargar
   imágenes ni volver a escribir la cantidad en otra aplicación.

   Dos advertencias, a propósito, para quien vuelva a mirar este archivo:

   1. La librería NO se instala con npm. Su versión "latest" en el registro
      trae de arrastre paquetes pensados para Node (serialport, noble) que
      no le sirven de nada al navegador y podían romper el build de Next
      con algo que ni se usa. En vez de eso, se carga en el navegador el
      archivo ya armado (UMD) que la misma librería publica — recién cuando
      alguien aprieta "Imprimir en la Niimbot", nunca antes. Así el resto
      del sitio no se entera de que esto existe.

   2. Es un protocolo de la comunidad, no oficial ni soportado por Niimbot,
      y la librería se declara ella misma "alpha". Puede que la primera
      etiqueta que salga no quede perfecta — lo más probable es que haga
      falta ajustar cuál "protocolo D110" usar (ver PROTOCOLOS_D110 más
      abajo) o el color de página que se le manda a la imagen. Quedó
      pensado para que esos dos ajustes sean un cambio de una línea acá,
      sin tocar la pantalla que lo usa. */

const VERSION_NIIMBLUELIB = "0.0.1-alpha.39";
const URL_NIIMBLUELIB = `https://unpkg.com/@mmote/niimbluelib@${VERSION_NIIMBLUELIB}/dist/umd/niimbluelib.min.js`;

let cargando = null;

/* Descarga la librería una sola vez por sesión de navegador y la deja en
   `window.niimbluelib` (es un <script> clásico, no un módulo). Si dos
   productos la piden a la vez, comparten la misma descarga. */
function cargarNiimblue() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Esto solo funciona en el navegador"));
  }
  if (window.niimbluelib) return Promise.resolve(window.niimbluelib);
  if (cargando) return cargando;
  cargando = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = URL_NIIMBLUELIB;
    script.async = true;
    script.onload = () => {
      if (window.niimbluelib) resolve(window.niimbluelib);
      else reject(new Error("La librería para conectar la impresora no quedó disponible después de cargarla"));
    };
    script.onerror = () => {
      cargando = null;
      reject(new Error("No se pudo descargar lo necesario para conectar la impresora — revisa la conexión a internet"));
    };
    document.head.appendChild(script);
  });
  return cargando;
}

/* Web Bluetooth solo existe en navegadores basados en Chrome (Chrome, Edge,
   Opera) — en el celular funciona en Android, pero NO en Safari ni en el
   navegador de iPhone/iPad, ni en el Safari de Mac. Es una limitación del
   navegador, no algo que este sistema pueda arreglar. */
export function hayWebBluetooth() {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

export function porQueNoSePuedeBluetooth() {
  if (hayWebBluetooth()) return "";
  return "Este navegador no puede hablar por Bluetooth con la impresora. Funciona en Chrome o Edge — en Windows, Mac, Linux o Android. No funciona en Safari ni en el navegador de iPhone/iPad.";
}

/* Hay dos variantes del protocolo D110 dando vueltas por ahí afuera —
   distintas tandas de fábrica de la misma impresora responden distinto.
   Se elige a mano la primera vez (probando cuál imprime bien) y de ahí en
   más se recuerda en este mismo computador — no es un dato del negocio,
   así que no viaja al resto del sistema. */
export const PROTOCOLOS_D110 = [
  { id: "D110", etiqueta: "D110 (normal)" },
  { id: "D110_MV4", etiqueta: "D110 — variante nueva (probar si la de arriba no imprime bien)" },
];
const CLAVE_PROTOCOLO = "niimbot-d110-protocolo";

export function protocoloGuardado() {
  try {
    const guardado = localStorage.getItem(CLAVE_PROTOCOLO);
    return PROTOCOLOS_D110.some(p => p.id === guardado) ? guardado : PROTOCOLOS_D110[0].id;
  } catch {
    return PROTOCOLOS_D110[0].id;
  }
}
export function guardarProtocolo(id) {
  try { localStorage.setItem(CLAVE_PROTOCOLO, id); } catch { /* modo privado u otro bloqueo — no es grave */ }
}

// Un solo cliente para toda la pestaña: conectarse de nuevo por cada
// producto sería mucho más lento y el navegador ni deja tener dos
// conexiones Bluetooth abiertas a la vez con el mismo aparato.
let cliente = null;

export function niimbotConectado() {
  return !!(cliente && cliente.isConnected());
}

/* Abre el selector de Bluetooth del navegador. Tiene que llamarse desde
   dentro de un clic del usuario — el navegador no deja pedir Bluetooth
   solo, sin que la persona lo haya gatillado. */
export async function conectarNiimbot() {
  const lib = await cargarNiimblue();
  if (!cliente) cliente = new lib.NiimbotBluetoothClient();
  if (!cliente.isConnected()) await cliente.connect();
  return cliente;
}

export async function desconectarNiimbot() {
  if (cliente && cliente.isConnected()) {
    try { await cliente.disconnect(); } catch { /* ya se estaba yendo, no importa */ }
  }
}

/* Imprime una tanda completa — varias etiquetas, cada una ya dibujada en su
   propio <canvas> (el mismo dibujo que usa la descarga de PNG, ver
   dibujarEtiqueta en etiquetas-png.js) y con cuántas copias de cada una.

   Es UNA sola tarea de impresión para toda la tanda, no una por producto:
   se le avisa de entrada cuántas páginas van a salir en total y después se
   le van pasando las imágenes de a una, así no hay que reiniciar el
   cabezal entre un producto y el siguiente.

   `etiquetas` es un arreglo de { canvas, copias, nombre }. `onProgreso` (si
   se pasa) se llama antes de imprimir cada una, para que la pantalla pueda
   mostrar "imprimiendo 3 de 12 — AGUA BENEDICTINO…". */
export async function imprimirTandaNiimbot(etiquetas, { onProgreso, protocolo } = {}) {
  const validas = (etiquetas || []).filter(e => e.copias > 0);
  if (validas.length === 0) return;

  const lib = await cargarNiimblue();
  const cli = await conectarNiimbot();
  const nombreTarea = protocolo || protocoloGuardado();

  // Se le pregunta a la impresora en qué sentido va la imagen (algunos
  // modelos la esperan "left", otros "top"). Si por algo no se puede
  // preguntar, se sigue con "left" — es lo que usan la D110 y la D11.
  let direccion = "left";
  try {
    const idModelo = await cli.abstraction.getPrinterModel();
    const meta = lib.getPrinterMetaById?.(idModelo);
    if (meta?.printDirection) direccion = meta.printDirection;
  } catch { /* no se pudo preguntar el modelo — se sigue con el valor por omisión */ }

  const totalPaginas = validas.reduce((s, e) => s + e.copias, 0);
  const tarea = cli.abstraction.newPrintTask(nombreTarea, { totalPages: totalPaginas });

  await tarea.printInit();
  for (let i = 0; i < validas.length; i++) {
    const etiqueta = validas[i];
    onProgreso?.({ indice: i, total: validas.length, nombre: etiqueta.nombre });
    // "black": la D110 imprime en un solo color (no como la B1, que tiene
    // variante roja). Es el valor más probable — si las etiquetas salen
    // con los colores invertidos, es lo primero que hay que revisar acá.
    const codificada = lib.ImageEncoder.encodeCanvas(etiqueta.canvas, "black", direccion);
    await tarea.printPage(codificada, etiqueta.copias);
    await tarea.waitForPageFinished();
  }
  await tarea.waitForFinished();
  await cli.abstraction.printEnd();
  onProgreso?.({ indice: validas.length, total: validas.length, listo: true });
}
