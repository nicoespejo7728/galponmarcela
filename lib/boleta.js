/* La boleta que sale por la impresora del mesón.

   La impresora es una POS-5890F: rollo de 58 mm, y de esos 58 solo imprime
   **48**. El cabezal son 384 puntos a 8 puntos por milímetro, y los 5 mm de
   cada costado son papel muerto: ahí no hay resistencias que calienten, así
   que lo que caiga en esa franja simplemente no aparece.

   Ese número —48— es el que manda todo lo de abajo, y es también el que
   explicaba que el detalle saliera corrido: la boleta se imprimía como parte
   de la página del sistema, en una hoja tamaño carta de 216 mm, y el precio de
   cada línea quedaba alineado al borde derecho de esa hoja imaginaria, muy
   lejos de los 48 mm que el papel alcanza a mostrar.

   Por eso la boleta se arma acá, en su propio documento, y no escondiendo el
   resto de la pantalla con CSS. Esconder no es lo mismo que no ocupar lugar:
   `visibility: hidden` deja el hueco igual, y esos huecos —el menú lateral, el
   carro, la pantalla entera— se imprimían como metros de papel en blanco.

   Y con `margin: 0` en la página desaparecen el encabezado y el pie que el
   navegador dibuja solo: la fecha arriba y la dirección web abajo. No hay que
   apagarlos en el diálogo de impresión; sin margen no tienen dónde ir. */

export const ANCHO_PAPEL_MM = 58;   // el rollo
export const ANCHO_UTIL_MM = 48;    // lo que de verdad imprime el cabezal

/* Los ajustes viven en el computador y no en la base, igual que los de la
   balanza: la impresora está enchufada a una caja concreta, y dos cajas
   pueden tener rollos o controladores distintos. */
export const AJUSTES_GUARDADOS = "galpon.boleta";

export const AJUSTES_POR_OMISION = {
  anchoMm: ANCHO_PAPEL_MM,
  anchoUtilMm: ANCHO_UTIL_MM,
  /* 0 = que la boleta se mida sola. Un número = ese alto fijo, para cuando el
     controlador de la impresora no acepta una página a medida y contesta "no
     se puede imprimir". */
  altoMm: 0,
  arribaMm: 2,
  avanceMm: 6,
};

export function leerAjustesBoleta() {
  try {
    const t = localStorage.getItem(AJUSTES_GUARDADOS);
    return t ? { ...AJUSTES_POR_OMISION, ...JSON.parse(t) } : { ...AJUSTES_POR_OMISION };
  } catch { return { ...AJUSTES_POR_OMISION }; }
}

export function guardarAjustesBoleta(a) {
  try { localStorage.setItem(AJUSTES_GUARDADOS, JSON.stringify(a)); } catch {}
}

/* Una venta de mentira para la boleta de prueba: sirve para dejar el papel
   calibrado sin tener que cobrarle a nadie. */
export function ventaDePrueba() {
  return {
    invoiceNumber: "PRUEBA", date: new Date().toISOString(), seller: "—",
    paymentMethod: "Efectivo", total: 3000,
    items: [{ name: "PRUEBA DE IMPRESIÓN", qty: 1, price: 3000, unitType: "unidad" }],
  };
}

/* Después del último renglón el papel tiene que avanzar un poco: la barra de
   corte está más arriba que el cabezal, y sin este respiro el total queda
   partido por la mitad al cortar. */
export const AVANCE_FINAL_MM = 8;

function escapar(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function pesos(n) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 })
    .format(Math.round(Number(n) || 0));
}

function fechaHora(iso) {
  try {
    return new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
  } catch { return String(iso || ""); }
}

const GRAMOS_POR_KILO = 1000;

function cantidad(item) {
  if (item?.unitType === "peso") return `${Math.round((Number(item.qty) || 0) * GRAMOS_POR_KILO)} g`;
  return `${Number(item?.qty) || 0}×`;
}

/* El documento completo, listo para mandar a imprimir.

   `opciones.avanceMm` y `opciones.anchoMm` existen para poder ajustarlo si el
   rollo de otra impresora no calza: son los dos únicos números que habría que
   tocar. */
/* La marca del trozo que se imprime. Es hijo directo de <body> a propósito:
   así la regla de abajo puede apagar TODO lo demás con una sola línea. */
export const ID_IMPRESION = "impresion-boleta";
export const ID_ESTILOS = "impresion-boleta-estilo";

/* Una venta de grupo de productos (migración 0033) queda guardada como
   varias líneas —una por marca real que se descontó— pero al cliente se le
   muestra una sola, igual que la vio armar en el carrito: se juntan de
   vuelta las líneas que comparten groupSaleTag, sumando la cantidad. Mismo
   criterio que itemsParaMostrar en sistema-ventas.jsx (ReceiptModal); se
   repite acá en vez de importarla para no acoplar este archivo al del
   componente. */
