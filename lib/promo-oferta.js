/* Imagen promocional de una oferta, armada en el navegador con <canvas> a
   partir de su nombre, sus tramos "N por $X" y —si se adjuntaron— fotos de
   los productos que participan. No hay diseño que tocar a mano: se arma
   sola cada vez que cambia algo relevante (ver OfertaModal en
   sistema-ventas.jsx), y lo único que se guarda es el resultado (un JPEG),
   no las piezas sueltas.

   Formato vertical de "historia" (1080x1920): pensado para compartir tal
   cual por WhatsApp o Instagram, sin tener que recortar nada.

   Tres estilos a elegir por oferta (pedido de Fran, oct. 2026, mandó
   ejemplos de carteles que le gustan y pidió que el sistema se acercara a
   esos en vez del diseño anterior):
     - "vibrante": morado/rosado degradado, letras blancas con contorno,
       precio en una explosión amarilla — tipo oferta relámpago de Instagram.
     - "alerta": franjas de peligro amarillo/negro, precio rojo enorme con
       destellos, cinta "¡OFERTA!" — tipo liquidación de ferretería/minimarket.
     - "elegante": fondo oscuro, letras doradas tipo serif, fichas color
       pergamino con borde doble — tipo cartel de fiambrería artesanal. No
       lleva las fotos de hierbas/madera del ejemplo (son fotografía de
       stock, no algo que el sistema pueda armar solo con los datos de una
       oferta): el aire premium sale de la tipografía y los bordes, no de
       fotos de fondo. */

export const PROMO_ANCHO = 1080;
export const PROMO_ALTO = 1920;

const BLANCO = "#ffffff";
const NEGRO = "#111111";

function cargarImagen(src, { crossOrigin } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar una imagen"));
    img.src = src;
  });
}

// Antes de dibujar nada, se pide explícitamente que cada variante de fuente
// que se va a usar termine de cargar — con solo esperar document.fonts.ready
// no alcanza para una fuente que recién se usa acá por primera vez (como
// Playfair Display, que en el resto del sistema no aparece en ningún lado):
// el navegador no empieza a bajarla hasta que algo la pide, y fillText no
// espera sola a que ese pedido termine.
async function precargarFuentes(specs) {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  try {
    await Promise.all(specs.map((spec) => document.fonts.load(spec).catch(() => null)));
    await document.fonts.ready;
  } catch { /* si falla, se sigue igual con lo que el navegador tenga a mano */ }
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

// Arma "píldoras" cortas (métodos de pago) en filas completas, sin cortar
// una píldora a la mitad entre una fila y la siguiente.
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
  const radio = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radio, y);
  ctx.arcTo(x + w, y, x + w, y + h, radio);
  ctx.arcTo(x + w, y + h, x, y + h, radio);
  ctx.arcTo(x, y + h, x, y, radio);
  ctx.arcTo(x, y, x + w, y, radio);
  ctx.closePath();
}

function rectRedondeado(ctx, x, y, w, h, r, { relleno, borde, grosorBorde } = {}) {
  trazarRectRedondeado(ctx, x, y, w, h, r);
  if (relleno) { ctx.fillStyle = relleno; ctx.fill(); }
  if (borde) { ctx.lineWidth = grosorBorde || 8; ctx.strokeStyle = borde; ctx.stroke(); }
}

// Texto con contorno (relleno + borde) — letras gruesas que se leen de
// lejos, aunque la pantalla del celular sea chica.
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

// Grilla de fotos de los productos — comparte la misma lógica en los tres
// estilos; lo único que cambia es el color del borde de cada foto.
async function dibujarGrillaFotos(ctx, fotos, x, y, w, h, { colorBorde, grosorBorde = 8, radio = 22 }) {
  const columnas = fotos.length === 1 ? 1 : fotos.length <= 4 ? 2 : 3;
  const filas = Math.ceil(fotos.length / columnas);
  const espacio = 14;
  const anchoCelda = (w - espacio * (columnas - 1)) / columnas;
  const altoCeldaMax = (h - espacio * (filas - 1)) / filas;
  const altoCelda = Math.min(altoCeldaMax, anchoCelda * 2.2);

  const imagenes = await Promise.all(fotos.map((f) => cargarImagen(f)));
  const altoGrilla = filas * altoCelda + (filas - 1) * espacio;
  const anchoGrilla = columnas * anchoCelda + (columnas - 1) * espacio;
  const inicioX = x + (w - anchoGrilla) / 2;
  const inicioY = y + (h - altoGrilla) / 2;
  imagenes.forEach((img, i) => {
    const col = i % columnas;
    const fila = Math.floor(i / columnas);
    const cx = inicioX + col * (anchoCelda + espacio);
    const cy = inicioY + fila * (altoCelda + espacio);
    ctx.save();
    trazarRectRedondeado(ctx, cx, cy, anchoCelda, altoCelda, radio);
    ctx.clip();
    dibujarCover(ctx, img, cx, cy, anchoCelda, altoCelda);
    ctx.restore();
    if (colorBorde) rectRedondeado(ctx, cx, cy, anchoCelda, altoCelda, radio, { borde: colorBorde, grosorBorde });
  });
}

