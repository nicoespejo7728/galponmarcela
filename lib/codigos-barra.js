/* Códigos de barras propios del almacén.

   Hay productos que no traen código en el envase —las bolsas de regalo, lo que
   se compra a granel, lo que llegó suelto— y por eso la pistola no los
   encuentra: hay que buscarlos a mano en el catálogo con el cliente esperando.
   La salida es imprimirles una etiqueta con un código nuestro.

   El formato es EAN-13, el mismo de los envases, porque es el que lee
   cualquier pistola sin configurarle nada. Lo que cambia es de dónde sale el
   número: el rango 20–29 está reservado internacionalmente para el uso
   interno de un negocio, o sea que ningún fabricante del mundo puede tener uno
   igual. Dentro de ese rango se usa el bloque 290, que en este catálogo estaba
   entero libre (los diecisiete códigos que ya empiezan con 2 son 2000, 2019,
   2100, 2500, 26xx, 28xx y 2986, todos reales, de envase).

   Igual se comprueba uno por uno contra el catálogo completo —activos e
   inactivos— antes de asignarlo. Y la base tiene un índice único sobre el
   código, así que si algo se escapara, no entra.

   Las barras se dibujan acá, sin biblioteca de por medio: son cien líneas de
   tabla y así funciona con la conexión caída, que es justo cuando alguien va a
   estar imprimiendo etiquetas en la trastienda. */

export const PREFIJO_ALMACEN = "290";
const PREFIJO = PREFIJO_ALMACEN;

/* Las tres tablas del EAN-13. Cada dígito se dibuja distinto según de qué lado
   del código va y según el patrón que impone el primer dígito. */
const IZQ_A = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const IZQ_B = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const DERECHA = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
/* Qué mezcla de A y B lleva la mitad izquierda. Es la forma que tiene el
   EAN-13 de meter un decimotercer dígito sin agregar barras: el primer dígito
   no se dibuja, se codifica en este patrón. */
const PATRON = ["AAAAAA","AABABB","AABBAB","AABBBA","ABAABB","ABBAAB","ABBBAA","ABABAB","ABABBA","ABBABA"];

/* El dígito de control: se suma alternando peso 1 y 3, y se completa a la
   decena siguiente. Sin él la pistola pita pero no acepta el código. */
export function digitoVerificador(doce) {
  const d = String(doce).replace(/\D/g, "").padStart(12, "0").slice(0, 12);
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += Number(d[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (suma % 10)) % 10);
}

export function esEan13Valido(codigo) {
  const c = String(codigo || "").replace(/\D/g, "");
  if (c.length !== 13) return false;
  return digitoVerificador(c.slice(0, 12)) === c[12];
}

/* ¿Es uno de los nuestros? Sirve para reconocerlos después en pantalla, y para
   no volver a pedir "escanea el código del envase" sobre algo que ya tiene
   etiqueta impresa. */
export function esCodigoDelAlmacen(codigo) {
  const c = String(codigo || "").replace(/\D/g, "");
  return c.length === 13 && c.startsWith(PREFIJO) && esEan13Valido(c);
}

/* Reparte códigos nuevos, saltándose todo lo que ya existe en el catálogo.
   Recibe los productos enteros y no solo los códigos porque la comparación
   tiene que ser contra TODOS —incluidos los inactivos, que también ocupan el
   índice único de la base— y quien llama no siempre tiene esa lista aparte. */
export function repartirCodigos(productos, cuantos) {
  const ocupados = new Set(
    (productos || [])
      .map(p => String(p?.barcode || "").replace(/\D/g, ""))
      .filter(Boolean)
  );

  /* Se parte después del último que se haya repartido, no desde uno: así los
     códigos siguen siendo correlativos aunque se impriman en varias tandas, y
     una etiqueta perdida no se reutiliza para otro producto. */
  let n = 0;
  for (const c of ocupados) {
    if (!c.startsWith(PREFIJO) || c.length !== 13) continue;
    const secuencia = Number(c.slice(PREFIJO.length, 12));
    if (Number.isFinite(secuencia) && secuencia > n) n = secuencia;
  }

  const nuevos = [];
  const largoSecuencia = 12 - PREFIJO.length;
  while (nuevos.length < cuantos) {
    n++;
    if (n >= 10 ** largoSecuencia) throw new Error("Se acabaron los códigos internos disponibles");
    const doce = PREFIJO + String(n).padStart(largoSecuencia, "0");
    const codigo = doce + digitoVerificador(doce);
    if (ocupados.has(codigo)) continue;   // no debería pasar, pero no cuesta nada
    ocupados.add(codigo);
    nuevos.push(codigo);
  }
  return nuevos;
}

/* El dibujo: devuelve los módulos (unos y ceros) de izquierda a derecha.
   1 = barra, 0 = espacio. Cada módulo es igual de ancho. */
export function modulosEan13(codigo) {
  const c = String(codigo).replace(/\D/g, "").padStart(13, "0").slice(0, 13);
  const patron = PATRON[Number(c[0])];
  let bits = "101";                                   // guarda de inicio
  for (let i = 0; i < 6; i++) {
    const d = Number(c[1 + i]);
    bits += patron[i] === "A" ? IZQ_A[d] : IZQ_B[d];
  }
  bits += "01010";                                    // guarda del medio
  for (let i = 0; i < 6; i++) bits += DERECHA[Number(c[7 + i])];
  bits += "101";                                      // guarda de cierre
  return bits;
}

/* El código como SVG, listo para imprimir. Va como SVG y no como imagen
   generada al vuelo porque el rotulador imprime lo que le manda el navegador:
   un vector sale nítido a cualquier tamaño, y un mapa de bits escalado sale
   con las barras borroneadas — y una barra borroneada no la lee la pistola. */
export function svgEan13(codigo, { ancho = 1.4, alto = 46, margen = 10, conTexto = true } = {}) {
  const c = String(codigo).replace(/\D/g, "").padStart(13, "0").slice(0, 13);
  const bits = modulosEan13(c);
  const anchoTotal = bits.length * ancho + margen * 2;
  const altoTexto = conTexto ? 13 : 0;
  const altoTotal = alto + altoTexto + 4;

  /* Las barras de guarda —inicio, medio y fin— se dibujan un poco más largas.
     No es adorno: le dan a la pistola las referencias para saber dónde empieza
     y termina el código aunque lo lea torcido. */
  const esGuarda = (i) => i < 3 || (i >= 45 && i < 50) || i >= bits.length - 3;

  let barras = "";
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== "1") continue;
    const h = esGuarda(i) ? alto + 5 : alto;
    barras += `<rect x="${(margen + i * ancho).toFixed(2)}" y="0" width="${ancho}" height="${h}" fill="#000"/>`;
  }

  const texto = conTexto
    ? `<text x="${(anchoTotal / 2).toFixed(2)}" y="${alto + 16}" text-anchor="middle" font-family="monospace" font-size="11" letter-spacing="1.5" fill="#000">${c}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${anchoTotal.toFixed(2)}" height="${altoTotal}" viewBox="0 0 ${anchoTotal.toFixed(2)} ${altoTotal}">${barras}${texto}</svg>`;
}
