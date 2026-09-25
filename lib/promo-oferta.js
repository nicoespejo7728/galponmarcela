/* Imagen promocional de una oferta, armada en el navegador con <canvas> a
   partir de su nombre, sus tramos "N por $X" y —si se adjuntaron— fotos de
   los productos que participan. No hay diseño que tocar a mano: se arma
   sola cada vez que cambia algo relevante (ver OfertaModal en
   sistema-ventas.jsx), y lo único que se guarda es el resultado (un JPEG),
   no las piezas sueltas.

   Formato vertical de "historia" (1080x1920): pensado para compartir tal
   cual por WhatsApp o Instagram, sin tener que recortar nada.

   Estilo (pedido de Fran, sept. 2026: "la imagen es visualmente fea, hazla
   más amigable"): cartel de feria/almacén — franja roja arriba con el
   nombre del negocio, las fotos al centro bien grandes, y una franja
   amarilla abajo con el precio bien grande y destacado, todo con borde
   azul grueso y letras con contorno, como los carteles que se hacen a mano
   para el mesón. La paleta de este cartel es propia (rojo/amarillo/azul),
   independiente de la paleta C del sistema — acá el objetivo es que se note
   de lejos en un grupo de WhatsApp, no que combine con la app. */

export const PROMO_ANCHO = 1080;
export const PROMO_ALTO = 1920;

// Paleta fija del cartel — ver comentario de arriba.
const AZUL = "#123a8f";
const AZUL_SUAVE = "rgba(18,58,143,0.65)";
const ROJO = "#e5231b";
const AMARILLO = "#ffd400";
const NARANJA = "#ff8c1a";
const BLANCO = "#ffffff";

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

// Igual que envolverTexto, pero para "píldoras" cortas (métodos de pago):
// arma filas completas en vez de cortar palabra por palabra.
function envolverPildoras(ctx, items, maxWidth, paddingX, gap) {
  const filas = [];
  let fila = [];
  let anchoFila = 0;
  for (const texto of items) {
    const anchoPildora = ctx.measureText(texto).width + paddingX * 2;
    const suma = fila.length > 0 ? anchoPildora + gap : anchoPildora;
    if (anchoFila + suma > maxWidth && fila.length > 0) {
      filas.push(fila);
      fila = [texto];
      anchoFila = anchoPildora;
    } else {
      fila.push(texto);
      anchoFila += suma;
    }
  }
  if (fila.length) filas.push(fila);
  return filas;
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

function rectRedondeado(ctx, x, y, w, h, r, { relleno, borde, grosorBorde }) {
  trazarRectRedondeado(ctx, x, y, w, h, r);
  if (relleno) { ctx.fillStyle = relleno; ctx.fill(); }
  if (borde) { ctx.lineWidth = grosorBorde || 8; ctx.strokeStyle = borde; ctx.stroke(); }
}

// Texto con contorno (relleno + borde) — es lo que le da el aire de cartel
// hecho a mano, con letras gruesas que se leen de lejos aunque la pantalla
// del celular sea chica.
function textoContorno(ctx, texto, x, y, { relleno, contorno, grosor, font }) {
  if (font) ctx.font = font;
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  if (contorno && grosor) {
    ctx.lineWidth = grosor;
    ctx.strokeStyle = contorno;
    ctx.strokeText(texto, x, y);
  }
  ctx.fillStyle = relleno;
  ctx.fillText(texto, x, y);
}
function textoContornoMultilinea(ctx, lineas, cx, y, lineHeight, opts) {
  for (const linea of lineas) {
    textoContorno(ctx, linea, cx, y, opts);
    y += lineHeight;
  }
  return y;
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

// Destello de cuatro puntas (✦) — los "brillitos" decorativos alrededor del
// título, como en un cartel de oferta hecho a mano.
function dibujarDestello(ctx, cx, cy, radio, color, rotacion = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotacion);
  ctx.fillStyle = color;
  const r1 = radio, r2 = radio * 0.34;
  ctx.beginPath();
  ctx.moveTo(0, -r1);
  ctx.quadraticCurveTo(r2, -r2, r1, 0);
  ctx.quadraticCurveTo(r2, r2, 0, r1);
  ctx.quadraticCurveTo(-r2, r2, -r1, 0);
  ctx.quadraticCurveTo(-r2, -r2, 0, -r1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function dibujarPuntitos(ctx, x, y, cols, rows, espacio, radio, color) {
  ctx.fillStyle = color;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.beginPath();
      ctx.arc(x + c * espacio, y + r * espacio, radio, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Carrito de compras, simplificado a puro trazo — solo decorativo, no hace
// falta que sea un ícono perfecto para cumplir su función acá.
function dibujarCarrito(ctx, x, y, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size * 0.1;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const w = size, h = size * 0.85;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.14, y + h * 0.2);
  ctx.lineTo(x + w * 0.94, y + h * 0.2);
  ctx.lineTo(x + w * 0.8, y + h * 0.64);
  ctx.lineTo(x + w * 0.3, y + h * 0.64);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.04);
  ctx.lineTo(x + w * 0.14, y + h * 0.2);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(x + w * 0.38, y + h * 0.8, w * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w * 0.72, y + h * 0.8, w * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Círculo con un visto — confirma "esto es lo que se lleva", al lado del
// precio grande.
function dibujarCheckCirculo(ctx, cx, cy, radio, colorFondo, colorCheck, colorBorde) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radio, 0, Math.PI * 2);
  ctx.fillStyle = colorFondo;
  ctx.fill();
  if (colorBorde) { ctx.lineWidth = radio * 0.14; ctx.strokeStyle = colorBorde; ctx.stroke(); }
  ctx.strokeStyle = colorCheck;
  ctx.lineWidth = radio * 0.18;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - radio * 0.42, cy + radio * 0.02);
  ctx.lineTo(cx - radio * 0.1, cy + radio * 0.34);
  ctx.lineTo(cx + radio * 0.46, cy - radio * 0.3);
  ctx.stroke();
  ctx.restore();
}

function pesos(n) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 })
    .format(Math.round(Number(n) || 0));
}