// Destello de cuatro puntas (✦) — brillito decorativo.
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

// Estrella/explosión de muchas puntas — el "estallido" detrás de un precio,
// como en una oferta relámpago o una liquidación.
function dibujarExplosion(ctx, cx, cy, radioExt, radioInt, puntas, color, rotacion = 0, borde) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotacion);
  ctx.beginPath();
  for (let i = 0; i < puntas * 2; i++) {
    const r = i % 2 === 0 ? radioExt : radioInt;
    const a = (Math.PI / puntas) * i;
    const px = r * Math.sin(a), py = -r * Math.cos(a);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (borde) { ctx.lineWidth = radioExt * 0.025; ctx.strokeStyle = borde; ctx.stroke(); }
  ctx.restore();
}

// Cinta/banderín inclinado tipo "¡OFERTA!" — rectángulo con las dos puntas
// entalladas en flecha.
function dibujarCinta(ctx, cx, cy, ancho, alto, texto, { fondo, borde, colorTexto, rotacion = -0.07, font }) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotacion);
  const w = ancho, h = alto, muesca = h * 0.32;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  ctx.lineTo(w / 2, -h / 2);
  ctx.lineTo(w / 2 - muesca, 0);
  ctx.lineTo(w / 2, h / 2);
  ctx.lineTo(-w / 2, h / 2);
  ctx.lineTo(-w / 2 + muesca, 0);
  ctx.closePath();
  ctx.fillStyle = fondo;
  ctx.fill();
  if (borde) { ctx.lineWidth = h * 0.09; ctx.strokeStyle = borde; ctx.stroke(); }
  ctx.fillStyle = colorTexto;
  ctx.font = font;
  const prevAlign = ctx.textAlign, prevBaseline = ctx.textBaseline;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(texto, 0, h * 0.06);
  ctx.textAlign = prevAlign; ctx.textBaseline = prevBaseline;
  ctx.restore();
}

// Franjas diagonales tipo cinta de peligro — recortadas al rectángulo dado.
function dibujarRayasDiagonales(ctx, x, y, w, h, colorFondo, colorRaya, anchoRaya = 30, espacio = 30, angulo = -28) {
  ctx.save();
  trazarRectRedondeado(ctx, x, y, w, h, 0);
  ctx.clip();
  ctx.fillStyle = colorFondo;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = colorRaya;
  const diag = Math.sqrt(w * w + h * h) + anchoRaya * 4;
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((angulo * Math.PI) / 180);
  const paso = anchoRaya + espacio;
  for (let off = -diag; off < diag; off += paso * 2) {
    ctx.fillRect(off, -diag, anchoRaya, diag * 2);
  }
  ctx.restore();
}

// Carrito de compras, simplificado a puro trazo.
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

// Círculo con un visto.
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

// Pequeña marca de esquina tipo "ficha" o "marco" — cuatro trazos en L,
// nada más, para el aire de marco elegante sin dibujar un marco completo.
function dibujarEsquinaMarco(ctx, x, y, size, color, grosor, dx, dy) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = grosor;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y + size * dy);
  ctx.lineTo(x, y);
  ctx.lineTo(x + size * dx, y);
  ctx.stroke();
  ctx.restore();
}

function pesos(n) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 })
    .format(Math.round(Number(n) || 0));
}

function filasDePildoras(ctx, metodos, maxWidth, font) {
  if (!metodos?.length) return [];
  ctx.font = font;
  return envolverPildoras(ctx, metodos.map((m) => m.toUpperCase()), maxWidth, 24, 14);
}
function dibujarFilasPildoras(ctx, filas, cy, { font, fondo, texto, alturaFila = 56, gapFila = 14 }) {
  ctx.font = font;
  let y = cy;
  for (const fila of filas) {
    const anchos = fila.map((t) => ctx.measureText(t).width + 24 * 2);
    const anchoTotal = anchos.reduce((a, b) => a + b, 0) + 14 * (fila.length - 1);
    let x = PROMO_ANCHO / 2 - anchoTotal / 2;
    fila.forEach((t, i) => {
      const w = anchos[i];
      rectRedondeado(ctx, x, y, w, alturaFila, alturaFila / 2, { relleno: fondo });
      ctx.fillStyle = texto;
      ctx.textBaseline = "middle";
      ctx.fillText(t, x + w / 2, y + alturaFila / 2 + 1);
      ctx.textBaseline = "alphabetic";
      x += w + 14;
    });
    y += alturaFila + gapFila;
  }
  return y;
}

/* ============================================================
   ESTILO "vibrante" — degradado morado/rosado, tipo oferta
   relámpago de Instagram/WhatsApp. Es el estilo por omisión: le
   sirve a cualquier producto (no asume que sea comida gourmet).
   ============================================================ */
