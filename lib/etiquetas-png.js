/* Las etiquetas como imagen, del tamaño exacto del rollo.

   La Niimbot D110 no es una impresora normal: no aparece en el menú de
   imprimir del navegador ni tiene controlador. Habla por Bluetooth con su
   propia aplicación, y esa aplicación imprime imágenes. Así que lo que hay que
   entregarle no es una hoja para imprimir, sino un PNG del porte justo de la
   etiqueta.

   Dos números mandan todo lo demás:

   - **8 píxeles por milímetro** (203 dpi), que es la resolución del cabezal.
     Una imagen con otra escala sale estirada o encogida, y un código de barras
     estirado no lo lee la pistola.
   - **El ancho del rollo**. En la D110 el cabezal son 96 píxeles, o sea 12 mm.
     Un rollo de 12 mm usa todo el ancho; uno de 14 no entra completo.

   El código va acostado, a lo largo de la etiqueta, y no de pie. En un rollo
   de 12 mm de ancho no hay dónde poner un EAN-13 parado: necesita más de 20 mm
   solo de barras. A lo largo de los 40 mm de la etiqueta entra cómodo. */

export const PIXELES_POR_MM = 8;

/* Los rollos, con la impresora que corresponde a cada uno.

   Importa cuál es cuál: el ancho del rollo tiene que caber en el cabezal, y
   los cabezales son de dos tamaños muy distintos. La D110 (y la D11, la D101)
   imprimen hasta 15 mm de ancho; las B1, B21 y B18 llegan a 50. Una etiqueta
   de 30 mm de ancho no entra en una D110 por más que se quiera: no es un
   ajuste, es que el papel es más ancho que el cabezal.

   La medida se lee en el papel del rollo o en su caja, y va siempre como
   ancho × largo. */
export const ROLLOS = [
  // El que se compró para el almacén va primero.
  { id: "12x40", ancho: 12, largo: 40, impresora: "D11 · D110 · D101", etiqueta: "12 × 40 mm — D110 (el del almacén)" },
  { id: "14x40", ancho: 14, largo: 40, impresora: "D11 · D110 · D101", etiqueta: "14 × 40 mm — D110" },
  { id: "14x28", ancho: 14, largo: 28, impresora: "D11 · D110 · D101", etiqueta: "14 × 28 mm — D110" },
  { id: "12x22", ancho: 12, largo: 22, impresora: "D11 · D110 · D101", etiqueta: "12 × 22 mm — D110 (muy chico para un EAN-13)" },
  { id: "50x30", ancho: 30, largo: 50, impresora: "B1 · B21 · B18", etiqueta: "50 × 30 mm — B1, B21, B18" },
  { id: "40x30", ancho: 30, largo: 40, impresora: "B1 · B21 · B18", etiqueta: "40 × 30 mm — B1, B21, B18" },
  { id: "50x14", ancho: 14, largo: 50, impresora: "B1 · B21 · B18", etiqueta: "50 × 14 mm — B1, B21, B18" },
];

/* Se mantiene el nombre viejo por si algo lo importa todavía. */
export const ROLLOS_D110 = ROLLOS;
export const ROLLO_POR_OMISION = ROLLOS[0];

/* Hasta dónde llega cada cabezal. Sirve para avisar cuando el rollo elegido no
   entra en la impresora que uno cree tener. */
export const ANCHO_MAXIMO_MM = { "D110": 15, "B": 50 };

/* ¿Va a poder leerlo la pistola?

   Un EAN-13 son 95 módulos más las zonas de silencio de los costados —11
   módulos en total— que no son decoración: sin ellas el lector no sabe dónde
   empieza el código. La norma pide 0,264 mm por módulo y admite reducir hasta
   un 80%, o sea 0,21 mm. Por debajo de eso la impresora térmica ya no resuelve
   la barra y el código queda lindo pero mudo. */
const MODULOS_TOTALES = 95 + 11;
const MODULO_MINIMO_MM = 0.21;

export function medirCodigo(largoMm) {
  const moduloMm = largoMm / MODULOS_TOTALES;
  return {
    moduloMm,
    seLee: moduloMm >= MODULO_MINIMO_MM,
    largoMinimoMm: Math.ceil(MODULOS_TOTALES * MODULO_MINIMO_MM * 10) / 10,
  };
}

/* Un módulo un poco más ancho que el mínimo legible (0.21 mm) — de sobra
   para que la pistola no dude, pero angosto a propósito: es lo que libera
   largo para el nombre en un rollo angosto (ver sobranteParaNombreMm). */
const MODULO_SEGURO_MM = 0.25;