function itemsParaImprimir(items) {
  const porTag = new Map();
  const resultado = [];
  for (const it of items || []) {
    if (!it.groupSaleTag) { resultado.push(it); continue; }
    const existente = porTag.get(it.groupSaleTag);
    if (existente) { existente.qty = Number((existente.qty + it.qty).toFixed(3)); continue; }
    const copia = { ...it };
    porTag.set(it.groupSaleTag, copia);
    resultado.push(copia);
  }
  return resultado;
}

/* El contenido de la boleta, sin documento alrededor. */
export function cuerpoBoleta(sale, settings = {}, opciones = {}) {
  const conIva = settings.ivaIncluded !== false;
  const total = Number(sale?.total) || 0;
  const iva = conIva ? total - total / 1.19 : 0;
  const neto = total - iva;

  // Si la línea llevó oferta por cantidad (migración 0029), lo que se
  // muestra ya es el monto final —precio de lista por cantidad, menos el
  // descuento— y se agrega un renglón chico debajo explicando cuánto se
  // descontó, para que el cliente vea que no es un error de cobro.
  const lineas = itemsParaImprimir(sale?.items).map(i => {
    const descuento = Number(i.discount) || 0;
    const monto = (Number(i.price) || 0) * (Number(i.qty) || 0) - descuento;
    return `
    <tr>
      <td class="que">${escapar(cantidad(i))} ${escapar(i.name)}</td>
      <td class="cuanto">${pesos(monto)}</td>
    </tr>
    ${descuento > 0 ? `<tr class="tenue"><td class="que">&nbsp;&nbsp;Oferta cant.</td><td class="cuanto">-${pesos(descuento)}</td></tr>` : ""}`;
  }).join("");

  /* El medio de pago va ANTES del total: así el total es el último renglón y
     el papel se corta justo después. Sacarlo del todo habría sido perder un
     dato que sirve, sobre todo cuando la venta quedó fiada. */
  const antesDelTotal = [
    conIva ? `<tr class="tenue"><td>Neto</td><td class="cuanto">${pesos(neto)}</td></tr>` : "",
    conIva ? `<tr class="tenue"><td>IVA (19%)</td><td class="cuanto">${pesos(iva)}</td></tr>` : "",
    // Ley del Redondeo (Ley 20.956): el total ya viene ajustado a la
    // decena más cercana (ver redondearDiezPesos en sistema-ventas.jsx);
    // este renglón es solo para que la suma de las líneas de arriba y el
    // total de abajo no parezcan no cuadrar entre sí.
    sale?.roundingAdjustment
      ? `<tr class="tenue"><td>Redondeo</td><td class="cuanto">${sale.roundingAdjustment > 0 ? "+" : ""}${pesos(sale.roundingAdjustment)}</td></tr>`
      : "",
    `<tr class="tenue"><td>Pago</td><td class="cuanto">${escapar(sale?.paymentMethod || "—")}</td></tr>`,
    sale?.paymentMethod === "Pago combinado" && Array.isArray(sale.paymentBreakdown)
      ? sale.paymentBreakdown.map(d =>
          `<tr class="tenue"><td>&nbsp;&nbsp;${escapar(d.method)}</td><td class="cuanto">${pesos(Number(d.amount) || 0)}</td></tr>`
        ).join("")
      : "",
    sale?.paymentMethod === "Fiado"
      ? `<tr class="tenue"><td colspan="2">Queda debiendo${sale.customer ? `: ${escapar(sale.customer)}` : ""}</td></tr>`
      : "",
  ].filter(Boolean).join("");

  return `<div class="boleta">
    <div class="arriba"></div>
    <div class="centro">
      ${settings.businessLogo ? `<img class="logo" src="${escapar(settings.businessLogo)}" alt="">` : ""}
      <div class="negocio">${escapar(settings.businessName || "El Galpón")}</div>
      <div class="chico">${escapar(fechaHora(sale?.date))}</div>
      <div class="chico">Boleta #${escapar(sale?.invoiceNumber ?? "")}</div>
      <div class="chico">Vendedor: ${escapar(sale?.seller || "—")}${sale?.customer ? ` · ${escapar(sale.customer)}` : ""}</div>
    </div>
    <div class="raya"></div>
    <table>${lineas}</table>
    <div class="raya"></div>
    <table>
      ${antesDelTotal}
      <tr class="total"><td>TOTAL</td><td class="cuanto">${pesos(total)}</td></tr>
    </table>
    <div class="avance"></div>
  </div>`;
}

/* El aspecto de la boleta. `paraLaPagina` agrega lo que hace falta cuando esto
   se imprime desde dentro del sistema y no en un documento aparte: apagar todo
   lo demás. */