async function dibujarEstiloVibrante(ctx, { oferta, fotos, settings }) {
  await precargarFuentes([
    "800 60px 'Space Grotesk'", "800 50px 'Space Grotesk'", "800 130px 'Space Grotesk'",
    "700 30px 'Space Grotesk'", "700 26px 'Space Grotesk'",
  ]);

  const MORADO = "#6a1fc2";
  const ROSADO = "#e0218a";
  const AMARILLO = "#ffd400";
  const MAGENTA = "#ff2d95";

  const fondo = ctx.createLinearGradient(0, 0, 0, PROMO_ALTO);
  fondo.addColorStop(0, MORADO);
  fondo.addColorStop(1, ROSADO);
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, PROMO_ANCHO, PROMO_ALTO);

  // Textura de puntitos y destellos sueltos por el fondo.
  for (const [dx, dy, r, c] of [
    [90, 150, 16, BLANCO], [980, 120, 12, AMARILLO], [60, 870, 14, BLANCO],
    [1010, 760, 18, MAGENTA], [70, 1500, 14, AMARILLO], [1000, 1560, 16, BLANCO],
  ]) dibujarDestello(ctx, dx, dy, r, c, dx % 2 ? 0.3 : -0.4);

  const MARGEN = 56;
  const anchoInterior = PROMO_ANCHO - MARGEN * 2;
  ctx.textAlign = "center";

  // ---- Zona superior: título + nombre de la oferta (alto fijo: 330px) ----
  ctx.font = "700 28px 'Space Grotesk'";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  const anchoEtiqueta = ctx.measureText("OFERTA DEL DÍA").width + 64;
  rectRedondeado(ctx, PROMO_ANCHO / 2 - anchoEtiqueta / 2, 46, anchoEtiqueta, 56, 28, { relleno: "rgba(255,255,255,0.18)", borde: "rgba(255,255,255,0.7)", grosorBorde: 2.5 });
  ctx.fillText("OFERTA DEL DÍA", PROMO_ANCHO / 2, 81);

  const fontTitulo = "800 58px 'Space Grotesk'";
  ctx.font = fontTitulo;
  const lineasTitulo = envolverTexto(ctx, `¡Ofertón en ${(settings.businessName || "El Galpón")}!`, anchoInterior - 40).slice(0, 2);
  textoContornoMultilinea(ctx, lineasTitulo, PROMO_ANCHO / 2, 180, 66, {
    relleno: BLANCO, contorno: MAGENTA, grosor: 9, font: fontTitulo,
  });

  const fontNombre = "800 42px 'Space Grotesk'";
  ctx.font = fontNombre;
  const lineasNombre = envolverTexto(ctx, oferta.name, anchoInterior - 100).slice(0, 2);
  const altoPildoraNombre = 60 + (lineasNombre.length - 1) * 46;
  const anchoPildoraNombre = Math.min(anchoInterior, Math.max(...lineasNombre.map((l) => ctx.measureText(l).width)) + 90);
  rectRedondeado(ctx, PROMO_ANCHO / 2 - anchoPildoraNombre / 2, 318, anchoPildoraNombre, altoPildoraNombre, 26, { relleno: BLANCO });
  ctx.fillStyle = MORADO;
  let yN = 318 + 42;
  for (const linea of lineasNombre) { ctx.fillText(linea, PROMO_ANCHO / 2, yN); yN += 46; }

  const yFinHeader = 318 + altoPildoraNombre + 28;

  // ---- Zona de precio, de ARRIBA hacia abajo con un cursor —así cada
  // elemento se dibuja justo debajo del anterior y nunca pisa al que sigue,
  // en vez de adivinar coordenadas sueltas (eso fue lo que se pisó la
  // primera vez: la explosión del precio tapaba el tramo 2 y las píldoras
  // de pago). El alto fijo de abajo (ALTO_PRECIO) solo decide dónde
  // EMPIEZA esta zona — el contenido real nunca necesita llenarlo entero. ----
  const ALTO_PRECIO = 760;
  const yPrecio = PROMO_ALTO - ALTO_PRECIO;

  const tramos = (oferta.tiers || []).filter((t) => Number(t.quantity) >= 2 && Number(t.price) > 0).slice(0, 2);
  const metodos = [...new Set(tramos.flatMap((t) => t.paymentMethods || []))].map((m) => m.toUpperCase());

  let cy = yPrecio + 20;
  if (tramos.length > 0) {
    const hero = tramos[0];

    dibujarCinta(ctx, PROMO_ANCHO / 2, cy + 35, 300, 70, `LLEVA ${hero.quantity} Y PAGA`, {
      fondo: BLANCO, colorTexto: MORADO, rotacion: -0.045, font: "800 30px 'Space Grotesk'",
    });
    cy += 70 + 20;

    const radioExt = 168, radioInt = 134;
    const cyBurst = cy + radioExt;
    dibujarExplosion(ctx, PROMO_ANCHO / 2, cyBurst, radioExt, radioInt, 13, MAGENTA, 0.12, "rgba(255,255,255,0.9)");
    dibujarExplosion(ctx, PROMO_ANCHO / 2, cyBurst, radioExt - 20, radioInt - 18, 13, AMARILLO, 0.12 + Math.PI / 13);

    const fontPrecio = "900 118px 'Space Grotesk'";
    ctx.font = fontPrecio;
    const textoPrecio = pesos(hero.price);
    const anchoTexto = ctx.measureText(textoPrecio).width;
    textoContorno(ctx, textoPrecio, PROMO_ANCHO / 2, cyBurst + 38, { relleno: MORADO, contorno: BLANCO, grosor: 10, font: fontPrecio });
    dibujarCarrito(ctx, PROMO_ANCHO / 2 - anchoTexto / 2 - 86, cyBurst - 10, 50, MORADO);
    dibujarCheckCirculo(ctx, PROMO_ANCHO / 2 + anchoTexto / 2 + 58, cyBurst + 14, 34, MORADO, BLANCO, null);
    cy = cyBurst + radioExt + 30;

    ctx.font = "600 28px 'Space Grotesk'";
    ctx.fillStyle = BLANCO;
    const precioUnitario = pesos(Number(hero.price) / Number(hero.quantity));
    ctx.fillText(`por las ${hero.quantity} unidades juntas · ${precioUnitario} c/u`, PROMO_ANCHO / 2, cy);
    cy += 46;

    if (tramos.length > 1) {
      const t2 = tramos[1];
      ctx.font = "700 30px 'Space Grotesk'";
      ctx.fillStyle = AMARILLO;
      ctx.fillText(`También: ${t2.quantity} unidades por ${pesos(t2.price)}`, PROMO_ANCHO / 2, cy);
      cy += 48;
    }

    cy += 14;
    const filas = filasDePildoras(ctx, metodos, anchoInterior, "700 25px 'Space Grotesk'");
    if (filas.length) cy = dibujarFilasPildoras(ctx, filas, cy, { font: "700 25px 'Space Grotesk'", fondo: "rgba(255,255,255,0.22)", texto: BLANCO });
  } else {
    ctx.font = "700 36px 'Space Grotesk'";
    ctx.fillStyle = BLANCO;
    ctx.fillText("¡Consulta el precio en el mesón!", PROMO_ANCHO / 2, cy + 260);
    cy += 320;
  }

  // Nombres de los productos participantes, justo debajo de todo lo demás.
  if ((oferta.productNames || []).length > 1) {
    cy += 14;
    ctx.font = "500 24px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    const lineas = envolverTexto(ctx, oferta.productNames.join(" · "), anchoInterior).slice(0, 2);
    for (const l of lineas) { ctx.fillText(l, PROMO_ANCHO / 2, cy); cy += 30; }
  }

  // ---- Fotos, en todo el espacio que queda al medio ----
  const yFotos = yFinHeader + 10;
  const altoFotos = Math.max(160, yPrecio - 20 - yFotos);
  if (fotos.length > 0) {
    await dibujarGrillaFotos(ctx, fotos, MARGEN - 20, yFotos, anchoInterior + 40, altoFotos, { colorBorde: BLANCO, grosorBorde: 10 });
  } else {
    const cx = PROMO_ANCHO / 2, cy = yFotos + altoFotos / 2;
    const radio = Math.min(altoFotos, anchoInterior) * 0.33;
    dibujarExplosion(ctx, cx, cy, radio * 1.08, radio * 0.82, 12, "rgba(255,255,255,0.14)", 0.2);
    textoContorno(ctx, "%", cx, cy + radio * 0.32, { relleno: AMARILLO, contorno: BLANCO, grosor: 8, font: `800 ${Math.round(radio * 1.3)}px 'Space Grotesk'` });
  }
}