/* Cuánto largo (mm) queda libre para el nombre si el código se angosta al
   mínimo seguro en vez de estirarse a ocupar todo el rollo, como se hacía
   antes. Si da negativo, ni angostado entra el código — es el mismo caso
   que ya avisa medirCodigo con "no se lee". */
function sobranteParaNombreMm(largoMm) {
  return largoMm - MODULOS_TOTALES * MODULO_SEGURO_MM - 2; // 2 mm de margen a los costados
}

/* Por debajo de esto, el nombre de canto queda demasiado apretado para
   leerse — mejor no ponerlo que ponerlo ilegible. */
const NOMBRE_LATERAL_MINIMO_MM = 8;

/* Qué cabe en la etiqueta.

   El nombre necesita alto libre encima del código (rollos anchos, 18 mm o
   más) o, si no hay alto, largo de sobra para ir de canto al lado del
   código angostado — que es el caso de la D110 (12 y 14 mm de ancho) con
   un rollo de 40 mm: no hay ni un milímetro de alto libre, pero el largo sí
   sobra si el código no ocupa el rollo entero. En un rollo angosto Y corto
   (el 14×28, o el 12×22 "muy chico para un EAN-13") no sobra ni de canto,
   y ahí sigue sin entrar, igual que antes. */
export function queCabe(anchoRolloMm, largoRolloMm = 40) {
  const arriba = anchoRolloMm >= 18;
  const sobrante = arriba ? 0 : sobranteParaNombreMm(largoRolloMm);
  const deCanto = !arriba && sobrante >= NOMBRE_LATERAL_MINIMO_MM;
  return {
    numero: anchoRolloMm >= 9,
    nombre: arriba || deCanto,
    nombreDeCanto: deCanto,
    precio: anchoRolloMm >= 24,
  };
}

/* Dibuja una etiqueta en un lienzo ya del tamaño correcto.
   `modulos` es la cadena de unos y ceros del código (ver codigos-barra.js). */
export function dibujarEtiqueta(ctx, { modulos, codigo, nombre, precio }, { anchoMm, largoMm }) {
  const px = PIXELES_POR_MM;
  const ancho = Math.round(largoMm * px);      // a lo largo del avance del papel
  const alto = Math.round(anchoMm * px);       // a lo ancho del rollo
  const cabe = queCabe(anchoMm, largoMm);

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, ancho, alto);
  ctx.fillStyle = "#000";

  const margenX = Math.round(1 * px);
  let arriba = Math.round(0.6 * px);
  let abajo = alto - Math.round(0.6 * px);

  /* Rollo angosto con largo de sobra (la D110 con un rollo de 40 mm): no hay
     alto libre para el nombre encima del código, así que se le reserva una
     franja de canto a la izquierda, angostando el código al mínimo seguro
     en vez de estirarlo a ocupar el rollo entero. En cualquier otro caso
     (rollo ancho, o angosto y corto) esto queda en 0 y todo sigue igual que
     antes. */
  let franjaNombrePx = 0;
  if (cabe.nombreDeCanto && nombre) {
    const anchoCodigoSeguro = Math.round(MODULOS_TOTALES * MODULO_SEGURO_MM * px);
    franjaNombrePx = Math.max(0, ancho - anchoCodigoSeguro - margenX);
  }

  if (cabe.nombre && nombre && !cabe.nombreDeCanto) {
    const tam = Math.round(2.1 * px);
    ctx.font = `bold ${tam}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(recortar(ctx, nombre, ancho - margenX * 2), ancho / 2, arriba);
    arriba += tam + Math.round(0.4 * px);
  }
  if (cabe.precio && precio) {
    const tam = Math.round(2.4 * px);
    ctx.font = `bold ${tam}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(precio, ancho / 2, abajo);
    abajo -= tam + Math.round(0.3 * px);
  }

  let altoDigitos = 0;
  if (cabe.numero) altoDigitos = Math.round(2.2 * px);

  /* Las barras se dibujan en píxeles ENTEROS. Media barra de ancho no existe
     en una térmica: el redondeo de cada barra por separado desalinea el código
     y lo vuelve ilegible. Se calcula el ancho de módulo en píxeles enteros y se
     centra lo que sobre.

     El código y sus dígitos se centran en lo que queda del largo después de
     descontar la franja del nombre de canto (si la hay, franjaNombrePx es 0
     y esto se comporta exactamente como antes). */
  const anchoUtil = ancho - franjaNombrePx;
  const moduloPx = cabe.nombreDeCanto
    ? Math.max(2, Math.floor(anchoUtil / MODULOS_TOTALES))    // angostado a propósito, ver MODULO_SEGURO_MM
    : Math.max(1, Math.floor(anchoUtil / MODULOS_TOTALES));   // como siempre: al máximo que entre
  const anchoCodigo = modulos.length * moduloPx;
  const x0 = franjaNombrePx + Math.max(0, Math.round((anchoUtil - anchoCodigo) / 2));
  const centroCodigoX = franjaNombrePx + anchoUtil / 2;

  const altoBarras = Math.max(px, abajo - arriba - altoDigitos);
  for (let i = 0; i < modulos.length; i++) {
    if (modulos[i] !== "1") continue;
    ctx.fillRect(x0 + i * moduloPx, arriba, moduloPx, altoBarras);
  }

  if (cabe.numero) {
    const tam = Math.round(1.9 * px);
    ctx.font = `${tam}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(codigo, centroCodigoX, arriba + altoBarras + Math.round(0.2 * px));
  }

  /* El nombre de canto: girado 90°, en la franja de la izquierda, con todo
     el alto de la etiqueta disponible (ahí no va nada más). Gira al revés
     de las agujas del reloj — se lee inclinando la vista hacia la izquierda,
     como en el lomo de un cuaderno. */
  if (cabe.nombreDeCanto && nombre && franjaNombrePx > Math.round(3 * px)) {
    const tam = Math.min(Math.round(2.6 * px), Math.round(franjaNombrePx * 0.7));
    ctx.save();
    ctx.translate(Math.round(franjaNombrePx / 2), alto / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = `bold ${tam}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(recortar(ctx, nombre, alto - margenX * 2), 0, 0);
    ctx.restore();
  }

  return { ancho, alto, moduloPx, moduloMm: moduloPx / px };
}

