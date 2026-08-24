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

/* Después del último renglón el papel tiene que avanzar un poco: la barra de
   corte está más arriba que el cabezal, y sin este respiro el total queda
   partido por la mitad al cortar. */
export const AVANCE_FINAL_MM = 12;

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
export function boletaParaImprimir(sale, settings = {}, opciones = {}) {
  const anchoPapel = Number(opciones.anchoMm) || ANCHO_PAPEL_MM;
  const anchoUtil = Number(opciones.anchoUtilMm) || ANCHO_UTIL_MM;
  const avance = opciones.avanceMm ?? AVANCE_FINAL_MM;

  const conIva = settings.ivaIncluded !== false;
  const total = Number(sale?.total) || 0;
  const iva = conIva ? total - total / 1.19 : 0;
  const neto = total - iva;

  const lineas = (sale?.items || []).map(i => `
    <tr>
      <td class="que">${escapar(cantidad(i))} ${escapar(i.name)}</td>
      <td class="cuanto">${pesos((Number(i.price) || 0) * (Number(i.qty) || 0))}</td>
    </tr>`).join("");

  /* El medio de pago va ANTES del total, a propósito: así el total es el
     último renglón de la boleta y el papel se corta justo después, que es lo
     que se pidió. Sacarlo del todo habría sido perder un dato que sirve —
     sobre todo cuando la venta quedó fiada. */
  const antesDelTotal = [
    conIva ? `<tr class="tenue"><td>Neto</td><td class="cuanto">${pesos(neto)}</td></tr>` : "",
    conIva ? `<tr class="tenue"><td>IVA (19%)</td><td class="cuanto">${pesos(iva)}</td></tr>` : "",
    `<tr class="tenue"><td>Pago</td><td class="cuanto">${escapar(sale?.paymentMethod || "—")}</td></tr>`,
    sale?.paymentMethod === "Fiado"
      ? `<tr class="tenue"><td colspan="2">Queda debiendo${sale.customer ? `: ${escapar(sale.customer)}` : ""}</td></tr>`
      : "",
  ].filter(Boolean).join("");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Boleta ${escapar(sale?.invoiceNumber ?? "")}</title>
<style>
  /* La página es exactamente el rollo. El alto se mide y se escribe abajo, ya
     con la boleta armada — ver el guion al final del documento.

     Este valor es solo el respaldo por si ese guion no llega a correr: Chrome
     NO entiende "size: 58mm auto". Comprobado: con "auto" ignora la regla
     entera y saca una hoja carta de 216 × 279 mm, que es exactamente lo que
     hacía que la boleta saliera larguísima. Con un alto explícito la respeta
     al milímetro. */
  @page { size: ${anchoPapel}mm 150mm; margin: 0; }

  * { box-sizing: border-box; }
  html, body {
    width: ${anchoPapel}mm; margin: 0; padding: 0;
    background: #fff; color: #000;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  /* Todo el contenido vive dentro de los 48 mm que el cabezal alcanza, y
     centrado en el papel: los 5 mm de cada lado no imprimen. */
  .boleta {
    width: ${anchoUtil}mm; margin: 0 auto;
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
    /* 8 pt en monoespaciada da unos 28 caracteres en los 48 mm útiles, que es
       más o menos lo que entra en la fuente propia de la impresora. Con 9 pt
       entraban 25 y los nombres largos se partían en cuatro renglones: más
       papel, y más plata, por nada. */
    font-size: 8pt; line-height: 1.3;
  }
  .centro { text-align: center; }
  .negocio { font-weight: 700; font-size: 11pt; line-height: 1.2; margin-top: 1mm; }
  .chico { font-size: 7pt; }
  .logo { display: block; margin: 0 auto 1mm; max-width: ${Math.round(anchoUtil * 0.7)}mm; max-height: 14mm; object-fit: contain; }
  .raya { border-top: 1px dashed #000; margin: 1.5mm 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 0; }
  /* El nombre puede ser largo y tiene que partirse solo; el monto nunca se
     parte, y por eso se lleva su ancho mínimo pegado a la derecha. */
  .que { text-align: left; word-break: break-word; padding-right: 1.5mm; }
  .cuanto { text-align: right; white-space: nowrap; }
  .tenue td { font-size: 7.5pt; }
  .total td { font-weight: 700; font-size: 12pt; padding-top: 1mm; }
  /* El respiro final: la barra de corte está más arriba que el cabezal. */
  .avance { height: ${avance}mm; }
</style></head>
<body>
  <div class="boleta">
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
  </div>
  <script>
  window.addEventListener("load", () => {
  /* Se mide la boleta ya armada y se le dice a la página que mida exactamente
     eso. Así el papel corta justo después del total, sin arrastrar una hoja
     entera ni dejar un palmo en blanco.

     Se espera a que carguen las imágenes (el logo cambia el alto) y a que las
     tipografías estén listas, porque medir antes da un número que no es. */
  (async () => {
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    const px = document.querySelector(".boleta").getBoundingClientRect().height;
    /* Un milímetro de holgura sobre lo medido. Sin él, el redondeo deja el
       contenido un pelo más alto que la página y el navegador saca una
       segunda tira de papel con nada. */
    const mm = Math.ceil(px * 25.4 / 96) + 1;
    const hoja = document.createElement("style");
    hoja.textContent = "@page { size: ${anchoPapel}mm " + mm + "mm; margin: 0; }";
    document.head.appendChild(hoja);
    setTimeout(() => window.print(), 120);
  })();
  });
  <\/script>
</body></html>`;
}