/* ============================================================
   ESTILO "alerta" — franjas de peligro amarillo/negro, precio
   rojo gigante. Pensado para liquidaciones y ofertas "hasta
   agotar stock".
   ============================================================ */
async function dibujarEstiloAlerta(ctx, { oferta, fotos, settings }) {
  await precargarFuentes([
    "800 44px 'Space Grotesk'", "900 60px 'Space Grotesk'", "900 150px 'Space Grotesk'",
    "800 30px 'Space Grotesk'", "700 26px 'Space Grotesk'",
  ]);

  const AMARILLO = "#ffcf00";
  const ROJO = "#e3221b";

  ctx.fillStyle = NEGRO;
  ctx.fillRect(0, 0, PROMO_ANCHO, PROMO_ALTO);
  ctx.textAlign = "center";

  // ---- Franja de peligro de arriba con el nombre del negocio (alto fijo 130) ----
  const ALTO_FRANJA = 130;
  dibujarRayasDiagonales(ctx, 0, 0, PROMO_ANCHO, ALTO_FRANJA, AMARILLO, NEGRO, 30, 30, -24);
  const fontFranja = "800 44px 'Space Grotesk'";
  ctx.font = fontFranja;
  const nombreNegocio = (settings.businessName || "El Galpón").toUpperCase();
  const textoFranja = `MINIMARKET ${nombreNegocio}`;
  const anchoFranjaTexto = ctx.measureText(textoFranja).width;
  dibujarDestello(ctx, PROMO_ANCHO / 2 - anchoFranjaTexto / 2 - 46, ALTO_FRANJA / 2, 20, AMARILLO, 0.2);
  dibujarDestello(ctx, PROMO_ANCHO / 2 + anchoFranjaTexto / 2 + 46, ALTO_FRANJA / 2, 20, AMARILLO, 0.5);
  // Contorno blanco sobre el relleno negro: donde la franja diagonal pasa
  // negro-sobre-negro justo detrás de una letra, igual se distingue el
  // borde — sin esto el texto se cortaba en pedazos ilegibles.
  textoContorno(ctx, textoFranja, PROMO_ANCHO / 2, ALTO_FRANJA / 2 + 16, {
    relleno: NEGRO, contorno: BLANCO, grosor: 5, font: fontFranja,
  });

  // ---- Banda amarilla con el nombre de la oferta (alto fijo 230) ----
  const yBanda = ALTO_FRANJA;
  const ALTO_BANDA = 230;
  ctx.fillStyle = AMARILLO;
  ctx.fillRect(0, yBanda, PROMO_ANCHO, ALTO_BANDA);
  const fontNombre = "900 70px 'Space Grotesk'";
  ctx.font = fontNombre;
  const lineasNombre = envolverTexto(ctx, oferta.name.toUpperCase(), PROMO_ANCHO - 100).slice(0, 2);
  const lineHeightNombre = 78;
  const yNombreInicio = yBanda + ALTO_BANDA / 2 - ((lineasNombre.length - 1) * lineHeightNombre) / 2 + 24;
  textoContornoMultilinea(ctx, lineasNombre, PROMO_ANCHO / 2, yNombreInicio, lineHeightNombre, {
    relleno: NEGRO, font: fontNombre,
  });

  // ---- Fotos sobre fondo negro (alto flexible) ----
  const MARGEN_FOTOS = 50;
  const yFotos = yBanda + ALTO_BANDA + 26;
  const ALTO_PRECIO = 620;
  const ALTO_FRANJA_INF = 130;
  const ALTO_PIE = 150;
  const altoFotos = Math.max(
    160,
    PROMO_ALTO - ALTO_PIE - ALTO_FRANJA_INF - ALTO_PRECIO - 26 - yFotos
  );
  if (fotos.length > 0) {
    await dibujarGrillaFotos(ctx, fotos, MARGEN_FOTOS, yFotos, PROMO_ANCHO - MARGEN_FOTOS * 2, altoFotos, { colorBorde: AMARILLO, grosorBorde: 6, radio: 10 });
  } else {
    const cx = PROMO_ANCHO / 2, cy = yFotos + altoFotos / 2;
    const radio = Math.min(altoFotos, PROMO_ANCHO - 120) * 0.34;
    dibujarExplosion(ctx, cx, cy, radio * 1.1, radio * 0.8, 10, "rgba(255,207,0,0.14)", 0.2);
    textoContorno(ctx, "%", cx, cy + radio * 0.32, { relleno: AMARILLO, contorno: ROJO, grosor: 8, font: `900 ${Math.round(radio * 1.3)}px 'Space Grotesk'` });
  }

  // ---- Zona de precio, con un cursor de arriba hacia abajo (mismo criterio
  // que en el estilo "vibrante" — ver ese comentario). El negro de fondo es
  // el mismo del resto del cartel: cualquier adorno en negro quedaría
  // invisible acá, así que todo lo que va en esta zona usa amarillo/rojo. ----
  const yPrecio = PROMO_ALTO - ALTO_PIE - ALTO_FRANJA_INF - ALTO_PRECIO;
  const tramos = (oferta.tiers || []).filter((t) => Number(t.quantity) >= 2 && Number(t.price) > 0).slice(0, 2);
  const metodos = [...new Set(tramos.flatMap((t) => t.paymentMethods || []))].map((m) => m.toUpperCase());

  let cyP = yPrecio + 14;
  if (tramos.length > 0) {
    const hero = tramos[0];

    dibujarCinta(ctx, 190, cyP + 39, 236, 78, "¡OFERTA!", {
      fondo: ROJO, borde: NEGRO, colorTexto: BLANCO, rotacion: -0.09, font: "800 34px 'Space Grotesk'",
    });
    dibujarCarrito(ctx, PROMO_ANCHO - 210, cyP, 60, AMARILLO);
    dibujarCheckCirculo(ctx, PROMO_ANCHO - 120, cyP + 68, 36, AMARILLO, NEGRO, null);
    cyP += 78 + 22;

    const fontPrecio = "900 150px 'Space Grotesk'";
    ctx.font = fontPrecio;
    const textoPrecio = pesos(hero.price);
    const cyPrecioBase = cyP + 116;
    // Resplandor amarillo detrás del precio — visible sobre el negro, a
    // diferencia del negro-sobre-negro de la primera versión. Radio acotado
    // para que no se salga de la zona de precio y pise el borde inferior de
    // las fotos (pasó con un radio mayor: el resplandor asomaba por detrás
    // de la grilla de fotos).
    dibujarExplosion(ctx, PROMO_ANCHO / 2, cyPrecioBase - 50, 150, 118, 16, "rgba(255,207,0,0.5)", 0.1);
    textoContorno(ctx, textoPrecio, PROMO_ANCHO / 2, cyPrecioBase, { relleno: ROJO, contorno: BLANCO, grosor: 13, font: fontPrecio });
    cyP = cyPrecioBase + 58;

    ctx.font = "800 32px 'Space Grotesk'";
    ctx.fillStyle = AMARILLO;
    ctx.fillText(`LLEVA ${hero.quantity} · ${pesos(Number(hero.price) / Number(hero.quantity))} C/U`, PROMO_ANCHO / 2, cyP);
    cyP += 48;

    if (tramos.length > 1) {
      const t2 = tramos[1];
      ctx.font = "700 30px 'Space Grotesk'";
      ctx.fillStyle = BLANCO;
      ctx.fillText(`También: ${t2.quantity} unidades por ${pesos(t2.price)}`, PROMO_ANCHO / 2, cyP);
      cyP += 46;
    }
    cyP += 14;
    const filas = filasDePildoras(ctx, metodos, PROMO_ANCHO - 120, "700 25px 'Space Grotesk'");
    if (filas.length) dibujarFilasPildoras(ctx, filas, cyP, { font: "700 25px 'Space Grotesk'", fondo: AMARILLO, texto: NEGRO });
  } else {
    ctx.font = "800 38px 'Space Grotesk'";
    ctx.fillStyle = AMARILLO;
    ctx.fillText("¡CONSULTA EL PRECIO EN CAJA!", PROMO_ANCHO / 2, cyP + 260);
  }

  // ---- Franja de peligro de abajo (alto fijo 130) ----
  const yFranjaInf = PROMO_ALTO - ALTO_PIE - ALTO_FRANJA_INF;
  dibujarRayasDiagonales(ctx, 0, yFranjaInf, PROMO_ANCHO, ALTO_FRANJA_INF, AMARILLO, NEGRO, 30, 30, -24);

  // ---- Pie: "SOLO EN [NEGOCIO]" + nombres de productos (alto fijo 150) ----
  const yPie = PROMO_ALTO - ALTO_PIE;
  ctx.fillStyle = AMARILLO;
  ctx.fillRect(0, yPie, PROMO_ANCHO, ALTO_PIE);
  ctx.font = "800 34px 'Space Grotesk'";
  ctx.fillStyle = NEGRO;
  ctx.fillText(`SOLO EN MINIMARKET ${nombreNegocio}`, PROMO_ANCHO / 2, yPie + 52);
  if ((oferta.productNames || []).length > 1) {
    ctx.font = "500 22px system-ui, sans-serif";
    ctx.fillStyle = "#4a3b00";
    const lineas = envolverTexto(ctx, oferta.productNames.join(" · "), PROMO_ANCHO - 100).slice(0, 2);
    let yp = yPie + 88;
    for (const l of lineas) { ctx.fillText(l, PROMO_ANCHO / 2, yp); yp += 28; }
  } else {
    ctx.font = "600 24px 'Space Grotesk'";
    ctx.fillStyle = "#4a3b00";
    ctx.fillText("¡Aprovecha esta oferta hoy!", PROMO_ANCHO / 2, yPie + 92);
  }
}