function recortar(ctx, texto, maximo) {
  let t = String(texto || "");
  if (ctx.measureText(t).width <= maximo) return t;
  while (t.length > 1 && ctx.measureText(t + "…").width > maximo) t = t.slice(0, -1);
  return t + "…";
}

/* ---------------------------------------------------------------------
   Un ZIP, a mano

   Son ciento veintiún productos: bajarlos de a un archivo no es una opción, y
   traer una biblioteca de compresión para esto tampoco —el sistema tiene que
   seguir funcionando sin internet, y cada dependencia nueva es peso que se
   descarga—. Un ZIP sin comprimir son dos encabezados y un CRC, y los PNG ya
   vienen comprimidos: comprimirlos de nuevo no ahorraría nada.
   --------------------------------------------------------------------- */

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function armarZip(archivos) {
  const codificador = new TextEncoder();
  const trozos = [];
  const central = [];
  let desplazamiento = 0;

  for (const { nombre, datos } of archivos) {
    const nombreBytes = codificador.encode(nombre);
    const crc = crc32(datos);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);   // firma de encabezado local
    local.setUint16(4, 20, true);           // versión necesaria
    local.setUint16(6, 0x0800, true);       // nombres en UTF-8
    local.setUint16(8, 0, true);            // sin compresión
    local.setUint16(10, 0, true);           // hora
    local.setUint16(12, 0x21, true);        // fecha (1980-01-01)
    local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true);
    local.setUint32(22, datos.length, true);
    local.setUint16(26, nombreBytes.length, true);
    local.setUint16(28, 0, true);
    trozos.push(new Uint8Array(local.buffer), nombreBytes, datos);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, 0, true);
    dir.setUint16(14, 0x21, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, datos.length, true);
    dir.setUint32(24, datos.length, true);
    dir.setUint16(28, nombreBytes.length, true);
    dir.setUint32(42, desplazamiento, true);
    central.push(new Uint8Array(dir.buffer), nombreBytes);

    desplazamiento += 30 + nombreBytes.length + datos.length;
  }

  const inicioCentral = desplazamiento;
  let largoCentral = 0;
  for (const t of central) largoCentral += t.length;

  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, largoCentral, true);
  fin.setUint32(16, inicioCentral, true);

  return new Blob([...trozos, ...central, new Uint8Array(fin.buffer)], { type: "application/zip" });
}

/* Un nombre de archivo que sobreviva a cualquier sistema: sin tildes, sin
   barras, sin dos puntos. Va con el código adelante para que el orden
   alfabético sea el mismo orden en que se repartieron. */
export function nombreDeArchivo(codigo, nombre) {
  const limpio = String(nombre || "etiqueta")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
    .slice(0, 40).replace(/ /g, "-");
  return `${codigo}-${limpio || "etiqueta"}.png`;
}
