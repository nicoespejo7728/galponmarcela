/* Imagen promocional de una oferta, armada en el navegador con <canvas> a
   partir de su nombre, sus tramos "N por $X" y —si se adjuntaron— fotos de
   los productos que participan. No hay diseño que tocar a mano: se arma
   sola cada vez que cambia algo relevante (ver OfertaModal en
   sistema-ventas.jsx), y lo único que se guarda es el resultado (un JPEG),
   no las piezas sueltas.

   Formato vertical de "historia" (1080x1920): pensado para compartir tal
   cual por WhatsApp o Instagram, sin tener que recortar nada. */

export const PROMO_ANCHO = 1080;
export const PROMO_ALTO = 1920;

function cargarImagen(src, { crossOrigin } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar una imagen"));
    img.src = src;
  });
}

function envolverTexto(ctx, texto, maxWidth) {
  const palabras = String(texto || "").split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = "";
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width > maxWidth && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

function dibujarTextoCentrado(ctx, lineas, cx, y, lineHeight) {
  for (const linea of lineas) {
    ctx.fillText(linea, cx, y);
    y += lineHeight;
  }
  return y;
}

function trazarRectRedondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* Recorta y dibuja una imagen dentro de un rectángulo, tipo `object-fit:
   cover` — las fotos de productos no vienen todas con la misma proporción,
   y sin esto saldrían estiradas o con barras vacías al costado. */
function dibujarCover(ctx, img, x, y, w, h) {
  const escala = Math.max(w / img.width, h / img.height);
  const anchoDestino = img.width * escala;
  const altoDestino = img.height * escala;
  const dx = x + (w - anchoDestino) / 2;
  const dy = y + (h - altoDestino) / 2;
  ctx.drawImage(img, dx, dy, anchoDestino, altoDestino);
}

function pesos(n) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 })
    .format(Math.round(Number(n) || 0));
}

/* oferta: { name, tiers: [{quantity, price}], productNames: string[] }
   fotos: string[] de data URLs (ya filtradas a las que sí se adjuntaron)
   settings: { businessName, businessLogo }
   colores: paleta C del sistema (se pasa desde afuera para no duplicarla) */