/* ============================================================
   ESTILO "elegante" — fondo oscuro, tipografía dorada tipo
   serif, fichas color pergamino. El aire premium sale de la
   tipografía y los bordes finos, no de fotos de fondo (esas
   son fotografía de stock que el sistema no tiene cómo generar
   solo, ver comentario arriba del archivo).
   ============================================================ */
async function dibujarEstiloElegante(ctx, { oferta, fotos, settings }) {
  await precargarFuentes([
    "700 30px 'Playfair Display'", "800 64px 'Playfair Display'", "900 92px 'Playfair Display'",
    "700 36px 'Playfair Display'", "600 25px 'Space Grotesk'",
  ]);

  const DORADO = "#d3ab5c";
  const DORADO_CLARO = "#ecd8a6";
  const PERGAMINO = "#f4ecd8";
  const MARRON_TEXTO = "#4a2f17";
  const CAFE_OSCURO = "#160d08";
  const CAFE = "#2a190f";

  const fondo = ctx.createRadialGradient(PROMO_ANCHO / 2, PROMO_ALTO * 0.35, 120, PROMO_ANCHO / 2, PROMO_ALTO * 0.5, PROMO_ANCHO);
  fondo.addColorStop(0, CAFE);
  fondo.addColorStop(1, CAFE_OSCURO);
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, PROMO_ANCHO, PROMO_ALTO);

  const MARGEN = 64;
  const anchoInterior = PROMO_ANCHO - MARGEN * 2;
  ctx.textAlign = "center";

  // Marco general, fino, dorado, con una pequeña separación del borde.
  rectRedondeado(ctx, 26, 26, PROMO_ANCHO - 52, PROMO_ALTO - 52, 4, { borde: DORADO, grosorBorde: 2 });

  // ---- Encabezado (alto fijo 360) ----
  ctx.font = "700 26px 'Space Grotesk'";
  ctx.fillStyle = DORADO;
  const eyebrow = "PRODUCTOS SELECCIONADOS · CALIDAD PREMIUM";
  // Separado letra por letra para el efecto "versalitas" del cartel de
  // fiambrería (sin esto, una fuente normal no se nota tan elegante).
  dibujarTextoEspaciado(ctx, eyebrow, PROMO_ANCHO / 2, 76, 3);

  dibujarLineaOrnamental(ctx, PROMO_ANCHO / 2, 112, 170, DORADO);

  const fontTitulo = "800 76px 'Playfair Display'";
  ctx.font = fontTitulo;
  const lineasTitulo = envolverTexto(ctx, `Súper oferta de ${(settings.businessName || "El Galpón")}`, anchoInterior - 20).slice(0, 2);
  const yTitulo = textoContornoMultilinea(ctx, lineasTitulo, PROMO_ANCHO / 2, 210, 86, {
    relleno: DORADO_CLARO, contorno: CAFE_OSCURO, grosor: 3, font: fontTitulo,
  });

  dibujarLineaOrnamental(ctx, PROMO_ANCHO / 2, yTitulo + 28, 170, DORADO);

  const fontNombre = "700 40px 'Playfair Display'";
  ctx.font = fontNombre;
  const lineasNombre = envolverTexto(ctx, oferta.name, anchoInterior - 60).slice(0, 2);
  let yNombre = yTitulo + 82;
  for (const l of lineasNombre) { ctx.fillStyle = PERGAMINO; ctx.fillText(l, PROMO_ANCHO / 2, yNombre); yNombre += 48; }

  const yFinHeader = yNombre + 10;

  // ---- Tramos: fichas color pergamino (alto fijo 420), pinneadas al pie ----
  const ALTO_FICHAS = 420;
  const ALTO_PIE = 110;
  const yFichas = PROMO_ALTO - ALTO_PIE - ALTO_FICHAS;

  const tramos = (oferta.tiers || []).filter((t) => Number(t.quantity) >= 2 && Number(t.price) > 0).slice(0, 2);
  const metodos = [...new Set(tramos.flatMap((t) => t.paymentMethods || []))].map((m) => m.toUpperCase());

  if (tramos.length > 0) {
    const anchoFicha = tramos.length > 1 ? (anchoInterior - 24) / 2 : Math.min(anchoInterior, 560);
    const altoFicha = 330;
    const yFichaTop = yFichas + 10;
    tramos.forEach((t, i) => {
      const x = tramos.length > 1
        ? MARGEN + i * (anchoFicha + 24)
        : PROMO_ANCHO / 2 - anchoFicha / 2;
      dibujarFichaPrecio(ctx, x, yFichaTop, anchoFicha, altoFicha, t, { DORADO, PERGAMINO, MARRON_TEXTO });
    });

    const yTrasFichas = yFichaTop + altoFicha + 34;
    const filas = filasDePildoras(ctx, metodos, anchoInterior, "600 24px 'Space Grotesk'");
    if (filas.length) {
      dibujarFilasPildoras(ctx, filas, yTrasFichas, {
        font: "600 24px 'Space Grotesk'", fondo: "rgba(211,171,92,0.16)", texto: DORADO_CLARO, alturaFila: 50,
      });
    }
  } else {
    ctx.font = "italic 600 34px 'Playfair Display'";
    ctx.fillStyle = DORADO_CLARO;
    ctx.fillText("Consulta el precio en el mesón", PROMO_ANCHO / 2, yFichas + 180);
  }

  // ---- Fotos, en el espacio que queda entre el encabezado y las fichas ----
  const yFotos = yFinHeader + 16;
  const altoFotos = Math.max(160, yFichas - 24 - yFotos);
  if (fotos.length > 0) {
    await dibujarGrillaFotosConMarco(ctx, fotos, MARGEN, yFotos, anchoInterior, altoFotos, DORADO);
  } else {
    const cx = PROMO_ANCHO / 2, cy = yFotos + altoFotos / 2;
    const radio = Math.min(altoFotos, anchoInterior) * 0.3;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, radio, 0, Math.PI * 2);
    ctx.lineWidth = 3; ctx.strokeStyle = DORADO; ctx.stroke();
    ctx.restore();
    ctx.font = `700 ${Math.round(radio * 0.9)}px 'Playfair Display'`;
    ctx.fillStyle = DORADO_CLARO;
    ctx.fillText("%", cx, cy + radio * 0.32);
  }

  // ---- Pie ----
  const yPie = PROMO_ALTO - ALTO_PIE;
  dibujarLineaOrnamental(ctx, PROMO_ANCHO / 2, yPie + 20, 170, DORADO);
  ctx.font = "italic 500 24px 'Playfair Display'";
  ctx.fillStyle = DORADO;
  ctx.fillText("Calidad premium · Atención dedicada", PROMO_ANCHO / 2, yPie + 56);
  if ((oferta.productNames || []).length > 1) {
    ctx.font = "500 20px system-ui, sans-serif";
    ctx.fillStyle = "rgba(244,236,216,0.6)";
    const lineas = envolverTexto(ctx, oferta.productNames.join(" · "), anchoInterior).slice(0, 1);
    if (lineas[0]) ctx.fillText(lineas[0], PROMO_ANCHO / 2, yPie + 88);
  }
}