export function estilosBoleta(opciones = {}, paraLaPagina = false) {
  const a = { ...AJUSTES_POR_OMISION, ...opciones };
  const anchoPapel = Number(a.anchoMm) || ANCHO_PAPEL_MM;
  const anchoUtil = Number(a.anchoUtilMm) || ANCHO_UTIL_MM;
  const raiz = paraLaPagina ? `#${ID_IMPRESION} ` : "";

  /* Apagar el resto con display:none y no con visibility:hidden.

     Es la diferencia entre "no se ve" y "no ocupa lugar". Con visibility el
     menú, el carro y la pantalla entera seguían ocupando su espacio, y ese
     espacio salía como papel en blanco — metros de papel, porque la pantalla
     del sistema es larga. */
  const apagarElResto = "";

  return `
  * { box-sizing: border-box; }
  ${paraLaPagina ? "" : `html, body {
    width: ${anchoPapel}mm; margin: 0; padding: 0;
    background: #fff; color: #000;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }`}
  ${apagarElResto}
  /* Todo el contenido vive dentro de los milímetros que el cabezal alcanza, y
     centrado en el papel: los costados no imprimen. */
  ${raiz}.boleta {
    width: ${anchoUtil}mm; margin: 0 auto; color: #000;
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
    /* 8 pt en monoespaciada da unos 28 caracteres en 48 mm, más o menos lo que
       entra en la fuente propia de la impresora. */
    font-size: 8pt; line-height: 1.3; text-align: left;
  }
  ${raiz}.boleta * { color: #000; }
  ${raiz}.centro { text-align: center; }
  ${raiz}.negocio { font-weight: 700; font-size: 10pt; line-height: 1.15; }
  ${raiz}.chico { font-size: 7pt; }
  ${raiz}.logo { display: block; margin: 0 auto 0.5mm; max-width: ${Math.round(anchoUtil * 0.5)}mm; max-height: 8mm; object-fit: contain; }
  ${raiz}.raya { border-top: 1px dashed #000; margin: 1mm 0; }
  ${raiz}.boleta table { width: 100%; border-collapse: collapse; }
  ${raiz}.boleta td { vertical-align: top; padding: 0; border: 0; }
  /* El nombre se parte solo si es largo; el monto nunca se parte. */
  ${raiz}.que { text-align: left; word-break: break-word; padding-right: 1.5mm; }
  ${raiz}.cuanto { text-align: right; white-space: nowrap; }
  ${raiz}.tenue td { font-size: 7.5pt; }
  ${raiz}.total td { font-weight: 700; font-size: 12pt; padding-top: 1mm; }
  ${raiz}.avance { height: ${Number(a.avanceMm) || 0}mm; }
  ${raiz}.arriba { height: ${Number(a.arribaMm) || 0}mm; }`;
}

export function reglaDePagina(anchoMm, altoMm) {
  return `@page { size: ${anchoMm}mm ${altoMm}mm; margin: 0; }`;
}

/* Lo que solo vale al imprimir: apagar la pantalla y fijar el papel.

   Va aparte del aspecto de la boleta a propósito. El aspecto tiene que valer
   TAMBIÉN en pantalla, aunque la boleta esté escondida fuera de la vista,
   porque es ahí donde se la mide para saber cuánto papel pedir. Cuando los
   estilos vivían solo dentro de @media print, lo que se medía era una boleta
   sin formato —otra tipografía, otro ancho— y el número salía equivocado.

   Apagar con display:none y no con visibility:hidden es la otra mitad: es la
   diferencia entre "no se ve" y "no ocupa lugar", y lo que ocupa lugar sale
   como papel en blanco. */
export function estilosSoloImpresion(opciones = {}) {
  const a = { ...AJUSTES_POR_OMISION, ...opciones };
  const anchoPapel = Number(a.anchoMm) || ANCHO_PAPEL_MM;
  return `
  body > * { display: none !important; }
  body > #${ID_IMPRESION} {
    display: block !important;
    position: static !important; left: auto !important; top: auto !important;
    width: ${anchoPapel}mm !important;
  }
  html, body {
    width: ${anchoPapel}mm !important;
    height: auto !important; min-height: 0 !important;
    margin: 0 !important; padding: 0 !important;
    background: #fff !important; overflow: visible !important;
  }`;
}

/* El documento suelto, con la boleta adentro. Se usa para poder medirla y
   comprobarla fuera del sistema; lo que se imprime en el mesón usa las mismas
   dos piezas de arriba. */
export function boletaParaImprimir(sale, settings = {}, opciones = {}) {
  const a = { ...AJUSTES_POR_OMISION, ...opciones };
  const anchoPapel = Number(a.anchoMm) || ANCHO_PAPEL_MM;
  const altoFijo = Number(a.altoMm) || 0;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Boleta ${escapar(sale?.invoiceNumber ?? "")}</title>
<style>
  ${reglaDePagina(anchoPapel, altoFijo || 80)}
${estilosBoleta(a, false)}
</style></head>
<body>${cuerpoBoleta(sale, settings, a)}</body></html>`;
}