export async function generarImagenOferta({ oferta, fotos = [], settings = {}, colores }) {
  const C = colores;
  if (typeof document !== "undefined" && document.fonts?.ready) {
    // Si la fuente de marca todavía no terminó de cargar, el texto sale con
    // una genérica del sistema — no es grave, pero mejor esperar el
    // instante que toma en vez de arriesgarse a eso.
    try { await document.fonts.ready; } catch { /* no bloquea el resto */ }
  }

  const canvas = document.createElement("canvas");
  canvas.width = PROMO_ANCHO;
  canvas.height = PROMO_ALTO;
  const ctx = canvas.getContext("2d");

  const fondo = ctx.createLinearGradient(0, 0, 0, PROMO_ALTO);
  fondo.addColorStop(0, C.green);
  fondo.addColorStop(1, C.greenDark);
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, PROMO_ANCHO, PROMO_ALTO);

  ctx.textAlign = "center";
  let y = 100;

  if (settings.businessLogo) {
    try {
      const logo = await cargarImagen(settings.businessLogo, { crossOrigin: "anonymous" });
      const alto = 110;
      const ancho = (logo.width / logo.height) * alto;
      ctx.drawImage(logo, (PROMO_ANCHO - ancho) / 2, y, ancho, alto);
      y += alto + 26;
    } catch {
      // Si el logo no carga (sin conexión, u otro origen sin CORS abierto),
      // se sigue sin él: la imagen no puede depender de que eso funcione.
    }
  }
  ctx.fillStyle = "#fff";
  ctx.font = "600 34px 'Space Grotesk', sans-serif";
  ctx.fillText((settings.businessName || "El Galpón").toUpperCase(), PROMO_ANCHO / 2, y);
  y += 76;

  // Insignia "¡OFERTA!"
  ctx.font = "800 54px 'Space Grotesk', sans-serif";
  const anchoInsignia = ctx.measureText("¡OFERTA!").width + 90;
  const altoInsignia = 96;
  ctx.fillStyle = C.rust;
  trazarRectRedondeado(ctx, (PROMO_ANCHO - anchoInsignia) / 2, y, anchoInsignia, altoInsignia, altoInsignia / 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText("¡OFERTA!", PROMO_ANCHO / 2, y + altoInsignia * 0.68);
  y += altoInsignia + 56;

  // Nombre de la oferta.
  ctx.font = "700 52px 'Space Grotesk', sans-serif";
  ctx.fillStyle = "#fff";
  const lineasNombre = envolverTexto(ctx, oferta.name, PROMO_ANCHO - 140).slice(0, 3);
  y = dibujarTextoCentrado(ctx, lineasNombre, PROMO_ANCHO / 2, y + 46, 62) + 30;

  // Fotos de los productos, en grilla, si se adjuntó alguna.
  if (fotos.length > 0) {
    const margenLateral = 70;
    const anchoDisponible = PROMO_ANCHO - margenLateral * 2;
    const altoDisponibleMax = 640;
    const columnas = fotos.length === 1 ? 1 : fotos.length <= 4 ? 2 : 3;
    const filas = Math.ceil(fotos.length / columnas);
    const espacio = 18;
    const anchoCelda = (anchoDisponible - espacio * (columnas - 1)) / columnas;
    const altoCelda = Math.min((altoDisponibleMax - espacio * (filas - 1)) / filas, anchoCelda);

    const imagenes = await Promise.all(fotos.map((f) => cargarImagen(f)));
    const altoGrilla = filas * altoCelda + (filas - 1) * espacio;
    const anchoGrilla = columnas * anchoCelda + (columnas - 1) * espacio;
    const inicioX = (PROMO_ANCHO - anchoGrilla) / 2;
    imagenes.forEach((img, i) => {
      const col = i % columnas;
      const fila = Math.floor(i / columnas);
      const x = inicioX + col * (anchoCelda + espacio);
      const yCelda = y + fila * (altoCelda + espacio);
      ctx.save();
      trazarRectRedondeado(ctx, x, yCelda, anchoCelda, altoCelda, 24);
      ctx.clip();
      dibujarCover(ctx, img, x, yCelda, anchoCelda, altoCelda);
      ctx.restore();
    });
    y += altoGrilla + 56;
  } else {
    y += 30;
  }

  // Tramos de precio (como mucho 2: con más, la letra grande no cabe y deja
  // de leerse de lejos, que es para lo que sirve esta imagen).
  const tramos = (oferta.tiers || []).slice(0, 2);
  for (const t of tramos) {
    ctx.font = "800 62px 'Space Grotesk', sans-serif";
    const texto = `${t.quantity} x ${pesos(t.price)}`;
    const anchoCaja = ctx.measureText(texto).width + 110;
    const altoCaja = 104;
    ctx.fillStyle = C.brass;
    trazarRectRedondeado(ctx, (PROMO_ANCHO - anchoCaja) / 2, y, anchoCaja, altoCaja, 20);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.fillText(texto, PROMO_ANCHO / 2, y + altoCaja * 0.68);
    y += altoCaja + 26;
  }

  // Qué productos participan, chico, al pie — sobre todo útil cuando la
  // carpeta junta varios sabores o marcas distintos.
  if (oferta.productNames?.length) {
    ctx.font = "400 30px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const lineas = envolverTexto(ctx, oferta.productNames.join(" · "), PROMO_ANCHO - 140).slice(0, 4);
    dibujarTextoCentrado(ctx, lineas, PROMO_ANCHO / 2, PROMO_ALTO - (lineas.length - 1) * 38 - 60, 38);
  }

  return canvas.toDataURL("image/jpeg", 0.9);
}