function dibujarTextoEspaciado(ctx, texto, cx, y, tracking) {
  const letras = texto.split("");
  const anchoTotal = letras.reduce((a, l) => a + ctx.measureText(l).width + tracking, -tracking);
  let x = cx - anchoTotal / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  for (const l of letras) {
    ctx.fillText(l, x, y);
    x += ctx.measureText(l).width + tracking;
  }
  ctx.textAlign = prevAlign;
}

function dibujarLineaOrnamental(ctx, cx, y, ancho, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - ancho / 2, y);
  ctx.lineTo(cx - 16, y);
  ctx.moveTo(cx + 16, y);
  ctx.lineTo(cx + ancho / 2, y);
  ctx.stroke();
  ctx.restore();
  dibujarDestello(ctx, cx, y, 10, color, 0.4);
}

function dibujarFichaPrecio(ctx, x, y, w, h, tramo, { DORADO, PERGAMINO, MARRON_TEXTO }) {
  rectRedondeado(ctx, x, y, w, h, 14, { relleno: PERGAMINO, borde: DORADO, grosorBorde: 5 });
  rectRedondeado(ctx, x + 12, y + 12, w - 24, h - 24, 8, { borde: DORADO, grosorBorde: 1.5 });

  const cx = x + w / 2;
  ctx.textAlign = "center";
  ctx.font = "700 24px 'Space Grotesk'";
  ctx.fillStyle = MARRON_TEXTO;
  ctx.fillText(`LLEVA ${tramo.quantity}`, cx, y + 64);

  const fontPrecio = `800 ${w > 500 ? 92 : 68}px 'Playfair Display'`;
  ctx.font = fontPrecio;
  ctx.fillStyle = MARRON_TEXTO;
  const txt = pesos(tramo.price);
  // Si el precio no entra en la ficha chica (dos tramos lado a lado), se
  // reduce la letra en vez de salirse del cartel.
  let tam = w > 500 ? 92 : 68;
  ctx.font = `800 ${tam}px 'Playfair Display'`;
  while (ctx.measureText(txt).width > w - 40 && tam > 34) {
    tam -= 4;
    ctx.font = `800 ${tam}px 'Playfair Display'`;
  }
  ctx.fillText(txt, cx, y + 64 + tam * 0.92);

  ctx.font = "500 20px 'Space Grotesk'";
  ctx.fillStyle = MARRON_TEXTO;
  ctx.fillText(`${pesos(Number(tramo.price) / Number(tramo.quantity))} c/u`, cx, y + h - 24);
}

