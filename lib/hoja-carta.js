/* La hoja carta para tener al lado de la caja.

   Es otra cosa que la etiqueta. La etiqueta se pega en el producto; esta hoja
   se imprime en la impresora de siempre, se mete en una carpeta junto a la
   registradora y sirve para lo que no alcanza a tener etiqueta pegada: el
   granel que se pesa, lo que se vende de una caja abierta, lo que se despegó.
   Se busca el nombre con el dedo y se le pasa la pistola a la hoja.

   Por eso el código va grande. En una carta de 216 mm caben tres columnas de
   66, y el módulo queda en medio milímetro — casi el doble de los 0,264 mm que
   pide la norma. Un lector barre eso desde veinte centímetros sin pensarlo.
   Meter cuatro o cinco columnas ahorraría hojas y volvería la hoja inútil.

   Las páginas se arman acá y no se dejan al navegador: cada uno corta las
   páginas donde quiere, y una fila partida al medio deja un código con las
   barras cortadas, que es exactamente lo que no puede pasar. */

/* Con extensión y ruta relativa a propósito: así el mismo archivo lo puede
   importar Node al correr las pruebas, sin el resolvedor de Next de por medio.
   Una prueba que importa una copia del código no prueba nada. */
import { svgEan13 } from "./codigos-barra.js";

export const CARTA_COLUMNAS = 3;
export const CARTA_FILAS = 6;
export const CARTA_POR_HOJA = CARTA_COLUMNAS * CARTA_FILAS;

/* El ancho del código en la hoja. De acá sale lo único que decide si la
   pistola lee o no: 58 mm repartidos en los 106 módulos de un EAN-13 con sus
   zonas de silencio dan 0,547 mm por módulo. */
export const CARTA_ANCHO_CODIGO_MM = 58;

export function escaparHtml(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function precio(n) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 })
    .format(Math.round(n || 0));
}

/* En cuántas hojas cae una cantidad de productos. Se expone para poder decirlo
   en pantalla antes de abrir la ventana de impresión. */
export function hojasQueSalen(cuantos) {
  return Math.ceil(Math.max(0, cuantos) / CARTA_POR_HOJA);
}

export function hojaCartaDeCodigos(productos, settings, hoy = new Date()) {
  const lista = [...(productos || [])].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), "es"));

  const paginas = [];
  for (let i = 0; i < lista.length; i += CARTA_POR_HOJA) paginas.push(lista.slice(i, i + CARTA_POR_HOJA));

  const fecha = hoy.toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" });
  const negocio = escaparHtml(settings?.businessName || "El Galpón de Marcela");

  const cuerpo = paginas.map((pagina, n) => `
    <section class="pagina">
      <header class="cabecera">
        <span><strong>${negocio}</strong> · códigos internos</span>
        <span>${fecha} · hoja ${n + 1} de ${paginas.length}</span>
      </header>
      <div class="grilla">
        ${pagina.map(p => `
          <div class="celda">
            <div class="nombre">${escaparHtml(p.name)}</div>
            <div class="codigo">${svgEan13(p.barcode, { ancho: 1.4, alto: 44, margen: 8, conTexto: true })}</div>
            <div class="pie">
              <span class="seccion">${escaparHtml(p.category || "")}</span>
              <span class="precio">${p.price > 0 ? precio(p.price) : ""}</span>
            </div>
          </div>`).join("")}
        ${Array.from({ length: CARTA_POR_HOJA - pagina.length },
            () => `<div class="celda vacia"></div>`).join("")}
      </div>
    </section>`).join("");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Códigos internos — ${negocio}</title>
<style>
  @page { size: letter; margin: 8mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; color: #000; }
  .pagina { page-break-after: always; break-after: page; }
  .pagina:last-child { page-break-after: auto; break-after: auto; }
  .cabecera {
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: 8pt; color: #444; padding-bottom: 1.5mm; margin-bottom: 2mm;
    border-bottom: 0.4mm solid #000;
  }
  .grilla { display: grid; grid-template-columns: repeat(${CARTA_COLUMNAS}, 1fr); gap: 1.5mm; }
  .celda {
    border: 0.3mm dashed #bbb; border-radius: 1.5mm;
    padding: 1.5mm 1mm; height: 41mm;
    display: flex; flex-direction: column; align-items: center; justify-content: space-between;
    overflow: hidden; break-inside: avoid; page-break-inside: avoid;
  }
  .celda.vacia { border-color: transparent; }
  .nombre {
    font-size: 8pt; font-weight: 700; line-height: 1.15; text-align: center;
    width: 100%; max-height: 9mm; overflow: hidden;
  }
  /* El SVG trae su propia proporción; acá se fija el ancho, que es lo que
     decide el grosor de la barra. Tocar este número es tocar si se lee. */
  .codigo svg { display: block; width: ${CARTA_ANCHO_CODIGO_MM}mm; height: auto; }
  /* El código interno no cambia la sección del producto: son dos cosas
     distintas y por eso la sección va impresa acá, al lado del precio. */
  .pie {
    width: 100%; display: flex; justify-content: space-between; align-items: baseline;
    gap: 2mm; min-height: 4mm;
  }
  .seccion { font-size: 6.5pt; color: #666; text-transform: uppercase; letter-spacing: .2px;
             overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .precio { font-size: 10pt; font-weight: 700; font-family: ui-monospace, monospace; white-space: nowrap; }
  @media screen {
    body { background: #eee; padding: 10px; }
    .pagina { background: #fff; width: 216mm; margin: 0 auto 10px; padding: 8mm; box-shadow: 0 1px 4px rgba(0,0,0,.25); }
    .aviso { max-width: 216mm; margin: 0 auto 8px; font-size: 13px; color: #333; }
  }
  @media print { .aviso { display: none; } }
</style></head>
<body>
  <p class="aviso">${lista.length} producto(s) en ${paginas.length} hoja(s) tamaño carta. Imprime al 100%, sin "ajustar a la página": si se achica, las barras se angostan y la pistola deja de leerlas.</p>
  ${cuerpo}
  <script>window.addEventListener("load", () => setTimeout(() => window.print(), 500));<\/script>
</body></html>`;
}