/* oferta: { name, tiers: [{quantity, price, paymentMethods}], productNames: string[] }
   fotos: string[] de data URLs (ya filtradas a las que sí se adjuntaron)
   settings: { businessName, businessLogo }
   colores: paleta C del sistema — ya no se usa para pintar el cartel (tiene
   su propia paleta, ver arriba), pero se sigue recibiendo por si alguna
   vez hace falta un color puntual del sistema. */
export async function generarImagenOferta({ oferta, fotos = [], settings = {} }) {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* no bloquea el resto */ }
  }

  const canvas = document.createElement("canvas");
  canvas.width = PROMO_ANCHO;
  canvas.height = PROMO_ALTO;
  const ctx = canvas.getContext("2d");
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = AZUL;
  ctx.fillRect(0, 0, PROMO_ANCHO, PROMO_ALTO);

  const MARGEN = 32;
  const anchoInterior = PROMO_ANCHO - MARGEN * 2;

  /* ---------- 1) Franja roja de arriba: "¡SÚPER OFERTA DE [NEGOCIO]!" ---------- */
  const fontBanner = "800 78px 'Space Grotesk', sans-serif";
  ctx.font = fontBanner;
  const nombreNegocio = (settings.businessName || "El Galpón").toUpperCase();
  const paddingBannerX = 60;
  const lineasBanner = envolverTexto(ctx, `¡SÚPER OFERTA DE ${nombreNegocio}!`, anchoInterior - paddingBannerX * 2).slice(0, 3);
  const lineHeightBanner = 88;
  const paddingBannerV = 46;
  const alturaBanner = paddingBannerV * 2 + lineasBanner.length * lineHeightBanner - (lineHeightBanner - 78);
  const yBanner = MARGEN;

  rectRedondeado(ctx, MARGEN, yBanner, anchoInterior, alturaBanner, 36, { relleno: ROJO, borde: AZUL, grosorBorde: 16 });

  // Destellos decorativos en las esquinas del banner, como en un cartel de feria.
  dibujarDestello(ctx, MARGEN + 30, yBanner + 24, 26, BLANCO, 0.3);
  dibujarDestello(ctx, MARGEN + anchoInterior - 34, yBanner + 30, 20, AMARILLO, -0.4);
  dibujarDestello(ctx, MARGEN + anchoInterior - 20, yBanner + alturaBanner - 22, 16, BLANCO, 0.6);
  dibujarDestello(ctx, MARGEN + 22, yBanner + alturaBanner - 18, 22, NARANJA, -0.2);

  let yTexto = yBanner + paddingBannerV + 62;
  yTexto = textoContornoMultilinea(ctx, lineasBanner, PROMO_ANCHO / 2, yTexto, lineHeightBanner, {
    relleno: BLANCO, contorno: AZUL, grosor: 10, font: fontBanner,
  });

  /* ---------- 2) Calcular primero la franja amarilla de abajo (el precio),
     para saber cuánto espacio le queda a las fotos en el medio. ---------- */
  const paddingAmarilloY = 44;
  const paddingAmarilloX = 56;
  const anchoInteriorAmarillo = anchoInterior - paddingAmarilloX * 2;

  const fontNombreOferta = "800 50px 'Space Grotesk', sans-serif";
  ctx.font = fontNombreOferta;
  const lineasNombre = envolverTexto(ctx, oferta.name, anchoInteriorAmarillo).slice(0, 2);
  const lineHeightNombre = 58;

  const tramos = (oferta.tiers || []).filter(t => Number(t.quantity) >= 2 && Number(t.price) > 0).slice(0, 2);

  // Métodos de pago con los que vale la oferta — se juntan de todos los
  // tramos (no solo del primero) para no dejar afuera uno que solo aplica
  // al segundo tramo.
  const metodos = [...new Set(tramos.flatMap(t => t.paymentMethods || []))].map(m => m.toUpperCase());
  const fontPildora = "700 26px 'Space Grotesk', sans-serif";
  ctx.font = fontPildora;
  const filasPildoras = metodos.length > 0 ? envolverPildoras(ctx, metodos, anchoInteriorAmarillo, 24, 14) : [];
  const alturaFilaPildora = 58;

  // Nombres de los productos, solo si la carpeta junta varios distintos —
  // con uno solo ya lo dice el nombre de la oferta.
  const mostrarProductos = (oferta.productNames || []).length > 1;
  const fontProductos = "500 26px system-ui, sans-serif";
  let lineasProductos = [];
  if (mostrarProductos) {
    ctx.font = fontProductos;
    lineasProductos = envolverTexto(ctx, oferta.productNames.join(" · "), anchoInteriorAmarillo).slice(0, 2);
  }
  const lineHeightProductos = 34;

  // Presupuesto de alto para cada bloque — se deja a propósito con margen de
  // sobra respecto a lo que el dibujo real avanza más abajo (líneas 320+),
  // para que nunca quede el precio pisando las píldoras de pago o los
  // nombres de los productos que van después.
  let alturaAmarilla = paddingAmarilloY;
  alturaAmarilla += lineasNombre.length * lineHeightNombre + 56;
  if (tramos.length > 0) {
    alturaAmarilla += 46;   // "LLEVA N UNIDADES"
    alturaAmarilla += 150;  // precio grande
    alturaAmarilla += 44;   // "por las N juntas" / precio unitario
    if (tramos.length > 1) alturaAmarilla += 66; // segundo tramo, más chico
    alturaAmarilla += 46;
  } else {
    alturaAmarilla += 120; // sin tramos: solo un llamado a preguntar el precio
  }
  if (filasPildoras.length > 0) alturaAmarilla += filasPildoras.length * (alturaFilaPildora + 14) + 10;
  if (lineasProductos.length > 0) alturaAmarilla += lineasProductos.length * lineHeightProductos + 18;
  alturaAmarilla += paddingAmarilloY;

  const yAmarillo = PROMO_ALTO - MARGEN - alturaAmarilla;

  /* ---------- 3) Fotos de los productos, en el espacio que queda al medio ---------- */
  const gapSecciones = 26;
  const yFotos = yTexto + 34;
  const altoFotosDisponible = Math.max(180, yAmarillo - gapSecciones - yFotos);

  if (fotos.length > 0) {
    const margenLateralFotos = MARGEN;
    const anchoDisponible = PROMO_ANCHO - margenLateralFotos * 2;
    const columnas = fotos.length === 1 ? 1 : fotos.length <= 4 ? 2 : 3;
    const filas = Math.ceil(fotos.length / columnas);
    const espacio = 14;
    const anchoCelda = (anchoDisponible - espacio * (columnas - 1)) / columnas;
    // Se deja crecer casi hasta el máximo disponible —las fotos son lo que
    // más debe notarse del cartel— con solo un tope generoso para no
    // terminar con una celda absurdamente alta cuando hay una sola foto y
    // sobra mucho espacio vertical.
    const altoCeldaMax = (altoFotosDisponible - espacio * (filas - 1)) / filas;
    const altoCelda = Math.min(altoCeldaMax, anchoCelda * 2.2);

    const imagenes = await Promise.all(fotos.map((f) => cargarImagen(f)));
    const altoGrilla = filas * altoCelda + (filas - 1) * espacio;
    const anchoGrilla = columnas * anchoCelda + (columnas - 1) * espacio;
    const inicioX = (PROMO_ANCHO - anchoGrilla) / 2;
    const inicioY = yFotos + (altoFotosDisponible - altoGrilla) / 2;
    imagenes.forEach((img, i) => {
      const col = i % columnas;
      const fila = Math.floor(i / columnas);
      const x = inicioX + col * (anchoCelda + espacio);
      const yCelda = inicioY + fila * (altoCelda + espacio);
      ctx.save();
      rectRedondeado(ctx, x, yCelda, anchoCelda, altoCelda, 22, { borde: AZUL, grosorBorde: 8 });
      ctx.clip();
      dibujarCover(ctx, img, x, yCelda, anchoCelda, altoCelda);
      ctx.restore();
      // El borde queda tapado por el clip de la foto — se vuelve a trazar
      // encima, sin relleno, para que se note parejo alrededor de la foto.
      rectRedondeado(ctx, x, yCelda, anchoCelda, altoCelda, 22, { borde: AZUL, grosorBorde: 8 });
    });
  } else {
    // Sin fotos adjuntas: en vez de dejar el espacio vacío, un emblema
    // grande de "% de descuento" mantiene el cartel vistoso igual.
    const cx = PROMO_ANCHO / 2;
    const cy = yFotos + altoFotosDisponible / 2;
    const radio = Math.min(altoFotosDisponible, anchoInterior) * 0.32;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radio, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fill();
    ctx.lineWidth = 14;
    ctx.strokeStyle = AMARILLO;
    ctx.stroke();
    ctx.restore();
    textoContorno(ctx, "%", cx, cy + radio * 0.32, {
      relleno: AMARILLO, contorno: BLANCO, grosor: 8, font: `800 ${Math.round(radio * 1.4)}px 'Space Grotesk', sans-serif`,
    });
    dibujarDestello(ctx, cx - radio * 1.15, cy - radio * 0.9, 22, BLANCO, 0.3);
    dibujarDestello(ctx, cx + radio * 1.2, cy + radio * 0.5, 26, NARANJA, -0.5);
    dibujarDestello(ctx, cx + radio * 0.9, cy - radio * 1.1, 18, AMARILLO, 0.6);
  }

  /* ---------- 4) Franja amarilla de abajo: el precio, bien grande ---------- */
  rectRedondeado(ctx, MARGEN, yAmarillo, anchoInterior, alturaAmarilla, 36, { relleno: AMARILLO, borde: AZUL, grosorBorde: 16 });
  dibujarPuntitos(ctx, MARGEN + 34, yAmarillo + 30, 4, 3, 16, 4, AZUL_SUAVE);
  dibujarPuntitos(ctx, MARGEN + anchoInterior - 34 - 3 * 16, yAmarillo + 30, 4, 3, 16, 4, AZUL_SUAVE);

  let yA = yAmarillo + paddingAmarilloY + 44;
  yA = textoContornoMultilinea(ctx, lineasNombre, PROMO_ANCHO / 2, yA, lineHeightNombre, {
    relleno: AZUL, font: fontNombreOferta,
  }) + 12;

  if (tramos.length > 0) {
    const hero = tramos[0];
    ctx.font = "700 40px 'Space Grotesk', sans-serif";
    ctx.fillStyle = AZUL;
    ctx.fillText(`LLEVA ${hero.quantity} Y PAGA`, PROMO_ANCHO / 2, yA);
    yA += 96;

    const fontPrecio = "800 130px 'Space Grotesk', sans-serif";
    ctx.font = fontPrecio;
    const textoPrecio = pesos(hero.price);
    const anchoTexto = ctx.measureText(textoPrecio).width;
    // Íconos de carrito y visto flanqueando el precio, como en un cartel de
    // almacén — se acomodan solos según el ancho del precio.
    const espacioIconos = 76;
    dibujarCarrito(ctx, PROMO_ANCHO / 2 - anchoTexto / 2 - espacioIconos - 6, yA - 66, 62, AZUL);
    dibujarCheckCirculo(ctx, PROMO_ANCHO / 2 + anchoTexto / 2 + espacioIconos + 30, yA - 40, 40, AZUL, BLANCO, null);
    textoContorno(ctx, textoPrecio, PROMO_ANCHO / 2, yA, { relleno: ROJO, contorno: BLANCO, grosor: 12, font: fontPrecio });
    yA += 46;

    ctx.font = "500 30px system-ui, sans-serif";
    ctx.fillStyle = AZUL;
    const precioUnitario = pesos(Number(hero.price) / Number(hero.quantity));
    ctx.fillText(`por las ${hero.quantity} unidades juntas · ${precioUnitario} c/u`, PROMO_ANCHO / 2, yA);
    yA += 26;

    if (tramos.length > 1) {
      const t2 = tramos[1];
      yA += 44;
      ctx.font = "700 32px 'Space Grotesk', sans-serif";
      ctx.fillStyle = AZUL;
      ctx.fillText(`También: ${t2.quantity} unidades por ${pesos(t2.price)}`, PROMO_ANCHO / 2, yA);
    }
  } else {
    ctx.font = "600 32px 'Space Grotesk', sans-serif";
    ctx.fillStyle = AZUL;
    ctx.fillText("¡Consulta el precio en el mesón!", PROMO_ANCHO / 2, yA + 20);
  }
  yA = yAmarillo + alturaAmarilla - paddingAmarilloY;

  // Píldoras de métodos de pago — pegadas contra el borde inferior de la franja.
  if (filasPildoras.length > 0) {
    let yPildora = yA - (lineasProductos.length > 0 ? lineasProductos.length * lineHeightProductos + 18 : 0) - filasPildoras.length * (alturaFilaPildora + 14) + alturaFilaPildora - 18;
    ctx.font = fontPildora;
    for (const fila of filasPildoras) {
      const anchosPildora = fila.map(t => ctx.measureText(t).width + 24 * 2);
      const anchoTotal = anchosPildora.reduce((a, b) => a + b, 0) + 14 * (fila.length - 1);
      let x = PROMO_ANCHO / 2 - anchoTotal / 2;
      fila.forEach((texto, i) => {
        const w = anchosPildora[i];
        rectRedondeado(ctx, x, yPildora - alturaFilaPildora * 0.72, w, alturaFilaPildora, alturaFilaPildora / 2, { relleno: AZUL });
        ctx.fillStyle = BLANCO;
        ctx.fillText(texto, x + w / 2, yPildora - 6);
        x += w + 14;
      });
      yPildora += alturaFilaPildora + 14;
    }
  }

  // Nombres de los productos participantes, al pie de la franja amarilla.
  if (lineasProductos.length > 0) {
    ctx.font = fontProductos;
    ctx.fillStyle = AZUL_SUAVE;
    let yProd = yA - lineasProductos.length * lineHeightProductos + lineHeightProductos - 8;
    for (const linea of lineasProductos) {
      ctx.fillText(linea, PROMO_ANCHO / 2, yProd);
      yProd += lineHeightProductos;
    }
  }

  return canvas.toDataURL("image/jpeg", 0.92);
}