async function dibujarGrillaFotosConMarco(ctx, fotos, x, y, w, h, colorMarco) {
  await dibujarGrillaFotos(ctx, fotos, x, y, w, h, { colorBorde: colorMarco, grosorBorde: 3, radio: 4 });
  // Marquitas de esquina doradas, por encima de cada celda — el detalle que
  // da el aire "de marco" sin tener que dibujar un marco completo.
  const columnas = fotos.length === 1 ? 1 : fotos.length <= 4 ? 2 : 3;
  const filas = Math.ceil(fotos.length / columnas);
  const espacio = 14;
  const anchoCelda = (w - espacio * (columnas - 1)) / columnas;
  const altoCeldaMax = (h - espacio * (filas - 1)) / filas;
  const altoCelda = Math.min(altoCeldaMax, anchoCelda * 2.2);
  const altoGrilla = filas * altoCelda + (filas - 1) * espacio;
  const anchoGrilla = columnas * anchoCelda + (columnas - 1) * espacio;
  const inicioX = x + (w - anchoGrilla) / 2;
  const inicioY = y + (h - altoGrilla) / 2;
  for (let i = 0; i < fotos.length; i++) {
    const col = i % columnas, fila = Math.floor(i / columnas);
    const cx = inicioX + col * (anchoCelda + espacio);
    const cy = inicioY + fila * (altoCelda + espacio);
    const s = 22, g = 3;
    dibujarEsquinaMarco(ctx, cx - 4, cy - 4, s, colorMarco, g, 1, 1);
    dibujarEsquinaMarco(ctx, cx + anchoCelda + 4, cy - 4, -s, colorMarco, g, -1, 1);
    dibujarEsquinaMarco(ctx, cx - 4, cy + altoCelda + 4, s, colorMarco, g, 1, -1);
    dibujarEsquinaMarco(ctx, cx + anchoCelda + 4, cy + altoCelda + 4, -s, colorMarco, g, -1, -1);
  }
}

/* oferta: { name, tiers: [{quantity, price, paymentMethods}], productNames: string[] }
   fotos: string[] de data URLs (ya filtradas a las que sí se adjuntaron)
   settings: { businessName, businessLogo }
   estilo: "vibrante" (por omisión) | "alerta" | "elegante" */
export async function generarImagenOferta({ oferta, fotos = [], settings = {}, estilo = "vibrante" }) {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* no bloquea el resto */ }
  }

  const canvas = document.createElement("canvas");
  canvas.width = PROMO_ANCHO;
  canvas.height = PROMO_ALTO;
  const ctx = canvas.getContext("2d");
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const args = { oferta, fotos, settings };
  if (estilo === "elegante") await dibujarEstiloElegante(ctx, args);
  else if (estilo === "alerta") await dibujarEstiloAlerta(ctx, args);
  else await dibujarEstiloVibrante(ctx, args);

  return canvas.toDataURL("image/jpeg", 0.92);
}

export const ESTILOS_OFERTA = [
  { id: "vibrante", label: "Vibrante", descripcion: "Degradado morado/rosado — para cualquier producto" },
  { id: "alerta", label: "Alerta", descripcion: "Franjas amarillo/negro — para liquidaciones" },
  { id: "elegante", label: "Elegante", descripcion: "Fondo oscuro y letras doradas — para productos premium" },
];
