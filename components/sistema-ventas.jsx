"use client";

/* Sistema de ventas e inventario de El Galpón.
   Adaptado desde el artefacto original: la lógica de las pantallas se
   conserva tal cual y solo cambió lo que tenía que cambiar para vivir en un
   sitio propio — el guardado (ahora Supabase), el ingreso (ahora Supabase
   Auth), el PIN (ahora con bcrypt en la base) y la lectura de documentos con
   IA (ahora por una ruta de servidor que guarda la credencial). */

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  cargarJSON as loadJSON,
  cargarJSONEstricto as loadJSONStrict,
  guardarJSON as saveJSON,
  momentoUltimaEscritura,
  fijarUsuarioActual,
  olvidarInstantaneas,
  verificarPin,
  autorizarConPin,
  cambiarPin,
  identificarPorPin,
  registrarConteoInventarioGeneral,
  unificarCategorias,
} from "@/lib/datos";
import { obtenerCliente } from "@/lib/supabase/cliente";
import { cargarCatalogos } from "@/lib/datos/catalogos";
import { nuevoId } from "@/lib/datos/traduccion";
import { normalizarRespaldo } from "@/lib/datos/respaldo";
import { subirLogo, quitarLogo } from "@/lib/datos/logo";
import {
  ShoppingCart, Package, FileText, Wallet, Settings as SettingsIcon,
  Camera, Search, Plus, Minus, Trash2, X, Check, AlertTriangle,
  LogOut, ScanLine, TrendingUp, TrendingDown, Upload, User, Lock,
  Store, RefreshCw, Pencil, ChevronLeft, ChevronRight, PackagePlus,
  Printer, ArrowUpCircle, ArrowDownCircle, Loader2, Truck, Sparkles,
  Receipt, ClipboardCheck, ImagePlus, Banknote, Unlock, Building2, Phone, Mail,
  Tags, Scale, BarChart3, PackageX, Award, Medal, PackageMinus,
  Bot, Send, MessageSquare, CheckCircle2, Sparkle,
  CalendarCheck2, ClipboardList, CalendarClock, Users, Download, Blend,
  MoreHorizontal, CreditCard, UserPlus, History, Bell, Flashlight
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

/* ---------------------------------------------------------
   PALETA / TOKENS DE DISEÑO
   La misma paleta del sitio público ("Plato de barrio"): papel tostado,
   tinta casi negra, verde y latón de almacén de barrio, azul rey de la
   insignia del logo. Antes la intranet tenía sus propios tonos (un slate
   azulado, más "panel de control" que almacén); se reemplazan aquí mismo
   —cada pantalla sigue leyendo C.xxx, así que el cambio de identidad no
   exige tocar cada pantalla una por una. Los tonos se ajustaron apenas lo
   necesario frente al sitio público para seguir cumpliendo AA (contraste
   4.5:1 en texto normal): esta es una herramienta de trabajo de varias
   horas al día, así que no vale la pena resignar legibilidad por igualar
   un matiz al pixel. */
const C = {
  // Texto y superficies oscuras
  ink: "#12140f",        // texto principal · 18.5:1 sobre blanco (--ink del sitio)
  inkSoft: "#2b2118",    // superficies oscuras (barra lateral, totales) · --brown del sitio

  // Superficies claras
  paper: "#faf9f4",      // fondo de la aplicación · --paper del sitio
  paperDark: "#f0ece0",  // relleno suave: filas, chips, cajas de resumen · --paper-dark
  paperLine: "rgba(18,20,15,.12)", // bordes y separadores · variante de --line

  // Verde: color de acción y de confirmación
  green: "#1a6b41",      // 6.5:1 sobre blanco · 6.5:1 con texto blanco encima (--green-dark del sitio: el --green claro del sitio no llega a 4.5:1)
  greenDark: "#124b2e",  // 10.1:1 sobre blanco
  greenSoft: "#e8f0ec",  // fondo de estados positivos

  // Rojo/terracota: alertas, mermas, egresos — el --red del sitio
  rust: "#c93b5a",       // 4.9:1 en ambos sentidos
  rustSoft: "#faebee",

  // Dorado: pendientes y avisos (el --gold del sitio). El tono de fondo y
  // el de texto son distintos a propósito: un mismo dorado no puede
  // cumplir contraste como fondo con texto oscuro y como texto sobre
  // blanco a la vez.
  brass: "#e2cb8a",      // fondo · 11.6:1 con texto tinta encima
  brassText: "#8d701d",  // texto · 4.7:1 sobre blanco
  brassSoft: "#fbf7ee",

  // Grises de apoyo — versión más cálida (--gray del sitio, oscurecido lo
  // justo para volver a 4.5:1 como texto secundario)
  gray: "#756e60",       // texto secundario · 5.1:1 sobre blanco
  grayLight: "#8a8271",  // texto terciario, solo sobre fondos oscuros (--gray tal cual del sitio)

  // Azul rey: el de la insignia del logo y los CTA del sitio público
  info: "#2541d6",
  infoSoft: "#eef0fc",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

/* Escala tipográfica. El mínimo es 14px: por debajo de eso el texto cansa en
   una jornada completa, y en el teléfono cualquier campo bajo 16px hace que
   iOS acerque la pantalla solo al tocarlo. */
.text-\\[9px\\], .text-\\[10px\\], .text-\\[11px\\] { font-size: 13px !important; line-height: 1.35 !important; }
.text-xs { font-size: 14px !important; line-height: 1.45 !important; }
.text-sm { font-size: 15px !important; line-height: 1.5 !important; }
input, select, textarea { font-size: 16px !important; }

/* Los números de dinero y cantidad van en cifras de ancho fijo, para que las
   columnas queden alineadas y no bailen al actualizarse. */
.font-mono, table td, .tabular {
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
}

/* Área táctil mínima: 44px es lo que exige la guía de Apple y lo que hace
   falta para no errarle a un botón con el dedo apurado en el mesón. */
button, [role="button"] { min-height: 44px; }
button { touch-action: manipulation; }

/* Foco siempre visible: es la única pista que tiene quien navega con teclado
   —o con el lector de código— de dónde está parado. */
*:focus-visible {
  outline: 2px solid ${C.green};
  outline-offset: 2px;
  border-radius: 6px;
}

/* Movimiento breve y con sentido. Quien haya pedido menos animación en su
   sistema operativo no ve ninguna. */
.transition, button, a { transition: background-color .15s ease-out, border-color .15s ease-out, color .15s ease-out, box-shadow .15s ease-out, transform .15s ease-out; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}

/* Respuesta al toque: una escala apenas perceptible confirma que el golpe
   entró, sin mover nada de sitio. */
button:not(:disabled):active { transform: scale(.98); }

/* Barras de desplazamiento discretas */
::-webkit-scrollbar { height: 10px; width: 10px; }
::-webkit-scrollbar-thumb { background: ${"#ddd6c8"}; border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }
::-webkit-scrollbar-thumb:hover { background: ${"#c7bfaf"}; background-clip: content-box; }
::-webkit-scrollbar-track { background: transparent; }
`;

/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */
// Los identificadores ahora son uuid, que es el tipo de clave primaria de
// todas las tablas. El prefijo que recibía esta función ("prod", "sale"…)
// ya no se usa, pero se acepta para no tener que tocar cada llamada.
function uid(_prefijo) {
  return nuevoId();
}
function formatCLP(n) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(n || 0));
}
function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
  } catch { return iso; }
}
function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function normalize(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Nombres de producto y de sección/categoría siempre se guardan en
// MAYÚSCULAS — así "Bebidas", "bebidas" y "BEBIDAS" nunca quedan como tres
// secciones distintas por error de tipeo. Se aplica en todo lugar donde se
// crea o edita un producto o una categoría.
function upperField(s) {
  return (s || "").toString().trim().toUpperCase();
}

// Traduce mensajes de error crudos (de la API, de la red, del navegador —
// casi siempre en inglés) a mensajes claros en español, para que cualquier
// persona que use el sistema entienda qué pasó, sin tecnicismos.
function friendlyError(err, fallback) {
  const raw = (err && err.message) ? String(err.message) : (typeof err === "string" ? err : "");
  const low = raw.toLowerCase();
  if (low.includes("rate limit") || low.includes("too many requests") || low.includes("reload to continue")) {
    return "El asistente de IA está saturado por uso seguido de todo el equipo (no es algo que hayas hecho tú). Espera uno o dos minutos y vuelve a intentarlo.";
  }
  if (low.includes("overloaded") || low.includes("529")) {
    return "El servicio de IA está saturado a nivel general en este momento (no es algo que hayas hecho tú, ni un problema de este sistema). El sistema ya reintentó varias veces solo antes de mostrarte esto — intenta de nuevo en unos minutos.";
  }
  if (low.includes("failed to fetch") || low.includes("networkerror") || low.includes("network request failed") || low.includes("load failed")) {
    return "No se pudo conectar a internet. Revisa tu conexión y vuelve a intentarlo.";
  }
  if (low.includes("timeout") || low.includes("timed out")) {
    return "La solicitud tardó demasiado y se cortó. Intenta de nuevo.";
  }
  if (low.includes("unauthorized") || low.includes("forbidden") || low.includes(" 401") || low.includes(" 403")) {
    return "No se pudo autorizar la solicitud. Intenta de nuevo más tarde.";
  }
  if (low.includes("json") || low.includes("unexpected token")) {
    return fallback || "No se pudo interpretar la respuesta. Intenta de nuevo.";
  }
  // Errores técnicos crudos de Postgres/PostgREST (códigos, nombres de
  // columnas, jerga de restricciones): mejor el genérico que ese texto.
  if (/pgrst\d|violates|duplicate key|constraint|relation .* does not exist|permission denied for|jwt |P0001|23505|23503|42501/i.test(raw)) {
    return fallback || "Ocurrió un problema inesperado. Intenta de nuevo.";
  }
  // Cualquier otro mensaje se muestra tal cual. Los que arma el propio
  // sistema (como los de las funciones de la base: "Solo un administrador
  // puede...", "El PIN debe tener...") ya vienen en español y listos para
  // mostrarse — antes esto se detectaba buscando tildes o "ñ", pero varios
  // de esos mensajes no llevan ninguna letra acentuada y terminaban
  // tapados por el genérico sin que nadie entendiera la razón real.
  if (raw) return raw;
  return fallback || "Ocurrió un problema inesperado. Intenta de nuevo.";
}
function isSameDay(iso, ref) { return dayKey(iso) === dayKey(ref); }
function isSameMonth(iso, ref) {
  const a = new Date(iso), b = new Date(ref);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

const EL_GALPON_LOGO = "data:image/png;base64,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3gkiGUMiytaoGrK4e8/uHTt2iGoIIU35NzCC8JUH9/smiWI6EUCNiLLFqenxicmxJEWbYNAya2TeFcRYr9WKopCAjeaoMeb2jTs//pefPXvq1MSOY71uyGocnzTmqK2oxtx/IN9icri5VWII4pwntElKvY67eevO8spaWZTxcBjDOmM1aICEFB8hAJEHa0IMelyDyokqXL549b13P3CltyYBoBBc0AAQDh05MDM1laaMpOKDF59w9uXeGB+8NZSkDKA7d0394R9+bXV5dX52IZ5XolC+gAJwkOCclKWsrbc/uXL12dmnDxze269fxblgpbii76tcR5mMEIJGVSAmY4y1FqutDkg18mfiJRqUZR7VreIB91QVEJeX1777d99/++33VlfX4j8yPTV164lbI6Ojr7zyrO2Tlzd/TyXmsKoqGgyTteycMzax1vbKnPnxetgGJSM2wMacPHF45c3XZ2fvrK+3REOapd5rCMGQIQ0hSK2WGiIfipXl9bd/8c7OnTMvv/pcmtpQEfJUFR464j2AimaMUY3PWnVQUNU0MT/+8Tvf+c7f37hxu9fzjfpYUQQKmKVp2XPOuyyxFrHT2yBXPnvimeeef3bf/r1oAVUN2egS/OvaIsrMCKABEVFFALDXzUvnYkmzSrdlq+s0ft5LHr3oVVEQyFoan2z+8Tf+qNstFhdXO62i2RzJMsi7RZzI7Xd74vmBRQRVI0EoHluJldmkma1ltTRNjUWSx1sb9VHKMngvdQGVDQOG2EGemBo7ceLokaMHkhq081ViV/peL2/b1Bq2ea8sCmdtSmBv35z75bsfXbt8x3sfab5FHkSACPuuiXqf+Or2NxAjFZEqMiMILC6uzc7ObqxveO9j0KluT3RZI2Jka621FgH7ScEDVkTkJg7+JoD5haWFhVVra0URmo1mmiW+LBvN5smTJ2ZmJisPbEY2X/6dZuYod6UKo2O1F1987vCRgybhWAOPZZEg8QJ67yVN6yqwML+00erYjCWoc9Fq7tf4pSio8y7+jPc+hDAwjB2E8n6qvIU/Q18shioCQJJwWYQ7dxbW1jYILWJCaGZn53917cbS4hKoRMHE++o/1U4TvHgfANA5JyE8hFjQb+MB60fi0nnnwujoyPETR44fPzoyUkcCH3y30ymKMk2zLKuLSFmWrghpUivL8qOPzrz33vvra102aA3F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";
const DEFAULT_SETTINGS = { businessName: "El Galpón", businessLogo: EL_GALPON_LOGO, adminPin: "1234", invoiceCounter: 1, ivaIncluded: true, historicalImported: false, lastBackupAt: null, legacyImportV2Done: false, productsUppercased: false };

// Datos reales del negocio (agosto 2025 a julio 2026) tomados de la planilla
// Excel de compra/venta del negocio — a nivel mensual, tal como la trae la
// planilla (compras, sueldos, gastos extra, ventas). Se cargan una sola vez
// como movimientos históricos, para que Finanzas y el comparativo mensual
// arranquen con un año completo de contexto real en vez de partir de cero.
const HISTORICAL_IMPORT = [
  { year: 2025, month: 8, label: "Agosto 2025", compras: 13860339, sueldos: 530000, gastosExtra: 1135810, ventas: 16980990 },
  { year: 2025, month: 9, label: "Septiembre 2025", compras: 16536383, sueldos: 515000, gastosExtra: 719919, ventas: 19299240 },
  { year: 2025, month: 10, label: "Octubre 2025", compras: 16833646, sueldos: 500000, gastosExtra: 1652365, ventas: 19792250 },
  { year: 2025, month: 11, label: "Noviembre 2025", compras: 17469457, sueldos: 540000, gastosExtra: 1611780, ventas: 21933580 },
  { year: 2025, month: 12, label: "Diciembre 2025", compras: 16474568, sueldos: 980000, gastosExtra: 834300, ventas: 25934540 },
  { year: 2026, month: 1, label: "Enero 2026", compras: 19183181, sueldos: 840000, gastosExtra: 868792, ventas: 23901803 },
  { year: 2026, month: 2, label: "Febrero 2026", compras: 14038102, sueldos: 885000, gastosExtra: 1521393, ventas: 20148757 },
  { year: 2026, month: 3, label: "Marzo 2026", compras: 15454905, sueldos: 933000, gastosExtra: 825441, ventas: 18125600 },
  { year: 2026, month: 4, label: "Abril 2026", compras: 15767997, sueldos: 680000, gastosExtra: 1175400, ventas: 18174380 },
  { year: 2026, month: 5, label: "Mayo 2026", compras: 16090246, sueldos: 655000, gastosExtra: 1108990, ventas: 20235322 },
  { year: 2026, month: 6, label: "Junio 2026", compras: 12294800, sueldos: 625000, gastosExtra: 1324441, ventas: 17388900 },
  { year: 2026, month: 7, label: "Julio 2026", compras: 15654590, sueldos: 470000, gastosExtra: 615066, ventas: 18129910 },
];

function buildHistoricalMovements() {
  const out = [];
  HISTORICAL_IMPORT.forEach(m => {
    const dateIso = new Date(m.year, m.month, 0, 12).toISOString(); // último día del mes
    out.push({ id: uid("hist"), date: dateIso, type: "ingreso", concept: `Ventas ${m.label} (histórico importado)`, amount: m.ventas, category: "Ventas históricas", auto: true, historical: true });
    out.push({ id: uid("hist"), date: dateIso, type: "egreso", concept: `Compras de mercadería ${m.label} (histórico importado)`, amount: m.compras, category: "Compras históricas", auto: true, historical: true });
    if (m.sueldos > 0) out.push({ id: uid("hist"), date: dateIso, type: "egreso", concept: `Sueldos ${m.label} (histórico importado)`, amount: m.sueldos, category: "Sueldos históricos", auto: true, historical: true });
    if (m.gastosExtra > 0) out.push({ id: uid("hist"), date: dateIso, type: "egreso", concept: `Gastos extra ${m.label} (histórico importado)`, amount: m.gastosExtra, category: "Gastos históricos", auto: true, historical: true });
  });
  return out;
}

// Catálogo real rescatado del sistema POS anterior (segunda entrega, ya
// verificada): productos con su stock, código de barras, precio, costo,
// categoría y proveedor real. Se depuraron antes de traerlo: se descartaron
// filas basura sin nombre real ("Sin Codigo"), duplicados por código de
// barras (se quedó el registro más reciente / con stock), cantidades que
// eran errores evidentes de tipeo (ej. 4.130.000 unidades de pilas) — esas
// quedan en cero en vez de inventarse un número, y stock negativo también
// se deja en cero. Los productos sin código de barras real reciben uno
// interno (INT-LEGACY-#) para poder venderlos igual.
const LEGACY2_CATS = ["7802715000718", "AB", "Abarrotes", "Alinos", "Aseo personal", "Bebidas", "Carnes", "Cecinas", "Chocolate", "Cigarros", "Concervas", "Confites", "Congelados", "Dulces", "Elecronica", "Escolares", "Fruta", "Galletas", "Gomitas", "Helados", "Lacteos", "Masas", "Mascotas", "Mckay", "Medicamentos", "Pan", "Perfumeria", "Pilas", "Regalo", "Sin Clasificar", "Snacks", "Utiles Aseo", "Utiles Escol", "Verduras", "aderesos", "alimento masc", "ar", "aseo", "cereales", "colados", "embutidos", "energizantes", "enlatados", "ent", "fr", "insecticida", "juguetes", "nose", "pastillas", "pes", "postres", "sopas", "torta"];
const LEGACY2_SUPS = ["Agrosuper", "Andy Fruna", "Arcor", "Ariztía", "Bresler", "CCU", "Carozzi", "Castano", "Cesar Jaque", "Coca Cola", "Com. Castro", "D Trigo", "Dimarc", "Distribuidora PP&PE", "Don Luis", "El Dato Barato", "El satito", "Evercrisp", "Fruna", "Ideal", "Iván", "La Oferta", "La Selecta", "Latino", "Lo Valledor", "Lucchetti", "Maca", "Madel", "Marcelo", "Marco Polo", "Nestle", "Nestle Mckay", "Nutrisco", "PF", "PPYPE", "Punto Congelado", "Pura Vit", "San Francisco", "San Jorge", "San Pablo", "Savory", "Selecta", "Simon Ice", "Soprole", "Venecia", "Verde Oliva LV", "chaddad", "colina", "colun", "costa", "ferbest", "jaq", "lovalledor", "marta", "mul", "multimas", "none|", "o", "papeles", "patagonia", "rbf", "sembrasol", "shadadd", "shaddad", "trendy", "tres montes", "Ñuble"];
const LEGACY2_PRODUCTS = [
["7800678177478","Hilo de coser 5",29,1500,0,0,0,-1],
["7803473300034","queque cena sabor vainilla 225 g ideal",29,500,0,0,0,-1],
["62886","Cloro domestico Golden 5 lt",29,1500,0,0,0,-1],
["22262","mamadera kikko",29,1300,0,0,0,-1],
["22531","mordedor kikko",29,990,0,0,0,-1],
["48341000808","Algodon petlos 80 u",29,990,0,0,0,-1],
["123456789","Agua Altos de la patagonia 6 l",29,1990,0,0,0,-1],
["12345678936","Bolsa  basura Winnex 80x110",29,1390,0,0,0,-1],
["12345678950","Bolsa basura Winnex 70x90",29,990,0,0,0,-1],
["12345678998","bolsa de basura winnex",29,4700,0,0,0,-1],
["21000026326","mayo kraft 789 g",29,4100,0,0,0,-1],
["21000026968","mayo kraft real pote 394g",29,4490,0,0,0,-1],
["21000070237","mayo kraft",29,2990,0,0,0,-1],
["21000070251","mayonnesa kraft 578g",29,2390,0,0,0,-1],
["22200940207","desodorante barra hombre",29,2200,0,0,0,-1],
["22200940245","Speed stick cool fresh barra",29,2300,0,0,0,-1],
["22200962995","lady speed stik",29,2600,0,0,0,-1],
["22200963435","LADY SPEED STICK",29,2600,0,0,0,-1],
["22200963695","Lady Speed Stick barra",29,2600,0,0,0,-1],
["25215499647","audifonos manos libres maxell",29,2600,0,0,0,-1],
["25215499678","audifonos manos libres maxell",29,5990,0,0,0,-1],
["25215717239","USB flix maxell 16gb",29,800,0,0,0,-1],
["25215720727","pila maxtell aa",29,890,0,0,0,-1],
["25215720734","pila maxtell aaa",29,2700,0,0,0,-1],
["30900111308","Cream Cheese  226 g",29,2600,0,0,0,-1],
["35000970916","LADY SPEED STICK",29,2700,0,0,0,-1],
["38000138416","Pringles original 149 g",29,2100,0,0,0,-1],
["38000138430","Papas Pringles Crema limon 158 g",29,2700,0,0,0,-1],
["38000138638","Papas Pringles Pizza 137 g",29,2700,0,0,0,-1],
["38000183713","Pringles Jamon 158",29,2400,0,0,0,-1],
["38000184932","Pringles Original 124 g",29,2400,0,0,0,-1],
["38000184949","pringles 124 g",29,2500,0,0,0,-1],
["38000184956","Pringles Queso 1234 g",29,4900,0,0,0,-1],
["39800011398","PILAS CALEFONT ENERGIZER",29,1200,0,0,0,-1],
["39800011626","bateria eveready 9V1",29,1390,0,0,0,-1],
["39800015464","pilas energizer 2 und AA2",29,2,0,0,0,-1],
["41333000985","pilas duracell D x 2",29,950,0,0,0,-1],
["41333016634","Pila Duracell    AA",29,950,0,0,0,-1],
["41333428482","Pila Duracell    AAA",29,1300,0,0,0,-1],
["41789001833","maruchan queso",29,1100,0,0,0,-1],
["41789001840","MARUCHAN SABOR POLLO PICANTE 64G",29,1300,0,0,0,-1],
["41789001918","MARUCHAN INSTANT LUNCH 64G",29,1300,0,0,0,-1],
["41789001925","MARUCHAN INSTANT LUNCH CARNE DE RES 64G",29,1300,0,0,0,-1],
["41789001956","MARUCHAN CON CAMARON 64G",29,1300,0,0,0,-1],
["41789001987","maruchan camaron y chile pekin",29,1100,0,0,0,-1],
["48341991007","algodon",29,3200,0,0,0,-1],
["54300090018","Marshmallows 300 g",29,1100,0,0,0,-1],
["59491002352","sopa instantanea mr noodls carne",29,1100,0,0,0,-1],
["59491002505","sopa instantanea mr noodls pollo",29,1000,0,0,0,-1],
["59491002550","Sopa Mr Noodles Pollo picante 64g",29,2100,0,0,0,-1],
["62020050526","Nutela & Go palitos 52 g",29,1400,0,0,0,-1],
["658325357134","Servilletas Tersus 300 aprox",29,1500,0,0,0,-1],
["70330506923","Corrector Bic",29,1400,0,0,0,-1],
["70330731806","MAQUINA DE AFEITAR BIC 3 HOJAS",29,1800,0,0,0,-1],
["70847009511","monster energetica 473 ml",29,1800,0,0,0,-1],
["70847021964","monster energy ultra sin azucar 473ml",29,1300,0,0,0,-1],
["70847027447","energetica reign sabor melon mania 473ml",29,1300,0,0,0,-1],
["70847027461","energetica reign sabor naranja dreamsicle 473ml",29,1500,0,0,0,-1],
["724373592046","Cervilleyas Antonella 300 u",29,1600,0,0,0,-1],
["7337001838","chupa chups extremes gomitas acidas",29,1500,0,0,0,-1],
["736372818300","coliza marcelo 8 unid",25,1600,907.0,3,0,28],
["737186939939","Mineral Altos de la Patagonia 1 sin gas",29,2200,0,0,0,-1],
["742832854436","pan de hamburguesa marcelo 10 unidades",29,1800,0,0,0,-1],
["742832854511","Pre Pizza x 5 Marcelo 375 g",29,1900,1500.0,6,0,-1],
["760412263409","Gloss con glitter Flamenco",29,3500,0,0,0,-1],
["7811459442421","torta milhojas marcelo",29,2900,0,0,0,-1],
["781159442421","torta milhoja manjar marcelo",52,4490,3900.0,3,0,28],
["781159862038","BROWNIE CHOCOLATE 520G",29,2200,0,0,0,-1],
["781159862151","queque arena marmoleado macelo 440g",29,1300,0,0,0,-1],
["1000000454703","Ampolleta NGP 70 W",29,4600,0,0,0,-1],
["1003490608212","domino",46,4600,2900.0,6,0,14],
["1003490685794","domino",29,500,0,0,0,-1],
["1010025120675","Palitos de helado",32,600,290.0,10,0,-1],
["1010025130643","palos de helados color",29,1000,0,0,0,-1],
["10174","jengibre productos carreno 100 g",29,3500,0,0,0,-1],
["1100000014904","Audifono Umanno",29,2490,0,0,0,-1],
["1234","poet 1800ml  variedades",29,5200,0,0,0,-1],
["12346172","el gran santiago",29,1390,0,0,0,-1],
["1632228383","pistacho salado las mellizas 60 gr",29,1600,0,0,0,-1],
["2019022400987","Te Verde Homar 20 bol",29,1600,0,0,0,-1],
["2100011280007","vale por",29,5000,0,0,0,-1],
["229724706","la gotita poxipol",29,2700,0,0,0,-1],
["2330901","pvc film alusa vanni 30 mts",29,1600,0,0,0,-1],
["2602202108591","tela adesiva",29,2390,0,0,0,-1],
["2610200150023","Test de embarazo",29,1000,0,0,0,-1],
["2660110300117","Greda profesional Mayja 1k",29,1600,0,0,0,-1],
["2660110300124","Arcilla profesional blanca Mayja",29,900,0,0,0,-1],
["2810950009408","manjar nestle 200g",29,1300,0,0,0,-1],
["2881680000454","Candado YTS",29,1200,0,0,0,-1],
["3000721650901","ampolleta unilux led 70w",29,800,0,0,0,-1],
["30052765","OCB premium",29,1000,750.0,24,0,-1],
["3073781008975","la vaca bel",29,2300,0,0,0,-1],
["3086124001632","lapiz 12 colores bic",32,2300,1750.0,9,0,8],
["7804684710018","energetica dragonballz sabor chicle",29,3300,0,0,0,-1],
["4100015664009","Lápiz corrector Fulton`s 7ml",29,1200,0,0,0,-1],
["4100017162008","Silicona líquida multiuso Fulton`s 100ml",29,1990,1300.0,10,0,-1],
["4100017283000","Cola fría Fulton`s 110g",32,1200,550.0,6,0,15],
["4100017412004","Plasticina 10 colores Fulton`s",32,1300,800.0,6,0,-1],
["4100017552007","Tijera escolar punta roma Fulton`s",29,300,0,0,0,-1],
["4148914305005","Plumones escolares Fulton`s 12 colores",32,1300,850.0,5,0,-1],
["4148914306002","plumones finos 6 unidades",29,800,0,0,0,-1],
["42069942","Chicle Orbit 10 un",29,800,0,0,0,-1],
["42123880","Chocle Orbit 10 un arandano",29,800,0,0,0,-1],
["42247371","Chicle Orbit 10 un",29,2500,0,0,0,-1],
["4710007748640","cable tipo c dblue",29,1500,0,0,0,-1],
["4718295213710","Silicona líquida JM 100ml",29,2200,1650.0,0,0,-1],
["4719859980536","silicona eiffel",29,600,0,0,0,-1],
["4719867213190","Pegamento Chemmer",29,5900,0,0,0,-1],
["4740007700614","cargador de pared tipo c tecnolab",29,5900,0,0,0,-1],
["4740007705114","cargador de iphone tecnolab",29,2200,0,0,0,-1],
["481403172","lana matizada 100g",29,1500,0,0,0,-1],
["4820075505547","barra air chocolate millennium 90g",29,2500,0,0,0,-1],
["4820075508883","Chocolate Rose milenium 100 g",29,3200,0,0,0,-1],
["4820216770018","Levadura Istanbul Yeast 500 g",29,1200,0,0,0,-1],
["4891228530136","MAQUINA DE AFEITAR SCHICK4",4,1500,1090.0,12,0,14],
["4895241205293","Poki pokemón",13,1500,1000.0,12,0,26],
["4895241205323","Pokemon avellana",29,1500,0,0,0,-1],
["4897033226219","bombones mabu corazones 5 unidades",29,2000,0,0,0,-1],
["5056282213510","Tijera sastre",29,1000,0,0,0,-1],
["5056282288235","mascara facial nutritiva E newkylie",29,1000,0,0,0,-1],
["5056282288242","mascara facial vitamin c amarilla",29,1000,0,0,0,-1],
["5412873400293","Papas Pre-Fritas Marquise 2.5 k",29,6990,0,0,0,-1],
["5413081290119","papa pre frita europe 2k12",12,6990,5320.0,10,0,24],
["5413121361588","bombones premium corazones 65g",29,1900,0,0,0,-1],
["5413121361595","bombones Belgian concha",29,6900,0,0,0,-1],
["5425027896316","papa pre frita bite2k y medio",29,2590,0,0,0,-1],
["5680201308102","Eliminador de garrapatas, Fumigación Doméstica",29,2400,0,0,0,-1],
["5900396000910","Té negro Justa minute 100 bolsitas",29,600,0,0,0,-1],
["5900396011022","Te Minute Blacktea 2o Bol.",29,1300,0,0,0,-1],
["602161228","CARTON FORRADO",29,4290,0,0,0,-1],
["606110910927","detergente al gramo 5lt",29,990,0,0,0,-1],
["606110910958","limpiapiso algramo lavanda 900 cc",29,1300,0,0,0,-1],
["608875008994","ketchup heinz 190 g",29,1200,0,0,0,-1],
["614143233760","Tocineta Snack Genyal 140 g",29,2400,0,0,0,-1],
["61590692733744","Cera Acrilica Preticol",31,2400,1800.0,12,0,-1],
["639853101321","gasa 5x5",29,4990,0,0,0,-1],
["650240027468","Crema facial Teatrical aclaradora 200g",29,4990,0,0,0,-1],
["650240027581","Crema facial Teatrical humectante 200g",29,4990,0,0,0,-1],
["650240032738","Crema facial Teatrical antiarrugas 200g",29,1500,0,0,0,-1],
["658325545845","Sal parrillera Kül & Bulk",2,1590,1000.0,5,0,8],
["664697118990","Servilletas Giulietta 40 u",29,1500,0,0,0,-1],
["677306730216","pelota tenis",29,990,0,0,0,-1],
["67801907010399","Salchicha San Jorge pollo 5 un",29,5200,0,0,0,-1],
["6892021027128","Dardos Dadt g",29,1000,0,0,0,-1],
["689490000754","Carnhival Silver 20",29,600,0,0,0,-1],
["6901010641716","gasa esteril",29,1500,0,0,0,-1],
["6901521254627","Vaso 530 ml U",29,1500,0,0,0,-1],
["6901845041606","pocky sabor frutill 55g",29,1500,0,0,0,-1],
["6901845045062","pocky sabor chocolate 55g",29,1190,0,0,0,-1],
["6902088603828","Pepsodent 90 g",29,1900,0,0,0,-1],
["6902221358431","Bowl ceramica Spider Marvel",29,1200,0,0,0,-1],
["6908312000777","yan yan hello kitty sabor chocolate",29,1200,0,0,0,-1],
["6908312000852","uan yan hello kitty blanco",29,1200,0,0,0,-1],
["6908312001873","yan yan hello kitty sabor frutilla",29,800,0,0,0,-1],
["6908795803834","Corta carton",29,950,0,0,0,-1],
["6910021007206","Cepillo  dientes Colgare adulto",29,1600,0,0,0,-1],
["6912345600019","papel aluminio",2,1300,890.0,6,0,24],
["6917554726369","Papas fritas original Ruca`s 100 g",29,1400,0,0,0,-1],
["6917554956223","Crujientes queso Ruca`s tyarro 60 g",29,1400,0,0,0,-1],
["6917554956254","Aros de cebolla Ruca`s tarro 60 g",29,300,0,0,0,-1],
["6917790006195","Levadura Angel 10 g",29,300,0,0,0,-1],
["6917790016019","levadura seca instantanea 10g",29,1900,0,0,0,-1],
["6920152400777","Sopa estilo maruchan en pote sabor carne",29,1900,0,0,0,-1],
["6920152414217","Sopa estilo maruchan en pote sabor carne picante",29,1000,0,0,0,-1],
["6921469421417","flower secret brillo labial",29,2500,0,0,0,-1],
["6922235800122","Bombones Mabu  150 g",29,5900,4000.0,6,0,-1],
["6922331003229","Collets 6 Un",29,1500,0,0,0,-1],
["6923326200418","esprayt acido mabu 30ml",29,1900,0,0,0,-1],
["6924365751558","Cable Auxiliar 3.5 1 mt.",29,300,0,0,0,-1],
["6925374519412","CHUPETON MABU 20G",29,500,0,0,0,-1],
["6925995600407","peta zeta con pulcera",29,2490,0,0,0,-1],
["6926393328221","Circuito electrico Motarro",29,2000,0,0,0,-1],
["6926951803627","Panty Fashion palo de rosa  azul",29,1990,0,0,0,-1],
["6927804581051","mamaderas top kids con mango",29,3900,0,0,0,-1],
["6928001834148","Shampoo Experto 500 ml Fasmc",29,3900,0,0,0,-1],
["6928001834155","Shampoo desinfectante Fasmc",29,3900,0,0,0,-1],
["6928001834179","Shampoo biotina Fasmc",29,3900,0,0,0,-1],
["6928001834223","Acondicionador Experto  500 ml Fasmc",29,3900,0,0,0,-1],
["6928001834247","Acondicionador argan & keratina",29,3900,0,0,0,-1],
["6928001834308","Acondiicionador 8 en 1 Biotina Fasmc",29,3900,2900.0,6,0,-1],
["6928001834414","mascarilla  peel off max belle limpieza profunda 130ml",29,2500,0,0,0,-1],
["6928001837569","crema de manos fasmac con urea 100ml",29,3500,0,0,0,-1],
["6928001837576","Crema manos velvet hands Fasmc",29,500,0,0,0,-1],
["6928769420058","guante exfoliante",4,600,283.0,5,0,39],
["6931474783370","cable c a c hoco",29,1000,0,0,0,-1],
["6931598210882","Super Uyustools",15,1000,500.0,20,0,-1],
["6932024201634","nutella palito china 24g",29,100,0,0,0,-1],
["6937544304476","Pins y clips 50 pc",29,1900,0,0,0,-1],
["6937962107017","Sopa estilo maruchan en pote sabor pescado",29,1300,0,0,0,-1],
["6948939430014","Alusa Film",29,2000,0,0,0,-1],
["6950595900268","Pantys acanalada Jiayue",29,2000,0,0,0,-1],
["6950595900688","Pantys acanalada Jiayue",29,1600,0,0,0,-1],
["6955313110011","papel alusa",29,1300,890.0,12,0,-1],
["6958816987401","tela de curacion",29,10900,0,0,0,-1],
["6958954956017","duraznos en mitades 3k",29,300,0,0,0,-1],
["6965111223110","Mabu Explota x 4",29,1000,0,0,0,-1],
["6971162150510","GOMITA OSITO SWEETS ELEMENT",29,2990,0,0,0,-1],
["6971469292005","cable somostel",14,2990,1794.0,4,0,-1],
["6971549920026","aloe vera OYE 500ml",5,1300,1000.0,6,0,-1],
["6971549920057","aloe vera oye 500ml sabor frutilla",5,1300,1000.0,6,0,-1],
["6971549920071","Aloe Oye Durazno 500 ml",29,1200,790.0,6,0,-1],
["6971549920088","Agua aloe coco Oye! 500ml",5,1300,790.0,6,0,-1],
["6971549920156","aloe granada oye 500 ml",29,2400,0,0,0,-1],
["6971549920163","aloe arandano oye 500 ml",5,1200,1000.0,6,0,-1],
["6971549921016","aloe oye",29,2600,1890.0,12,0,-1],
["6973020679799","pinches negros",29,1400,0,0,0,-1],
["6973524800125","aloe vera da vinci granada 500",5,1400,1000.0,12,0,8],
["6973524800132","Jugo de aloe vera Pineapple El Arriero 500ml",5,1400,1000.0,12,0,8],
["6973524800149","aloe vera da vinci coco 500ml",5,1400,1000.0,12,0,8],
["6973606300079","caja de mascarillas safe mask50und",29,2900,0,0,0,-1],
["6973726252074","gel ducha",29,1500,0,0,0,-1],
["6973726252081","gel ducha",29,1300,0,0,0,-1],
["6975253031108","aluminio",29,990,0,0,0,-1],
["6975371450157","Candy mini dispensador",29,1990,0,0,0,-1],
["6991904220035","lima de pies",4,990,500.0,1,0,-1],
["701575381838","Levadura instantánea Levamás 125g",29,2600,0,0,0,-1],
["701907010306","salchicha tradicional san jorge 20 uni",29,1990,0,0,0,-1],
["7204923037492","Ilisit 7.3 Rubio Dorado",29,1200,0,0,0,-1],
["724609316446","malvavisco grande 270g",29,1500,0,0,0,-1],
["724609321518","Marshmallows Michel 120 g",29,1600,0,0,0,-1],
["736372818294","galletas pitucas marcelo 12 uni",29,1400,0,0,0,-1],
["736372818379","Pan Amasado Marcelo 8 un",25,1700,793.0,4,0,28],
["737186249199","ARROZ KAMIR 1KG",29,1990,0,0,0,-1],
["737186533861","Recupper Kids aran-pome azul",29,1990,0,0,0,-1],
["737186533885","Recupper Kids 473 ml naranjo",29,1990,0,0,0,-1],
["737186533915","Recupper Kids pia",29,1990,0,0,0,-1],
["737186533946","Recupper Kids 473 ml rosado",29,2300,0,0,0,-1],
["737186533953","Recupper Kids celeste",29,1600,0,0,0,-1],
["739907000010","Harina de maiz Pan",29,1300,0,0,0,-1],
["7410031611947","Durazno mitades Ridetti 410 g",29,1600,0,0,0,-1],
["742832751988","score gorilla energetica 500 ml",5,1300,943.0,48,0,28],
["742832854344","Pan Integral Artesanal 500 g",25,1900,1400.0,6,0,28],
["742832854375","Pan Blanco Artesanal Marcelo 500 g",25,1900,1400.0,6,0,28],
["742832854405","Pan Completo Marcelo 10 un",29,2400,2000.0,0,0,-1],
["742832854412","Pan de pascua Marcelo 480g",29,2300,1800.0,0,0,-1],
["742832854504","pizza familiar marcelo 500g",25,2200,1790.0,6,0,28],
["7441008154594","Kotex tampones mini 8 un",29,3300,0,0,0,-1],
["7441008154600","tampones kotex super 8 uni",4,3400,2500.0,24,0,39],
["7441008154617","tampones kotex super plus 8",4,3900,3323.0,10,0,62],
["7441029504613","Galleta Principe sabor chocolate 84g",29,500,0,0,0,-1],
["7441029506181","Galletas principe 84 g marinela",29,1300,0,0,0,-1],
["7441029515268","Galleta Principe 84 g Marinela",29,1300,0,0,0,-1],
["745853845520","likedrk 473ml with shuggar",5,1300,930.0,0,0,11],
["745853845544","Likedrk energetica 473 cc",5,1300,930.0,20,0,11],
["7491290770873","cif multiuso crema 750g",29,2590,0,0,0,-1],
["7500435020008","Shampoo Head & Shoulders 375 ml",26,3690,2690.0,1,0,39],
["7500435111287","Ariel 800 g",29,2990,0,0,0,-1],
["7500435137393","detergente ariel en polvo 400 g",29,2900,0,0,0,-1],
["7500435140591","GILLETTE ALOE VERA",29,990,0,0,0,-1],
["7500435140607","GILLETTE VITAMINA E",29,2600,0,0,0,-1],
["7500435146364","detergente ace manzanilla 400g",29,2400,0,0,0,-1],
["7500435159999","downy suavisante",31,2600,1470.0,23,0,24],
["7500435161244","Prestobarba 3 Gillette 3",29,2990,0,0,0,-1],
["7500435195485","detergente ariel 400gr",29,1300,0,0,0,-1],
["7500435214605","GILLETTE 5 ACTIVE FRECH",4,3400,2500.0,1,0,24],
["7500435237215","ariel  downy 800g",31,2490,1990.0,19,0,39],
["7500478008780","galleta toddy tubo 142,5g",30,1700,1300.0,5,0,31],
["7500810001127","Galleta Gansito 2 Un 450",29,3390,0,0,0,-1],
["7501000674732","Mini Toddy clasica 39 g",29,1000,0,0,0,-1],
["7501007495705","mascarilla intensiva reparacion de keratina pantene rizos definidos 300ml",29,1000,0,0,0,-1],
["7501013118018","Jumex sabor pera 335ml",5,1000,700.0,12,0,6],
["7501013118032","Jumex 335 ml Mango",5,1100,797.0,12,0,6],
["7501013118056","Jumex  335ml sabor durazno",5,1100,797.0,12,0,6],
["7501013118063","Jumex Guayaba 335 ml",5,1000,700.0,12,0,6],
["7501013118193","Jumex 335 ml Manzana",5,1000,700.0,12,0,6],
["7501026006661","jabon rosa venus",29,2690,0,0,0,-1],
["7501026006869","jabon rosa venus",29,850,0,0,0,-1],
["7501035911376","Colgate Total 12",29,1900,0,0,0,-1],
["7501058635181","compota colado de pera organica gerber 113 g",29,3290,0,0,0,-1],
["7501058711700","removedor de sarro harpic 250 ml",29,2500,0,0,0,-1],
["7501071907548","toallitas desinfectantes clorox 30 uni",29,400,0,0,0,-1],
["7501071907555","tohallitas desinfectantes clorox",29,1200,0,0,0,-1],
["7501073427532","Trix Nestle 30 g",30,600,200.0,6,0,31],
["7502214739620","Máquina para afeitar Quattro 4 for women Schick",29,1600,990.0,24,0,39],
["75024956","Desodorante Rexona 48h",4,2600,2000.0,4,0,24],
["75027513","antitranspirante dove mujer",29,2600,0,0,0,-1],
["7503028615094","Cable usb-B 1 Hora",29,2290,0,0,0,-1],
["75038687","REXONA 48 XTRA COOL",4,2600,2000.0,2,0,24],
["75046224","desodorante dove barra hombre",29,2600,0,0,0,-1],
["7506306207516","Gel Fijador VO5 500 g",4,4490,3390.0,6,0,24],
["7506306241152","DOVE TONO UNIFORME",29,1990,0,0,0,-1],
["7506339334357","GILLETTE 3 PRESTOBARBA",29,2290,0,0,0,-1],
["7506339349047","old spice fresh",29,1400,0,0,0,-1],
["7506475103565","leche evaporada ideal 340ml",29,2690,0,0,0,-1],
["75076238","axe barra apollo",29,1200,0,0,0,-1],
["75076290","desodorante axe",29,1690,0,0,0,-1],
["7509546000985","Colgate Triple accion 75 ml",29,1300,900.0,12,0,-1],
["7509546009179","PASTA DE DIENTES COLGATE MAX PROTECT 75ML",29,1690,1520.0,100,0,-1],
["7509546041957","CEPILLOS DE DIENTES COLGATE",29,2990,0,0,0,-1],
["7509546063485","DESORANTE LADY SPEED STICK  150 ML",29,2600,0,0,0,-1],
["7509546063676","speed stick waterproof",4,3000,2300.0,12,0,39],
["7509546067902","lady speed stick",29,3300,0,0,0,-1],
["7509546067919","lady speed stick",29,3200,2400.0,6,0,-1],
["7509546653518","Colgate Total 12 Anti Sarro 150 ml",29,1000,0,0,0,-1],
["7509546683829","Colgate Total 12 Carbon 150 g",29,1800,0,0,0,-1],
["755695681811","naipe ingles",29,700,0,0,0,-1],
["7556956818112","Naipe Inglés",29,1500,1000.0,12,0,-1],
["755695688094","perro de ropa",29,1000,0,0,0,-1],
["757528039592","takis fuego sabor aji y limon 56 g",30,1000,700.0,12,0,19],
["757528039615","takis original 56 g",30,1000,700.0,12,0,19],
["757528039639","takis explosion sabor queso y aji 56 g",30,1000,700.0,12,0,19],
["757528044978","takis explosiom sabor queso y aji",30,2000,1400.0,12,0,19],
["757528044985","takis original sabor taco 2500 g",30,2000,1400.0,15,0,19],
["757528044992","takis fuego aji y limon 200 g",30,2000,1294.0,12,0,19],
["757528045296","takis wapas fuego 40 g",29,1000,0,0,0,-1],
["757528045302","takis wapas fuego 170 g",29,1900,0,0,0,-1],
["757528045333","takis wapas queso loco 40 g",29,1500,0,0,0,-1],
["757528045340","takis wapas queso loco 170 g",29,1500,0,0,0,-1],
["757528049539","TAKIS BLUE 113G",29,1500,0,0,0,-1],
["757528049546","taki original mediano",30,1500,1050.0,12,0,19],
["757528049607","takis xplosion",30,1500,964.0,10,0,19],
["7590011105106","Club Social Original 234 g",29,800,0,0,0,-1],
["75903565","Hoja de afeita Schick 3 un",29,2900,0,0,0,-1],
["7591066321121","shick",29,6990,0,0,0,-1],
["75930288","Rikesa Cheddar 200 g",29,1890,0,0,0,-1],
["7593298017100","Guantes de nitrilo talla L",29,2600,0,0,0,-1],
["760412263393","Labial peel off Flamenco",29,1500,0,0,0,-1],
["760412263515","Aceite de Ortiga",29,1500,0,0,0,-1],
["760412270131","set coles",29,2000,0,0,0,-1],
["760412294458","Pinza Flamenco",29,950,0,0,0,-1],
["760412295585","Paleta de lijado para pies",29,1900,0,0,0,-1],
["760412296100","pinzas",29,2900,0,0,0,-1],
["760412296179","Pinza tweezers Max belle",29,3100,0,0,0,-1],
["760412296513","Cepillo anti frizz",29,4500,0,0,0,-1],
["760412296520","Cepillo antifrizz Max belle",29,2000,0,0,0,-1],
["760412298739","encrespador profecional",29,3000,0,0,0,-1],
["760412311056","Mascarilla para pies lavanda Flamenco",29,2500,0,0,0,-1],
["760412332716","Rodillo piedra jade Max Belle",29,1290,0,0,0,-1],
["760412335618","Delineador plumón negra waterproof 24h Max Belle",29,2190,0,0,0,-1],
["7613030019060","base de pollo crispy maggi 80 g",29,2390,0,0,0,-1],
["7613030049883","leche condensada nestle 397g",2,2100,1834.0,7,0,31],
["7613030121046","Milo 300 g sachet nestle",29,2200,0,0,0,-1],
["7613030155973","sahne-nuss libre de azucar 100g",29,2200,0,0,0,-1],
["7613030262374","colado pavo verduras215g",29,2200,0,0,0,-1],
["7613030264040","colado carne y verduras nestle naturnes 215 g",29,2500,0,0,0,-1],
["7613030264088","colado pollo y verduras nestle naturnes 215 g",39,2300,1500.0,12,0,31],
["7613030264569","picado carbonada nestle naturnes 250 g",29,2800,2003.0,4,0,-1],
["7613030264705","Picado Cazuela pollo y verduras 250 g",29,2800,2000.0,6,0,-1],
["7613030447979","Milo Nestle 150 g sachet",2,2300,1670.0,3,0,31],
["7613030518426","mckay coco 120 gramos",30,990,500.0,4,0,31],
["7613030612247","sopa costilloas con fideos maggi",51,700,421.0,12,0,31],
["7613030612339","oblea super 8 nestle 29 g",29,450,200.0,20,0,-1],
["7613030692577","Picado Charquican 250 g",2,2800,2003.0,6,0,31],
["7613030692669","picado cazuela de vacuno y verduras nestle naturnes 250 g",2,2800,2003.0,4,0,30],
["7613031042913","Triton naranja 126 g",17,990,588.0,12,0,31],
["7613031214884","galletas soda ligth 180g",30,1300,586.0,10,0,31],
["7613031238613","base para cazuela de ave maggi 70 g",29,1000,0,0,0,-1],
["7613031259328","salsa de carne maggi 33 g",29,1200,726.0,6,0,-1],
["7613031259823","Base Carne a la caserola Maggi",29,1200,726.0,6,0,-1],
["7613031291359","Zucosos nestle 30g",38,600,350.0,12,0,31],
["7613031291441","Chocapic mini 30 g",29,2800,0,0,0,-1],
["7613031291489","Milo cereal Nestle 30 g",38,600,350.0,12,0,31],
["7613031370320","Chamito Frutilla x6   500 c/u",20,3000,2286.0,6,0,30],
["7613031370450","CHAMYTO X6 MANZANA ( 1X500)",20,2800,1587.0,6,0,30],
["7613031490615","chocolate dark 65% cacao nestle",29,900,0,0,0,-1],
["7613031571444","salsa blanca maggi 36 g",29,1200,750.0,12,0,-1],
["7613031649815","Galleta mini vino",30,500,200.0,2,0,31],
["7613031650729","Mini limon Mckay 40 g",29,450,0,0,0,-1],
["7613031651412","galleta mini mantequilla mckay 40 g",38,500,300.0,12,0,31],
["7613031651443","Mini Niza 40 g",30,500,200.0,8,0,31],
["7613031651474","Galleta de coco Mckay",17,500,250.0,12,0,31],
["7613031891344","Leche condensada Leche sur 397g",29,3790,0,0,0,-1],
["7613032203122","nescfe tradicion 50g",29,1490,0,0,0,-1],
["7613032269586","Cerelac 5 Cereales Nestle 400 g",29,1990,0,0,0,-1],
["7613032414580","crema de leche nestle 157g",2,1490,844.0,16,0,31],
["7613032415679","crema de leche nestle en tarro 236g",2,1890,1570.0,10,0,31],
["7613032425616","leche en polvo svelty descremada 800g",29,2900,0,0,0,-1],
["7613032436001","Chamito Frambuesa 500 c/u",20,3000,2290.0,0,0,30],
["7613032442873","Dark Cacao 65% Naranja",29,450,0,0,0,-1],
["7613032443191","mckay vino 155 gramos",30,1100,800.0,6,0,31],
["7613032443221","Mini Morocha Mckay 50 g",30,500,200.0,7,0,31],
["7613032464042","Galleta mini Triton 40 g",30,450,200.0,1,0,31],
["7613032517748","leche en polvo nido buen dia 130g",29,990,0,0,0,-1],
["7613032568436","Cappuccino Nescafe 280 g",29,990,0,0,0,-1],
["7613032589714","Galleta limon Mckay 150 g",29,5990,0,0,0,-1],
["7613032590369","Galleta Niza Mckay 150 g",30,1100,632.0,7,0,31],
["7613032596668","Chocolate After Eight Nestle 200 g",29,2090,0,0,0,-1],
["7613032789480","Galleta maravilla Mckay 147 g",29,500,0,0,0,-1],
["7613032836740","Nescafe Decaf 50 g frasco",29,750,0,0,0,-1],
["7613032901912","sopa maggi parauno sabor pollo merken",29,750,0,0,0,-1],
["7613033081477","Yogurt & Trix 1+1 Nestlé 133g",20,800,500.0,12,0,30],
["7613033081538","yougurt + chocapic Nestlé",29,800,500.0,10,0,-1],
["7613033088605","yogurt + milo Nestlé",29,800,490.0,11,0,-1],
["7613033088766","yogurt y zucosos 1+1 nestle",20,800,500.0,12,0,30],
["7613033189845","colado zapallito italiano y carne nestle maturnes 215 g",29,2300,1700.0,6,0,-1],
["7613033349256","colado verdura mix 215",29,2300,1700.0,6,0,-1],
["7613033355219","Sahne-nuss delicias almendras 100 g",29,600,0,0,0,-1],
["7613033458101","Cappuccino",29,600,0,0,0,-1],
["7613033458507","Moka Nescafe",2,600,340.0,14,0,31],
["7613033458538","Vainilla Late Nescafe",2,600,340.0,7,0,31],
["7613033495335","Cola de tigle Savory 70 ml",19,700,300.0,0,0,40],
["7613033527173","Doble Choca Moka Nescafe",29,250,0,0,0,-1],
["7613033567773","Leche Svelty Calcio 800 g",29,250,0,0,0,-1],
["7613033609992","sopa para uno esparragos maggi 14 g",29,2490,0,0,0,-1],
["7613033615764","sopa para uno pollo maggi 14 g",29,2490,0,0,0,-1],
["7613033820045","Triton pack x 3 vainilla",17,2290,1390.0,6,0,31],
["7613034232601","cereal estrellitas 330g",29,1400,0,0,0,-1],
["8445291928732","capri frutilla 90 grs",13,1700,1173.0,6,0,31],
["7613034276766","Capri 100 g",8,1600,1173.0,6,0,31],
["7613034276797","capri almendra 90 grs",8,1600,1173.0,6,0,31],
["7613034279309","capri sabor frutilla impulsivo",8,500,193.0,30,0,31],
["7613034279743","chocolate capri barra almendra 30 g",13,500,193.0,24,0,31],
["7613034303660","capri guinda 90 grs",8,1600,1173.0,6,0,31],
["7613034335661","leche svelty sin lacosa en polvo 800g",29,990,0,0,0,-1],
["7613034439277","Sahne-Nuss  Bitter 250 g",29,8300,0,0,0,-1],
["7613034565884","galleta triton sabor frutilla 126 g",17,990,650.0,12,0,30],
["7613034635525","Milo Nestle 700 g",29,600,0,0,0,-1],
["7613034721051","chocolate barra sahne nuss nestle 160 g",8,4400,3250.0,6,0,31],
["7613034868237","MILO 2 PORCIONES 28G",2,600,420.0,20,0,31],
["7613034891730","kuky chip chipers 190g",30,1990,1100.0,15,0,31],
["7613034999115","Kriko Savory",19,900,640.0,12,0,40],
["7613035120297","Zucosos Nestlé 350g",29,2800,2000.0,3,0,-1],
["7613035191822","base jugoso al horno mediterraneo maggi",29,400,0,0,0,-1],
["7613035281431","Jalea Nestle Naranja 110 g",20,500,318.0,10,0,30],
["7613035281462","Jalea Nestle 110 g",2,500,283.0,6,0,30],
["7613035281493","jalea nestle  frambuesa 110 g",2,500,283.0,6,0,30],
["7613035285408","Jalea sabor guinda Nestlé 110g",29,550,0,0,0,-1],
["7613035311565","Nescafé 3 en 1",2,600,480.0,8,0,31],
["7613035348530","svelty sin lactosa 200 ml",29,2100,0,0,0,-1],
["7613035407145","Danky 21 Savory 125 ml",19,2100,1599.0,3,0,40],
["7613035421592","Sahne-Nuss barquillo savory 125 ml",19,2300,1800.0,24,0,40],
["7613035493926","flan nestle",20,500,330.0,6,0,-1],
["7613035493957","flan nestle 110 g",29,500,330.0,6,0,-1],
["7613035493988","Flan nestle",20,500,330.0,10,0,30],
["7613035652101","cereal finets",2,3100,1757.0,3,0,31],
["7613035668485","Picado porotos con tallarines 215 g",29,1500,0,0,0,-1],
["7613035671621","Nescafe Stick 1.8 g",29,1500,0,0,0,-1],
["7613035772588","Crazy Savory Flocos 170 g",19,1600,1117.0,4,0,40],
["7613035779037","Crazy Savory Frambuesa 170 ml",19,1600,1117.0,12,0,40],
["7613035807464","Helado Mega franbuesa Savory 90 ml",19,2500,1900.0,16,0,40],
["7613035808133","Helado Sahne-Nuss 90 ml",19,2400,1592.0,10,0,40],
["7613035835986","mckay kuky chipchipers blanco 190 gramos",30,1990,1432.0,15,0,31],
["7613035939110","nestum infantil 250g",2,2700,1800.0,12,0,30],
["7613035939400","Nestum trigo y frutas 250 g",29,690,0,0,0,-1],
["7613035953741","semola salsa frambuesa 135g",29,2700,0,0,0,-1],
["7613035953949","semola con salsa de caramelo 135g",29,2600,0,0,0,-1],
["7613036048040","cereal infantil nestum arroz y avena",29,1450,0,0,0,-1],
["7613036048132","Nestum arroz 250 g",2,2600,2000.0,3,0,31],
["7613036245708","cereal fitness caja 330g",29,1800,0,0,0,-1],
["7613036245739","Fitness miel y almendras 330 g",29,550,0,0,0,-1],
["7613036310925","galleta morocha mckay 240 g",29,300,0,0,0,-1],
["7613036441940","leche svelty sin lactosa cacao cajita 200 ml",29,300,0,0,0,-1],
["7613036464963","Yoghurt batido Nestle 115 g",20,350,170.0,100,0,30],
["7613036466684","Yoghurt batido vainilla Nestle 115 g",20,350,250.0,120,0,30],
["7613036466714","Yoghurt batido Nestle damasco",20,350,200.0,100,0,30],
["7613036467179","YOGURT NESTLE BATIDO FRAMBUESA 115G",29,2500,0,0,0,-1],
["7613036467339","Yogurt griego Natural Nestlé 120g",20,500,255.0,100,0,30],
["7613036510264","Picado Caarne zanahoria arroz 250 g Nestle",29,1900,0,0,0,-1],
["7613036510585","Picado pollo arvejado 250 g",29,2700,0,0,0,-1],
["7613036510615","picado pastel de choclo 250g",29,990,0,0,0,-1],
["7613036566377","Helado Sahne- Nuss 900 ml",19,6450,4830.0,6,0,40],
["7613036615815","mckay triton limon white 126g",17,990,750.0,12,0,31],
["7613036637558","Galleta mini Triton chocolate 40 g",30,450,250.0,1,0,31],
["7613036653435","Nescafe Oferta x 2 340 g",29,11800,9000.0,12,0,-1],
["7613036838160","nesquik en polvo 180g",29,1400,0,0,0,-1],
["7613036838191","nesquik sabor frutilla en polvo 180g",2,1600,1074.0,4,0,31],
["7613036892964","SABORISANTE NESQUIK 180G",2,1600,1143.0,1,0,31],
["7613036927420","nescafe capuccino 330 ml",29,1500,0,0,0,-1],
["7613036927857","nescafe mokaccino 330ml",20,1200,800.0,3,0,30],
["7613037042290","Galleta Grill Mckay 140 g",30,1600,1162.0,6,0,31],
["7613037074680","super 8 balls 120 grs",30,1800,1110.0,5,0,31],
["7613037076820","moose trencito nestle 70 g",20,800,470.0,8,0,30],
["7613037077667","Manjar Nestle Retro tarro 380 g",29,2200,0,0,0,-1],
["7613037085181","triton mani 126g",29,2400,0,0,0,-1],
["7613037279290","Trencito colores 125 g",29,350,0,0,0,-1],
["7613037279450","trencito cookies 120 grs",29,350,0,0,0,-1],
["7613037416329","Yogurt Chamito Damasco 115g Nestlé",29,350,0,0,0,-1],
["7613037416725","Yogurt Chamito Frutilla 115g Nestlé",29,350,0,0,0,-1],
["7613037416787","Yogurt Chamito Manzana 115g Nestlé",29,1800,0,0,0,-1],
["7613037416886","Yogurt Chamito Vainilla 115g Nestlé",29,1800,0,0,0,-1],
["7613037462456","morocha balls mckay 120g",30,1800,1110.0,4,0,31],
["7613037471311","trencito balls 115 grs",30,1800,1110.0,5,0,31],
["7613037777659","Pura Fruta savory frambuesa 75 ml",19,1300,952.0,12,0,40],
["7613037777741","Helado Pura Fruta Savory Mango",19,1300,891.0,0,0,40],
["7613037839326","COMPOTA NESTLE MANZANA 120G",20,500,400.0,10,0,30],
["7613037839715","COMPOTA NESTLE DURAZNO 120G",20,500,320.0,10,0,30],
["7613037839746","COMPOTA NESTLE PERA 120G",20,500,400.0,10,0,30],
["7613038006932","Sahne-Nuss avellana 170 g Atelier",29,3490,0,0,0,-1],
["7613038007502","Sahne-Nuss Cramberries y almendras 170 g",29,2950,0,0,0,-1],
["7613038007663","Sahne-Nuss evellanas y almendras 170 g",29,4250,0,0,0,-1],
["7613038464367","EL MANJAR NESTLE SIN LACTOSA 500G",29,4390,0,0,0,-1],
["7613038639161","Manjar Nestle doypac 800",2,5200,3938.0,5,0,31],
["7613038971049","trencito untable 350 grs",29,990,0,0,0,-1],
["7613039024232","Galleta Grill Indian Curry 120 g",29,3990,0,0,0,-1],
["7613039257333","galleta mckay limon 120g",30,990,500.0,8,0,31],
["7613039352151","Nestle Especialidades 251 g",29,990,0,0,0,-1],
["7613039487105","trencito en polvo 350g",29,3200,0,0,0,-1],
["7613039496275","Maravilla Mckay 120 g",13,990,687.0,6,0,31],
["7613039565827","cereal triton caja 360g",38,3200,2410.0,4,0,31],
["7613039566220","galleta morocha 95 gramos",29,300,0,0,0,-1],
["7613039580097","moose prestigio nestle 80 g",29,2200,0,0,0,-1],
["7613039589069","Galleta mini Triton limon 40 g",29,5490,0,0,0,-1],
["7613039604007","leche condensada doypack nestle 320 g",2,2200,1247.0,1,0,31],
["7613039961902","Nidi Buen dia nestle 700 g",29,690,0,0,0,-1],
["761318028321","Cepillo Revlon",29,2000,0,0,0,-1],
["7613287084286","Chamito + chocapic 1+1 Nestlé 142g",29,1390,0,0,0,-1],
["7613287103529","chocolate sahne-nuss 90g",13,2600,1710.0,6,0,31],
["7613287158734","criollita chocolate",29,4200,0,0,0,-1],
["7613287171696","Helado Kit Kat Savory nestle",19,2100,1599.0,16,0,40],
["7613287193650","Corn Flakes nestle 480g",2,4600,3511.0,3,0,31],
["7613287193681","Cereal Fitness 230 g",29,1300,0,0,0,-1],
["7613287193803","cereal chocapic caja 230g",29,1400,0,0,0,-1],
["7613287193834","Trix Nestle 220",29,200,0,0,0,-1],
["7613287193896","cereal milo caja 230g",29,200,0,0,0,-1],
["7613287221841","caldo sabor carne maggi en polvo 7g",29,4400,0,0,0,-1],
["7613287221889","caldo en polvo sabor verduras 7g",29,550,0,0,0,-1],
["7613287222497","Bombones Trencito 142 g",29,550,0,0,0,-1],
["7613287423764","GOODNES SABOR NATURAL ENDULSADO",29,550,0,0,0,-1],
["7613287424037","yogurt goodnes nestle 140 g",29,750,0,0,0,-1],
["7613287424068","yogurt goodness nestle sabor natural",20,600,500.0,6,0,-1],
["7613287426635","sahne nuss  mousse 100g Nestlé",20,800,518.0,10,0,30],
["7613287493026","triton doble crema 147g",29,3600,0,0,0,-1],
["7613287506399","Milo protein up 330 ml Nestlé",20,1600,1212.0,6,0,30],
["7613287521507","cereal chocapic",2,4400,3320.0,3,0,31],
["7613287527042","crema de lentejas maggi 63 g",29,2400,0,0,0,-1],
["7613287527080","crema de zapallo maggi 54 g",29,2700,0,0,0,-1],
["7613287558947","manjar nestlé 400g doypack",2,2900,2234.0,6,0,30],
["7613287581020","NESCAFE DECAF 50 GR",29,3800,0,0,0,-1],
["7613287593283","cereal milo",38,4490,3402.0,20,0,31],
["7613287593436","Trix Nestlé 300g",2,4190,3103.0,3,0,31],
["7613287593481","Chocapic Nestlé 330g",30,3490,2950.0,0,0,31],
["7613287610843","caldo sabor carne en polvo maggi 7g",29,990,0,0,0,-1],
["7613287755810","chokita nestle 30 grs",29,450,200.0,10,0,-1],
["7613287778109","galleta mckay agua 180 gramos",30,1300,718.0,4,0,31],
["7613287784247","Cereal Gold 570g Nestlé",29,550,0,0,0,-1],
["7613287825346","Pasta 3 min Maggi pollo",29,1800,0,0,0,-1],
["7613287825391","Pasta 3 Min Maggi 59.2",29,2700,0,0,0,-1],
["7613287832153","chokita nestle balls 120g",30,1800,1110.0,4,0,31],
["76145513","toblerone 50g",29,2500,0,0,0,-1],
["7622201400712","PAQUETE X6 OREO 216G",29,2000,0,0,0,-1],
["7622201429447","queso philadelphia untable 150 g",20,3200,2390.0,6,0,-1],
["7622201688370","chocolate milka oreo 100g",8,2990,2200.0,12,0,51],
["7622201688400","Chocolate Milka extra cacao 100g",29,900,0,0,0,-1],
["7622201693091","Galleta Oreo original 108g",13,1000,571.0,7,0,8],
["7622201693114","galleta oreo cookies and cream 108g",17,990,571.0,10,0,8],
["7622201693138","Galleta Oreo vainilla 108g",13,990,571.0,5,0,8],
["7622201693152","Galleta Oreo chocolate 108g",13,990,571.0,7,0,8],
["7622201717629","Club Social  x9  216 g",17,1900,1310.0,5,0,8],
["7622201720247","Galleta Club Social x3 216 g",17,2100,1700.0,10,0,-1],
["7622201776459","Halls sabor Limon y Miel 25g",29,1500,0,0,0,-1],
["7622201797560","Queso Filadelfia original 180 g",20,3600,2730.0,8,0,43],
["7622201812676","Mantecol marcolado 111g",29,2300,1700.0,6,0,-1],
["7622201817213","Galleta Oreo original 154g",29,400,0,0,0,-1],
["7622202015212","halls menta extra fuerte 25g",29,400,0,0,0,-1],
["7622210427045","halss mentol,cereza",29,400,0,0,0,-1],
["7622210427076","halss mentol y eucaliptus 25g",29,400,0,0,0,-1],
["7622210427106","DULCE MENTA HALLS25G",29,2000,0,0,0,-1],
["7622210427137","halls mora zul",29,2000,0,0,0,-1],
["7622210662033","NULL",29,1900,0,0,0,-1],
["7622300033781","chocolate choco mousse milka 100g",29,1990,0,0,0,-1],
["7622300086404","chocolate caramelo milka 100g",29,1390,0,0,0,-1],
["7622300758936","club social sabor mantequilla 234g",29,1200,0,0,0,-1],
["765439876489","Mamadero Top Kid",29,2500,1990.0,0,0,-1],
["765439876496","Mamadera Top Kid",29,1990,0,0,0,-1],
["7701311305718","marshmello originam millows",29,2200,0,0,0,-1],
["7702006301572","sedal acondicionador",29,1300,0,0,0,-1],
["7702006404013","sedal shampoo",29,600,0,0,0,-1],
["7702010130243","cepillo colgate fresh x2 cerda suave",29,2400,0,0,0,-1],
["7702011014344","Galletas Moments colombina 280 g",29,1600,0,0,0,-1],
["7702011022707","Gomela 90 g sandia Colombina",29,600,0,0,0,-1],
["7702011086822","Huevos de choclate doypack Colombina 32u",29,400,0,0,0,-1],
["7702011087126","Huevos de choclate bandeja Colombina 18u",29,150,0,0,0,-1],
["7702011087553","Gomela 84 g azul marino",29,600,0,0,0,-1],
["7702011089304","Malvaviscos mini millows 20g",29,1300,0,0,0,-1],
["7702011104984","Splot x 5 Colombina",29,1200,0,0,0,-1],
["7702011126818","Gomela 72 g acidas Colombina",29,1200,0,0,0,-1],
["7702011201881","Galletas Moments Colombina 250g",29,1200,0,0,0,-1],
["7702011305633","Marshmallows Figuritas  145 g",29,1400,0,0,0,-1],
["7702011305718","Millows",30,1200,800.0,15,0,1],
["7702018072439","Afeitadora femenina Venua",4,1400,900.0,12,0,25],
["7702018880409","maquina de afeitar gillette max 3",4,1400,860.0,247,0,25],
["7702024614906","Leche Conensada stick 25 g",29,1300,0,0,0,-1],
["7702026147198","tampones nosotras super plus 8",4,3690,2090.0,23,0,24],
["7702026173494","toalla natural normal alas t/s",29,900,0,0,0,-1],
["7702026173746","tampones nosotras super 3 uni",29,1690,0,0,0,-1],
["7702026180287","Nosotras nocturna 8 un",29,1400,0,0,0,-1],
["7702026180959","Nosotras regular sin alas 10 un",29,2100,0,0,0,-1],
["7702035468154","crems humectante con proteccion solar lubriderm 120 ml",29,400,0,0,0,-1],
["7702084127330","Harina Pan  500 g",29,350,0,0,0,-1],
["7702084137520","Harina Pan  1 k",2,2000,1190.0,19,0,24],
["7702133815782","halls yerbabuena",29,450,300.0,10,0,-1],
["7702137007114","clorox ropa quitamanchas 30g",29,2940,0,0,0,-1],
["7702137007121","clorox ropa quitamanchas colores 30g",29,1300,0,0,0,-1],
["7702174076333","Loop Halloween 60 un",29,1690,0,0,0,-1],
["7702174083669","Gusanitos acidos 90 g Ambrosoli",13,1300,700.0,5,0,6],
["7702367012889","ATUN VAN CAMPS LOMITOS EN ACEITE 142G",2,1890,958.0,1,0,29],
["7702367293356","ATUN VAN CAMPS LOMITOS EN AGUA 142G",29,1790,1200.0,10,0,-1],
["7702626204208","Vanish",31,600,339.0,8,0,24],
["7702626204642","Vanish blanco",31,600,339.0,4,0,24],
["7707237414046","harina pan",29,2500,0,0,0,-1],
["7730117006673","Turrón de maní Il Genovese sabor chocolate  90g",29,550,0,0,0,-1],
["7730117006697","Turrón de maní Il Genovese 90g",29,550,0,0,0,-1],
["77317186","La Gotita 2ml",15,2900,1470.0,22,0,24],
["7750243064972","spaghetti del 5 nutregal 400g",2,700,400.0,12,0,29],
["7750243064996","Fideos Corbata Nutregal 400G",2,700,580.0,12,0,29],
["7750243073110","SPAGUETTI DON VITORIO",29,990,0,0,0,-1],
["7750727010143","Gansito coco wafer 23 g marinela",30,400,220.0,12,0,19],
["7751851006248","Silicona spray para auto 360ml Sapolio",29,1900,0,0,0,-1],
["7751851028684","pasta para zapato negra sapolio",29,1990,0,0,0,-1],
["7751851559324","antigrasa sapolio",29,1200,0,0,0,-1],
["7752087774932","leche evaporada ideal",29,990,0,0,0,-1],
["7754111019484","lapiz de cera",32,1900,1290.0,6,0,24],
["7754487000925","Salsa Soja AJI-No-Silao 280 g",2,1300,900.0,12,0,8],
["7755019000277","sal de mar parrillera oceanica",29,4490,0,0,0,-1],
["7772109120417","elasticois negros",29,1450,0,0,0,-1],
["7790070507389","Yerba Mate Cruz 500 g",29,1200,0,0,0,-1],
["7790070509062","Yerba mate Cruz 500 g",29,1990,0,0,0,-1],
["7790250096061","Ladysoft tela ultraseca con alas 8 und",31,1300,822.0,34,0,24],
["7790250096085","Lady Sorf Normal 8 un",29,1300,890.0,16,0,-1],
["7790250096122","toallas femeninas ultradelgada ladysoft 16 uni",29,2200,1490.0,12,0,-1],
["7790250096139","Ladysoft ultradelgada t.suave 16 un",29,1890,0,0,0,-1],
["7790272006550","aceite vegetal parral 900ml",29,1890,0,0,0,-1],
["7790272007144","Aceite Vegetal Los Silos 900 ml",2,1990,1120.0,24,0,24],
["7790272008158","Aceite Don Giuseppe 900ml",29,1890,0,0,0,-1],
["7790272008554","Aceite vegetal Parral 750 ml",29,1100,0,0,0,-1],
["7790272008721","Aceite sorento 500 ml",29,750,0,0,0,-1],
["7790272008851","Aceite Smartprice 900 ml",29,1800,0,0,0,-1],
["7790310984901","mani tipo japones evercrisp 135g",29,2600,0,0,0,-1],
["7790380270010","MANTECOL CLASICO 41G",30,900,650.0,12,0,8],
["7790380270027","Mantecol 111g",13,1800,1320.0,6,0,8],
["7790380270034","mantecol clasico 253g",29,3900,0,0,0,-1],
["7790380824978","Turron Torroni 280 g",29,3300,0,0,0,-1],
["7790387013504","Yerma mate Taragui sin palo 500g",2,3900,2211.0,3,0,24],
["7790387013627","Hierva mate Taragui 500g",2,3990,2262.0,2,0,24],
["7790387110234","hierba mate taragui 500g",29,3500,2900.0,6,0,-1],
["7790387110319","Yerba mate Taragui 250 g",29,1800,1000.0,10,0,-1],
["7790411001507","yerba rosamonte",29,1990,0,0,0,-1],
["7790520004369","raid liquido electrico",4,5990,4390.0,6,0,39],
["7790520012517","limpiador en crema mr musculo 450 cc",29,4690,0,0,0,-1],
["7790520012524","mr musculo crema 450cm3",29,2590,0,0,0,-1],
["7790520014177","LISOFORM",29,3990,0,0,0,-1],
["7790520014313","Desinfectante de ambientes y superficies Lysoform 420ml",29,3990,0,0,0,-1],
["7790520023971","Pato pastilla",29,3300,0,0,0,-1],
["7790520028655","Raid Moscas y ZAn",29,2690,0,0,0,-1],
["7790520028662","Raid sin olor",29,3500,0,0,0,-1],
["7790520990648","lysoform",29,1490,0,0,0,-1],
["7790520991539","baygon",29,3990,0,0,0,-1],
["7790520995377","tabletas de raid por caja 12 und (300 uni)",31,3800,2200.0,3,0,39],
["7790520996633","Glade Lilav v 360 cc",29,1490,0,0,0,-1],
["7790520997630","Raid moscas, zancudos y mosquitos 222 g",29,1490,0,0,0,-1],
["7790520998125","Lisoform 420 g",29,1490,0,0,0,-1],
["7790520998187","Glade Encato vainilla 360 g",29,3290,0,0,0,-1],
["7790520998255","Glade Potpurri 360cc",29,1500,0,0,0,-1],
["7790520998279","Glade Limon 360g",29,1200,0,0,0,-1],
["7790520999429","Baygon 300 cc",29,1500,0,0,0,-1],
["7790580422776","Turrón de maní Arcor",13,1500,1000.0,5,0,1],
["7791130008730","Limpiador Lysol lavanda 900 ml",29,4790,0,0,0,-1],
["7791274005305","quita esmalte",29,6590,0,0,0,-1],
["7791274198489","Set Valija Hello Kitty",29,1900,0,0,0,-1],
["7791274200144","pack baby algabo",29,1690,0,0,0,-1],
["7791290007000","Omo líquido ultra concentrado 3L",29,2200,0,0,0,-1],
["7791290789876","Cif antigrasa",31,1900,1290.0,3,0,24],
["7791290790513","cif crema multiuso 750",29,1900,0,0,0,-1],
["7791290794221","cif  crema",29,2000,1490.0,10,0,-1],
["7791290794245","cif crema limon",29,2200,0,0,0,-1],
["7791290794443","cif limpia vidrio",31,1900,1300.0,4,0,24],
["7791293012063","desodorante dove m,en care 150 ml",29,1900,0,0,0,-1],
["7791293025889","desodorante axe dark temptation",29,1990,0,0,0,-1],
["7791293030777","Shampoo Sedal Ceramidas 340 ml",29,1900,0,0,0,-1],
["7791293030845","shampoo sedal liso perfecto 340 ml",29,2200,0,0,0,-1],
["7791293030876","Shampoo Sedal restauracion 340 ml",29,2600,0,0,0,-1],
["7791293031019","aconcidionador sedal restauracion instantanea 340 ml",29,2600,0,0,0,-1],
["7791293031026","sedal secado rapido",29,2200,0,0,0,-1],
["7791293040011","dove 150ml",29,3590,0,0,0,-1],
["7791293040028","dove 150ml",29,2200,0,0,0,-1],
["7791293040950","Talco Rexona Efficient 100 g",29,2490,0,0,0,-1],
["7791293040967","talco para pies rexona",29,2790,0,0,0,-1],
["7791293041087","desodorante axe marine",29,2200,0,0,0,-1],
["7791293041148","deshodorante edicion limitada freestyle",29,2200,0,0,0,-1],
["7791293041773","rexona  dama",29,2990,0,0,0,-1],
["7791293042718","Axe Dark tentation",29,2990,2400.0,10,0,-1],
["7791293043739","axe antitranspirante",29,2200,0,0,0,-1],
["7791293043791","Desodorante Axe marine fresh ocean & lima 150ml",29,2490,1990.0,12,0,-1],
["7791293043807","Desodorante Axe Musk canela & ambar 150ml",29,2200,0,0,0,-1],
["7791293043814","desodorante apollo",29,2200,0,0,0,-1],
["7791293043821","Axe Black remixed",29,2990,2400.0,10,0,-1],
["7791293045764","sedal restauracion",29,2500,1856.0,0,0,-1],
["7791293045771","sedal shampoo",29,2500,1856.0,0,0,-1],
["7791293045979","sedal acondicionador",29,1990,0,0,0,-1],
["7791293046372","sedal shampoo",29,2500,1856.0,0,0,-1],
["7791293046402","sedal colageno",29,1990,0,0,0,-1],
["7791293046433","sedal acondicionador",29,1990,0,0,0,-1],
["7791293046464","sedal colageno",29,2600,0,0,0,-1],
["7791293047881","sedal shampoo",29,2600,0,0,0,-1],
["7791293047980","sedal acondicionador",29,2600,0,0,0,-1],
["7791293048000","dove mencare proteccion total",4,2500,2000.0,12,0,39],
["7791293048017","dove frech",4,2500,2000.0,12,0,39],
["7791293048024","DOVE SPORT FRECH",29,3300,0,0,0,-1],
["7791293048031","dove invisible",4,2500,2000.0,12,0,39],
["7791293048468","dove original 150ml",4,2600,1690.0,12,0,39],
["7791293048499","dove go fresh",29,450,0,0,0,-1],
["7791293048505","dove spray go frech",29,450,0,0,0,-1],
["7791293048529","dove invisible",29,2600,0,0,0,-1],
["77922649","Alfajor Game",30,450,200.0,12,0,18],
["77922748","alfajor game",29,2100,0,0,0,-1],
["7792710006450","Yerba mate compuesta 500 g",29,1500,0,0,0,-1],
["7792808002609","ARROZ 1K DOS CHINOS",29,1200,0,0,0,-1],
["7792960000147","Limpiador desinfectante lavanda Peoett 900ml",37,2100,1500.0,10,0,24],
["7793008001928","polvo decolorante",29,1490,0,0,0,-1],
["7793100111891","colgate ulra blanco",29,1490,0,0,0,-1],
["7793100151224","Cepillo de dientes infantil Colgate",29,1590,0,0,0,-1],
["7793253003470","Poet suavidad 900 cc",31,1690,1290.0,6,0,39],
["7793253003944","Poet Espirit 900",31,1690,1290.0,6,0,39],
["7793253025601","poet primavera",29,3500,0,0,0,-1],
["7793253027056","Poett Primavera 1.8 L",29,2000,0,0,0,-1],
["7793306993413","Zucaritas Kelloggs 300 g",29,2100,0,0,0,-1],
["7793395000153","MATE ARGENTINO PRO BELL 500G",29,1500,0,0,0,-1],
["7793890252095","Queque Ideal 200 g",29,1500,0,0,0,-1],
["7793890252101","Queque marmolado Ideal 200 gr",29,350,0,0,0,-1],
["7793890252132","Magdalenas Marmoladas Ideal 225 g",29,1800,0,0,0,-1],
["7793890252156","Magdalenas vainilla Ideal 225 g",29,1790,0,0,0,-1],
["77940131","Turrón galleta fruna",30,350,200.0,20,0,1],
["7794612413831","bigtime ultra doble capa 24g",29,1400,0,0,0,-1],
["7794870000569","aceite vegetal toddo",2,1890,1014.0,20,0,24],
["7794870056009","aceite vegetal smartprince 900ml",2,1790,1290.0,6,0,24],
["7796699000010","AZUCAR CALIDAD 1 KG",29,1300,0,0,0,-1],
["7797453000796","Pedigree 100g",29,4600,0,0,0,-1],
["77975737","turron galleta arcor chocolatada 25 gm",29,2600,0,0,0,-1],
["7797906000700","Papas Pre-fritas McCain 400 g",29,2600,0,0,0,-1],
["7797906001691","papas fritas 2.5k",29,3500,0,0,0,-1],
["7798008962385","Crema colorante capilar Cielo Color azul",29,650,0,0,0,-1],
["7798008964129","Crema colorante capilar turquesa Cielo Color 50g",29,1990,0,0,0,-1],
["7798094225647","Mini Torta",29,2500,0,0,0,-1],
["7799031000174","chupete fisher price",29,2490,0,0,0,-1],
["7800000001143","Escobillón",29,2490,0,0,0,-1],
["7800004000302","Enjuague bucal menta fuerte con alcohol Oral Fresh 250ml",29,3990,0,0,0,-1],
["7800004000326","Enjuague bucal menta fresca con alcohol Oral Fresh 250ml",29,7900,0,0,0,-1],
["7800004000722","Enjuagatorio bucal sin alcohol con fluor Kids OralFresh 250ml",29,7900,0,0,0,-1],
["7800004001255","Dolorub parche poroso 12x17 cm",29,2300,0,0,0,-1],
["7800004003754","lubricante intimo yes! cherry 30 ml",29,5300,0,0,0,-1],
["7800004003785","lubricante yes chocolate menta 30 ml",29,2990,0,0,0,-1],
["7800004004805","povin",29,2990,0,0,0,-1],
["7800004508594","dolorub",29,4990,0,0,0,-1],
["7800007771193","Hiedrix Hedera 100ml jarabe",29,3000,0,0,0,-1],
["7800007804877","Red off nafazolina",29,200,0,0,0,-1],
["7800018117362","HIPOGLOS 20G",29,1500,0,0,0,-1],
["7800044001543","Vitamina C a 300 la tira",29,500,0,0,0,-1],
["7800063110493","acido merfenamico 500mg",29,200,0,0,0,-1],
["7800120162977","avena instantanea selecta 400g",29,2200,0,0,0,-1],
["7800120164100","Check 3 cereales Vivo",29,1300,0,0,0,-1],
["7800120164162","Cereal Snack Mono 180 g",29,2800,0,0,0,-1],
["7800120166777","cereal mono choc 260g",29,1650,0,0,0,-1],
["7800120169952","avena vivo 500g",29,500,0,0,0,-1],
["7800120170170","Avena Vivo 700 g",2,2800,2084.0,4,0,29],
["7800120170248","Avena Vivo 400 g",2,2000,1400.0,6,0,6],
["7800120171061","vivo check cacao 30g",29,990,0,0,0,-1],
["7800120171085","Good Chocolate Vivo 18 g",29,1500,0,0,0,-1],
["7800120716644","Arroz Miraflores 500 g",29,3990,0,0,0,-1],
["7800120719010","Arroz miraflores Pre-gra 500 g",29,300,0,0,0,-1],
["7800159052287","salsa barbecue Kraft",29,200,0,0,0,-1],
["7800159081072","mayo deli kraft 650g",2,2600,1900.0,6,0,28],
["7800201012788","madel maracuya crema 68g",29,400,0,0,0,-1],
["7800201012917","madel canela 70g",29,3300,0,0,0,-1],
["78007505","bigtime sandia",29,1800,0,0,0,-1],
["78007673","Pall mall azul 20",29,2300,0,0,0,-1],
["7801000001331","Agua oxigenada 110  ml",29,1000,600.0,50,0,-1],
["7801000102557","Vaselina liquida 125 ml",29,5600,0,0,0,-1],
["7801000277750","povidona",29,2590,0,0,0,-1],
["78011748","bigtime agua",29,2990,0,0,0,-1],
["7801220000749","arvejas minuto verde 1 k",29,2590,2000.0,10,0,-1],
["7801220000756","choclo en grano minuto verde 1 kilo",12,2700,1695.0,6,0,24],
["7801220000763","Ensalada lista Minuto verde1k",12,2700,1990.0,2,0,24],
["7801220000848","Pasta de choclo Minuto verde 1k",29,4200,3000.0,6,0,-1],
["7801220000923","Choclo trozo congelado 1k",12,4400,2800.0,12,0,42],
["7801220000978","poroto granado congelado 1kilo",29,4800,3700.0,6,0,24],
["7801220000985","Mix porotos granados 1k Minuto verde",12,4200,3100.0,5,0,24],
["7801220001081","Habas Minuto Verde 1 Kg",12,2990,2190.0,10,0,24],
["7801220001098","Pasta de choclo Minuto Verde 1kg",12,3900,2850.0,5,0,24],
["7801220001104","poroto verde 1k",29,5300,0,0,0,-1],
["7801220001555","pulpa frambuesa MV 1K",12,7990,5500.0,5,0,24],
["7801220001579","pulpa de frutilla 1kilo minuto verde",12,4990,2990.0,4,0,24],
["7801220001739","durazno en trozos 1 kilo minuto verde",29,3690,0,0,0,-1],
["7801220001777","Frutillas Enteras Minuto 1 k",29,1800,0,0,0,-1],
["7801220002262","Pulpa Maracuya MV 1 k",12,7990,5500.0,4,0,24],
["7801220002286","Pastelera Minuto verde 1k",29,1800,0,0,0,-1],
["7801220002439","espinaca a la crema minuto verde 400 g",29,1800,0,0,0,-1],
["7801220002866","habas minuto verde 200 gr",12,750,425.0,0,0,35],
["7801220003689","zapallo en cubos minuto verde 500 g",12,1690,1108.0,10,0,42],
["7801220003948","Papas prefritas Minuto Verde 2,5k",29,2690,0,0,0,-1],
["7801220004037","sofrito con ajo minuto verde 150 g",12,800,510.0,20,0,35],
["7801220004044","Sofrito MV 500 g",29,2690,0,0,0,-1],
["7801220004426","Smoothie Green life Minuto verde 125g",29,2690,0,0,0,-1],
["7801220004433","smoothie pink punch MV",29,900,0,0,0,-1],
["7801220004440","Smoothie Red antiox Minuto Verde 125g",29,2300,0,0,0,-1],
["7801220004457","Smoothie yellow passion Minuto verde 125g",29,4490,0,0,0,-1],
["7801220004563","mix pimenton minuto verde 150 g",12,800,510.0,20,0,35],
["7801220004891","minuto wok",29,700,0,0,0,-1],
["7801220005188","PIZA MOZZARELA",29,1990,0,0,0,-1],
["7801220221113","poroto verde minuto verde 150 g",12,800,506.0,20,0,35],
["7801220311111","arvejas minuto verde 200 g",12,800,506.0,20,0,35],
["7801220431109","Choclo Grano MV 500 g",29,1990,1300.0,10,0,-1],
["7801220431116","choclo en grano minuto verde 200 g",12,800,506.0,0,0,35],
["7801220701011","Habas 500g minuto verde",12,1990,1429.0,10,0,42],
["7801220801209","Primavera de verduras Minuto verde 200g",12,800,506.0,7,0,35],
["7801220801292","porotos graneados minuto verde 500g",29,2490,0,0,0,-1],
["7801220901176","Papas Duquesa M.V. 500 g",29,2300,0,0,0,-1],
["7801220901190","papas Prefritas minuto verde 500 g",29,1690,0,0,0,-1],
["7801222811626","Habas Interagro 1 k",29,1690,0,0,0,-1],
["7801233000040","jurel chileno unica 425g",29,2200,0,0,0,-1],
["7801235001878","atun lomito san jose 160g",10,1590,958.0,2,0,32],
["7801235001885","Atun S Jose lomitos 160 g",10,1590,958.0,12,0,32],
["7801235131117","Jurel San Jose 300 gr",10,2300,1800.0,10,0,32],
["7801235276115","Choritos al natural San José 100g",29,1490,0,0,0,-1],
["7801235277112","Choritos en aceite San José 100g",29,1490,0,0,0,-1],
["7801235552417","Sardinas en aceite San José 125g",29,1700,0,0,0,-1],
["7801250000306","choritos en aceite angelmo 190g",29,3100,0,0,0,-1],
["7801250000320","Croritos al agua Angelmo 190 g",2,1490,844.0,3,0,24],
["7801250000801","Surtido de mariscos Angelmo agua 100 g",2,1700,963.0,3,0,24],
["7801250000818","Surtido de mariscos Angelmo 213 g agua",29,2200,0,0,0,-1],
["7801250501049","choritos en aceite angelmo 425g",29,2990,0,0,0,-1],
["7801250501056","Choritos en agua Angelmo 425 g",29,1700,0,0,0,-1],
["7801256001079","frutillas al jugo centauro 570 g",29,3100,0,0,0,-1],
["7801262000134","Cerezas Marrasquino roja 240 g",29,1490,0,0,0,-1],
["7801268000367","Srtido de marscos Angelmo aceite 190 g",29,1650,0,0,0,-1],
["7801268000374","Surtido de mariscos Angelmo 425 g en aceite",29,1790,0,0,0,-1],
["7801268001357","Atun Angelmo al agua 170 g",29,1790,0,0,0,-1],
["7801268001364","atun lomitos angelmo 170g",29,2200,0,0,0,-1],
["7801268002033","Atun Angelmo en aceite",29,2200,0,0,0,-1],
["7801268002040","Atun Angelmo en agua",2,1790,995.0,4,0,24],
["7801268002163","Palmitos Enteros Angelmo 400 g",29,1990,0,0,0,-1],
["7801268002170","palmitos angelmo",29,2700,0,0,0,-1],
["7801268002248","Salmon Trozoz  agua Angelmo 190 g",29,2990,0,0,0,-1],
["7801268002729","Duraznos mitades Angelmo 425 g",29,4300,0,0,0,-1],
["7801300000041","Cloclo 1 Kg Frutos del Maipo",29,1200,0,0,0,-1],
["7801300000065","Pasta de Choclo 1 k",29,2200,0,0,0,-1],
["7801300000072","PAPAS PRE FRITAS FRUTOD DEL MAIPO 500G",29,5900,0,0,0,-1],
["7801300000539","CHOCLO TROZO FRUTOS DEL MAIPO 200G",29,1000,0,0,0,-1],
["7801300000706","Chaplsui Frutos del campo 500 g",12,2790,2106.0,5,0,42],
["7801300001857","Pulpa frutilla FdM 1 k",29,600,0,0,0,-1],
["7801300002755","Cebolla cubo Frutos del maipo 150g",12,1000,567.0,20,0,35],
["7801300002915","zapallo cubo",29,800,0,0,0,-1],
["7801300012051","Promavera Frutos del maipo 200 g",29,1900,0,0,0,-1],
["7801300012068","arvejas 200g",29,1000,0,0,0,-1],
["7801300012075","Choclo Frutos del Maipo 200 g",29,1490,0,0,0,-1],
["7801300301049","Choclo F. del Maipo 500 g",29,1500,0,0,0,-1],
["7801305002057","durazno wasil 380g",29,1400,0,0,0,-1],
["7801305003658","arvejas wasil 340g",29,1400,0,0,0,-1],
["7801305004167","Durznos cubitos Wasil 500 g",2,1800,1310.0,12,0,12],
["7801315000135","porotos blancos",10,1400,1000.0,0,0,29],
["7801315000173","Porotos Negros 400 g Esmeralda",2,1500,793.0,1,0,29],
["7801315161126","tè excelsior tipo ceylan 125 g",2,1300,990.0,6,0,29],
["7801323000127","Merluza Filete El Golfo SJ",29,2000,0,0,0,-1],
["7801335000115","Choclo Cazuela M.V. 4 Un",12,990,561.0,20,0,35],
["7801335013429","Choclo Grano La cabana 500 g",29,2490,0,0,0,-1],
["780138000418","Durazno en mitades Dos Caballos 570 g",29,350,0,0,0,-1],
["7801420000617","aceite de oliva natural banquete",29,2400,0,0,0,-1],
["7801420001850","Arroz Tucapel blue bonnet G2",2,1500,950.0,20,0,62],
["7801420001898","Galletas arroz Tucapel 25 g",29,2200,0,0,0,-1],
["7801420001935","Arroz Tucapel 900 g",2,2000,1450.0,20,0,62],
["7801420210139","ARROZ TUCAPEL  1K GRADO 2",29,2300,0,0,0,-1],
["7801420220138","Arroz Tucapel G2 1 k",2,2200,1630.0,12,0,24],
["7801420220145","Arroz Tucapel 500 g",29,2790,0,0,0,-1],
["7801420250142","Arroz Tucapel G1 1K",29,1500,0,0,0,-1],
["7801505000143","Chancaca IANSA 225 g",2,1300,800.0,20,0,21],
["7801505000235","Sucralosa Iansa cero k 250 ml",2,3490,2980.0,10,0,-1],
["7801505000280","Azucar La Patrona 1 k",29,990,0,0,0,-1],
["7801505000419","Stevia + sucralosa Iansa cero k 250 ml",29,1700,0,0,0,-1],
["7801505001713","Azúcar Iansa 750g",29,1650,0,0,0,-1],
["7801505002673","Azuca Rubia dama blanca",29,1800,0,0,0,-1],
["7801505231912","Azucar Ianza 1Kg",2,1500,1285.0,12,0,24],
["7801505231974","azucar flor iansa 500g",29,1600,1000.0,6,0,-1],
["7801534000909","Choclito cóctel Deyco 425g",29,2490,0,0,0,-1],
["7801534003146","Crema de coco Deyco 396 g",2,2900,1644.0,2,0,24],
["7801534003214","mantequilla de mani deyco",29,2600,0,0,0,-1],
["7801534003252","levadura deyco 10g",2,300,170.0,5,0,24],
["7801534003269","levadura seca instantanea 125g",2,1300,850.0,12,0,24],
["7801534003290","palmitos en mitades",29,3490,0,0,0,-1],
["7801552000141","Casata Panda trisabor 2.5 lt",19,6300,4800.0,5,0,42],
["7801552000189","Bongelata frutilla vainilla 1L",19,4300,3700.0,12,0,-1],
["7801552000196","Bongelata Trendy 1 Lt",19,3590,0,0,0,42],
["7801552000356","Casata Panda trisabor 2.5 lts",19,6300,4800.0,12,0,42],
["7801552000684","bongelata",29,5500,0,0,0,-1],
["7801552000691","Casata trendy tiramisu 2.5lts",19,6300,3850.0,8,0,42],
["7801552000783","Casata 3 sabores Trndy 2.5 Lt",29,6300,4800.0,10,0,-1],
["7801552001285","CASATA TRENDY 2.5L CHOCOLAT SUIZO Y FRUTOS DEL BOSQUE",19,6300,4800.0,6,0,42],
["7801552001292","Casata 3 sabores Trendy 2.5lts",19,6300,4800.0,8,0,42],
["7801552001803","helado mini cono 46g",19,800,577.0,32,0,42],
["7801552001964","Cassata Trendy 1 lt",19,3600,2153.0,3,0,42],
["7801552002299","trozo sandia 53g",19,500,384.0,40,0,-1],
["7801552002435","lenguix frambuesa 63g",19,500,400.0,12,0,42],
["7801552004040","Chocolate Suizo fr bosque trendy 1 Lt.",19,3600,2500.0,6,0,42],
["7801552004095","Tiramisu tres leches chocolate 1 Lt. Trendy",19,3600,2153.0,3,0,42],
["7801552005115","Bongelata Chocolate Trendy 1 l",19,5300,0,0,0,42],
["7801552006389","coneiro sabor chocolate mani 70g",29,5300,0,0,0,-1],
["7801552006440","Caramel  Macchiato 2.5 l",19,5900,4540.0,6,0,42],
["7801552006495","Milca Trendy 1 Lt",19,6800,5222.0,6,0,64],
["7801552006518","Cassatta Oreo Trendy",19,6000,4607.0,8,0,42],
["7801552006525","Milka Trendy Crema-choc",19,2000,1500.0,20,0,42],
["7801552006587","hawai frutal sabor berries 109g",29,850,500.0,20,0,-1],
["7801552006631","Casata Trendy brownie vainilla 2.5 lts",19,6300,4800.0,5,0,42],
["7801552006648","trendi platano vainilla 1l",19,3600,2153.0,3,0,42],
["7801552006662","trozo naranga 49g",29,1350,0,0,0,-1],
["7801552006686","platanoso 54g",29,1100,0,0,0,-1],
["7801552006914","hawai sabor mango y maracuya 109g",29,4400,0,0,0,-1],
["7801552006945","coneiro 3 leches 76g",29,1100,0,0,0,-1],
["7801552006952","trock frutos del bosque 66g",29,5300,0,0,0,-1],
["7801552007126","trendy suspiros cinnamon roll",29,6900,0,0,0,-1],
["7801552007171","helado flagg 170g",19,1200,923.0,12,0,42],
["7801552007300","Cassatta Baileys 1 L Trendy",19,6000,4607.0,8,0,42],
["7801552007317","Versovienne NAranja-choc 450 ml",29,1200,0,0,0,-1],
["7801552007324","Varsovienne Choc-almendra 450 ml",29,500,0,0,0,-1],
["7801552007331","Versovienne Caluga leche 450 ml",29,600,0,0,0,-1],
["7801552007348","trock sandwich 52g",19,700,500.0,0,0,64],
["7801552007362","lenguix uvalicious 63g",29,1900,0,0,0,-1],
["7801552007423","helado bob esponja 88g",29,2200,0,0,0,-1],
["7801552007447","Coneiro Trendy",29,600,0,0,0,-1],
["7801552007522","Helado Oreo paleta 70 g",19,2000,1500.0,20,0,42],
["7801552056018","Barquillo Trendy 180 g",29,1200,0,0,0,-1],
["7801610000335","Coca cola sin azucar mini 250ml",29,1200,0,0,0,-1],
["7801610000540","Coca Cola zero 1.25 L retornable",5,1600,1002.0,50,0,9],
["7801610000571","coca cola botella 591 ml",5,1300,0,1,0,9],
["7801610000601","coca cola zero botella 591 ml",5,1300,0,9,0,9],
["7801610001165","Coca Cola 1.25 LT Retornable",5,1400,1002.0,50,0,9],
["7801610001196","coca cola lata 350 ml",5,1100,700.0,12,0,9],
["7801610001523","Coca Cola 2.5 L desechable",29,1100,0,0,0,-1],
["7801610001622","Coca Cola 1.5 Lt. Desech.",5,2400,1804.0,30,0,9],
["7801610001936","Coca cola original mini 250ml",29,1100,0,0,0,-1],
["7801610002193","fanta lata 350ml",5,1100,623.0,6,0,9],
["7801610002933","Fanta mini 250ml",29,2900,0,0,0,-1],
["7801610005194","sprite lata 350 ml",5,1100,0,0,0,9],
["7801610005286","Sprite 2 Lt. Retornable",5,1800,2008.0,12,0,9],
["7801610005521","Sprite 2.5 Lt Desechable",5,2900,2250.0,10,0,9],
["7801610005651","SPRITE 3L DESECHABLE",5,3200,2700.0,100,0,9],
["7801610005934","Sprite mini 250ml",29,1500,0,0,0,-1],
["7801610019269","Nordic Miost Ginger Ale",29,1500,0,0,0,-1],
["7801610020265","agua tonica nordic mist coca cola 1.5 litros desechable",29,1700,0,0,0,-1],
["7801610125250","FANTA RETORNABLE 1.25",5,1500,1056.0,0,0,9],
["7801610125359","Sprite 1.25 L Retornable",5,1600,1002.0,50,0,9],
["7801610203002","fanta naranja 1.25l",29,1700,0,0,0,-1],
["7801610220016","Coca LAta Orig. 220 ml",29,950,0,0,0,-1],
["7801610222171","Express Fanta original 237ML",5,500,0,0,0,9],
["7801610273500","bebida lata ginger ale nordic mist zero 350 ml",29,2500,0,0,0,-1],
["7801610305560","COCA COLA ZERO 3L DESECHABLE",5,3200,2700.0,100,0,9],
["7801610323236","COCA COLA 3L DESCHABLE",5,3300,2420.0,19,0,9],
["7801610333129","Coca Cola Retornable 3L",5,2700,2007.0,50,0,9],
["7801610333327","Coca Cola Cero 3 Lt retornable",5,2800,2007.0,10,0,9],
["7801610350355","coca cola sin azucar lata 350ml",29,2300,0,0,0,-1],
["7801610350850","coca cola 2.5L. desechable",5,2900,2250.0,7,0,9],
["7801610350904","Coca Cola 1 Lt zero",29,1200,0,0,0,-1],
["7801610381007","Schweppes Ginger Ale 1.5 L.",29,2400,1822.0,12,0,-1],
["7801610382028","schweppes agua tonica 1.5l",5,2400,1833.0,12,0,9],
["7801610461006","Acuarius Manzana 1.6 Lt",29,1200,0,0,0,-1],
["7801610461013","Acuarius Pera  1.6 Lt",29,1000,0,0,0,-1],
["7801610461020","Aquarius Limonada 1.6 Lt.",29,1700,0,0,0,-1],
["7801610461044","Acuarius Uva 1.6 Lt",29,1200,0,0,0,-1],
["7801610473023","Coca cola edicion marvel sin azucar 473ml",5,1000,547.0,6,0,9],
["7801610506004","sprite 1.25l",29,1400,900.0,18,0,-1],
["7801610591116","fanta botella 591ml",5,1300,0,3,0,9],
["7801610591994","Sprite 591 ml",29,500,0,0,0,-1],
["7801610778548","Fanta Frutilla 2 Lt. Retornable",29,2500,0,0,0,-1],
["7801610880104","coca cola botella express 237 ml",5,500,0,0,0,9],
["7801610880159","EXPRESS COCA COLA SIN AZUCAR 237ML",5,500,0,0,0,9],
["7801620001193","Bilz 3 Lt. Desechable CCU",5,2500,2084.0,15,0,5],
["7801620001216","Pap 3 Lt Desechable CCU",5,2500,2084.0,9,0,5],
["7801620001599","Orange Crush 3 Lt. Desechable CCU",29,2500,0,0,0,-1],
["7801620001643","Limon Soda 3 Lt. Desechable CCU",5,2500,1824.0,12,0,5],
["7801620001841","Nectar whatts TuttFrut 1.5L",5,2100,1570.0,12,0,5],
["7801620001896","Canada Dry 3 Lt. Desechable CCU",5,2500,1892.0,12,0,5],
["7801620001957","Pepsi 2.5 Lt. Retornable",5,2000,1508.0,12,0,5],
["7801620001988","Kem Xtreme 1.5 Lt Desechable CCU",5,2200,1790.0,12,0,5],
["7801620002305","Limon Soda 2.5 Retornable CCU",5,1800,1321.0,12,0,5],
["7801620002794","Limon Soda Zero 3 Lt.",29,500,0,0,0,-1],
["7801620002916","Nectar Watts TuttFrut 0 1.5L",5,1900,1414.0,7,0,5],
["7801620003647","te lipton durazno 1.5l",29,500,0,0,0,-1],
["7801620003845","EXPRESS PEPSI ORIGINAL 237ML",5,500,183.0,10,0,5],
["7801620003852","Express Kem 237ML",5,500,183.0,10,0,5],
["7801620003869","EXPRESS BILS 237ML",5,500,183.0,10,0,5],
["7801620003876","EXPRESS PAP 237ML",29,1300,0,0,0,-1],
["7801620004217","Pepsi light lata 310 ml",29,1300,0,0,0,-1],
["7801620004439","BEBIDA BILS RETORNABLE 1.25L",29,1300,0,0,0,-1],
["7801620004446","bebida pap ccu 1.25 retornable",29,850,0,0,0,-1],
["7801620004453","BEBIDA RETORNABLE KEM 1.25L",29,1300,0,0,0,-1],
["7801620004712","bebida limon soda ccu 1.25 retornable",29,2500,0,0,0,-1],
["7801620004859","agua mas pera 5200 ml",29,1700,1200.0,6,0,-1],
["7801620005047","Frugo Pineapple Drink 2 Lt",29,1300,0,0,0,-1],
["7801620005085","Bilz Zero 3 Lt. CCU",5,2500,1892.0,8,0,5],
["7801620005160","gatorade cool blue 1L",5,1900,1356.0,15,0,5],
["7801620005177","gatorade naranja 1L",5,1900,1356.0,15,0,5],
["7801620005191","Gatorade cool blue 75 ml",5,1400,945.0,15,0,5],
["7801620005801","Frugo Strawberry Drink 2 L",29,2200,0,0,0,-1],
["7801620005887","cachantun con gas 2.5 litros",5,1600,1200.0,24,0,5],
["7801620005894","cachantun natural sin gas 2.5 l",5,1600,1098.0,18,0,5],
["7801620006044","agua pura vida",5,2300,1500.0,12,0,-1],
["780162000631","Cachantun Mas granada 1600 ml",5,1700,1098.0,18,0,5],
["7801620006501","bilz zero 2.0L CCU",29,1500,0,0,0,-1],
["7801620006518","pap zero 2.0L CCU",29,1600,0,0,0,-1],
["7801620006600","Cachantun mas Citrus 1.6 l",5,1700,1290.0,6,0,5],
["7801620006624","AGUA + SABOR MANZANA SIN GAS 1600ML",5,1600,1100.0,12,0,5],
["7801620006631","Cachantun mas granada 1.6 l",5,1750,1290.0,6,0,5],
["7801620006648","agua mas de uva 1.600ml",5,1700,1290.0,6,0,5],
["7801620006655","Cachantun Mas pera 1.6 ml",5,1750,1098.0,12,0,5],
["7801620006846","pepsi cero lata",5,1100,723.0,18,0,5],
["7801620006877","Pepsi Zero 2.0 LT",5,2000,1270.0,10,0,5],
["7801620006891","Pepsi Cero 3 LT Desechable",5,2500,2084.0,8,0,5],
["7801620007867","pepsi retornable 1.25L sabor original",29,2000,0,0,0,-1],
["7801620007898","agua pura vida nestle con gas 3.0 litros",29,2300,0,0,0,-1],
["7801620007928","bebida pepsi retornable 1.25L sabor 0% azucar",29,1500,0,0,0,-1],
["7801620007980","Limon Soda Zero 2.0 L",29,1600,0,0,0,-1],
["7801620008123","kem zero 2.0L CCU",29,1600,0,0,0,-1],
["7801620008314","agua mas limonada genjibre sin gas 1.6 lit",29,1700,1200.0,6,0,-1],
["7801620008727","agua woman balance 1.600ml",5,1600,989.0,6,0,5],
["7801620008734","agua woman aloe vera y colageno 1.600ml",5,1600,1205.0,12,0,5],
["7801620008819","Crush zero lata 310 ml",29,950,0,0,0,-1],
["7801620008826","Limon soda lata 310 ml",29,950,0,0,0,-1],
["7801620008840","Canada Dry Ginger Alr lata 310 ml",29,950,0,0,0,-1],
["7801620009052","Bilz lata 310 ml",29,1200,0,0,0,-1],
["7801620009069","Pap lata 310 ml",29,1200,0,0,0,-1],
["7801620009311","Cachantun Mas Aloe 1.6 ml",29,1300,0,0,0,-1],
["7801620009342","PEPSI 0% AZUCAR 600ML",29,1400,0,0,0,-1],
["7801620009373","PEPSI SABOR ORIGINAL 600ML",29,1000,0,0,0,-1],
["7801620009380","pap 600 ml",29,1000,0,0,0,-1],
["7801620009434","kem xtreme 600ml",5,1400,873.0,10,0,5],
["7801620009595","Cachantun mas granada 600 ml",5,1200,790.0,12,0,5],
["7801620009656","Cachantun mas citrus 600 ml",29,1400,0,0,0,-1],
["7801620009700","Cachantun verde 600 ml",5,700,400.0,12,0,5],
["7801620009717","cachatun sin gas",5,800,582.0,12,0,5],
["7801620009786","Liptom Ice Tea limon",29,2200,0,0,0,-1],
["7801620009793","Lipton Ice Tea Durazno 600 ml",5,1400,984.0,6,0,5],
["7801620009809","Liptom Tea Frambuesa 600 ml",29,1500,0,0,0,-1],
["7801620009830","Lipton Ice Tea Durazno 1.5",5,2200,1500.0,12,0,-1],
["7801620009939","Rockstar Energi Drink Guarana 500 ml",5,1300,873.0,24,0,5],
["7801620010300","Canchantún más mango maracuya",29,1200,0,0,0,-1],
["7801620010324","Gatorade Zere 1 L",5,1700,1141.0,15,0,5],
["7801620010331","Pap Pop Frugele 500 cc",29,1500,0,0,0,-1],
["7801620010348","Pap Pop Frugele 500 cc",29,1800,0,0,0,-1],
["7801620010454","Agua Manantial con gas 3000 ml",5,1500,970.0,1,0,5],
["7801620010461","Agua manantial sin gas 3000 ml",5,1500,970.0,5,0,5],
["7801620011604","Nectar Watts Naranja 1.5L",5,2200,1570.0,12,0,5],
["7801620011611","Nectar Watts Durazno 1.5L",5,2200,1570.0,12,0,5],
["7801620011666","Nectar Watts durazno 300 ml vidrio",5,1200,829.0,24,0,5],
["7801620015800","agua mineral cachantun con gas 500 ml",29,1200,0,0,0,-1],
["7801620015817","agua mkineral cachantun sin gas 500 ml",29,1200,0,0,0,-1],
["7801620015855","Cachantun verde1600 cc",5,1400,1021.0,12,0,5],
["7801620016005","CRUSH ORANGE 500ML SABOR ORIGINAL",29,1200,0,0,0,-1],
["7801620016012","BILS SABOR ORIGINAL 500ML",29,1200,0,0,0,-1],
["7801620016029","PAP 500ML",29,1500,0,0,0,-1],
["7801620016111","LIMON SODA SABOR ORIGINAL 500ML",29,1900,0,0,0,-1],
["7801620016203","7Up 2 Lt.",29,1800,0,0,0,-1],
["7801620017552","Pepsi 3 Lt Desechable CCU",5,2500,2084.0,12,0,5],
["7801620019686","Canada Dry 2.5 Retornable CCU",5,1800,1321.0,10,0,5],
["7801620167721","Nectar watts 1.5 tutti Papalla",29,1000,0,0,0,-1],
["7801620172725","Pap 2.5 Retornable CCU",5,2000,1508.0,12,0,5],
["7801620370107","agua tonica canada dry ccu 1.5 litros desechable",5,2200,1500.0,5,0,5],
["7801620852955","Agua Mineral Cachantub 1.6 L",5,1300,900.0,24,0,5],
["7801620852962","cachantun 1600ml sin gas",29,1000,0,0,0,-1],
["7801620871130","Frugo Orange Drink 2 Lt",29,1700,0,0,0,-1],
["7801622000064","Agua Mineral Eden manzana 500 cc",5,800,400.0,10,0,-1],
["7801622000323","jugo asis frut naranja 2.0 litros",5,1700,1200.0,3,0,44],
["7801622000330","jugo asis frut durazno 2.0 litros",5,1700,1200.0,3,0,44],
["7801622000361","jugo asis frut tutti frutilla 2.0 litros",5,1700,1200.0,3,0,44],
["7801622000699","Agua Sifon Eden 1.8 Lt.",5,2000,1135.0,18,0,44],
["7801622000798","Mineral Sport 1 l Eden sin gas",5,1100,800.0,12,0,59],
["7801622005557","Agua mineral eden sabor durazno 500cc",5,750,400.0,10,0,-1],
["7801622005755","Agua Mineral Eden limon 500 cc",5,900,400.0,12,0,-1],
["7801622007551","Agua mineral eden sabor frutilla 500cc",5,750,400.0,10,0,-1],
["7801710000921","Salsa Blanca Gourmet",29,2200,0,0,0,-1],
["7801800000022","durazno cubitos aconcagua 590g",2,1950,1417.0,7,0,24],
["7801800100012","Duraznos en mitades Aconcagua 820 g",29,2300,1800.0,6,0,-1],
["7801800100029","DURAZNO MITADES ACONCAGUA 255G",29,2200,0,0,0,-1],
["7801800100081","DURAZNO CUBO ACONCAGUA 255G",29,500,0,0,0,-1],
["7801800100364","Durazno en mitades Aconcagua",2,2100,1417.0,6,0,24],
["7801800108537","SALSA EL VERGEL",29,990,0,0,0,-1],
["7801810117420","Té Emblem 20 bolsitas",29,990,0,0,0,-1],
["7801810117543","Te Emblem 100 bol. 180 g",29,1200,0,0,0,-1],
["7801815041362","Velas Invena",29,2200,0,0,0,-1],
["7801815041379","Velas invena 29 g",29,1200,0,0,0,-1],
["7801850000294","Azúcar La Mesa 1k",29,1490,0,0,0,-1],
["7801875029010","te para remojar mildred 125g",29,1200,0,0,0,-1],
["7801875047014","supremo te ceylan oro 40g",29,3700,0,0,0,-1],
["7801875047113","te ceylan premium supremo 20 uni",2,1390,1000.0,10,0,-1],
["7801875052018","Te mildred 20 bol",2,1400,968.0,12,0,-1],
["7801875052056","te ceilan mildred tea",29,4600,3491.0,6,0,-1],
["7801875058065","Te supremo Chamomille 20 un",29,1400,990.0,12,0,-1],
["7801875061010","Te Supremo Hiervas Surtidas 20 un",2,1400,830.0,12,0,24],
["7801875068019","yerba mate supremo 250g",29,1300,0,0,0,-1],
["7801875069153","bolsa superior grande 80x110cm",29,1200,0,0,0,-1],
["7801875069351","bolsa superior chica 50x70",29,1690,0,0,0,-1],
["7801875069368","bolsa superior mediana 70x90cm",29,600,0,0,0,-1],
["7801875150455","film plástico adherente",29,300,0,0,0,-1],
["7801900081341","SalchicaGorda Winter 400 g",29,5900,0,0,0,-1],
["7801900083451","Hamburguesa Winter 100g",12,600,269.0,24,0,38],
["7801900340486","Hamburguesa San Jorge 50 g Winter",12,300,187.0,50,0,38],
["7801901022220","cargador de pared normal v8",29,3800,0,0,0,-1],
["7801907000758","longanizas tradicionales san jorge 1 kilo",29,1300,0,0,0,-1],
["7801907000765","chorizos tradionales san jorge 1 kilo",29,3990,0,0,0,-1],
["7801907001458","papas duquesas san jorge 1 kilo",2,4800,4000.0,8,0,38],
["7801907001519","crorizos parrillero 205g SJ",29,1300,900.0,7,0,-1],
["7801907001953","Hamburguesa san jorge 100g  2x1.000",29,800,0,0,0,-1],
["7801907004107","pate de ave san jorge 125 g",29,1100,0,0,0,-1],
["7801907004305","pate ternera san jorge 125 g",29,900,500.0,24,0,-1],
["7801907004404","pate jamon san jorge 125 g",40,800,500.0,12,0,38],
["7801907006859","Hamburguesa de pollo 90 g S. Jorge",29,1300,0,0,0,-1],
["7801907006897","Hamburguesa Bronto 185g San Jorge",7,1300,900.0,24,0,38],
["7801907007160","Hamburguesa x 10 SJ 900 g",7,6200,4700.0,5,0,38],
["7801907008402","salchicha tradicional san jorge 5 uni",7,1300,1050.0,16,0,38],
["7801907008648","Salchicha Bronto San Jorge 950 g",29,3700,0,0,0,-1],
["7801907009782","carne molida sanjorge 250 g",12,1800,1020.0,16,0,38],
["7801907010061","salchicha formato hot dog 10 uni san jorge",7,1800,963.0,16,0,38],
["7801907010306","Salchicha tradicional SJ 1 k",7,3900,2393.0,8,0,38],
["7801907010399","Vienesa de pollo SJ 5u",29,1600,0,0,0,-1],
["7801907011037","churrasco san jorge 120g",6,1600,1399.0,10,0,38],
["7801907022880","papas pre fritas san jorge 1K",2,3400,2380.0,8,0,38],
["7801907026208","nuggets de pollo san jorge 300 g",29,3000,0,0,0,-1],
["7801907027090","choclo congelado grano 200g san jorge",12,900,590.0,10,0,38],
["7801907067768","Mantequilla Los Nogales 125 g",20,1800,1385.0,6,0,38],
["7801907067775","queso gauda laminado los mogales 250 g",29,3300,1805.0,8,0,-1],
["7801907067782","Manjar Los Nogales  200 g",29,1100,0,0,0,-1],
["7801907067812","Mantequilla Los Nogales 250g",20,3700,2000.0,12,0,38],
["7801907067829","Queso mantecoso laminado Los Nogales 250g",29,3300,2400.0,10,0,-1],
["7801909000077","churrasco de vacuno nuble 120 g",29,1600,0,0,0,-1],
["7801909000480","haburguesa vacuno chilenaza",6,300,180.0,12,0,66],
["7801909000565","Hamburguesa Pampa verde 100g",6,800,600.0,12,0,66],
["7801909000749","Hamburguesa Big Pampaverde 225g",29,1600,1200.0,24,0,-1],
["7801909001296","Hamburguesa Pampa Verde 150g",29,1300,0,0,0,-1],
["7801909001357","carne molida especial pampa verde 250 g",6,2300,1800.0,10,0,66],
["7801909001746","Guatitas Chilenaza 800 g",29,900,0,0,0,-1],
["7801915000009","salchichas de ave 5 unidades",29,900,0,0,0,-1],
["7801915000146","salchichas la crianza 5 uni",7,1750,1200.0,12,0,0],
["7801915001099","Paté ternera LC",29,3990,0,0,0,-1],
["7801915001105","Paté Jamon LC",29,800,0,0,0,-1],
["7801915001112","Salchichas SP 5 U 250 g",7,1100,900.0,12,0,0],
["7801916000176","pate de jamon la preferida 125 g",29,2800,0,0,0,-1],
["7801916000718","pate la preferida de ternera",7,1200,900.0,10,0,38],
["7801916000749","salchichon te la preferida",29,1100,0,0,0,-1],
["7801916002019","Jamon Pierna LP 200 g",29,1500,0,0,0,-1],
["7801916029702","pasta de pollo con ciboulette la preferida 125 g",40,1100,800.0,12,0,33],
["7801916029733","pasta de salame",29,1500,0,0,0,-1],
["7801916030340","salame la preferida 100 gramos",29,800,0,0,0,-1],
["7801916030951","Tocino Ahumado 500 g LP",29,3200,0,0,0,-1],
["7801916035246","salchicha con carne angus 5 und",29,1900,0,0,0,-1],
["7801916035260","pate de campo cerdo la preferida 125 g",29,1700,0,0,0,-1],
["7801916036366","Jamon Pechuga de Pavo cocida",29,1700,0,0,0,-1],
["7801916038452","Chorizo artesanal LP 2 g",29,2400,0,0,0,-1],
["7801916038506","Cgorizo Angus LP 250 g",29,1400,0,0,0,-1],
["7801916039602","Tocino LP 100 g",7,1950,1077.0,6,0,38],
["7801916039619","Tocino parrillero LP 180 g",29,1990,0,0,0,-1],
["7801916039763","Snakin LP 50 g",29,1200,0,0,0,-1],
["7801916039855","Molida LP 125 g",29,900,0,0,0,-1],
["7801920001381","Master Cat 500 g salmon",22,1990,1240.0,24,0,6],
["7801930000916","Salchicha tradicional PF 250g",7,1200,770.0,24,0,33],
["7801930003115","Pate de Ternera PF 125 g",29,900,600.0,10,0,-1],
["7801930003139","Pate de Jamon PF 125 g",29,1100,0,0,0,-1],
["7801930006390","Chorizo Cocktail 180 g",7,1600,1100.0,18,0,33],
["7801930007403","Chorizo parrillero PF l un",29,800,0,0,0,-1],
["7801930008219","pate de campo receta del abuelo sabor",40,990,800.0,12,0,33],
["7801930008226","pate receta del abuelo sabor salame",7,990,750.0,6,0,33],
["7801930008509","pasta jamon receta del abuelo 125 g",29,990,750.0,6,0,-1],
["7801930013244","pizza peperoni pf 430g",12,3500,2680.0,1,0,35],
["7801930013268","pizza jamon queso  pf 465g",12,4500,2551.0,2,0,42],
["7801930018973","Longanicilla de campo Receta del abuelo 160g",7,1500,1000.0,12,0,33],
["7801965000646","Salchichas montina 10 un",7,2300,1471.0,10,0,3],
["7801965000837","hamburguesa de pollo 50g",29,4400,0,0,0,-1],
["7801965000899","Croqueta de pollo Montina 65 g",12,500,435.0,8,0,3],
["7801965000967","Vianesas Montina tradicional 5 Un",7,1300,870.0,10,0,3],
["7801965000974","Vianesa tradicional Montina 20 un",7,4400,3242.0,8,0,3],
["7801965001155","Vianesa Montina 10 un",29,8900,0,0,0,-1],
["7801965001162","nuggets de pollo 1 kilo montina",12,4400,3500.0,5,0,3],
["7801965001445","Nuggets de pollo Montina 300 g",12,1490,1043.0,15,0,3],
["7801965001636","Nuggets de pollo Montina 2.5 k  pesar a 4000 el Kilo",29,1300,0,0,0,-1],
["7801965005603","salchicha de pollo montina 5 uni",7,1400,1000.0,15,0,3],
["7801965402617","Salchichas de Pollo Montina 20 un",29,4300,3800.0,6,0,-1],
["7802000001796","twistos horneados 110g",29,650,0,0,0,-1],
["7802000002526","Papas Lays Ameri. 38 g",30,800,553.0,4,0,17],
["7802000002755","ramitas sabor original 120g bolsaza",29,400,0,0,0,-1],
["7802000002816","cabritas sabor caramelo 42g",30,800,553.0,4,0,17],
["7802000003219","Choco Cracs Evercrisp 160 g",29,800,0,0,0,-1],
["7802000003264","papa moms",29,1800,0,0,0,-1],
["7802000005541","Twistos horneados 43 g",29,2200,0,0,0,-1],
["7802000005930","Cheezels queso 30 g evercrisp",29,750,0,0,0,-1],
["7802000006173","Mani Pasas i Almendras Evercrisp 150 g",29,1900,0,0,0,-1],
["7802000008412","cabritas sabor caramelo 250g",30,2200,1900.0,6,0,17],
["7802000008733","Traga Traga 30 g",29,800,0,0,0,-1],
["7802000009303","papa lays stax sabor queso cheddar 140g",29,2200,0,0,0,-1],
["7802000009969","Gatolate 30 g",29,2600,0,0,0,-1],
["7802000011016","Lays Ketchup 40 g",29,2200,0,0,0,-1],
["7802000011030","Lays ketchup 200 g",29,2200,0,0,0,-1],
["7802000012389","Lays Artesanas sal de mar 185 g",29,1990,0,0,0,-1],
["7802000012402","Lays 200 g Evercrisp",29,600,0,0,0,-1],
["7802000012679","Lays  corte americano 230 g",29,1100,0,0,0,-1],
["7802000012938","Popcorn Cheetos caramelo",29,1500,0,0,0,-1],
["7802000013140","Mani Salado Evercrisp 75 g",29,2300,0,0,0,-1],
["7802000013157","mani sin sal evercrisp 160g",29,1990,0,0,0,-1],
["7802000013164","mani salado evercrisp 160g",29,2100,0,0,0,-1],
["7802000013560","Cheezels 200 g",30,2200,1339.0,3,0,17],
["7802000013607","Stax original evercrisp 134 g",30,2700,2300.0,5,0,17],
["7802000013621","Stax crema cebolla 134 g",29,800,0,0,0,-1],
["7802000013683","Cheetos extra queso 55 g evercrisp",29,750,0,0,0,-1],
["7802000013690","papas moms caseras 250g",29,2200,0,0,0,-1],
["7802000013720","ramitas sabor queso 48g sonrrie",29,2400,0,0,0,-1],
["7802000013737","Ramitas original evercrisp 48 g",29,1800,0,0,0,-1],
["7802000014116","ramitas sabor original 250g",29,1900,0,0,0,-1],
["7802000014123","Ramitas Queso Evercrisp 250 g",29,2300,0,0,0,-1],
["7802000014192","Cheetos Mani 230 g Evercrisp",29,2200,0,0,0,-1],
["7802000014390","Cheetos 300 g Evercrisp extra queso",29,3600,0,0,0,-1],
["7802000014574","chisp pop 200gr",30,2200,1339.0,6,0,17],
["7802000014635","Papa Lays Evercrisp 230 g",29,750,0,0,0,-1],
["7802000014703","Papas Lays 380 g",29,750,0,0,0,-1],
["7802000014710","Papas Lays Corte Liso 380 g",29,750,0,0,0,-1],
["7802000014765","Papas Lays Evercrisp 42 g c americanp",29,750,0,0,0,-1],
["7802000014833","Dorito queso Evercrisp 42 g",29,2100,0,0,0,-1],
["7802000014857","Lays MEditerraneas 34g Jamon serrano",29,2100,0,0,0,-1],
["7802000014864","papas lays sabor oregano 34g",29,800,0,0,0,-1],
["7802000014949","avena instantánea quaker caja 450g",29,800,0,0,0,-1],
["7802000014956","avena tradicional quaker caja 450g",29,1300,0,0,0,-1],
["7802000015120","De Todito Lays 50 g",30,800,465.0,10,0,17],
["7802000015137","De Todito 50 Lays Evercrisp sonrie",29,2600,0,0,0,-1],
["7802000015151","de todito original 140g bolsaza",29,2800,0,0,0,-1],
["7802000015175","De Todito Dulce 120 g bolsaza",29,2200,0,0,0,-1],
["7802000015182","De Todito Lais 290 g",30,2800,2000.0,6,0,17],
["7802000015199","De Todito Evercrisp 290 g",30,2700,1700.0,12,0,17],
["7802000015304","Gatolate  220 g Evercrisp",29,2200,0,0,0,-1],
["7802000015311","Traga Traga 220 g Evercrisp",29,2250,0,0,0,-1],
["7802000015328","Chis Pop Evercrisp 220 g tuti fruti",29,2200,0,0,0,-1],
["7802000015335","Cheezelz 220 gqueso",29,1900,0,0,0,-1],
["7802000015410","Lays 200 g Oregano",29,1900,0,0,0,-1],
["7802000015427","Lays jamon cerrano 200 g",29,3300,0,0,0,-1],
["7802000015533","Doritos 172 g Evercrisp",29,1600,0,0,0,-1],
["7802000015557","Doritos 195 g",29,1300,0,0,0,-1],
["7802000015632","Doritos Queso Evercrisp 285 g",30,3300,2520.0,10,0,17],
["7802000015687","Cheezels queso Evercrisp 100 g bolsasa",30,1600,1172.0,4,0,17],
["7802000015694","papas lays bolsaza 110g",29,1600,0,0,0,-1],
["7802000015717","gatolate evercrisp 100 g",30,1600,985.0,5,0,17],
["7802000015748","doritos bolsaza sabor queso 100g",30,1600,1172.0,4,0,17],
["7802000015779","cheetos palitos sabor queso 110g",30,1600,1100.0,10,0,17],
["7802000015786","ramitas sabor queso 110g",30,1600,1400.0,12,0,17],
["7802000015793","ramitas evercrisp original 110g",29,1700,1000.0,0,0,-1],
["7802000015984","chis pop sabor tuti-fruti 100g bolsaza",29,1000,0,0,0,-1],
["7802000015991","Lays corte americano 220g",29,1000,0,0,0,-1],
["7802000016257","Doritos Dinamita 70 g",29,800,0,0,0,-1],
["7802000016301","Lays corte americano 72g evercrisp",29,1000,0,0,0,-1],
["7802000016318","Doritos 72 g Evercrisp",30,1000,600.0,5,0,17],
["7802000016349","Lais Jam. Serrano 40 g",29,1400,0,0,0,-1],
["7802000016356","de todito original 84g",30,1000,760.0,10,0,17],
["7802000016363","papa moms 230g",29,1300,0,0,0,-1],
["7802000016387","Twistos Jamon Iberico 100g",30,1600,1017.0,4,0,17],
["7802000016394","Twistos Queso 100 g",29,1600,0,0,0,-1],
["7802000016417","Cheetos palitos 84 g Evercrisp",29,1000,0,0,0,-1],
["7802000016424","lays bolsaza 100g",30,1600,1172.0,4,0,17],
["7802000016448","De todito bolsasa 120g",30,1600,1172.0,4,0,17],
["7802000016455","Cheezels 70 g Evercrisp",29,2200,0,0,0,-1],
["7802000016516","lucaza oregano",29,2300,0,0,0,-1],
["7802000016523","Lays Jam. Serrano 68 g",29,2300,0,0,0,-1],
["7802000016585","Cheetos palitos queso 280g",30,2000,1298.0,10,0,17],
["7802000016936","Ramitas Queso Mantecoso 240 g Evercrisp",29,2300,0,0,0,-1],
["7802000016943","Ramitas Original Evercrisp 240 g",29,2300,0,0,0,-1],
["7802000017025","Cheetos ondulados queso crema 20g",29,2400,0,0,0,-1],
["7802000017100","Ramita de queso 230g Evercrisp",30,2300,1449.0,5,0,17],
["7802000017117","ramitas evercrips 230g",30,2300,1449.0,5,0,17],
["7802000017186","Doritos sabor queso 200g",29,800,0,0,0,-1],
["7802000017445","Cheetos Mani 200 g",29,800,0,0,0,-1],
["7802000017476","Doritos  40 g",30,800,553.0,4,0,17],
["7802000017537","Papas Lays Kechup amer. 36 g",30,1000,465.0,10,0,17],
["7802000017544","Cheetos 50 g extra queso",30,800,553.0,4,0,17],
["7802000017629","Lais Corte Americano 350 g",30,3700,2280.0,3,0,17],
["7802000017698","lays artesanas cal de mar 95g",29,800,0,0,0,-1],
["7802000017704","lays jamon serrano 36g",29,1100,0,0,0,-1],
["7802000017711","Doritos F. Hot 40 g",29,2200,0,0,0,-1],
["7802000017735","lays oregano 36g",30,1000,465.0,10,0,17],
["7802000017742","mani con sal",29,2800,0,0,0,-1],
["7802000017858","Avena Quaker tradicional 400 g",2,2200,1247.0,4,0,17],
["7802000017865","Avena Quaker instantanea 400 g",2,2200,1400.0,3,0,17],
["7802000018312","papas fritas serrano lays 180g",29,1900,0,0,0,-1],
["7802000018329","papas lays sabor oregano 180g",29,2200,0,0,0,-1],
["7802000018343","Papas Lays Ketchup 180 g",30,2800,2300.0,3,0,17],
["7802000018381","Moms 220 g lisa",30,1900,1330.0,4,0,17],
["7802000018442","lays artesanas con merken 150g",29,1100,0,0,0,-1],
["7802000018749","Lays artesanas 150 g",29,1100,0,0,0,-1],
["7802000018770","Ramita salada evercrisp 90g",30,1100,770.0,4,0,17],
["7802000018961","Doritos dinamita aji limon 100g",30,1500,900.0,10,0,17],
["7802000019012","gatolate 200 g",30,2200,1339.0,4,0,17],
["7802000019036","Traga Traga 200 g",30,2200,1339.0,4,0,17],
["7802000019104","Lays corte américano 200g",29,2700,0,0,0,-1],
["7802000019210","papas lays 250gr",30,2600,2000.0,12,0,17],
["7802000019227","lays oregano 230gr",30,2700,1701.0,4,0,17],
["7802000019234","lays jamon serrano 230gr",30,2700,1701.0,4,0,17],
["7802000019371","Lays stax tarro chico",29,2200,0,0,0,-1],
["7802000019449","doritos 240gr",30,400,200.0,50,0,17],
["7802000019548","Maní Salado Evercrisp 140 g",30,1500,1100.0,12,0,17],
["7802022090716","BOLSA DE BSURA CHICA 50X70 AILEDA 10U",29,490,0,0,0,-1],
["7802022090723","BOLSA DE BASURA MEDIANA 70X90 AILEDA 10U",29,600,0,0,0,-1],
["7802022090730","BOLSA DE BASURA GRANDE 80X120 AILEDA 10U",29,600,0,0,0,-1],
["78020532","Compota de pera soprole 110g",29,1200,0,0,0,-1],
["78020535","Compota pera soprole",29,2500,0,0,0,-1],
["78020566","Compota de manzana soprole 110g",29,1300,0,0,0,-1],
["7802095000209","Quesa Villa PV 200 g 8",29,1400,0,0,0,-1],
["7802095180123","Tortillas PAncho villa 350 g",29,2200,0,0,0,-1],
["7802095181113","Tortillas tacos y fajitas 8 un 256 g",29,1500,0,0,0,-1],
["7802095181168","Tortillas Pancho Villa 8 Un",29,5000,0,0,0,-1],
["7802095185104","Panchitos tortillas de maíz 180 g Pancho Villa",29,4900,0,0,0,-1],
["7802095186071","Nachos sabor queso 180 g Pancho Villa",30,1500,1010.0,6,0,6],
["7802150088838","Granadina Mitjans 900 ml",29,1100,0,0,0,-1],
["7802180720203","casata madel 2.5L trisabor",29,1100,0,0,0,-1],
["7802200009028","tres negritos",30,300,150.0,0,0,6],
["7802200027985","Loop gomitas acudas 100 g",29,1000,0,0,0,-1],
["7802200032125","Flipy Gomitas 100 g",29,1100,0,0,0,-1],
["7802200036383","amberries gomitas 100g",29,300,0,0,0,-1],
["7802200037663","Ambrosita 100 g",29,1100,0,0,0,-1],
["7802200039643","ambrosito 100g",29,3690,0,0,0,-1],
["7802200110366","full strong menta",29,350,100.0,0,0,-1],
["7802200127357","Sandia Ambrosoli gomitas 100 g",29,1600,0,0,0,-1],
["7802200127449","Calabaza Halloween 50 un",29,2400,0,0,0,-1],
["7802200127982","Partes Halloween 40 un",29,1300,0,0,0,-1],
["7802200129078","Marsh Mallows Malva 250 g",29,1300,0,0,0,-1],
["7802200129115","Marsh Mallows Ambrosoliu 230 g",29,2400,1890.0,6,0,-1],
["7802200129863","Gómitas ácidad loop Ambrosoli 90g",13,1300,853.0,5,0,6],
["7802200129870","AMBERRIES 90G",13,1300,853.0,5,0,6],
["7802200129887","Flipy Ambrosoly 90 g",13,1300,852.0,7,0,6],
["7802200129894","GOMITAS SANDIA 90G",13,1300,716.0,6,0,6],
["7802200130081","guaguitas ambrosoli 300g",29,300,0,0,0,-1],
["7802200130142","Marsh Mallows Ambrosoli 120 g",29,1300,1000.0,6,0,-1],
["7802200132696","Mentitas Ambrosoli 25 g",13,350,185.0,12,0,1],
["7802200133426","Full Ambrosolin limon 27 g",13,350,180.0,20,0,1],
["7802200134010","Gomitas ambrosito Ambrosoli 90g",13,1300,852.0,5,0,6],
["7802200134065","Frugelé Ambrosoli 90g",29,1300,0,0,0,-1],
["7802200134744","Ambro Saurios 90 g",13,1300,700.0,5,0,6],
["7802200134751","Flipy Pink 90 g",13,1300,716.0,5,0,6],
["7802200135253","Frugele Citric 110 g",29,300,0,0,0,-1],
["7802200135413","GOMITAS LOOP ACIDAS 25G",13,350,185.0,12,0,1],
["7802200135734","Flipy Ambrosoli 25 g",29,350,100.0,0,0,-1],
["7802200135741","Amberries 25 g Ambrosoli",29,300,0,0,0,-1],
["7802200135765","Ambrosito Ambrosoli 25 g",18,350,150.0,20,0,1],
["7802200136946","frugele gomitas 130g",29,220,0,0,0,-1],
["7802200139664","GOMITAS DE EUCALIPTUS 25G",18,300,182.0,20,0,6],
["7802200183025","salsa ambrosoli sabor a chocolate",29,220,0,0,0,-1],
["7802200266001","Vivo Naranja",29,220,0,0,0,-1],
["7802200266056","Vivo limon",29,220,0,0,0,-1],
["7802200266070","Vivo frutilla 7 g",29,220,0,0,0,-1],
["7802200266186","jugo vivo mango 7g",29,220,0,0,0,-1],
["7802200266193","jugo vivo berries",29,220,0,0,0,-1],
["7802200266414","jugo vivo durazno huesillo",29,590,0,0,0,-1],
["7802200267152","Vivo naran-zanaho",29,590,0,0,0,-1],
["7802200267206","VivoMaracuja 70 g",29,590,0,0,0,-1],
["7802200270015","Vivo minifrut durazno 90 g",30,590,400.0,12,0,6],
["7802200270022","Vivo Minifrut manzana 90 g",30,600,400.0,12,0,6],
["7802200270039","Vivo Minifrut pera 90 g",30,600,400.0,12,0,6],
["7802200361072","Gelatina ambrosoli 100g frambuesa",29,590,0,0,0,-1],
["7802200361140","slupea la jalea manzana 100g",30,500,400.0,12,0,6],
["7802200361171","slurpea la jalea naranja ambrosoli 100 g",29,550,0,0,0,-1],
["7802200361188","Slupea la jalea Loop 100g",30,600,400.0,12,0,6],
["7802200361195","Slupea la jalea flipy 100g",30,600,400.0,12,0,6],
["7802200363984","gelatina sabor naranja 50g",29,600,422.0,8,0,-1],
["7802200363991","gelatina sabor frambuesa 50g",2,500,283.0,8,0,6],
["7802200371071","postre flan sabor vainilla 45g",29,1400,0,0,0,-1],
["7802200400078","mermelada vivo frambuesa 175g",2,1490,844.0,3,0,24],
["7802200400085","mermelada mora vivo 175g",31,1490,844.0,3,0,6],
["7802200400092","mermelada vivo durazno 175g",2,1400,984.0,6,0,24],
["7802200400108","Mermelada Vivo damasco 175 g",2,1300,984.0,6,0,6],
["7802200400221","Mermelada Vivo Mango 175 g",2,1300,984.0,6,0,6],
["7802200840294","golden nuss",29,2490,0,0,0,-1],
["7802200840362","Suny Chocolate ambresoli 120 g",29,2500,0,0,0,-1],
["7802200840454","Chocolate ambronuss 100g",29,1900,0,0,0,-1],
["7802200844148","Loly Choc Halloween 12 Un",29,1400,0,0,0,-1],
["7802200848375","Cerezas al licor Ambrosoli Cher 120 g",29,1400,0,0,0,-1],
["7802200850477","Huevitos Ambrosoli 15un",29,1400,0,0,0,-1],
["7802200893368","Orly Chocolate Naranja 115 g",29,1850,0,0,0,-1],
["7802200894112","Orly menta 115g Ambrosoli",29,1850,0,0,0,-1],
["7802200894129","chocolate Orly naranja 115g",29,1850,0,0,0,-1],
["7802200894136","Orly berries 115g Ambrosoli",29,1400,0,0,0,-1],
["7802200894143","Orly Chocolate Frutilla 1150 g",29,3400,0,0,0,-1],
["7802200894150","orly trufa 115 grs",29,2400,0,0,0,-1],
["7802200894167","Chocolate Orly Almendra 100g",29,2400,0,0,0,-1],
["7802215101335","carezza 160 grs",29,2300,0,0,0,-1],
["7802215101373","Costa Milk145 g",29,2300,0,0,0,-1],
["7802215101441","Chocolate Bitter Costa",29,2400,0,0,0,-1],
["7802215101465","COSTA MILK",29,1500,0,0,0,-1],
["7802215101472","COSTA NUSS",29,1500,0,0,0,-1],
["7802215101489","Chocolate Cacao nar. Costa 80 g",29,1200,0,0,0,-1],
["7802215101700","Rolls Crocante 100 g",29,1900,0,0,0,-1],
["7802215101779","Rolls Crispy 100 g",29,2300,0,0,0,-1],
["7802215101786","Carezza costa 120 g",29,1500,0,0,0,-1],
["7802215101816","rolls crispy berries 120g",29,990,0,0,0,-1],
["7802215101854","Chocolate de leche Bambino 120g",29,5990,0,0,0,-1],
["7802215101991","Rolls Nuts 100 g",29,2100,0,0,0,-1],
["7802215102912","lenguitas de gato",29,2500,0,0,0,-1],
["7802215104039","Carezza Bombones 210 g",8,6900,5220.0,6,0,6],
["7802215104848","vizzio 120 grs",29,2400,1600.0,10,0,-1],
["7802215104855","costa rama 115 grs",8,2400,1900.0,100,0,60],
["7802215106019","Rolls crocante 90 g",29,1900,0,0,0,-1],
["7802215106026","Carezza Bom Bom costa 100 g",29,1900,0,0,0,-1],
["7802215106033","Mecano Bom Bon costa",29,1000,0,0,0,-1],
["7802215107122","Costa Rama Menta 115 g",29,1000,0,0,0,-1],
["7802215108174","rolls nuts 150g",29,1900,0,0,0,-1],
["7802215116544","Conejo Carezza 48 g costa",29,1900,0,0,0,-1],
["7802215116704","Conejo Picnic 48 g",29,1900,0,0,0,-1],
["7802215121241","rolls chocolate blanco costa 140g",29,1500,0,0,0,-1],
["7802215121258","rolls crocante 150g",29,4290,0,0,0,-1],
["7802215121319","rolls crispy 130g",29,2200,0,0,0,-1],
["7802215124082","vizzio edicion especial 90g",29,1800,0,0,0,-1],
["7802215124679","Carezza bombones rellenos  158 g",29,850,0,0,0,-1],
["7802215166525","cereal mono rolls 230g",38,2200,1690.0,22,0,6],
["7802215166785","cereal mono crunch rolls 230g",38,1800,1000.0,2,0,25],
["7802215203039","Frac Menta 130 g",29,3690,0,0,0,-1],
["7802215230486","Refreskids frambuesa 180 g",29,990,0,0,0,-1],
["7802215290114","Gomitas Monster 40 Un",29,990,0,0,0,-1],
["7802215301452","Cereal Bar chocolate 18 g",29,300,189.0,12,0,-1],
["7802215301506","protein vivo sabor mani caramelo 15g",29,300,0,0,0,-1],
["7802215301742","protein vivi 15g sabor berries",29,800,0,0,0,-1],
["7802215302060","galleta Gran Cereal costa muesli135 g",29,300,0,0,0,-1],
["7802215303159","Cereal Bar Costa  18 g",29,990,0,0,0,-1],
["7802215303241","Gran Ceeal Cacao  135 g",29,3300,0,0,0,-1],
["7802215303401","Chocman 33 g Costa",13,300,200.0,100,0,49],
["7802215501418","galletas agua line",29,990,0,0,0,-1],
["7802215501623","Galletas Vivo Salvado 585 g a $1100 Cada una",17,3490,1900.0,5,0,6],
["7802215501968","galleta soda costa 180g",29,1200,0,0,0,-1],
["7802215502002","galleta soda vivo 123 g",17,1200,800.0,6,0,6],
["7802215502026","Soda costa 160g tradicional",17,1200,870.0,10,0,6],
["7802215502033","Soda line Costa 160g",17,1200,870.0,10,0,6],
["7802215502262","Tuareg Costa  coco 120 g",17,800,439.0,12,0,6],
["7802215502286","Mini Donuts 40 g",17,500,250.0,10,0,6],
["7802215502293","Mini Nik 30 g",29,850,0,0,0,-1],
["7802215502514","Dindon Costa 1150 g",17,850,620.0,12,0,6],
["7802215502569","Gallets Suny Costa 122 g",17,850,620.0,12,0,6],
["7802215502576","Frac Naranja 130 g",29,450,0,0,0,-1],
["7802215503023","Galleta Gran cereal sabor vainilla 110g",29,450,0,0,0,-1],
["7802215503405","Mini Costa Mantequilla 35 g",30,450,250.0,3,0,6],
["7802215503450","Mini Costa vino 35 g",29,450,252.0,12,0,-1],
["7802215503863","Mini Costa Limon 35 g",30,450,250.0,3,0,6],
["7802215504655","Galleta NIK 71 g",29,1450,0,0,0,-1],
["7802215504662","Galleta NIK",17,700,400.0,0,0,6],
["7802215504679","Galleta NIK 71 g",30,700,400.0,3,0,6],
["7802215504846","Waffer costa clasica  95 g",29,1100,0,0,0,-1],
["7802215505027","Obsesion barquillos rellenos",17,1600,1050.0,6,0,6],
["7802215505089","Galleta brownie chock Costa 120g",29,990,0,0,0,-1],
["7802215505140","CHOCO CHIPS COSTA 125G",29,1100,0,0,0,-1],
["7802215505270","galleta limon 140g",30,990,730.0,2,0,6],
["7802215505287","galleta chocolate costa",30,990,730.0,2,0,6],
["7802215505294","galleta mantequilla costa 140 g",17,990,650.0,12,0,6],
["7802215505300","galleta vino costa",17,990,650.0,12,0,6],
["7802215505379","Galletas caramel costa 150g",30,990,730.0,4,0,6],
["7802215505409","Galleta de coco Costa 125g",17,990,650.0,12,0,6],
["7802215508523","leche trencito UHT",20,690,368.0,6,0,30],
["7802215508530","Donuts Chocolate Blanco 100 g",17,1600,1000.0,10,0,6],
["7802215508547","donuts orange",17,1490,1000.0,10,0,6],
["7802215508554","donuts coco crunch 95g",17,1490,1000.0,10,0,6],
["7802215508639","Nik Block 160 g choco",29,400,0,0,0,-1],
["7802215511011","crackelet 85g",30,700,410.0,23,0,6],
["7802215511042","Soda Costa Line 180 g",29,850,0,0,0,-1],
["7802215511615","soda costa",30,400,350.0,4,0,6],
["7802215511622","soda line chica 54g",30,500,350.0,5,0,6],
["7802215512261","Frac Clasica 130 g",30,700,500.0,12,0,6],
["7802215512278","Frac Chocolate 130 g",30,700,500.0,2,0,6],
["7802215512285","Frac Vainilla 130 g",30,700,500.0,34,0,6],
["7802215512292","Frac Capuccino 130 g",29,1490,0,0,0,-1],
["7802215512308","Frac Chocolate Frutilla 130 g",29,1490,0,0,0,-1],
["7802215514326","Obsesion Costa menta-choc 85 g",29,1490,0,0,0,-1],
["7802215514333","galleta obsesion maní 85g",29,1490,0,0,0,-1],
["7802215515019","galleta gretel chocolate 85g",17,1350,990.0,12,0,25],
["7802215515026","Gretel Chocolate Blanco 85 g",29,1100,0,0,0,-1],
["7802215515064","gretel yoghurt frutilla 85g",30,1600,963.0,2,0,6],
["7802215516207","Palmeritas Costa  40 g",29,250,0,0,0,-1],
["7802215516412","Mini costa Chips 35 g",29,1100,0,0,0,-1],
["7802220140589","In Kat XL calaf 90 g",29,1100,0,0,0,-1],
["7802220140602","barra de chocolate inkat 26g",29,400,200.0,24,0,-1],
["7802220140756","Chocolate Coquet frutilla",29,500,0,0,0,-1],
["7802220140787","COQUET 90g",29,400,0,0,0,-1],
["7802220141081","ricolate calaf 28g",29,400,0,0,0,-1],
["7802220176403","alfajor classic 35g",29,1490,0,0,0,-1],
["7802220650002","Natur trigo 20 g",29,400,0,0,0,-1],
["7802220650026","Natur arroz 20 g",29,500,0,0,0,-1],
["7802220738427","Alfajor Calaf 6 un 360",29,400,0,0,0,-1],
["7802220739363","Natur Maiz 20 g",29,300,0,0,0,-1],
["7802220776474","Alfajor Premium Calaf",13,600,400.0,2,0,1],
["7802225260657","Turron de mani Dos en Uno 45 g",17,400,240.0,12,0,-1],
["7802225426381","chubi dos en uno 22 g",29,1700,0,0,0,-1],
["7802225427289","Tifanys 22 g Arcor",29,1700,0,0,0,-1],
["7802225510158","bombones privilegio 60g",29,350,0,0,0,-1],
["7802225640770","bonbon galleta 95g",17,1700,1350.0,12,0,6],
["7802225640848","galleta bon o bon chocolate blanco",30,1700,1250.0,1,0,31],
["7802225683050","Galleta Zelz  35 g",29,350,0,0,0,-1],
["78022263","Uno Soprole frutilla 80 ml",29,2800,0,0,0,-1],
["78022270","uno al dia multifruta",29,5400,0,0,0,-1],
["7802230070012","chocolate trencito 80grs",13,1900,1400.0,6,0,31],
["7802230070029","chocolate de leche trencito nestle 150 g",8,3800,2690.0,6,0,31],
["7802230070227","sahne-nuss 250g",8,6990,2615.0,6,0,31],
["7802230076298","Sahne-Nuss pasas al ron 250 g",8,7400,5215.0,6,0,31],
["7802230081162","kuky clasica mckay 120 g",30,1400,760.0,6,0,31],
["7802230081179","kuky sabor chocolate 120 g",30,1400,760.0,3,0,31],
["7802230082503","Galleta Alteza cocado Mckay 140 g",30,1690,1000.0,30,0,31],
["7802230082510","oble alteza chirimoya mckay 140 g",17,1690,1113.0,24,0,31],
["7802230082527","mckay alteza frutilla 140 gramos",13,1690,986.0,24,0,31],
["7802230082534","mckay alteza helado",30,1690,1000.0,8,0,31],
["7802230082831","Galleta Criollitas Mckay 100 g",29,990,0,0,0,-1],
["7802230083951","Galleta mantequilla Mckay 150 g",30,1100,594.0,3,0,31],
["7802230086648","mckay soda clasica 180 g",30,1300,781.0,10,0,31],
["7802230086952","galleta triton vainilla mckay 126 g",30,990,650.0,25,0,31],
["7802230086969","galleta triton 126 g",30,990,420.0,100,0,31],
["7802230975324","prestigio 35 grs",17,800,500.0,20,0,30],
["7802300000154","SALSA DE TOMATE MALLOA  200G",29,1400,0,0,0,-1],
["7802300020558","Mermelada Malloa Frutilla",29,990,0,0,0,-1],
["7802300020572","Mermelada Malloa mora 230 g",29,1650,0,0,0,-1],
["7802310000366","Ketchup Jano 480 g",29,1300,0,0,0,-1],
["7802310000373","Mostaza Jano 480 g",29,1480,0,0,0,-1],
["7802310000380","salsa barbecue 480g",29,1690,0,0,0,-1],
["7802315560667","Salsa de soya Traverso 250 ml",29,1000,0,0,0,-1],
["7802337000110","aceitunas huasco traverso 500 g",29,1890,0,0,0,-1],
["7802337000486","Salsa de soya Traverso 187.5 ml",29,700,0,0,0,-1],
["7802337000561","aji pebre traverso 350g",29,690,0,0,0,-1],
["7802337001469","Salsa de soya Traverso 500ml",29,1100,0,0,0,-1],
["7802337101015","Vinagre de vino blanco Traverso 250ml",29,1100,0,0,0,-1],
["7802337101022","Vinagre Traverso tinto 250g",29,1890,0,0,0,-1],
["7802337101039","vinagre de vino blanco traverso 500ml",29,800,0,0,0,-1],
["7802337101046","Vinagre tinto Traverso 500 00",29,1200,0,0,0,-1],
["7802337102302","vinagre de manzana",2,1900,1071.0,4,0,24],
["7802337801014","sucedaneo de jugo de limon 2502 ml",29,800,0,0,0,-1],
["7802337801038","susedaneo de jugo de limon traverso 500 ml",29,2200,0,0,0,-1],
["7802337910280","Chucrut Traverso 500 g",29,1300,900.0,6,0,-1],
["7802337910297","salsa americana traverso 500 gramos",29,1300,900.0,6,0,-1],
["7802337910808","Aji Traverso 200 g",29,2490,0,0,0,-1],
["7802337910815","Aji Traverso 200 g",29,2400,0,0,0,-1],
["7802337910822","Aji Traverso Patagonia 200 g",29,2200,0,0,0,-1],
["7802337910907","Ketchup Traverso 450 g",29,2190,0,0,0,-1],
["7802337910914","Mostaza Suave 450 g",29,1500,0,0,0,-1],
["7802337910921","Mostaza tradicional Traverso 450g",29,1100,0,0,0,-1],
["7802337920227","condimento de mostaza traverzo 1000 g",29,1500,0,0,0,-1],
["7802337930219","Aji Chileno Traverso 240 g",29,1100,0,0,0,-1],
["7802337930226","Mostaza Traverso 240g",29,1500,1100.0,10,0,-1],
["7802337930233","Aji Pebre Traverso 230 g",29,1800,1190.0,10,0,-1],
["7802337930240","Ketchup Traverso 240 g",29,1500,1050.0,10,0,-1],
["7802337937072","Pesto receta italiana Traverso 190g",29,1100,0,0,0,-1],
["7802337939014","sopa instantanea traverso carne",29,1200,0,0,0,-1],
["7802337939021","sopa instantanea traverso pollo",29,900,0,0,0,-1],
["7802337939038","sopa instantanea traverso camaron",29,900,0,0,0,-1],
["7802337939045","Sopa Traverso vegetales",29,2600,0,0,0,-1],
["7802337939106","fideos instantaneos para sopa traverso sabor carne 85g",29,2600,0,0,0,-1],
["7802337939113","fideos instantaneos para sopa traverso sabor pollo",29,1100,0,0,0,-1],
["7802337976002","mostaza traverso 1000g",34,2500,2000.0,12,0,24],
["7802337976033","ketchup traverso 1 k",2,2800,2090.0,6,0,45],
["7802340000008","vinagre de manzana hernandez 500 ml",29,1490,0,0,0,-1],
["7802340001043","vinagre tinto hernandez 500ml",2,700,500.0,4,0,24],
["7802340001050","Sucedáneo de jugo de limón Hernández Plaza 500ml",29,990,600.0,12,0,-1],
["7802351000615","Salsa Tartara 210 g",29,3600,0,0,0,-1],
["7802351000844","Mostaza Don Juan 500 g doypac",2,1500,1070.0,7,0,29],
["7802351000868","SALSA DE AJO",29,990,0,0,0,-1],
["7802351000912","mayo craft deli 859g",29,1300,0,0,0,-1],
["7802351000936","mayo deli kraft 200g",29,550,0,0,0,-1],
["7802351000950","Mayodeli Kraft 90g",29,1900,0,0,0,-1],
["7802351001056","mostaza heinz 200 g",29,1900,0,0,0,-1],
["7802351001063","Mostraza Heinz 60 g",29,1900,0,0,0,-1],
["7802351001797","aji inferno red 250g",29,1390,0,0,0,-1],
["7802351001810","aji smoked inferno 250 g",29,650,0,0,0,-1],
["7802351002206","ramitas inferno cheddar 250g",29,1390,0,0,0,-1],
["7802351121204","aceitunas huasco don juan 200g",30,2300,1559.0,3,0,29],
["7802351221003","aji chileno",2,600,396.0,18,0,29],
["7802351241018","aji pebre 240g",29,1390,950.0,6,0,-1],
["7802351311001","moztaza don juan 100 g",2,600,396.0,20,0,29],
["7802351314606","Mostaza Don Juan 240 g",29,1100,0,0,0,-1],
["7802351315009","Mostaza 250 g Don Juan Doypac",29,990,590.0,6,0,29],
["7802351441203","cHUCRUT dON jUAN 360G",29,990,0,0,0,-1],
["7802351461201","pickles en vinagre don juan 360g",29,1500,900.0,10,0,-1],
["7802351524500","vinagre de vino blanco 250 ml",3,790,0,0,0,29],
["7802351524708","Vinagre Blanco Don Juan",2,1100,700.0,5,0,29],
["7802351524807","Vinagre Tinto Don Juan 500 ml",2,1100,700.0,6,0,29],
["7802351534509","JUGO DE LIMON DON JUAN 250 ML",2,700,450.0,6,0,29],
["7802351534707","jugo de limon don juan 500ml",2,990,500.0,9,0,29],
["7802351611002","ketchup don juan 100 g",2,600,396.0,1,0,29],
["7802351614607","Ketchup Don Juan 240 g",2,1300,940.0,3,0,29],
["7802351615017","Ketchup DJ 400 g",29,1300,0,0,0,-1],
["7802351615024","ketchup don juan 800 g",29,3200,2401.0,4,0,-1],
["7802351624002","MAYONESA DON JUAN 100G",2,600,396.0,14,0,29],
["7802351625023","Mayonesa Clasica DJ 250 g",29,2400,0,0,0,-1],
["7802356000009","Vinagre de manzana Traverso 250 ml",29,350,0,0,0,-1],
["7802384792365","Cloro domestico Golden 50l",29,600,0,0,0,-1],
["7802408000476","fruna chirimoya 1l",19,2000,1500.0,6,0,1],
["7802408000483","mora crema fruna",19,450,187.0,42,0,-1],
["7802408000506","mustang crema frambuesa 110g",19,600,340.0,0,0,35],
["7802408000513","mustang pasas al ron 110g",19,600,340.0,0,0,35],
["7802408000537","palito manzana 60ml",29,300,0,0,0,-1],
["7802408000544","palito naranja 60ml",29,600,0,0,0,-1],
["7802408000568","naranja fru 60g",29,450,0,0,0,-1],
["7802408000582","mora mora 65ml",29,400,0,0,0,-1],
["7802408000636","mustang clasico 110g",29,2900,0,0,0,-1],
["7802408000643","Crema Crema fruna",29,2900,0,0,0,-1],
["7802408000681","FRUTI FRU fruna",19,450,180.0,40,0,-1],
["7802408000827","Galletas Goteron 1 K Fruna 1050",30,3200,2400.0,1,0,1],
["7802408000841","tableton 650g",17,3200,1800.0,2,0,1],
["7802408001374","Cassata Mora fruna 1 Lt.",19,2300,1290.0,6,0,1],
["7802408001398","GALLETA MARIBEL",29,450,0,0,0,-1],
["7802408001428","Casata Fruna Milano 2.5 Lt.",44,5500,3000.0,11,0,-1],
["7802408001572","Run Run marshmallows Fruna",30,450,300.0,8,0,1],
["7802408001602","Postre helado Fiorentina frambuesa crema 1L",19,2900,1723.0,6,0,18],
["7802408001626","Postre helado Fiorentina mora crema 1L",19,2900,1917.0,6,0,18],
["7802408001633","Postre helado Fiorentina lúcuma chocolate",19,2900,1923.0,6,0,18],
["7802408001787","alfajor panchito",29,450,0,0,0,-1],
["7802408001978","tuingo pasas al ron 130g",29,2300,0,0,0,-1],
["7802408002401","tortazo fruna 70g",29,300,0,0,0,-1],
["7802408002425","mini torta selva negra",29,300,0,0,0,-1],
["7802408002739","Cassata tres leches fruna 1 Lt.",19,2300,2000.0,6,0,-1],
["7802408002883","marshmallows tobogan fruna 38 g",29,400,180.0,12,0,-1],
["7802408002937","Mini Fruna  fabuloso",30,300,150.0,6,0,1],
["7802408002951","mini tableton fruna40g",29,300,190.0,10,0,-1],
["7802408002968","Mini Fruna coco",30,300,150.0,4,0,1],
["7802408002975","Mini Fruna limón",30,300,150.0,6,0,1],
["7802408002982","Mini Fruna mantequilla",30,300,150.0,4,0,18],
["7802408002999","Mini Fruna coco",30,300,150.0,1,0,1],
["7802408003507","SUFLE DE PAPA FRUNA 30G",30,400,300.0,12,0,1],
["7802408003521","SUFLE DE QUESO FRUNA 30G",30,400,300.0,12,0,1],
["7802408003972","Marsh Mallous Fruna 600 g",29,2900,2050.0,12,0,-1],
["7802408004009","marsh mallows fruna 250g",29,1400,900.0,6,0,-1],
["7802408004429","RunRun Fruna 50 g",29,600,0,0,0,-1],
["7802408004931","copa mora crema 250ml",29,600,0,0,0,-1],
["7802408005150","magnifico crema 125g",29,600,500.0,0,0,-1],
["7802408005167","Mustang almendra fruna",29,1100,0,0,0,-1],
["7802408005174","magnifico fruna",29,800,500.0,0,0,-1],
["7802408005228","fru tanker 85ml",19,300,150.0,200,0,18],
["7802408005518","mani salado fruna de 180gr",29,400,0,0,0,-1],
["7802408005587","traga traga 45g fruna",29,1500,0,0,0,-1],
["7802408005600","sufle fruna gato",29,400,0,0,0,-1],
["7802408005631","SUFLE SABOR TUTI-FRUTTI FRUNA 40G",30,300,180.0,6,0,18],
["7802408005723","copa maracuya 250g",29,400,0,0,0,-1],
["7802408005747","SUFLE DE MANI HORNEADO FRUNA 40G",29,900,0,0,0,-1],
["7802408005808","Cbritas Fruna caramelo 400 g",29,900,0,0,0,-1],
["7802408005884","Cabritas Fruna 50 g",30,300,180.0,6,0,1],
["7802408005921","Galleta oblea chirimoya 110g",30,600,400.0,6,0,1],
["7802408005938","Galleta oblea frutilla Fruna 110g",30,800,595.0,6,0,1],
["7802408006034","Cereal de maíz azucarado 250g",30,1500,900.0,2,0,1],
["7802408006072","azucar serrano",2,1300,974.0,24,0,24],
["7802408006447","Casata coco Fruna 1L",19,2000,1290.0,6,0,1],
["7802408007192","helado carioca 110g",19,800,394.0,24,0,34],
["7802408007239","Ramitas saladas fruna 50 g",29,1000,0,0,0,-1],
["7802408007246","Ramita queso fruna 50 g",29,5500,0,0,0,-1],
["7802408007369","Cubanito Marshmallous Fruna g",17,3200,2200.0,3,0,1],
["7802408007543","Polulo 120g",30,1000,750.0,3,0,1],
["7802408007758","Cassatta Bi.Sabor Fruna 2..5 Lt.",19,5500,2200.0,6,0,18],
["7802408007963","cabritas fruna 200g",30,1400,700.0,5,0,1],
["7802408007970","OBLEA SERRANITA 55G FRUNA",29,300,0,0,0,-1],
["7802408007987","OBLE CARIOCA FRUNA 55G",29,300,0,0,0,-1],
["7802408011052","Galleta Nonitas 55g",30,400,160.0,10,0,1],
["7802408015081","Galleta Carioca Fruna 64 g",17,600,340.0,12,0,18],
["7802408015241","Galleta Serranita Fruna 64 g",17,300,340.0,12,0,18],
["7802408017054","Carioca Chip 64 g",29,2300,0,0,0,-1],
["7802408019140","Galletas Vainilla Fruna 850 g",17,3000,2500.0,4,0,1],
["7802408061019","Casata vainilla Fruna 1L",19,2000,1290.0,3,0,1],
["7802408061026","Cassata chocolare 1 Lt.",19,2300,1290.0,6,0,1],
["7802408061057","Cassata Fruna Frutilla 1L",19,2300,1290.0,6,0,1],
["7802408061064","Casata lucuma Fruna 1L",19,2000,1290.0,6,0,1],
["7802408061088","Casata Milano Fruna 1 Lt.",29,800,0,0,0,-1],
["7802408061101","Cassatín Milano 150ml",19,700,400.0,20,0,1],
["7802408084292","cubanitos",30,450,200.0,1,0,1],
["7802408091030","Galleta oblea vainilla 110g",30,800,400.0,6,0,1],
["7802408091054","Galleta oblea helado Fruna 110g",30,600,400.0,6,0,1],
["7802410000112","salsa de queso gourmet 35 g",29,3900,0,0,0,-1],
["7802410000327","esencia de naranja gourmet 60ml",29,3200,0,0,0,-1],
["7802410000594","Escencia de Vainilla 60 ml",2,990,490.0,6,0,8],
["7802410000952","Salsa Barbecue Gourmet 1 k",29,3800,2490.0,4,0,-1],
["7802410001324","merengue instantaneo gurmet 500g",2,3600,2749.0,10,0,45],
["7802410001379","Aji de Color Gourmet 15 g",29,850,0,0,0,-1],
["7802410001577","mezcla de glaseado de vainilla en polvo gourmet 500g",29,1000,0,0,0,-1],
["7802410001607","Caldo en polvo Gourmet pollo 6 Un",2,1000,560.0,6,0,45],
["7802410001614","Caldo en polvo verduras Gourmet 6 Un",2,1000,560.0,6,0,45],
["7802410001621","caldo carne goumet",2,1000,560.0,6,0,45],
["7802410001898","colorantes morado calipso fucsia Gourmet",2,2250,1275.0,1,0,6],
["7802410002147","mezcla de cupcakes sabor vainilla gourmet 300g",29,990,0,0,0,-1],
["7802410002161","mezcla de brownies de chocolate 300g",29,800,0,0,0,-1],
["7802410002208","caldo polvo gurmet",2,1000,600.0,10,0,45],
["7802410002239","Polvos de hornear Gourmet 100 Gr",29,1200,843.0,10,0,-1],
["7802410002253","sopa gurmet costilla",2,700,420.0,10,0,-1],
["7802410002277","sopa gurmet caracolitos",2,700,420.0,10,0,-1],
["7802410002901","base para seviche gourmet 30 g",29,1000,700.0,6,0,-1],
["7802410003137","Crema Esapaqrragos Gourmet",2,700,420.0,10,0,-1],
["7802410003182","Chips de chocolate Gourmet  200 g",8,5400,4096.0,6,0,55],
["7802410003618","Bicarbonato Gourmet 100g",29,1990,0,0,0,-1],
["7802410003663","Nuez moscada entera gourmet 4g",29,3800,0,0,0,-1],
["7802410003687","Salsa Gourmet Alcachofa & Espinaca 200 g",29,2500,0,0,0,-1],
["7802410003861","Salsa Barbecue Merquén Gourmet 180g",29,2490,0,0,0,-1],
["7802410004257","Chips de Chocolate blanco Gourmet 200 g",29,2500,0,0,0,-1],
["7802410004325","decoracion",29,1800,0,0,0,-1],
["7802410004448","decoracion  gurmet",29,2500,0,0,0,-1],
["7802410004455","decoracion",29,1000,0,0,0,-1],
["7802410004820","salsa tartara",30,1800,1260.0,4,0,45],
["7802410004882","decoracion",29,300,0,0,0,-1],
["7802410004967","caldo en polvo GALLINA 48g",2,1000,560.0,6,0,45],
["7802410010340","colorantes rojo amarillo azul Gourmet",2,3500,2500.0,12,0,6],
["7802410053613","Albahaca Dehidratada Gourmet 6 g",29,600,0,0,0,-1],
["7802410073383","Coco Rallado Gourmet 100 g",29,600,0,0,0,-1],
["7802410099314","esencia de canela gourmet 60ml",2,1900,1391.0,6,0,8],
["7802410101376","Clavo de olor entero 5g",29,500,0,0,0,-1],
["7802410101833","Sesamo Gourmet 30 g",29,1300,0,0,0,-1],
["7802410101963","Laurel Gourmet seleccionado 5 g",29,500,0,0,0,-1],
["7802410112136","Perejil deshidratado Gourmet 12g",29,400,0,0,0,-1],
["7802410118312","esencia de limon gourmet 60ml",29,500,0,0,0,-1],
["7802410121374","Comino entero Gourmet 15 g",29,500,0,0,0,-1],
["7802410131373","Comino molido Gourmet 15g",29,1300,0,0,0,-1],
["7802410181378","Nuez moscada molida Gourmet 5g",29,1300,0,0,0,-1],
["7802410195375","Oregano entero Gourmet 20 g",29,1400,0,0,0,-1],
["7802410205104","aji de color molido frasco gourmet 26 g",29,990,0,0,0,-1],
["7802410205258","albahaca deshidratada frasco gourmet 11 g",29,3500,0,0,0,-1],
["7802410225300","Salsa de ajo Gourmet 165 cc",29,1000,0,0,0,-1],
["7802410281009","esencia de vainilla la primavera 250g",2,990,561.0,4,0,24],
["7802410300878","crema pastelera para preparar gourmet 1400 g",2,3500,1984.0,0,0,24],
["7802410350118","Salsa Alfredo Gourmet",2,1200,750.0,6,0,8],
["7802410350156","salsa de carne gormet 30 g",29,1290,0,0,0,-1],
["7802410350323","salsa pesto gourmet 30 g",29,1000,0,0,0,-1],
["7802410350668","base sazonador para tacos goumet 48 g",29,850,0,0,0,-1],
["7802410351108","Carne caserola Gourmet",29,1200,0,0,0,-1],
["7802410351207","base para chapsui 33g",29,1200,800.0,6,0,-1],
["7802410400219","Salsa de soya Gourmet 165 cc",29,1800,0,0,0,-1],
["7802410400356","Ahumado Gourmet 165 cc",29,1800,0,0,0,-1],
["7802410400462","salsa barbecue gourmet original",2,2590,1750.0,5,0,45],
["7802410452003","SALSA PARA UNTAR GOURMET AJO Y OREGANO 200G",30,1800,1260.0,4,0,45],
["7802410452034","salsa para untar light yogurt y ciboulette gourmet 200 g",30,1800,1260.0,0,0,45],
["7802410506249","Salsa de chocolate Gourmet 280g",2,2490,1891.0,10,0,24],
["7802410506263","Salsa de Chocolate siin azucar Gourmet280 g",29,2200,0,0,0,-1],
["7802410506294","salsa gourmet sabor frambruesa 280g",2,2490,1891.0,10,0,45],
["7802410506348","Salsa de frutilla Gourmet 300g",2,2200,1247.0,1,0,24],
["7802410506393","salsa de caramelo gormet 300 g",2,2490,1891.0,2,0,45],
["7802410506447","Salsa de manjar Gourmet 280g",2,2490,1891.0,6,0,45],
["7802410512325","esencia de cola de mono botella 100ml",2,2100,1294.0,6,0,8],
["7802410550310","esencia de almendra 60ml gourmet",29,850,0,0,0,-1],
["7802410607243","Chantilly Gourmet 200 g",29,1250,0,0,0,-1],
["7802410607328","crema pastelera en polvo gourmet 320g",29,1200,660.0,6,0,-1],
["7802410607762","crema chantilli de chocolate gourmet 200g",29,990,0,0,0,-1],
["7802410708247","gelatina sin sabor en polvo gourmet 30 g",2,1700,1200.0,12,0,8],
["7802410810155","esencia de vainilla la primavera 1L",29,1990,0,0,0,-1],
["7802410820154","Salsa de Soya La primera",2,990,420.0,7,0,24],
["7802410880318","esencia de ron gourmet 60ml",29,1990,0,0,0,-1],
["7802420001550","Snack Mix 320 g",29,2600,0,0,0,-1],
["7802420001680","crunchis tutifruti 270 g",29,2500,0,0,0,-1],
["7802420001703","Crunchis Queso MP 270 g",29,2600,0,0,0,-1],
["7802420001802","TE Ceylan Excelsior 100 B",29,2600,0,0,0,-1],
["7802420001840","papas caseras crema y ciboulette marco polo 200 g",30,2500,1900.0,6,0,29],
["7802420001864","Caseras Jamon queso Marco Polo",29,3200,0,0,0,-1],
["7802420002182","papas rusticas sal de mar marco polo 185 g",30,2400,2000.0,4,0,29],
["7802420002212","Jenjibre en Polvo 150g",29,700,0,0,0,-1],
["7802420002359","Papas rusticas sabor merken Marco Polo 185g",30,2850,2000.0,12,0,29],
["7802420002502","Sesamo Tostado Marco Polo 30 g",29,1500,0,0,0,-1],
["7802420003486","Salsa de Ajo DJ 100 g",2,800,396.0,5,0,29],
["7802420003509","Salsa de Queso",2,800,396.0,12,0,29],
["7802420003578","salsa marcopolo",29,2400,0,0,0,-1],
["7802420003806","Pop Corn 250 g",30,2400,1876.0,4,0,29],
["7802420003813","Pop corn 140 g MP",29,2200,0,0,0,-1],
["7802420003912","Papas Marcopolo C.Americano 250 g",29,2600,0,0,0,-1],
["7802420003929","Papas Caseras MP 250 g",29,300,0,0,0,-1],
["7802420004278","Crunchis Papa 280 g MP",29,400,0,0,0,-1],
["7802420004285","Papas Rusticas con sal de mar  150 g",29,400,0,0,0,-1],
["7802420004599","aji de color edra 15 g",3,400,187.0,6,0,29],
["7802420004605","ajo en polvo edra 15 g",3,400,187.0,6,0,29],
["7802420004629","Albahaca molida Edra 6 g",3,400,200.0,6,0,29],
["7802420004667","Bicarbonato En polvo Edra 30 g",3,400,187.0,6,0,29],
["7802420004674","Canela Entera Edra 15 g",3,1100,624.0,6,0,29],
["7802420004681","Canela Molida En polvo Edra 15 g",3,700,500.0,6,0,29],
["7802420004704","Ciboullette Edra 2 g",3,600,187.0,0,0,29],
["7802420004711","Clavo de olor Edra",3,500,220.0,6,0,29],
["7802420004735","Comino Edra 15 g",3,600,400.0,12,0,29],
["7802420004773","curry en polvo edra 15 g",29,400,0,0,0,-1],
["7802420004797","Eneldo Edra",3,400,287.0,6,0,29],
["7802420004827","laurel en hojas edra 5 g",29,500,317.0,6,0,-1],
["7802420004834","merken edra",3,400,187.0,0,0,29],
["7802420004858","Nuez Moscada Molida Edra 5g",3,500,220.0,6,0,29],
["7802420004865","Oregano Edra 20 g",3,550,400.0,6,0,29],
["7802420004940","pimienta negra entera edra",29,1990,0,0,0,-1],
["7802420004964","Pimienta Negra Molida Edra 150 g",3,650,200.0,10,0,29],
["7802420005008","Sesamo tostado Edra",3,600,370.0,6,0,29],
["7802420005015","tomillo en hojas frasco edra 18 g",29,1300,0,0,0,-1],
["7802420005046","Papas Rusticas PM 185 g",29,300,0,0,0,-1],
["7802420005268","COMINO ENTERO EDRA 15G",29,2400,0,0,0,-1],
["7802420005275","Comino molido Edra 100 g",29,3490,0,0,0,-1],
["7802420005305","pimenton molido edra 15 g",3,400,187.0,6,0,29],
["7802420005442","Papas MP C.Americano Limon 200 g",29,1990,0,0,0,-1],
["7802420005756","rAMITAS mp QUESO xl 350 GM",29,1500,0,0,0,-1],
["7802420006128","Te Club ceylan premium 50 bol",29,900,0,0,0,-1],
["7802420006296","Papas C. Americano Queso Mant. 200 g",29,400,0,0,0,-1],
["7802420006401","Esencia de Vainilla 155 ml",29,3200,0,0,0,-1],
["7802420006494","coco rallado",2,1200,916.0,3,0,29],
["7802420006524","decoracionsabor chocolate",3,400,187.0,6,0,29],
["7802420006791","Yerba mate Club 500 g",29,300,0,0,0,-1],
["7802420006814","Yerba mate té club",29,600,0,0,0,-1],
["7802420006852","Te Club Canela 20 Un",29,1800,0,0,0,-1],
["7802420006920","Tomillo",29,1700,0,0,0,-1],
["7802420006937","Curcuma Edra",3,600,277.0,6,0,29],
["7802420007163","frutillas enteras",29,1700,0,0,0,-1],
["7802420007293","Cacao Amargo Edra 150 g",2,3200,1820.0,2,0,29],
["7802420007309","Cacao Dulce Edra 200 g",2,1900,1263.0,4,0,29],
["7802420007347","Crunchis mani 230 g",29,3800,0,0,0,-1],
["7802420007378","papas mp corte americano 380g",29,4500,0,0,0,-1],
["7802420007385","papas caseras marco polo 380",30,3500,0,3,0,29],
["7802420007392","Papas Marcopolo corte ameriano 380 gr",30,3700,2870.0,4,0,29],
["7802420007408","Papas MP Lisa XL 520 g",29,1990,0,0,0,-1],
["7802420007484","snaks mix marco polo",30,2900,2180.0,3,0,17],
["7802420007491","papas marco polo caseras 230g",30,1700,1270.0,4,0,29],
["7802420007507","papa marco polo 230g corte americano",30,1900,1500.0,4,0,29],
["7802420007903","salsa de soya edra 155 mal",29,2200,0,0,0,-1],
["7802420008078","Crunchies papa MP",29,1990,0,0,0,-1],
["7802420008092","crunchis suflè de papa marco polo 220 g",29,1990,0,0,0,-1],
["7802420008108","Crunchis PM 220 g",29,1500,0,0,0,-1],
["7802420008115","Crunchis horneados tubos Marco Polo",29,1000,0,0,0,-1],
["7802420008122","crunchis pop",29,1590,0,0,0,-1],
["7802420008290","Mani Sin Sal 250 g",29,1590,0,0,0,-1],
["7802420008429","terra pasas rubias",29,1300,0,0,0,-1],
["7802420008498","Duraznos mitades Esmeralda 425 g",10,1700,1302.0,1,0,29],
["7802420008504","durazno  cubo 425g",10,1490,900.0,10,0,29],
["7802420008627","Te Club 40 bol. azul",2,1000,800.0,12,0,29],
["7802420008672","terra pasas corinto",2,1000,500.0,0,0,29],
["7802420008726","papas marco polo sabor barbecue 200g",29,1600,0,0,0,-1],
["7802420008825","TE Club Ceylan 20 b",2,1000,890.0,12,0,-1],
["7802420009242","ramitas queso marco polo 230gr",30,2200,1353.0,4,0,29],
["7802420009259","Ramitas saladas Marco Polo",30,2200,1353.0,5,0,29],
["7802420009518","mani marco polo",11,1300,869.0,0,0,29],
["7802420010347","sufle de papa marcopolo",30,2200,1308.0,4,0,29],
["7802420110054","ciboulette marco polo 2 g",29,1800,0,0,0,-1],
["7802420110108","Clavo de Olor Molido Marco Polo 5 g",29,1000,0,0,0,-1],
["7802420110276","Perejil Marco Polo 15 g",29,1500,0,0,0,-1],
["7802420116414","Salsa de soya Marco Polo 155 ml",29,600,0,0,0,-1],
["7802420119286","cacao dulce marco polo 200g",29,800,0,0,0,-1],
["7802420119309","cacao amargo marco polo 150g",29,990,0,0,0,-1],
["7802420119323","Coco Rallado Marco Polo 25 g",29,2600,0,0,0,-1],
["7802420124419","Mani sin sal MP 100 g",29,1100,0,0,0,-1],
["7802420124433","mani con pasas marco polo 100 g",29,1290,0,0,0,-1],
["7802420124518","pistachos salados marco polo 80 g",29,1600,0,0,0,-1],
["7802420125416","mani sin sal marco polo 160g",29,1100,0,0,0,-1],
["7802420125423","mani salado marco polo 160g",29,1990,0,0,0,-1],
["7802420125430","Mani con Pasas 18 MP",30,1900,1100.0,10,0,29],
["7802420125492","Mani Japones MP 100 g",30,1100,700.0,10,0,29],
["7802420127038","mani, pasas y almendras marco polo 80 g",29,1600,0,0,0,-1],
["7802420127113","mani salado con miel marco polo 150 g",30,1500,1000.0,12,0,29],
["7802420127687","Ramitas sabor original Marco Polo 250g",29,1000,0,0,0,-1],
["7802420127694","Ramitas sabor queso Marco Polo 250g",29,2990,0,0,0,-1],
["7802420130472","Palitos Coctel Marco Polo 100 un",29,1500,0,0,0,-1],
["7802420130502","Brocheta Marco Polo 50 un",29,2900,0,0,0,-1],
["7802420150104","Papas Caseras Marco Polo 400 g",29,1900,0,0,0,-1],
["7802420151057","Papas fritas caseras Marco Polo 200g",30,2200,1307.0,5,0,-1],
["7802420151378","Papas Corte Americano MP 400 g",29,2200,0,0,0,-1],
["7802420151439","Crunchis Queso 280 g",29,2990,0,0,0,-1],
["7802420151477","Papas fritas corte americano Marco Polo 200g",30,2000,1400.0,6,0,29],
["7802420510113","Palmitos enteros Esmeralda 400 g",10,3600,2467.0,2,0,29],
["7802420510151","Palmitos rodajas Esmeralda",10,2800,1680.0,2,0,29],
["7802420510380","esparragos verdes enteros 425g",29,3490,0,0,0,-1],
["7802420510403","Choclitos Cocktail 425 g",2,3000,2308.0,7,0,29],
["7802420520013","Cacao amargo Copacabana 150g",2,3900,1247.0,1,0,29],
["7802420520020","Cacao Dulce Copacabana 200 g",2,2000,1500.0,3,0,29],
["7802420810060","canela molida marco polo 15g",29,300,0,0,0,-1],
["7802420810107","Comino Entero Marco Polo 15 g",29,500,0,0,0,-1],
["7802420810169","Pimienta Negra Entera 15 g MP",29,400,0,0,0,-1],
["7802420810183","decoracion sabor chocolate gourmet 20g",29,500,0,0,0,-1],
["7802420811388","Eneldo Marco Polo 8 g",29,400,0,0,0,-1],
["7802420811395","Albahaca Marco Polo 6 g",29,400,0,0,0,-1],
["7802420811470","Estragon Marco Polo 5 g",3,500,199.0,6,0,29],
["7802420811487","Romero Marco Polo 10 g",29,790,0,0,0,-1],
["78024533","Uno Soprole Frutilla 80 ml",20,400,280.0,12,0,43],
["78024540","uno al dia bombillin 80g multifruta",29,1300,0,0,0,-1],
["7802500000015","cabellos de angel lucchetti 400g",2,1300,781.0,6,0,25],
["7802500000039","Tallarines 77 Lucchetti 400 g",2,1300,1000.0,8,0,25],
["7802500000046","Tallarines lucchetti 78",2,1300,1000.0,5,0,25],
["7802500000053","Spaghetti 5 Luccetti 400 g",2,1300,1000.0,15,0,25],
["7802500001029","cabellitos lucchetti 400g",2,1100,781.0,6,0,25],
["7802500001050","quifaros luchetti 400 g",2,1300,1000.0,12,0,25],
["7802500001074","canutos lucchetti 400g",2,1300,737.0,8,0,25],
["7802500001081","espirales lucchetti 400g",2,1300,781.0,6,0,25],
["7802500002026","mariposas lucchetti 250g",29,1000,0,0,0,-1],
["7802500004013","Semola Lucchetti 250 g",2,900,647.0,10,0,25],
["7802500016016","Sapaguetti Romano 400 g",29,1900,0,0,0,-1],
["7802500017013","Espirales Romano 400 g",2,800,568.0,3,0,25],
["7802500182315","dedalitos lucheti 250g",2,900,670.0,10,0,25],
["78025059","Pall mall xl boost 20",29,1200,0,0,0,-1],
["78025066","Pall mall Clic Xl sunset 20",29,950,0,0,0,-1],
["7802575000552","caracoquesos carozzi 296g",2,1990,1393.0,3,0,6],
["7802575001030","Cabello de Angel Carozzi 400 g",2,1300,900.0,10,0,6],
["7802575001832","Mostaccioli CArozzi 400 g",29,1200,0,0,0,-1],
["7802575001849","Capellini Carozzi 400 g",29,900,0,0,0,-1],
["7802575002037","Rigatoni Carozzi 400 g",29,1200,0,0,0,-1],
["7802575002235","espirales carozzi 400g",2,1300,750.0,120,0,6],
["7802575002853","fideos ojos de diuca 250 grs",2,900,510.0,6,0,6],
["7802575003249","Alfabeto Carozzi 250 g",2,900,630.0,5,0,6],
["7802575003843","granizo carozzi 250g",2,900,510.0,5,0,6],
["7802575004437","spaghetti del 5 carozzi 400g",2,1200,737.0,15,0,6],
["7802575004635","tallarines carozzi 87 400g",29,900,0,0,0,-1],
["7802575004833","Fettuccine 88 400 g",29,1200,0,0,0,-1],
["7802575006035","corbatas carozzi 400g",29,1700,0,0,0,-1],
["7802575006455","Mariposas Carozzi 250g",2,900,510.0,5,0,6],
["7802575007421","Sémola Carozzi 500g",29,1700,1060.0,10,0,-1],
["7802575007438","Semola Carozzi 250 g",29,1990,0,0,0,-1],
["7802575012197","Dedalitos Carozzi  250 g",2,900,510.0,8,0,6],
["7802575012210","pantrucas carozi 250g",2,900,510.0,20,0,6],
["7802575015563","Caracoquesos Carozzi 70 g",29,1200,0,0,0,-1],
["7802575031051","pasta mix espirales colores 400g",2,1300,833.0,6,0,6],
["7802575031181","cus cus carozzi 250g",29,2690,0,0,0,-1],
["7802575034014","pasta mix 87 espinaca 400g",29,350,0,0,0,-1],
["7802575040206","ravioli pre cocido con carne carozzi 400g",29,350,0,0,0,-1],
["7802575040213","Tortellini Carozzi 400 g",29,350,0,0,0,-1],
["7802575220110","nectar sprim naranja 190 ml",5,350,254.0,12,0,6],
["7802575220127","nectar Sprim durazno 190 ml",5,350,254.0,12,0,6],
["7802575220196","Nectar manzana Sprim 190ml",5,350,254.0,12,0,6],
["7802575220479","nectar vivo cajita 190ml",29,350,0,0,0,-1],
["7802575220493","vivo nectar naranja 190ml",29,220,0,0,0,-1],
["7802575220516","nectar manzana vivo cajita 190 ml",29,220,0,0,0,-1],
["7802575220530","nectar durazno vivo cajita 190 ml",5,400,350.0,100,0,6],
["7802575223401","Sprim durazno 25 g",29,220,0,0,0,-1],
["7802575223418","Sprim frambuesa 25 g",29,220,0,0,0,-1],
["7802575223456","Sprim frutilla 25 g",29,350,0,0,0,-1],
["7802575223500","Sprim melon 25 g",29,1400,0,0,0,-1],
["7802575223524","Sprim naranja 25 g",29,1400,0,0,0,-1],
["7802575226143","Nectar berries Sprim 190ml",5,350,254.0,12,0,6],
["7802575226310","nectar vivo sabor naranja 1L caja",29,1400,0,0,0,-1],
["7802575226334","nectar vivo en caja 1L sabor durazno",5,1400,896.0,12,0,6],
["7802575226358","nectar vivo manzana 1 Litro",5,1400,869.0,12,0,6],
["7802575226419","agua vivo manzana cajita 190 ml",29,500,0,0,0,-1],
["7802575226426","vivo agua pera 190 ml",29,800,0,0,0,-1],
["7802575353047","salsa pomarola italiana 200g",2,700,400.0,100,0,6],
["7802575365026","salsa de tomate san remo italiana 200g",2,500,373.0,24,0,6],
["7802575531728","PUSH MASTER DOG POLLO 100G",29,800,0,0,0,-1],
["7802575532411","GALLETAS CACHUPIN 220G",29,800,0,0,0,-1],
["7802575532640","Master Cat Push 85 g",29,1990,0,0,0,-1],
["7802575532657","Master Cat sobre",29,4500,0,0,0,-1],
["7802575532664","Comida húmeda perro Master dog",22,900,562.0,12,0,6],
["7802575533180","Maste Dog 700 g adultos carne",22,1990,1199.0,6,0,6],
["7802575533456","Cachupin Adulto 2 k carne arroz",22,4500,2000.0,4,0,6],
["7802575533524","Arena Ecologica Master Cat. 2 Kg",22,2900,2200.0,6,0,6],
["7802575534620","master dog cachorro 500g",22,1990,1427.0,12,0,6],
["7802614000024","harina sin polvo don quijote",29,1600,0,0,0,-1],
["7802614000031","harina don quijote con polvo",29,1300,0,0,0,-1],
["7802615005103","Harina Selecta c.polvo 1 k",29,1300,0,0,0,-1],
["7802615005202","harina selectasin polvos",2,1400,1000.0,12,0,6],
["7802615005516","harina mont blanc con p0olvios de hornear",2,1300,737.0,5,0,24],
["7802615005615","harina mont blanc sin polvos de hornear 1 kilo",2,1300,793.0,11,0,24],
["7802615006551","Arroz Miraflores G1 1 K",2,2600,1200.0,6,0,24],
["7802615006568","Arroa Miraflores preg. 1 k",2,2600,1801.0,10,0,6],
["7802635000652","ColaCao Instantaneo 180 g",2,1300,1077.0,6,0,29],
["7802640000142","Ají en salsa JB",29,5900,0,0,0,-1],
["7802640600090","Ketchup JB 100g",29,700,400.0,10,0,-1],
["7802640793563","Maizena Dropa 100 g",29,2400,0,0,0,-1],
["7802710566240","Charlot Sahne-Nuss Savory  1 L",19,5600,4250.0,6,0,40],
["7802715000015","casata panda 1L trisabor",29,3000,2400.0,6,0,-1],
["7802715000602","Cassata Panda Tri sabor 1 Lt.",19,3000,1885.0,12,0,42],
["7802715000657","Casata Tri Fusion Panda 2.5 lt",29,2000,0,0,0,-1],
["7802715000695","casata panda mora crema",29,2400,0,0,0,-1],
["7802715000701","Casata Sabor chirimoya alegre Panda 1L",29,2400,0,0,0,-1],
["7802715071015","Cassata Lucuma Panda 1 Lt.",29,2200,0,0,0,-1],
["7802715071053","casata panda 1 litro",29,2700,0,0,0,-1],
["7802715460314","cono frutilla vainilla 71g",29,450,0,0,0,-1],
["7802800500635","Café Gold 50g",1,2400,1900.0,12,0,-1],
["7802800501830","Gold Decaf 50 g",29,2700,2100.0,8,0,-1],
["7802800503728","Choca Moca Gold 15 g",2,500,307.0,0,0,25],
["7802800503742","Vainilla Late Gold",2,500,302.0,0,0,25],
["7802800503759","Caramel Late Gold",29,1990,0,0,0,-1],
["7802800512010","Coronado",2,2400,1680.0,6,0,25],
["7802800533565","kriyzpo original 130g",30,2000,1500.0,12,0,25],
["7802800533572","Papas Krispo 130 g",30,2000,1500.0,8,0,25],
["7802800533589","papa kryzpo crema cebolla",30,2000,1500.0,12,0,25],
["7802800533800","Krispo 110 g sal de mar",30,2200,1540.0,10,0,25],
["7802800533817","Krispo 110 g Chedar",29,700,0,0,0,-1],
["7802800535569","krispo sabor original 37g",30,950,701.0,12,0,25],
["7802800535576","krispo sabor queso 37g",30,900,648.0,12,0,25],
["7802800535583","papas kryspo sabor crema sebolla 37g",30,900,648.0,12,0,25],
["7802800535590","krizpo sabor pizza",29,1800,0,0,0,-1],
["7802800535910","Kryzpo sabor merken 130g",29,1800,0,0,0,-1],
["7802800556120","muibon",8,700,500.0,12,0,25],
["7802800556724","muibon bols nut 120g",30,1800,1110.0,6,0,31],
["7802800556731","muibon bols crocante 120g",30,1800,1110.0,4,0,25],
["7802800563012","crema chantilli van cook 60g polvo",2,990,490.0,12,0,24],
["7802800566464","Jalea frambuesa Zuco 35g",29,350,0,0,0,-1],
["7802800566471","Jalea naranja zuco 35g",29,350,0,0,0,-1],
["7802800570881","zuko de manzana",29,350,0,0,0,-1],
["7802800575213","nectar zuko 200ml naranja",2,350,198.0,6,0,25],
["7802800575237","nectar zuko 200ml durazno",2,350,198.0,6,0,25],
["7802800575022","nectar zuko 200ml manzana",2,350,198.0,6,0,25],
["7802800576418","jugos livean 7g",2,250,149.0,30,0,25],
["7802800576692","jugo livean de pera",29,220,0,0,0,-1],
["7802800579518","Zuko Naranja",2,250,149.0,30,0,25],
["7802800579600","Zuko Melon sin azucar",29,400,0,0,0,-1],
["7802800709601","livean compota manzana 9g",2,600,400.0,6,0,25],
["7802800709625","livean compota durazno 90g",29,400,0,0,0,-1],
["7802810006325","nectar watts sabor durazno 200ml",2,400,226.0,6,0,5],
["7802810006592","nectar watts sabor manzana 200ml",5,2000,1570.0,12,0,5],
["7802810006752","nectar watts sabor naranja 200ml",2,400,226.0,6,0,5],
["7802810006837","Manteca Astra 200 g",29,2690,0,0,0,-1],
["7802810006844","manteca astra 100 g",20,1200,680.0,6,0,24],
["7802810006868","Manteca Palmín 100g",2,1200,750.0,12,0,24],
["7802810012029","Aceite Belmont 1 Lt",29,1490,0,0,0,-1],
["7802810031013","mermelada watts sabor damasco 250g",29,1490,0,0,0,-1],
["7802810031020","mermelada watts durazno",2,1500,783.0,12,0,24],
["7802810031037","mermelada watts sabor mora 250g",29,1490,0,0,0,-1],
["7802810031044","mermelada watts de alcayota",2,1500,783.0,13,0,24],
["7802810031051","Mermelada Watts Ciruela 250 g",29,650,0,0,0,-1],
["7802810031075","mermelada watts sabor frutilla 250g",2,1500,793.0,10,0,24],
["7802810031082","Mermelada Watts. Frambuesa 250 g",29,650,0,0,0,-1],
["7802810031112","MERMELADA DE DAMASCO LOS LAGOS",29,650,0,0,0,-1],
["7802810031129","mermelada de durazno los lagos 250g",29,1200,0,0,0,-1],
["7802810031136","mermelada de mora los lagos 250g",29,600,0,0,0,-1],
["7802810031174","mermelada de frutilla los lagos 250g",29,600,0,0,0,-1],
["7802810034045","dulce de membrillo 250g whatts",2,1100,970.0,12,0,21],
["78028104","compota mix manzana frutilla arandanos ciruela soprole",29,1700,0,0,0,-1],
["78028111","compota mix de manzana y platano soprole",29,1000,0,0,0,-1],
["7802820000030","nectar andina del valle damasco 1.5 litros",5,1900,1365.0,12,0,9],
["7802820001082","Nectar ADV Multi-frutilla",5,1900,1365.0,12,0,9],
["7802820020953","Mineral Vital Gasificada 1.6 Lt Desechable",5,1300,760.0,36,0,9],
["7802820021950","Mineral Vital Sin gas 1.6 Lt",5,1300,900.0,24,0,9],
["7802820175011","nectar andina del valle naranja 1.5 liros",5,1900,1365.0,12,0,9],
["7802820175035","nectar andina del valle durazno 1.75 litros",5,1900,1365.0,12,0,9],
["7802820175080","nnectar andina del valle manzana 1.75 litros",29,300,0,0,0,-1],
["7802820175202","nectar andina del vlle multi frutilla 1.75 litros",5,1900,1365.0,12,0,9],
["7802820250268","KAPO SABOR FRAMBUESA 252ML",5,400,290.0,24,0,9],
["7802820442137","benedictino frutilla1500ml",29,1500,0,0,0,-1],
["7802820443301","agua benedictino sin gas 3.0 litros",5,1600,1000.0,18,0,9],
["7802820443356","agua benedictino con gas 3.0 litros",29,1600,1100.0,12,0,-1],
["7802820452129","agua benedictino sin gas manzana 1.5 litro",29,1600,0,0,0,-1],
["7802820452204","agua benedictino sin gas pera 1.5 litros",29,1600,0,0,0,-1],
["7802820452280","agua benedictino sin gas limonada genjibre 1.5 litros",29,700,0,0,0,-1],
["7802820452365","agua benedictino sin gas pomelo 1.5 litros",29,1300,0,0,0,-1],
["7802820454208","Benedictino Pera",5,1600,949.0,6,0,9],
["7802820500011","Nectar ADV vidrio durazno 300 ml",29,600,0,0,0,-1],
["7802820500097","Nectar ADV Durazno 1 Lt",29,1900,1365.0,10,0,-1],
["7802820559002","Nectar ADV kiwo 1.5 Lt",5,1900,1365.0,12,0,9],
["7802820600209","Mineral Vital 600ml sin gas",29,1200,0,0,0,-1],
["7802820650013","BENEDICTINO AGUA 6.5L NATURAL",5,2800,2105.0,20,0,9],
["7802820651003","Powerade naranja",5,1800,1141.0,6,0,9],
["7802820651157","powerade azul 600 ml",29,1500,0,0,0,-1],
["7802820678031","Power Ade Uva 1.1 Lt. Zero Cal",5,1900,1400.0,12,0,9],
["7802820678048","Power Ade Frozen B 1.1 Lt.",5,1900,1141.0,15,0,9],
["7802820678055","Powe Ade Rojo 1.1",5,1900,1141.0,15,0,9],
["7802820678062","Power Ade Naranja 1.1 Lt.",5,1900,1400.0,12,0,9],
["7802820700091","andina naranja 200 ml",5,400,300.0,20,0,9],
["7802820701210","Powerade rojo 1 Lt.",5,1800,1141.0,6,0,9],
["7802820774108","Fastile coco limon 625ml",5,2000,1223.0,10,0,9],
["7802820774115","FASTLYTE FRUTILLA 625ML",5,1700,1223.0,10,0,9],
["7802820774122","FASTLYTE SANDIA 625ML",5,2000,1223.0,10,0,9],
["7802820774139","Fastlyte una 625 ml",5,2000,1223.0,10,0,9],
["7802820851021","Powerade Frezen blast 1 Lt",29,700,0,0,0,-1],
["7802820851052","Pwerade naranja 1 Lt",29,700,0,0,0,-1],
["7802900000301","yogurt soprole batifrut",20,800,590.0,12,0,43],
["7802900000325","BATIFRUT MORA SOPROLE 165",20,700,500.0,10,0,43],
["7802900000332","BATIFRUT DURAZNO SOPROLE 165G",29,650,0,0,0,-1],
["7802900000356","yogurt gold tradicional 165 g",20,800,619.0,10,0,43],
["7802900000370","yogurt gold lucuma nuez soprole 165g",29,790,500.0,20,0,-1],
["7802900000943","Soprole con trozos frutilla sin azucar 155 g",20,800,420.0,12,0,43],
["7802900000950","Yogurt soprole trozos Sin azucar papaya",20,700,535.0,6,0,43],
["7802900000967","yogurth soprole sin azucar trozos chia 155g",20,800,500.0,6,0,43],
["7802900001230","queso crema soprole 100 g",20,990,560.0,12,0,43],
["7802900001261","Queso Crema Soprole 200 g",20,1850,1120.0,12,0,38],
["7802900001292","leche semidescremada 1L",20,1600,1100.0,5,0,43],
["7802900001308","LECHE ENTERA SOPROLE NATURAL 1L",20,1600,1100.0,11,0,43],
["7802900001346","LECHE NATURAL DESCREMADA SOPROLE 1L",20,1700,1100.0,8,0,43],
["7802900001407","yogurt protein + soprole 155 g",20,800,609.0,12,0,43],
["7802900001421","Leche + Protein con cacao 1 Lt.",20,2300,1380.0,6,0,43],
["7802900001704","yogurt protein+ maracuya",20,800,500.0,12,0,43],
["7802900001810","margarina soprole mix 500grs",29,750,0,0,0,-1],
["7802900001889","Gold zero lacto 155 g",29,600,0,0,0,-1],
["7802900001896","Zerolacto Batifrut Frutilla 155g",20,690,300.0,6,0,43],
["7802900001926","protein trozos de fruta soprole",29,750,500.0,20,0,-1],
["7802900002022","Protein soprole chirimolla 155 g",20,800,609.0,6,0,10],
["7802900002091","Mantequilla Receta de campo 250 g",29,590,0,0,0,-1],
["7802900002176","Yogurt Soprole sin azucar con trozos 155 g",29,400,0,0,0,-1],
["7802900002220","yogurt del 1+1 soprole 155 g",20,650,500.0,12,0,43],
["7802900002268","Leche Soprole UHT 200 ml",20,550,419.0,12,0,43],
["7802900002336","flan postres la abuela 120g",29,750,0,0,0,-1],
["7802900002381","Leche + Protein semi sin Lactosa 1 lT",20,1800,1380.0,6,0,43],
["7802900002398","Gold Panna Cotta",29,750,0,0,0,-1],
["7802900002435","arroz con leche postres la abuela soprole",29,750,0,0,0,-1],
["7802900002619","Protein + soprole",29,600,0,0,0,-1],
["7802900002664","1+1 Requete Patitas soprole",29,600,0,0,0,-1],
["7802900002671","yogurt 1+1 mini pillous",20,850,600.0,12,0,43],
["7802900002947","postre de la abuela sabor bocado",29,590,0,0,0,-1],
["7802900002954","postres de la abuela bocado salsa frambuesa",29,700,0,0,0,-1],
["7802900003029","leche gold con choco sin lactosa",29,650,0,0,0,-1],
["7802900003036","leche gold capupuccino",29,790,0,0,0,-1],
["7802900003456","yogurt gold semillas",29,790,0,0,0,-1],
["7802900003494","leche bombillin soprole cookies and cream 200ml",29,2950,0,0,0,-1],
["7802900003562","blanjarate soprole",20,850,481.0,12,0,43],
["7802900003579","lucumate soprole 80g",29,650,0,0,0,-1],
["7802900003913","Margarina Soprole",29,750,0,0,0,-1],
["7802900003975","leche avena uht sopr 200 ml",20,650,368.0,12,0,43],
["7802900004040","Yogurt soprole sin azucar frutod del bosque",20,750,449.0,6,0,-1],
["7802900022143","semola soprole 140 g",20,800,500.0,12,0,43],
["7802900026622","Mantequilla untable Soprole 200 gr",20,3900,2150.0,12,0,43],
["7802900028374","leche chocolate soprole",20,1900,1500.0,24,0,21],
["7802900028473","leche chocolate soprole cajita 200 ml",20,550,400.0,22,0,43],
["7802900048013","Leche Soprole Zero Lacto 1 Lt",20,1800,1100.0,12,0,43],
["7802900050023","leche soprole 1L sabor frutilla",20,1900,1250.0,6,0,43],
["7802900050078","LECHE SOPROLE DE CHOCOLATE CON CACAO 1L",20,1900,1260.0,8,0,43],
["7802900056025","leche uht frutilla sop 200 ml",20,590,490.0,6,0,43],
["7802900056070","leche bombillin chocolate soprole 200ml",20,690,455.0,12,0,43],
["7802900097011","Crema chantilly lista para servir soprole 250g",20,4390,2551.0,6,0,43],
["7802900105013","crema espesa soprole 200 g",20,1600,1206.0,12,0,43],
["7802900107017","crema de leche para batir y cocinar 1 litro",20,5490,4300.0,3,0,43],
["7802900120016","mantequilla con sal soprole 125 g",20,1600,1020.0,6,0,43],
["7802900120214","postre creme caramel gold 120 g",29,3500,0,0,0,-1],
["7802900120276","postre Gold dolce pistacho",29,500,0,0,0,-1],
["7802900120283","panna cotta frmbuez gold 120 g",29,2000,0,0,0,-1],
["7802900121013","mantequilla soprole 250g",20,3200,2800.0,12,0,43],
["7802900130114","yogurt natural soprole 155 g",20,590,283.0,6,0,43],
["7802900165000","quesillo soprole 300 g",29,1800,0,0,0,-1],
["7802900170301","Leche Cultivada Soprole chirimolla 1 Lt",29,800,0,0,0,-1],
["7802900195076","Leche Soprole Zero Lacto 1 Lt",20,1900,1600.0,12,0,43],
["7802900200817","leche deslactosada ZERO LACTO SOPROLE semidescremada 1L",20,1800,1300.0,4,0,43],
["7802900202019","postres de la abuela leche asada soprole 120 g",29,800,0,0,0,-1],
["7802900220044","semola sabor damasco soprole",29,800,500.0,10,0,-1],
["7802900220082","semola soprole frambuesa",29,800,500.0,10,0,-1],
["7802900221010","arroz con leche soprole 130 g",20,900,600.0,12,0,48],
["7802900228170","1+1 mini cookies",20,800,600.0,12,0,43],
["7802900230227","yoguito soprole sabor frutilla 120g",20,350,200.0,12,0,43],
["7802900230241","yoghito soprole sabor damasco 120g",20,350,250.0,12,0,43],
["7802900230258","yoghito sabor vainilla",20,300,170.0,12,0,43],
["7802900230289","yoghurt yoghito soprole 120g",20,350,250.0,100,0,43],
["7802900230913","yogurt americano soprole 155 g",29,400,0,0,0,-1],
["7802900231828","yogurt griego con trozos soprole 110 g",29,400,0,0,0,-1],
["7802900234218","Soprole Durazno batido 120 g",20,400,226.0,6,0,43],
["7802900234225","Soprole batido frutilla sin azuca 120 g",20,400,226.0,6,0,43],
["7802900234256","Soprole batido sin azucar bainilla 120 g",20,400,226.0,6,0,43],
["7802900235222","Yogurt Zerolacto frutilla",29,550,0,0,0,-1],
["7802900235253","Yogurt Soprole Zero Lacto",29,500,0,0,0,-1],
["7802900239527","Yoguito tetra Soprole frutilla 115 g",20,550,385.0,18,0,43],
["7802900239558","Yoguiti tetra Soprole vainilla 115 g",20,550,385.0,12,0,43],
["7802900257057","flan vainilla soprole 120 g",29,390,0,0,0,-1],
["7802900257149","flan soprole 120 g",29,400,0,0,0,-1],
["7802900295066","Jalea Soprole naranja 110 g",29,400,0,0,0,-1],
["7802900295035","Jalea Soprole 110 g",2,400,226.0,6,0,43],
["7802900295103","Jalea Soprole guimda 110 g",29,750,0,0,0,-1],
["7802900295134","jalea soprole splash funny apple",29,2800,0,0,0,-1],
["7802900332402","1+1 Soprole 140G",20,790,559.0,123,0,43],
["7802900332419","1+1 Soprole choco 140 g",20,900,624.0,12,0,43],
["7802900345020","Leche cultivada Soptole 1 L",20,2600,1760.0,6,0,43],
["7802900345082","Leche Cultivada Soprole 1 Lt. frutilla",29,2200,0,0,0,-1],
["7802900345303","Leche cultivada Soprole 1 L chirimolla",20,2600,2000.0,6,0,43],
["7802900365028","yogurt batido frutilla soprole en bolsa 1 litro",29,2400,1900.0,4,0,-1],
["7802900365042","yogurt batido damasco soprole en bolsa 1 litro",29,2200,1800.0,6,0,-1],
["7802900365059","yoghurt soprole vainilla 1L",29,2400,1800.0,8,0,-1],
["7802900401016","manjarate soprole 80 g",20,900,481.0,12,0,43],
["7802900410018","Manjar Soprole 400 gpote",29,350,0,0,0,-1],
["7802900413019","dulce de leche soprole 1kilo",29,300,0,0,0,-1],
["7802900414016","Dulce de leche Soprole 500 g",20,2600,1474.0,6,0,21],
["7802900481063","nectar soprole naranja cajita 200 ml",29,800,0,0,0,-1],
["7802900481131","Nectar Soprole durazno 200 ml",29,1500,0,0,0,-1],
["7802900481162","necar manzana soprole cajita 200 ml",29,2950,0,0,0,-1],
["7802900600006","margarina soprole 125 g",20,700,453.0,6,0,21],
["7802900605001","margarina soprole 250 g",20,1490,850.0,10,0,43],
["7802900617011","margarina soprole pote 500 g",20,2990,2300.0,6,0,43],
["7802900619022","margarina next 250",20,1500,793.0,6,0,43],
["7802900638016","margarina mix soprole pote 500 g",20,4600,3150.0,6,0,43],
["7802900639013","margarina next soprole 500 g",20,3000,1701.0,6,0,43],
["7802910007284","LECHE ENTERA LONCO LECHE 500ML",29,2600,0,0,0,-1],
["7802920000435","Mi crema para batir Colun 1 Lt",20,6490,4591.0,5,0,21],
["7802920000718","quesillo colun",20,1350,900.0,6,0,43],
["7802920000749","Quesillo Colun x 2",29,2900,2000.0,6,0,-1],
["7802920005782","leche con platano colum 200 ml",20,690,400.0,6,0,43],
["7802920005829","queso cheddar 160g",29,1750,0,0,0,-1],
["7802920005836","Queso Cheddar 160 g",29,3500,0,0,0,-1],
["7802920106106","leche vainilla 200 ml",20,650,368.0,6,0,43],
["7802920202105","mantequilla colun con sal 125g",29,1800,1300.0,10,0,-1],
["7802920203300","MATEQUILLA COLUN 250G CON SAL",29,3500,3000.0,10,0,-1],
["7802920423609","queso rallado reginato colun 40g",2,1200,670.0,45,0,43],
["7802920460208","queso crema 200g",40,1900,1500.0,12,0,43],
["7802920463100","queso crema 100g",29,1500,0,0,0,-1],
["7802920465104","queso crema salame",29,450,0,0,0,-1],
["7802920777283","crema para batir colun cajita 200 ml",20,1490,1000.0,10,0,48],
["7802920777542","Leche Entera Colun 1 Lt",20,1500,1280.0,24,0,43],
["7802920801858","leche colun cajita 200 ml",20,690,500.0,6,0,-1],
["7802930000142","Mantequila en pan con sal Quillayes 250g",20,3500,2391.0,10,0,8],
["7802930000333","queso rallado parmesano quillayes 40 g",2,1100,640.0,20,0,8],
["7802930000531","mantequilla quillayes con sal 125 g",2,1650,1155.0,10,0,8],
["7802930001323","Queso gauda Quillayes 150g",20,2200,1620.0,24,0,8],
["7802930001453","Queso chanco Quillayes 150g",29,2600,1600.0,12,0,-1],
["7802930002580","crema chantilly quillayes 250 g",29,2490,0,0,0,-1],
["7802930002610","Crema chantilly sin lactosa Quillayes 250g",29,2990,0,0,0,-1],
["7802930003822","Queso Chanco Quillayes 250 g",20,2600,3190.0,12,0,42],
["7802930004188","Mantequilla sin lactosa Quillalles 200 g",20,3590,2310.0,5,0,8],
["7802930004386","queso mozzarella",29,800,0,0,0,-1],
["7802930004560","crema chantilly quilllayes light 250 g",29,2800,0,0,0,-1],
["7802930004720","crema chantilly chocolate 250g",29,5900,0,0,0,-1],
["7802930005406","Queso crema sabor natural Quillayes 100g",29,4600,0,0,0,-1],
["7802950002119","Nescafe tradicion 50 g",2,3290,2603.0,11,0,31],
["7802950002126","Nescafe Tradicion Nestle",2,8390,6290.0,28,0,31],
["7802950002133","nescafé tradición 100g",29,2850,0,0,0,-1],
["7802950002256","crema de mariscos maggi 76 g",29,11490,0,0,0,-1],
["7802950002317","Ecco Nestle 100 g",29,2200,0,0,0,-1],
["7802950002324","Ecco Nestle170 g",2,3990,2980.0,10,0,31],
["7802950002720","Nescafe tradicion 400 g",29,2200,0,0,0,-1],
["7802950003543","picado carne fideos y veduras nestle 215 g",39,2300,1650.0,12,0,31],
["7802950003550","picado pollo y verduras nestle naturnes 215 g",2,2300,1700.0,24,0,31],
["7802950003642","picado carne papas",29,4900,0,0,0,-1],
["7802950004427","base pescado frito maggi 85 g",23,990,726.0,6,0,-1],
["7802950004571","crema de choclo maggi 79 g",29,300,0,0,0,-1],
["7802950004892","manjar nestle 1 kilo",2,4990,3136.0,12,0,31],
["7802950005028","polvo de hornear imperial tarro",2,2400,1445.0,5,0,31],
["7802950005110","polvo de hornear imperial 20g",2,300,170.0,30,0,31],
["7802950005264","Nesquik UHT 200 ml",29,650,0,0,0,-1],
["7802950005677","leche nesquik frutilla cajita 200 ml",29,650,0,0,0,-1],
["7802950006124","Pure de papas Maggi 1 k",29,1290,0,0,0,-1],
["7802950006209","Leche milo 200 ml",20,650,455.0,12,0,30],
["7802950006575","base hamburguesas  maggi 90 g",29,800,0,0,0,-1],
["7802950006612","sopa pollo con fideos maggi 70 g",51,800,431.0,12,0,31],
["7802950006629","sopa de pollo con arroz maggi 70 g",51,800,431.0,12,0,31],
["7802950006636","sopas maggi 70g",29,800,690.0,10,0,-1],
["7802950006735","crema de esparragos maggi 68 g",2,990,726.0,8,0,31],
["7802950006766","Crema pollo Maggi 72 g",29,1200,0,0,0,-1],
["7802950006827","Pure de papas Maggi 250 g",29,800,0,0,0,-1],
["7802950006865","Pure de papas maggi 125 g",2,1500,850.0,1,0,31],
["7802950008715","ecco nestle 50g",29,1100,0,0,0,-1],
["7802950008814","sopa de pollo con semola maggi 68 g",2,800,453.0,6,0,31],
["7802950008821","sopa carne con semoloa maggi 68 g",29,1190,0,0,0,-1],
["7802950009408","manjar nestle 200grs",2,1200,726.0,6,0,31],
["7802950009415","manjar nestle 500grs",2,2600,1813.0,5,0,31],
["7802950012316","carne con salsa de tomate en lata tuco 245g",29,300,0,0,0,-1],
["7802950022308","crema de leche nestle 1 litro",29,300,0,0,0,-1],
["7802950022322","crema de leche nestlé cajita 200 ml",20,1490,844.0,12,0,30],
["7802950072358","sahne-nuss 14grs",8,400,250.0,20,0,31],
["7802950072679","Trencito impulsivo 14 g",8,400,250.0,30,0,31],
["7802950088823","Mini Kuky 40 g",29,500,0,0,0,-1],
["7802950572452","Chandelle manjar nestle 130 g",20,890,665.0,10,0,30],
["7803000000475","levadura en ppolvo 10g",2,300,170.0,11,0,24],
["7803010000311","levadura fresca collico 38g",29,1900,0,0,0,-1],
["7803010031056","LEVADURA SECA COLLICO 125G",29,2690,0,0,0,-1],
["78030275","costa rama 40 grs",29,4900,0,0,0,-1],
["7803110000242","arroz pre graneado 1 kilo",2,1900,1077.0,3,0,24],
["7803140000007","manteca panadera la estampa 1 kilo",20,2990,2291.0,6,0,24],
["7803180720200","casata madel 2.5l choco suizo y frutos del bosque",29,500,0,0,0,-1],
["7803200804156","Mayp helmanns 744 g",29,500,0,0,0,-1],
["7803200804378","Mayo Hellmanns 186 g",2,1300,700.0,12,0,-1],
["7803400000105","Alfajor clasico lagos del sur",29,2200,0,0,0,-1],
["7803400000204","Alfajor Bramdy 45 g",29,500,300.0,10,0,-1],
["7803403000188","Tortilla Tia Rosa Fiesta 600 g",29,600,0,0,0,-1],
["7803403000195","Tortilla Burrera Tia Rosa 400 g",2,2600,1923.0,10,0,19],
["7803403000331","Rapiditas Tortilla clasica Ideal",2,1500,1154.0,6,0,19],
["7803403000737","Laguito  70 g Lag d sur",30,700,452.0,12,0,19],
["7803403001055","Mil Hojas Agua Piedra 80 g",29,2800,0,0,0,-1],
["7803403001895","tortilla tia rosa integral 260g",29,2900,0,0,0,-1],
["7803403002212","Pan Rallado Ideal 250 g",25,1500,1050.0,1,0,19],
["7803403002229","Pan Blanco Ideal 560 g",29,1990,0,0,0,-1],
["7803403002243","Pan integral ideal mediano 580g",29,2000,0,0,0,-1],
["7803403002304","tortilla tia rosa grandota 620g",25,3300,2600.0,12,0,19],
["7803403002502","Pizza Piedra 2p 270g",29,1000,0,0,0,-1],
["7803403002540","PAn Blanco Ideal 380 g",29,1000,0,0,0,-1],
["7803403002632","Pan Completo XL 528 g",21,2000,1430.0,4,0,19],
["7803403003011","Pan Pita Ideal Arabe 215 g",29,4000,0,0,0,-1],
["7803403003028","Pan Pita Ideal tipo Arabe",29,1800,0,0,0,-1],
["7803403003042","Pan Artesano Integral Ideal 600g",29,2000,0,0,0,-1],
["7803403003059","Pan de ascua Agua Piedra 500 g",29,3000,0,0,0,-1],
["7803403003066","Pan artesano Ideal  450g",29,3000,0,0,0,-1],
["7803403003158","Pan Ideal HotDog 8 un 480g",29,3200,0,0,0,-1],
["7803403003233","Pan Ideal Cero Cero 580 g",29,2800,0,0,0,-1],
["7803403003240","Pan Integral Cero Cero 580 g",29,1500,0,0,0,-1],
["7803403003257","Pan de molde Ideal 740g",29,1600,0,0,0,-1],
["7803403003271","Pan Blanco Ideal 550 g",29,1600,0,0,0,-1],
["7803403003288","Pan Blanco Ideal 350 g",29,1600,0,0,0,-1],
["7803403003295","Queque Limon Agua p.",29,1400,0,0,0,-1],
["7803403003301","Queque Chocolate Agua P 225  g",29,600,0,0,0,-1],
["7803403003325","pan integral",29,1500,0,0,0,-1],
["7803403003363","pan pita integral 215g",29,1500,0,0,0,-1],
["7803403003370","Black Jack 38gMarinela",29,3300,0,0,0,-1],
["7803403003424","Rapidita Linaza 200 gr.",29,1900,0,0,0,-1],
["7803403003431","Rapiditas tomate ideal 200 g",29,1900,0,0,0,-1],
["7803403003493","Pan de Pascua Cena 450 g",29,1500,0,0,0,-1],
["7803403003622","Pan Cena Blanco 500g",29,1600,0,0,0,-1],
["7803403003639","Pan Cena Fibra 500 g",29,1600,0,0,0,-1],
["7803403003646","Prepizza rectangular 315 g",29,800,0,0,0,-1],
["7803403003684","Queque vainilla Agua de piedra 225g",13,1600,1000.0,3,0,19],
["7803403003721","HAMBURGESA XL 4 PIEZAS",29,2200,0,0,0,-1],
["7803403003769","Magdalenas AP 100 g",29,800,0,0,0,-1],
["7803403003776","Magdalenas x 2 AP",29,2600,0,0,0,-1],
["7803403003790","Fajitas Tia Rosa 259 g",29,1900,0,0,0,-1],
["7803403003868","Pinüino de chocolate 80 g",30,1000,770.0,12,0,19],
["7803403232114","Prepizza 1metro 750 g Ideal",25,2600,1820.0,6,0,19],
["7803403236341","Pre Pizza Idea x2  500 g",29,2000,1490.0,6,0,-1],
["7803468001489","kingsbury el pan perfecto 600g",29,2200,0,0,0,-1],
["7803468001779","pan castano duo xl 760g",29,1400,0,0,0,-1],
["7803468001946","crocata pan tipo italiano",25,1500,950.0,6,0,7],
["7803473000767","Pan pita Ideal  344 g",29,600,0,0,0,-1],
["7803473001481","Galleton Agua Piedra Miel 070 g",29,2700,0,0,0,-1],
["7803473001603","prepizza toques de cebolla 500g ideal",29,1900,0,0,0,-1],
["7803473002020","Alfi 3 un 60 g Marinela",30,700,540.0,12,0,19],
["7803473002143","Milojas Agua Piedra 280 g",13,2900,2080.0,3,0,19],
["7803473002242","Tortilla Mejicana mediana 10 u 320 g",30,1900,1490.0,3,0,19],
["7803473002662","Pan de molde Ideal 750g",29,1000,0,0,0,-1],
["7803473003102","Tkch 44 g Marinela",30,700,453.0,14,0,19],
["7803473003232","Rayita 2 un 60 g Marinela",30,800,453.0,12,0,19],
["7803473003461","Pinguino 3 un 120 g Marinela",29,800,0,0,0,-1],
["7803473003522","Megarollo 50 g Marinela",30,700,430.0,15,0,19],
["7803473004376","Mankeke un 120 g Marinela",30,1000,700.0,12,0,19],
["7803473005854","magdalenas agua piedra",30,1000,550.0,6,0,19],
["7803473005878","pinguino 160 g",29,5200,0,0,0,-1],
["7803473005885","manqueque 120g",29,1500,0,0,0,-1],
["7803473215253","Pan Hamburguesa Ideal 8 pzas",25,2750,1892.0,6,0,19],
["7803473242211","Pan de Pascua Ideal  700 g",13,5500,3000.0,6,0,19],
["7803473542182","Pinguino x2 marinela",30,1000,700.0,12,0,19],
["7803473543189","Gansito 50 g Marinela",30,800,540.0,12,0,19],
["7803473612229","Alfi x 2 marinela",29,2800,0,0,0,-1],
["7803480001078","Pan Multigrano 380 g Fusch",29,3100,0,0,0,-1],
["7803480001092","Pan Linaza Chia 380 g Fuchs",29,5200,0,0,0,-1],
["7803480001214","pan hamburguesa fush 650 g",25,2800,1300.0,4,0,19],
["7803480020079","Pan integral Fuchs 650 g",29,3100,2600.0,4,0,-1],
["7803495000882","Brazo de reina Choc. 450 g",29,6600,5060.0,4,0,-1],
["7803495001131","Brazo de Reina Fram-Choc 450 g",29,6400,4883.0,4,0,-1],
["7803495001148","Brazo de Reina Mango-maracuya 450 g",29,7200,5432.0,4,0,-1],
["7803495003890","marraqueta pre horneada la selecta 8u",25,2800,2009.0,2,0,22],
["7803495003906","hallulla pre horneada la selecta  8u",25,2700,2100.0,4,0,22],
["7803504404106","Paltomiel adulto 200 ml",24,4690,2990.0,6,0,14],
["7803504404113","Paltomiel infantil 125 ml",29,4690,4000.0,6,0,-1],
["7803525000240","Brownie Original  62 g Nutra B",30,800,420.0,12,0,19],
["7803525000356","braunichoc nutra bien 35 g",13,500,250.0,12,0,19],
["7803525000769","Galleta ChocoChips NT 75 g",29,700,0,0,0,-1],
["7803525001001","Queque brownie sin azucar 250 g",29,700,0,0,0,-1],
["7803525001018","Queque Zanahoria",29,600,0,0,0,-1],
["7803525001025","Mufin Zanahoria 100 g",29,500,0,0,0,-1],
["7803525001049","Muffin Selva Negra 100 g",29,2300,0,0,0,-1],
["7803525001209","Brownie Fudge 50 g Nutra B",29,700,0,0,0,-1],
["780352500356","braunichoc nutrabien 35g",29,450,0,0,0,-1],
["7803525400422","Pan de Pascua Nutra Bien 500 g",2,5200,3000.0,4,0,19],
["7803525400446","Queque Marmol Nutra B 70 g",30,700,420.0,12,0,19],
["7803525999070","Galletas avena y manzana Nutra Bien 50 g",29,700,0,0,0,-1],
["7803525999087","Galletas Avena Chocolate Nutra Bien",29,2200,0,0,0,-1],
["7803525999544","Brownie Chips 62 g Nutra B",30,800,517.0,12,0,19],
["7803525999667","Brownie sin azucar 50 g Nutra B",30,800,600.0,50,0,19],
["7803525999674","Queque Naranja Chips 250 g",2,2200,1500.0,5,0,19],
["7803525999681","Queque Brownie 250 g",2,2200,1500.0,5,0,19],
["7803525999704","Queque Marmol 250",2,2200,1500.0,5,0,19],
["7803525999933","Galletón chips chocolate Nutra bien 40g",30,600,388.0,8,0,19],
["7803525999957","Galletón con almendras Nutra bien 40g",30,600,390.0,8,0,19],
["7803525999964","Galleton avena-manzana Nutra Bien",30,600,399.0,20,0,19],
["7803525999971","Galleton Avena Pasas Nutra Bien 40 g",30,600,388.0,12,0,19],
["7803600000813","biosal 400 g",29,550,0,0,0,-1],
["7803600011246","sal venus",29,1200,0,0,0,-1],
["7803600031275","sal fina lobos",2,750,450.0,12,0,24],
["7803600981587","sal sirena 1 kilo",29,1300,0,0,0,-1],
["78037830","Mentolatum",29,1300,700.0,6,0,-1],
["7803905000471","Aceite Campo lindo 900ml",29,1200,0,0,0,-1],
["7803905111016","Arroz Campo lindo 1 k",29,6500,0,0,0,-1],
["7803905150015","Azucar Campo Lindo 1 K",29,4700,0,0,0,-1],
["7803908000829","barra de frambuesa 66g",19,1300,900.0,15,0,9],
["7803908001925","helado de chirimoya 684g",29,4650,0,0,0,-1],
["7803908001932","Frambuesa Guallarauco 1 Lt.",29,950,0,0,0,-1],
["7803908001970","Guallarauco mango helado 672 g",29,6200,0,0,0,-1],
["7803908001987","Helado de fruta 693 g tropical",29,6200,0,0,0,-1],
["7803908003103","frambuesa chocolate guallarauco 56g",19,1300,900.0,10,0,9],
["7803908005329","Guallarauco Pie de Limon 584 g",19,4900,3718.0,6,0,9],
["7803908005336","Postre Helado Guallarauco Maracuya 618 g",19,4900,3718.0,6,0,9],
["7803908006043","aloe vera original guallarauco 500 ml",5,1400,870.0,12,0,9],
["7803908006098","Agua pera Guallarauco 1 Lt",29,1900,0,0,0,-1],
["7803908006173","jugo mango guallarauco 1 litro",5,2600,1944.0,4,0,9],
["7803908006197","jugo naranja guallarauco 1 litro",29,2000,0,0,0,-1],
["7803908006210","Jugo Limonada Guallarauco 1 Lt",29,5200,0,0,0,-1],
["7803908006333","jugo pera guallarauco 1 litro",29,400,0,0,0,-1],
["7803908006746","Postre helado Guallarauco 611 g",29,400,0,0,0,-1],
["7803908006814","Cereal Guallarauco arandano maqui",29,1200,0,0,0,-1],
["7803908006838","Cereal Guallarauco mango maracuyá",29,950,0,0,0,-1],
["7803908006876","Nectar Guallarauco manzana botella vidrio 300 ml",29,950,0,0,0,-1],
["7803908007002","jugo durazno naranja bot vidrio guallarauco 1 litro",29,1200,0,0,0,-1],
["7803908007170","guallarauco yogurt frambuesa 59g",29,950,0,0,0,-1],
["7803908007514","guallarauco chocolate menta 57g",19,1300,900.0,10,0,9],
["7803908007736","Guallarauco frutilla",29,1200,0,0,0,-1],
["7803908007743","Guallarauco Mango naranja",29,1200,0,0,0,-1],
["7803908007767","mango coco 62g",29,2000,0,0,0,-1],
["7803908007774","Guallarauco frutos rojos",19,1200,900.0,6,0,9],
["7803908007781","guallarauco frambuesa almendra choc",19,1400,750.0,14,0,9],
["7803946000980","Espinaca Agrosano 200g",29,2100,0,0,0,-1],
["7804000001677","Barras de cereal Eckart 6 un",29,1500,0,0,0,-1],
["7804000001691","Barras de cereal Eckart 6 un",29,990,0,0,0,-1],
["7804000002049","Barras de cereal  Eckart 6 un",29,1700,0,0,0,-1],
["7804000002056","barras de cereal enlinea sin azucar caja 6 und",29,1900,0,0,0,-1],
["7804000100257","Dulce de membrillo Eckart 250g",29,1250,0,0,0,-1],
["7804000100509","Dulce de membrillo Eckart 500 g",29,400,0,0,0,-1],
["7804000249024","Dulce de membrillo Eckart 330 g",29,3900,0,0,0,-1],
["78040519","Dulce de leche Soprole pote 200 gr",29,1490,0,0,0,-1],
["78040588","Alfajor Chileno 45 g",29,1490,0,0,0,-1],
["7804100000655","Champion Dog  cachorros 1.5 k",29,1491,0,0,0,-1],
["7804100000686","champion cat lata sabor pescado 315g",29,1490,0,0,0,-1],
["7804100000693","Recetas de paté sabor carne Champion Dog 315g",29,700,0,0,0,-1],
["7804100000815","champion dog lata sabor pollo 315g",29,700,0,0,0,-1],
["7804100000822","champion cat lata sabor carne 315g",29,700,0,0,0,-1],
["7804100001652","Champion cat Push 100 g salmon sardina",29,800,0,0,0,-1],
["7804100001737","Champion Cat Push 100 g carne",29,2600,0,0,0,-1],
["7804100001744","Champion Dog Push 100 g",29,3900,0,0,0,-1],
["7804100001751","Champion Dog push trocitos de pollo en salsa perro adullto 100 g",29,700,0,0,0,-1],
["7804100002062","Sabro Cat 1 k adulto",29,700,0,0,0,-1],
["7804100002277","Champion Dog Cachorro 1.5 kg",29,700,0,0,0,-1],
["7804100002406","Champion Cat Push 100 g gatitos pollo",29,1700,0,0,0,-1],
["7804100002420","Champion Cat Push 100 g",29,700,0,0,0,-1],
["7804100002437","Chapion Cat Push 100 g pollo y pavo",29,1700,0,0,0,-1],
["7804100002482","champion dog lata sabor carne y cordero 400g",29,700,0,0,0,-1],
["7804100002499","Champion Dog Push 100",29,3690,0,0,0,-1],
["7804100002505","Champion dog lata sabor pollo y pavo 400 g",29,1500,0,0,0,-1],
["7804100002529","Champion Dog Push 100 pollo",29,1500,0,0,0,-1],
["7804100002970","Champion Dog Galletas 500 g",29,1500,0,0,0,-1],
["7804100003106","Champion cat 500 g adulto pescado",29,3900,0,0,0,-1],
["7804100003151","Champion Cat adulto 500 g pollo",29,3400,0,0,0,-1],
["7804100003205","Champion Cat adulto 500 g carne",29,350,0,0,0,-1],
["7804100104292","Champion Dog Adulto 1.5 k",29,350,0,0,0,-1],
["78041097","chiquitin  sabor frutilla",2,400,280.0,6,0,30],
["78041103","chiquitin 45g damasco",20,400,226.0,10,0,31],
["78041110","chiquitin de nestle 45 g",20,400,280.0,8,0,31],
["7804115001678","hamburguesa tradicional 50g",29,2300,0,0,0,-1],
["7804115001708","amburguesa vacuno",40,700,471.0,42,0,3],
["7804115001883","Hamburguesa BIG Montina vacuno 150 g",29,1000,700.0,24,0,-1],
["7804115001890","Carne molida de vacuno Montina 250g",29,2200,1500.0,12,0,-1],
["7804115002408","queso crema rumay",20,2500,2000.0,10,0,-1],
["7804115002460","Pizza Jam-Ques Montina 470 g",29,3600,2500.0,6,0,-1],
["7804115002477","Pizza Peperini Montina 470 g",29,4900,0,0,0,-1],
["7804115337678","Hamburguesa tradicional montina 50g",29,4300,0,0,0,-1],
["7804115844671","Molida de vacuno Montina 250g",29,2200,1300.0,14,0,-1],
["7804180720207","casata madel 2.5l",29,700,0,0,0,-1],
["7804330003730","VINO 120 MELOT 2.5L",29,800,0,0,0,-1],
["7804438003274","Push Felines adulto carne 85 g",29,800,0,0,0,-1],
["7804438003281","Push Felinnes salmon adulto 85 g",29,400,0,0,0,-1],
["7804438003298","Push Felines carne leche Gatito",29,2000,0,0,0,-1],
["7804438003359","sabrositos cannes trocitos de carne perro adulto 100g",29,1500,0,0,0,-1],
["78045248","Delicia Frambuesa NT. 42 g",29,1300,0,0,0,-1],
["7804601443999","Harina Gran Arepa 1 k",29,990,0,0,0,-1],
["7804603541433","EMULINE DESMAQUILLANTE",29,2490,0,0,0,-1],
["7804605040040","Arroz Callao G2 1 k",29,1400,0,0,0,-1],
["7804605040354","azucar blanca toddo 1K",29,1790,0,0,0,-1],
["7804608220098","Arroz Coliseo G2 1 Kl.",29,1790,0,0,0,-1],
["7804608220784","aceite vegetal 900ml",2,1790,1359.0,12,0,24],
["7804608222962","salsa de tomate coliseo 200g",29,1300,0,0,0,-1],
["7804609020062","Aceite De Reyes 900 ml",2,2000,1453.0,32,0,52],
["7804609020130","azucar grado 2 de reyes 1 kilo",29,1690,0,0,0,-1],
["7804609020970","Arroz grado 2 De Reyes 1k",2,1800,1300.0,10,0,24],
["7804609730169","detergente liquido bio frescura bosque nativo 1.5 lit",29,2900,0,0,0,-1],
["7804609730176","detergente en polvo bio frescura bosque nativo 800 g",29,1850,1250.0,23,0,-1],
["7804609730268","detergente en polvo bio frescura desierto florido 800 g",37,1850,1350.0,24,0,62],
["7804609730381","liquido antigrasa wyn 750 ml",36,2990,1500.0,12,0,-1],
["7804609730404","liquido vidrio y multiuso wyn 750 ml",29,2990,0,0,0,-1],
["7804609730534","detergente en polvo bio frescura campos de hielo 800 g",31,1850,1250.0,6,0,24],
["7804609730558","detergente liquido bio frescura campos de hielo 1.5 lit",29,1790,0,0,0,-1],
["7804609730602","recargs liquido vidrios y multiuso wyn 450 ml",29,1500,0,0,0,-1],
["7804609730619","recaqrga liquido antigrasa wyn 450 ml",29,1500,1000.0,6,0,-1],
["7804610290096","Aceite Mi Sol 900 ml",2,1990,1290.0,12,0,-1],
["7804611550083","durazno mitades",10,8600,5600.0,1,0,24],
["7804611550120","Coctail de frutas en jugo de pera Novafruta",29,10900,0,0,0,-1],
["7804611550090","cocktail de frutas",10,9700,7390.0,2,0,24],
["7804611550625","Durazno en trocitos El Jardín 3k",29,1800,0,0,0,-1],
["7804611550632","Duraznos en mitades El Jardin 820 g",29,500,0,0,0,-1],
["7804611552452","Frutillas El jardín 410g",29,1650,0,0,0,-1],
["7804611552506","leche evaporada nova milk",29,1890,0,0,0,-1],
["7804612131274","NULL",29,1100,0,0,0,-1],
["7804612132134","filtro ronson",29,1400,0,0,0,-1],
["7804612220206","nueces sembrasol 50g",29,3600,0,0,0,-1],
["7804612220213","pistachos sembrasol 40 g",29,1600,0,0,0,-1],
["7804612220268","Charki Sembrasol 20 g",29,900,0,0,0,-1],
["7804612220633","Pipona Sembrasol 120 g",29,500,0,0,0,-1],
["7804613390519","queso gauda granulado la vaquita 250g",29,500,0,0,0,-1],
["7804613392223","mantequilla de campo kümey 125g",20,1690,1084.0,12,0,8],
["7804614780883","Mantrca Milpan 100 g",29,990,0,0,0,-1],
["7804617470262","LECHE SURLAT FRUTILLA 200ML",29,990,0,0,0,-1],
["7804617470279","LECHE SURLAT CHOCOLATE 200ML",29,1300,0,0,0,-1],
["7804617470286","Leche entera Surlat 1L",29,1400,1030.0,12,0,-1],
["7804619060027","Salsa Americana Sabros 280",2,990,680.0,6,0,8],
["7804619060065","Chucrut Sabros  200 g",2,990,680.0,8,0,8],
["7804619850086","Maní Japones merken 100 g",29,2300,0,0,0,-1],
["7804619850147","Maní Japones Kazai 80 g",29,1300,0,0,0,-1],
["7804620833610","Amoxicilina 60 ml infantil jarave",29,1400,0,0,0,-1],
["7804624740129","Chuleta Vetada  900 g",6,6900,5000.0,4,0,-1],
["7804627650524","Papas fritas artesanales Buka 185g",29,1900,0,0,0,-1],
["7804627780016","Azucr Shogun 1 k",29,2000,0,0,0,-1],
["7804627780283","AZUCAR ECONOMICA SMARTPRICE 1K",29,6990,0,0,0,-1],
["7804634400235","Mantequilla Rumay 125 g",29,3900,0,0,0,-1],
["7804634400501","Mantequilla Rumay 200 g",29,2300,1800.0,12,0,-1],
["7804634400518","Queso Rumay 190 g",29,1400,0,0,0,-1],
["7804635610404","Papas prefritas Global Frozen 2,5k",12,7350,5622.0,4,0,66],
["7804635610633","surtido de marisco global frozen 1 kilo",29,1200,0,0,0,-1],
["7804635611098","Camarones cocidos 100/150",29,1500,0,0,0,-1],
["7804643820208","Love Lemon original",29,2200,0,0,0,-1],
["7804643820239","Love Lemon menta-gengibre 385 g",29,1300,0,0,0,-1],
["7804644070046","chip wom",29,2300,0,0,0,-1],
["7804644840021","Mani confitado Sembrasol 120 g",29,550,0,0,0,-1],
["7804644840151","maravilla tostada gran pipona 230 g",29,2990,0,0,0,-1],
["7804644840229","mani tipo japones sembrasol 100g",29,2990,0,0,0,-1],
["7804645050467","Duraznos Homar mitades 820 g",29,2990,0,0,0,-1],
["7804651630189","SAL FINA SMART PRICE 1K",29,2990,0,0,0,-1],
["7804651931903","Suerox Aran-Pom. 630 ml",5,2200,1600.0,12,0,46],
["7804651931910","suerox naranja 630 ml",5,2200,1600.0,12,0,46],
["7804651931927","suerox manzana 630ml",29,2990,0,0,0,-1],
["7804651931934","suerox frutilla kiwi 630 ml",5,2200,1600.0,12,0,46],
["7804651935581","suerox limon de pica 630 ml",29,1500,0,0,0,-1],
["7804651937806","suerox sabor mango durazno 630ml",29,1700,0,0,0,-1],
["7804651938094","suerox sabor frutos rojos 630ml",29,1000,0,0,0,-1],
["7804652940041","Empanada de queso Calabria 10 un",29,1990,0,0,0,-1],
["7804653340727","Nova Swan",31,1500,1030.0,32,0,39],
["7804653341045","Papel higienico suan 22mts. 6u.",31,1990,1119.0,64,0,39],
["7804653341168","Higienico Suan 22 m",29,400,0,0,0,-1],
["7804653341335","servilleta familiar swan",31,1990,1300.0,20,0,39],
["7804654580238","mani, pasas y almendras las mellizas 80 g",29,2200,0,0,0,-1],
["7804654680099","Arroz Tacora 1 k",29,500,0,0,0,-1],
["7804656050005","Levadura Levamas 12 g",29,1000,0,0,0,-1],
["7804656050029","Levadura Levamas 500 g",2,3990,2263.0,1,0,24],
["7804656451130","Perforadora Selloffice s-500",29,4300,0,0,0,-1],
["7804657020106","Virutilla lana de acero fina",29,1100,0,0,0,-1],
["7804657020120","Rollitos de jabón",29,1990,0,0,0,-1],
["7804658250069","Kanikama 500g",12,2500,1590.0,3,0,24],
["7804658250106","surtido de mariscos 1 k",29,1990,0,0,0,-1],
["7804658860008","arroz el marqués 1kg",2,2100,1190.0,6,0,24],
["7804659070000","prueba de embarazo kingdom  casette",29,800,0,0,0,-1],
["7804659070406","Condon Kingdom",48,1500,1090.0,12,0,14],
["7804659070413","Condon Kingdom",29,1300,0,0,0,-1],
["7804659070512","Condon Kingdom",29,3990,0,0,0,-1],
["7804660690358","alverja el buho",29,3990,0,0,0,-1],
["7804660910135","Ampolleta led 9,5W MegaBright",31,1300,790.0,100,0,24],
["7804660913563","Ampolleta MegaBright 9W",29,1800,0,0,0,-1],
["7804662020825","arena sanitaria aglutinante top k9 2kg  aroma lavanda",29,1600,0,0,0,-1],
["7804662020887","arena sanitaria aglutinante top k9 2kg aroma limon",29,790,0,0,0,-1],
["7804662550049","Molida especial 250 g Rupanco",12,1600,847.0,14,0,8],
["7804662550056","picada especial 250g",12,1800,960.0,23,0,8],
["7804662550087","Cubos de pollo 300 g",12,2350,1877.0,14,0,8],
["7804662550124","medallon de pollo  100 g",29,2800,0,0,0,-1],
["7804663360074","Patelwell pegamento 118 cc",29,2400,0,0,0,-1],
["7804663870023","Casata Mora Crema  1 Lt. Madel",19,2600,1880.0,3,0,13],
["7804663870030","Casata lucuma manjar Madel 1L",19,2600,1880.0,3,0,13],
["7804663870054","Casata pasas al ron Madel 1 lt",29,2400,0,0,0,-1],
["7804663870061","Casata chirmoya alegr Madel 1L",19,2600,1880.0,4,0,13],
["7804663870078","casata Madel Trisabor 1 Lt.",19,2600,1880.0,3,0,13],
["7804663870085","casata madel chocolate suiso 500g",29,3990,0,0,0,-1],
["7804663870092","casata madel sabor terremoto 1litro",29,550,0,0,0,-1],
["7804663870108","Cassata Madel Coco 1 L",19,2600,1880.0,3,0,13],
["7804666271124","Alcohol Gel 1 lt Winkler",29,2400,0,0,0,-1],
["7804666650134","Toalla Premium x 4",29,2000,0,0,0,-1],
["7804667660026","Sal de mesa Trinidad 1k",2,550,300.0,6,0,24],
["7804667910008","Pan de pascua Delissimo 500 g",29,3900,0,0,0,-1],
["7804667910046","Prepizza familiar D`trigo 2u",29,4500,0,0,0,-1],
["7804667910053","Pan de molde D'trigo 480g",29,3490,0,0,0,-1],
["7804667910060","Pan de molde integral D'trigo 480g",29,12990,0,0,0,-1],
["7804667910152","trensa crema de 500g del trigo",29,4300,0,0,0,-1],
["7804667910237","pan de pascua Delissimo 1 k",29,3490,0,0,0,-1],
["7804667910251","Queque Rectangular De trigo",29,2500,0,0,0,-1],
["7804667910534","Torta día de la madre frambuesa 15 personas",29,2000,0,0,0,-1],
["7804667910671","Pan de Pascua Dtrigo 1k",29,2600,0,0,0,-1],
["7804667910695","Queque redondo Detrigo",29,2600,0,0,0,-1],
["7804667910701","Pan de molde XL D'trigo 750g",29,12990,0,0,0,-1],
["7804667910718","Pan integral DE TRIGO 500 g",29,2500,0,0,0,-1],
["7804667910725","Pan de completo D'Trigo 520g",29,2600,0,0,0,-1],
["7804667910732","Pan frica D'Trigo 8u",29,1500,0,0,0,-1],
["7804667910763","Torta día de la madre chocolate 15 personas",29,1000,0,0,0,-1],
["7804667970718","Pan de molde integral XL D'trigo 750g",29,1500,0,0,0,-1],
["7804669400712","Queso crema Fundo Curihue 190g",20,2750,1764.0,6,0,8],
["7804670070478","Papel Higienico Ovella x 6",4,1800,1100.0,36,0,39],
["7804670070485","Papel higiénico Ovella x4",31,1200,750.0,60,0,39],
["7804670070508","Tohalla papel Ovella x 3",29,1500,0,0,0,-1],
["7804670070607","tohalla obella xl",31,2500,1130.0,54,0,39],
["7804670070614","ovella servilleta 300und",29,2200,0,0,0,-1],
["7804672450117","Aceite Ines de S C 750 ml",29,2200,0,0,0,-1],
["7804672450162","Aloe Vera original 500 cc",29,3990,0,0,0,-1],
["7804673570173","Fibra verde 5 u",29,1690,0,0,0,-1],
["7804673570180","Trapero Humedo Madera",29,1800,0,0,0,-1],
["7804673570197","Trapero Humedo  multi-piso",29,2290,0,0,0,-1],
["7804674450290","Toalla de papel WinRoll 4 rollos",29,550,0,0,0,-1],
["7804674530190","Surtido de Mariscos 425 g",29,1300,0,0,0,-1],
["7804676070014","Test de embarazo Onetest",48,1500,1090.0,12,0,14],
["7804676740023","Aceite vegetal Campo lindo 900cc",29,2200,0,0,0,-1],
["7804676740115","salsa de tomate campo lindo 200g",29,1300,0,0,0,-1],
["7804676740153","arroz misol 1k grano largo",2,1900,1200.0,10,0,8],
["7804676740160","AZUCAR 1K MIRASOL",29,2200,0,0,0,-1],
["7804676740207","Te Nego Misol 100 b",2,2200,1691.0,8,0,8],
["7804676740221","Sopas Misol 65 g",29,2100,0,0,0,-1],
["7804679590175","toalla de papel xl cada una",29,2100,0,0,0,-1],
["7804682060061","durazno mitades dos caballos425g",29,2100,0,0,0,-1],
["7804684710001","Energética StrikeOne sabor frutal 473ml",29,3300,0,0,0,-1],
["7804684710025","Energética StrikeOne sabor tropical 473ml",29,1290,0,0,0,-1],
["7804684710032","Energética StrikeOne sabor sandía 473ml",29,2990,0,0,0,-1],
["7804900610887","Etiquet Men 60 g",29,9990,0,0,0,-1],
["7804900632452","etiquet women",29,5990,0,0,0,-1],
["7804902016281","talco para pies brooks 120 g",29,1700,0,0,0,-1],
["7804902034735","Denim estuche",29,7990,0,0,0,-1],
["7804902036357","perfume etienne london world collection 55ml",29,7990,0,0,0,-1],
["7804902036623","Skin Bracer estuche",29,7990,0,0,0,-1],
["7804907756502","Pielarmina crema hidratante 67 g",4,1500,963.0,5,0,39],
["7804907912298","set de perfume y crema para manos pure pink",29,7990,0,0,0,-1],
["7804907920491","set de perfumes jean les pins 2 und",29,7990,0,0,0,-1],
["7804907930339","set de perfume y crema para manos jean les pins",29,1990,0,0,0,-1],
["7804907935327","shampoo y acondicionador petrizzio hair care",29,4990,0,0,0,-1],
["7804907956063","set jovan musk for women 2 und desodorante",29,4990,0,0,0,-1],
["7804907956735","set perfume y crema de manos jean les pins sexy queen",29,3990,0,0,0,-1],
["7804910019434","talco para pies brooks 80 g",4,2490,1890.0,5,0,39],
["7804915005234","colonia spray marvel",29,3990,0,0,0,-1],
["7804915009232","colonia spray marvel",29,5490,0,0,0,-1],
["7804915010139","Jabón líquido PJmasks",29,9990,0,0,0,-1],
["7804915010771","perfume frozen II colonia en spray 140ml",29,9990,0,0,0,-1],
["7804915011013","Pack colonia + crema Bia",29,1490,0,0,0,-1],
["7804915011327","abi shark 3 en 1",29,1700,0,0,0,-1],
["7804915012782","Paw Patrol Beauty set",29,1700,0,0,0,-1],
["7804915525169","beauty set esmalte",29,2990,0,0,0,-1],
["7804916000047","alchol gel",29,1200,0,0,0,-1],
["7804916421040","quita esmalte Arens con vitamina A limon",29,1990,0,0,0,-1],
["7804916421057","quita esmalte Arens con queratina herbal",29,1990,0,0,0,-1],
["7804918403495","preservativos x3 lifestyles L",29,1690,0,0,0,-1],
["7804918410592","gotas de ojos bevitex",29,1400,0,0,0,-1],
["7804920001108","Dtergente Liquido Fuzol forte 1 Lt",29,2190,0,0,0,-1],
["7804920001535","Detergente liquido Fuzol piel delicada",29,1390,0,0,0,-1],
["7804920002761","Jabón liquido ballerina 750ml yogurt y berries vainilla",29,2200,1646.0,10,0,-1],
["7804920003058","Acondicionador Ballerina anti-frizz",29,1590,1100.0,12,0,-1],
["7804920003140","Jabon liquido  mickey 250 ml",29,1590,0,0,0,-1],
["7804920003164","jabon liquido ballerina granada 900 ml",29,1690,0,0,0,-1],
["7804920003201","shampoo color ideal granada",4,2200,1646.0,6,0,24],
["7804920003218","Acondicionador Ballerina color ideal sin sal",29,500,0,0,0,-1],
["7804920003225","Shampoo Ballerina Hid. y Suav. sin sal",29,1490,0,0,0,-1],
["7804920003416","Shampoo Ballerina anti-frizz 900 lm",4,1690,1250.0,12,0,24],
["7804920004130","Detergebte  Dielli 1 L primavera",29,3390,0,0,0,-1],
["7804920004345","Blanqueador Fuzol",29,1400,0,0,0,-1],
["7804920005274","acondicionador ballerina hierbas silvestres",29,1690,0,0,0,-1],
["7804920005304","Detergente Dielli matic 3 L",29,1490,0,0,0,-1],
["7804920005311","detergente dielli 5 litros",29,1690,0,0,0,-1],
["7804920005786","Jabon liquido ballerina 500 ml",29,600,0,0,0,-1],
["7804920005861","shapoo micelar ballerina",29,1790,1200.0,10,0,-1],
["7804920005878","shampoo ballerina 900ml",29,1690,0,0,0,-1],
["7804920005908","acondicionador ballerinabajo poo miclar 750ml",29,1590,1100.0,0,0,-1],
["7804920006141","Lavalozas Dielli limón 500ml",29,1390,0,0,0,-1],
["7804920006189","acondicionador ballerina 900ml",29,1590,0,0,0,-1],
["7804920006905","shampoo ballerina durazno y aceite de jojoba 750ml",29,1590,1100.0,0,0,-1],
["7804920006912","acondicionador ballerina durazno y aceite jojoba",29,1690,0,0,0,-1],
["7804920006943","Spray multi Ballerina 200 ml durazno",29,1200,0,0,0,-1],
["7804920006967","Alcohol gel Ballerina 220ml",29,990,0,0,0,-1],
["7804920007155","Shampoo Ballerina ondas",37,1790,1200.0,12,0,46],
["7804920007162","ACONDICIONADOR ONDAS Y RIZOS",4,1690,1200.0,12,0,24],
["7804920007186","shampoo ballerina brillo luminoso manzanilla 410 ml",29,990,0,0,0,-1],
["7804920007216","Shampoo Ballerina Detox 410 ml",29,1200,0,0,0,-1],
["7804920007223","shampoo ballerina bajo poo micelar 410 ml",29,1200,0,0,0,-1],
["7804920007230","Acondicionador Ballerina 410 ml",29,1690,0,0,0,-1],
["7804920007254","Acondicionador Ballerina Detox 410 mlk",29,100,0,0,0,-1],
["7804920007698","shampoo ballerina ondas y rizos 410",29,150,0,0,0,-1],
["7804920007704","acondicionadore ballerina ondas y rizos 410 ml",29,1690,0,0,0,-1],
["7804920007766","ACONDICIONADOR FUERZA NATURAL",29,1590,1100.0,0,0,-1],
["7804920008114","acond ballerina 40 ml",29,1690,0,0,0,-1],
["7804920008138","acond bllerina 40 ml",29,1200,0,0,0,-1],
["7804920008701","SHAMPOO AICE DE COC,ARGAN Y ALMENDRA",29,1800,0,0,0,-1],
["7804920018779","Shampoo Ballerina manzanilla  900 ml",4,1690,1250.0,12,0,24],
["7804920055040","Acondicionador ballerina  manzanilla  900 ml",4,1690,1450.0,12,0,24],
["7804920230225","jabon liquido ballerina",29,1400,0,0,0,-1],
["7804920280343","suavizante fuzol color plus 1 litro",29,1690,1300.0,4,0,-1],
["7804920280572","Suavisante Fuzol Clasico 1 Ll",31,1690,1300.0,10,0,24],
["7804920280596","suavizante fuzol primavera 1 litro",29,1800,1000.0,10,0,-1],
["7804920280619","Lavalozas Fuzol Citrico 1 Lt",37,1790,1280.0,12,0,-1],
["7804920280695","Suavisante Fuzol  1 Lt.",31,1690,958.0,5,0,39],
["7804920280879","Lavalozas Fuzol  1 Lt bicarbonato vinagre",29,1790,1290.0,12,0,-1],
["7804920282033","fuzol ultra power cocina 500ml",29,1690,0,0,0,-1],
["7804920350176","jabon liquido ballerina",4,1500,1000.0,0,0,24],
["7804920350664","jabon liquido ballerina hipoalergenico",29,1690,0,0,0,-1],
["7804920350831","Jabon Liquido Ballerina PH5",29,1690,0,0,0,-1],
["7804920350855","Jabon liquido ballerina 750ml violetas silvestres",29,2600,0,0,0,-1],
["7804920350862","Jabon Liquido Ballerina hipoal",29,1690,0,0,0,-1],
["7804920350893","jabon liquido hipoalergenico baby line 750ml",29,2200,1646.0,10,0,-1],
["7804923025033","Ilicit 6.75 Chocolate Caoba",29,2690,2100.0,6,0,-1],
["7804923031225","Ilicit 1.0 Negro",4,2690,1890.0,3,0,39],
["7804923031270","tintura ilicit color vileta 4.20",29,2690,2100.0,12,0,-1],
["7804923031294","Ilicit Chocolate 6.7",4,2690,1890.0,3,0,39],
["7804923031300","Ilicit 5.37 Cacao",29,2690,2100.0,6,0,-1],
["7804923031324","Ilicit 7.77 Ambar",29,2690,2100.0,6,0,-1],
["7804923031331","Ilicit 66.46 Rojo Intenso Granada",4,2690,1690.0,3,0,39],
["7804923031348","Ilicit 77.44 Rojo Intenso Mandarina",29,2690,2100.0,6,0,-1],
["7804923031362","tintura ilicit color caoba 4.45",29,2690,2100.0,6,0,-1],
["7804923031409","Ilicit 6.66 Guinda",29,2690,1890.0,4,0,-1],
["7804923031423","Ilicit 7.46 Cereza",29,2690,1890.0,3,0,-1],
["7804923031447","Ilisit 6.0 Rubio Oscuro",4,2690,1690.0,3,0,39],
["7804923031454","Ilicit 6.1 Rubio Oscuro Ceniza",4,2690,1690.0,0,0,39],
["7804923031461","Ilicit 7.0 Rubio Medio",4,2690,1890.0,3,0,39],
["7804923031478","Ilicit 7.1 Rubio Medio Ceniza",29,2690,2100.0,6,0,-1],
["7804923031492","Ilisit 7.3 Rubio dorado",29,2690,1890.0,3,0,-1],
["7804923031515","Ilicit 8.0 Rubio Claro",4,2690,1890.0,3,0,39],
["7804923031522","Ilicit 8.1 Rubio Claro Ceniza",29,2690,2100.0,6,0,-1],
["7804923031539","Ilicit 8.11 Rubio Claro Ceniza Profundo",29,2690,2100.0,6,0,-1],
["7804923031546","Ilicit 8.31 Almendra",29,2690,2100.0,6,0,-1],
["7804923031553","Ilicit 9.0 Rubio Extra Claro",4,2690,1890.0,3,0,39],
["7804923031560","Ilicit 10.0 Rubio Aclarante",4,2690,1890.0,3,0,39],
["7804923031577","Ilicit 9.1 Rubio Extra Claro Ceniza",29,2690,2100.0,6,0,-1],
["7804923031584","Ilicit 10.1 Rubio Aclarante Ceniza",4,2690,1890.0,3,0,39],
["7804923041354","Poilvo decolorante Ilicit 20",4,1990,1290.0,12,0,24],
["7804923060508","cera depilatoria en perlas natural 100g mellefiori",29,1300,0,0,0,-1],
["7804923060522","cera depilatoria en perlas vegetal mellefiori 100g",29,2690,0,0,0,-1],
["7804923066364","tintura ilicit color chocolate cereza 5.2",29,2690,2100.0,6,0,-1],
["7804945001701","estche simonds",29,4500,0,0,0,-1],
["7804945002838","chupete entretencion con cubre chupete simonds",29,4500,0,0,0,-1],
["7804945015142","dermo  crean",29,2390,0,0,0,-1],
["7804945018167","SIMONDS CABELLO DE DECOLORADO",29,1990,0,0,0,-1],
["7804945018181","SIMONS CARBON IALURONICO",29,1900,0,0,0,-1],
["7804945018860","jabon en crema simonds 850 ml",29,1990,0,0,0,-1],
["7804945054134","crema emulsionada neutra bellekiss360 ml",29,1990,0,0,0,-1],
["7804945063860","acondicionados familand",29,1990,0,0,0,-1],
["7804945065093","protector solar familand hidratante en spray",29,1990,0,0,0,-1],
["7804945076129","Colonia babyland Verde 210ml",4,2690,1990.0,6,0,24],
["7804945076143","Colonia Babyland 210ml Lila",4,2690,1990.0,6,0,24],
["7804945076150","colonia amarilla babyland 210m",4,2690,1990.0,6,0,24],
["7804945076167","Colonia Babyland Celeste",4,2690,1990.0,6,0,24],
["7804945076174","colonia babyland Rosada 210ml",4,2690,1990.0,6,0,24],
["7804947003550","Desinfectante Home Sweet Home 360ml",29,990,0,0,0,-1],
["7804947004588","agua oxigenada volumen 10",4,1200,790.0,10,0,24],
["7804947004625","Agua oxigenada kadus 20 vol",29,1200,790.0,12,0,-1],
["7804947004632","Agua oxigenada kadus 30 vol",29,1200,790.0,12,0,-1],
["7804947004649","kadus volumen 20",29,1950,0,0,0,-1],
["7804947006070","Alcohol Kadus 70% 50ml",29,1490,0,0,0,-1],
["7804947601206","fijador duo",29,1690,0,0,0,-1],
["7804947611168","duo gel fijador",4,3300,1871.0,5,0,39],
["7804986002064","Maquillaje Rojo",29,790,0,0,0,-1],
["7805000115906","Quix botella 500ml",29,1390,0,0,0,-1],
["7805000115913","lavalozas concentrado quix 750 ml",29,1000,0,0,0,-1],
["7805000141271","Soft 1 Lt",31,1900,1230.0,10,0,24],
["7805000169459","Quix 200ml",29,1100,0,0,0,-1],
["7805000180874","pasta de dientes pepsodent 90g xtra whitening",29,2390,0,0,0,-1],
["7805000301484","mayo Helmans 93 g",2,1000,567.0,4,0,24],
["7805000306366","te emblem premium 100 und",29,1100,0,0,0,-1],
["7805000306533","Te Club original 20 bol",29,2290,0,0,0,-1],
["7805000306540","Té club 100 bolsitas",29,1300,0,0,0,-1],
["7805000312329","mayonesa hellmann's 670gr",29,1500,0,0,0,-1],
["7805000313616","Omo Matic 400 g",31,1400,949.0,24,0,21],
["7805000313715","Omo  matic 800 g",31,2490,1690.0,15,0,39],
["7805000313722","detergente en polvo omo matic 400 g",29,2490,0,0,0,-1],
["7805000313777","Omo labado a mano 400g",31,1400,950.0,24,0,39],
["7805000315115","jabon lesancy",29,1990,0,0,0,-1],
["7805000321550","hellmann`s supreme artesana 735g",29,1300,0,0,0,-1],
["7805000321581","Hellmanns Supreme 380 g",29,990,0,0,0,-1],
["7805000321802","pack promocion omo para diluir y botella rinde 5L",29,2500,0,0,0,-1],
["7805000322014","Lavalosa Quix concentrado 3x 750ml",4,2000,1570.0,12,0,21],
["7805000322021","lava loza quix 500ml",31,1490,737.0,23,0,39],
["7805000322045","quix 200ml",31,990,500.0,10,0,24],
["7805000322472","Mayonesa hellmanns 700g",2,2600,1750.0,13,0,24],
["7805000322519","Ketchup JB 900 g",29,2700,0,0,0,-1],
["7805010001534","cera nugget amarilla",37,2200,1690.0,10,0,24],
["7805010003842","Limpiador Lysol 900 ml Flores de jardin",29,1000,0,0,0,-1],
["7805020000794","limpiador en crema excell 750 g",29,1000,0,0,0,-1],
["7805020000916","multiuso limnpia vidrios",29,700,0,0,0,-1],
["7805020002415","limpiador desinfectante con amonio cuaternario excell",29,900,0,0,0,-1],
["7805020311012","limpia piso excellavanda",31,1500,895.0,10,0,39],
["7805020311043","limpia piso excelle primavera",31,1500,790.0,10,0,39],
["7805025688355","poet lavanda 250ml",29,1490,0,0,0,-1],
["7805025690419","quitamanchas blancos intensos clorox 370 g",31,900,590.0,21,0,39],
["7805025690471","Velas Arela economica",29,1100,0,0,0,-1],
["7805025690501","velas luminiosa 4 uni",29,990,0,0,0,-1],
["7805025691010","Clorox triple accion citrico 950 g",29,990,0,0,0,-1],
["7805025693342","quita manchas blancos intensos clorox ropa 960 ml",29,2490,0,0,0,-1],
["7805025693731","cloro ropa color",29,1300,900.0,12,0,-1],
["7805025694202","oet lavanda 485ml",29,1700,0,0,0,-1],
["7805025694219","poet primavera 485ml",29,1700,0,0,0,-1],
["7805025697500","Poett Alegra 1800 Ml.",29,1700,0,0,0,-1],
["7805025697760","Poett Citrico 1800 Ml",29,1700,0,0,0,-1],
["7805040000552","desodorante ambiental arom frutillas con crema 225g",29,2750,0,0,0,-1],
["7805040000576","aromatizante de ambientes arom jardin de lavanda 225 g",29,1900,0,0,0,-1],
["7805040000606","Arom frescura citrica 225 g",31,1700,1000.0,2,0,24],
["7805040000613","Arom lluvia de flores 225 g",29,1500,0,0,0,-1],
["7805040000644","Lustramuebles Vainilla Virginia 360cc",29,2100,0,0,0,-1],
["7805040000699","desinfectante de ambientes y superficies igenix vainilla 360 cc",29,3200,2422.0,0,0,-1],
["7805040000705","desinfectantes igenix 360cm3",4,3200,2423.0,6,0,39],
["7805040000781","igienix",29,1400,1075.0,12,0,-1],
["7805040001016","desinfectante de ambientes y superficies igenix tradicional 360 cc",29,3200,2423.0,0,0,-1],
["7805040001443","cera brillina virginia amarilla 360 cc",29,2600,0,0,0,-1],
["7805040001450","cera brillina virginia roja 360 cc",29,2100,0,0,0,-1],
["7805040001467","Cera Brillina ncolora 360 ml",29,1400,0,0,0,-1],
["7805040001474","cera brillina virginia con tierra de color",37,1850,1420.0,11,0,24],
["7805040001658","betun liquido negro virginia 60 ml",37,2600,1991.0,10,0,-1],
["7805040001665","betun liquido cafe virginia 60ml",29,1200,0,0,0,-1],
["7805040001825","clorogel igenix lavanda 900 ml",31,1400,1940.0,20,0,39],
["7805040001832","clorogel igenix floral 900 ml",31,1490,970.0,10,0,24],
["7805040001849","virginia abrillantador aroma lavanda",29,2600,0,0,0,-1],
["7805040002068","limpia vidrios multiuso virginia 400ml",29,2600,0,0,0,-1],
["7805040002136","lavalozas virginia recarga 1 litro",31,1800,1260.0,34,0,39],
["7805040002167","lustra mueble aerosol 360cm",29,2290,0,0,0,-1],
["7805040003485","silicona lavanda spray 480cm3",29,3900,3500.0,10,0,-1],
["7805040003492","silicona vainilla spray 480cm3",4,2990,2290.0,6,0,39],
["7805040004116","igenix",29,3600,0,0,0,-1],
["7805040004291","Killer casa y jardin 560 cc",29,3600,2400.0,12,0,-1],
["7805040004307","Killer moscas y zancudos 560 cc",31,3600,2740.0,12,0,24],
["7805040004314","Killer todo insecto 560 cc",31,3600,2740.0,12,0,24],
["7805040004499","aromatizante de ambientes arom chirimolla alegre 225 g",29,1490,0,0,0,-1],
["7805040004659","Panela granulada Deliciosa 400g",29,1400,0,0,0,-1],
["7805040004758","Cloro Igenix 1 k tradicional",31,1500,1000.0,12,0,39],
["7805040004765","Chancaca deliciosa 400 g",2,2200,1800.0,10,0,-1],
["7805040004857","limpiador desinfectante con amonio cuaternario igenix lavanda",29,1400,0,0,0,-1],
["7805040004864","limpiador desinfectante con amonio cuaternario igenix vainilla",29,1600,1025.0,0,0,-1],
["7805040004970","Toallas Humedas Igenix 20 un",29,2300,0,0,0,-1],
["7805040005045","igienix limpia piso",29,3100,0,0,0,-1],
["7805040005052","limpia pisa frescura floral igienix",31,1300,990.0,12,0,39],
["7805040005281","mata mosca, mosq y zancud  killer 223g",29,2400,1340.0,10,0,-1],
["7805040005298","killer mata todo insecto 390cm",31,2400,2000.0,4,0,24],
["7805040005342","Betún virginia",31,2000,1010.0,4,0,24],
["7805040005397","cera amarilla",31,2600,1800.0,5,0,24],
["7805040005403","cera roja",31,1500,1090.0,4,0,24],
["7805040005410","cera incolora",31,1900,1150.0,10,0,24],
["7805040005427","cera con tierra",31,1900,1321.0,7,0,24],
["7805040005748","chancaca",29,1400,900.0,12,0,-1],
["7805040112675","Betun Virginia negro 88 ml",29,5990,0,0,0,-1],
["7805040313003","1990lustramuebles virginia 250 ml",31,1900,1392.0,6,0,-1],
["7805040413130","Chancaca Deliciosa 225 g",29,1400,0,0,0,-1],
["7805045001080","Jabon popeye",31,1600,1100.0,5,0,24],
["7805050583595","Raid enchufable",29,6900,5300.0,5,0,-1],
["7805080100014","Clorinda 250 G",31,700,365.0,16,0,24],
["7805080100021","cloro concentrado clorinda 1 kilo",31,1400,800.0,15,0,24],
["7805080100038","clorinda cloro 2 litros",29,1450,0,0,0,-1],
["7805080692519","Clorinda 500 g",31,1100,720.0,24,0,-1],
["7805080693714","cloro ropa color clorinda 930 g",29,1500,0,0,0,-1],
["7805080696593","cloro gel clorinda recrga 750 ml",29,1200,0,0,0,-1],
["7805080696616","Clorinda gel 750 ml",29,1000,0,0,0,-1],
["7805080696623","cloro gel doypack clorinda lavanda 750 ml",29,1600,0,0,0,-1],
["7805080696654","clorinda aroma lavanda 950ml",29,990,0,0,0,-1],
["7805190000051","cotonitos swissbeauty 200 unidades",4,1300,800.0,10,0,24],
["7805190000082","cotonitos",29,2000,0,0,0,-1],
["7805190000181","COTONES SWISS BEAUTY",29,3490,0,0,0,-1],
["7805190000310","Algodòn hidrófilo en rollo 50g",4,990,500.0,3,0,24],
["7805210321401","panty apricott 3",29,2700,0,0,0,-1],
["7805300049178","tanax moscas y zancudos",31,2700,1990.0,24,0,14],
["7805300049307","Ratanax 5 un. 800 cada bolsita",29,3500,1790.0,10,0,-1],
["7805300049314","raticida ratanax tanax 100 gr",4,4990,2650.0,0,0,39],
["7805300100008","tanax hormiguisida",31,3990,1980.0,5,0,24],
["7805327000015","anilinas montblanc",31,2800,1920.0,6,0,24],
["7805505000585","Hormiguicida Anasac 40 g",29,1300,0,0,0,-1],
["7805505005818","Rastop 200g Anasac raticida $500c/u",29,4500,0,0,0,-1],
["7805633008903","jeringa",29,7990,0,0,0,-1],
["7805633009382","color beauty 8",29,7990,0,0,0,-1],
["7805633015956","Cotonitos Bubu 270 Un",29,12990,0,0,0,-1],
["7805633017578","Cremas de manos Gorgeous+ lima be kind to yourself",29,5990,0,0,0,-1],
["7805633017677","set de lociones personales beauty 100 con estuche",29,9990,0,0,0,-1],
["7805633017837","mister blue collection",29,1000,0,0,0,-1],
["7805633022039","Pack aseo bebé Bubu",29,850,0,0,0,-1],
["7805633022114","tropical collection beauty 100",29,2900,0,0,0,-1],
["7805633022176","coconut beach",29,2900,0,0,0,-1],
["7805670335109","Bombita de agua",29,3000,0,0,0,-1],
["78057241","Chandelle lucuma 130 g",20,890,665.0,8,0,30],
["7805810071355","media elasticada t 3",31,3590,2690.0,10,0,24],
["7805810071409","Panty pret a porte Caffarena negro",29,1900,0,0,0,-1],
["7805810096617","Panty elasticada Caffarena 3 apricot",29,1300,0,0,0,-1],
["7805810096693","Panty elasticada Caffarena champagne",29,1300,0,0,0,-1],
["7805810121524","Panty Pret a porte Caffarena color almendra talla 3",4,2200,1600.0,12,0,24],
["7805810121586","Panty Caffarena 3 apricot",29,1990,0,0,0,-1],
["7805810121593","Panty Caffarena 3 champagne",29,1900,0,0,0,-1],
["7805810121609","Panty Pret a porte Caffarena color negro",31,2200,1590.0,20,0,24],
["7805810185137","Panty affarena 4 champagne",29,2600,0,0,0,-1],
["7805810185182","Panty Caffarena 4 apricot",29,2900,0,0,0,-1],
["7805810185205","Panty Caffarena negra 4",4,2200,1200.0,4,0,24],
["7805810185366","media pantalon",29,800,0,0,0,-1],
["7805810387401","Panty pret a porte Caffarena apricot",29,1900,0,0,0,-1],
["7805810387425","panty  aricot t4",29,990,0,0,0,-1],
["7806130200692","jeringa n5",24,800,500.0,10,0,52],
["7806500000426","toalla femenina nocturna ultradelgada ladysoft 16 uni",29,1990,0,0,0,-1],
["7806500221326","Servilletas Elite 200 Un",29,1500,0,0,0,-1],
["7806500241201","SERVILLETA NOVA 300U",29,1500,0,0,0,-1],
["7806500241294","servilletas abolengo 40 uni",29,1500,0,0,0,-1],
["7806500406488","nova clasica 1 rollo",29,1700,0,0,0,-1],
["7806500406709","Tohalla Nova x 3",31,1700,1090.0,12,0,39],
["7806500505006","Confort x 4 30 m",29,1700,0,0,0,-1],
["7806500506829","Confort x 4 22 Mt",29,1800,0,0,0,-1],
["7806500507642","confort 22mt",29,1200,0,0,0,-1],
["7806500508335","Papel Higienico Noble x 6",31,1800,1170.0,32,0,39],
["7806500508533","PAPEL HIGIENICO NOBLE X6 22M",29,1700,1300.0,10,0,-1],
["7806500508755","Confort x6 Doble hoja",29,4300,0,0,0,-1],
["7806500508779","Higienico Nole*4 23 m",31,1200,708.0,23,0,39],
["7806500731177","toallitas humedas babysec 45 uni",4,1300,890.0,12,0,24],
["7806500731184","Toallitas humedas Babysec 70 un",4,1500,1000.0,12,0,39],
["7806500960492","toalla femenina ladysoft nocturna ultradelgada 8 uni",29,1200,0,0,0,-1],
["7806500961710","protectores diarios ladysoft",31,1000,700.0,15,0,24],
["7806500962335","protector diario lady soft",4,1000,850.0,24,0,12],
["7806500962809","lady soft nocturna 7 u",31,1300,800.0,12,0,24],
["7806500962823","Lady Soft Cocturna alas 7 Un",29,800,0,0,0,-1],
["7806500962854","Ladysoft nocturna ultradelgada 14 u",31,2200,1450.0,24,0,24],
["7806505008281","lapiz corrector 7ml",32,1300,700.0,10,0,24],
["7806505018556","lapiz hexagonales jumbo",29,600,0,0,0,-1],
["7806505048720","stick torre",29,1000,0,0,0,-1],
["7806505048867","Plasticinas 6 colores",29,1600,1300.0,6,0,-1],
["7806505048966","Plasticinas 12 colores Torre",29,2500,0,0,0,-1],
["7806505055414","COLA FRIA TORRE 40G",29,1800,0,0,0,-1],
["7806505055421","cola fria torre 120g",29,2600,0,0,0,-1],
["7806505055438","cola fria torre",29,1900,0,0,0,-1],
["7806505055476","cola fria torre 500g",29,2200,0,0,0,-1],
["7806505160354","Temperas xl torre 6und.",29,2400,0,0,0,-1],
["7806505160408","Témperas XL 12 colores Torres",29,1300,0,0,0,-1],
["7806505957077","lapiz scripto",29,350,0,0,0,-1],
["7806505962217","Block dibujo 99 Eiffel 20 hojas",29,1300,0,0,0,-1],
["7806505978577","Cartulina Block 18 un Torre    200 c/u",29,1200,0,0,0,-1],
["7806505980129","regla facil",29,1200,0,0,0,-1],
["7806540001896","servilleta favoritaclasica 50 un",29,1790,0,0,0,-1],
["7806540006105","Servilletas practicas Favorita 200 un",29,2890,0,0,0,-1],
["7806540007904","Igienico Favorita 4 Un",31,1300,870.0,54,0,39],
["7806545010114","algodon hidrofilo americano",29,400,0,0,0,-1],
["7806710000889","tempera giotto 6 colores",29,1390,0,0,0,-1],
["7806710017023","Tempera Giotto 12 colores",29,450,0,0,0,-1],
["7806800001130","Virutilla n2 Manlac",29,690,0,0,0,-1],
["7806800002014","Lana multiuso Manlac",29,500,0,0,0,-1],
["7806800004230","Virutilla dorada Manlac x 3",29,2900,0,0,0,-1],
["7806810002264","Esponja Virutex x 6 $450 c/u",29,2490,0,0,0,-1],
["7806810002417","lavalozas impeke limon 300 ml",29,2690,0,0,0,-1],
["7806810004305","esponja multiuso lisa",29,1290,0,0,0,-1],
["7806810007344","toallas desinfectantes multiuso virutex 35 uni",29,1290,0,0,0,-1],
["7806810011051","escobillon economico azul",29,1290,0,0,0,-1],
["7806810011334","Escobillon Virutex",2,2300,1590.0,12,0,-1],
["7806810016353","limpiador desinfectante de superficies virutex vitalidad 900 ml",29,1600,1016.0,12,0,-1],
["7806810016506","limpiador desinfectante de superficies virutex lavanda  900 ml",29,1900,0,0,0,-1],
["7806810016513","limpiador desinfectante de superficies virutex primavera 900 ml",29,500,0,0,0,-1],
["7806810028875","cloro concentrado impeke 1 litro",29,1300,0,0,0,-1],
["7806810029001","Cloro ropa blanca Impeke 1L",29,1700,0,0,0,-1],
["7806810032803","Bolsa de basura Impeke 80x110 cm",29,1990,0,0,0,-1],
["7806810103015","VIRUTILLA VIRUTEX ACERO",29,1990,0,0,0,-1],
["7806810116350","Guantes multiuso Impeke",29,990,0,0,0,-1],
["7806810116367","guantes impeke",31,1800,1300.0,3,0,-1],
["7806810200769","Papel aluminio Ilko 7.5m",29,2100,0,0,0,-1],
["7806810200790","Alusa Film Ilko 20 m",29,900,0,0,0,-1],
["7806810800440","Bolsa Virutex 70 x 90 mediana",2,1300,1000.0,0,0,24],
["7806810800457","bolsas de basura viritex grande 80x110 cm 10 uni",2,1900,1390.0,10,0,24],
["7806810800761","Bolsa de basura medina  70x90 impeke",29,1200,1200.0,12,0,-1],
["78068308","NULL",29,1390,0,0,0,-1],
["7807210008153","Tempera Artel 100 ml negro",29,3490,0,0,0,-1],
["7807210008221","Tempera Artel verde100 ml",29,850,0,0,0,-1],
["7807210008283","Tempera Artel  100 ml amarillo",29,2600,0,0,0,-1],
["7807210010057","block medium 99 1/8",29,1600,0,0,0,-1],
["7807210011122","Marcadores Artel x 12",32,1800,1290.0,6,0,24],
["7807210011313","Marcadores Maxi Artel x 12",29,1700,0,0,0,-1],
["7807210011528","plumon artel",29,990,0,0,0,-1],
["7807210021534","plasticina artelina 12",29,600,0,0,0,-1],
["7807210026058","Tempera Artel 6 colores",32,1790,1150.0,6,0,-1],
["7807210026065","tempera Artel 12 colores",32,2200,1550.0,6,0,-1],
["7807210026263","Lapices de 12 colores Georgi",32,1800,1290.0,12,0,-1],
["7807210640056","cola fria artel 120 g",29,2290,0,0,0,-1],
["7807210650017","stix fix 8g",29,750,0,0,0,-1],
["7807210710018","Pistota silicona artel",32,5500,4230.0,12,0,24],
["7807232000074","papel lustre",29,300,0,0,0,-1],
["7807265002793","acuarela proarte",29,500,0,0,0,-1],
["7807265007132","Plasticina Triangular Proarte  x 12",29,1690,0,0,0,-1],
["7807265007545","marcador permanente azul",29,990,0,0,0,-1],
["7807265008146","cola-fria pro arte 225grs",32,1300,950.0,10,0,-1],
["7807265009044","lapiz bicolor delgado",29,990,0,0,0,-1],
["7807265009051","lapiz bicolor",29,990,0,0,0,-1],
["7807265009402","Compas escolar Proarte",29,990,0,0,0,-1],
["7807265009587","Tijera Escolar ProArte Mango Naranja",29,990,0,0,0,-1],
["7807265010194","cola fria pro arte 500grs",29,1590,0,0,0,-1],
["7807265014123","palitos para maqueta 2x2 mm",29,2300,0,0,0,-1],
["7807265014376","palitos para maqueta 3x4 mm",29,2200,0,0,0,-1],
["7807265014390","palitos para maqueta 4x4 mm",29,1300,0,0,0,-1],
["7807265014420","palitos para maqueta 6x6 mm",29,900,0,0,0,-1],
["7807265015137","tempera colores pro arte 6 colores",29,4990,0,0,0,-1],
["7807265015144","Tempera 12 colores Proarte  Color",29,1400,0,0,0,-1],
["7807265029417","cartulina de colores 18 hojas",29,790,0,0,0,-1],
["7807265034299","Cuaderno college cuadriculado amarillo",15,1300,700.0,34,0,24],
["7807265038785","PLUMON PIZARRA",29,1690,0,0,0,-1],
["7807265059711","Pistola silicona ro-arte",29,850,0,0,0,-1],
["7807265066924","Cuaderno universitario Ross 100 hjas",29,600,0,0,0,-1],
["7807265088902","Silicona líquida Isofit 30ml",29,790,0,0,0,-1],
["7807265094033","set destacadores",29,990,0,0,0,-1],
["7807265098697","plumones punta delgada",29,990,0,0,0,-1],
["7807265980336","carton piedra 40 x 50",29,2200,0,0,0,-1],
["7807265980459","cola fria pro arte",29,1200,0,0,0,-1],
["7807265980466","Cola Fria Proarte 125 g",29,790,400.0,12,0,-1],
["7807265980497","Stick Proarte 21 g",29,1600,0,0,0,-1],
["7807265981524","Lapiz plumon punta fina 6 colores",32,1390,990.0,8,0,-1],
["7807265982996","Block de dibujo Medio 99 1/8 ProArte",29,2490,0,0,0,-1],
["7807265991431","papel lustre 24 hojas",29,1300,0,0,0,-1],
["7808304315867","Esponja metálica inoxidable",29,1300,0,0,0,-1],
["7808304315911","trapero humedo teddy piso flotante",31,2000,1500.0,12,0,39],
["7808304315928","trapero teddy",31,2490,1500.0,3,0,24],
["7808304315942","Teddy lustra muebles limon spray",29,1590,0,0,0,-1],
["7808304316024","siliciona para auto teddy car 450 cc",31,2990,1370.0,23,0,39],
["7808304316031","tedy renovador",29,1300,0,0,0,-1],
["7808304316048","lustra mueble teddy",29,1690,0,0,0,-1],
["7808304316062","limpia vidrios teddy 500ml",31,1500,1090.0,12,0,39],
["7808304316192","Teddy Ambientador spray",29,1500,0,0,0,-1],
["7808304316208","Ambientador Teddy bebe",29,2490,0,0,0,-1],
["7808304316246","Ambientador Tddy spray",29,3990,0,0,0,-1],
["7808304316314","lustra muebles teddy",31,1690,1190.0,3,0,24],
["7808304316468","GUANTE TEDY TM",29,2500,0,0,0,-1],
["7808304316475","guante multiuso",29,1400,0,0,0,-1],
["7808304316604","Trapero multi uso Teddy",31,2490,1500.0,3,0,24],
["7808304350424","detergente concentrado 3 litros",29,1500,0,0,0,-1],
["7808304352077","Bombones Valentte  200 g",29,1890,0,0,0,-1],
["7808480003206","POP CORN CARAMELO 250G MARCO POLO",29,2600,0,0,0,-1],
["7808709500790","Leche semidescremada Surlat sin lactosa 1L",29,2900,0,0,0,-1],
["7808737700186","pulpa pierna de cerdo super cerdo 500 g",29,1990,0,0,0,-1],
["7808743600043","arroz bonanza",29,5600,0,0,0,-1],
["7808743600555","aceite bonanza",2,1990,1499.0,24,0,24],
["7808743605550","Duraznos mitades Bonanza 480 g",29,1490,0,0,0,-1],
["7808743605901","DURAZNO MITADES BONANZA 340G",2,1700,1275.0,6,0,12],
["7808743606519","Aceite vegetal Traverso 900ml",29,1600,0,0,0,-1],
["7808749501146","Pchuga deahuesada Ariztia 700 g",29,5600,4000.0,6,0,-1],
["7808749501153","Filrtitos de pollo Ariztia 650g",6,5000,4020.0,6,0,3],
["7808975783972","Shampoo IO Camomilla1000 ml",29,790,0,0,0,-1],
["7808975785822","Shampoo Coco y Vainilla IO 1000 ml",29,1000,0,0,0,-1],
["78093000050273","Margarina Qualy cremosa blue 500 g",29,850,0,0,0,-1],
["78093676","Chandellw chocolate nestle 130 g",20,890,665.0,8,0,30],
["7809536100870","protectores diarios fiorella 100 uni",4,3490,2000.0,8,0,24],
["7809536100894","protectores diarios fiorella 20 uni",29,1490,0,0,0,-1],
["7809536102003","parati nocturna",29,2200,0,0,0,-1],
["7809536102201","Toalla Fiorela morada 8 un",29,2990,0,0,0,-1],
["7809536102232","toallas femeninas ultrafinas fiorella 8 uni",29,2490,0,0,0,-1],
["7809558100599","Daily sucraloza 270 g",29,1400,0,0,0,-1],
["7809558101091","endulsante tradicional daily 270ml",2,1500,1010.0,10,0,-1],
["7809558101107","DAILY SAWCARINA Y SUCRALOSA 400ML",29,1200,0,0,0,-1],
["7809558101725","Daily Stevia 270 cc",2,2800,2076.0,6,0,24],
["7809558104856","manjar daily con alulosa 400 g",29,1600,0,0,0,-1],
["7809559200700","harina sin polvo",29,1300,0,0,0,-1],
["7809568600010","Jamon Serrano L. Astures 80 g",7,4300,3300.0,4,0,29],
["7809583800020","papel aluminio 7.5mts",29,1000,0,0,0,-1],
["7809586300411","Direct TV Pre-Pago",29,1500,0,0,0,-1],
["7809593101735","Super Drop adhesivo 2 g",29,1900,0,0,0,-1],
["7809601110438","Audifonos Headphones",29,800,0,0,0,-1],
["7809601113637","Triple Adaptador",29,1990,0,0,0,-1],
["7809604028099","Scott rindemax 4 rollos",29,800,0,0,0,-1],
["7809604029782","Higienico Scott x 6 aromas",37,1900,1300.0,120,0,58],
["7809604504012","Test de embarazo ESANtest",29,3000,2750.0,0,0,-1],
["7809611700513","hamburguesa la crianza vacuno 100gr",29,800,578.0,60,0,-1],
["7809611700667","Nuggets de pollo Super Pollo 400g",29,500,0,0,0,-1],
["7809611700865","hambuerguesa de pollo la crianza",29,800,400.0,40,0,-1],
["7809611703620","longanicilla la crianza",29,8500,0,0,0,-1],
["7809611706973","Crocante de pollo 100 g Super pollo",29,600,400.0,40,0,-1],
["7809611707444","Pechuga Deshuesada SP",6,5800,3890.0,10,0,0],
["7809611707468","Filetitos Super Pollo 700 g",6,6000,4400.0,12,0,0],
["7809611708267","Nugget Super Pollo 2.5 k (3500 EL KILO)",29,4300,0,0,0,-1],
["7809611708410","Hamburguesa Mastodonte 185 g  AS",29,1300,0,0,0,-1],
["7809611709639","Carne Molina tradicional King 250 g  AS",6,1300,800.0,12,0,0],
["7809611709783","Tuto Corto de pollo Super 800 g",29,1900,0,0,0,-1],
["7809611709806","trutro largo super pollo",29,5990,0,0,0,-1],
["7809611709851","alitas super pollo",29,14000,0,0,0,-1],
["7809611710611","Hamburguesa King Kong pollo",29,1500,0,0,0,-1],
["7809611714503","jamon pierna campestre la crianza 200 g",29,1200,0,0,0,-1],
["7809611714947","contre bandeja super pollo",29,1600,0,0,0,-1],
["7809611715548","Pizza Pepperoni La Crianza 700 g",29,2300,0,0,0,-1],
["7809611716149","nugget de pollo king 2.5 kilos - 5500k",30,10000,7000.0,4,0,0],
["7809611716989","Nuggets de pollo 300 g King",7,1200,790.0,12,0,0],
["7809611717597","churrasco super bif",29,450,0,0,0,-1],
["7809611717863","Albondigas Karmac",29,1200,0,0,0,-1],
["7809611717887","Carne Molida Especial 250 g  AS",29,700,0,0,0,-1],
["7809611718655","cubitos de pulpa super cerde 500 g",29,1700,0,0,0,-1],
["7809611718709","tiritas de pulpa 500 g super cerdo",29,2450,0,0,0,-1],
["7809611718730","Crocante de pollo King 90 g",29,1450,0,0,0,-1],
["7809611718860","Pechuga Cocida Sopraval 120 g",29,6300,0,0,0,-1],
["7809611718914","Medalla do pollo 100 g",29,600,0,0,0,-1],
["7809611719010","Albondigas Pavo Sopraval 300 g",12,1700,1230.0,0,0,3],
["7809611719058","Cubitos de Pollo 300 g",29,3500,0,0,0,-1],
["7809611719379","Nuggets Pop Corn SP 300 g",29,1850,1300.0,18,0,-1],
["7809611719607","Punta Costilla S.C. 950 g",6,9600,6600.0,10,0,0],
["7809611719959","hamburguesa super beef 100g",29,2000,0,0,0,-1],
["7809611720313","longanizilla 360 g",29,2600,0,0,0,-1],
["7809611720566","Pechuga deshuesada SP 770 g",29,2490,0,0,0,-1],
["7809611720573","FILETITOS DE POLLO SUPER POLLO 770G",29,2490,0,0,0,-1],
["7809611720641","Cubitos de pollo SP 330 g",29,1690,0,0,0,-1],
["7809611720870","Molina Super Beef 250 g",6,2300,1800.0,12,0,0],
["7809622000411","Colonia Lila Babu 240g",4,1900,1400.0,12,0,24],
["7809622000428","Colonia Green Babu 240g",29,1900,1400.0,7,0,-1],
["7809622000732","Colonia Yellow Babu 240g",4,1900,1400.0,12,0,24],
["7809629720039","Plasticina Lorca 12 unidades",29,2000,0,0,0,-1],
["78098152","Sal de selección Lobos 125 g",29,900,500.0,12,0,-1],
["781159309861","Azúcar Kmir 1k",29,2200,0,0,0,-1],
["781159442278","Tortilla Tremenda Marcelo 600 g",29,3900,0,0,0,-1],
["781159442315","queque arena tradicional",30,2500,1900.0,10,0,28],
["781159442322","queque arena chocolate",29,1990,0,0,0,-1],
["781159442360","Galletas surtidas Marcelo 600g",29,1900,0,0,0,-1],
["781159442391","quequitos sabores marcelo 6und",29,600,0,0,0,-1],
["781159442407","torta de mil hojas marcelo 600 gr",29,5500,4500.0,3,0,-1],
["781159478147","Bolsade basura grande",29,1990,0,0,0,-1],
["781159796975","Pintura cera Lava mas 1 l",29,4900,3500.0,6,0,-1],
["781159797071","pinza de ropa",29,1700,0,0,0,-1],
["781159797163","NULL",29,1300,0,0,0,-1],
["781159797576","Guante de Goma M",29,1300,0,0,0,-1],
["781159797583","guante multiuso yuge",29,1300,0,0,0,-1],
["781159797590","trapero lavamas 40 60 cm",29,2200,1800.0,12,0,-1],
["781159862007","Hallullitas Marcelo 20 un",25,2300,1304.0,4,0,28],
["781159862052","pan marcelo integral linaza avena maravilla y chia",29,2000,0,0,0,-1],
["781159862069","Queque VAinilla Marcelo  250 g",30,1500,1100.0,4,0,28],
["781159862090","Queque chocolate Marcelo 250 g",29,3990,0,0,0,-1],
["781159862106","Queque Tres leches Marcelo 250 g",30,1500,1100.0,10,0,28],
["781159862113","Queque platano Marcelo 250 g",29,750,0,0,0,-1],
["781159862137","Pan Linaza Chia Marcelo 320 g",29,1800,0,0,0,-1],
["781159862243","hallullas del dia marcelo 8 uni 560g",25,1600,907.0,2,0,28],
["7824907956063","jovan white set jovan musk",29,1000,0,0,0,-1],
["783094061880","ampolleta led rayovac luz blanca 8 watts",29,390,0,0,0,-1],
["7833493003837","magdalenas agua de piedra sabor tres leches",29,4990,0,0,0,-1],
["7840131003838","Grisines Ideal Ciboullete manteq. 120 g",29,6690,0,0,0,-1],
["78412699","Fox 20",9,2000,1000.0,30,0,-1],
["78414853","Carnival azul 20",9,2000,1000.0,20,0,-1],
["78420151","Hills blue 20",9,2500,1500.0,15,0,-1],
["7851700295080","Jalea Soprole frambuesa 110 g",29,600,0,0,0,-1],
["7861002733777","rerrero rocher  100g",29,600,0,0,0,-1],
["7861002900117","chocolate ferrero rocher 100g",29,6690,5900.0,3,0,-1],
["7861140820193","giga sabor lucuma 110ml",19,600,350.0,0,0,35],
["7861168793356","Gorro de aluminio Bauhunia",4,1500,850.0,5,0,39],
["7862107786484","frutos secos 100% natural 360g",29,1000,0,0,0,-1],
["7862107786491","fibra nature heart 30g",29,700,0,0,0,-1],
["7862140820190","giga sabor frambuesa 110ml",19,600,340.0,12,0,35],
["787359176128","Cebollas crujientes Fresh Topings",29,800,0,0,0,-1],
["787359176609","Crutones Cesar 80 Gr.",29,800,0,0,0,-1],
["788115350707","agua faustino durazno  500 cc",29,800,0,0,0,-1],
["788115350783","agua saborizada faustino frutos rojos sin gas 500cc",29,1400,0,0,0,-1],
["7891000120774","Alimento para gato atùn Felix",29,1490,0,0,0,-1],
["7891000248768","kit kat original 41 grs",8,900,650.0,16,0,31],
["7891000248829","kitt kat",29,600,0,0,0,-1],
["7891000249239","kit kat blanco 41 grs",29,1300,0,0,0,-1],
["7891000359983","kit kat cappuccino 41g",29,1200,0,0,0,-1],
["7891000368626","Galak Nestle Choco-Blco. 80 g",8,1600,1290.0,6,0,31],
["7891000369302","Prestigio Oblea Nestle 110 g",29,2300,0,0,0,-1],
["7891000369371","Crunch Nestle 80 g",29,2300,0,0,0,-1],
["7891000464908","Charge Nestle 40 g",29,2600,0,0,0,-1],
["7891024034095","Colgate Kids 50g",29,2600,0,0,0,-1],
["7891024113684","Jabon Protex Aloe 125 g",29,2200,0,0,0,-1],
["7891024131909","colgate triple accion 50g",4,1300,800.0,18,0,39],
["7891037005396","Shampoo Linic anticaspa cabello normal 350ml",29,3990,0,0,0,-1],
["7891037005402","Linic Shampoo Cab. graso 350 ml",29,5300,0,0,0,-1],
["7891150017368","dove oleo nutricion",29,300,0,0,0,-1],
["7891150023505","dove men",29,1500,0,0,0,-1],
["7891150040175","crema para peinar",29,1500,0,0,0,-1],
["7891150055223","dove oleo micelar",29,2600,0,0,0,-1],
["7891150067707","detergente liquido omo para diluir 500 ml",31,4690,3579.0,11,0,39],
["7891150070493","Drive Diluis 500 ml",29,3500,0,0,0,-1],
["78912359","Chocolate Baton 16 g",29,4800,0,0,0,-1],
["7891330016068","bombones amor carioca 200g",29,4800,0,0,0,-1],
["7891330017140","bombones amor carioca branco 200g",29,4800,0,0,0,-1],
["7891360679189","lapiz de colores faber",29,4800,0,0,0,-1],
["7891515476137","Golden chicker Sadia 300 g",29,1450,0,0,0,-1],
["7891515476144","Golden Chicken Peper. Sadia 300 g",29,2200,0,0,0,-1],
["7891515481827","Lasagna Sadia pech. pavo 600 g",29,2200,0,0,0,-1],
["7891515482022","Lasagna Sadia espinacas 600 g",29,2500,0,0,0,-1],
["7891515482251","Lasagns Sadia Bolognesa 600 g",29,17000,0,0,0,-1],
["7891515482268","Lasagna Sadia mix de quesos 600 g",29,7400,0,0,0,-1],
["7891515492816","Margarina Vegetal Qualy 250 g",29,1450,1000.0,6,0,-1],
["7891515537968","lasagna a la bolognesa 350g",29,1300,0,0,0,-1],
["7891515538354","lasagna mix de quesos 350g",29,1300,0,0,0,-1],
["7891515546137","nuggets pollo kids sadia 400grs",29,1000,0,0,0,-1],
["7891515549251","Pollo crispy Sadía 2k 8500k",29,650,0,0,0,-1],
["7891515551995","pechuga deshuesada sadia",29,2650,0,0,0,-1],
["7891515553715","Filetitos sin marinar Sadia 1 Kg",29,4000,0,0,0,-1],
["7891515564711","Arvejas Sadia 400 g",29,1400,0,0,0,-1],
["7891515564728","Choclo picado Sadia 400 g",29,2000,0,0,0,-1],
["7891515564735","Primavera Sadia 400 g",29,1500,0,0,0,-1],
["7891515564742","Sofrito Sadia 150 g",29,1500,0,0,0,-1],
["7891515573133","Margarina Qualy vegetal 500g",29,1300,0,0,0,-1],
["7891515575625","Pechugaa sin marinar Sadia 450 g",29,1800,0,0,0,-1],
["7891528039350","Gel dental Dento Junior 50 g",29,1800,0,0,0,-1],
["7891597502953","tijera",29,800,0,0,0,-1],
["7891962056746","Pan Blanco Bauducco  400 g",29,1800,0,0,0,-1],
["7891962056753","pan masa madre bauducco 400g",29,1400,0,0,0,-1],
["7891962060453","Tostada clasica Bauducco 142 g",29,2300,0,0,0,-1],
["7891962064048","Pan Bauducco masa madre 390 g",21,1800,1369.0,4,0,29],
["7891962064055","Pan Integral Bauducco",21,1900,1369.0,4,0,29],
["7892017016005","pinzas de madera (perros de ropa) cederlim 24 uni",29,21500,0,0,0,-1],
["7892840817589","NULL",29,4500,0,0,0,-1],
["7892840817596","Dritos Queso 150 g Evercrisp",29,4500,0,0,0,-1],
["7893000047297","margarina vegetal deline sadia 500g",29,4500,0,0,0,-1],
["7893000050273","margarina qualy cremosa blue 500 g",29,4500,0,0,0,-1],
["7893000065253","Margarina Vegetal Qualy 500 g",20,2300,1800.0,50,0,62],
["7893000083561","Nugets de pollo Rikitos 400 g",29,300,0,0,0,-1],
["7893000747210","suprema de pollo $8000 k",29,4900,0,0,0,-1],
["7893000801363","pizza congelada sadia mix de quesos 460g",29,4300,0,0,0,-1],
["7893000801448","pizza congelada sadia mozzarella 440g",29,1300,0,0,0,-1],
["7893000801523","pizza congelada sadia jamon, mozzarella y champignon 460g",29,900,0,0,0,-1],
["7893000801608","pizza congelada sadia chorizo 460g",29,500,0,0,0,-1],
["78934696","Tic Tac",29,5900,0,0,0,-1],
["78939387","trencito tubito 16 grs",29,3600,0,0,0,-1],
["7894904222896","Filetitos de pechuga de pollo Seara",29,7990,0,0,0,-1],
["7894904223473","trutro de ala seara 1kg",29,5900,0,0,0,-1],
["7896018700628","Toallas Humedas Huggies 48 un",29,990,0,0,0,-1],
["7896029047286","Wiskas Carne 85 g Cachorro",29,1000,0,0,0,-1],
["7896187800013","Moldadientes Estilo",29,600,400.0,12,0,-1],
["7898024395072","Ferrero Rocher corazon",29,1200,0,0,0,-1],
["7898024395232","Nutella 140g",29,3290,2517.0,4,0,-1],
["7898024396994","chocolate ferrero rocher 12 uni",29,1000,0,0,0,-1],
["7898024397151","estuche de bombones variados ferrero collection 77 g",29,1300,0,0,0,-1],
["7898422746759","jabon dove",4,1300,800.0,12,0,-1],
["7898509281272","Palos de brocheta",29,250,0,0,0,-1],
["7898591453137","Tubitos Fini 80 g",13,1300,900.0,10,0,-1],
["7898591453168","Gomitas tubos acidos 80 g",29,2000,0,0,0,-1],
["7898591453229","Gomitas dentaduras 15g",29,3990,0,0,0,-1],
["7898591453243","Gomitas gusanos 90 g",13,1300,900.0,10,0,-1],
["7898591453274","gusnos acidos fini 90gr",18,1200,900.0,6,0,46],
["7898591453304","Gomitas platanos 90 g",29,1300,990.0,10,0,-1],
["7898591453342","Gomitas frutillas y crema Fini 15g",29,1300,0,0,0,-1],
["7898591454349","Ositos Fini 90 g",18,1300,900.0,6,0,46],
["7898916651057","Hilos de volantín neón",29,1300,0,0,0,-1],
["7898952516334","botox cauterisacion",4,3990,2990.0,1,0,24],
["7899567245169","Carne Molida vacunoFriboi 500 g",29,1600,0,0,0,-1],
["7899567245213","Posra Rosada Cubos 500 g",29,1600,0,0,0,-1],
["7899970400032","Chocolate Hershey`s 92 g blanco",29,1600,0,0,0,-1],
["7899970402548","Chocolate Hershey`s 92 g",29,1600,0,0,0,-1],
["7899970402562","hersheys",29,1600,0,0,0,-1],
["7899970402586","Hersheys air 85g",13,1700,1076.0,10,0,29],
["7899970402807","Chocolate blanco Hersheys 82g",13,1500,1040.0,6,0,29],
["7899970402845","Hersheys cristal 77g",13,1700,1280.0,6,0,29],
["7908228803256","cintas ácidas frutilla Fini 70g",29,990,0,0,0,-1],
["7908228803270","cintas ácidas frutas silvestres Fini 70g",29,990,0,0,0,-1],
["7908228804345","Marshmallows 80 g",29,800,0,0,0,-1],
["793573241962","score energetica 500 ml",29,1490,0,0,0,-1],
["7945040685004","detergente M&V con suavizante 5 litros",29,4500,0,0,0,-1],
["798190253701","score gorilla edicion limitada 473ml",5,1300,858.0,24,0,63],
["798190253787","Score Zero Energy Drink",29,900,0,0,0,-1],
["8000500190012","kinder bueno 100g",8,990,750.0,6,0,29],
["8000700000005","Jabon Dove 100 g",29,3000,0,0,0,-1],
["80050094","kinder maxi 21g",8,750,390.0,10,0,29],
["8011033004004","cous cous",29,2000,0,0,0,-1],
["80135463","nutella 200g",30,6900,4500.0,12,0,29],
["801610001165","Coca Cola 1.25 L Retornable",29,1000,0,0,0,-1],
["80906032","kinder tronki 18g",29,1000,0,0,0,-1],
["809611707468","filetitos de pollo super pollo",29,1000,0,0,0,-1],
["8211511115707","Tazon camiseta U x 2",29,2200,0,0,0,-1],
["8232538565337","croquera carta",29,690,0,0,0,-1],
["83061577","lana lisa 100grs",29,1400,0,0,0,-1],
["8414034620202","goma de borrar factis",29,6800,0,0,0,-1],
["8414606867516","energetica lynx apple and melon",29,1800,0,0,0,-1],
["8423453910092","energetica lynx sandía",29,550,0,0,0,-1],
["8423453910160","energetica lynx exotic",29,1400,0,0,0,-1],
["8445290004383","Trencito El Manjar 128 g",8,2300,1717.0,6,0,31],
["8445290014504","leche condensada nestle 200g",29,13990,0,0,0,-1],
["8445290112132","Cereal Chocapic 230",29,5590,0,0,0,-1],
["8445290118288","Leche en polvo Nido 700g",29,5590,0,0,0,-1],
["8445290156396","Trencito Triton 125 g",29,850,0,0,0,-1],
["8445290170019","Chocapic 30 Gr.",38,500,350.0,12,0,31],
["8445290193193","Nido Buen dia  130 g",20,1400,1018.0,12,0,31],
["8445290253699","Triton Helado 80 ml",19,1200,850.0,18,0,40],
["8445290262387","leche nido entera 1350g",2,16990,10100.0,6,0,31],
["8445290262882","La Cremeria Savory 1 Lt",29,6200,4970.0,10,0,-1],
["8445290262912","Helado Trencito nestle savory 900 ml",29,450,0,0,0,-1],
["8445290298782","Salsa Bolognesa Maggi 47 g",29,1400,0,0,0,-1],
["8445290317742","oblea alteza helado 140g",29,5490,0,0,0,-1],
["8445290386892","sahne-nuss sin azucar 90g",29,900,0,0,0,-1],
["8445290401182","leche evaporada ideal nestle",29,900,0,0,0,-1],
["8445290421357","Gallete Grill Albahaca 140 g",17,1600,1120.0,6,0,-1],
["8445290421388","Galleta Grill Jam. Cerrano 140 g",17,1600,986.0,14,0,31],
["8445290448194","MINI MILO 30G",30,450,200.0,8,0,31],
["8445290516473","Cereal Trix nestle 200 g",29,4990,0,0,0,-1],
["8445290587947","Mega Delta Savery 650 ml",19,6100,4130.0,6,0,40],
["8445290648907","Chocapic 100 g",30,900,630.0,3,0,31],
["8445290649331","Cereal Milo 100 g",30,1000,630.0,4,0,31],
["8445290649362","Cereal Trix 30 g",30,1000,630.0,3,0,31],
["8445290649393","zucosos ahorro 100g",38,1000,580.0,10,0,31],
["8445290774521","milo cereal  805 g",29,990,0,0,0,-1],
["8445290841834","LECHE MILO SIN LACTOSA 200ML",20,650,368.0,6,0,30],
["8445290841865","milo sin lactosa",29,990,0,0,0,-1],
["8445290846853","Crema de Tomate Maggi 45 g",29,990,726.0,6,0,-1],
["8445290855329","Sopa maggi parauno sabor consome de pollo",29,2200,0,0,0,-1],
["8445290906250","morocha mini crunchy 40g",30,450,200.0,8,0,31],
["8445290932457","capri menta 90g",29,1600,0,0,0,-1],
["8445290932884","Triton galletas Choco White 126 g",29,690,0,0,0,-1],
["8445290952325","MOROCHA MCKAY 120G",30,1100,80.0,5,0,31],
["8445291025417","gallletas milo nestle 110g",30,990,635.0,6,0,31],
["8445291025721","Galleta Navidad Mkay 170 g",29,990,0,0,0,-1],
["8445291028081","Leche evaporada Nestle 366 ml",2,2200,1247.0,6,0,31],
["8445291070158","Cereal estrellitas 270g Nestlé",2,2500,1417.0,2,0,31],
["8445291211827","Chandelle nestle  130 g",20,890,665.0,8,0,30],
["8445291218802","Semola leche caramelo nestle",50,700,550.0,120,0,30],
["8445291219236","Semola leche frambuesa nestle",50,700,450.0,120,0,30],
["8445291219267","Semola con leche maracuya",29,4900,0,0,0,-1],
["8445291225213","Proteina de soya maggi 55g",29,3900,0,0,0,-1],
["8445291263611","criollitas 60g",30,900,640.0,4,0,31],
["8445291263673","puré de papas Maggi 6 porciones",2,2300,1600.0,4,0,31],
["8445291423923","Danki Choco Frambuesa",19,2100,1599.0,1,0,40],
["8445291533110","Paleta Trencito nestle",19,1200,820.0,12,0,40],
["8477060720506","Audifonos P47 5.0+EDR",29,1000,0,0,0,-1],
["8477060800024","Cargador  3A 5G",29,2000,0,0,0,-1],
["8477060812423","Soporteb con BasedeIman",29,3500,0,0,0,-1],
["8477060813000","Audifono KM Earphone K88",29,1600,0,0,0,-1],
["8477060813062","Audifono P47 5.0+EDR",29,600,0,0,0,-1],
["8477060815011","Cable Tipo C",29,1300,0,0,0,-1],
["8588988601171","Cintillo de tela Keke",29,1500,0,0,0,-1],
["8590160955088","CHOCOLATE MILKA EXTRA CACAO 100G",13,2300,1750.0,6,0,8],
["8630111100065","GOMA EVA ROSA",29,1300,0,0,0,-1],
["8680202110169","Levadura Pasha 500 g",29,3900,0,0,0,-1],
["8680202110763","levadura pasha 125g",2,1700,963.0,4,0,24],
["8682213005922","Sembol togo 55g",13,500,311.0,12,0,8],
["8690146125310","Gomitas Bebeto manzana 180g",13,1300,979.0,5,0,8],
["8690146125372","gomitas bebeto frutilla 180g",29,1200,0,0,0,-1],
["8690146125389","Gomitas Bebeto strawberry180g",29,1500,0,0,0,-1],
["8690146125402","Wacky Sticks",29,600,0,0,0,-1],
["8690146125426","Masticable Bebeto mix fruta 180g",29,1990,0,0,0,-1],
["8690146151708","Gumy's tubo frambuesa banana 200g",29,200,0,0,0,-1],
["8690146160281","Sour Blast Fizzy",29,4500,0,0,0,-1],
["8690146164272","Gomitas Gunys 200 g",29,5500,0,0,0,-1],
["8690492501677","Chicle kilométrico Gunys",13,1200,890.0,12,0,8],
["8691262705011","esponja para zapatos",31,1500,0,2,0,24],
["8691707060231","Huevo de chocolate  Ozmo",29,1300,0,0,0,-1],
["8696630143013","lustra mueble",31,1990,1490.0,6,0,39],
["8697288512800","Sembol mini",29,1200,0,0,0,-1],
["8697462202398","bombon sweet smile 12u",13,4500,3000.0,6,0,26],
["8710679156237","papas pre fritas farm frites 2 kilos",29,990,0,0,0,-1],
["8710679157371","papa pre frita 2 kl",29,850,0,0,0,-1],
["8712561056625","Pepsodent white now Gold",29,500,0,0,0,-1],
["8716200454995","leche evaporada bella holandesa 405g",29,2500,0,0,0,-1],
["8717163773635","Pepsodent White now infinite",29,2590,0,0,0,-1],
["8717644190494","Jabón Dove 90g",29,1300,0,0,0,-1],
["8717644469101","Pepsodent infantil 64 g",29,4590,0,0,0,-1],
["8718699591199","Ampolleta Philips 53W",29,990,0,0,0,-1],
["8719200694156","Margarina Dorina 125g",29,1200,0,0,0,-1],
["872237006991","GASA",29,1490,0,0,0,-1],
["8800577002856","Pack de colets Max belle",29,1490,0,0,0,-1],
["8801055709229","Nescafe fina seleccion 50 g",29,990,0,0,0,-1],
["8802010426236","pistola silicona",29,1000,0,0,0,-1],
["8802010512144","Platos de cartón Vieri",29,990,0,0,0,-1],
["8802020272717","Carpeta  colores",29,1300,0,0,0,-1],
["8802020295617","Bombillas Vieri",29,1300,0,0,0,-1],
["8802020529132","lapiz bicolor",29,2500,0,0,0,-1],
["8802020530473","pqlo de maqueta",29,690,0,0,0,-1],
["884394007285","Aloe Vera OKF 500 ml Original",29,690,0,0,0,-1],
["884394007339","Aloe Vera Mango 500 Ml",29,1300,0,0,0,-1],
["884394007353","Aloe Vera Granada 500 Ml.",29,1300,0,0,0,-1],
["884394007414","Aloe Vera OKF 500 ml Coco",29,1300,0,0,0,-1],
["8888021200171","bateria energizer max 9v",29,1300,0,0,0,-1],
["8888021206074","Pila AA1 Energizer MAX",29,1000,0,0,0,-1],
["8888021206081","pila energizer max AAA1",29,600,0,0,0,-1],
["8888021303841","Ampolleta Rayovac 8W",29,1490,0,0,0,-1],
["8888021305524","Ampoyeta led rayovac",29,700,0,0,0,-1],
["8888021305548","Ampolleta 8W luz blanca",29,1200,0,0,0,-1],
["8888021307917","Ampolletas Eveready 6 w",29,1500,0,0,0,-1],
["8888077101101","yam yam meiji chocolate 50 g",29,1500,0,0,0,-1],
["8888077101125","yan yan meiji frutilla 50 g",29,5990,0,0,0,-1],
["8888645303784","Pertaminas 0.5 mm",29,1400,0,0,0,-1],
["8888841028733","Crema tratamiento capilar Biostase 320 g",29,1400,0,0,0,-1],
["8888841037827","toallitas de higiene para manos 15und",29,1400,0,0,0,-1],
["8888841041183","crema nenitos 750ml",29,1400,0,0,0,-1],
["8888841042302","colonia nenitos",29,2100,0,0,0,-1],
["8888841042319","colonia nenitos",29,2100,0,0,0,-1],
["8888841045860","Estuche Fresh Love",29,2100,0,0,0,-1],
["8935048604106","aloe win frutilla 500ml",29,1500,0,0,0,-1],
["8935048604113","aloe win mango 500ml",29,1500,0,0,0,-1],
["8935048610664","Bebida aloe vera sabor coco 500ml",29,1500,0,0,0,-1],
["8935048610671","Bebida aloe vera sabor arándano 500ml",29,1500,0,0,0,-1],
["8935330206704","binatur protein sabor vainilla 330ml",29,1500,0,0,0,-1],
["8935330206711","binatur protein sabor cafe helado 330ml",29,1000,0,0,0,-1],
["8935330206728","binatur protein sabor chocolate 330ml",29,1300,0,0,0,-1],
["8935330206735","Agua de chia sabor frutilla 290ml",5,1600,1100.0,10,0,-1],
["8935330206742","Agua de chia sabor coctail de frutas 290ml",29,1500,0,0,0,-1],
["8935330206766","Agua de chia sabor mango 290ml",5,1600,1100.0,10,0,-1],
["8935330218660","Agua de chia sabor kiwi 290ml",5,1600,1100.0,10,0,-1],
["8964000438848","chicle bubbalong 1 metro",29,1500,0,0,0,-1],
["8977677123146","brocha escolar",29,1700,0,0,0,-1],
["9002490100070","red bull energizante 250 ml",5,1700,1199.0,9,0,5],
["9002490214852","red bull energizante sugarfree 250 mlo",41,1600,1098.0,9,0,5],
["9002490221010","red bull energisante 355 ml",5,2200,2038.0,9,0,5],
["9002490238841","Red Bull 473 ml",5,3000,1290.0,9,0,5],
["90415319","RedBull Blue 250 ml",5,1700,1098.0,8,0,5],
["90424496","Red Bull Yellow 250 ml",5,1700,1097.0,9,0,5],
["90446245","Red Bull Purple Acai 250 ml",5,1700,1098.0,8,0,5],
["90446849","RedBull Red 250 ml",5,1700,1098.0,8,0,5],
["90454707","Red bull sabor fruta del dragón 250ml",29,1700,1100.0,12,0,-1],
["90456695","Red bull sabor Juneberry 250ml",29,1500,0,0,0,-1],
["9120033164782","MR BIG energi drink",29,1500,0,0,0,-1],
["9482480796102","Poett Flores Primavera 1800 Ml",29,1700,0,0,0,-1],
["964278161","arena sanitaria vegetal para gatos eko kat 2k",29,3990,0,0,0,-1],
["9780166000007","virutila liquida",31,1900,1290.0,6,0,-1],
["9780201379624","Postre helado Fiorentina vainilla chocolate 1L",29,1800,0,0,0,-1],
["99343675","Lotería",46,2490,2100.0,12,0,24],
["9999916820165","alusa",29,1000,0,0,0,-1],
["8000825540103","Bartra adhesiva Giotto",15,800,450.0,30,0,-1],
["8000825540202","Barra adhesica Giotto 21 g",15,1200,800.0,19,0,-1],
["7801620001223","Kem desechable 3L",5,2500,2084.0,4,0,5],
["7801610333525","Sprite 3L retornable",5,2800,2007.0,1,0,9],
["botella","botella",29,300,100.0,0,0,-1],
["8445290921727","Mega dulce de leche 90ml",19,2100,1599.0,16,0,40],
["7801610560174","Express Sprite 273ml",5,500,0,0,0,9],
["7801620290184","Bils lata 350ml",5,1100,623.0,18,0,5],
["7801620300203","Pap lata 350ml|",5,1100,0,0,0,5],
["pan","pan",29,200,89.0,0,0,-1],
["ens1","ensalada",29,700,0,0,0,-1],
["ens2","ensalada cocida",29,1000,0,0,0,-1],
["pebre","pebre",29,1000,0,0,0,-1],
["798190243177","Score original 500ml",5,1300,770.0,24,0,28],
["7501013101966","Jumex pina coco 335ml",5,1100,797.0,12,0,6],
["0737186939939","Altos de la patagonia 1000c",5,1200,800.0,0,0,44],
["7801552007409","Helado Flagg Trendy",19,1200,923.0,12,0,42],
["7801552007393","Helado Hawai Trendy",19,900,693.0,20,0,42],
["7801552002459","Pina colada Trendy",19,600,315.0,24,0,42],
["bidon","Bidón de agua",29,1500,900.0,60,0,36],
["carbon1","Carbón bolsa negra",29,2300,1600.0,30,0,20],
["carb2","Carbón papel",29,2800,1800.0,20,0,20],
["promoC1","PROMO carbon negro",29,6000,4800.0,20,0,20],
["promoC2","PROMO carbon papel",29,5000,3600.0,20,0,20],
["cebolla","Cebolla",33,400,200.0,100,0,24],
["papa","Papas",33,800,800.0,23,0,24],
["limon","Limón",33,1300,800.0,19.352,0,24],
["palta","Palta",16,5900,5200.0,0,1,24],
["cebolla2","cebolla morada",33,600,300.0,19,0,24],
["lechuga1","Lechuga escarola",33,1300,1000.0,20,0,24],
["lechuga2","Lechuga costina",33,1200,700.0,20,0,24],
["pimenton","Pimentón",33,800,800.0,10,0,24],
["pepino","Pepino",33,800,500.0,20,0,24],
["zanahoria","Zanahoria",33,200,80.0,100,0,24],
["cebollin","Cebollín",33,700,350.0,7,0,24],
["ajo","Cabeza de ajo",33,500,250.0,13,0,24],
["banana","Plátano",16,2000,1500.0,20,0,24],
["aji","Ají verde",33,100,50.0,10,0,24],
["bombitas","Bolsitas de ají",33,300,150.0,10,0,24],
["poroto verde","Poroto verde natural",33,1000,600.0,0,0,24],
["champiñon","Champiñón",33,2000,1400.0,7,0,24],
["chapsui","chapsui",33,1500,1000.0,2,0,24],
["choclo","Choclos",33,2000,1000.0,0,0,24],
["7802408000261","Bebida Fruna 2L frutal",5,1000,500.0,6,0,18],
["7802408000230","Bebida Fruna 2L Cola",5,1000,500.0,6,0,18],
["7802408000247","Bebida Fruna 2L orange",5,1000,500.0,18,0,18],
["7802408000278","Bebida Fruna 2L papaya",5,1000,500.0,18,0,18],
["7802408000742","Bebida Fruna 2L limón sour",5,1000,500.0,15,0,18],
["7802408000285","Bebida Fruna 2L ginger ale",5,1000,500.0,22,0,18],
["7802408000254","Bebida Fruna 2L piña",5,1000,500.0,12,0,18],
["promojugos","PROMO jugos en polvo",29,1000,750.0,30,0,-1],
["041789001918","Maruchan de pollo 64g",2,1300,970.0,28,0,24],
["041789001956","Maruchan de camaron 64g",2,1300,970.0,24,0,24],
["041789001925","Maruchan carne de res 64g",2,1300,970.0,26,0,24],
["041789001987","Maruchan camaron con chile 64g",2,1300,970.0,13,0,24],
["041789001888","Maruchan carne asada 64g",2,1300,970.0,11,0,24],
["7802420510083","Campiñones laminados 4000g",33,2590,1959.0,5,0,29],
["7804611552315","Frutillas en almibar 567g",2,1800,1247.0,4,0,24],
["7802410004424","Salsa chocolate Blanco gourmet",2,2200,1247.0,1,0,24],
["7802920008370","Queso Fresco 450g",7,3100,2340.0,6,0,24],
["7805080695084","Cloro gel Clorinda 900ml",31,1990,1480.0,12,0,24],
["7803908001314","Helado Guallarauco mango",19,1200,700.0,15,0,9],
["7802800579587","Zuko mango",2,250,149.0,30,0,25],
["7802800570799","Zuko Guanabana",2,250,149.0,30,0,25],
["7802800570805","Zuko Guallaba",2,250,149.0,25,0,25],
["7802800001989","Zuko Lulada",2,250,149.0,25,0,25],
["7802800579556","Zuko Manzana",2,250,149.0,25,0,25],
["7802800579525","Zuko Pina",2,250,149.0,30,0,25],
["7802800001910","Zuko huesillo",2,250,149.0,30,0,25],
["7802800579570","Zuko Damasco",2,250,149.0,25,0,25],
["7802800001880","Zuko Frambuesa",2,250,149.0,30,0,25],
["7802800001897","Zuko Melon tuna",2,250,149.0,30,0,25],
["7802800578566","Zuko Limonada",2,250,149.0,30,0,25],
["7802800579280","Zuko limon",2,250,149.0,30,0,25],
["7802800586608","Livean Huesillo",2,250,149.0,30,0,25],
["7802800576517","Jugos Livean Frutilla",2,250,149.0,30,0,25],
["7802800576456","Jugos Livean Pina",2,250,149.0,30,0,25],
["7802900003401","Leche Zero Lacto sopr",20,1800,1300.0,10,0,43],
["041789001833","Maruchan Queso",2,1300,970.0,12,0,-1],
["8445291263703","Pure papas MAggi 93 g",2,1500,1120.0,4,0,31],
["0661094233585","giulietta",31,1990,1130.0,23,0,39],
["6973020674435","CERA DEPILADORA",4,1600,907.0,23,0,39],
["7808304315966","Paño esponja teddy 3pcs-",31,1300,737.0,0,0,39],
["6973726254610","Gorro Aluminio Flower secret",4,1500,850.0,4,0,39],
["5188988107364","Gorro tina shunyida",4,1000,567.0,5,0,39],
["7806810800433","Bolsa de basura pequeña",31,990,590.0,2,0,24],
["7805040005304","Killer mata araña y cucaracha",31,3100,2500.0,6,0,24],
["7803473005960","Mankeke 30 un",30,900,517.0,11,0,19],
["7803525001490","Galleta Cgocochips NT",30,600,420.0,12,0,19],
["757528049553","Takis Fuego 113 g",30,1500,1050.0,15,0,19],
["7802420010170","Papas Frit. MP 180 g barbiq",30,1990,1660.0,4,0,29],
["7802420010187","Papas Frit MP 180 g limon",30,2400,1420.0,4,0,29],
["7802420010200","Papas Frit MP crem ciboull",30,2300,1360.0,4,0,29],
["7802420004469","Papas Frit MP Sal del him y pi",30,2400,1660.0,4,0,29],
["7802420009402","Crunchis MP 280 g queso",30,2200,1660.0,4,0,29],
["7802420010361","Crunchis 200 gMP tubo queso",30,1800,1500.0,4,0,29],
["7802215515347","Champañitas 85g",30,1100,800.0,3,0,6],
["8445290767332","Tritón bañada vainilla 114g",30,1200,800.0,2,0,31],
["7798303170409","Aceite Solemne 900 ml",2,1790,1261.0,12,0,24],
["7793253003548","Poet flores prim 900 ml",31,1700,1290.0,12,0,39],
["7802500003023","Corbatas Lucchetti 400 g",2,1200,781.0,6,0,25],
["7801320240953","Aceite Miraflores 500 ml",2,1890,1460.0,1,0,25],
["7613030008897","Mini Grill 35g",30,450,200.0,12,0,31],
["4025700001962","Chocolate Blanco Milka",13,2300,1470.0,6,0,8],
["7806505980358","Transportador torre",32,800,495.0,10,0,8],
["7803495002220","Pan Hamburguesa selecta 520g",21,2000,1312.0,3,0,22],
["7803495002237","Pan Hot Dog selecta 415g",21,1900,1187.0,5,0,22],
["7803495001759","Pan Integral 580g selecta",21,2500,1293.0,3,0,22],
["7803495001742","Pan Blanco selecta 580g",21,2590,1833.0,4,0,22],
["7801620853396","Nectar Watts Naran 0 1.5L",5,2000,1570.0,14,0,5],
["7801620006341","Nectar Watts Piña 0 1.5L",5,2000,1570.0,12,0,5],
["7801620007607","Nectar Watts Maracuy 0 1.5L",5,2200,1570.0,12,0,5],
["7801620008796","Nectar Watts Mango 0 1.5L",5,2200,1570.0,12,0,5],
["7801620000738","Nectar Watts Durazno 0 1.5L",5,2200,1414.0,12,0,5],
["7801620003500","Nectar Watts TuttAr 1.5L",5,2200,1590.0,12,0,5],
["7801620011635","Nectar Watts Piña 1.5L",5,2000,1570.0,14,0,5],
["7801620001902","Nectar Watts Manzana 1.5L",5,2000,1590.0,12,0,5],
[".7801620004132","Nectar Watts NarPla 1.5L",5,2000,1570.0,12,0,5],
["7801620011628","Nectar Watts Damas 1.5L",5,2000,1570.0,12,0,5],
["7801620002343","Nectar Watts Tuttkiw 1.5L",5,2000,1365.0,14,0,5],
["7802500221663","Lasaña Lucchetti 360g",2,1900,1077.0,7,0,25],
["7801620005153","Gatorade Roja 1.1L",5,1900,1356.0,10,0,5],
["7801620340155","Limon soda lata 350ml",5,1100,623.0,18,0,5],
["7801620852689","Pepsi lata 350ml",5,1100,632.0,18,0,5],
["7801610281031","Nordic mist ginger ale 3L",5,3200,2500.0,7,0,9],
["7801610333426","Fanta 3L Retornable",5,2800,2070.0,7,0,9],
["746747014404","Rollito de canela marcelo 100g",30,850,400.0,8,0,28],
["7500435111270","Ariel 400 g",31,1590,1090.0,18,0,39],
["7791290796027","Omo Bicarbonato 800 gr",31,2500,1590.0,18,0,39],
["7791290791466","Omo Diluir piel sen 500 ml",31,4490,3390.0,12,0,39],
["7804682770021","Bolsa don ahorr 70*90",31,1290,790.0,15,0,39],
["7808304315881","Bolsa Teddy 50*70",31,800,390.0,40,0,39],
["7804682770038","BOlsa don ahorr 80*110",31,1800,1190.0,15,0,39],
["7805020002606","Limpiapisos Excell vainilla",31,1390,790.0,10,0,39],
["7805020311029","Limpiapisos Exell Citrico 900",31,1290,790.0,5,0,39],
["7805040005687","Clorogel Igenix lavanda 900",31,1400,1040.0,12,0,39],
["7806500404736","Tohalla Abolengo *3",31,1300,762.0,0,0,39],
["736372018960","The Iola Pizza peperoni 483g",12,6490,4950.0,2,0,22],
["736372018953","The Iola Pizza Napolitana 527g",12,6490,4950.0,2,0,22],
["736372018977","The Iola Pizza Salami 483g",12,6490,4950.0,2,0,22],
["736372018946","The Iola Pizza Margarita 471g",12,6490,4950.0,2,0,22],
["7899970402838","Chocolate Herhey 40",8,1700,1040.0,0,0,29],
["7804661490858","Salsa de soya Croket",2,1490,1040.0,3,0,24],
["7802410070801","Alcaparras gourmet",2,1990,1393.0,3,0,45],
["7802410004196","Salsa Teriyaki gourmet",2,2400,1680.0,0,0,45],
["7805300049598","Tanax aranas baratas 220 cc",31,2700,1990.0,12,0,24],
["7805300049161","Tanax casa y jardin 220 cc",31,2990,2090.0,0,0,24],
["7805300049673","Tanax moscas zancudos",31,2990,2090.0,11,0,24],
["7801552007850","Casata vainilla Trendy 1L",19,2800,2153.0,3,0,42],
["7802900001520","Leche protein cacao uht 200",20,790,600.0,12,0,43],
["7802900197070","leche choc zerolac 200 ml sopr",20,650,368.0,6,0,43],
["90457142","Red Bull verde 250ml",5,1700,1080.0,12,0,5],
["7801916038797","Snackin salame18g San Jorge",30,600,380.0,22,0,38],
["7613036185318","Mega savory almendra",19,2100,1600.0,21,0,40],
["062020050526","Nutela Go 52 g",13,1900,1399.0,12,0,29],
["7803495002114","pan blanco selecta750g",25,2900,1356.0,6,0,22],
["7803495004927","pan integral al toque 480g",25,1850,1150.0,4,0,22],
["7803495004910","pan blanco al toque 480g",25,1900,1390.0,12,0,22],
["7803495004620","pan de pascua la selecta 500g",25,2690,1650.0,2,0,22],
["7803495002343","pan de pascua la selecta 700g",25,4690,2998.0,2,0,22],
["7804602600360","conos barqullos selecta 10u",17,1600,1002.0,4,0,22],
["7804602600377","conos barquillos selecta 8u",17,2600,1650.0,4,0,22],
["7802800531141","Cocoa Raff 200 g",2,1690,1183.0,6,0,25],
["7802820454307","Benedictino limon gengibre 2 l",5,1600,949.0,6,0,9],
["7802820454918","Benedictino Pomelo menta 2l",5,1600,949.0,6,0,9],
["7802820454109","Benedictino Manzana 2 l",5,1600,949.0,6,0,9],
["7801620008505","Pop Nabilzpap 500 cc",5,1400,911.0,12,0,5],
["7798060853614","Queso untable Tonadita 180g",20,1200,672.0,3,0,8],
["7501001163983","Desodorante Old Spice barra",26,2990,2000.0,12,0,25],
["7500435113465","Desodorante Gillette Gel",26,3800,2800.0,12,0,25],
["7501001309060","Desodorante Old Spice barra",26,3500,1965.0,4,0,25],
["7501035907508","Desodorante Speed Stick barra",26,2290,1490.0,4,0,25],
["7802420004636","Alino completo Edra",3,400,187.0,6,0,29],
["7802420004988","Romero Edra",3,400,187.0,6,0,29],
["7802351524609","Vinagre Tinto DJ 250ml",3,790,553.0,6,0,29],
["7802351451202","Pepinillos en vinagre DJ 360 g",3,1500,1050.0,5,0,29],
["7801315148882","Champinines enteros Esmeralda",2,2590,1959.0,6,0,29],
["7806500752202","Pañal Babysec XXG",4,3990,2940.0,8,0,24],
["7802900003661","Leche soprole frutilla 200 ml",20,650,368.0,6,0,43],
["7802810006400","jugo watts Piña 200 ml",2,400,226.0,0,0,5],
["7802900295080","Jalea Soprole 110 g",2,400,226.0,6,0,43],
["7802810011534","margarina vegetal 1 kl",20,2690,1525.0,6,0,24],
["8445290262820","La cremeria Raspberry",19,6200,4116.0,6,0,40],
["7613033725333","Charlot almendrado savory",19,5900,4130.0,6,0,40],
["7801235280112","Surtido marisco ntural SJ",10,1990,1393.0,12,0,32],
["7801235000277","Surtido marisco natural 425 gS",10,3700,7400.0,15,0,32],
["7801620009694","Cachantun 600 ml",5,800,582.0,24,0,5],
["7809611706508","Entraña super cerdo 450g",6,7800,5900.0,12,0,0],
["7803495004491","Pan Integral Selecta 800 g",21,3100,2360.0,4,0,41],
["7803495004484","Pan Blanco Selecta 800 g",21,3100,2300.0,12,0,41],
["7801610002650","Fanta retornable 3L",5,3300,2360.0,18,0,9],
["7803908003943","Guallarauco Suspiro limeño",19,4900,3718.0,6,0,9],
["7802408001619","postre helado fiorentina tres",19,2900,1917.0,6,0,18],
["7622210633842","mini oreo 40g",17,500,302.0,15,0,8],
["7801235003216","Caldillo de congrio",10,4590,3511.0,12,0,32],
["7801235002974","Duraznos cubitos 425 g",10,1590,1063.0,6,0,32],
["7801235002967","Durazno mitades 425 g",10,1590,1060.0,0,0,32],
["7801235003070","Palmitos enteron",10,2700,2020.0,6,0,32],
["7801235003063","Palmitos rodajas",10,2700,2040.0,6,0,32],
["7804608220685","Arroz preg. Coliseo",2,1600,1490.0,6,0,24],
["7802575226327","Jugo vivo piña 1L",5,1400,869.0,12,0,6],
["7802575531742","push master cat salmon 85g",22,900,562.0,20,0,6],
["7797453000413","push whiskas 85g salmon",22,900,680.0,12,0,24],
["7797453000550","push wiskas 85g pollo",22,800,0,0,0,24],
["7797453000406","push wiskas 85g carne",22,1000,610.0,5,0,24],
["781159861970","pan hamburguesa marcelo 538g",25,2000,1250.0,4,0,28],
["7802408061033","Casata chirimoya alegre Fruna",19,2000,1290.0,3,0,1],
["7802408061040","Casata piña Fruna 1L",19,2000,1290.0,6,0,1],
["7802225588508","Golpe 27g",30,400,250.0,4,0,-1],
["7899970403002","Chocolate extra crem Hersheys",8,1700,1040.0,6,0,29],
["7899970402982","Chocolate con leche Herhey",8,1700,1020.0,6,0,29],
["7801620010683","H2o 2.0 l",5,1900,1440.0,12,0,5],
["7802420010378","Crunchis horneados 200g",30,1990,1477.0,6,0,29],
["841058000693","Presto Schick eco fem",4,1700,0,1080,0,28],
["7896004009223","Pringles cebolla",30,2400,1680.0,12,0,29],
["7803403003929","Pan blanco Ideal 380g",25,1700,1200.0,2,0,19],
["7803403003936","Pan blanco Idela 580g",25,2700,1923.0,100,0,19],
["6902023022707","Trapero multiuso con ojal",31,2490,1410.0,6,0,24],
["7808304315874","Lustra mueble aerosol Teddy",31,1600,1300.0,3,0,24],
["caferico","Sobre de café Starbucks",29,1000,700.0,30,0,31],
["78415690","Gift convertible",9,2500,1500.0,20,0,-1],
["suelto","Cigarro suelto",29,200,80.0,100,0,-1],
["sueltoclick","Cigarro suelto con click",29,250,100.0,0,0,-1],
["78026902","Latino Red fruit 20",9,3000,2200.0,10,0,23],
["78026896","Latino blackberry 20",9,3000,2200.0,10,0,23],
["78017399","Latino freeze 20",9,3000,2200.0,10,0,23],
["78020320","Latino blue king size 20",9,2800,2050.0,10,0,23],
["78017443","Latino freeze 10",9,1800,1300.0,10,0,23],
["78015548","Latino King size 10",9,1600,1120.0,10,0,23],
["impuesto","Impuesto cigarro",29,600,20.0,0,0,-1],
["7804639430558","Urban Flow Energy 500 ml",5,1300,990.0,24,0,28],
["041333000985","Pilas Duracell D2",27,5400,1390.0,2,0,24],
["041333428482","Pilas Duracell AAA",27,950,500.0,10,0,24],
["041333016634","Pilas Duracell AA",27,950,500.0,10,0,24],
["7798060853607","Queso untable grouyere 180g",20,1200,672.0,3,0,8],
["7840533000022","Arroz el pais 1Kg",2,1750,1113.0,10,0,8],
["7802410350255","Salsa de champiñones gourmet",2,1000,621.0,6,0,8],
["8682213000071","sueprcoco xxl togo 60g",13,600,300.0,24,0,8],
["7790380126379","Mantecol bañado 20g",13,600,380.0,18,0,8],
["7805040004321","Killer arañas cucarachas 345g",31,3600,2250.0,12,0,24],
["7891150090279","Maicena 100g",2,1690,1435.0,10,0,24],
["7798366480019","Azucar Diamante 1Kg",2,1300,789.0,12,0,24],
["7801000001850","Alcohol care 125ml",24,2490,1490.0,6,0,14],
["7999788887572","Alcohol Analia 70Grados 60ml",24,1500,750.0,3,0,14],
["7804603700410","Acetona Analia 60ml",24,1000,550.0,6,0,14],
["7805040003300","Lavaloza Virginia 200ml",31,990,560.0,12,0,24],
["7804670070461","Tohalla papel gigante ovella 1",4,2900,2030.0,24,0,39],
["7808304316093","Paño Cocina azul",4,800,500.0,24,0,39],
["7808304316109","Paño cocina flores",4,800,500.0,24,0,39],
["7791293019659","Jabon LeSancy",4,1500,1100.0,6,0,39],
["7791293036687","Jabon LeSancy",4,1500,1100.0,10,0,39],
["7801965001384","Apanado de pollo Montina 90g",12,600,200.0,15,0,3],
["7802575015662","Lasaña precocida Carozzi 330g",2,1990,1470.0,12,0,6],
["7802575220141","Néctar piña Sprim 190ml",5,350,254.0,12,0,6],
["7802215504112","Galletas de Navidad Costa 180g",17,1600,1161.0,20,0,6],
["7802215515071","Galleta champaña Costa 140g",17,1990,1360.0,10,0,6],
["7804663870115","Casata vainilla Madel 1L",19,2600,1880.0,5,0,13],
["7804663870047","Casata chocolate Madel 1L",19,2600,1880.0,2,0,13],
["7801552004057","Casata piña Trendy 1L",19,3600,1900.0,15,0,42],
["7802351002367","Salsa BBQ Don Juan 100g",2,750,550.0,18,0,29],
["7802420010385","Cóctel de fruta Esmeralda 580g",10,1600,1174.0,6,0,29],
["7750243064965","Tallarin 87 Nutregal",2,800,400.0,12,0,29],
["7802410452041","Salsa Queso Cheddar 200 g",30,1800,1260.0,4,0,45],
["7801220005560","PAPAS PREFITAS 2.5kg",26,6990,3960.0,2,0,35],
["7801220001531","Pulpa chirimoya 1K MV",12,5990,4000.0,4,0,24],
["7803908003264","Pulpa Guallarauco 1K fram",12,8690,6650.0,12,0,9],
["7613032180096","Trululú 70ml",19,700,442.0,26,0,40],
["7802710350504","Cassata Brick Savory 1L",19,4100,2870.0,6,0,40],
["7613287221629","Helado frutos y choc Savory 1L",19,3990,2870.0,6,0,40],
["7804605780403","Hamburguesa Karmac 100g",6,790,487.0,40,0,8],
["7801930007120","Vianesas Rec. Ab. PF 5 u",7,1700,1080.0,24,0,33],
["7801930010380","Hamb. Rec. del Ab. 100g",7,800,600.0,24,0,33],
["8445291383661","Triton 4*6",17,1990,1515.0,10,0,31],
["8445291383630","galleta triton x 4",17,400,200.0,6,0,31],
["7891962072371","Mini Panetone clasico 80 g",25,1300,975.0,6,0,29],
["7891962072388","Mini Panetone choc. 80 g",25,1300,975.0,6,0,29],
["7802420005039","Callampas deshidratadas Edra",47,2300,1790.0,6,0,29],
["8445290912336","Criollitas Mckay 140 g",17,1490,878.0,6,0,31],
["7802500016023","Tallarines 77 Romano 400g",2,800,568.0,2,0,25],
["7500435231237","Shampoo HS anticomezon",4,3690,2690.0,3,0,39],
["7500435019491","Shampoo HS Men",4,3690,2690.0,3,0,39],
["7500435019545","Shampoo HS Old",4,3690,2690.0,3,0,39],
["7500435138000","Shampoo HS purificacion",4,3690,2690.0,3,0,39],
["7500435020046","Shampoo HS limpieza renov",4,3690,2690.0,3,0,39],
["7500435142557","Shampoo HS Hidratacion",4,3690,2690.0,3,0,39],
["7702626216768","Vanish liquido blanco",4,1490,990.0,10,0,39],
["7702626216751","Vanish Liquido rosado",4,1490,990.0,10,0,39],
["7804915012676","Mochila Barbie",29,9990,5990.0,6,0,-1],
["7806545030150","algodon copos",4,990,590.0,12,0,-1],
["7804923031232","Ilicit 2.8 Negro Azulado",4,2690,1890.0,3,0,39],
["7804923031249","Ilicit 3.0 Castaño oscuro",4,2690,1690.0,3,0,39],
["7804923031263","Ilicit 4.0 castaño medio",4,2690,1890.0,3,0,39],
["7804923031386","Ilicit 5.5 Caoba claro",4,2690,1690.0,3,0,39],
["048341000808","Algodón petalos 80u",4,1000,620.0,24,0,39],
["7804910019427","Talco Brooks silver teck 120g",4,2490,1860.0,3,0,39],
["075486088507","Lip balm Hawaiian Tropic 30spf",26,1990,1490.0,3,0,39],
["7802500184364","Caracoles Lucchetti 400g",2,1200,860.0,0,0,25],
["0799192082674","Galleta de mantequilla Toddo 1",17,1300,800.0,19,0,24],
["7896004009216","pringles original 140",30,2400,1680.0,6,0,29],
["7802215610059","Popcorn frugele 220 g",30,1900,1376.0,6,0,6],
["7802215610035","Popcorn Frac 220 g",30,1900,1376.0,5,0,6],
["7802215610011","Popcorn 220 g",30,1900,1376.0,6,0,6],
["7702174076579","PIn pon",13,3000,1500.0,9,0,6],
["9864579037567","gasa para curacion",4,500,150.0,10,0,39],
["7801930001906","Hamburguesa T-Rex PF",7,1200,800.0,47,0,33],
["6972810231896","flotador mediano de niñ",2,2000,1950.0,0,0,24],
["6934476427099","Anteojos depicina",29,5500,3790.0,0,0,-1],
["8445290262707","La Cremeria Fudge 1 l",19,6200,4524.0,6,0,40],
["7804603532226","Set only you perfume y crema",4,8990,6990.0,3,0,14],
["7804603532288","Set love perfume y crema",4,8990,5990.0,3,0,14],
["7804603533377","Set maseratti blue",4,8990,5990.0,3,0,14],
["7804603530437","set maseratti black",4,9990,6990.0,3,0,14],
["7800004006144","set crema de lechuga corporal",4,9990,6990.0,3,0,14],
["7804603531205","set botanical garden coco",4,9990,6990.0,3,0,14],
["7804603531564","set botanical garden berries",4,9990,6990.0,3,0,14],
["7804603532370","set theme cosmetic",4,9990,6990.0,3,0,14],
["7802420009501","Te emblem 20u",2,1290,883.0,12,0,29],
["7802408006164","Arroz serrano 1k grado 2",2,1800,1152.0,12,0,24],
["7806810029056","CLoro Impeke 930 g",4,1790,1050.0,12,0,39],
["781718916967","Bolsa de basura 70*90",4,1290,1800.0,6,0,39],
["7804663500890","bolsa QU2000 50*70",29,800,400.0,6,0,-1],
["7802420002069","Kisses cookies´n´creme",8,3900,2846.0,3,0,29],
["7802420005114","Kisses milk choc creme",8,3900,2846.0,3,0,29],
["7802420002076","Kisses milk chocolate",8,3900,2846.0,3,0,29],
["7802200402515","Mermelada de mora Ambrosoli",2,1400,980.0,2,0,6],
["7802215107153","Costa Rama 60 g",8,1200,750.0,12,0,18],
["7802215107160","Vizzio 70 g",8,1200,750.0,12,0,18],
["6971193491705","cargador automovil",29,4900,3000.0,4,0,-1],
["7790520025494","Baygon todo insecto 278 g",4,3400,2690.0,12,0,24],
["cilantro","cilantro",33,700,400.0,20,0,24],
["8696630143006","winnex ambiental citrus",31,1850,1390.0,24,0,14],
["8696630142894","winnex after rain",31,1850,1390.0,24,0,14],
["8696630142948","winnex floral",31,1850,1390.0,24,0,14],
["8696630143990","winnex vainilla",31,1850,1390.0,24,0,14],
["7805300049154","insecticida tanax mata incecto",31,2990,1990.0,24,0,14],
["7801930012049","Hamburguesa pollo RA",7,900,630.0,48,0,33],
["7801930007960","Chorizoparrillero RA",7,1900,1330.0,12,0,33],
["7801907001946","Chorizo Parrillero SJ",7,3900,2730.0,6,0,38],
["7801907014298","Chorizo Surenio 5 u",7,1600,1000.0,6,0,38],
["7613032657185","cassata chocolate suizo",19,4100,3000.0,6,0,40],
["7913035779037","helado crazy frambueza",19,1600,1100.0,12,0,40],
["7801907001939","longaniza sureña",40,2800,2100.0,4,0,38],
["7805000322441","mayonesa hellmanns",2,2990,1800.0,10,0,24],
["7804945007703","Set colonia Babyland",4,6500,4990.0,1,0,24],
["7808304315904","Bolsa Teddy 80x110 10U",31,1600,1180.0,12,0,39],
["7805040313034","Luastra Muebles Virginia 250ml",31,1600,1190.0,10,0,39],
["7805040313027","Lustra Muevles Virginia 250ml",31,1900,1190.0,6,0,39],
["7500435019880","Shampoo HS manzana 375 ml",4,3690,2690.0,4,0,39],
["7509546063843","lady speed stick powder fresh",4,3200,2400.0,6,0,39],
["7509546063515","Lady speed stick pro 5",4,2800,2000.0,6,0,39],
["7509546076300","lady speed stick dynamic",4,3000,2200.0,6,0,39],
["7891050720191","frutosso",29,600,0,0,0,-1],
["7801220000657","papas duquesas minuto verde 1k",12,3900,2790.0,10,0,24],
["7803403003899","takis intense nacho",30,1000,582.0,10,0,19],
["7803403003882","takis intense nacho",30,2000,1294.0,12,0,19],
["8901314517999","cepillo colgate slimsoft charc",4,4500,3290.0,7,0,39],
["7509546063645","speed stick x5",4,3000,2400.0,12,0,39],
["7509546063867","speed stick xtreme intense",4,3000,2350.0,12,0,39],
["7805040001306","lavalozas virginia 500 ml",31,1400,990.0,12,0,39],
["7802900001278","queso rallado parmesano 40g",2,1200,790.0,30,0,43],
["8901314307316","cepillo colgate extra clean",4,990,450.0,12,0,39],
["048341991007","bolitas de algodón",4,990,650.0,12,0,39],
["7801305004099","porotos negros",2,1200,800.0,12,0,24],
["7802340000213","salsa de soya 250cc",2,990,650.0,12,0,24],
["7613032186852","chocolito 85 ml",19,1000,620.0,16,0,40],
["78006164","egocentrico",19,1000,650.0,16,0,40],
["7801552007867","cono oreo",19,2000,1400.0,16,0,42],
["7801552007690","cono baileys",19,2000,1500.0,16,0,42],
["7802715000718","aqua frut trendy 63g",19,300,124.0,64,0,42],
["7802420009181","papas fritas caseras 350g",30,3800,2916.0,12,0,29],
["7613035493650","sahne nuss chomps",19,4500,3353.0,8,0,40],
["8445291480964","xplori k-lov 62g",19,500,250.0,12,0,40],
["7613035407176","danky manjar con nueces",19,2100,1650.0,12,0,40],
["7809611721679","Hamburguesa pollox4 king",29,990,600.0,10,0,-1],
["7801220003504","Champinones min ver 350 g",29,1900,1490.0,10,0,-1],
["7802575531759","Master dog húmedo 100g",22,900,562.0,10,0,8],
["7802575531735","Master cat húmedo carne 85g",22,800,610.0,10,0,8],
["7801930000930","Salchichas tradicionales 20 u",40,4000,3334.0,6,0,33],
["7798141972609","azucar la teresina",2,1300,800.0,12,0,24],
["7802420009198","Marco Polo corte americano 350",30,3800,2916.0,4,0,29],
["7802420009280","Spicy cheddar Inferno 180g",30,2200,1664.0,5,0,29],
["7802420010354","Crunchis queso 200g",30,2200,1308.0,2,0,29],
["7804608220005","aceite coliceo 900ml",2,1890,1000.0,12,0,24],
["7802615006575","arroz miraflores grado 2",2,2490,2000.0,12,0,6],
["8696630142917","Winnex Forest spring 400ml",31,2300,1300.0,5,0,24],
["7802410416302","salsa de soya gourmet",2,2000,1500.0,12,0,8],
["7622300842444","polvo para hornear royal",2,500,350.0,12,0,8],
["6973524800156","aloe vera original 500ml",5,1400,1000.0,12,0,8],
["7802640600076","mostaza jb 100g",0,700,500.0,35,0,24],
["7808304265735","bombitas de agua 100 un",46,1000,800.0,24,0,24],
["7802225640558","rigochoc",17,1700,1350.0,12,0,1],
["78068315","big time negro",13,400,300.0,24,0,1],
["78023994","bon o bon",13,300,185.0,12,0,1],
["7802408002296","tresleches fruna 110ml",19,300,192.0,24,0,34],
["77961662","smoking premier",9,800,600.0,12,0,24],
["78017436","smoking ross",9,800,600.0,12,0,23],
["7896004009230","pringles queso",30,2400,1900.0,12,0,29],
["7802420010194","Papas jamon serrano",30,1900,1307.0,10,0,29],
["7790847060567","arroz don marcos",2,1800,1400.0,12,0,24],
["7802500037059","salsade tomate lucchetti",2,700,500.0,100,0,25],
["7802800000333","kryzpo 83g",30,1500,1000.0,125,0,25],
["7804676410001","queso germania",7,5900,3600.0,8,0,22],
["7804676410018","queso mantecoso germania",7,5900,3800.0,12,0,22],
["7613038883762","Leche asada nestle 120g",20,750,549.0,10,0,30],
["7805300010109","tanax polvo",31,4600,3290.0,6,0,14],
["7804659070390","condones kingdom super estriad",48,1500,1090.0,12,0,14],
["7804676070038","condon sensorplus anatomic",48,1500,1090.0,12,0,14],
["7804676070144","condon sensorplus extraresiste",48,1500,1090.0,12,0,14],
["7805300052116","insecticida tanax sin olor",45,2700,2100.0,12,0,14],
["7802900214074","manjarte",20,800,600.0,12,0,43],
["7802408000391","FRU COLA 500 ml",5,600,340.0,24,0,18],
["7802408000445","FRUNA PIÑA 500 ml",5,600,340.0,24,0,18],
["7802408000407","FRUNA PAPAYA",5,600,340.0,24,0,18],
["5902047170294","FILTROS CIGAROS",29,1500,900.0,8,0,-1],
["7803905000310","Arroz Valencia grano largo 1k",2,1600,1190.0,10,0,24],
["7804612130093","Chispero Ronson",31,1900,1500.0,3,0,24],
["7790520016317","Lysoform piso lavanda 900ml",31,1600,1000.0,6,0,24],
["7790520016348","Lysoform piso floral 900ml",31,1600,1000.0,6,0,24],
["799192167072","Bolsa basura grande LA",31,1690,1200.0,10,0,24],
["041333038872","Pila duracell cr2025",15,3000,1500.0,4,0,24],
["9338312003497","Set Escobillas de uñas 2u",31,1000,590.0,4,0,24],
["7861073971030","Hipoglos 20g",4,2600,1690.0,10,0,24],
["8901314524966","Colgate Flexy",4,990,560.0,12,0,24],
["025215721113","Bateria Maxell 9V",27,3900,2690.0,6,0,24],
["7791293049540","Rexona active emotion 150ml",4,2590,1990.0,6,0,24],
["7791293049571","Rexona futbol fanaticas 150ml",4,2590,1990.0,6,0,24],
["7791293049533","Rexona Cotton Dry 150ml",4,2590,1990.0,6,0,24],
["4005900036711","Nivea Men Black y Hhite 24h",4,2890,2190.0,6,0,24],
["4005900515865","Nivea Men Fresh Ice 48h",4,2890,2190.0,6,0,24],
["4005900495709","Nivea Men Deep Darkwood 72h",4,2890,2190.0,6,0,24],
["7791293049489","Rexona V8 72h",4,2890,2190.0,6,0,24],
["7791293049465","Rexona Invisible 72h",4,2890,2190.0,6,0,24],
["7791293049472","Rexona Futbol Fanatics 72h",4,2890,2190.0,6,0,24],
["7802408006126","Mani salado fruna 430g",30,3500,2250.0,6,0,18],
["7802408005693","Flipflop Fruna 350g",30,2300,1700.0,6,0,18],
["7802408005686","Sufles de papa fruna 350g",30,2700,1700.0,6,0,18],
["7802408003903","Sufles tuttifrutti 500g",30,2700,1700.0,6,0,18],
["7802408007291","Sufles de queso 350g",30,2700,1700.0,6,0,18],
["7804603539942","Quita esmalte Kriss limón",4,1600,1190.0,3,0,24],
["7804603539928","Quita esmalte Kriss rose",4,1600,1190.0,3,0,24],
["7804603532035","estuche black",26,8990,6990.0,12,0,14],
["7804603532042","estuche hombre blue",26,8990,6990.0,12,0,14],
["7804603530215","crema corporal aquaderm",26,8990,5990.0,12,0,14],
["7804603530314","pack crema corporal",26,7990,5990.0,12,0,14],
["5104003332641","yenga",46,3990,2990.0,4,0,14],
["5104003332634","yenga",46,3990,2990.0,4,0,14],
["9669669960196","uña postizas my melody",46,1500,990.0,12,0,14],
["6932654236310","pegamento uña",26,1300,850.0,12,0,14],
["9669669107652","pegamento uña",26,1300,850.0,12,0,14],
["073390018382","Chupa chups xtremes",13,1000,760.0,17,0,29],
["7802420004889","perejil Edra 15g",3,500,340.0,10,0,29],
["7802900002138","Yogurt sin azucar frutos secos",20,800,530.0,6,0,43],
["7802300000161","SALSA TOMATE DOÑA CLARA",29,500,300.0,0,0,-1],
["7804920008862","acondicionador ballerina",4,1690,1190.0,12,0,24],
["7804920019349","shampoo ballerina hipoalergeni",4,2200,1646.0,12,0,24],
["7804602600759","pan hot dog la selecta",25,1900,1500.0,12,0,22],
["7802408001411","Casata Piña Fruna 2.5L",19,4990,3990.0,3,0,1],
["7801930009315","Pata  de ternera R.A.",40,990,700.0,16,0,33],
["7801909002231","hamburguesa de pollo chilenaza",6,700,500.0,12,0,66],
["7802420008894","choco flakes colacao",38,1000,700.0,12,0,29],
["7802420008900","balls colacao",38,1000,650.0,12,0,29],
["7802351000585","vinagre de manzana",3,1700,1300.0,12,0,29],
["7804635380031","ice tea hibiscus",5,1600,1300.0,12,0,59],
["7804635380116","ice tea durazno",5,1600,1300.0,12,0,59],
["7804635380086","ice tea limon miel",5,1600,1200.0,12,0,59],
["0763331075757","black tea frutos rojos",5,1600,1000.0,12,0,59],
["0763331075764","green tea cedron",5,1600,1000.0,12,0,59],
["763331075627","limonada",5,1600,1000.0,12,0,59],
["7804635380598","jugo de maqui",5,2250,1600.0,12,0,59],
["8935048609538","hidra suero piña",5,2000,1500.0,12,0,59],
["8935048609552","hidra suero mango",5,2000,1500.0,12,0,59],
["7802900002107","protein tozos de frutos rojos",20,800,500.0,12,0,43],
["7802408000698","twingo",19,700,500.0,12,0,1],
["7801620010621","kem xtreme 2.0l",5,2700,2060.0,12,0,5],
["7801620009571","mas manzana 600cc",5,1100,790.0,12,0,5],
["7801620009588","agua mas pera 600cc",5,1200,790.0,12,0,5],
["7801620009601","agua mas uva 600cc",5,1200,790.0,12,0,5],
["7802820441000","Agua Benedictino 500 ml",5,700,463.0,12,0,9],
["7506475120432","Trix minis 300g",38,3490,2660.0,3,0,31],
["7899970403026","Chocolate hersheys CYC 77g",13,1700,1079.0,10,0,29],
["7702103978134","Zukaritas Kelloggs 450g",38,3900,2511.0,10,0,29],
["7702103059451","Corn flakes Kelloggs 450g",38,4590,4486.0,10,0,29],
["7802420007934","Cola cao Pillows 350g",38,3500,2235.0,6,0,29],
["7801610003312","Fanta 1.25L Retornable",5,1600,1007.0,0,0,9],
["7801610003336","Fanta 3L Retornable",5,2800,2008.0,12,0,9],
["7730219099122","TOALLA HUMEDA BABYSEC 40U",2,1900,1190.0,12,0,24],
["7806810800471","BOLSA DE BASURA 80 X 120",2,3500,2690.0,0,0,24],
["3100004014458","Cinta Doble contacto 13.7mts",15,1500,890.0,6,0,24],
["7802000019555","maní sin sal evercrisp",30,1200,740.0,12,0,17],
["7801610002902","fanta naranja 250",5,500,180.0,12,0,9],
["8445291618091","huevitos trencito 62g",30,1300,900.0,112,0,31],
["7802800567027","Gelatina livean pina 20 g",2,800,500.0,10,0,25],
["7802800567058","Gelatina Livean 20 g berr",2,1100,700.0,10,0,25],
["7802800567010","Gelatina livean naran 20 g",2,800,500.0,10,0,25],
["7802800544356","Nectar Livean frut 200 ml",5,400,290.0,12,0,25],
["7802800544349","Nectar livean pina 200 ml",5,400,290.0,12,0,25],
["7802800544325","Nectar livean dur 200 ml",5,400,290.0,12,0,25],
["7802800544332","Nectar Livean manz 200 ml",5,400,290.0,12,0,25],
["7802800544318","Nectar Livean naran 200 ml",5,400,290.0,12,0,25],
["7802800556229","Granuts mix",30,700,500.0,12,0,25],
["7802800556281","Granuts mix",30,700,500.0,12,0,25],
["7802800556076","Muibon flow 480 g",8,700,500.0,12,0,25],
["021000026968","Real mayo Kraft 443ml",2,4700,3600.0,6,0,24],
["7802340001036","Vinagre vino blanco Hernández",2,1100,700.0,12,0,24],
["7802810001122","Manteca Crucina 1 k",29,2990,2490.0,10,0,-1],
["7805810071331","Panty elasticada Caffarena",31,3590,2690.0,10,0,24],
["7801552000271","Cassata pina panda",19,5800,4376.0,6,0,42],
["7801620010744","Cachantun strong gas",5,1100,800.0,24,0,5],
["8809041429809","Bebida Sandia OKF 350ml",5,1300,823.0,6,0,8],
["8809713910192","Bebida Fritilla OKF 350ml",5,1300,823.0,6,0,8],
["8809713910239","Bebida melon OKF 350ml",5,1300,823.0,6,0,8],
["8809041429823","Bebida Uva OKF 350ml",5,1300,823.0,6,0,8],
["8809713910215","Bebida Limon OKF 350ml",5,1300,823.0,6,0,8],
["859940002885","Cafe grn. mol. Marley buffalo",2,14990,9450.0,2,0,41],
["859940002403","Cafe grn. mol. marley one love",2,14990,9450.0,2,0,41],
["7800201013297","Torta Helada coccream",19,12990,9610.0,6,0,27],
["7800201012849","Cassata cerezas al conac",19,2800,1920.0,6,0,27],
["7800201012757","Cassatta choc suizo",19,2800,1920.0,6,0,27],
["7800201013334","Cassatta papaya crema",19,2800,1920.0,6,0,27],
["7802410303954","Endulzor Gourmet 250g",2,1300,1000.0,3,0,29],
["7803468004794","Brownie nueces Castano",30,600,284.0,8,0,7],
["7803468004848","Queque Marmol choctoffe",30,600,290.0,8,0,7],
["7803468004831","Mini breownie Castano",30,300,180.0,12,0,7],
["7803468004824","Mini Brownie nueces castano",30,300,189.0,12,0,7],
["7803468004800","Mini Queque vainilla castano",30,300,189.0,12,0,7],
["7803468003087","Pre Pizza clasica",30,1200,700.0,3,0,7],
["7803468001427","Pan Hot Dog Castano",30,2100,1500.0,3,0,7],
["7803468003483","Pan Blanco Castano",30,3200,2490.0,3,0,7],
["8445291446427","Galleta criollita Mckay",17,1100,799.0,12,0,31],
["7613287783981","Morocha Balls Mckay",30,1500,1100.0,6,0,31],
["7613287832184","Chokita Balls Nestle",30,1500,1100.0,6,0,31],
["7613287783950","Trencito Balls Nestle",30,1500,1100.0,6,0,31],
["7613287784117","Super 8 Balls Nestle",30,1500,1100.0,6,0,31],
["8445291404380","Leche Condensada Nestle doypac",2,1400,980.0,4,0,31],
["786071067172","Ambiental citrico",29,1990,1430.0,6,0,-1],
["786071067196","Ambiental flores primavera",29,1990,1590.0,6,0,-1],
["2100011290006","Vale Por",31,1300,490.0,6,0,24],
["4630039330128","corta carton economico",15,800,400.0,12,0,14],
["7807265098369","Cuaderno universitario Proarte",32,2200,1690.0,10,0,24],
["7802715000794","Helado pina colada panda",19,450,150.0,42,0,42],
["7802351234607","Ají chileno Don Juan",2,1200,900.0,0,0,29],
["7802900000318","Batifrut soprole pina",20,800,590.0,12,0,43],
["4100014162001","Lapices de colores Fultons",32,1700,1200.0,10,0,-1],
["7802820990102","Agua mineral Vital pt 990ml",5,1100,740.0,0,0,9],
["7802820550511","Six pack nectar durazno 200ml",5,2400,1800.0,3,0,9],
["7802820550504","Nectar Del Valle durazno 200ml",5,400,300.0,20,0,9],
["7802820700107","Six pack naranja 200ml",5,2400,1800.0,3,0,9],
["7802820641554","Nectar Del Valle piña 0 200ml",5,400,300.0,20,0,9],
["7802820641585","Six pack piña 0 200ml",5,2400,1800.0,3,0,9],
["7802820191004","Nectar Del Valle frutilla 200m",5,400,300.0,20,0,9],
["7802820191929","Six pack frutilla 200ml",5,2400,1800.0,3,0,9],
["7802820685459","Nectar Del Valle durazno 0",5,400,300.0,20,0,9],
["7802820685541","Six pack durazno 0 200ml",5,2400,1800.0,3,0,9],
["7896034680010","Leche condensada Parmalat 395g",2,2100,1570.0,12,0,8],
["7808709504569","Crema de leche Surlat 200g",20,1490,860.0,12,0,8],
["7803468003476","Pan de molde castano570 g",25,2100,1700.0,6,0,7],
["7803468002226","Pan balnco castano 400 g",25,1600,1100.0,6,0,7],
["7805000324179","Mayo Hellmanns 280 g",2,1900,1400.0,12,0,24],
["7802000019937","Papas Mons 200 g",30,1600,1200.0,5,0,17],
["7802215512377","Frac bi sabor 110g",17,850,525.0,12,0,6],
["7802215512421","Frac vainilla 110g",17,700,525.0,12,0,6],
["7802215503399","Dulcitas mini costa",29,450,252.0,12,0,-1],
["7802215503429","palmeritas mini costa",29,450,252.0,12,0,-1],
["7805300053953","Tanax aranas y baratas",45,3400,2590.0,6,0,-1],
["7805020001913","Clorogel 900 ml",4,1400,880.0,12,0,21],
["7802820250244","Kapo manzana",5,400,290.0,24,0,9],
["7802820250220","Kapo pina",5,400,290.0,24,0,9],
["7802820250206","Kapo Naranja",5,400,290.0,24,0,9],
["7702103520623","Froot loops kelloggs 480g",38,5390,4101.0,3,0,29],
["7891000391020","Galleta Trencito choco doble",17,1990,1490.0,12,0,31],
["7891000390825","Galleta Trencito chocomilk 120",17,1990,1490.0,12,0,31],
["7802800556205","Mani salado Granuts 40 g",30,700,440.0,12,0,-1],
["7802800556212","Mani japones",30,700,470.0,12,0,-1],
["7802500182353","Caracolitos Lucchetti 250 g",2,900,650.0,10,0,25],
["7803495005689","Molde miga La Selecta",25,3400,2307.0,4,0,22],
["7804947006308","suave jabon liquido",31,1690,0,0,0,24],
["7802000019258","lays corte americano",29,1200,600.0,0,0,-1],
["658325042382","Chai latte tea Marley 8U",2,6200,4300.0,2,0,22],
["799192058813","Soul rebel Marley 8U",2,6200,4300.0,3,0,22],
["0781159004025","Capuccino vainilla Marley 20g",2,1000,540.0,6,0,22],
["0781718805650","Chai latte tea Marley 20g",2,1000,540.0,22,0,22],
["781159004193","Caramel latte Marley 20g",2,1000,540.0,8,0,22],
["781159004018","Capuccino clasic MArley 20g",2,1000,540.0,7,0,22],
["7802000003448","Cabritas Evercrisp 140 g",30,1400,990.0,6,0,17],
["7806500406884","Toalla de papel Nova x4",31,1300,940.0,24,0,39],
["7802378438958","Pintura para piso Ero 5lt",31,4900,3570.0,3,0,39],
["7800201013495","Cassata Pistacho Madelo",19,2600,2000.0,10,0,27],
["7800201012771","Casstta dulce de leche graniza",19,2600,2000.0,10,0,27],
["7805080140027","Escobillon Clorinda",37,2800,2300.0,12,0,21],
["8802020529880","Palos de maqueta",29,1390,1000.0,0,0,-1],
["7807265050879","Tempera 12 uni",29,2500,1890.0,0,0,-1],
["7807265050862","Tempera 6 uni",29,1550,1190.0,0,0,-1],
["7807265052583","Plastilina 6 uni",29,1500,1100.0,0,0,-1],
["7807265052606","Platilina 10 unidades",29,1900,1390.0,0,0,-1],
["4718295213703","Silicona 30 ml",29,1100,790.0,0,0,-1],
["7804620833412","Amoxicilina 60 ml",29,6500,4990.0,0,0,-1],
["746747014589","Queque Marcelo coco",30,1500,1100.0,10,0,28],
["7803473000750","Pan Pita Ideal integral",25,1800,1100.0,10,0,19],
["781159862083","Queque naranja MArcelo",30,1500,1100.0,10,0,19],
["8445290794604","Helado Kit Kat Savory",19,2100,1700.0,42,0,40],
["7804658250090","filete de merluza",49,6900,5000.0,10,0,-1],
["0745853626990","surtido mariscos 500 g",49,2200,1700.0,10,0,-1],
["7801620010386","Agua Mas Frambuesa 1600cc",5,1700,1290.0,12,0,5],
["781159840678","Cappuccino classic Marley 8u",2,6200,4740.0,1,0,22],
["658325042375","caramel latte Marley 8u",2,6200,4740.0,1,0,22],
["7802000020087","Doritos Pizza evercrisp",30,800,600.0,10,0,17],
["7800031156027","Crocante Madel",19,500,300.0,42,0,27],
["7800201012795","Helado Giga Coco manjar MAdel",19,600,400.0,42,0,27],
["7800201012832","Helado mani toffe giga",19,600,400.0,42,0,27],
["7800201013303","Helado miss crispi manjar Made",19,500,300.0,42,0,27],
["7802930005611","Mantequilla Quillayes 100 g",20,1900,1160.0,20,0,51],
["070330717534","Maquina de afeita BIC",4,1000,700.0,12,0,8],
["7805300052093","Tanax Pulgas y garrapatas",45,2700,2100.0,12,0,-1],
["7894904290055","Trutro largo Seara",6,3800,3300.0,5,0,-1],
["7802800503735","Cappuccino Gold 15 g",2,500,302.0,0,0,25],
["7801620010652","H2O CCU Limonada 2.0",5,1900,1440.0,12,0,5],
["7800201013273","Yeti Alfajor Helado Madel 50 g",19,700,450.0,30,0,27],
["030900111308","cream cheese Smooth and creamy",29,2700,200.0,6,0,-1],
["7805054002061","Virutilla gruesa M6 Brilla sol",31,1200,700.0,6,0,24],
["7805054002221","Lana de acero Brillasol",31,500,200.0,6,0,24],
["7807265061134","LApiz tinta x 12",32,1990,1500.0,12,0,-1],
["8445290745903","goodnes",29,800,0,0,0,-1],
["7804603540900","Toallita húmeda EmuBaby",31,1300,1000.0,10,0,24],
["7802013797655","Sucedáneo de limón Doña Alicia",2,900,680.0,6,0,8],
["070330731806","Máquina afeitar Bic Soleil",31,1100,790.0,12,0,8],
["7801915004403","Salchicha surena SC 20",7,3900,2990.0,6,0,0],
["7809611702623","Salchicha surena SC 5",7,1200,900.0,12,0,0],
["7804920003232","Acondicionador palta Ballerina",4,1790,1090.0,6,0,24],
["7801610003299","Fanta retornable 2L",5,1900,1390.0,20,0,9],
["7801610333488","Inca Kola desechable 3L",5,3300,2700.0,20,0,9],
["7807210019302","Cartulina pliegos Artel 18un",32,2990,1920.0,8,0,-1],
["310742000412","Protector labial outdoor",29,2590,1890.0,6,0,-1],
["7804636190301","Cloranfenicol oftalmologico cr",29,6490,4990.0,5,0,-1],
["7804620834648","Cloranfenico gotas",29,5490,3990.0,10,0,-1],
["01010196","Cepillo pelo",29,1200,690.0,10,0,-1],
["7801900002254","Hamburguesa Winter x 10",7,3000,2200.0,14,0,38],
["7801907027106","Primavera SJ 200 g",12,900,590.0,10,0,38],
["7801907027083","Arvejas SJ 200 g",12,900,590.0,10,0,38],
["6902023040701","Trapero Multiuso",29,1990,1290.0,10,0,-1],
["7798316700532","Aceite Primor 1 l",2,2000,1390.0,12,0,18],
["7802408008700","Tostao Fruna",30,800,600.0,20,0,18],
["7500435170932","gillette hoja",4,800,440.0,12,0,24],
["7506295388487","oral b",4,1800,1300.0,0,0,47],
["7808000019724","Dorito pizza 180 g",29,2400,1800.0,10,0,-1],
["7804602600735","Pan de completo XL La selecta",25,2400,1790.0,4,0,22],
["7802900004293","Leche semi en polvo Soprole",20,6500,4990.0,6,0,24],
["7802200840263","Chocolate Golden Nuss 140 g",8,2400,1670.0,14,0,21],
["7802000017803","Granola Quaker 320 g",30,2990,1490.0,6,0,29],
["7802000017834","Granola Quaker 320 g",30,2990,1490.0,6,0,29],
["799192167027","Arveja Toddo 310g",10,650,445.0,12,0,24],
["7613030099024","picado pollo",10,2300,0,0,0,50],
["7806130012226","Gasa no tejida 10x10",29,800,200.0,20,0,-1],
["7806130006935","Guatero Tipsy",29,9300,6790.0,10,0,-1],
["7802351002558","Salsa tomates italiana DJ",2,700,500.0,24,0,29],
["7802351002541","Salsa de tomates DJ",2,700,500.0,24,0,29],
["7802420010989","Papas Fraft MP",30,1600,1100.0,6,0,29],
["7802420009525","Mani sin sal MP",30,1300,700.0,10,0,29],
["7800004032853","parche dolorub",29,2990,0,0,0,-1],
["6910321050407","Carta española",2,1500,0,12,0,-1],
["7808755500423","arroz la cañada",29,1300,0,0,0,-1],
["7809611720542","Malayita Super cerdo 450g",6,5800,4194.0,20,0,0],
["7802408004689","Galleta de salvado",17,1000,750.0,6,0,14],
["7800004006304","Crema para manos Lechuga",26,8500,6390.0,3,0,14],
["7804907985124","Set belleza Jean les pins",26,8990,6390.0,3,0,14],
["7804902033998","Colonia Coral love 100ml",26,7500,5390.0,1,0,14],
["7804902033967","Colonia Coral musk 100ml",26,7500,5390.0,1,0,14],
["7804902034018","Colonia Coral chic 100ml",26,7500,5390.0,1,0,14],
["7804907985131","Set belleza Jean les pins",26,8990,6390.0,2,0,14],
["7804930002249","Cloro Gel 900 ml",31,1300,800.0,10,0,-1],
["764451149113","Suero colagen Ilike naranja",5,2000,1500.0,12,0,-1],
["745853991791","Suero Protein IlikeVerde",5,2000,1500.0,12,0,-1],
["764451149106","Suero Colagen Ilike azul",5,2000,1400.0,12,0,-1],
["788115350219","Electrolito Ilike limjen",5,2300,1700.0,1,0,-1],
["788115350264","Electrolito Ilike man-dur",5,2300,1700.0,10,0,-1],
["788115350202","Electrolito Ilike maq-berr",5,2300,1700.0,10,0,-1],
["788115350424","Electrolito Ilike Smoothie",5,2300,1700.0,10,0,-1],
["788115350233","Electrolito Ilike maracuya",5,2300,1700.0,10,0,-1],
["788115350356","Electrolito Ilike cococpina",5,2000,1500.0,10,0,-1],
["0764451150959","Electrolito Ilike gran-guin",5,2000,1500.0,10,0,-1],
["788115350288","Electrolito Ilike lim-jen",5,2000,1500.0,10,0,-1],
["0764451150089","Electrolito Ilike lim",5,2000,1500.0,10,0,-1],
["788115350370","Electrolito Ilike man-dur",5,2000,1500.0,10,0,-1],
["764451150973","Electrolito Ilike nar-pla",5,2000,1500.0,10,0,-1],
["7802410002246","Sopa pollo fideos gourm",2,700,420.0,10,0,-1],
["7801505003793","Endulsante iansa tradicional",2,2290,1500.0,10,0,-1],
["8445291774476","Galleta triton mini naranja",17,500,300.0,10,0,31],
["8445291210103","Sahne-nuss corazon",29,11900,8500.0,5,0,-1],
["7806500508663","confort x6 rendiplus",4,1900,1400.0,12,0,24],
["5056282220631","Caja pompones",29,1000,500.0,0,0,-1],
["7759185010542","Tohalla  laydy soft  maxi pro",4,1900,999.0,24,0,12],
["7805633018322","Termometro mercurio",29,2000,1000.0,10,0,-1],
["7800120176028","Polulos acaramelados natur",30,400,200.0,10,0,-1],
["7805040003461","Cera aerosol Team",29,3990,2500.0,10,0,-1],
["7891000420843","Galleta Trencito biscuit",17,1990,1300.0,10,0,-1],
["7891000419311","Galleta Trencito brownie",17,1900,1420.0,10,0,-1],
["7891000416075","Chocoleche trencito 90 g",8,2300,1700.0,10,0,-1],
["8445291790308","Choco crotanty savory",8,1600,1120.0,10,0,-1],
["8445291790001","Chocolito savory",8,1600,1140.0,10,0,-1],
["7802900170059","Leche cultivada soprole",20,2600,1900.0,10,0,-1],
["7801900087541","salchicha Winter 1kg",29,4500,3500.0,5,0,-1],
["6953097109351","Termo vacuum flask set",28,9990,6000.0,3,0,24],
["7802710835216","Pasas al ron Savory 1 l",19,3990,3200.0,1,0,40],
["7804920007759","Shampoo Fuerza natural",29,1590,1100.0,0,0,-1],
["7804920007469","Acondicionador detox ballerina",29,2200,1646.0,0,0,-1],
["7802215512384","Frac chocolate",29,700,350.0,0,0,-1],
["799192166990","Trapero humedos Primavera",29,1900,1350.0,0,0,-1],
["799192166976","Trapero lavanda",29,1700,1350.0,0,0,-1],
["8935330206759","Agua de chia pina",5,1600,1100.0,10,0,-1],
["7802200042865","Chocolate Golden Nuss 25 g",8,600,380.0,20,0,6],
["78032996","Rolls Crocante Costa",8,300,150.0,30,0,6],
["7802215501524","Galleta Crackelet costa",17,650,390.0,10,0,6],
["7802215504570","Nik Block",17,1900,1400.0,10,0,6],
["7802215506055","Mini Donuts",17,500,250.0,10,0,6],
["7802200402539","Mermelada Vivo Durazno",29,1400,900.0,10,0,-1],
["7802200402522","Mermelada Vivo Frutilla",29,1400,900.0,10,0,-1],
["2881680010521","Huincha aisladora Stanford",14,1000,495.0,10,0,24],
["7795091000123","Arroz  carmabe",2,1300,0,0,0,-1],
["760412336516","Desmaquillador remover",4,2400,1700.0,10,0,-1],
["760412336462","Delineador figuras",4,2200,1800.0,10,0,-1],
["760412332754","Delineador Max Belle",4,1400,1000.0,40,0,-1],
["7802095186187","Panchitos chilísimos",30,1000,700.0,10,0,6],
["7802095186156","Panchitos BBQ chipotle",30,1000,700.0,10,0,6],
["7804673300091","Salsa de tomates SANAY",29,500,350.0,0,0,-1],
["7804603542027","emubaby",4,4500,2890.0,23,0,24],
["7894904290581","margarina delicia 250g",20,1300,715.0,23,0,24],
["7894904289820","margarina delicia de 500g",20,2300,1690.0,23,0,24],
["799192404191","aceite vegetal 900ml",2,1890,1390.0,23,0,24],
["7802408007116","Tableton Fruna 750 g",17,2990,2150.0,10,0,18],
["7802408006416","nonita mix",29,3000,2100.0,10,0,-1],
["7801610001295","Coca cola retornable 2L",5,1900,1400.0,20,0,9],
["7804653341809","Papel higiénico Suan 6 u",4,1800,1290.0,12,0,24],
["7808304265339","cuaderno univercitario",15,1600,1000.0,32,0,24],
["8119300115009","croquera oficio",15,2990,2200.0,23,0,24],
["6910258310056","paletas de pinpon",46,5900,4130.0,22,0,52],
["7805000322502","ketchup hellmanns",34,3100,2369.0,22,0,24],
["799192408830","azucar canoro",2,1200,799.0,0,0,24],
["75029982","rexona 72h",31,2490,1900.0,6,0,-1],
["75076696","dove men care",31,2490,0,0,0,-1],
["7750168001953","Pack oreo original 6u",17,1990,1480.0,12,0,8],
["7590011251100","Oreo original 36g",17,350,250.0,36,0,8],
["7801610001134","Coca Cola 350 ml ret",5,1000,700.0,100,0,-1],
["7802420010996","Papas QUeso Soya",30,1900,1400.0,10,0,29],
["7802420011481","Papas MP 180 g Ketchup",30,2000,1307.0,10,0,29],
["6741347467258","Energetica Penguin",5,1900,1400.0,10,0,-1],
["6741347467241","Energetica Joker",5,1900,1400.0,10,0,-1],
["6741347467234","Energetica Batman",5,1900,1400.0,10,0,-1],
["6741347467265","Energetica Harley Quinn",5,1900,1400.0,1,0,-1],
["745853457570","Desengrasante JJ",31,1300,1000.0,10,0,-1],
["745853457662","Limpia Vidrios JJ",31,1300,1000.0,10,0,-1],
["6971549920040","Agua aloe piña Oye! 500ml",5,1200,1000.0,6,0,-1],
["8445291792562","Chandelle Manjar",20,890,665.0,10,0,30],
["8445291792531","Chandelle chocolate",20,890,665.0,10,0,30],
["8445291792722","Chandelle lucuma",20,890,665.0,10,0,30],
["7801930021218","Mini Salamin RA",7,1300,990.0,15,0,33],
["8445291956377","lteza Mckay",17,1690,1200.0,10,0,31],
["8445291796478","Galleta Museo Mckay",17,500,300.0,10,0,31],
["8445291774322","Galletya Triton Intensa",17,800,500.0,10,0,31],
["7802000020261","detoditos Evercriss",30,3100,2351.0,6,0,17],
["7802615005653","Harina sin polvo de  hornear 5",29,5300,3200.0,0,0,-1],
["7803908008115","Chocolate MMAramja Guallarauco",19,1890,1300.0,10,0,9],
["7803908008122","Mocachino Guallarauco",19,1890,1400.0,10,0,9],
["7803908008108","Chirimolla Naranja Guallarauco",19,1890,1400.0,10,0,9],
["7803908008139","Maracuya Guallarauco",19,1890,1400.0,10,0,9],
["7800159081225","Ketchup Kraf 250 ml",34,1500,1100.0,10,0,29],
["7622202286698","Milka choc blanco",29,3200,2390.0,10,0,-1],
["799192404184","Arroz Canoro 1 k",29,1500,1100.0,10,0,-1],
["7800201012986","Rayoh Madel",29,1200,1000.0,12,0,-1],
["7801552007164","flagg Trendy",29,1300,1000.0,12,0,-1],
["7804682350001","Algodon Topcare",29,1000,750.0,10,0,-1],
["6902023110152","Bolsa de basura Aileda 80x120",37,1600,1190.0,6,0,24],
["6902023110145","Bolsa basura Aileda 70x90",37,1100,790.0,6,0,24],
["6902023110138","Bolsa de basura Aileda 50x70",37,700,479.0,6,0,24],
["7800044000249","MAnteca de cacao",29,1500,1000.0,10,0,-1],
["7801315151516","Pinas en rodajas Esmeralda 567",10,2400,1900.0,10,0,29],
["7891000384152","Galleta Trencito 130 g",17,1990,1400.0,10,0,31],
["8445291301450","Natures Heart",29,700,490.0,10,0,-1],
["8445291301429","Natures Heart",29,700,490.0,10,0,-1],
["7801620001964","Crush Retornable 2.5 l",5,1800,1321.0,12,0,5],
["7801620001889","Kem Pina Retornable 2.5 L",5,2000,1508.0,10,0,5],
["7801620172800","Bilz Retornable 2.5 L",5,2000,1508.0,12,0,5],
["7800159000936","Mayo Kraft Deli 200 g",29,1500,1000.0,10,0,-1],
["3100835812100","tijera fultons",32,1000,693.0,21,0,-1],
["6986554023853","Yenga 54 p",29,5500,10.0,5,0,-1],
["3100004019569","Plasticina 12 colores",29,2600,2000.0,6,0,-1],
["021000084920","Mayo Fraft 236 ml",29,3900,2900.0,10,0,-1],
["7806505058804","Greda 1 k",29,2000,1500.0,10,0,-1],
["7800159001094","Mayo Deli Kraft",2,1000,600.0,18,0,-1],
["7800159081164","Ketchup Kraft 90 g",2,900,600.0,18,0,-1],
["7808304352435","Hip Hops",29,400,200.0,12,0,-1],
["7804663270588","Kanikama 500G",12,2500,2000.0,12,0,-1],
["7797906000120","Papas prefritas McCain 2.25k",12,6500,6000.0,6,0,24],
["7802000020346","Lays C. Americano 330g",30,3600,2900.0,10,0,17],
["7802000020179","Doritos Queso 240 g",30,2700,2100.0,1,0,17],
["7802000020124","Doritos XS 43 g",30,800,500.0,10,0,17],
["7802000020148","Doritos M queso",30,1600,1100.0,10,0,17],
["7802000020186","Doritos queso",30,3400,2600.0,10,0,17],
["039800011398","pila energizer",27,4990,3500.0,0,0,-1],
["8802020299578","nuovo blok nota",32,3300,2050.0,0,0,-1],
["6921346100022","mamadera beikv",32,2500,1790.0,0,0,-1],
["025215717000","pendrive maxtell",15,5500,3990.0,0,0,-1],
["0130210815108","cinta doble contacto",15,2500,11590.0,0,0,-1],
["6958548202193","pistola silicona",15,3500,0,2000,0,-1],
["7802200134072","Cintas Loop 67 g",13,1300,900.0,12,0,6],
["7802200893375","Orly chocolate blanco",8,1600,1000.0,10,0,6],
["7802200893436","Orly almendra",8,1600,1000.0,10,0,6],
["7802200893474","Orly Menta",8,1600,1000.0,10,0,6],
["7802200134089","Cintas Loop",13,1300,900.0,10,0,6],
["7801235002400","Lomitos de jure SJ",10,1200,900.0,10,0,32],
["8901030921995","Jabon Lux barra",4,700,450.0,10,0,-1],
["8901030929380","Jabon Lux Barra",4,700,450.0,10,0,-1],
["6971549921030","Aloe Pina 1L",29,2500,1890.0,10,0,-1],
["7804610402475","Perros para ropa Ghosh",29,1000,600.0,10,0,-1],
["7613033907289","Nescafe Tradicion 150 g",29,6490,4990.0,10,0,-1],
["7891515474157","Rebozado de pollo Sadia",29,600,400.0,40,0,-1],
["7803403004339","Pan de Pascua Ideal",29,3990,3400.0,8,0,-1],
["7804945005020","estuche babyland",4,6500,4590.0,0,0,-1],
["8445291971462","Mega Choc avellanas Savory",19,2400,1900.0,24,0,40],
["8445291971387","Fini Helado Savory",19,800,500.0,24,0,40],
["7801552007676","Suspiros Crem frambuesa Trendy",19,5800,4601.0,60,0,42],
["7801552007683","Suspiros limeno Trendy",19,5800,4601.0,10,0,42],
["7801552007669","Suspiron Trendy 3 Leches",19,5800,4461.0,10,0,42],
["7801552007461","Suspiros frutos del bosque tre",19,5800,4461.0,10,0,42],
["7809611703699","Hamburguesas pollo",29,400,290.0,50,0,-1],
["7801552005993","Helado Tucu Tucu Trendy",19,500,385.0,40,0,42],
["6936896644894","Tohallas humedas FEMU",29,1500,1000.0,10,0,-1],
["7809611720559","Entrana de Cerdo porcionada 45",6,4490,2505.0,10,0,0],
["7802000018787","Ramita Queso Evercrisp",30,1100,800.0,10,0,17],
["7802000018954","Doritos Dinamita 100 g",30,1500,900.0,10,0,17],
["2000364396281","Block 99",32,2200,1590.0,5,0,-1],
["7802575534545","Arena para gatos Cuchito 2 k",29,2900,2000.0,10,0,-1],
["8445291971431","Danky Stranger Things",19,2200,1700.0,18,0,40],
["8445291145832","Helado Centella Savory",19,400,280.0,40,0,40],
["7802710831119","Cassata Pina Savory 1 L",19,3990,3047.0,6,0,40],
["7809611719966","Hamburguesa Tradicional Super",29,1200,816.0,0,0,-1],
["7803403004308","Pinguino Peach Idol",29,1000,770.0,10,0,-1],
["7803403101069","Principes Merengue Agua p",29,2700,2081.0,6,0,-1],
["7801930005096","Salchichas surenas PF",40,1200,838.0,24,0,33],
["781159797767","Bolsa de basura LAva Mas",29,1400,1040.0,10,0,-1],
["7804920007452","Shampoo Ballerina Detox",29,2200,1646.0,10,0,-1],
["7804920008206","Shampoo Ballerina colageno",29,1790,1300.0,13,0,-1],
["7802420130519","Brochetas Coctel MP",29,600,360.0,20,0,-1],
["7806810028899","Cloro Impeke 4 k",29,4000,2000.0,6,0,-1],
["7806519000509","Tohallas Humrdas para adultos",29,3990,2790.0,12,0,-1],
["7807210011061","MArcadores Artel x 6",29,1300,890.0,6,0,-1],
["6921734962782","LApiz escripto x 12",29,2200,1590.0,10,0,-1],
["7802820002072","AGua Benedictino f rojos 500",29,900,607.0,6,0,-1],
["7500435254182","Ariel 700g",29,2490,2200.0,0,0,-1],
["7803600981532","Sal Parrillera",29,1700,1500.0,0,0,-1],
["7804620836215","Sharoff gotas ojos",29,2300,1500.0,5,0,-1],
["8445291971356","Cono mini trencito 80ml",19,1400,1030.0,18,0,40],
["7804923031287","Tintura Ilisit 5.0",29,2690,1890.0,6,0,-1],
["7801620008338","Agua Mas Pina 1600 ml",5,1700,1279.0,6,0,5],
["7802901000591","Queso MAntecoso 500 g M",29,6000,4900.0,5,0,-1],
["7804679590038","Tohalla papel XL",29,2500,1650.0,18,0,-1],
["7802715071008","Pina PAnda 1 LT",29,2800,2000.0,15,0,-1],
["7802000020254","Cheetos L",30,2200,1500.0,6,0,17],
["7802715001111","casata menta chip",29,6300,4778.0,0,0,-1],
["8977677323171","candado 25mm",29,1990,1290.0,13,0,24],
["8977677323201","candado 50mm",29,3900,3000.0,12,0,-1],
["4005800137679","crema nivea",4,3490,2640.0,4,0,24],
["7804613393091","Queso Cheddar laminado",20,2490,1998.0,100,0,8],
["7802715000664","Sabor Crema PANDA",29,450,390.0,100,0,-1],
["7613031628964","Charlot tres leches 1L",19,5800,4395.0,6,0,40],
["8445290794932","Helado bilz y pap 92g",19,900,640.0,0,0,40],
["7804612221647","Gran Pipona sembrasol 110 g",29,1700,1346.0,20,0,-1],
["7804612221685","Maxi Pipona",29,3500,2900.0,10,0,-1],
["7801916031910","Churrasco vacuno  LP 90 g",29,1300,970.0,20,0,-1],
["7613031571529","salsa champinones",29,1200,726.0,6,0,-1],
["746747014374","Pizza familiar XL",29,1900,1500.0,0,0,-1],
["799192506833","Bolsa de basura grande Toddo",37,1800,1100.0,10,0,24],
["799192506819","Bolsa de basura pequeña Toddo",37,800,450.0,10,0,24],
["8445291836372","Chandelle crema irlandesa",20,890,665.0,6,0,30],
["7613031238217","Tres leeches savory 1",19,4100,3190.0,6,0,40],
["799192062605","Pañuelo la oferta",29,1500,1200.0,100,0,-1],
["7803403003264","Pan artesano Ideal",25,3300,2400.0,5,0,19],
["7805000324056","Drive colores 800 m",37,2000,1300.0,10,0,-1],
["7805000323677","Omo  Ultra Power 400 ml",37,1600,1000.0,10,0,-1],
["7805000319441","Soft 900 ml",37,1700,1000.0,10,0,-1],
["7791290007505","Cif vidrios 450ml",29,1600,1000.0,10,0,-1],
["7806810028943","Cloro Impeke 1 k",37,1600,1100.0,12,0,54],
["7804920009555","Shampoo Suavelina",29,1600,1000.0,12,0,-1],
["070330515406","Stck Bic",32,1100,790.0,6,0,8],
["4100017163005","Silicona Fultons",32,1200,500.0,6,0,8],
["7802408001367","casata pasas al ron",29,2300,0,0,0,-1],
["7802900001414","Yogurt protein + natural",20,750,530.0,10,0,43],
["7806564812355","Alcoholl desnatt. 70°",29,2900,1990.0,6,0,-1],
["7801620010935","Pepsi Zero 1.25 l",5,1000,960.0,12,0,5],
["7801620010980","PAP 1.25 lt",5,1000,800.0,10,0,5],
["7801620010966","Bilz 1.25 lt",5,1000,900.0,10,0,5],
["7801620011000","Limon Soda 1.25 l",5,1000,960.0,10,0,5],
["7802920007120","Leche chocolate COLUM",29,1900,1690.0,100,0,-1],
["8445291571242","Pina Colada Savory 1 l",19,3990,2299.0,6,0,40],
["7622300498429","Chocolate Milka frutilla 90 g",8,2800,2090.0,6,0,8],
["7622202271908","Chocolate nMilka 90 g",8,2800,2091.0,6,0,8],
["8445291928725","Capri Guinda",29,1700,1100.0,6,0,-1],
["7804658860473","Arroz El monarca 900g",2,1500,1000.0,10,0,24],
["9556001025272","Nescafe Latte lata",29,2000,1506.0,6,0,-1],
["9556001054005","Nescafe Mocha lata",29,2000,1506.0,6,0,-1],
["7801552008161","Hela do Mi unicornio",19,500,300.0,20,0,64],
["7804612221395","Nut Mix Sembrasol 80 g",30,1600,1301.0,10,0,61],
["7501055388578","Del valle lata 340 ml",5,1000,744.0,6,0,9],
["7702103130273","Choco crispis Kelloggs 30 g",30,1000,767.0,4,0,29],
["7702103130136","Zucaritas Kelloggs 30 g",30,1000,769.0,6,0,29],
["7802215501579","Crackelet Costa 137 g",29,1200,800.0,6,0,-1],
["7509546688220","LAdy speed stick",29,3200,2400.0,6,0,-1],
["8886467020957","Jabon Dove barra",4,1200,900.0,8,0,39],
["7804613393084","Queso Cheddar 75 g",20,1400,1000.0,10,0,8],
["7802900004231","Flan Soprole caramelo",20,500,345.0,10,0,43],
["8445291836341","Chandelle Pina colada",20,890,665.0,6,0,43],
["7802900004224","Flan soprole 110 g",20,500,300.0,6,0,43],
["3100003668645","Block cartulinas de color",29,2300,1600.0,6,0,-1],
["7501013107340","Nectar Jumex 460 ml",5,2000,1630.0,12,0,6],
["7802200361157","jalea push",13,500,400.0,100,0,49],
["7751655001487","Gatorlit 591ml",5,2300,1693.0,12,0,5],
["7751655001470","Gatorlit",5,2300,1693.0,12,0,5],
["7842216000169","Arroz villa Oliva 1",2,1400,900.0,10,0,-1],
["7801620005184","Gatorade Frutas trop",5,1400,1000.0,12,0,5],
["7801552007997","trendi tres sabore",29,6300,4500.0,6,0,-1],
["7801235004855","Mix Tropical Nutrisco",12,2500,1924.0,6,0,32],
["7801235004831","Mango nutrisco 1 l",12,2500,1924.0,6,0,32],
["7801235004824","Frutilla Nutrisco 1 l",12,2500,1924.0,6,0,32],
["7805054002047","Virutilla pisos n4",37,1200,790.0,10,0,-1],
["7801907001762","Hamburguiesa San Jorge 90 g",40,600,200.0,24,0,38],
["7801965000844","Hamburguesa de pollo montina",40,600,352.0,36,0,3],
["764451150201","Suero Colagen Protein",5,2000,1500.0,12,0,-1],
["7804183000276","cilantro",29,1200,1000.0,0,0,-1],
["7804612221654","Mani confitado SembraSol 100g",30,1450,1080.0,5,0,61],
["7804612221807","Mani salado SembraSol 150g",30,1450,1080.0,5,0,61],
["7804612221814","Mani sin sal SembraSol 150g",30,1450,1080.0,5,0,61],
["7804612222514","Kapy rusti-k merkén 140g",30,1500,1155.0,3,0,61],
["7804612222507","Kapy rusti-k sal de mar 140g",30,1500,1155.0,3,0,61],
["7804612222453","Kapy corte liso 150g",30,1500,1155.0,3,0,61],
["7804612222446","Kapy americanas 150g",30,1500,1155.0,3,0,61],
["0658325192773","Bolsa basura brillex 105x150",29,4900,3700.0,3,0,-1],
["0658325192735","Bolsa basura Brillex 80x110",29,2000,1500.0,5,0,-1],
["0658325192711","Bolsa basura brillex 50x70",29,1000,700.0,10,0,-1],
["7803948000049","Arroz Rio grande",29,1700,1200.0,10,0,-1],
["8445291285507","Goodnes protein chirimoya 140g",20,600,511.0,10,0,30],
["8445291285637","Goodnes protein frutilla 140g",20,700,511.0,10,0,30],
["8445291285477","Goodnes protein natural 140g",20,700,511.0,10,0,30],
["8445291293076","Pack jaleas Pap",2,2000,1400.0,5,0,30],
["7754487000659","Salsa soya Aji no sillao 150ml",2,900,600.0,12,0,-1],
["7804673570364","Escobillon grande",29,3990,2500.0,6,0,-1],
["7804673570074","Escobillon Purti",29,2800,1850.0,10,0,-1],
["7800004004324","LeblonBaby kids",29,6490,499.0,6,0,-1],
["2000040181798","Leblon Protector solar",29,6490,4990.0,12,0,-1],
["4800573052231","Suero fisiologico",29,1000,500.0,10,0,-1],
["7805020000237","Lustra muebles Excell lavanda",31,1900,1392.0,6,0,-1],
["7804610402512","film alum Ghosh",29,1490,700.0,6,0,-1],
["7804610402321","Film Alusa Ghosh",29,1500,2000.0,6,0,-1],
["7804920008640","Detergente Dielli matic",31,3990,2700.0,15,0,-1],
["7804920010483","Lavalozas Fuzol",29,1500,1000.0,12,0,-1],
["7804920010490","LAvalozas Fuzol bicarbonato",29,1490,1000.0,12,0,-1],
["7801235004848","Pulpa Pina",29,2500,1900.0,10,0,-1],
["7801235004862","Pulpa Limon",29,2500,1900.0,10,0,-1],
["1908071888673","plato papel 18cm",52,990,590.0,12,0,24],
["0793969383436","sterikids mamadera",29,2300,1500.0,10,0,24],
["1908071888680","plato de papel 18cm",52,990,590.0,12,0,24],
["1908071888666","plato de papel 18cm",52,990,590.0,12,0,24],
["1908071888710","plato papel 18cm",52,990,590.0,12,0,24],
["1908071888697","plato papel 18cm",52,990,590.0,12,0,24],
["1908071888703","plato de papel 18cm",52,990,590.0,12,0,24],
["0799192062674","galleta de mantequilla de 114g",17,1300,650.0,12,0,-1],
["799192167270","galletas de mantequilla 270gr",17,2200,1427.0,12,0,24],
["799192506925","frutilla  410gr",10,1490,634.0,12,0,24],
["7805810071386","panty super elastica",4,4100,2590.0,12,0,-1],
["7802715460239","Chirimolla alegre pan",19,450,190.0,42,0,64],
["7802715001142","Crema frambuesa panda",19,450,180.0,42,0,64],
["7802715000879","cono crema framb panda",19,900,590.0,40,0,64],
["7802810022387","margarina vegetal 450g",20,2990,1789.0,12,0,24],
["7801965001810","Chorizo montina",40,2000,1547.0,10,0,3],
["7802900610081","Agua Next Frambuesa",29,1400,980.0,10,0,-1],
["7802900601027","Agua Next Limon",29,1400,980.0,10,0,-1],
["658325192346","Ambiental Brillex",29,1400,980.0,6,0,-1],
["658325192339","Ambiental Brillex Vainilla",29,1400,980.0,6,0,-1],
["658325192476","Ambiental Brillex MAnzana",29,1400,980.0,6,0,-1],
["7802000021190","Doritos Queso S",30,1000,770.0,5,0,17],
["7802000021077","De Todito",30,1000,770.0,5,0,17],
["7802000021220","Cheetos S",30,1000,770.0,6,0,17],
["7802000021237","Papas Lais S",30,1000,770.0,6,0,17],
["7802000021022","Lays Jamon serrano S",30,1000,770.0,6,0,17],
["7802000021039","Lays Oregano S",30,1000,770.0,6,0,17],
["7802000020896","Ramitas Churros",30,2200,1695.0,2,0,17],
["7802000020902","Ramitas crema cebolla",30,2200,1695.0,2,0,17],
["7802000010729","MAni japones",30,1200,801.0,3,0,17],
["7800120167040","Cereal In Kat chocolate 200 g",30,1300,938.0,0,0,6],
["7802575533326","MAster Dog R.pequena",30,900,562.0,10,0,6],
["7801620010751","Pepsi zero 475 cc",5,1100,615.0,24,0,5],
["788115783062","I like maqui berries",5,2000,1551.0,4,0,-1],
["677144632246","Ilike limon jenjibre",29,2000,1551.0,6,0,-1],
["677144632253","I like coco pina",29,2000,1551.0,6,0,-1],
["677144632239","I like granada guinda",29,2000,1551.0,6,0,-1],
["788115783055","I like limon frambuesa",29,2000,1551.0,6,0,-1],
["8445291050297","Leche evaporada Gloria",29,2200,1500.0,6,0,-1],
["7802926001085","Postre helado brownie SF 1L",19,7200,5500.0,6,0,37],
["7802926001849","Postre volcán chocolate SF 1L",19,7400,5700.0,6,0,37],
["7802926000071","Postre lúcuma manjar SF 1L",19,7200,5500.0,6,0,37],
["7802926410863","Postre frambuesas crema SF",19,6600,5070.0,6,0,37],
["7802820600100","Vital gasificada 600 ml",5,700,480.0,24,0,5],
["7804621471026","Atun Robinson aceite",29,1600,1190.0,12,0,-1],
["7804621471019","Atun Robinson agua",29,1600,1190.0,12,0,-1],
["084773611502","Choritos Robinson agua",29,2200,1591.0,10,0,-1],
["084773611519","Choritos Robinson aceite",29,2200,1590.0,10,0,-1],
["7802408006102","Splash Fruna 105 ml",19,500,250.0,40,0,1],
["0658325192766","Bolsa basura Brillex",31,3600,2700.0,10,0,-1],
["7804653341601","Tohalla Suan ultra 70m",31,2500,1920.0,16,0,-1],
["021000081059","Mayo Fraft 1.5 ml",2,13900,9790.0,3,0,45],
["7802200135864","gomita frutilla a la crema",29,350,100.0,6,0,-1],
["7801256005008","Durazno cubitos centauro",29,1600,1100.0,6,0,-1],
["7804660690082","Palmitos el bhuo",29,1500,1096.0,6,0,-1],
["7804915012355","Perfume unicornio",29,5400,3890.0,5,0,-1],
["7500435155830","Shampoo Pantene",29,2200,1590.0,4,0,-1],
["7501006721119","Shampoo PAntene restauracion",29,2200,1590.0,4,0,-1],
["7501001169091","Shampoo pantene",29,2200,1590.0,4,0,-1],
["7800678507602","Set tintura",29,1800,1190.0,4,0,-1],
["7509546659374","cepillo de dientes colgate",4,1000,769.0,32,0,24],
["6963256442168","Fruty dip 96g",13,1800,1350.0,8,0,8],
["7808709504552","Crema Surlat 200 cc",29,1490,1100.0,6,0,-1],
["7802410614319","Esencia pan de pascua",2,2200,1651.0,6,0,8],
["7802410545323","Esencia bainilla",2,1900,1400.0,6,0,8],
["7808709505078","Queso Gauda Surlat 9",29,2600,1800.0,9,0,-1],
["7802215501531","Crackelet sal de mar",17,700,468.0,6,0,6],
["7802575007261","Lasana tradicional carozzi",2,2490,1876.0,6,0,6],
["8445291609952","Galleta Navidad Mckay",17,1400,1000.0,14,0,50],
["8445292149808","Galleta Kuky navidad",17,1400,1000.0,14,0,50],
["7801620011062","agua mas frutos de bosque",5,1700,923.0,12,0,-1],
["7804920010155","Jabón piel sensible ballerina",29,1500,1200.0,10,0,-1],
["6971801579795","Pastilla baño azul",29,1300,1000.0,20,0,-1],
["7500435019958","shampoo head and shounders lim",4,2200,1400.0,12,0,65],
["7801320000007","aceite miraflores 900 ml",2,2600,2300.0,6,0,65],
["7801620011079","Agua MAs frutos 1.6",5,1700,1200.0,12,0,5],
["6935068840395","Lente piscina",29,2300,1773.0,6,0,-1],
["7804603533452","Estuche Theme",29,8990,5990.0,4,0,-1],
["7804603533445","Estuche Theme",29,8990,5990.0,4,0,-1],
["7500435020251","Shampoo Pantene",29,2200,1800.0,6,0,-1],
["070847009511","Monster Energi Guarana",5,1900,1200.0,24,0,9],
["7802420005381","Oregano entero Edra 50 g",3,1000,700.0,10,0,29],
["7802000020889","Papas Laus switch",30,2600,1700.0,6,0,-1],
["8445291769885","Colado carbe y verduras",2,2300,1900.0,4,0,30],
["8445291770218","Colado pollo y verduras",2,2300,1900.0,4,0,-1],
["8445291770027","colado carne fideos verdura",2,2300,1900.0,4,0,31],
["6938618520426","biscut chocolate",29,2000,1300.0,0,0,-1],
["6938618520464","biscuit chocolate blanco",29,2000,0,0,0,-1],
["6938618520457","biscuit coco",29,2000,1300.0,0,0,-1],
["6938618520440","biscuit melon",29,2000,1300.0,0,0,-1],
["7802705401839","Paleta Hambrosito",19,400,234.0,24,0,4],
["7802705400948","Paleta Frugele",19,400,234.0,16,0,4],
["7802926001429","Frambuesa crema bresler",19,2300,1719.0,16,0,4],
["7802926001870","Bombon vainilla SF",19,2300,1719.0,16,0,4],
["7802926001580","Cookies Creal SF",19,7200,5459.0,6,0,4],
["7802705410909","Pie de Limon SF",19,7200,5459.0,6,0,4],
["7730971560045","Beauty Set",29,7990,5900.0,5,0,-1],
["7622202312199","club social queso x9 216g",17,1900,1400.0,10,0,46],
["7793253003500","poet limpia piso 900ml",37,1700,1200.0,12,0,46],
["7804651935574","suerox piña 630ml",5,2200,1700.0,12,0,46],
["7622202312298","galleta club social x9",17,1900,1400.0,12,0,51],
["7804606296934","café sachet juan valez cappucc",5,1100,700.0,12,0,22],
["7808743605949","duraznos mitades 250g",2,1700,1100.0,12,0,46],
["7802000020872","Dorito Switch 180 g",30,2200,1600.0,3,0,17],
["7802000018251","De todito dulce220",30,2200,1600.0,3,0,17],
["7802000020735","Lays SC 180",30,2300,1800.0,4,0,17],
["7804660690211","Pinas en rodajas",10,2490,2000.0,6,0,-1],
["7802000020247","doritos sweet chili 180g",30,2200,1700.0,12,0,17],
["7802470002217","sopa caracolitos gourmet",51,700,450.0,12,0,8],
["7804662550148","hamburguesa rupanco 100vg",6,700,500.0,20,0,8],
["0781159442438","torta mil hoja marcelo",29,5500,4500.0,12,0,-1],
["6920052416656","Naipe ingles",43,2000,1200.0,10,0,-1],
["7801840000037","Yerba mate Guaratuba",2,1900,1430.0,6,0,12],
["7805025690488","Velas Arela",2,1000,620.0,12,0,12],
["7802408008267","fiorentina",29,2900,1800.0,0,0,-1],
["7802408006003","fiorentina",29,2900,1800.0,0,0,-1],
["7802080000146","queso fresco los tilos 350g",40,2500,1800.0,12,0,38],
["7805505419615","Cyperkill 25 oc",29,1500,800.0,4,0,-1],
["7802410000976","Base carne mongoliana",29,1200,800.0,6,0,-1],
["7802410101819","Decoracion multicolor",29,1700,1200.0,4,0,-1],
["7802410101765","Decoracion chocolate",29,1700,1200.0,4,0,-1],
["7806810022187","Cloro Gel inpeke limon",29,1600,1.0,6,0,-1],
["7801875001801","bolsa de basura con asa superi",31,990,700.0,12,0,-1],
["7802705401921","Cremissimo orly bresler",19,6200,5500.0,6,0,4],
["7802705401549","Cremissimo costa rama bres",19,6200,5500.0,6,0,4],
["7802705401914","Cremissimo mecano bresler",19,6200,5500.0,6,0,4],
["7804609730459","crema multiuso wyn 750g",31,1600,1200.0,12,0,24],
["8588981158757","navaja de cejas keke",4,2000,1500.0,12,0,14],
["7613036653961","colado carne y verduras 115g",39,2300,1000.0,12,0,30],
["7802408008847","tostao jamon serrano",29,500,400.0,12,0,-1],
["8682213100092","doubi pie pistacho",13,800,600.0,12,0,-1],
["7801965001803","salchicha montina artesana cam",40,1900,1500.0,12,0,24],
["7804775554606","Cera auto aguacol",29,3900,2250.0,12,0,-1],
["7809658536854","Pintura piso",29,4900,2600.0,6,0,-1],
["7805300049468","Tanax pastills",29,5900,3490.0,24,0,-1],
["8696630142986","Anti tabaco Winnex",29,2300,1300.0,6,0,-1],
["8696630142955","Winex manzana canela",29,2300,1300.0,6,0,-1],
["8696630143983","Winnex suenos bebe",29,2300,1300.0,6,0,-1],
["8696630142924","winex lavanda camomilla",29,2300,1300.0,6,0,-1],
["8445292103022","leche condensada nestle 265g",2,1300,1000.0,12,0,31],
["8445290770943","criollitas mckay retro 120g",17,1100,800.0,12,0,31],
["8445291964006","leche consensada gloria 397g",2,2200,1200.0,12,0,31],
["7802408008632","Vasito Fruna 110 ml",29,600,300.0,0,0,-1],
["7803403004315","pinguino galleta alfajor 32g",30,600,400.0,20,0,19],
["7793253006587","Poet frescura tropical",37,1700,1400.0,12,0,-1],
["7804660913396","Apolleta 13 w",29,1300,700.0,10,0,-1],
["7801420002277","Arroz Tucapel g 2 promo",29,2200,1800.0,10,0,-1],
["7806500966012","Lady soft tampones",29,2900,2000.0,10,0,-1],
["7804923025255","Cera depilatoria",29,2900,2000.0,6,0,-1],
["7805300049451","Tanaz enchufe",29,6300,5600.0,4,0,-1],
["7999788888579","Alcohol 70",29,1000,600.0,6,0,-1],
["7805000322564","Mayo Hellmans suprime",2,2600,2000.0,12,0,-1],
["7613035490734","Chomp Frambuesa",19,4400,3500.0,12,0,40],
["7801620010942","Kem pina 1 1/4 des.",5,1000,960.0,12,0,5],
["7803403004490","rollo marinella 32 g",30,600,400.0,11,0,19],
["7802215512391","Frac Clasica",29,700,580.0,12,0,-1],
["7805633008057","Cinta adhesiva",29,2990,2000.0,10,0,-1],
["6900235114524","pack lapices mina 12 uni stich",32,2000,1500.0,24,0,56],
["7800201013587","Madel tri sabor sn azucal 1 L",19,3990,3200.0,12,0,27],
["7800020561016","madel casatta frutos del bosqu",19,2500,2000.0,12,0,27],
["7800020533020","madel casata frutilla platano",19,2500,2000.0,12,0,27],
["8445291928749","Capri",29,1600,1300.0,0,0,-1],
["7804634400372","Queso MAntecoso Rumay",20,2600,2000.0,16,0,3],
["7804115002170","Contre de pollo Ariztia",29,2400,2130.0,12,0,-1],
["8445291702189","chocapic reeta original",38,3000,2500.0,12,0,31],
["8445291976245","chocolate trencito impulsivo14",8,400,350.0,120,0,31],
["8697288521109","chocolate dubai rosso bianco",8,800,600.0,12,0,53],
["7808749501375","Trutro corto Ariztia 800 g",12,3490,2600.0,12,0,3],
["7802575220547","pack durazno x3 vivo",5,1000,800.0,100,0,6],
["7802575220783","pack jugo x3 vivo manzana",5,1000,800.0,100,0,6],
["7802575220158","pacj jugos sprim x3 naranja",5,1000,800.0,100,0,6],
["7802575220189","pack jujos sprim piña x3",5,1000,800.0,100,0,6],
["7802575220165","pack sprim durazno x3",5,1000,800.0,120,0,6],
["7802920009339","Leche Colun S/Lactosa 1",20,1700,1190.0,12,0,21],
["7801620010812","Gatorade LImon 1 L",5,1900,1176.0,12,0,5],
["7801620011208","Gatorade pink berry zero",5,1900,1176.0,12,0,5],
["7500435254953","ariel doble poder 700g",37,2400,1800.0,11,0,62],
["7804610402277","bolsa de basura ghosh 80x110",37,2000,1500.0,12,0,62],
["7809622000404","colonia bubu pink 240ml",4,1900,1400.0,12,0,24],
["7804945005099","ammens 75ml",4,2200,1600.0,12,0,24],
["7804945049918","ammens 120 ml",4,2600,2000.0,12,0,24],
["7804945049901","amens 210 ml",4,5900,4000.0,12,0,24],
["3100004237529","pistola de silicona lavoro",32,4990,3790.0,4,0,24],
["7807210073595","marcador permanente georgi neg",32,700,450.0,12,0,24],
["7807210071980","plumon perm georgi negro",32,700,450.0,12,0,24],
["7807210071973","plumon perm azul georgi",32,700,450.0,12,0,24],
["7807210071928","plumon pizarra azul georgi",32,700,450.0,12,0,24],
["7807210071942","plumon pizarra rojo",32,700,450.0,100,0,24],
["7807210071935","PLUMON NEGRO",32,700,450.0,12,0,24],
["7807210002007","lapiz corrector artel",32,990,700.0,100,0,24],
["3154145347555","sacapuntas maped 2 en 1",32,1200,800.0,100,0,24],
["9999916912204","GOMA DE BORRAR FACTIS",32,700,600.0,100,0,24],
["7807210045158","block papel entretenido",32,1400,850.0,100,0,24],
["8977677305207","gancho metal",32,990,600.0,12,0,24],
["8977677305191","Gancho con hilo",29,990,600.0,10,0,-1],
["2881680001871","Trampa Ratones",29,1000,650.0,6,0,-1],
["2881680000911","Trampa ratones med",29,1300,650.0,6,0,-1],
["6970825570580","Trampa ratones grande",29,1600,850.0,6,0,-1],
["7801235002417","Lomitos de jurel S/Jose",2,1200,889.0,6,0,32],
["4147115103007","Clip colores Fultons",29,1400,990.0,6,0,-1],
["7809559200717","harina con polvo",29,1300,0,0,0,-1],
["78046070801057","carpeta aco clip",29,1200,0,0,0,-1],
["7897982302559","cafe de grano molido makao",2,5200,4000.0,12,0,24],
["8445290846822","Crema de mariscos",2,900,600.0,6,0,31],
["8445290550453","Huevos de pascua Trencito",8,2100,1600.0,48,0,31],
["8445291885806","Capri almendra",8,1700,1400.0,6,0,-1],
["7750243073141","Espirales Don vitorio",2,1000,700.0,12,0,29],
["7750243073158","Coditos Don Vitorio",2,1000,700.0,12,0,29],
["8588988944995","Unas postizas nina",29,1900,1390.0,12,0,-1],
["7802420011597","Nut Mix",30,2300,1700.0,4,0,29],
["658325031690","Servilletas 300 u",31,1990,980.0,10,0,-1],
["8445292266062","Picado Pollo Verduras",29,2300,1700.0,6,0,-1],
["7808709503944","Leche sin lactosa surlat 1 L",20,1600,1300.0,12,0,21],
["7804520017578","almidon de maiz champino 100 g",29,800,650.0,0,0,-1],
["7806130014824","jeringa",29,600,550.0,0,0,-1],
["7805000324919","omo diluir sof",2,4690,3690.0,0,0,-1],
["7805000324247",".omo polvo",29,2490,1300.0,0,0,-1],
["7802220142170","huevitos de chocoate inkat",13,1500,1100.0,100,0,24],
["7622201715236","choco milka con leche 80g",8,2000,1500.0,12,0,8],
["7805000324674","mayonesa helmans 630",34,2600,2000.0,12,0,24],
["7801610003626","fanta lata xbox 350ml",5,1100,932.0,12,0,9],
["7804115002774","Pizza Mozzarella Montina",12,3900,2579.0,6,0,3],
["7802215303289","cereal bar durazno",38,300,200.0,100,0,49],
["90486074","Red Bull Pomelo",5,1700,1271.0,6,0,5],
["7801620852580","Kep sabor tropical",5,1100,723.0,12,0,5],
["7790520998262","Glade lavanda",29,2300,1700.0,6,0,-1],
["7793670000052","Yerba mate Verde Flor",2,2600,1991.0,6,0,-1],
["7804609020581","Jurel De Reyes",10,1500,1000.0,10,0,-1],
["8445291176973","Frambuesa a la crema Savory",19,5500,4225.0,6,0,40],
["8909106024052","jabob Lux",29,700,400.0,12,0,-1],
["8909106024083","Jabon Lux",29,700,400.0,8,0,-1],
["7804617470453","Queso Gauda Surlat 500 g",20,6500,4959.0,12,0,42],
["6973312226885","Tuhallas humedas 80 pc",4,1500,1000.0,12,0,-1],
["7790520029515","Aromatizante Glade mango t",29,2490,1900.0,12,0,-1],
["7790520029522","Aromatizante Glade frescura sa",29,2490,1900.0,10,0,-1],
["7803403004599","Nachos Totopos",30,1300,1000.0,5,0,17],
["7500810046890","Takis Buckin Ranch",30,2000,1600.0,6,0,17],
["7803403003950","Takis Fuego 190 g",30,2000,1600.0,6,0,17],
["7802920005171","Leche Cultivada Colun",20,800,500.0,12,0,48],
["3901276340951","Bombones Kamila Pavolli",29,5000,4000.0,12,0,-1],
["7807210041228","LApiz color Jumbo 12",32,3900,2870.0,12,0,-1],
["7806130000711","Globos amarillos 50",29,2300,1290.0,5,0,-1],
["7806130000933","Globos negros 50",29,2300,1290.0,6,0,-1],
["7806130000872","Globos celestes",29,2300,1290.0,4,0,-1],
["7806130000858","Globos rosados",29,2300,1290.0,4,0,-1],
["7806130002265","Globo verde",29,2300,1290.0,4,0,-1],
["3100004173582","Regla 30 c",32,1200,750.0,10,0,-1],
["7801220006581","papas pre-fritas 2.6",12,6300,3800.0,12,0,42],
["7805040005755","Chancaca x 2",2,2200,1651.0,6,0,45],
["7804945001329","Vaselina Simons",4,3990,2990.0,6,0,16],
["7804947601190","Fijador Laca Duo",4,3900,2490.0,6,0,16],
["7805633009368","Esmaltes x 4",4,3000,1500.0,4,0,16],
["7805633009351","Esmalte x 4",4,3000,1500.0,4,0,16],
["7805633019237","Set de limas",4,2000,1490.0,4,0,16],
["7801505231950","Azucar  rubia IANSA",2,1500,1090.0,12,0,45],
["7804920010537","Antigrasa Fuzol 700 ml",37,1590,1190.0,0,0,-1],
["8697462202183","Sweet Smile bombones rojo",8,5900,3500.0,4,0,57],
["7807210650055","Stick Artel",32,800,490.0,12,0,15],
["7804685581228","Silicona LIquida Rhein 100 g",32,1400,950.0,12,0,-1],
["7802920005164","Leche Cultivada frutilla",20,800,500.0,6,0,48],
["7802920001234","Leche Cultivada Cririmolla L",20,2900,2028.0,6,0,48],
["7802920001203","Leche Cultivada Chiri",20,2900,2300.0,6,0,48],
["7802920010922","Manjar Colun",20,2900,2400.0,6,0,48],
["8445291878105","Yogurth Goodnes",20,600,500.0,8,0,-1],
["7801907014366","chorizo parrollero 200",40,1600,1100.0,100,0,38],
["7801235002424","jurel ahumado 24g",42,1200,800.0,100,0,32],
["7801235004503","papas fritas sal de mar flip",30,950,700.0,120,0,32],
["7806500966036","Ladisoft Tamp",4,2900,2000.0,12,0,-1],
["7804612222682","maxi pipona",30,3500,1990.0,0,0,-1],
["7805040001313","lavaloza virginia 750",31,1900,1281.0,0,0,-1],
["7802000021749","moms 180 g",29,1600,980.0,0,0,-1],
["7802950006339","leche trencito",20,690,450.0,0,0,-1],
["7802408008717","Tostao Queso fruna",30,800,400.0,6,0,18],
["7802215129360","Cobertura chocolate Costa",8,10900,6291.0,0,0,45],
["7791274196300","algabo gel",31,2990,1890.0,0,0,-1],
["7791274196294","algabo gel",31,2990,1890.0,0,0,-1],
["7805633017073","Locion Gel frag celeste",26,6900,4750.0,4,0,24],
["7805633029793","Citrus Fresh amarillo naranja",26,5900,4000.0,4,0,24],
["7804907972766","Petricio Hidra Shock",26,10990,8395.0,4,0,24],
["7805633026037","Chill time box",26,13900,9990.0,4,0,24],
["7804907983502","Hidra Shock Petricio",26,12990,9990.0,4,0,24],
["8935270822859","Jugo Oye lata 490 ml durazno",5,1200,850.0,12,0,62],
["8935270822842","Jugo Oye Pina",5,1200,850.0,12,0,62],
["7801916000275","snackin salame picante",40,600,390.0,120,0,38],
["7801315151608","pina 822g",29,4190,2600.0,0,0,-1],
["7801235004954","Atun San Jose",10,1590,1190.0,24,0,32],
["7891151039673","Fregells C",29,400,100.0,12,0,-1],
["7891151039895","Fregels c limon",29,400,150.0,0,0,-1],
["7805300000377","Tanax moscas y zancudos",45,3200,2400.0,12,0,62],
["7805300000384","Tanax sin olor",45,3200,2400.0,12,0,62],
["7805300000346","Tanax multi insecto",45,3200,2400.0,12,0,62],
["7798141972937","azucar amelia 1k",2,1300,980.0,100,0,24],
["8977677103179","mini brochas de pintura x3",32,2200,1500.0,120,0,24],
["7804520028178","maicena surco 100g",2,700,500.0,100,0,24],
["7802920009643","Leche choc sin lactosa",20,790,600.0,23,0,48],
["7801930006420","Salchicha PF pollo 5",40,1200,900.0,24,0,33],
["658325414677","Atom Frut Energi",5,1500,1080.0,4,0,32],
["7801235004534","Atun en agua",10,1590,1100.0,48,0,32],
["7802810021120","Margarina calo 125 g",29,800,600.0,0,0,-1],
["7802715000787","Frutos del bosque Panda",19,3000,1400.0,6,0,42],
["7804611550618","Duraznos en mitades 1 Gl",10,9700,3600.0,4,0,45],
["7807210610257","Corta carton Artel",32,2500,1800.0,6,0,-1],
["5672306001033","Trampa ratones pega",29,1600,1000.0,12,0,-1],
["7790250096078","LAdysofr ultradelgada",4,1200,890.0,24,0,12],
["7802715001098","panda frambuesa 1",29,3000,2200.0,6,0,-1],
["8445292127820","kuky bolsa",29,1400,980.0,0,0,-1],
["4100017284007","Cola Fria 225 g Fultons",32,1600,990.0,6,0,15],
["7791293045962","acondicionador sedal",4,2700,2045.0,0,0,-1],
["7801920000186","master dog adulto 3k",35,9500,6100.0,12,0,6],
["7805020003504","liampia piso limon",29,1500,1340.0,0,0,-1],
["7805020002590","limpia piso cuaternario",29,1500,0,0,0,-1],
["7801875047137","te supremo 100 bolsas",2,5890,4499.0,100,0,24],
["3100004258418","vela de cumpleano",29,1000,500.0,0,0,-1],
["XN102877","set capivara",29,3990,2490.0,0,0,-1],
["XN099113","set lego",29,3990,2490.0,0,0,-1],
["7802920777511","manjar pote colun",29,1300,823.0,1000,0,-1],
["7806300010021","paquete fosforos x10",31,2000,1500.0,120,0,24],
["8977677131875","libretas medianas",32,2000,1500.0,120,0,24],
["7808304393148","arroz martino",2,1000,635.0,0,0,-1],
["7804115002248","Pechuga deshuesada 550 g",29,5990,4500.0,10,0,-1],
["7797453000802","sobre comida perro adulto",35,1000,680.0,120,0,8],
["7622202809163","oreo golden frutilla 108g",17,990,600.0,120,0,63],
["7730219021338","Jabon Elite",4,1200,800.0,12,0,-1],
["7802920000176","Yoghurt batido 1 Lt",20,1300,992.0,6,0,48],
["7802920801704","Yoghurt Batido 1 Lt",20,1300,992.0,6,0,48],
["7791293022819","Dove Men Antimanchas",29,3000,2850.0,0,0,-1],
["7791293012087","Dove men confort protectic",29,3000,2850.0,0,0,-1],
["8445291790605","Chocolate Capri menta",29,1600,1000.0,6,0,-1],
["7898591453106","Tubos Fini 80 g",13,1200,800.0,12,0,62],
["6971549921054","Aloe Coco 1.5 l",5,2600,1950.0,12,0,-1],
["7806500752288","Panal Babysec XG x 4",29,4200,3187.0,12,0,-1],
["7801552008055","Mini COno Frutos Bosque",29,800,500.0,42,0,-1],
["7802575353412","Pomarola 1 Kl",29,2900,1990.0,4,0,-1],
["zapallo italiano","zapallo italiano",33,800,500.0,12,0,24],
["7802000021862","Papas Lays M",30,1600,1200.0,12,0,17],
["7801620010737","Cachantun Strong Gas 600",5,800,582.0,12,0,5],
["7803495000677","Magdalenas vainilla Selecta",29,2600,1990.0,4,0,-1],
["7803495005566","Magdalenas Fiesta x6",29,2600,1990.0,6,0,-1],
["7803495000936","Magdalenas 3 leches Selecta",29,2600,1900.0,6,0,-1],
["7803495002657","PAn Pita integral ideal",25,1500,1149.0,6,0,-1],
["7803495002640","Pan pita Selecta",25,1500,1148.0,6,0,-1],
["7803495000493","Magdalenas chocolate",29,2600,1100.0,6,0,-1],
["658325031676","Tohalla papel XL Pro paper",29,2000,1500.0,20,0,-1],
["7622202023170","Galleta Club Social",29,1600,1200.0,6,0,-1],
["7802920001326","Mantequilla untable Colun",29,4200,3800.0,6,0,-1],
["panes","pan",21,200,171.0,0,0,-1],
["7802410003571","Corazones Multicolor Gourmet",29,1990,1476.0,6,0,-1],
["7802410003588","Estrellas Multicolor Gourmet",29,1990,1476.0,6,0,-1],
["7801534003320","Palmitos enteros Deyco",10,3600,2700.0,6,0,-1],
["7801534003337","Palmitos en mitades Deyco",10,2400,1800.0,6,0,-1],
["8888021300185","pila 2032",29,2500,1800.0,0,0,-1],
["7802926410870","Papayas a la crema SF",19,5300,4074.0,6,0,4],
["7802926000965","Chocolate Nuss",19,7400,5700.0,6,0,4],
["7802000021756","Lays Ketchup 170 g",30,2600,1924.0,6,0,17],
["7800008000445","Blistex Berry",29,3900,2000.0,6,0,-1],
["7800008000469","Blistex Classic",29,3900,2000.0,6,0,-1],
["7804920007148","Acondicionador Ballerina",29,1900,1390.0,6,0,-1],
["7804920007438","Shampoo Balleriba",29,1900,1390.0,6,0,-1],
["7804920002624","Shampoo Ballerina",29,1900,1390.0,6,0,-1],
["7804920002587","Acondicionador Ballerina",29,1900,1390.0,6,0,-1],
["7801875067043","Yerba JAviera",29,1700,1300.0,6,0,-1],
["7804945007307","babyland emulsionado 270ml",29,2400,1790.0,0,0,-1],
["7803473006202","pinguino",29,1000,850.0,0,0,-1],
["7622202257599","Milka castana 95 g",8,3200,2390.0,6,0,-1],
["7809583800136","alusa kitchen 100m",31,2900,2000.0,120,0,24],
["7802705401259","Vivo Bresler mango mara",19,1300,990.0,24,0,4],
["7802705401105","Frac Bresler vainilla",19,1100,800.0,24,0,4],
["7802705401570","Orly Bresler menta",19,1200,800.0,24,0,4],
["7848004940020","Arroz EnocRice",29,1300,720.0,12,0,-1],
["8977677123160","Brocha",29,1900,1850.0,0,0,-1],
["5690163506645","Lapiz tinta metalica",32,3900,2500.0,6,0,-1],
["6973387084953","Lapiz tinta metalica",32,3900,2000.0,6,0,-1],
["5690163506652","Lapiz tinta Fluorecente",32,3900,2000.0,6,0,-1],
["7807219005252","Lapiz tinta Gliter",32,1900,1000.0,6,0,-1],
["7801610350409","Coca cola zero 1.5",5,2400,1804.0,20,0,9],
["7801305004075","Garbanzos Wasil 380 g",2,1200,890.0,6,0,10],
["7801305004082","Lentejas Wasil 380g",2,1200,890.0,6,0,10],
["7801305005461","Habas Wasil 380 g",2,2200,1570.0,6,0,10],
["7802900004194","Yoghurt PRotein 1+1",20,950,699.0,6,0,10],
["7802900002190","Yogurt sin azucar vainilla",20,600,449.0,12,0,-1],
["7802900004330","BAtifrut soprole papaya",20,750,549.0,6,0,43],
["7802900005092","Batifrut soprole",20,750,579.0,6,0,43],
["7802900002039","Protein Vainilla",20,800,609.0,6,0,10],
["78014053","Jalea colun pina",20,500,265.0,6,0,10],
["78013285","Jalea framb",20,500,265.0,6,0,10],
["78013292","Jalea Naranja",20,500,265.0,6,0,10],
["78014046","Jalea guin",20,500,265.0,6,0,10],
["7802920221458","Manjar Colun 1 k",20,4800,3500.0,6,0,21],
["7802900111014","Mantequilla sin sal sopro",20,3700,2849.0,6,0,10],
["7802800709649","Compota Pera Livean",29,700,524.0,10,0,-1],
["7802715001104","casata panda manjar",29,3000,2600.0,0,0,-1],
["6920251100301","Guante goma L",37,1500,1059.0,6,0,-1],
["7593298013508","Guante goma M",37,1500,1059.0,6,0,-1],
["77917188","la gotita",29,2600,1800.0,0,0,-1],
["7802215507298","Galleta Maria Costa",17,2200,1649.0,5,0,6],
["8445291796539","triton",29,990,600.0,10,0,-1],
["7804665470245","tabaco",29,5900,0,0,0,-1],
["78034099","filtro",29,1800,1200.0,5,0,-1],
["7802000021701","Lays XL americana",30,3900,2990.0,6,0,18],
["7802408005556","Gato encerrao fruna",30,2300,1700.0,5,0,18],
["7802420009273","Papas inferno peperoni",30,2200,1664.0,5,0,29],
["7802420010323","Cruncchis mani MP",30,1990,1477.0,6,0,29],
["7802420012495","Snack mix MP 220 g",30,2200,1477.0,5,0,29],
["7802420013683","Papas jamon serrano",30,2200,1477.0,6,0,29],
["7802337930479","Sopaipack",2,2200,1700.0,3,0,55],
["7802408005709","Flippos Fruna",30,300,180.0,10,0,18],
["7899026462533","garnier negro intenso",29,3000,1900.0,0,0,-1],
["7899026462595","garnier castano rojiso",29,3000,1900.0,0,0,-1],
["7804520028161","maicena surco",2,1100,580.0,10,0,-1],
["7899026462601","garnier castano claro",29,3000,1900.0,0,0,-1],
["7899706120746","garnier chocolate",29,3000,1900.0,0,0,-1],
["7898587775908","garnier negro azulado",29,3000,1900.0,0,0,-1],
["7899026462540","garnier negro",29,3000,1900.0,0,0,-1],
["7899026462571","garnier castano",29,3000,1900.0,0,0,-1],
["7899706130899","garnier chocolate caoba",29,3000,1900.0,0,0,-1],
["7899026462670","garnier rubio",29,3000,1900.0,0,0,-1],
["7898587770651","garnier castano claro",29,3000,1900.0,0,0,-1],
["7899026462656","garnier rojo intenso",29,3000,1900.0,0,0,-1],
["7509552828894","garnier rubio ultra claro",29,3000,1900.0,0,0,-1],
["7898587775946","garnier rubio muy claro",29,3000,1900.0,0,0,-1],
["7899026462557","garnier castano oscuro",29,3000,1900.0,0,0,-1],
["7898587770699","garnier rubio ceniza",29,3000,1900.0,0,0,-1],
["7899026462625","garnier rubio oscuro",29,3000,1900.0,0,0,-1],
["7899026462687","garnier rubio claro",29,3000,1900.0,0,0,-1],
["7804945016217","colonia bebe simonds",29,3400,2200.0,0,0,-1],
["7804945016224","colonia simonds",29,3400,2200.0,0,0,-1],
["7804915525329","gelatti minnie",29,8990,5200.0,0,0,-1],
["7804907971813","harley quinn",29,9990,6000.0,0,0,-1],
["7804915525473","set bano con guante",29,7990,4500.0,0,0,-1],
["7806130000391","globo surtido",29,23400,1600.0,0,0,-1],
["7804995101284","guatero sertificado",29,4900,2100.0,0,0,-1],
["7804995134367","guatero certificado",29,4900,2600.0,0,0,-1],
["7804995134312","guatero certificado",29,4900,2200.0,0,0,-1],
["7803600000318","sal  eulalia",29,650,0,5,0,-1],
["7804610402284","Bolsa de basura Ghosh",29,3300,2500.0,6,0,-1],
["798190260020","Scoore Original",5,1300,858.0,24,0,62],
["7801235131155","atlas",29,2700,900.0,5,0,-1],
["7803408002774","Pizza Fresh",29,5500,4500.0,6,0,-1],
["7803408002798","Pizza Fresh",29,5500,4500.0,6,0,-1],
["4133301463","pilas duracell AA",29,2000,0,0,0,-1],
["8000144074112","masa moldeable Das",29,3200,0,8,0,-1],
["8445291790032","Milo sobre",29,400,150.0,25,0,-1],
["6982025021717","Audifono Nike",29,8990,5990.0,6,0,-1],
["2021061264192","Cable de parlante",29,2490,1000.0,6,0,-1],
["5000394140851","Pilas recargables Duracell",29,9990,5000.0,3,0,-1],
["8477060820459","Cable ipone",29,3900,1500.0,10,0,-1],
["7898591455193","Gomitas acidas",29,1300,890.0,6,0,-1],
["6902023003812","Cable tipo C",29,2000,1000.0,7,0,-1],
["6902409500102","Cargador tipo C",29,4000,1500.0,10,0,-1],
["7793253003456","Poet Bebe",31,1700,1300.0,12,0,62],
["799192507045","te negro todo",29,2200,1590.0,0,0,-1],
["7803403004612","Hit MArinela",29,500,385.0,6,0,-1],
["7803403004131","Salmas ideal",29,1890,1300.0,6,0,-1],
["7804915525480","advengers",29,7990,0,0,0,-1],
["7804915525497","spiderman",29,7990,0,0,0,-1],
["7803403004032","takis",29,1000,0,10,0,-1],
["7804612222538","mani salado",29,1500,0,0,0,-1],
["7802225682183","Selz Max Clasica",17,1000,770.0,15,0,2],
["7802225680738","Galleta Mana limon",17,1000,770.0,12,0,2],
["7802225680592","Galleta Vainilla Mana",17,1000,770.0,12,0,2],
["7802225513197","Bon o bon x 4",17,1000,770.0,30,0,2],
["7802225153447","BigTime Ultraberry",29,1500,1143.0,12,0,-1],
["7802225153409","BigTime Menta",29,1500,1143.0,12,0,-1],
["7805810185151","pantys almendra",29,2200,2000.0,0,0,-1],
["0732064794631","cotonitos",29,1300,1100.0,0,0,-1],
["7807210029448","Tempera 250ML",29,2200,2000.0,0,0,-1],
["7807210029219","Tempera 250ML",29,2200,2000.0,0,0,-1],
["7807210029882","Tempera 250ML",29,2200,2000.0,0,0,-1],
["7807210029813","Tempera 250ML",29,2200,2000.0,0,0,-1],
["7807210029547","Tempera 250ML",29,2200,2000.0,0,0,-1],
["7804685585905","Papel lustre",29,1600,1500.0,0,0,-1],
["7807210029110","Tempera 250ml",29,2200,2000.0,0,0,-1],
["7804614181871","alcohol al 70",29,5900,4300.0,0,0,-1],
["7802920116013","parmesano",29,1100,890.0,0,0,-1],
["8445291716841","triton",29,990,0,5,0,-1],
["7812090001149","Cloro Gel 1 Lt",29,1400,1000.0,10,0,-1],
["7803525001957","Brownie dulce de leche",29,800,650.0,18,0,-1],
["7501013118117","Jumex Pina",5,1100,797.0,12,0,-1],
["7802215502590","Dindon Crema Americana",17,850,620.0,12,0,6],
["7802215512476","Dindon Chocolate",17,850,620.0,12,0,6],
["7804634400563","rumay  100g",29,1300,800.0,0,0,-1],
["7803403004810","Queque Vainilla 160 g",29,1450,1078.0,6,0,-1],
["7802705619012","viennette mora",29,5000,3750.0,0,0,-1],
["7802705613645","Viennetta Clasica",29,5000,4450.0,0,0,-1],
["7802705613652","Viennetta lucuma",29,5000,4450.0,0,0,-1],
["7802705618411","Viennetta capuchino",29,5000,4450.0,0,0,-1],
["7613036868228","Crazy Chirimoya alegre",19,1600,1200.0,12,0,40],
["7613035391369","Crazy Sangurucho Savory",19,1700,1280.0,24,0,40],
["7801620010928","Pepsi 1.25 desechable",5,1000,800.0,18,0,5],
["8977677303739","Cutter con recambios",29,2900,2250.0,6,0,-1],
["7807265022517","Tijera costurera",29,4400,3450.0,6,0,-1],
["7801965001537","Hamburguesa pollo Big",40,1000,678.0,16,0,3],
["INT-LEGACY-1","Tomate",16,1300,1200.0,20,1,24],
["INT-LEGACY-2","Jamonada San Jorge",7,6500,0.77,5,1,38],
["INT-LEGACY-3","queso gouda",7,11000,0.77,15,1,38],
["INT-LEGACY-4","Aceite de oliva Sabattini250ml",2,7900,4479.0,4,0,24]
];

function buildLegacyImportV2(existingProducts, existingSuppliers) {
  const existingBarcodes = new Set(existingProducts.map(p => p.barcode));
  const supplierByName = new Map(existingSuppliers.map(s => [normalize(s.name), s]));
  const now = new Date().toISOString();
  const newSuppliers = [];

  function resolveSupplierId(supName) {
    if (!supName) return null;
    const key = normalize(supName);
    let s = supplierByName.get(key);
    if (!s) {
      s = { id: uid("sup"), name: supName, linkman: "", phone: "", email: "", address: "", remark: "", createdAt: now };
      supplierByName.set(key, s);
      newSuppliers.push(s);
    }
    return s.id;
  }

  const newProducts = [];
  LEGACY2_PRODUCTS.forEach(row => {
    const [barcode, name, catIdx, price, cost, stock, unitFlag, supIdx] = row;
    if (existingBarcodes.has(barcode)) return; // ya existe, no se pisa
    existingBarcodes.add(barcode);
    const supplierId = supIdx >= 0 ? resolveSupplierId(LEGACY2_SUPS[supIdx]) : null;
    newProducts.push({
      id: uid("prod"), barcode, name: upperField(name), category: upperField(LEGACY2_CATS[catIdx]),
      price, cost, stock, minStock: 5, supplierId,
      unitType: unitFlag === 1 ? "peso" : "unidad", quickAccess: false,
      priceApproval: null,
      priceHistory: [{ date: now, cost, price }],
    });
  });

  return { newProducts, newSuppliers };
}


// Marca de tiempo de la última escritura al almacenamiento (cualquier guardado
// en toda la app pasa por saveJSON). La sincronización periódica la usa para
// no pisar datos que este mismo dispositivo acaba de guardar y que todavía
// podrían no estar reflejados en una lectura que ya estaba en camino.
// El guardado vive ahora en lib/datos: mantiene este mismo contrato de
// "una llave, un JSON" hacia las pantallas, y por dentro traduce a
// consultas sobre las tablas del esquema galpon.

// Combina un registro (ventas, movimientos, facturas, etc.) recién leído del
// almacenamiento con lo que ya había en pantalla, en vez de reemplazarlo sin
// más. Así, si la sincronización periódica llega justo mientras este mismo
// dispositivo está guardando algo nuevo, ese registro no desaparece de la
// vista mientras se termina de escribir — se completa solo en el siguiente ciclo.
/* El catálogo llega por partes: la sincronización pide solo los productos que
   cambiaron desde el ciclo anterior. Se fusionan sobre los que ya están en
   pantalla —y los que vienen marcados como dados de baja se sacan—, en vez de
   reemplazar la lista entera cada quince segundos.

   Se reordena por nombre solo cuando algo cambió, para conservar el orden con
   el que venía el catálogo completo. */
function fusionarProductos(previos, llegados) {
  if (!Array.isArray(llegados) || llegados.length === 0) return previos;
  if (!Array.isArray(previos) || previos.length === 0) {
    return llegados.filter(p => !p?.__eliminado);
  }
  const porId = new Map(previos.map(p => [p.id, p]));
  for (const p of llegados) {
    if (!p?.id) continue;
    if (p.__eliminado) porId.delete(p.id);
    else porId.set(p.id, p);
  }
  return Array.from(porId.values()).sort(
    (a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), "es")
  );
}

function mergeById(local, fetched) {
  const map = new Map();
  fetched.forEach(item => map.set(item.id, item));
  local.forEach(item => { if (!map.has(item.id)) map.set(item.id, item); });
  const sortKey = item => new Date(item.date || item.closedAt || item.openedAt || 0);
  return [...map.values()].sort((a, b) => sortKey(b) - sortKey(a));
}

/* ---------------------------------------------------------
   RECEPCIÓN DE PEDIDOS — helpers
   Precio sugerido = neto + IVA 19% + ganancia mínima 30% sobre el valor con IVA
--------------------------------------------------------- */
function suggestPrice(netCost) {
  const withTax = netCost * 1.19;
  const withMargin = withTax * 1.30;
  return Math.ceil(withMargin / 10) * 10;
}

// Agrega una entrada al historial de costo/precio de un producto, solo si
// alguno de los dos valores realmente cambió respecto a la última entrada —
// así queda un registro real de cómo evolucionó, sin ruido repetido.
function pushPriceHistory(history, cost, price) {
  const h = Array.isArray(history) ? history : [];
  const last = h[h.length - 1];
  if (last && last.cost === cost && last.price === price) return h;
  const next = [...h, { date: new Date().toISOString(), cost, price }];
  return next.slice(-15);
}

/* Fecha desde la que un producto quedó en 0 —Inventario la usa para avisar
   cuáles llevan 6 meses o más sin stock. Se marca la primera vez que el stock
   cae a 0 y se limpia sola en cuanto vuelve a tener stock; mientras se
   mantenga en 0, la fecha original no cambia. */
function nextStockZeroSince(prevStock, prevZeroSince, newStock) {
  const stock = Math.max(0, Number(newStock) || 0);
  if (stock === 0 && !(Number(prevStock) > 0) && prevZeroSince) return prevZeroSince;
  if (stock === 0) return new Date().toISOString();
  return null;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || "";
      const match = result.match(/^data:(.*);base64,(.*)$/);
      if (!match) { reject(new Error("Formato de archivo no soportado")); return; }
      resolve({ mediaType: match[1], data: match[2], dataUrl: result });
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

// Reduce el tamaño de las fotos de factura antes de guardarlas (el almacenamiento
// tiene un límite por archivo) sin perder legibilidad para la IA ni para el archivo.
function compressImage(dataUrl, maxDim = 1500, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("No se pudo procesar la imagen"));
    img.src = dataUrl;
  });
}

const UNSUPPORTED_IMAGE_TYPES = ["image/heic", "image/heif"];

async function fileToAttachment(file) {
  const { mediaType, data, dataUrl } = await fileToBase64(file);
  if (UNSUPPORTED_IMAGE_TYPES.includes(mediaType.toLowerCase()) || /\.hei[cf]$/i.test(file.name || "")) {
    throw new Error("Esta foto está en formato HEIC/HEIF, que no se puede leer aquí. En el iPhone: Ajustes → Cámara → Formatos → elige \"Más compatible\", y vuelve a tomar la foto (o usa Ajustes → Fotos al exportar/compartir como JPEG).");
  }
  if (mediaType.startsWith("image/")) {
    // La compresión es un paso opcional para ahorrar espacio: si por algún
    // motivo falla (formato raro, imagen muy grande, etc.), se sigue con el
    // archivo original en vez de cortar toda la operación.
    try {
      const compressed = await compressImage(dataUrl);
      const match = compressed.match(/^data:(.*);base64,(.*)$/);
      if (match) return { mediaType: match[1], data: match[2], dataUrl: compressed, name: file.name };
    } catch (e) { /* sigue con el archivo sin comprimir */ }
  }
  return { mediaType, data, dataUrl, name: file.name };
}

function findProductMatch(products, name, code) {
  if (code) {
    const cleanCode = normalize(code).replace(/[^a-z0-9]/g, "");
    if (cleanCode) {
      const byCode = products.find(p => p.barcode && normalize(p.barcode).replace(/[^a-z0-9]/g, "") === cleanCode);
      if (byCode) return byCode;
    }
  }
  const nName = normalize(name);
  if (!nName) return null;
  let best = null, bestScore = 0;
  products.forEach(p => {
    const pn = normalize(p.name);
    if (!pn) return;
    if (pn === nName) { best = p; bestScore = 999; return; }
    if (bestScore < 999 && (pn.includes(nName) || nName.includes(pn))) {
      const score = Math.min(pn.length, nName.length);
      if (score > bestScore) { best = p; bestScore = score; }
    }
  });
  return bestScore >= 4 ? best : null;
}

const INVOICE_PROMPT = `Vas a analizar una factura o boleta electrónica chilena (documento del S.I.I.) emitida por un proveedor a este negocio. Puede venir como una o varias imágenes/páginas que forman UN SOLO documento (por ejemplo, una factura de más de una página) — en ese caso, trata todas las páginas como una sola tabla de productos y devuelve un único arreglo combinado con todos los productos de todas las páginas, sin repetir encabezados ni duplicar líneas que aparezcan cortadas entre el final de una página y el inicio de la siguiente.

Los proveedores usan formatos MUY distintos entre sí — desde tickets angostos de una sola columna de precios, hasta facturas de página completa con muchas columnas (descuentos, flete, impuestos adicionales). Debes reconocer la estructura de la tabla de productos sea cual sea su forma, no asumas un único layout.

QUÉ BUSCAR EN LA TABLA DE PRODUCTOS (los nombres de columna varían según el proveedor, reconócelas por su significado, no por el texto exacto):
- Código del producto: es habitual que aparezca ANTES del nombre/descripción en cada línea (a la izquierda, como primera columna) — es frecuentemente el código de barras (EAN/UPC) real del producto, aunque a veces es solo un código interno del proveedor. Transcríbelo COMPLETO Y EXACTO, dígito por dígito, sin omitir ceros iniciales ni redondear — este código se usa para reconocer automáticamente el producto en el inventario, así que la precisión aquí importa mucho. Si la columna viene vacía o con "-", usa null.
- Descripción: puede llamarse "Descripción" o "Detalle"; puede ocupar dos líneas (ej. nombre + marca/formato) — únelas en un solo nombre. Incluye el formato/tamaño si aparece (ej. "125GR", "1KG", "CAJA 12UN X250GR") como parte del nombre, ayuda a identificar el producto.
- Cantidad: puede llamarse "Cantidad", "Cant", "Caj/Bot", etc. Puede venir seguida de una unidad (ej. "535 caja", "10 kg", "3 un") — extrae solo el número. La cantidad puede tener decimales (ej. "4,3" = 4.3), no asumas que siempre es un entero.
- MUY IMPORTANTE — cajas/paquetes vs. unidades individuales: en muchas facturas de distribuidoras, la "Cantidad" y el "Precio" de la línea corresponden a la CAJA o PAQUETE completo (ej. 1 caja con 12 unidades adentro), pero el negocio vende esos productos de forma individual al público. Debes detectar cuando la descripción indica cuántas unidades trae cada caja/paquete — frases como "CAJA 12UN", "X12", "X 12", "12UN", "PACK 12", "12 unidades" — y en ese caso:
  1. Multiplica la cantidad de la factura (N° de cajas/paquetes) por las unidades que trae cada una, para obtener el total de UNIDADES INDIVIDUALES realmente recibidas.
  2. Divide el precio neto de esa línea (que es el precio de la caja/paquete completo) por esa misma cantidad de unidades por paquete, para obtener el precio neto POR UNIDAD INDIVIDUAL.
  3. Reporta en el JSON la cantidad total de unidades individuales (no de cajas) y el precio neto por unidad individual (no por caja) — así el negocio recibe el stock correcto en unidades vendibles, al precio real de cada una.
  Ejemplos de este cálculo:
  - "DULCE WATT'S MEMBRILLO CAJA 12UN X250GR", cantidad de factura 1, precio neto de línea $7.903,36 (precio de la caja) → 1 caja de 12 unidades → reporta quantity: 12, netUnitPrice: 658.61 (7903.36 ÷ 12).
  - "MARGARINA SUREÑA POTE 450GRS X12", cantidad de factura 6, precio neto de línea $1.861,35 (precio de cada caja) → 6 cajas de 12 unidades cada una = 72 unidades → reporta quantity: 72, netUnitPrice: 155.11 (1861.35 ÷ 12).
  Si la descripción NO indica unidades por caja/paquete (no hay ningún "X##" ni "##UN"), no inventes un tamaño de paquete — deja la cantidad y el precio tal como aparecen en la factura.
- Tipo de venta (unitType): determina si el producto se vende POR PESO (kg) o POR UNIDAD:
  - Es señal de venta por peso: la cantidad viene en decimales representando kilos reales (ej. "4,3" kg de queso, no "4,3 cajas" — una cantidad fraccionaria de cajas/paquetes no tiene sentido, pero una cantidad fraccionaria de kilos sí); la columna de cantidad o unidad dice explícitamente "KG"; o el producto es de un tipo que habitualmente se vende a granel por peso (quesos, cecinas, carnes, frutas, verduras), especialmente si el precio unitario es claramente un "precio por kilogramo" y no un precio por bulto/paquete cerrado.
  - Si no hay ninguna señal de venta por peso, asume "unidad" (paquetes, cajas, botellas, unidades cerradas con cantidad entera).
  - Ojo: que el envase individual diga "1KG" o "250GR" (ej. "QUESO FRESCO BOL 1KG", "GALLETA 30x120GR") NO significa por sí solo que se venda por peso — eso solo describe el formato de cada paquete. La señal real de venta por peso es que la CANTIDAD comprada esté expresada en kilos (a menudo con decimales), no en número de paquetes.
- Precio y valor final: esto es lo más importante y lo que más varía entre proveedores:
  - Si la tabla trae una sola columna de precio unitario y una columna de valor/total de línea, usa esas.
  - Si la tabla trae "Precio Neto" Y "Precio Bruto" (con IVA) en columnas separadas, usa SIEMPRE el NETO — nunca el bruto.
  - Si la tabla trae columnas de descuento (Descuento, %Desc, Tasa Descto, Monto Descto) que ya están restadas en una columna final de "Valor" o "Total", ese valor final (después del descuento) es el que importa.
  - Algunas facturas de distribuidoras (bebidas, alcoholes) agregan columnas extra como Flete, IABA, ILA (impuestos adicionales por grado alcohólico/azúcar) — estas NO son parte del costo neto del producto en sí, ignóralas para el cálculo del precio unitario.
  - REGLA GENERAL Y MÁS CONFIABLE: si tienes dudas sobre qué columna usar, calcula el precio unitario neto como (valor final de la línea, después de descuentos, antes de IVA e impuestos adicionales) ÷ (cantidad). Esto funciona sin importar cuántas columnas intermedias tenga la factura. Si el producto es por peso, este precio unitario resultante es el precio POR KILOGRAMO.
- Líneas que NO son productos: ignora totalmente filas de "Flete de Mercaderías", "Flete", envases/depósitos, y cualquier línea que sea un cargo o servicio en vez de un producto — no las incluyas en el resultado.

FORMATO NUMÉRICO CHILENO — MUY IMPORTANTE:
Los montos y cantidades usan el punto (.) como separador de miles y la coma (,) como separador decimal. Ejemplos de lectura correcta:
- "10.000" = diez mil = 10000
- "5.350.000" = cinco millones trescientos cincuenta mil = 5350000
- "503,36" = quinientos tres coma treinta y seis = 503.36
- "5.033,61" = cinco mil treinta y tres coma sesenta y uno = 5033.61
- "4,3" (en la columna cantidad) = cuatro coma tres = 4.3
Cuando entregues los números en el JSON, escríbelos en formato estándar (sin puntos de miles, con punto como separador decimal si corresponde), como números normales de JavaScript.

QUÉ IGNORAR: totales, subtotales, IVA, impuestos adicionales (IABA, ILA, etc.), flete, envases/depósitos, datos de RUT/dirección/giro del emisor o receptor, el timbre electrónico/código de barras, y cualquier texto que no sea una línea de producto real.

Responde ÚNICAMENTE con un arreglo JSON válido, sin texto adicional, sin explicaciones, sin markdown, exactamente con este formato:
[{"name":"string","quantity":number,"netUnitPrice":number,"code":"string o null","unitType":"peso o unidad"}]`;

// attachments: array de { mediaType, data } — una o varias páginas del mismo documento.
function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

// Llama a la API de Claude con reintentos automáticos si la respuesta es por
// límite de solicitudes seguidas (espera cada vez más y lo intenta de nuevo
// solo, antes de mostrarle cualquier error a la persona). Este límite es
// compartido por todo el negocio — no por cada persona — así que puede
// activarse aunque quien lo ve no haya usado la IA justo antes.
async function callClaudeAPI(body) {
  // La clave de Anthropic no puede estar en el navegador: la petición va a
  // /api/analizar-factura, que comprueba la sesión y consulta desde el
  // servidor. Los reintentos por saturación también viven allá.
  const sb = obtenerCliente();
  const { data: { session } } = await sb.auth.getSession();
  const respuesta = await fetch("/api/analizar-factura", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token || ""}`,
    },
    body: JSON.stringify(body),
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || datos.error) {
    throw new Error(datos.error || "No se pudo leer el documento.");
  }
  return datos;
}

async function analyzeInvoiceImage(attachments) {
  const list = Array.isArray(attachments) ? attachments : [attachments];
  const contentBlocks = list.map(({ mediaType, data }) => {
    const isPdf = mediaType === "application/pdf";
    return isPdf
      ? { type: "document", source: { type: "base64", media_type: mediaType, data } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data } };
  });
  const promptText = list.length > 1
    ? `Estas ${list.length} imágenes son páginas consecutivas de UN MISMO documento (en orden). ${INVOICE_PROMPT}`
    : INVOICE_PROMPT;
  const data_ = await callClaudeAPI({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    messages: [{
      role: "user",
      content: [...contentBlocks, { type: "text", text: promptText }]
    }]
  });
  if (data_.stop_reason === "max_tokens") {
    throw new Error("La factura tiene demasiadas líneas para leerla de una vez. Intenta escanear las páginas por separado, o ingresa los productos manualmente.");
  }
  const textBlock = (data_.content || []).find(b => b.type === "text");
  if (!textBlock || !textBlock.text || !textBlock.text.trim()) throw new Error("La IA no devolvió resultados legibles. Prueba con una foto más nítida o mejor iluminada.");
  // Se busca el arreglo JSON dentro de la respuesta en vez de asumir que el
  // texto completo ya es JSON válido — así, si la IA agrega alguna palabra de
  // más antes o después pese a la instrucción, igual se puede leer el resultado.
  const raw = textBlock.text.replace(/```json|```/g, "").trim();
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("La IA no devolvió una lista de productos reconocible. Prueba con una foto más nítida, o ingresa los productos manualmente.");
  }
  let parsed;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch (e) {
    throw new Error("No se pudo interpretar la respuesta de la IA. Prueba con una foto más nítida, o ingresa los productos manualmente.");
  }
  if (!Array.isArray(parsed)) throw new Error("Formato de respuesta inesperado");
  return parsed;
}

const MARCELITA_BASE_PROMPT = `Eres "Marcelita", la asistente virtual del sistema de ventas e inventario de este negocio (un almacén/negocio de venta al por menor en Chile). Tu tono es cercano, cálido y directo, como una compañera de trabajo que conoce bien el sistema — sin ser empalagosa ni demasiado formal.

Ayudas con varias cosas:
1. Dudas sobre cómo usar el sistema. Estas son sus secciones:
   - Vender: cobro con escáner de código de barras o cámara, catálogo rápido para productos sin código (por unidad o por peso/kg), cálculo de vuelto en efectivo, consumo interno autorizado con PIN. Antes de confirmar cada venta se pide elegir quién la realiza e ingresar su PIN de vendedor (ese PIN se configura por persona en Usuarios y es distinto del PIN de administrador de Ajustes) —la caja es una sola compartida por todos, así que esto es lo que deja saber a quién adjudicar cada venta.
   - Caja: una sola caja compartida por todo el equipo (no una por persona) — cualquiera cobra en ella una vez abierta, retiros y refuerzos de efectivo, y al cerrar la cuadratura muestra un desglose de cuánto vendió cada vendedor.
   - Boletas: historial de ventas con número correlativo único.
   - Inventario: catálogo de productos, alertas de stock bajo, reposición de stock, registro de mermas (pérdidas/robos) con autorización de administrador, productos de "acceso rápido" sin código de barras.
   - Recepción: ingreso de mercadería nueva, con foto de factura/boleta obligatoria (o "entrada libre" como excepción autorizada), lectura automática por IA de facturas de proveedores, precios sugeridos que los administradores deben aprobar si los crea un vendedor.
   - Proveedores (solo administradores): directorio de proveedores, historial de facturas, comparación de precios entre proveedores, rentabilidad.
   - Finanzas (solo administradores): ingresos y egresos, gráfico de ventas, sueldos de trabajadores.
   - Análisis (solo administradores): productos más vendidos, productos de bajo movimiento, alertas de stock, ranking de proveedores.
   - Ajustes (solo administradores): nombre del negocio, PIN de administrador, IVA.

2. Consultas de stock, precio o disponibilidad de productos QUE SÍ están en el inventario del negocio (ej. "cuánto stock tengo de tomate", "qué precio tiene la cerveza"). SÍ tienes acceso al inventario real: en el contexto de cada mensaje se te entregan los productos o la categoría que calzan con la consulta, con su stock y precio reales. Respóndele a la persona con esos datos exactos. Nunca digas que no tienes acceso al inventario o que no puedes consultarlo en tiempo real — si el contexto no trae ningún producto que calce, es que no se identificó bien el nombre: pide que lo aclare, no que asumas que no tienes esa capacidad.

3. Búsqueda y comparación de precios de productos que NO están en el inventario local del negocio. Cuando esto pase, usa la herramienta de búsqueda web para encontrar el producto en tiendas online chilenas (ej. supermercados, retail, tiendas especializadas) y entrega una comparación clara y breve: nombre del producto, 2-4 tiendas con su precio aproximado, para que la persona pueda decidir rápido mientras atiende a un cliente. Sé breve — esto se usa en medio de una atención, no es momento para respuestas largas.

4. Listados de compra por categoría (ej. "hazme un listado de lo que no queda de útiles de aseo"). Cuando el usuario pida esto, el sistema ya te entrega el listado REAL calculado desde el inventario en el contexto de este mensaje — tu trabajo es solo presentarlo de forma clara y ordenada (como una lista de compra), SIN inventar, agregar ni quitar productos del listado que te pasaron. Si el contexto te dice que no se identificó la categoría, pide que la aclare. Si te dice que no falta nada de esa categoría, dilo con confianza, no inventes una lista igual.

5. Programar conteos de inventario (solo si tienes la herramienta "programar_conteo" disponible — se te da solo a administradores). Úsala cuando te pidan agendar, programar o asignar un conteo a alguien (ej. "agéndale a Carla un conteo de bebidas para el viernes"). El contexto de este mensaje te da la lista real de personas del equipo y de categorías — usa esos nombres EXACTOS, nunca inventes uno. Si falta la persona, la categoría o la fecha, o no estás segura de a cuál se refieren, pregunta primero en vez de adivinar; no llames la herramienta con datos dudosos. Si quien te escribe no es administrador y pide esto, explícale que solo un administrador puede programar conteos.

Responde siempre en español de Chile, de forma breve y práctica (esto se usa en el mesón, con el cliente esperando). No inventes datos del sistema que no estén en esta descripción.`;

const PROGRAMAR_CONTEO_TOOL = {
  name: "programar_conteo",
  description: "Programa un conteo de inventario obligatorio para una persona del equipo, en una categoría de productos y con una fecha límite. Solo se usa cuando el usuario lo pide explícitamente y los tres datos (categoría, persona, fecha) están claros. No inventes nombres de personas ni de categorías: deben coincidir con los que aparecen como reales en el contexto del mensaje.",
  input_schema: {
    type: "object",
    properties: {
      categoria: { type: "string", description: "Nombre exacto de la categoría de productos a contar, tal como aparece en la lista de categorías reales del contexto." },
      asignado_a: { type: "string", description: "Nombre de la persona del equipo a la que se asigna el conteo, tal como aparece en la lista de usuarios reales del contexto." },
      fecha: { type: "string", description: "Fecha límite del conteo, en formato AAAA-MM-DD." },
    },
    required: ["categoria", "asignado_a", "fecha"],
  },
};

async function askMarcelita(history, localContext, canScheduleCounts) {
  const systemText = localContext
    ? `${MARCELITA_BASE_PROMPT}\n\nCONTEXTO DEL INVENTARIO LOCAL PARA ESTE MENSAJE: ${localContext}`
    : MARCELITA_BASE_PROMPT;
  // Solo se manda el tramo reciente de la conversación (no todo el historial
  // desde el principio) — las respuestas de Marcelita son cortas y prácticas,
  // así que no hace falta arrastrar mensajes viejos; esto hace cada consulta
  // más liviana y rápida, y deja más cupo compartido para el resto del equipo.
  const recentHistory = history.slice(-10);
  const tools = [{ type: "web_search_20250305", name: "web_search" }];
  // La herramienta para programar conteos solo se le da a Marcelita cuando
  // quien pregunta es administrador — igual que la pantalla de Conteos, que
  // ya restringe "Programar inventario" a ese rol.
  if (canScheduleCounts) tools.push(PROGRAMAR_CONTEO_TOOL);
  const data_ = await callClaudeAPI({
    model: "claude-sonnet-4-6",
    max_tokens: 700,
    system: systemText,
    messages: recentHistory.map(m => ({ role: m.role, content: m.content })),
    tools,
  });
  const blocks = data_.content || [];
  const text = blocks.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  const toolUse = blocks.find(b => b.type === "tool_use" && b.name === "programar_conteo");
  return { text: text || (toolUse ? "" : "No encontré una respuesta clara, ¿puedes reformular la pregunta?"), toolUse: toolUse ? toolUse.input : null };
}

/* ---------------------------------------------------------
   PEQUEÑOS COMPONENTES DE UI
--------------------------------------------------------- */
function Toast({ toast }) {
  if (!toast) return null;
  const isErr = toast.type === "error";
  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 animate-[fadeUp_.25s_ease]"
      style={{ background: isErr ? C.rust : C.greenDark, color: C.paper }}
    >
      {isErr ? <AlertTriangle size={16} /> : <Check size={16} />}
      {toast.msg}
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[1px] p-0 sm:p-4">
      <div
        className={`w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} sm:rounded-xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl`}
        style={{ background: C.paper, border: `1px solid ${C.paperLine}` }}
      >
        <div className="flex items-center justify-between px-5 py-4 sticky top-0" style={{ background: C.paper, borderBottom: `1px solid ${C.paperLine}` }}>
          <h3 className="font-semibold text-lg" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>{title}</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-black/5" style={{ color: C.gray }}>
            <X size={22} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3.5">
      <span className="block text-sm font-semibold mb-1.5" style={{ color: C.ink }}>{label}</span>
      {children}
    </label>
  );
}
const inputCls = "w-full px-3.5 py-3 rounded-lg text-base outline-none transition";
function inputStyle(focus) {
  return { background: "#fff", border: `1.5px solid ${C.paperLine}`, color: C.ink };
}

function Btn({ children, onClick, variant = "primary", full, disabled, type = "button", icon: Icon, size = "md" }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed active:scale-[.98]";
  const sizes = size === "sm" ? "px-3 py-2 text-sm" : size === "lg" ? "px-6 py-4 text-lg" : "px-5 py-3 text-base";
  const variants = {
    primary: { background: C.green, color: "#fff" },
    dark: { background: C.ink, color: C.paper },
    ghost: { background: "transparent", color: C.ink, border: `1.5px solid ${C.paperLine}` },
    // Para usar sobre fondo oscuro: el contorno normal lleva texto tinta y
    // ahí queda negro sobre negro, invisible.
    ghostClaro: { background: "transparent", color: "#e8e0d0", border: "1.5px solid rgba(255,255,255,.25)" },
    danger: { background: C.rustSoft, color: C.rust },
    rust: { background: C.rust, color: "#fff" },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${sizes} ${full ? "w-full" : ""}`} style={variants[variant]}>
      {Icon && <Icon size={size === "sm" ? 16 : size === "lg" ? 22 : 19} />}
      {children}
    </button>
  );
}

function Badge({ children, tone = "green" }) {
  const map = {
    green: { background: C.greenSoft, color: C.greenDark },
    rust: { background: C.rustSoft, color: C.rust },
    brass: { background: C.brassSoft, color: C.brassText },
    gray: { background: "#eee9db", color: C.gray },
  };
  return <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={map[tone]}>{children}</span>;
}

function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3" style={{ background: C.paperDark }}>
        <Icon size={28} style={{ color: C.gray }} />
      </div>
      <p className="font-semibold text-base" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>{title}</p>
      {hint && <p className="text-sm mt-1 max-w-xs" style={{ color: C.gray }}>{hint}</p>}
    </div>
  );
}

function Pager({ page, setPage, total, pageSize }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-3 px-1">
      <span className="text-xs" style={{ color: C.gray }}>Página {page + 1} de {pages} · {total} resultados</span>
      <div className="flex gap-1.5">
        <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="p-3 rounded-md disabled:opacity-30" style={{ background: C.paperDark, color: C.ink }}>
          <ChevronLeft size={18} />
        </button>
        <button disabled={page >= pages - 1} onClick={() => setPage(p => Math.min(pages - 1, p + 1))} className="p-3 rounded-md disabled:opacity-30" style={{ background: C.paperDark, color: C.ink }}>
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   ESCÁNER DE CÁMARA

   Usa BarcodeDetector nativo cuando existe (Android/Chrome/Edge). Donde no
   existe —todo iOS Safari, que nunca lo implementó— cae a ZXing, cargado
   bajo demanda desde un CDN público (no es una dependencia del proyecto:
   así no hay que tocar package.json ni el build para este arreglo). Si ni
   eso funciona (sin internet para el CDN, cámara denegada), queda el
   mensaje de siempre: lector USB o código a mano.
--------------------------------------------------------- */
function CameraScanner({ onDetect, onClose }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState("init"); // init | scanning | unsupported | denied
  const rafRef = useRef(null);
  const streamRef = useRef(null);
  const zxingReaderRef = useRef(null);
  const trackRef = useRef(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Flash/linterna: solo existe cuando el navegador maneja la cámara directo
  // (BarcodeDetector nativo, o sea Android/Chrome/Edge) — es la misma pista
  // de video de la que ya tenemos el track a mano. iPhone no lo ofrece: Safari
  // nunca expuso el control de flash a las páginas web, así sea con el
  // detector nativo o con ZXing, así que ahí el botón simplemente no aparece.
  async function alternarFlash() {
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((v) => !v);
    } catch (e) {
      console.warn("[escáner] no se pudo alternar el flash", e);
    }
  }

  useEffect(() => {
    let cancelled = false;

    function cargarZXing() {
      if (window.ZXing) return Promise.resolve(window.ZXing);
      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://unpkg.com/@zxing/library@latest/umd/index.min.js";
        script.async = true;
        script.onload = () => (window.ZXing ? resolve(window.ZXing) : reject(new Error("ZXing no se cargó")));
        script.onerror = () => reject(new Error("No se pudo cargar el lector de códigos"));
        document.head.appendChild(script);
      });
    }

    async function iniciarNativo() {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0] || null;
      trackRef.current = track;
      if (track && typeof track.getCapabilities === "function") {
        try {
          const caps = track.getCapabilities();
          if (caps && caps.torch) setTorchSupported(true);
        } catch (e) { /* algunos navegadores no implementan getCapabilities */ }
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("scanning");
      const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
      const loop = async () => {
        if (cancelled) return;
        try {
          if (videoRef.current && videoRef.current.readyState >= 2) {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length > 0) {
              onDetect(codes[0].rawValue);
              return;
            }
          }
        } catch (e) { /* keep trying */ }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    }

    async function iniciarZXing() {
      const ZXing = await cargarZXing();
      if (cancelled) return;
      const hints = new Map();
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
        ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
        ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E,
        ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39,
        ZXing.BarcodeFormat.QR_CODE,
      ]);
      const reader = new ZXing.BrowserMultiFormatReader(hints);
      zxingReaderRef.current = reader;
      setStatus("scanning");
      await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: "environment" } },
        videoRef.current,
        (result) => {
          if (cancelled || !result) return;
          onDetect(result.getText());
        }
      );
    }

    async function start() {
      try {
        if ("BarcodeDetector" in window) {
          await iniciarNativo();
        } else {
          try {
            await iniciarZXing();
          } catch (e) {
            if (!cancelled) setStatus("unsupported");
          }
        }
      } catch (e) {
        if (!cancelled) setStatus("denied");
      }
    }
    start();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (zxingReaderRef.current) { try { zxingReaderRef.current.reset(); } catch (e) { /* ya se cerró */ } }
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [onDetect]);

  return (
    <Modal title="Escanear con cámara" onClose={onClose}>
      <div className="rounded-lg overflow-hidden relative" style={{ background: C.ink, aspectRatio: "4/3" }}>
        {status === "scanning" && <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />}
        {status === "scanning" && (
          <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5" style={{ background: C.brass, boxShadow: `0 0 8px ${C.brass}` }} />
        )}
        {status === "scanning" && torchSupported && (
          <button
            type="button"
            onClick={alternarFlash}
            className="absolute top-3 right-3 rounded-full p-2"
            style={{ background: torchOn ? C.brass : "rgba(0,0,0,0.55)", color: torchOn ? C.ink : C.paper }}
            aria-label={torchOn ? "Apagar flash" : "Activar flash"}
            title={torchOn ? "Apagar flash" : "Activar flash (ayuda a enfocar)"}
          >
            <Flashlight size={18} />
          </button>
        )}
        {status === "init" && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2" style={{ color: C.paper }}>
            <Loader2 className="animate-spin" size={22} /> <span className="text-sm">Activando cámara…</span>
          </div>
        )}
        {status === "unsupported" && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center px-6" style={{ color: C.paper }}>
            <AlertTriangle size={22} />
            <span className="text-sm">Tu navegador no soporta el escáner por cámara aquí. Usa el lector USB o escribe el código manualmente.</span>
          </div>
        )}
        {status === "denied" && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center px-6" style={{ color: C.paper }}>
            <AlertTriangle size={22} />
            <span className="text-sm">No se pudo acceder a la cámara (permiso denegado o no disponible en este entorno). Usa el lector USB o el código manual.</span>
          </div>
        )}
      </div>
      <p className="text-xs mt-3 text-center" style={{ color: C.gray }}>Apunta al código de barras. Se agregará solo al detectarlo.</p>
    </Modal>
  );
}

/* ---------------------------------------------------------
   LOGIN
--------------------------------------------------------- */
function LoginScreen({ users, businessName, businessLogo, onLogin, toast }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [entrando, setEntrando] = useState(false);

  // La contraseña ya no se compara en el navegador: la verifica Supabase Auth,
  // que la guarda hasheada. El usuario del equipo sigue escribiendo su nombre de
  // siempre ("fran"); el correo interno se arma a partir de él.
  async function submit() {
    if (!username.trim() || !password) return toast("Ingresa tu usuario y contraseña", "error");
    if (entrando) return;
    setEntrando(true);
    try {
      const sb = obtenerCliente();
      const usuario = username.trim().toLowerCase();
      const { data, error } = await sb.auth.signInWithPassword({
        email: `${usuario}@elgalpon.local`,
        password,
      });
      if (error || !data?.user) {
        return toast("Usuario o contraseña incorrectos", "error");
      }
      await cargarCatalogos({ forzar: true });
      const sb2 = obtenerCliente();
      const { data: perfil } = await sb2
        .from("perfil").select("id,nombre,usuario,rol,activo").eq("id", data.user.id).maybeSingle();
      if (!perfil || !perfil.activo) {
        await sb.auth.signOut();
        return toast("Tu cuenta no está activa. Habla con un administrador.", "error");
      }
      fijarUsuarioActual(perfil.id);
      onLogin({ role: perfil.rol, name: perfil.nombre, username: perfil.usuario, userId: perfil.id });
    } catch (e) {
      toast(friendlyError(e, "No se pudo entrar al sistema"), "error");
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: C.paper }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-24 h-24 rounded-2xl flex items-center justify-center mb-3 shadow-sm overflow-hidden" style={{ background: businessLogo ? "#fff" : C.ink, border: businessLogo ? `1.5px solid ${C.paperLine}` : "none" }}>
            {businessLogo ? <img src={businessLogo} alt={businessName} className="w-full h-full object-contain p-1.5" /> : <Store size={30} style={{ color: C.brass }} />}
          </div>
          <h1 className="text-2xl font-semibold text-center" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>{businessName}</h1>
          <p className="text-sm mt-1" style={{ color: C.gray }}>Sistema de ventas e inventario</p>
        </div>

        <div className="rounded-xl p-5 shadow-sm" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <Field label="Usuario">
            <input autoFocus value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} className={inputCls} style={inputStyle()} placeholder="Ej. fran" />
          </Field>
          <Field label="Contraseña">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} className={inputCls} style={inputStyle()} placeholder="••••" />
          </Field>
          <Btn full onClick={submit} icon={Check} disabled={entrando}>{entrando ? "Entrando…" : "Entrar"}</Btn>
        </div>
        <p className="text-center text-[11px] mt-6" style={{ color: C.grayLight }}>¿No tienes cuenta? Pídele a un administrador que te cree un usuario desde "Usuarios".</p>
      </div>
    </div>
  );
}

/* La caja compartida vive todo el día en modo "Vender" — identificando cada
   venta por PIN, sin usuario y contraseña. Cuando alguien necesita revisar
   Administración de verdad, este modal cambia la sesión real de Supabase Auth
   a la cuenta de un administrador (el mismo mecanismo que LoginScreen, no un
   simple interruptor de pantalla): las políticas de la base exigen que quien
   escribe en tablas como cliente, producto o perfil sea admin de verdad —
   ninguna bandera solo-de-pantalla alcanzaría para que esas escrituras
   pasaran. El costo de este cambio de sesión es mínimo: desde la migración
   0010 cualquier miembro del equipo puede vender, y desde la 0013 cada venta
   se adjudica por PIN — a quién pertenezca la sesión de fondo ya no afecta a
   quién quedó registrado como vendedor de cada boleta. */
function AdminGateModal({ onClose, onEnter, toast }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [entrando, setEntrando] = useState(false);

  async function submit() {
    if (!username.trim() || !password) return toast("Ingresa tu usuario y contraseña de administrador", "error");
    if (entrando) return;
    setEntrando(true);
    try {
      const sb = obtenerCliente();
      const usuario = username.trim().toLowerCase();
      const { data, error } = await sb.auth.signInWithPassword({
        email: `${usuario}@elgalpon.local`,
        password,
      });
      if (error || !data?.user) {
        // La contraseña no calzó: signInWithPassword no llega a tocar la
        // sesión que ya había, así que quien estaba vendiendo sigue
        // identificado igual que antes de intentar entrar aquí.
        return toast("Usuario o contraseña incorrectos", "error");
      }
      await cargarCatalogos({ forzar: true });
      const { data: perfil } = await sb
        .from("perfil").select("id,nombre,usuario,rol,activo").eq("id", data.user.id).maybeSingle();

      if (!perfil?.activo || perfil.rol !== "admin") {
        // Esta cuenta sí existe y la contraseña era correcta, pero no es de
        // administrador (o está dada de baja) — y el inicio de sesión ya
        // reemplazó la sesión de la caja por esta. No hay forma de volver a
        // la de quien vendía sin su contraseña, así que se cierra del todo:
        // la próxima persona entra de nuevo, normal, desde la pantalla de
        // ingreso.
        await sb.auth.signOut();
        olvidarInstantaneas();
        toast(
          perfil?.activo
            ? "Esa cuenta no es de administrador. La sesión se cerró — vuelve a entrar."
            : "Esa cuenta no está activa. La sesión se cerró — vuelve a entrar.",
          "error"
        );
        onEnter(null);
        return;
      }

      fijarUsuarioActual(perfil.id);
      onEnter({ role: perfil.rol, name: perfil.nombre, username: perfil.usuario, userId: perfil.id });
    } catch (e) {
      toast(friendlyError(e, "No se pudo entrar al panel de administración"), "error");
    } finally {
      setEntrando(false);
    }
  }

  return (
    <Modal title="Panel de administración" onClose={onClose}>
      <p className="text-xs mb-3" style={{ color: C.gray }}>
        Entra con tu usuario y contraseña de administrador. La caja sigue funcionando igual — al terminar, usa "Volver a vender" para salir del panel sin cerrar nada.
      </p>
      <Field label="Usuario de administrador">
        <input autoFocus value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} className={inputCls} style={inputStyle()} placeholder="Ej. fran" />
      </Field>
      <Field label="Contraseña">
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} className={inputCls} style={inputStyle()} placeholder="••••" />
      </Field>
      <Btn full onClick={submit} icon={Lock} disabled={entrando}>{entrando ? "Entrando…" : "Entrar al panel"}</Btn>
    </Modal>
  );
}

/* ---------------------------------------------------------
   POS — VENDER
--------------------------------------------------------- */
function WeightPromptModal({ product, onClose, onConfirm }) {
  const [unit, setUnit] = useState("kg");
  const [value, setValue] = useState("");
  const weightKg = unit === "kg" ? Number(value) || 0 : (Number(value) || 0) / 1000;
  const subtotal = weightKg * product.price;

  function submit() {
    if (weightKg <= 0) return;
    onConfirm(Number(weightKg.toFixed(3)));
  }

  return (
    <Modal title={`Pesar — ${product.name}`} onClose={onClose}>
      <div className="rounded-lg p-3 mb-3 flex justify-between text-sm" style={{ background: C.paperDark }}>
        <span style={{ color: C.gray }}>Precio por kilogramo</span>
        <span className="font-mono font-semibold" style={{ color: C.ink }}>{formatCLP(product.price)}</span>
      </div>
      <div className="flex gap-1.5 mb-3">
        <button onClick={() => setUnit("kg")} className="flex-1 py-2 rounded-lg text-sm font-medium" style={unit === "kg" ? { background: C.brass, color: C.ink } : { background: C.paperDark, color: C.gray }}>Kilogramos</button>
        <button onClick={() => setUnit("g")} className="flex-1 py-2 rounded-lg text-sm font-medium" style={unit === "g" ? { background: C.brass, color: C.ink } : { background: C.paperDark, color: C.gray }}>Gramos</button>
      </div>
      <Field label={unit === "kg" ? "Peso (kg)" : "Peso (g)"}>
        <input autoFocus type="number" step={unit === "kg" ? "0.001" : "1"} value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} className={`${inputCls} font-mono`} style={inputStyle()} placeholder="0" />
      </Field>
      {weightKg > 0 && (
        <div className="rounded-lg p-3 mb-4 flex justify-between text-sm font-semibold" style={{ background: C.greenSoft }}>
          <span style={{ color: C.greenDark }}>Subtotal ({weightKg} kg)</span>
          <span className="font-mono" style={{ color: C.greenDark }}>{formatCLP(subtotal)}</span>
        </div>
      )}
      <Btn full icon={Check} disabled={weightKg <= 0} onClick={submit}>Agregar al carrito</Btn>
    </Modal>
  );
}

function QuickCatalogPanel({ products, onAdd }) {
  const [activeCategory, setActiveCategory] = useState("Todos");
  // Muestra los productos marcados explícitamente como "acceso rápido"; también
  // incluye, por compatibilidad, los productos antiguos sin código de barras
  // real (creados antes de que existiera esta casilla, con código interno INT-).
  const uncoded = useMemo(() => products.filter(p => p.quickAccess === true || (p.barcode && p.barcode.startsWith("INT-"))), [products]);
  const categories = useMemo(() => {
    const presentes = Array.from(new Set(uncoded.map(p => p.category).filter(Boolean)));
    // Orden del mesón: primero lo que más se vende y más se toca en el día.
    // El resto queda detrás, en orden alfabético, para que no baile de un día
    // para otro según qué producto se creó primero.
    const puesto = (nombre) => {
      const n = normalize(nombre);
      const i = ["pan", "fruta", "verdura", "cecina"].findIndex(k => n.includes(k));
      return i === -1 ? 99 : i;
    };
    presentes.sort((a, b) => puesto(a) - puesto(b) || String(a).localeCompare(String(b), "es"));
    return ["Todos", ...presentes];
  }, [uncoded]);
  const filtered = useMemo(
    () => activeCategory === "Todos" ? uncoded : uncoded.filter(p => p.category === activeCategory),
    [uncoded, activeCategory]
  );

  return (
    <section className="rounded-xl overflow-hidden flex flex-col" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
      <header className="px-4 py-3 flex items-center gap-2 flex-shrink-0" style={{ borderBottom: `1.5px solid ${C.paperLine}` }}>
        <Tags size={17} style={{ color: C.green }} />
        <h2 className="text-base font-semibold" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Catálogo rápido</h2>
        <span className="ml-auto text-xs" style={{ color: C.gray }}>
          {uncoded.length > 0 && `${filtered.length} producto${filtered.length === 1 ? "" : "s"}`}
        </span>
      </header>
      {uncoded.length === 0 ? (
        <p className="text-sm p-6 text-center" style={{ color: C.gray }}>Aún no hay productos de acceso rápido. Créalos desde Inventario con el botón "Nuevo sin código (acceso rápido)" — aparecerán aquí como botones grandes, agrupados por categoría (Verduras, Frutas, Útiles de aseo, Cecinas y quesos, etc.).</p>
      ) : (
        <>
          {/* Las categorías van arriba, en una fila propia: es el filtro del
              tablero, no un elemento más entre los productos. */}
          <div className="flex gap-2 overflow-x-auto px-4 py-3 flex-shrink-0" style={{ background: C.paperDark, borderBottom: `1px solid ${C.paperLine}` }}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className="px-4 rounded-lg text-sm font-semibold whitespace-nowrap flex-shrink-0 transition"
                style={activeCategory === cat
                  ? { background: C.green, color: "#fff" }
                  : { background: "#fff", color: C.inkSoft, border: `1.5px solid ${C.paperLine}` }}
              >{cat}</button>
            ))}
          </div>
          {/* Botonera de productos. Las fichas son grandes a propósito: se usan
              con el dedo o de un vistazo, mientras el cliente espera. */}
          <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5 p-4 overflow-y-auto md:max-h-[calc(100vh-21rem)]">
            {filtered.map(p => {
              const outOfStock = p.stock <= 0;
              return (
              <button
                key={p.id} onClick={() => onAdd(p)} disabled={outOfStock}
                className="rounded-xl p-3 text-left flex flex-col justify-between gap-2 min-h-[92px] disabled:cursor-not-allowed active:scale-[.97] transition hover:shadow-md"
                style={{ background: outOfStock ? C.rustSoft : "#fff", border: `1.5px solid ${outOfStock ? C.rust : C.paperLine}`, opacity: outOfStock ? 0.7 : 1 }}
              >
                <span className="text-sm font-semibold leading-snug line-clamp-2" style={{ color: C.ink }}>{p.name}</span>
                <span className="flex items-end justify-between gap-1">
                  {outOfStock ? (
                    <span className="text-xs font-bold" style={{ color: C.rust }}>Sin stock</span>
                  ) : (
                    <span className="text-base font-mono font-bold leading-none" style={{ color: C.greenDark }}>
                      {formatCLP(p.price)}<span className="text-xs font-medium" style={{ color: C.gray }}>{p.unitType === "peso" ? "/kg" : ""}</span>
                    </span>
                  )}
                  {p.unitType === "peso" && <Scale size={14} style={{ color: C.gray }} />}
                </span>
              </button>
              );
            })}
            {filtered.length === 0 && <p className="col-span-full text-sm text-center py-8" style={{ color: C.gray }}>Sin productos en esta categoría.</p>}
          </div>
        </>
      )}
    </section>
  );
}

/* La caja es una sola y la comparte todo el equipo, así que el login no basta
   para saber quién hizo cada venta. Antes de cobrar se pide elegir el nombre
   e ingresar el PIN DE VENDEDOR de esa persona (se configura en Usuarios,
   por persona) — ojo, es distinto del PIN de administrador de Ajustes, que
   es uno solo y sirve para otra cosa (autorizar mermas, precios, etc). Recién
   con el PIN de vendedor confirmado se registra la venta a su nombre. */
function IdentifySellerModal({ onClose, onConfirm }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  // A propósito no recibe la lista de usuarios ni pide elegir un nombre:
  // toda la gracia de la caja compartida es escribir SOLO el PIN. Quién es
  // lo decide el servidor (galpon.identificar_por_pin, migración 0013),
  // comparando contra los hashes — nunca se compara en el navegador.
  async function submit() {
    if (checking) return;
    const limpio = pin.trim();
    if (limpio.length < 4) return setError("Ingresa tu PIN de vendedor");
    setChecking(true);
    setError("");
    try {
      const persona = await identificarPorPin(limpio);
      if (!persona) {
        setError("PIN incorrecto. Si es tu primer día, pide a un administrador que te asigne uno en Usuarios.");
        setPin("");
        return;
      }
      onConfirm(persona);
    } finally {
      setChecking(false);
    }
  }

  return (
    <Modal title="¿Quién realiza esta venta?" onClose={onClose}>
      <Field label="Tu PIN de vendedor">
        <input
          autoFocus type="password" inputMode="numeric" maxLength={6}
          value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, "")); setError(""); }}
          onKeyDown={e => e.key === "Enter" && submit()}
          className={`${inputCls} font-mono text-center text-lg tracking-widest`} style={inputStyle()} placeholder="••••"
        />
      </Field>
      {error && <p className="text-xs mb-3" style={{ color: C.rust }}>{error}</p>}
      <Btn full icon={Check} onClick={submit} disabled={checking}>{checking ? "Comprobando…" : "Confirmar e identificar"}</Btn>
    </Modal>
  );
}

function POSView({ products, setProducts, settings, setSettings, sales, setSales, movements, setMovements, suppliers, setSuppliers, categories, purchaseItems, session, toast, role, customers, setCustomers, customerLedger, setCustomerLedger, openShifts, setTab }) {
  const [barcode, setBarcode] = useState("");
  const [cart, setCart] = useState([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [notFound, setNotFound] = useState(null);
  const [nameQuery, setNameQuery] = useState("");
  const [payment, setPayment] = useState("Efectivo");
  const [cashReceived, setCashReceived] = useState("");
  const [boletaEmitida, setBoletaEmitida] = useState(true);
  const [receipt, setReceipt] = useState(null);
  const [quickAdd, setQuickAdd] = useState(null);
  const [ventaNueva, setVentaNueva] = useState(null);
  const [consumptionOpen, setConsumptionOpen] = useState(false);
  const [consumptionTicket, setConsumptionTicket] = useState(null);
  const inputRef = useRef(null);

  // La caja es común para todo el equipo, así que antes de cobrar cada venta
  // se pide identificar quién la está haciendo, escribiendo solo su PIN de
  // vendedor (migración 0013) — sin eso no se sabría a quién adjudicarle la
  // venta para el desglose del cierre de caja. No hace falta recordar a la
  // última persona: cada quien escribe su propio PIN en cada venta.
  const [identifyOpen, setIdentifyOpen] = useState(false);

  // Fiado: solo se pide un cliente cuando la forma de pago es "Fiado" — el
  // resto de las ventas sigue exactamente igual que siempre.
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const nameMatches = useMemo(() => {
    if (nameQuery.trim().length < 2) return [];
    const q = normalize(nameQuery);
    return products.filter(p => normalize(p.name).includes(q) || normalize(p.barcode).includes(q)).slice(0, 8);
  }, [nameQuery, products]);

  const customerMatches = useMemo(() => {
    if (customerQuery.trim().length < 1) return [];
    const q = normalize(customerQuery);
    return customers.filter(c => normalize(c.name).includes(q) || normalize(c.phone).includes(q)).slice(0, 6);
  }, [customerQuery, customers]);

  function customerBalance(customerId) {
    return customerLedger.reduce((s, m) => {
      if (m.customerId !== customerId) return s;
      return s + (m.type === "cargo" ? m.amount : -m.amount);
    }, 0);
  }

  const [weightPromptProduct, setWeightPromptProduct] = useState(null);

  function addToCart(product, weightKg) {
    if (product.unitType === "peso" && weightKg === undefined) {
      setWeightPromptProduct(product);
      return;
    }
    setNotFound(null);
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (product.unitType === "peso") {
        const addQty = Number(weightKg) || 0;
        if (addQty <= 0) return prev;
        const already = existing ? existing.qty : 0;
        if (already + addQty > product.stock) { toast(`Sin stock suficiente de "${product.name}"`, "error"); return prev; }
        if (existing) return prev.map(i => i.productId === product.id ? { ...i, qty: Number((i.qty + addQty).toFixed(3)) } : i);
        return [...prev, { productId: product.id, barcode: product.barcode, name: product.name, price: product.price, cost: product.cost, qty: addQty, stock: product.stock, unitType: "peso" }];
      }
      if (existing) {
        if (existing.qty >= product.stock) { toast(`Sin más stock de "${product.name}"`, "error"); return prev; }
        return prev.map(i => i.productId === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      if (product.stock <= 0) { toast(`"${product.name}" no tiene stock`, "error"); return prev; }
      // Si a este producto le queda stock de antes de su última baja de precio,
      // TODA la línea se cobra al precio viejo (nunca se mezclan dos precios
      // distintos del mismo producto en una boleta, para no confundir al
      // cliente) — ver unitsStillAtOldPrice más abajo en el archivo. Si la
      // cantidad que se termine llevando supera lo que en rigor correspondía
      // al precio viejo, ese excedente queda registrado en checkout() como
      // ganancia extra, no como error ni como pérdida.
      const oldPriceInfo = unitsStillAtOldPrice(product, purchaseItems, settings.breadCategory);
      return [...prev, {
        productId: product.id, barcode: product.barcode, name: product.name,
        price: oldPriceInfo ? oldPriceInfo.oldPrice : product.price,
        cost: product.cost, qty: 1, stock: product.stock, unitType: "unidad",
        isOldPriceLine: !!oldPriceInfo,
        maxOldPriceQty: oldPriceInfo?.qty ?? 0,
        newPrice: oldPriceInfo?.newPrice ?? product.price,
      }];
    });
  }

  function confirmWeight(weightKg) {
    if (weightPromptProduct) addToCart(weightPromptProduct, weightKg);
    setWeightPromptProduct(null);
  }

  /* Cantidad escrita a mano en el carrito. Para llevar doce panes es más
     rápido escribir 12 que apretar doce veces el "+".

     Se deja el campo vacío mientras se escribe —si no, borrar para corregir
     dejaría un 0 y la línea desaparecería a mitad de camino— y recién al
     salir del campo, o al apretar Enter, se decide: 0 o vacío quita la línea. */
  function setUnitQty(productId, texto) {
    setCart(prev => prev.map(i => {
      if (i.productId !== productId) return i;
      if (texto === "") return { ...i, qtyTexto: "" };
      const q = Math.max(0, Math.floor(Number(texto) || 0));
      if (q > i.stock) {
        toast(`Solo quedan ${i.stock} de "${i.name}"`, "error");
        return { ...i, qty: i.stock, qtyTexto: undefined };
      }
      return { ...i, qty: q, qtyTexto: undefined };
    }));
  }

  function confirmarUnitQty(productId) {
    setCart(prev => prev
      .map(i => (i.productId === productId ? { ...i, qtyTexto: undefined } : i))
      .filter(i => i.qty > 0));
  }

  function setWeightQty(productId, newQty) {
    setCart(prev => prev.map(i => {
      if (i.productId !== productId) return i;
      const q = Math.max(0, Number(newQty) || 0);
      if (q > i.stock) { toast("No hay más stock disponible", "error"); return i; }
      return { ...i, qty: q };
    }));
  }

  function handleScan(code) {
    const clean = code.trim();
    if (!clean) return;
    const found = products.find(p => p.barcode === clean);
    if (found) addToCart(found);
    else setNotFound(clean);
    setBarcode("");
    setScannerOpen(false);
    inputRef.current?.focus();
  }

  function changeQty(productId, delta) {
    setCart(prev => prev.map(i => {
      if (i.productId !== productId) return i;
      const q = i.qty + delta;
      if (q > i.stock) { toast("No hay más stock disponible", "error"); return i; }
      return { ...i, qty: q };
    }).filter(i => i.qty > 0));
  }
  function removeItem(productId) { setCart(prev => prev.filter(i => i.productId !== productId)); }

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  // Débito y crédito emiten boleta siempre —el vuelto de pago con tarjeta la
  // imprime la misma máquina—; en efectivo o transferencia queda a criterio
  // de quien cobra, así que ahí sí se pregunta.
  const boletaAutomatica = payment === "Débito" || payment === "Crédito";
  const boletaEmitidaFinal = boletaAutomatica ? true : boletaEmitida;

  async function checkout(seller) {
    if (cart.length === 0) return;
    if (!seller?.id) return;
    if (payment === "Fiado" && !selectedCustomer) return;
    // Se relee todo desde el almacenamiento justo antes de confirmar (en vez de
    // confiar en el estado local, que puede tener hasta unos segundos de rezago
    // por la sincronización entre dispositivos). Esto reduce al mínimo la ventana
    // en la que dos cajas distintas podrían generar el mismo número de boleta.
    const [latestSettings, latestSales, latestMovements, latestProducts] = await Promise.all([
      loadJSON("business-settings", settings),
      loadJSON("sales-log", sales),
      loadJSON("movements-log", movements),
      loadJSON("products-catalog", products),
    ]);

    const invoiceNumber = latestSettings.invoiceCounter;
    const usedNumbers = new Set(latestSales.map(s => s.invoiceNumber));
    let finalInvoiceNumber = invoiceNumber;
    while (usedNumbers.has(finalInvoiceNumber)) finalInvoiceNumber++;

    const sale = {
      id: uid("sale"),
      invoiceNumber: finalInvoiceNumber,
      date: new Date().toISOString(),
      seller: seller.name,
      // El id real del perfil que se identificó con su PIN — lo que
      // finalmente decide a quién se le adjudica la venta en la base
      // (galpon.venta.vendedor_id), sin depender de buscar por nombre.
      sellerId: seller.id,
      customer: payment === "Fiado" ? selectedCustomer.name : null,
      customerId: payment === "Fiado" ? selectedCustomer.id : null,
      items: cart.map(i => {
        const base = { productId: i.productId, name: i.name, barcode: i.barcode, qty: i.qty, price: i.price, cost: i.cost, unitType: i.unitType };
        if (!i.isOldPriceLine) return base;
        // Se cobró TODO al precio anterior para no mezclar dos precios en la
        // misma boleta. Si la cantidad superó lo que en rigor quedaba a ese
        // precio, el excedente no es un error ni una pérdida: es ganancia
        // extra sobre lo esperado, y queda registrada así para quien revise
        // Análisis después — ver buildOldPriceSalesLog más abajo.
        const extraQty = Math.max(0, i.qty - (i.maxOldPriceQty || 0));
        const extraProfit = extraQty * (i.price - i.newPrice);
        return { ...base, oldPriceApplied: true, oldPrice: i.price, newPrice: i.newPrice, extraQty, extraProfit };
      }),
      total,
      paymentMethod: payment,
      boletaEmitida: boletaEmitidaFinal,
    };
    const newProducts = latestProducts.map(p => {
      const item = cart.find(i => i.productId === p.id);
      if (!item) return p;
      const nextStock = Math.max(0, p.stock - item.qty);
      return { ...p, stock: nextStock, stockZeroSince: nextStockZeroSince(p.stock, p.stockZeroSince, nextStock) };
    });
    const newSales = [sale, ...latestSales];

    setProducts(newProducts); setSales(newSales);

    // El descuento de stock y la boleta se guardan primero. El número
    // definitivo lo asigna una secuencia de Postgres —no un contador que cada
    // caja lleva por su cuenta—, así que recién después se arma el asiento de
    // caja, ya con el número real.
    await saveJSON("products-catalog", newProducts, { origen: "venta" });
    await saveJSON("sales-log", newSales);

    const numeroReal = sale.invoiceNumber;
    // Una venta fiada todavía no es plata en caja: no genera el ingreso de
    // "Venta" de inmediato. Queda como deuda en el libro de fiado (más abajo)
    // y el ingreso real se registra recién cuando el cliente la abone — ver
    // registerPayment en ClientesView. El resto de las formas de pago sigue
    // exactamente igual que siempre.
    if (payment !== "Fiado") {
      const asiento = { id: uid("mov"), date: sale.date, type: "ingreso", concept: `Venta #${numeroReal}`, amount: total, category: "Venta", auto: true, relatedInvoice: numeroReal, saleId: sale.id };
      const movimientosFinales = [asiento, ...latestMovements];
      setMovements(movimientosFinales);
      await saveJSON("movements-log", movimientosFinales);
    } else {
      const latestLedger = await loadJSON("customer-ledger", customerLedger);
      const cargo = {
        id: uid("cliemov"), customerId: selectedCustomer.id, type: "cargo",
        amount: total, date: sale.date, saleId: sale.id, paymentMethod: null, note: "",
      };
      const newLedger = [cargo, ...latestLedger];
      setCustomerLedger(newLedger);
      await saveJSON("customer-ledger", newLedger);
    }

    setReceipt(sale);
    setCart([]); setPayment("Efectivo"); setCashReceived(""); setBoletaEmitida(true);
    setSelectedCustomer(null); setCustomerQuery("");
    toast(`Venta #${numeroReal} registrada`, "success");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  /* Alta en el mesón: el producto no está en el catálogo y el cliente está
     esperando. Se crea con el código escaneado, el nombre y el precio que
     cobran, y con el stock justo de lo que se está vendiendo —así el kárdex
     queda cuadrado: entra lo que se dio de alta y sale con la boleta—.

     El precio queda pendiente de aprobación cuando no lo crea un
     administrador, que es el mismo camino que ya usa el Inventario General:
     el producto aparece marcado como "nuevo" hasta que alguien le ponga
     costo, categoría y proveedor. */
  async function crearYVender({ name, price, qty }) {
    const nombre = String(name || "").trim();
    if (!nombre) return toast("Escribe el nombre del producto", "error");
    const precio = Number(price) || 0;
    if (precio <= 0) return toast("Escribe el precio de venta", "error");
    const cantidad = Math.max(1, Number(qty) || 1);
    const codigo = String(ventaNueva?.barcode || "").trim();

    try {
      // Se relee el catálogo antes de escribir: otra caja pudo haber creado
      // este mismo producto hace un segundo.
      const ultimos = await loadJSON("products-catalog", products);
      const yaExiste = codigo && ultimos.find((p) => p.barcode === codigo);
      if (yaExiste) {
        setProducts(ultimos);
        setVentaNueva(null);
        addToCart(yaExiste);
        toast(`"${yaExiste.name}" ya estaba en el catálogo — se agregó al carrito`, "success");
        return;
      }

      const fecha = new Date().toISOString();
      const nuevo = {
        id: uid("prod"),
        barcode: codigo || `INT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: upperField(nombre),
        category: "",
        price: precio,
        cost: 0,
        stock: cantidad,
        minStock: 5,
        supplierId: null,
        unitType: "unidad",
        unitsPerKg: null,
        quickAccess: false,
        priceApproval: role === "admin" ? null : {
          suggestedPrice: precio, netCost: 0, requestedBy: session.name,
          date: fecha, isNewProduct: true,
        },
        priceHistory: [],
      };

      await saveJSON("products-catalog", [...ultimos, nuevo], { origen: "carga_inicial" });

      // El guardado salta en silencio un producto cuyo código ya tiene otro
      // —aunque esté desactivado—, así que se confirma antes de venderlo.
      const verificado = await loadJSON("products-catalog", [...ultimos, nuevo]);
      const creado = verificado.find((p) => p.id === nuevo.id);
      setProducts(verificado);
      if (!creado) {
        toast("Ese código ya lo tiene otro producto (puede estar desactivado). Búscalo por nombre.", "error");
        return;
      }

      setVentaNueva(null);
      for (let i = 0; i < cantidad; i++) addToCart(creado);
      toast(`"${creado.name}" creado y agregado${role === "admin" ? "" : " — precio pendiente de aprobación"}`, "success");
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e) {
      toast(friendlyError(e, "No se pudo crear el producto"), "error");
    }
  }

  async function registerConsumption({ responsible, reason }) {
    if (cart.length === 0) return;
    const costTotal = cart.reduce((s, i) => s + (i.cost || 0) * i.qty, 0);
    const date = new Date().toISOString();
    const ticket = {
      id: uid("cons"),
      date,
      responsible,
      reason,
      authorizedBy: session.name,
      items: cart.map(i => ({ productId: i.productId, name: i.name, barcode: i.barcode, qty: i.qty, cost: i.cost, price: i.price, unitType: i.unitType })),
      costTotal,
    };
    const latestProducts = await loadJSON("products-catalog", products);
    const newProducts = latestProducts.map(p => {
      const item = cart.find(i => i.productId === p.id);
      if (!item) return p;
      const nextStock = Math.max(0, p.stock - item.qty);
      return { ...p, stock: nextStock, stockZeroSince: nextStockZeroSince(p.stock, p.stockZeroSince, nextStock) };
    });
    const latestMovements = await loadJSON("movements-log", movements);
    const newMovements = [{
      id: uid("mov"), date, type: "egreso",
      concept: `Consumo interno${responsible ? `: ${responsible}` : ""}`,
      amount: costTotal, category: "Consumo interno", auto: true,
    }, ...latestMovements];

    setProducts(newProducts); setMovements(newMovements);
    await saveJSON("products-catalog", newProducts, { origen: "consumo_interno" });
    await saveJSON("movements-log", newMovements);

    setConsumptionTicket(ticket);
    setCart([]); setPayment("Efectivo"); setCashReceived(""); setBoletaEmitida(true); setConsumptionOpen(false);
    toast("Consumo interno registrado, stock actualizado", "success");
  }

  // Sin caja abierta no se puede empezar a vender: una venta que ocurriera
  // antes de la apertura quedaría fuera de shiftSalesList (CajaView filtra
  // por fecha desde openedAt) y el efectivo esperado del cierre no
  // cuadraría contra lo que de verdad hay en el cajón. Se bloquea toda la
  // pestaña Vender —no solo el botón de cobrar— para que quede claro que
  // el primer paso del turno es abrir la caja, no armar un carrito.
  if (openShifts.length === 0) {
    return (
      <div className="max-w-md mx-auto">
        <div className="rounded-xl p-5" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: C.rustSoft }}><Lock size={18} style={{ color: C.rust }} /></div>
            <div>
              <h3 className="font-semibold text-sm" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Primero hay que abrir la caja</h3>
              <p className="text-xs" style={{ color: C.gray }}>Todavía no se abrió el turno — sin eso no se puede cuadrar el efectivo al cerrar. Ingresa la dotación inicial en Caja para empezar a vender.</p>
            </div>
          </div>
          <Btn full icon={Unlock} onClick={() => setTab("caja")}>Ir a Caja</Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barra de captura. Es lo primero que toca el operador en cada venta —el
          lector de código escribe acá— así que ocupa el ancho completo y queda
          separada del resto: una sola fila, sin nada más compitiendo. */}
      <div className="rounded-xl p-3 sm:p-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto]">
          <div className="relative">
            <ScanLine size={18} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.green }} />
            <input
              ref={inputRef} value={barcode}
              onChange={e => {
                const val = e.target.value;
                setBarcode(val);
                // El lector de código de barras "escribe" el código completo y de
                // inmediato en este campo. En vez de esperar a que además mande un
                // Enter (que algunos lectores ni siquiera envían), apenas lo tipeado
                // calza exacto con el código de un producto lo mandamos al carrito
                // solo. Si no calza con nada, se sigue esperando el Enter —así no
                // se dispara a mitad de tipeo cuando alguien escribe el código a mano.
                const clean = val.trim();
                if (clean && products.some(p => p.barcode === clean)) handleScan(val);
              }}
              onKeyDown={e => { if (e.key === "Enter") handleScan(barcode); }}
              placeholder="Escanea o escribe el código de barras…"
              aria-label="Código de barras"
              className={`${inputCls} pl-10 font-mono`} style={inputStyle()}
            />
          </div>
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.gray }} />
            <input
              value={nameQuery} onChange={e => setNameQuery(e.target.value)}
              placeholder="…o busca por nombre"
              aria-label="Buscar producto por nombre"
              className={`${inputCls} pl-10`} style={inputStyle()}
            />
            {nameMatches.length > 0 && (
              <div className="absolute z-30 left-0 right-0 top-full mt-1.5 rounded-lg overflow-hidden shadow-xl" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
                {nameMatches.map(p => (
                  <button key={p.id} onClick={() => { addToCart(p); setNameQuery(""); }} className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-black/[.04] text-left" style={{ borderBottom: `1px solid ${C.paperLine}` }}>
                    <span className="truncate" style={{ color: C.ink }}>{p.name}</span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-mono" style={{ color: C.gray }}>stock {p.stock}{p.unitType === "peso" ? " kg" : ""}</span>
                      <span className="font-semibold font-mono" style={{ color: C.greenDark }}>{formatCLP(p.price)}{p.unitType === "peso" ? "/kg" : ""}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Btn variant="dark" icon={Camera} onClick={() => setScannerOpen(true)}>Cámara</Btn>
        </div>
        {notFound && (
          <div className="mt-3 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2" style={{ background: C.rustSoft }}>
            <span className="text-sm" style={{ color: C.rust }}>Código <span className="font-mono">{notFound}</span> no encontrado.</span>
            <div className="flex gap-2">
              {/* El mesón no puede quedarse detenido porque un producto no está
                  en el catálogo: se crea con lo mínimo —nombre y precio— y se
                  vende. Un administrador completa costo, categoría y proveedor
                  después, avisado por la aprobación de precio que queda
                  pendiente. */}
              <Btn size="sm" variant="rust" onClick={() => { setVentaNueva({ barcode: notFound }); setNotFound(null); }}>Vender ahora</Btn>
              {role === "admin" && (
                <Btn size="sm" variant="ghost" onClick={() => { setQuickAdd({ barcode: notFound }); setNotFound(null); }}>Ficha completa</Btn>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Dos zonas de trabajo y nada más: a la izquierda de dónde saco los
          productos, a la derecha la boleta que se está armando con su cobro.
          En el teléfono la boleta va primero, porque es lo que hay que ver
          mientras se carga la venta. */}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_340px] lg:grid-cols-[minmax(0,1fr)_400px] items-start">
        <div className="order-2 md:order-1 min-w-0">
          <QuickCatalogPanel products={products} onAdd={addToCart} />
        </div>

        <section className="order-1 md:order-2 lg:sticky lg:top-4 min-w-0 rounded-xl overflow-hidden" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <header className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: `1.5px solid ${C.paperLine}` }}>
            <ShoppingCart size={17} style={{ color: C.green }} />
            <h2 className="text-base font-semibold" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Venta en curso</h2>
            {/* Parpadeo simple para que se note, de un vistazo, que la caja está
                sincronizándose en vivo con las demás (el ciclo de 15s de más
                abajo en el archivo) — no es un estado de conexión verificado en
                tiempo real, solo la señal visual de que esto no es estático. */}
            <span className="flex items-center gap-1" title="Se sincroniza en vivo con las demás cajas">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: C.rust }} />
              <span className="text-[10px] font-bold tracking-wide" style={{ color: C.rust }}>EN VIVO</span>
            </span>
            {cart.length > 0 && (
              <>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: C.greenSoft, color: C.greenDark }}>{cart.length}</span>
                <button onClick={() => setCart([])} className="ml-auto px-2 text-sm font-semibold" style={{ color: C.rust }}>Vaciar</button>
              </>
            )}
          </header>

          <div className="divide-y overflow-y-auto md:max-h-[46vh]" style={{ borderColor: C.paperLine }}>
            {cart.length === 0 ? (
              <div className="flex flex-col items-center text-center px-6 py-10">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: C.paperDark }}>
                  <ShoppingCart size={26} style={{ color: C.gray }} />
                </div>
                <p className="font-semibold text-sm" style={{ color: C.ink }}>Todavía no hay productos</p>
                <p className="text-xs mt-1" style={{ color: C.gray }}>Escanea un código o toca un producto del catálogo rápido.</p>
              </div>
            ) : cart.map(i => (
              <div key={i.productId} className="px-3 py-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold leading-snug" style={{ color: C.ink }}>{i.name}</div>
                    {i.isOldPriceLine ? (
                      <div className="text-xs font-mono mt-0.5" style={{ color: "#8a6a1f" }}>
                        {formatCLP(i.price)} c/u (precio anterior, se mantiene hasta agotar ese stock)
                      </div>
                    ) : (
                      <div className="text-xs font-mono mt-0.5" style={{ color: C.gray }}>{formatCLP(i.price)} {i.unitType === "peso" ? "/kg" : "c/u"}</div>
                    )}
                  </div>
                  <button onClick={() => removeItem(i.productId)} aria-label={`Quitar ${i.name}`} className="flex items-center justify-center min-w-[44px] rounded-lg" style={{ color: C.rust }}><Trash2 size={18} /></button>
                </div>
                <div className="flex items-center justify-between gap-2 mt-2">
                  {i.unitType === "peso" ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number" step="0.001" value={i.qty}
                        onChange={e => setWeightQty(i.productId, e.target.value)}
                        aria-label={`Peso de ${i.name} en kilogramos`}
                        className="w-24 text-center font-mono rounded-lg px-2 py-2"
                        style={{ background: C.paperDark, border: `1.5px solid ${C.paperLine}`, color: C.ink }}
                      />
                      <span className="text-sm" style={{ color: C.gray }}>kg</span>
                    </div>
                  ) : (
                    <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1.5px solid ${C.paperLine}` }}>
                      <button onClick={() => changeQty(i.productId, -1)} aria-label="Quitar una unidad" className="w-11 flex items-center justify-center" style={{ background: C.paperDark, color: C.ink }}><Minus size={17} /></button>
                      <input
                        type="number" inputMode="numeric" min="0" step="1"
                        value={i.qtyTexto !== undefined ? i.qtyTexto : i.qty}
                        onChange={e => setUnitQty(i.productId, e.target.value)}
                        onBlur={() => confirmarUnitQty(i.productId)}
                        onKeyDown={e => {
                          if (e.key !== "Enter") return;
                          confirmarUnitQty(i.productId);
                          // De vuelta al lector: es donde sigue la venta.
                          setTimeout(() => inputRef.current?.focus(), 0);
                        }}
                        onFocus={e => e.target.select()}
                        aria-label={`Cantidad de ${i.name}`}
                        className="w-14 text-center text-base font-mono font-bold outline-none"
                        style={{ color: C.ink, background: "#fff", border: "none" }}
                      />
                      <button onClick={() => changeQty(i.productId, 1)} aria-label="Agregar una unidad" className="w-11 flex items-center justify-center" style={{ background: C.paperDark, color: C.ink }}><Plus size={17} /></button>
                    </div>
                  )}
                  <span className="text-base font-mono font-bold" style={{ color: C.ink }}>{formatCLP(i.price * i.qty)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Cierre de la venta: total, forma de pago y cobro, todo dentro de
              la misma ficha de la boleta. Antes vivía en un recuadro aparte y
              parecía otra pantalla. */}
          <div className="p-4 space-y-3" style={{ background: C.ink }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm" style={{ color: C.grayLight }}>Total a pagar</span>
              <span className="text-3xl font-bold font-mono leading-none" style={{ color: "#ffffff" }}>{formatCLP(total)}</span>
            </div>

            <div>
              <p className="text-xs mb-1.5" style={{ color: C.grayLight }}>Forma de pago</p>
              <div className="grid grid-cols-2 gap-2">
                {["Efectivo", "Débito", "Crédito", "Transferencia"].map(m => (
                  <button
                    key={m} onClick={() => { setPayment(m); if (m !== "Efectivo") setCashReceived(""); }}
                    aria-pressed={payment === m}
                    className="px-2 rounded-lg text-sm font-semibold transition"
                    style={payment === m ? { background: C.brass, color: C.ink } : { background: C.inkSoft, color: "#e8e0d0" }}
                  >{m}</button>
                ))}
                <button
                  onClick={() => { setPayment("Fiado"); setCashReceived(""); }}
                  aria-pressed={payment === "Fiado"}
                  className="col-span-2 px-2 py-2 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-1.5"
                  style={payment === "Fiado" ? { background: C.brass, color: C.ink } : { background: C.inkSoft, color: "#e8e0d0" }}
                ><CreditCard size={15} />Fiado (queda debiendo)</button>
              </div>
            </div>

            {payment === "Fiado" && (
              <div className="rounded-lg p-3 space-y-2" style={{ background: C.inkSoft }}>
                {selectedCustomer ? (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: "#fff" }}>{selectedCustomer.name}</div>
                        <div className="text-xs font-mono" style={{ color: C.grayLight }}>
                          Debe hoy: {formatCLP(customerBalance(selectedCustomer.id))}
                        </div>
                      </div>
                      <button onClick={() => { setSelectedCustomer(null); setCustomerQuery(""); }} className="text-xs font-semibold flex-shrink-0" style={{ color: C.brass }}>Cambiar</button>
                    </div>
                    {selectedCustomer.creditLimit != null && (customerBalance(selectedCustomer.id) + total) > selectedCustomer.creditLimit && (
                      <p className="text-[11px] mt-1.5" style={{ color: "#fca5a5" }}>
                        Con esta venta quedaría debiendo {formatCLP(customerBalance(selectedCustomer.id) + total)}, sobre su límite de {formatCLP(selectedCustomer.creditLimit)}. Se puede igual completar la venta.
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="text-xs block mb-1.5" style={{ color: C.grayLight }} htmlFor="pos-cliente">¿A quién se le fía?</label>
                    <div className="relative">
                      <input
                        id="pos-cliente" value={customerQuery} onChange={e => setCustomerQuery(e.target.value)}
                        placeholder="Busca por nombre o teléfono…"
                        className={`${inputCls} pl-3`} style={inputStyle()}
                      />
                      {customerMatches.length > 0 && (
                        <div className="absolute z-30 left-0 right-0 top-full mt-1.5 rounded-lg overflow-hidden shadow-xl" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
                          {customerMatches.map(c => (
                            <button key={c.id} onClick={() => { setSelectedCustomer(c); setCustomerQuery(""); }} className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-black/[.04] text-left" style={{ borderBottom: `1px solid ${C.paperLine}` }}>
                              <span className="truncate" style={{ color: C.ink }}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</span>
                              <span className="font-mono text-xs flex-shrink-0" style={{ color: C.gray }}>debe {formatCLP(customerBalance(c.id))}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => setQuickCustomerOpen(true)} className="mt-2 text-xs font-semibold flex items-center gap-1" style={{ color: C.brass }}><UserPlus size={13} />Nuevo cliente</button>
                  </div>
                )}
              </div>
            )}

            {boletaAutomatica ? (
              <p className="text-[11px]" style={{ color: C.grayLight }}>Con {payment.toLowerCase()} la boleta se emite automáticamente.</p>
            ) : (
              <div>
                <p className="text-xs mb-1.5" style={{ color: C.grayLight }}>¿Se emitió boleta?</p>
                <div className="grid grid-cols-2 gap-2">
                  {[{ v: true, l: "Sí, con boleta" }, { v: false, l: "No, sin boleta" }].map(o => (
                    <button
                      key={String(o.v)} onClick={() => setBoletaEmitida(o.v)}
                      aria-pressed={boletaEmitida === o.v}
                      className="px-2 py-2 rounded-lg text-sm font-semibold transition"
                      style={boletaEmitida === o.v ? { background: C.brass, color: C.ink } : { background: C.inkSoft, color: "#e8e0d0" }}
                    >{o.l}</button>
                  ))}
                </div>
              </div>
            )}

            {payment === "Efectivo" && (
              <div className="rounded-lg p-3 space-y-2" style={{ background: C.inkSoft }}>
                <label className="text-xs block" style={{ color: C.grayLight }} htmlFor="pos-efectivo">¿Con cuánto paga?</label>
                <input
                  id="pos-efectivo" type="number" value={cashReceived} onChange={e => setCashReceived(e.target.value)}
                  className={`${inputCls} font-mono`} style={inputStyle()} placeholder="0"
                />
                {cashReceived !== "" && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold" style={{ color: C.grayLight }}>{Number(cashReceived) - total >= 0 ? "Vuelto" : "Falta"}</span>
                    <span className="font-mono font-bold text-lg" style={{ color: Number(cashReceived) - total >= 0 ? C.brass : "#fca5a5" }}>
                      {formatCLP(Math.abs(Number(cashReceived) - total))}
                    </span>
                  </div>
                )}
              </div>
            )}

            <Btn full onClick={() => setIdentifyOpen(true)} disabled={cart.length === 0 || (payment === "Efectivo" && cashReceived !== "" && Number(cashReceived) - total < 0) || (payment === "Fiado" && !selectedCustomer)} icon={Check}>Cobrar y emitir</Btn>

            {role === "admin" && (
              <div className="pt-3" style={{ borderTop: `1px dashed ${C.inkSoft}` }}>
                <Btn size="sm" full variant="ghostClaro" icon={Lock} disabled={cart.length === 0} onClick={() => setConsumptionOpen(true)}>Consumo interno</Btn>
                <p className="text-xs mt-2 text-center" style={{ color: C.grayLight }}>Consumo del local o los dueños: descuenta stock, no genera boleta.</p>
              </div>
            )}
          </div>
        </section>
      </div>

      {weightPromptProduct && <WeightPromptModal product={weightPromptProduct} onClose={() => setWeightPromptProduct(null)} onConfirm={confirmWeight} />}
      {scannerOpen && <CameraScanner onDetect={handleScan} onClose={() => setScannerOpen(false)} />}
      {identifyOpen && (
        <IdentifySellerModal
          onClose={() => setIdentifyOpen(false)}
          onConfirm={(seller) => { setIdentifyOpen(false); checkout(seller); }}
        />
      )}
      {ventaNueva && (
        <ProductoNuevoEnVentaModal
          barcode={ventaNueva.barcode}
          onClose={() => { setVentaNueva(null); setTimeout(() => inputRef.current?.focus(), 50); }}
          onConfirm={crearYVender}
        />
      )}
      {quickAdd && <ProductModal initial={quickAdd} onClose={() => setQuickAdd(null)} onSave={async (p) => {
        const latest = await loadJSON("products-catalog", products);
        const np = [...latest, { ...p, stockZeroSince: p.stock > 0 ? null : new Date().toISOString() }];
        setProducts(np); await saveJSON("products-catalog", np, { origen: "carga_inicial" });
        setQuickAdd(null); toast("Producto creado", "success");
      }} products={products} suppliers={suppliers} setSuppliers={setSuppliers} categories={categories} role={role} session={session} toast={toast} />}
      {receipt && <ReceiptModal sale={receipt} settings={settings} onClose={() => { setReceipt(null); setTimeout(() => inputRef.current?.focus(), 50); }} />}
      {consumptionOpen && (
        <ConsumptionAuthModal
          cart={cart}
          adminPin={settings.adminPin}
          onClose={() => setConsumptionOpen(false)}
          onConfirm={registerConsumption}
          toast={toast}
        />
      )}
      {consumptionTicket && <ConsumptionTicketModal ticket={consumptionTicket} settings={settings} onClose={() => setConsumptionTicket(null)} />}
      {quickCustomerOpen && (
        <CustomerModal
          quick
          onClose={() => setQuickCustomerOpen(false)}
          onSave={async (c) => {
            const latest = await loadJSON("customers", customers);
            const nc = [...latest, c];
            setCustomers(nc); await saveJSON("customers", nc);
            setSelectedCustomer(c); setQuickCustomerOpen(false);
            toast("Cliente registrado", "success");
          }}
        />
      )}
    </div>
  );
}

/* Alta rápida desde el mesón. Solo lo indispensable para cobrar: qué es y a
   cuánto. Todo lo demás —costo, categoría, proveedor— lo completa un
   administrador después, avisado por la aprobación pendiente. */
function ProductoNuevoEnVentaModal({ barcode, onClose, onConfirm }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [guardando, setGuardando] = useState(false);

  async function submit() {
    if (guardando) return;
    setGuardando(true);
    try { await onConfirm({ name, price, qty }); }
    finally { setGuardando(false); }
  }

  return (
    <Modal title="Producto nuevo — vender ahora" onClose={onClose}>
      <div className="rounded-lg p-3 mb-4" style={{ background: C.paperDark }}>
        <div className="text-xs" style={{ color: C.gray }}>Código escaneado</div>
        <div className="font-mono text-sm font-semibold" style={{ color: C.ink }}>{barcode || "sin código"}</div>
      </div>
      <Field label="¿Qué es?">
        <input autoFocus value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          className={inputCls} style={inputStyle()} placeholder="Nombre del producto" />
      </Field>
      <Field label="Precio de venta">
        <input type="number" inputMode="numeric" value={price} onChange={e => setPrice(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          className={`${inputCls} font-mono`} style={inputStyle()} placeholder="0" />
      </Field>
      <Field label="Cantidad">
        <input type="number" inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          className={`${inputCls} font-mono`} style={inputStyle()} placeholder="1" />
      </Field>
      <div className="rounded-lg p-3 mb-4" style={{ background: C.brassSoft }}>
        <p className="text-xs" style={{ color: C.brassText }}>
          Queda en el catálogo con el stock que estás vendiendo y sin costo ni categoría.
          Un administrador los completa después desde Inventario.
        </p>
      </div>
      <div className="flex gap-2">
        <Btn variant="ghost" full onClick={onClose}>Cancelar</Btn>
        <Btn full icon={guardando ? Loader2 : Check} disabled={guardando || !name.trim()} onClick={submit}>
          {guardando ? "Creando…" : "Crear y agregar"}
        </Btn>
      </div>
    </Modal>
  );
}

function ConsumptionAuthModal({ cart, adminPin, onClose, onConfirm, toast }) {
  const [responsible, setResponsible] = useState("");
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  async function submit() {
    if (!responsible.trim()) return toast("Indica quién retira los productos", "error");
    // El PIN se comprueba en la base, donde está guardado con bcrypt: nunca
    // llega al navegador. Sirve el PIN del negocio o el personal de cualquier
    // administrador. Si la consulta falla, se dice qué falló — no "PIN
    // incorrecto", que manda a buscar el problema donde no está.
    try {
      if (!(await autorizarConPin(pin))) {
        return toast("Ese PIN no es de un administrador. Sirve el PIN del negocio (Ajustes) o el personal de un administrador.", "error");
      }
    } catch (e) {
      return toast(friendlyError(e, "No se pudo comprobar el PIN"), "error");
    }
    onConfirm({ responsible: responsible.trim(), reason: reason.trim() });
  }

  return (
    <Modal title="Autorizar consumo interno" onClose={onClose}>
      <div className="rounded-lg p-3 mb-4" style={{ background: C.paperDark }}>
        <div className="text-xs mb-1" style={{ color: C.gray }}>{cart.length} producto(s) en el carrito</div>
        <ul className="text-sm space-y-0.5">
          {cart.map(i => <li key={i.productId} style={{ color: C.ink }}>{i.unitType === "peso" ? `${i.qty} kg` : `${i.qty}×`} {i.name}</li>)}
        </ul>
        <div className="text-xs mt-2" style={{ color: C.gray }}>Valor referencial (precio venta): {formatCLP(total)}</div>
      </div>
      <Field label="Trabajador o dueño que retira"><input autoFocus value={responsible} onChange={e => setResponsible(e.target.value)} className={inputCls} style={inputStyle()} placeholder="Nombre de quien consume" /></Field>
      <Field label="Motivo (opcional)"><input value={reason} onChange={e => setReason(e.target.value)} className={inputCls} style={inputStyle()} placeholder="Ej. Colación, uso personal…" /></Field>
      <Field label="PIN de administrador (el del negocio o el tuyo, si eres admin)"><input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} className={inputCls} style={inputStyle()} placeholder="••••" /></Field>
      <div className="flex gap-2">
        <Btn variant="ghost" full onClick={onClose}>Cancelar</Btn>
        <Btn full variant="rust" icon={Lock} onClick={submit}>Autorizar y descontar stock</Btn>
      </div>
    </Modal>
  );
}

function ConsumptionTicketModal({ ticket, settings, onClose }) {
  return (
    <Modal title="Consumo interno registrado" onClose={onClose}>
      <div className="rounded-lg p-3 mb-3" style={{ background: C.brassSoft }}>
        <p className="text-xs" style={{ color: "#8a6a1f" }}>Este comprobante es solo para control interno de stock. No es una boleta de venta y no se contabiliza como ingreso.</p>
      </div>
      <div className="font-mono text-sm space-y-2">
        <div className="text-xs" style={{ color: C.gray }}>{formatDate(ticket.date)}</div>
        <div className="text-xs" style={{ color: C.gray }}>Retira: <span style={{ color: C.ink }}>{ticket.responsible}</span>{ticket.reason ? ` · ${ticket.reason}` : ""}</div>
        <div className="text-xs" style={{ color: C.gray }}>Autorizado por: {ticket.authorizedBy}</div>
        <div className="pt-2 space-y-1" style={{ borderTop: `1px dashed ${C.paperLine}` }}>
          {ticket.items.map((i, idx) => (
            <div key={idx} className="flex justify-between text-xs"><span>{i.unitType === "peso" ? `${i.qty} kg` : `${i.qty}×`} {i.name}</span><span style={{ color: C.gray }}>costo {formatCLP(i.cost * i.qty)}</span></div>
          ))}
        </div>
        <div className="flex justify-between text-sm font-semibold pt-2" style={{ borderTop: `1px dashed ${C.paperLine}` }}>
          <span>Costo total</span><span style={{ color: C.rust }}>{formatCLP(ticket.costTotal)}</span>
        </div>
      </div>
      <div className="mt-4"><Btn full onClick={onClose}>Cerrar</Btn></div>
    </Modal>
  );
}

function ReceiptModal({ sale, settings, onClose }) {
  const iva = settings.ivaIncluded ? sale.total - sale.total / 1.19 : 0;
  const neto = sale.total - iva;
  return (
    <Modal title={`Boleta #${sale.invoiceNumber}`} onClose={onClose}>
      <div id="receipt-print" className="font-mono text-sm space-y-3">
        <div className="text-center pb-3" style={{ borderBottom: `1px dashed ${C.paperLine}` }}>
          {settings.businessLogo && (
            <img src={settings.businessLogo} alt={settings.businessName} className="mx-auto mb-1.5 object-contain" style={{ maxHeight: 78, maxWidth: 180 }} />
          )}
          <div className="font-semibold text-base" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{settings.businessName}</div>
          <div className="text-xs" style={{ color: C.gray }}>{formatDate(sale.date)}</div>
          <div className="text-xs" style={{ color: C.gray }}>Vendedor: {sale.seller}{sale.customer ? ` · Cliente: ${sale.customer}` : ""}</div>
        </div>
        <div className="space-y-1.5">
          {/* Al cliente siempre se le muestra un único precio por línea, aunque
              detrás se haya decidido cobrar todo al precio anterior para no
              mezclar dos precios en la misma boleta — esa aclaración (y la
              ganancia extra que a veces deja) queda para Análisis, no acá. */}
          {sale.items.map((i, idx) => (
            <div key={idx} className="flex justify-between text-xs">
              <span>{i.unitType === "peso" ? `${i.qty} kg` : `${i.qty}×`} {i.name}</span>
              <span>{formatCLP(i.price * i.qty)}</span>
            </div>
          ))}
        </div>
        <div className="pt-3 space-y-1" style={{ borderTop: `1px dashed ${C.paperLine}` }}>
          {settings.ivaIncluded && (
            <>
              <div className="flex justify-between text-xs" style={{ color: C.gray }}><span>Neto</span><span>{formatCLP(neto)}</span></div>
              <div className="flex justify-between text-xs" style={{ color: C.gray }}><span>IVA (19%)</span><span>{formatCLP(iva)}</span></div>
            </>
          )}
          <div className="flex justify-between text-base font-semibold pt-1"><span>Total</span><span>{formatCLP(sale.total)}</span></div>
          <div className="text-xs pt-1" style={{ color: C.gray }}>Pago: {sale.paymentMethod}</div>
          {sale.paymentMethod === "Fiado" && (
            <div className="text-xs" style={{ color: "#8a6a1f" }}>Fiado — pendiente de pago{sale.customer ? ` (${sale.customer})` : ""}</div>
          )}
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <Btn variant="ghost" full onClick={onClose}>Cerrar</Btn>
        <Btn full icon={Printer} onClick={() => window.print()}>Imprimir</Btn>
      </div>
      <style>{`@media print { body * { visibility: hidden; } #receipt-print, #receipt-print * { visibility: visible; } #receipt-print { position: fixed; top: 0; left: 0; width: 100%; } }`}</style>
    </Modal>
  );
}

/* ---------------------------------------------------------
   PRODUCTO — MODAL CREAR / EDITAR
--------------------------------------------------------- */
function ProductModal({ initial, onClose, onSave, products, suppliers = [], setSuppliers, categories = [], role, session, toast }) {
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)),
    [categories]
  );
  // Igual que en DraftRow (Recepción): elegir de una lista evita secciones
  // duplicadas por un error de tipeo, pero se puede escribir una nueva a
  // propósito — la migración 0007 dejó abierto que cualquiera del equipo cree
  // una sección al recibir mercadería nueva, y eso no cambia acá.
  const [addingCategory, setAddingCategory] = useState(() => sortedCategories.length === 0);
  const [quickAddSupplier, setQuickAddSupplier] = useState(false);
  const [form, setForm] = useState({
    id: initial?.id || uid("prod"),
    barcode: initial?.barcode || "",
    name: initial?.name || "",
    category: initial?.category || "",
    price: initial?.price ?? "",
    cost: initial?.cost ?? "",
    stock: initial?.stock ?? 0,
    minStock: initial?.minStock ?? 5,
    supplierId: initial?.supplierId || "",
    unitType: initial?.unitType || "unidad",
    unitsPerKg: initial?.unitsPerKg || null,
    quickAccess: initial?.quickAccess ?? false,
  });
  const isEdit = !!initial?.id && products.some(p => p.id === initial.id);
  const isPeso = form.unitType === "peso";
  const quickMode = !isEdit && initial?.quickAccess === true;
  // Para productos nuevos por peso, en vez de pedir el costo por kg directo,
  // se pide lo que costó la compra completa (ej. una caja) y los kg netos que
  // trajo — el costo por kg sale de dividir uno por otro.
  const [totalPaid, setTotalPaid] = useState("");
  const useTotalPaidMode = isPeso && !isEdit;
  const stockKg = Number(form.stock) || 0;
  const computedCostPerKg = useTotalPaidMode
    ? (stockKg > 0 ? (Number(totalPaid) || 0) / stockKg : 0)
    : (Number(form.cost) || 0);
  // Si quien crea el producto no es administrador, el precio queda como
  // sugerencia a la espera de aprobación — el mismo mecanismo que ya se usa
  // en Recepción, para que cualquiera pueda cargar el producto sin poder
  // fijar el precio de venta final por su cuenta.
  const needsApproval = !isEdit && role !== "admin";
  const suggested = suggestPrice(computedCostPerKg);
  const [confirmedLoss, setConfirmedLoss] = useState(false);

  // Regla de margen: nunca se debe vender un producto a un precio igual o
  // menor que su costo con el 19% de IVA incluido (el "neto con el 19%") —
  // esa es la única línea que no se puede cruzar. El margen del 30% que
  // sugiere el sistema es solo un promedio de referencia y puede variar
  // libremente por producto; lo que nunca varía es este piso. Se compara
  // contra el costo actual y contra el costo más alto que haya tenido este
  // producto en su historial, para no vender perdiendo plata sin darse
  // cuenta con stock que costó más caro. Aplica a cualquier producto, se
  // esté creando o editando.
  const currentStock = Number(form.stock) || 0;
  const newPriceNum = Number(form.price) || 0;
  const oldPrice = initial?.price ?? 0;
  // El costo histórico más alto viene calculado sobre TODA la historia, no solo
  // sobre las 15 entradas que se muestran: el piso de margen depende de él.
  const highestPastCost = Math.max(
    0,
    initial?.maxHistoricCost || 0,
    ...(initial?.priceHistory || []).map(h => h.cost || 0)
  );
  const referenceCost = Math.max(Number(form.cost) || 0, highestPastCost);
  const hardFloor = referenceCost * 1.19;
  const sellsAtLoss = !needsApproval && newPriceNum > 0 && referenceCost > 0 && newPriceNum <= hardFloor;
  const priceDropping = isEdit && !needsApproval && currentStock > 0 && newPriceNum > 0 && newPriceNum < oldPrice;
  const marginPct = newPriceNum > 0 ? Math.round(((newPriceNum - referenceCost) / newPriceNum) * 100) : null;
  const showMarginWarning = !needsApproval && newPriceNum > 0 && (sellsAtLoss || (priceDropping && marginPct !== null && marginPct < 15));

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); if (k === "price") setConfirmedLoss(false); }
  async function saveQuickSupplier(s) {
    const latest = await loadJSON("suppliers", suppliers);
    const ns = [...latest, s];
    setSuppliers(ns); await saveJSON("suppliers", ns);
    setQuickAddSupplier(false);
    set("supplierId", s.id);
    if (toast) toast("Proveedor registrado", "success");
  }
  function submit() {
    if (!form.name.trim()) return;
    if (quickMode && !form.category.trim()) return;
    if (showMarginWarning && !confirmedLoss) return;
    if (!form.barcode.trim()) set("barcode", `INT-${Date.now()}`);
    const netCost = useTotalPaidMode ? computedCostPerKg : (Number(form.cost) || 0);
    const finalPrice = needsApproval ? suggestPrice(netCost) : (Number(form.price) || 0);
    onSave({
      ...form,
      name: upperField(form.name),
      category: upperField(form.category),
      barcode: form.barcode.trim() || `INT-${Date.now()}`,
      price: finalPrice,
      cost: netCost,
      stock: Number(form.stock) || 0,
      minStock: Number(form.minStock) || 0,
      supplierId: form.supplierId || null,
      unitType: form.unitType,
      unitsPerKg: form.unitType === "peso" ? null : (form.unitsPerKg || null),
      quickAccess: form.quickAccess,
      priceApproval: needsApproval
        ? { suggestedPrice: finalPrice, netCost, requestedBy: session.name, date: new Date().toISOString(), isNewProduct: true }
        : (initial?.priceApproval ?? null),
      priceHistory: pushPriceHistory(initial?.priceHistory, netCost, finalPrice),
    });
  }

  return (
    <Modal title={isEdit ? "Editar producto" : quickMode ? "Nuevo producto de acceso rápido" : "Nuevo producto"} onClose={onClose}>
      {quickMode && (
        <div className="rounded-lg p-3 mb-3" style={{ background: C.greenSoft }}>
          <p className="text-xs" style={{ color: C.greenDark }}>No necesita código de barras. Aparecerá como botón en el Catálogo rápido de Vender, dentro de la categoría que le asignes (ej. Verduras, Frutas, Cecinas y quesos…).</p>
        </div>
      )}
      {needsApproval && (
        <div className="rounded-lg p-3 mb-3" style={{ background: C.brassSoft }}>
          <p className="text-xs" style={{ color: "#8a6a1f" }}>El precio de venta lo calcula el sistema en base al costo neto y queda a la espera de que un administrador lo confirme o ajuste.</p>
        </div>
      )}
      {!quickMode && <Field label="Código de barras"><input value={form.barcode} onChange={e => set("barcode", e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} placeholder="Se genera uno si lo dejas vacío" /></Field>}
      <Field label="Nombre"><input autoFocus value={form.name} onChange={e => set("name", e.target.value)} className={inputCls} style={{ ...inputStyle(), textTransform: "uppercase" }} /></Field>
      <Field label={quickMode ? "Categoría (obligatoria — define el botón)" : "Categoría"}>
        {addingCategory ? (
          <div className="flex gap-1.5">
            <input autoFocus={sortedCategories.length > 0} value={form.category} onChange={e => set("category", e.target.value)} className={inputCls} style={{ ...inputStyle(), textTransform: "uppercase" }} placeholder="Ej. Verduras, Frutas, Útiles de aseo, Medicamentos, Cecinas y quesos…" />
            {sortedCategories.length > 0 && (
              <button type="button" onClick={() => setAddingCategory(false)} className="px-3 rounded-lg text-xs font-medium whitespace-nowrap" style={{ background: C.paperDark, color: C.gray }}>Elegir de la lista</button>
            )}
          </div>
        ) : (
          <select
            value={sortedCategories.some(c => c.name === form.category) ? form.category : (form.category ? "__keep__" : "")}
            onChange={e => {
              if (e.target.value === "__new__") { setAddingCategory(true); set("category", ""); }
              else if (e.target.value !== "__keep__") set("category", e.target.value);
            }}
            className={inputCls} style={inputStyle()}
          >
            <option value="">Elige una sección…</option>
            {form.category && !sortedCategories.some(c => c.name === form.category) && (
              <option value="__keep__">{form.category} (ya no está en la lista)</option>
            )}
            {sortedCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            <option value="__new__">+ Nueva categoría…</option>
          </select>
        )}
      </Field>
      <Field label="Proveedor (opcional)">
        <select
          value={form.supplierId}
          onChange={e => { if (e.target.value === "__new__") setQuickAddSupplier(true); else set("supplierId", e.target.value); }}
          className={inputCls} style={inputStyle()}
        >
          <option value="">Sin proveedor asignado</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          {role === "admin" && setSuppliers && <option value="__new__">+ Nuevo proveedor…</option>}
        </select>
      </Field>
      <Field label="Se vende">
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => set("unitType", "unidad")} className="py-2 rounded-lg text-sm font-medium" style={!isPeso ? { background: C.brass, color: C.ink } : { background: C.paperDark, color: C.gray }}>Por unidad</button>
          <button type="button" onClick={() => set("unitType", "peso")} className="py-2 rounded-lg text-sm font-medium" style={isPeso ? { background: C.brass, color: C.ink } : { background: C.paperDark, color: C.gray }}>Por peso (kg)</button>
        </div>
      </Field>

      {!isPeso && (
        <Field label="Unidades que trae cada Kg al comprarlo (opcional)">
          <input type="number" value={form.unitsPerKg || ""} onChange={e => set("unitsPerKg", e.target.value ? Number(e.target.value) : null)} className={`${inputCls} font-mono`} style={inputStyle()} placeholder="Ej. 12 — solo si se compra por Kg aunque se venda por unidad" />
        </Field>
      )}

      {useTotalPaidMode ? (
        <div className="rounded-lg p-3 mb-3" style={{ background: C.paperDark, border: `1px solid ${C.paperLine}` }}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio total pagado"><input type="number" value={totalPaid} onChange={e => setTotalPaid(e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} placeholder="Ej. 20000" /></Field>
            <Field label="Kg netos recibidos"><input type="number" step="0.001" value={form.stock} onChange={e => set("stock", e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} placeholder="Ej. 25" /></Field>
          </div>
          <p className="text-[11px]" style={{ color: C.gray }}>Ej: una caja de tomates de 25 kg netos que costó $20.000 → $800/kg. El sistema divide el precio total por los kg para sacar el costo por kilogramo.</p>
          {stockKg > 0 && Number(totalPaid) > 0 && (
            <div className="flex justify-between text-xs font-semibold mt-2 pt-2" style={{ borderTop: `1px dashed ${C.paperLine}`, color: C.ink }}>
              <span>Costo por kg</span><span className="font-mono">{formatCLP(computedCostPerKg)}</span>
            </div>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {!useTotalPaidMode && (
          <Field label={`Costo (neto${isPeso ? " por kg" : ""})`}><input type="number" value={form.cost} onChange={e => set("cost", e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} /></Field>
        )}
        {needsApproval ? (
          <Field label={isPeso ? "Precio sugerido por kg" : "Precio sugerido"}>
            <div className={`${inputCls} font-mono`} style={{ ...inputStyle(), background: C.paperDark, color: C.gray }}>{formatCLP(suggested)}</div>
          </Field>
        ) : (
          <Field label={isPeso ? "Precio por kilogramo" : "Precio de venta"}>
            <input type="number" value={form.price} onChange={e => set("price", e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} placeholder={computedCostPerKg ? String(suggested) : "0"} />
          </Field>
        )}
        {!useTotalPaidMode && (
          <Field label={isPeso ? "Stock actual (kg)" : "Stock actual"}><input type="number" step={isPeso ? "0.001" : "1"} value={form.stock} onChange={e => set("stock", e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} /></Field>
        )}
        <Field label={isPeso ? "Stock mínimo (kg)" : "Stock mínimo"}><input type="number" step={isPeso ? "0.001" : "1"} value={form.minStock} onChange={e => set("minStock", e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} /></Field>
      </div>
      {!needsApproval && computedCostPerKg > 0 && (
        <button type="button" onClick={() => set("price", suggested)} className="text-xs mb-3 -mt-2 underline" style={{ color: C.green }}>Usar precio sugerido ({formatCLP(suggested)}{isPeso ? "/kg" : ""})</button>
      )}

      {showMarginWarning && (
        <div className="rounded-lg p-3 mb-4" style={{ background: sellsAtLoss ? C.rustSoft : C.brassSoft }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle size={14} style={{ color: sellsAtLoss ? C.rust : "#8a6a1f" }} />
            <span className="text-sm font-semibold" style={{ color: sellsAtLoss ? C.rust : "#8a6a1f" }}>
              {sellsAtLoss ? "Este precio genera pérdida" : "Este precio deja un margen muy bajo"}
            </span>
          </div>
          <p className="text-xs mb-2" style={{ color: sellsAtLoss ? C.rust : "#8a6a1f" }}>
            {currentStock > 0 && `Todavía quedan ${currentStock}${isPeso ? " kg" : " unidades"} en stock. `}
            {highestPastCost > (Number(form.cost) || 0)
              ? `Este producto llegó a costar ${formatCLP(highestPastCost)}${isPeso ? "/kg" : ""} en compras anteriores — `
              : `El costo actual es ${formatCLP(referenceCost)}${isPeso ? "/kg" : ""} — `}
            {sellsAtLoss
              ? `el costo con el 19% de IVA ya es ${formatCLP(hardFloor)}${isPeso ? "/kg" : ""}, así que vender a ${formatCLP(newPriceNum)} deja pérdida segura, sin contar ninguna ganancia.`
              : `el margen quedaría en cerca de ${marginPct}%.`}
          </p>
          <label className="flex items-center gap-2 text-xs font-medium" style={{ color: sellsAtLoss ? C.rust : "#8a6a1f" }}>
            <input type="checkbox" checked={confirmedLoss} onChange={e => setConfirmedLoss(e.target.checked)} />
            Entiendo, guardar este precio de todas formas
          </label>
        </div>
      )}

      {isEdit && (initial?.priceHistory?.length > 0) && <PriceHistoryDetail history={initial.priceHistory} isPeso={isPeso} />}

      {!quickMode && (
        <label className="flex items-center gap-2 mb-4 text-sm" style={{ color: C.ink }}>
          <input type="checkbox" checked={form.quickAccess} onChange={e => set("quickAccess", e.target.checked)} />
          Mostrar como botón de acceso rápido en Vender
        </label>
      )}
      <Btn full onClick={submit} icon={Check} disabled={(quickMode && !form.category.trim()) || (showMarginWarning && !confirmedLoss)}>Guardar</Btn>
      {quickAddSupplier && <SupplierModal initial={null} onClose={() => setQuickAddSupplier(false)} onSave={saveQuickSupplier} />}
    </Modal>
  );
}

function PriceHistoryDetail({ history, isPeso }) {
  const [open, setOpen] = useState(false);
  const sorted = [...history].reverse();
  return (
    <div className="mb-4">
      <button type="button" onClick={() => setOpen(o => !o)} className="text-xs font-medium underline" style={{ color: C.gray }}>
        {open ? "Ocultar" : "Ver"} historial de precios ({history.length})
      </button>
      {open && (
        <div className="mt-2 rounded-lg overflow-hidden" style={{ border: `1.5px solid ${C.paperLine}` }}>
          <div className="max-h-40 overflow-y-auto divide-y" style={{ borderColor: C.paperLine }}>
            {sorted.map((h, i) => (
              <div key={i} className="px-3 py-1.5 flex items-center justify-between text-xs">
                <span style={{ color: C.gray }}>{formatDate(h.date)}</span>
                <span className="font-mono" style={{ color: C.ink }}>costo {formatCLP(h.cost)}{isPeso ? "/kg" : ""} · venta {formatCLP(h.price)}{isPeso ? "/kg" : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   RESTOCK MODAL
--------------------------------------------------------- */
function RestockModal({ product, onClose, onConfirm }) {
  const hasKgConversion = !!product.unitsPerKg;
  const [kgMode, setKgMode] = useState(hasKgConversion);
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState(product.cost || "");
  const [kg, setKg] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");

  const computedQty = kgMode ? (Number(kg) || 0) * product.unitsPerKg : (Number(qty) || 0);
  const computedCostPerUnit = kgMode ? (product.unitsPerKg ? (Number(pricePerKg) || 0) / product.unitsPerKg : 0) : (Number(cost) || 0);
  const total = computedQty * computedCostPerUnit;
  const suggestedSalePrice = computedCostPerUnit > 0 ? suggestPrice(computedCostPerUnit) : 0;

  function confirm() {
    onConfirm(computedQty, computedCostPerUnit);
  }

  return (
    <Modal title={`Reponer stock — ${product.name}`} onClose={onClose}>
      {hasKgConversion && (
        <div className="grid grid-cols-2 gap-1.5 mb-4">
          <button type="button" onClick={() => setKgMode(true)} className="py-2 rounded-lg text-sm font-medium" style={kgMode ? { background: C.brass, color: C.ink } : { background: C.paperDark, color: C.gray }}>Compra por Kg</button>
          <button type="button" onClick={() => setKgMode(false)} className="py-2 rounded-lg text-sm font-medium" style={!kgMode ? { background: C.brass, color: C.ink } : { background: C.paperDark, color: C.gray }}>Cantidad directa</button>
        </div>
      )}

      {kgMode ? (
        <>
          <p className="text-xs mb-3" style={{ color: C.gray }}>Este producto se compra por Kg pero se vende por unidad — cada Kg trae {product.unitsPerKg} unidades. Ingresa lo que pagaste y el sistema calcula el costo y precio por unidad.</p>
          <Field label="Kg comprados"><input autoFocus type="number" step="0.001" value={kg} onChange={e => setKg(e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} /></Field>
          <Field label="Precio pagado por Kg"><input type="number" value={pricePerKg} onChange={e => setPricePerKg(e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} /></Field>
          {kg !== "" && pricePerKg !== "" && (
            <div className="rounded-lg p-3 mb-4 space-y-1.5" style={{ background: C.paperDark }}>
              <div className="flex justify-between text-sm"><span style={{ color: C.gray }}>Unidades a ingresar</span><span className="font-mono font-semibold" style={{ color: C.ink }}>{computedQty}</span></div>
              <div className="flex justify-between text-sm"><span style={{ color: C.gray }}>Costo por unidad</span><span className="font-mono font-semibold" style={{ color: C.ink }}>{formatCLP(computedCostPerUnit)}</span></div>
              <div className="flex justify-between text-sm pt-1.5" style={{ borderTop: `1px dashed ${C.paperLine}` }}><span style={{ color: C.green }}>Precio de venta recomendado</span><span className="font-mono font-semibold" style={{ color: C.greenDark }}>{formatCLP(suggestedSalePrice)}</span></div>
              <p className="text-[11px]" style={{ color: C.grayLight }}>El precio de venta no se cambia solo — si quieres actualizarlo, hazlo desde "Editar".</p>
            </div>
          )}
        </>
      ) : (
        <>
          <Field label="Cantidad a ingresar"><input autoFocus type="number" value={qty} onChange={e => setQty(e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} /></Field>
          <Field label="Costo unitario"><input type="number" value={cost} onChange={e => setCost(e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} /></Field>
        </>
      )}

      <div className="rounded-lg p-3 mb-4 flex justify-between text-sm" style={{ background: C.paperDark }}>
        <span style={{ color: C.gray }}>Egreso total</span><span className="font-mono font-semibold" style={{ color: C.rust }}>{formatCLP(total)}</span>
      </div>
      <Btn full icon={Check} disabled={computedQty <= 0} onClick={confirm}>Confirmar ingreso de stock</Btn>
    </Modal>
  );
}

/* ---------------------------------------------------------
   IMPORTAR PRODUCTOS (CSV pegado)
--------------------------------------------------------- */
function ImportModal({ onClose, onImport }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => {
    return text.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
      const parts = line.includes(";") ? line.split(";") : line.split(",");
      const [barcode, name, category, price, cost, stock] = parts.map(p => (p || "").trim());
      return { barcode, name, category, price, cost, stock };
    }).filter(r => r.name && normalize(r.name) !== "nombre");
  }, [text]);

  return (
    <Modal title="Importar productos" wide onClose={onClose}>
      <p className="text-sm mb-2" style={{ color: C.gray }}>Pega una línea por producto, con el formato:</p>
      <div className="rounded-lg p-2 mb-3 font-mono text-xs" style={{ background: C.paperDark, color: C.ink }}>codigo,nombre,categoria,precio,costo,stock</div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={8} className={`${inputCls} font-mono text-xs`} style={inputStyle()} placeholder={"7801234567890,Arroz 1kg,Abarrotes,1490,1050,40\n7809876543210,Detergente 900cc,Aseo,3990,2800,25"} />
      <p className="text-xs mt-2 mb-4" style={{ color: C.gray }}>{parsed.length} producto(s) detectado(s). Si el código ya existe, se actualiza; si no, se crea.</p>
      <Btn full disabled={parsed.length === 0} icon={Upload} onClick={() => onImport(parsed)}>Importar {parsed.length} producto(s)</Btn>
    </Modal>
  );
}

/* ---------------------------------------------------------
   RECEPCIÓN DE PEDIDOS
   Abierta a todos los roles: permite ingresar productos nuevos que
   llegan (manual o escaneando la factura/boleta con IA). El precio
   sugerido solo queda aplicado de inmediato si lo confirma un
   administrador; si lo hace un vendedor, queda pendiente de
   aprobación en el panel de abajo (solo visible para administradores).
--------------------------------------------------------- */
function ApprovalsPanel({ products, setProducts, toast }) {
  const pending = products.filter(p => p.priceApproval);
  const [edits, setEdits] = useState({});
  if (pending.length === 0) return null;

  async function approve(product) {
    const price = Number(edits[product.id] ?? product.priceApproval.suggestedPrice);
    const latest = await loadJSON("products-catalog", products);
    const np = latest.map(p => p.id === product.id ? { ...p, price, priceApproval: null, priceHistory: pushPriceHistory(p.priceHistory, p.cost, price) } : p);
    setProducts(np); await saveJSON("products-catalog", np);
    toast("Precio aprobado", "success");
  }
  async function dismiss(product) {
    const latest = await loadJSON("products-catalog", products);
    const np = latest.map(p => p.id === product.id ? { ...p, priceApproval: null } : p);
    setProducts(np); await saveJSON("products-catalog", np);
    toast("Marcado como revisado, se mantiene el precio actual", "success");
  }

  return (
    <div className="rounded-xl overflow-hidden mb-4" style={{ background: "#fff", border: `1.5px solid ${C.brass}` }}>
      <div className="px-4 py-3 flex items-center gap-2" style={{ background: C.brassSoft }}>
        <ClipboardCheck size={16} style={{ color: "#8a6a1f" }} />
        <span className="text-sm font-semibold" style={{ color: "#8a6a1f", fontFamily: "'Space Grotesk', sans-serif" }}>Precios pendientes de aprobación ({pending.length})</span>
      </div>
      <div className="divide-y" style={{ borderColor: C.paperLine }}>
        {pending.map(p => (
          <div key={p.id} className="px-4 py-3 flex flex-wrap items-center gap-2.5">
            <div className="flex-1 min-w-[180px]">
              <div className="text-sm font-medium flex items-center gap-1.5" style={{ color: C.ink }}>
                {p.name} {p.priceApproval.isNewProduct && <Badge tone="brass">nuevo</Badge>}
              </div>
              <div className="text-xs" style={{ color: C.gray }}>Costo neto: {formatCLP(p.priceApproval.netCost)} · Pedido por {p.priceApproval.requestedBy}</div>
            </div>
            <div className="text-xs" style={{ color: C.gray }}>Precio actual: <span className="font-mono">{formatCLP(p.price)}</span></div>
            <input type="number" defaultValue={p.priceApproval.suggestedPrice} onChange={e => setEdits(s => ({ ...s, [p.id]: e.target.value }))} className={`${inputCls} font-mono w-28`} style={inputStyle()} />
            <Btn size="sm" icon={Check} onClick={() => approve(p)}>Aprobar</Btn>
            <Btn size="sm" variant="ghost" onClick={() => dismiss(p)}>Descartar</Btn>
          </div>
        ))}
      </div>
    </div>
  );
}

function DraftRow({ item, onChange, onRemove, role, products, categories = [] }) {
  const suggested = suggestPrice(Number(item.netCost) || 0);
  const currentProduct = !item.isNew ? products.find(p => p.id === item.productId) : null;
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)),
    [categories]
  );
  // Igual que en ProductModal: elegir de la lista evita categorías duplicadas
  // por un error de tipeo, pero se puede escribir una nueva a propósito — la
  // migración 0007 dejó abierto que cualquiera del equipo cree una sección al
  // recibir mercadería nueva, y eso no cambia.
  const [addingCategory, setAddingCategory] = useState(() => categories.length === 0);
  return (
    <div className="px-4 py-3 flex flex-wrap items-center gap-2.5" style={{ borderBottom: `1px solid ${C.paperLine}` }}>
      <div className="flex-1 min-w-[180px]">
        {item.isNew ? (
          <div className="flex flex-col gap-1.5">
            <input value={item.name} onChange={e => onChange({ ...item, name: e.target.value })} placeholder="Nombre del producto" className={`${inputCls} text-sm`} style={inputStyle()} />
            <div className="flex gap-1.5">
              {addingCategory ? (
                <div className="flex-1 flex gap-1">
                  <input autoFocus={sortedCategories.length > 0} value={item.category} onChange={e => onChange({ ...item, category: e.target.value })} placeholder="Categoría nueva" className={`${inputCls} text-xs`} style={inputStyle()} />
                  {sortedCategories.length > 0 && (
                    <button type="button" onClick={() => setAddingCategory(false)} className="px-2 rounded-md text-[10px] font-medium whitespace-nowrap" style={{ background: C.paperDark, color: C.gray }}>Lista</button>
                  )}
                </div>
              ) : (
                <select
                  value={sortedCategories.some(c => c.name === item.category) ? item.category : (item.category ? "__keep__" : "")}
                  onChange={e => {
                    if (e.target.value === "__new__") { setAddingCategory(true); onChange({ ...item, category: "" }); }
                    else if (e.target.value !== "__keep__") onChange({ ...item, category: e.target.value });
                  }}
                  className={`${inputCls} text-xs flex-1`} style={inputStyle()}
                >
                  <option value="">Categoría…</option>
                  {item.category && !sortedCategories.some(c => c.name === item.category) && (
                    <option value="__keep__">{item.category}</option>
                  )}
                  {sortedCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  <option value="__new__">+ Nueva categoría…</option>
                </select>
              )}
              <input value={item.barcode} onChange={e => onChange({ ...item, barcode: e.target.value })} placeholder="Código de barras (opcional)" className={`${inputCls} text-xs font-mono`} style={inputStyle()} />
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={() => onChange({ ...item, unitType: "unidad" })} className="flex-1 py-1 rounded-md text-[11px] font-medium" style={item.unitType !== "peso" ? { background: C.brass, color: C.ink } : { background: C.paperDark, color: C.gray }}>Unidad</button>
              <button type="button" onClick={() => onChange({ ...item, unitType: "peso" })} className="flex-1 py-1 rounded-md text-[11px] font-medium" style={item.unitType === "peso" ? { background: C.brass, color: C.ink } : { background: C.paperDark, color: C.gray }}>Peso (kg)</button>
            </div>
          </div>
        ) : (
          <div>
            <div className="text-sm font-medium" style={{ color: C.ink }}>{item.name}</div>
            <div className="text-xs font-mono" style={{ color: C.gray }}>{item.barcode}</div>
            <div className="text-xs mt-0.5" style={{ color: C.green }}>Stock actual: <span className="font-mono font-semibold">{currentProduct ? currentProduct.stock : "—"}</span></div>
          </div>
        )}
      </div>
      <Badge tone={item.isNew ? "brass" : "green"}>{item.isNew ? "nuevo" : "existente"}</Badge>
      <div className="flex flex-col items-center">
        <span className="text-[10px]" style={{ color: C.gray }}>{item.unitType === "peso" ? "recibes (kg)" : "recibes"}</span>
        <input type="number" step={item.unitType === "peso" ? "0.001" : "1"} value={item.qty} onChange={e => onChange({ ...item, qty: e.target.value })} className={`${inputCls} font-mono w-16 text-center`} style={inputStyle()} />
      </div>
      <div className="flex flex-col items-center">
        <span className="text-[10px]" style={{ color: C.gray }}>costo neto</span>
        <input type="number" value={item.netCost} onChange={e => onChange({ ...item, netCost: e.target.value })} className={`${inputCls} font-mono w-24 text-center`} style={inputStyle()} />
      </div>
      <div className="flex flex-col items-center">
        {/* Quien recibe la mercadería es quien ve la boleta del proveedor y
            sabe a cuánto conviene venderlo. Puede escribir el precio; si no es
            administrador, queda como propuesta hasta que alguien la apruebe. */}
        <span className="text-[10px]" style={{ color: C.gray }}>{role === "admin" ? "precio de venta" : "precio propuesto"}</span>
        <input type="number" value={item.finalPrice ?? suggested} onChange={e => onChange({ ...item, finalPrice: e.target.value })} className={`${inputCls} font-mono w-24 text-center`} style={{ ...inputStyle(), borderColor: C.brass }} />
      </div>
      <button onClick={onRemove} style={{ color: C.rust }}><Trash2 size={15} /></button>
    </div>
  );
}

// Con qué se paga una recepción de mercadería. "Crédito con el proveedor"
// es la única que no saca plata de caja en el acto: en vez de eso abre un
// cargo en el libro de crédito de ese proveedor (migración 0014), igual que
// "Fiado" en el POS pero en sentido contrario — acá quien queda debiendo es
// el negocio, no el cliente.
const SUPPLIER_PAYMENT_METHODS = ["Efectivo", "Transferencia", "Crédito con el proveedor"];

function ReceivingView({ products, setProducts, movements, setMovements, suppliers, setSuppliers, categories, invoicesIndex, setInvoicesIndex, purchaseItems, setPurchaseItems, supplierLedger, setSupplierLedger, role, session, toast }) {
  const [subTab, setSubTab] = useState("manual");
  const [draftItems, setDraftItems] = useState([]);
  const [supplier, setSupplier] = useState("");
  const [supplierId, setSupplierId] = useState(null);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [quickAddSupplier, setQuickAddSupplier] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Efectivo");
  const [refNumber, setRefNumber] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [invoiceFiles, setInvoiceFiles] = useState([]);
  const [freeEntry, setFreeEntry] = useState(false);
  const [freeEntryReason, setFreeEntryReason] = useState("");
  const [pistolaBarcode, setPistolaBarcode] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const fileInputRef = useRef(null);
  const pistolaInputRef = useRef(null);

  function toggleFreeEntry(v) {
    setFreeEntry(v);
    if (v) { setSubTab("manual"); setInvoiceFiles([]); }
    else { setFreeEntryReason(""); }
  }

  const supplierMatches = useMemo(() => {
    if (supplierQuery.trim().length < 1) return [];
    const q = normalize(supplierQuery);
    return suppliers.filter(s => normalize(s.name).includes(q)).slice(0, 6);
  }, [supplierQuery, suppliers]);

  function pickSupplier(s) {
    setSupplier(s.name); setSupplierId(s.id); setSupplierQuery("");
  }
  function typeSupplier(v) {
    setSupplier(v); setSupplierQuery(v); setSupplierId(null);
  }
  async function saveQuickSupplier(s) {
    const latest = await loadJSON("suppliers", suppliers);
    const ns = [...latest, s];
    setSuppliers(ns); await saveJSON("suppliers", ns);
    setQuickAddSupplier(false);
    pickSupplier(s);
    toast("Proveedor registrado", "success");
  }

  const nameMatches = useMemo(() => {
    if (nameQuery.trim().length < 2) return [];
    const q = normalize(nameQuery);
    return products.filter(p => normalize(p.name).includes(q) || normalize(p.barcode).includes(q)).slice(0, 8);
  }, [nameQuery, products]);

  function addExistingDraft(p) {
    setDraftItems(prev => [...prev, { tempId: uid("draft"), isNew: false, productId: p.id, barcode: p.barcode, name: p.name, category: p.category, qty: 1, netCost: p.cost || 0 }]);
    setNameQuery("");
  }
  function addNewDraft() {
    setDraftItems(prev => [...prev, { tempId: uid("draft"), isNew: true, productId: null, barcode: "", name: "", category: "", qty: 1, netCost: 0, unitType: "unidad" }]);
  }
  function updateDraft(tempId, updated) {
    setDraftItems(prev => prev.map(d => d.tempId === tempId ? updated : d));
  }
  function removeDraft(tempId) {
    setDraftItems(prev => prev.filter(d => d.tempId !== tempId));
  }

  // Mismo criterio que al vender: si el código ya está en el catálogo se suma
  // 1 a la cantidad recibida (o a la fila que ya se había escaneado en esta
  // misma recepción); si no está, queda como producto nuevo con el código ya
  // cargado, listo para completar nombre, categoría, cantidad y costo.
  function handlePistolaScan(code) {
    const clean = code.trim();
    if (!clean) return;
    const found = products.find(p => p.barcode === clean);
    setDraftItems(prev => {
      const idx = found
        ? prev.findIndex(d => !d.isNew && d.productId === found.id)
        : prev.findIndex(d => d.isNew && d.barcode === clean);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: (Number(copy[idx].qty) || 0) + 1 };
        return copy;
      }
      if (found) {
        return [...prev, { tempId: uid("draft"), isNew: false, productId: found.id, barcode: found.barcode, name: found.name, category: found.category, qty: 1, netCost: found.cost || 0 }];
      }
      return [...prev, { tempId: uid("draft"), isNew: true, productId: null, barcode: clean, name: "", category: "", qty: 1, netCost: 0, unitType: "unidad" }];
    });
    toast(found ? `"${found.name}" agregado — revisa cantidad y costo` : `Código ${clean} no está en el catálogo — complétalo como producto nuevo`, "success");
    setPistolaBarcode("");
    setScannerOpen(false);
    pistolaInputRef.current?.focus();
  }

  async function handleAttach(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    try {
      setAttaching(true);
      const attachments = await Promise.all(files.map(f => fileToAttachment(f)));
      setInvoiceFiles(prev => [...prev, ...attachments]);
      toast(attachments.length > 1 ? `${attachments.length} páginas adjuntadas` : "Página adjuntada", "success");
    } catch (err) {
      toast(friendlyError(err, "No se pudo adjuntar el archivo"), "error");
    } finally {
      setAttaching(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }
  function removeInvoicePage(idx) {
    setInvoiceFiles(prev => prev.filter((_, i) => i !== idx));
  }

  async function analyzeAttached() {
    if (invoiceFiles.length === 0 || scanning) return;
    setScanning(true);
    try {
      const items = await analyzeInvoiceImage(invoiceFiles.map(f => ({ mediaType: f.mediaType, data: f.data })));
      if (items.length === 0) { toast("No se detectaron productos en el documento", "error"); return; }
      const mapped = items.map(it => {
        const match = findProductMatch(products, it.name, it.code);
        const detectedUnitType = it.unitType === "peso" ? "peso" : "unidad";
        return match
          ? { tempId: uid("draft"), isNew: false, productId: match.id, barcode: match.barcode, name: match.name, category: match.category, qty: Number(it.quantity) || 1, netCost: Number(it.netUnitPrice) || 0 }
          : { tempId: uid("draft"), isNew: true, productId: null, barcode: it.code || "", name: it.name || "", category: "", qty: Number(it.quantity) || 1, netCost: Number(it.netUnitPrice) || 0, unitType: detectedUnitType };
      });
      setDraftItems(prev => [...prev, ...mapped]);
      const matchedCount = mapped.filter(m => !m.isNew).length;
      toast(`${mapped.length} producto(s) detectados${matchedCount > 0 ? ` (${matchedCount} ya en tu inventario, cantidad sumada)` : ""} — revísalos antes de confirmar`, "success");
    } catch (err) {
      toast(friendlyError(err, "No se pudo analizar el documento"), "error");
    } finally {
      setScanning(false);
    }
  }

  const totals = draftItems.reduce((acc, i) => {
    const qty = Number(i.qty) || 0, cost = Number(i.netCost) || 0;
    return { qty: acc.qty + qty, net: acc.net + qty * cost };
  }, { qty: 0, net: 0 });

  async function confirmReception() {
    if (draftItems.length === 0) return;
    if (freeEntry) {
      if (!freeEntryReason.trim()) return toast("Indica el motivo de la entrada libre", "error");
    } else if (invoiceFiles.length === 0) {
      return toast("Adjunta al menos una foto o PDF de la boleta/factura antes de confirmar", "error");
    }
    for (const it of draftItems) {
      if (!it.name.trim()) return toast("Todos los productos nuevos necesitan un nombre", "error");
      if (!it.qty || Number(it.qty) <= 0) return toast("Revisa las cantidades ingresadas", "error");
    }
    const isCredito = paymentMethod === "Crédito con el proveedor";
    // Sin un proveedor registrado no hay a quién cargarle la deuda: el libro
    // de crédito necesita un proveedor_id real, no solo un nombre escrito.
    if (isCredito && !supplierId) {
      return toast("Para recibir a crédito, el proveedor debe estar registrado — elígelo de la lista o regístralo primero", "error");
    }
    // Se relee lo más reciente del almacenamiento justo antes de guardar, para
    // no partir de una copia local que otro dispositivo ya haya dejado atrás.
    const [latestProducts, latestMovements, latestInvoicesIndex, latestPurchaseItems, latestSupplierLedger] = await Promise.all([
      loadJSON("products-catalog", products),
      loadJSON("movements-log", movements),
      loadJSON("invoices-index", invoicesIndex),
      loadJSON("purchase-items-log", purchaseItems),
      loadJSON("supplier-ledger", supplierLedger),
    ]);
    const date = new Date().toISOString();
    let newProducts = [...latestProducts];

    draftItems.forEach(item => {
      const qty = Number(item.qty) || 0;
      const netCost = Number(item.netCost) || 0;
      const suggested = suggestPrice(netCost);
      if (item.isNew) {
        newProducts.push({
          id: uid("prod"),
          barcode: item.barcode.trim() || `INT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: upperField(item.name),
          category: upperField(item.category),
          // Producto nuevo: entra con el precio que puso quien lo recibió, para
          // que se pueda vender de inmediato. Si no es administrador, ese
          // precio queda además marcado como pendiente de aprobación.
          price: Number(item.finalPrice ?? suggested),
          cost: netCost,
          stock: qty,
          stockZeroSince: qty > 0 ? null : new Date().toISOString(),
          minStock: 5,
          supplierId: supplierId || null,
          unitType: item.unitType || "unidad",
          quickAccess: !item.barcode.trim(),
          priceApproval: role === "admin" ? null : { suggestedPrice: Number(item.finalPrice ?? suggested), netCost, requestedBy: session.name, date, isNewProduct: true },
          priceHistory: [{ date, cost: netCost, price: Number(item.finalPrice ?? suggested) }],
        });
      } else {
        newProducts = newProducts.map(p => {
          if (p.id !== item.productId) return p;
          const updated = { ...p, stock: p.stock + qty, cost: netCost, stockZeroSince: nextStockZeroSince(p.stock, p.stockZeroSince, p.stock + qty) };
          if (!updated.supplierId && supplierId) updated.supplierId = supplierId;
          if (role === "admin") {
            updated.price = Number(item.finalPrice ?? suggested);
            updated.priceApproval = null;
          } else {
            // Producto que ya se vendía: el precio en vitrina no cambia hasta
            // que un administrador apruebe. Lo que se guarda es la propuesta.
            updated.priceApproval = { suggestedPrice: Number(item.finalPrice ?? suggested), netCost, requestedBy: session.name, date };
          }
          updated.priceHistory = pushPriceHistory(p.priceHistory, netCost, updated.price);
          return updated;
        });
      }
    });

    const totalGross = totals.net * 1.19;
    const invoiceId = uid("inv");
    const supplierName = supplier.trim() || "Sin proveedor";

    // A crédito: la mercadería entra igual, pero la plata no sale de caja
    // todavía — no hay egreso que registrar en el acto. En su lugar se abre
    // un cargo en el libro de crédito del proveedor (más abajo), el mismo
    // criterio que una venta fiada no genera un ingreso hasta que se abona.
    const newMovements = isCredito ? latestMovements : [{
      id: uid("mov"), date, type: "egreso",
      concept: freeEntry
        ? `Entrada libre (sin boleta/factura): ${freeEntryReason.trim()}${supplier.trim() ? ` — ${supplierName}` : ""}`
        : `Recepción de pedido: ${supplierName}${refNumber.trim() ? ` (Doc ${refNumber.trim()})` : ""}`,
      amount: totalGross,
      category: freeEntry ? "Entrada libre" : "Compra de mercadería",
      auto: true,
      supplierId: supplierId || null, invoiceId,
    }, ...latestMovements];

    const invoiceRecord = {
      id: invoiceId, date, supplierId: supplierId || null, supplierName,
      refNumber: freeEntry ? null : (refNumber.trim() || null),
      itemCount: draftItems.length, totalNet: totals.net, totalGross,
      registeredBy: session.name,
      noDocument: freeEntry,
      reason: freeEntry ? freeEntryReason.trim() : null,
      paymentMethod,
    };
    const newInvoicesIndex = [invoiceRecord, ...latestInvoicesIndex];

    const newSupplierLedger = isCredito ? [{
      id: uid("provmov"), supplierId, type: "cargo",
      amount: totalGross, date, invoiceId, paymentMethod: null, note: "",
    }, ...latestSupplierLedger] : latestSupplierLedger;

    const newPurchaseItems = [
      ...draftItems.map(item => ({
        id: uid("pi"), date, invoiceId,
        supplierId: supplierId || null, supplierName,
        // El producto nuevo ya se creó en esta misma recepción con un id
        // conocido: guardarlo permite comparar precios entre proveedores desde
        // la primera compra, en vez de perder el vínculo.
        productId: item.productId,
        productName: item.name.trim(),
        qty: Number(item.qty) || 0, netCost: Number(item.netCost) || 0,
      })),
      ...latestPurchaseItems,
    ];

    setProducts(newProducts); setMovements(newMovements);
    setInvoicesIndex(newInvoicesIndex); setPurchaseItems(newPurchaseItems);
    setSupplierLedger(newSupplierLedger);
    // El orden importa: las líneas de compra, las fotos y el asiento de caja
    // apuntan al documento, así que el documento va primero. Antes se guardaba
    // todo en paralelo porque no había relaciones que respetar.
    await saveJSON("invoices-index", newInvoicesIndex);
    await saveJSON("products-catalog", newProducts, { origen: "recepcion" });
    await saveJSON("purchase-items-log", newPurchaseItems);
    // A crédito no hay egreso nuevo que guardar (newMovements quedó igual a
    // lo que ya había): se guarda el cargo en el libro de crédito en su
    // lugar. Al contado/transferencia es al revés — no hay ledger que tocar.
    if (isCredito) await saveJSON("supplier-ledger", newSupplierLedger);
    else await saveJSON("movements-log", newMovements);
    if (!freeEntry) {
      await saveJSON(`invoice-image:${invoiceId}`, { pages: invoiceFiles.map(f => ({ mediaType: f.mediaType, dataUrl: f.dataUrl, name: f.name })) });
    }

    toast(
      freeEntry
        ? "Entrada libre registrada — queda marcada como excepción sin documento"
        : `Recepción registrada${isCredito ? ` — queda a crédito con ${supplierName}` : ""}${role !== "admin" ? " · precios a la espera de aprobación" : ""}`,
      "success"
    );
    setDraftItems([]); setSupplier(""); setSupplierId(null); setRefNumber(""); setInvoiceFiles([]); setFreeEntry(false); setFreeEntryReason(""); setPaymentMethod("Efectivo");
  }


  return (
    <div>
      {role === "admin" && <ApprovalsPanel products={products} setProducts={setProducts} toast={toast} />}

      <div className="rounded-xl p-4 mb-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div className="relative">
            <Field label="Proveedor"><input value={supplier} onChange={e => typeSupplier(e.target.value)} className={inputCls} style={inputStyle()} placeholder="Busca o escribe el nombre del proveedor" /></Field>
            {supplierId && <span className="absolute right-2 top-[30px]"><Badge tone="green">registrado</Badge></span>}
            {supplierMatches.length > 0 && (
              <div className="absolute z-10 left-0 right-0 -mt-2 rounded-lg overflow-hidden shadow-lg" style={{ border: `1.5px solid ${C.paperLine}`, background: "#fff" }}>
                {supplierMatches.map(s => (
                  <button key={s.id} onClick={() => pickSupplier(s)} className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-black/[.03] text-left" style={{ borderBottom: `1px solid ${C.paperLine}` }}>
                    <span style={{ color: C.ink }}>{s.name}</span>
                    {s.category && <span className="text-xs" style={{ color: C.gray }}>{s.category}</span>}
                  </button>
                ))}
                {role === "admin" && (
                  <button onClick={() => setQuickAddSupplier(true)} className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium hover:bg-black/[.03] text-left" style={{ color: C.green }}>
                    <Plus size={12} /> Registrar "{supplier}" como proveedor nuevo
                  </button>
                )}
              </div>
            )}
          </div>
          <Field label="N° de factura o boleta (opcional)"><input value={refNumber} onChange={e => setRefNumber(e.target.value)} disabled={freeEntry} className={`${inputCls} font-mono`} style={{ ...inputStyle(), opacity: freeEntry ? 0.5 : 1 }} placeholder="Ej. 001234" /></Field>
        </div>

        <div className="mb-3">
          <div className="text-xs font-medium mb-1.5" style={{ color: C.ink }}>¿Cómo se pagó esta recepción?</div>
          <div className="flex gap-1.5">
            {SUPPLIER_PAYMENT_METHODS.map(m => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className="flex-1 py-2 rounded-lg text-xs font-medium"
                style={paymentMethod === m
                  ? { background: m === "Crédito con el proveedor" ? C.brass : C.ink, color: m === "Crédito con el proveedor" ? C.brassText : C.paper }
                  : { background: C.paperDark, color: C.gray }}
              >
                {m === "Crédito con el proveedor" ? "Crédito con proveedor" : m}
              </button>
            ))}
          </div>
          {paymentMethod === "Crédito con el proveedor" && (
            <p className="text-[11px] mt-1.5" style={{ color: C.brassText }}>
              La mercadería entra al stock igual, pero no se registra como gasto de caja: queda anotada como deuda con {supplier.trim() || "el proveedor"} hasta que se le pague — ver Proveedores.
            </p>
          )}
        </div>

        <label className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 mb-3 cursor-pointer" style={{ background: freeEntry ? C.rustSoft : C.paperDark, border: `1.5px solid ${freeEntry ? C.rust : C.paperLine}` }}>
          <input type="checkbox" checked={freeEntry} onChange={e => toggleFreeEntry(e.target.checked)} className="mt-0.5" />
          <div>
            <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: freeEntry ? C.rust : C.ink }}><AlertTriangle size={13} />Entrada libre — recibir sin boleta ni factura</span>
            <p className="text-[11px] mt-0.5" style={{ color: freeEntry ? C.rust : C.gray }}>Excepción solo para casos aislados donde de verdad no fue posible obtener el documento. Queda registrada igual, marcada como "sin documento".</p>
          </div>
        </label>

        {freeEntry ? (
          <div className="rounded-lg p-3 mb-3" style={{ background: C.rustSoft, border: `1.5px solid ${C.rust}` }}>
            <Field label="Motivo de la entrada libre (obligatorio)"><input autoFocus value={freeEntryReason} onChange={e => setFreeEntryReason(e.target.value)} className={inputCls} style={inputStyle()} placeholder="Ej. Proveedor informal, compra urgente sin boleta…" /></Field>
          </div>
        ) : (
          <div className="rounded-lg p-3 mb-3" style={{ background: C.paperDark, border: `1.5px solid ${C.paperLine}` }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: C.ink }}><Receipt size={13} />Foto(s) de la boleta/factura <span style={{ color: C.rust }}>*obligatoria</span></span>
              {invoiceFiles.length > 0 && <Badge tone="green">{invoiceFiles.length} página{invoiceFiles.length > 1 ? "s" : ""}</Badge>}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple onChange={handleAttach} className="hidden" />
            {invoiceFiles.length > 0 && (
              <div className="flex gap-2 overflow-x-auto mb-2 pb-1">
                {invoiceFiles.map((f, idx) => (
                  <div key={idx} className="relative flex-shrink-0" style={{ width: 90 }}>
                    {f.mediaType === "application/pdf" ? (
                      <div className="rounded-lg flex flex-col items-center justify-center gap-1 p-2" style={{ width: 90, height: 90, background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
                        <Receipt size={18} style={{ color: C.gray }} />
                        <span className="text-[9px] text-center truncate w-full" style={{ color: C.gray }}>{f.name}</span>
                      </div>
                    ) : (
                      <img src={f.dataUrl} alt={`Página ${idx + 1}`} className="rounded-lg object-cover" style={{ width: 90, height: 90, border: `1.5px solid ${C.paperLine}` }} />
                    )}
                    <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: C.ink, color: C.paper }}>{idx + 1}</span>
                    <button onClick={() => removeInvoicePage(idx)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: C.rust, color: "#fff" }}><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
            <Btn variant="dark" size="sm" icon={attaching ? Loader2 : ImagePlus} disabled={attaching} onClick={() => fileInputRef.current?.click()} full>
              {attaching ? "Procesando…" : invoiceFiles.length > 0 ? "Agregar otra página" : "Tomar foto o subir la boleta/factura"}
            </Btn>
            <p className="text-[11px] mt-1.5" style={{ color: C.gray }}>Si la factura tiene más de una página, agrega cada una como una página aparte — se leen y catalogan juntas como un solo documento.</p>
          </div>
        )}

        {!freeEntry && (
          <div className="flex gap-1.5 mb-3">
            <button onClick={() => setSubTab("manual")} className="flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5" style={subTab === "manual" ? { background: C.ink, color: C.paper } : { background: C.paperDark, color: C.gray }}><Package size={15} />Ingreso manual</button>
            <button onClick={() => setSubTab("pistola")} className="flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5" style={subTab === "pistola" ? { background: C.ink, color: C.paper } : { background: C.paperDark, color: C.gray }}><ScanLine size={15} />Pistola</button>
            <button onClick={() => setSubTab("scan")} className="flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5" style={subTab === "scan" ? { background: C.ink, color: C.paper } : { background: C.paperDark, color: C.gray }}><Sparkles size={15} />Leer con IA</button>
          </div>
        )}

        {subTab === "manual" || freeEntry ? (
          <div>
            <div className="relative mb-2">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.gray }} />
              <input value={nameQuery} onChange={e => setNameQuery(e.target.value)} placeholder="Busca un producto existente por nombre o código…" className={`${inputCls} pl-9`} style={inputStyle()} />
              {nameMatches.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1.5 rounded-lg overflow-hidden shadow-lg" style={{ border: `1.5px solid ${C.paperLine}`, background: "#fff" }}>
                  {nameMatches.map(p => (
                    <button key={p.id} onClick={() => addExistingDraft(p)} className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-black/[.03] text-left" style={{ borderBottom: `1px solid ${C.paperLine}` }}>
                      <span style={{ color: C.ink }}>{p.name}</span>
                      <span className="text-xs font-mono" style={{ color: C.gray }}>stock {p.stock}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Btn variant="ghost" size="sm" icon={Plus} onClick={addNewDraft}>Producto nuevo (no está en el catálogo)</Btn>
          </div>
        ) : subTab === "pistola" ? (
          <div>
            <div className="relative mb-2">
              <ScanLine size={18} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.green }} />
              <input
                ref={pistolaInputRef} autoFocus value={pistolaBarcode} onChange={e => setPistolaBarcode(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handlePistolaScan(pistolaBarcode); }}
                placeholder="Escanea con la pistola, o escribe el código y presiona Enter…"
                aria-label="Código de barras"
                className={`${inputCls} pl-9`} style={inputStyle()}
              />
            </div>
            <Btn variant="dark" size="sm" icon={Camera} onClick={() => setScannerOpen(true)} full>Escanear con la cámara del dispositivo</Btn>
            <p className="text-xs mt-2" style={{ color: C.gray }}>Cada código escaneado se agrega solo a la lista de abajo: si el producto ya existe en el catálogo, se suma 1 a la cantidad recibida; si no existe, queda como producto nuevo con el código ya cargado — solo falta completar nombre, categoría, cantidad y costo.</p>
          </div>
        ) : (
          <div>
            <Btn variant="dark" icon={scanning ? Loader2 : Sparkles} disabled={scanning || invoiceFiles.length === 0} onClick={analyzeAttached} full>
              {scanning ? `Analizando ${invoiceFiles.length > 1 ? `${invoiceFiles.length} páginas` : "con IA"}…` : `Analizar ${invoiceFiles.length > 1 ? `las ${invoiceFiles.length} páginas` : "la boleta/factura adjuntada"}`}
            </Btn>
            {invoiceFiles.length === 0 && <p className="text-xs mt-2 text-center" style={{ color: C.gray }}>Primero adjunta la foto o PDF arriba.</p>}
            <p className="text-xs mt-2" style={{ color: C.gray }}>La IA lee el formato de factura electrónica del SII, incluyendo el código de barras cuando aparece antes del nombre del producto: detecta productos, cantidades y precios netos, y si un producto ya está en tu inventario, suma la cantidad recibida en vez de duplicarlo. Siempre revisa los datos antes de confirmar — la lectura automática puede tener errores.</p>
          </div>
        )}
      </div>

      {draftItems.length > 0 && (
        <div className="rounded-xl overflow-hidden mb-3" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: C.paperDark }}>
            <span className="text-sm font-semibold" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Productos a recibir ({draftItems.length})</span>
            <span className="text-xs font-mono" style={{ color: C.gray }}>{totals.qty} unid. · neto {formatCLP(totals.net)} · con IVA {formatCLP(totals.net * 1.19)}</span>
          </div>
          <div>
            {draftItems.map(item => (
              <DraftRow key={item.tempId} item={item} role={role} products={products} categories={categories} onChange={upd => updateDraft(item.tempId, upd)} onRemove={() => removeDraft(item.tempId)} />
            ))}
          </div>
        </div>
      )}

      {draftItems.length > 0 && (
        <Btn full variant={freeEntry ? "rust" : "primary"} icon={freeEntry ? AlertTriangle : Truck} onClick={confirmReception}>
          {freeEntry ? `Confirmar entrada libre de ${draftItems.length} producto(s)` : `Confirmar recepción de ${draftItems.length} producto(s)`}
        </Btn>
      )}
      {draftItems.length === 0 && (
        <EmptyState icon={Truck} title="Sin productos por recibir" hint="Adjunta la foto de la boleta/factura y luego busca productos existentes, agrega uno nuevo, escanéalos con la pistola, o analiza el documento con IA para cargarlos automáticamente. Para casos aislados sin documento, usa 'Entrada libre'." />
      )}

      {role !== "admin" && (
        <p className="text-xs mt-3 text-center" style={{ color: C.grayLight }}>El stock se actualiza al confirmar. Los precios sugeridos quedan a la espera de aprobación de un administrador.</p>
      )}

      {quickAddSupplier && <SupplierModal initial={{ name: supplier }} onClose={() => setQuickAddSupplier(false)} onSave={saveQuickSupplier} />}
      {scannerOpen && <CameraScanner onDetect={handlePistolaScan} onClose={() => setScannerOpen(false)} />}
    </div>
  );
}


/* ---------------------------------------------------------
   CAJA — APERTURA, RETIROS Y CIERRE
   Una sola caja compartida por todo el equipo (no una por persona): quien
   abre registra la dotación inicial y desde ahí cualquier vendedor puede
   cobrar. Cada venta ya sabe quién la hizo —cada uno entra con su propia
   cuenta—, así que las ventas del turno se suman todas (se filtran solo por
   fecha desde la apertura, sin importar quién vendió) y al cerrar se arma un
   desglose de cuánto vendió cada persona, además de comparar el efectivo
   esperado contra el contado para la cuadratura común.
--------------------------------------------------------- */
const PAYMENT_METHODS = ["Efectivo", "Débito", "Crédito", "Transferencia", "Fiado"];

function WithdrawalModal({ onClose, onConfirm }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  return (
    <Modal title="Registrar retiro de caja" onClose={onClose}>
      <Field label="Monto retirado"><input autoFocus type="number" value={amount} onChange={e => setAmount(e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} placeholder="0" /></Field>
      <Field label="Motivo (opcional)"><input value={reason} onChange={e => setReason(e.target.value)} className={inputCls} style={inputStyle()} placeholder="Ej. Depósito al banco, resguardo…" /></Field>
      <Btn full icon={Check} disabled={!amount || Number(amount) <= 0} onClick={() => onConfirm(Number(amount), reason.trim())}>Confirmar retiro</Btn>
    </Modal>
  );
}

function ReinforcementModal({ onClose, onConfirm }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  return (
    <Modal title="Agregar refuerzo de caja" onClose={onClose}>
      <p className="text-xs mb-3" style={{ color: C.gray }}>Usa esto cuando el cajero se queda sin efectivo para dar vuelto y necesita que le sumen dinero a la caja.</p>
      <Field label="Monto que se agrega"><input autoFocus type="number" value={amount} onChange={e => setAmount(e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} placeholder="0" /></Field>
      <Field label="Motivo (opcional)"><input value={reason} onChange={e => setReason(e.target.value)} className={inputCls} style={inputStyle()} placeholder="Ej. Falta de sencillo para vuelto…" /></Field>
      <Btn full icon={Check} disabled={!amount || Number(amount) <= 0} onClick={() => onConfirm(Number(amount), reason.trim())}>Confirmar refuerzo</Btn>
    </Modal>
  );
}

function ShiftHistory({ shiftsLog, onView }) {
  if (shiftsLog.length === 0) return null;
  return (
    <div className="rounded-xl overflow-hidden mt-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
      <div className="px-4 py-2.5 text-sm font-semibold" style={{ background: C.paperDark, color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Historial de cierres</div>
      <div className="divide-y" style={{ borderColor: C.paperLine }}>
        {shiftsLog.slice(0, 15).map(s => (
          <button key={s.id} onClick={() => onView(s)} className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-black/[.02]">
            <div>
              <div className="text-sm font-medium" style={{ color: C.ink }}>{s.closedBy} · {formatDate(s.closedAt)}</div>
              <div className="text-xs" style={{ color: C.gray }}>Ventas {formatCLP(s.salesTotal)} · dotación {formatCLP(s.openingAmount)}</div>
            </div>
            <Badge tone={s.difference === 0 ? "green" : "rust"}>{s.difference === 0 ? "Cuadrada" : s.difference > 0 ? `+${formatCLP(s.difference)}` : `−${formatCLP(Math.abs(s.difference))}`}</Badge>
          </button>
        ))}
      </div>
    </div>
  );
}

function ShiftDetailModal({ shift, onClose }) {
  return (
    <Modal title="Detalle de cierre de caja" onClose={onClose}>
      <div className="text-sm space-y-2">
        <div className="flex justify-between"><span style={{ color: C.gray }}>Abierta por</span><span>{shift.openedBy} · {formatDate(shift.openedAt)}</span></div>
        <div className="flex justify-between"><span style={{ color: C.gray }}>Cerrada por</span><span>{shift.closedBy} · {formatDate(shift.closedAt)}</span></div>
        <div className="pt-2 space-y-0.5" style={{ borderTop: `1px dashed ${C.paperLine}` }}>
          {PAYMENT_METHODS.map(m => (
            <div key={m} className="flex justify-between text-xs"><span style={{ color: C.gray }}>{m}</span><span className="font-mono">{formatCLP(shift.salesByMethod[m] || 0)}</span></div>
          ))}
        </div>
        <div className="flex justify-between font-semibold pt-2" style={{ borderTop: `1px dashed ${C.paperLine}` }}><span>Total ventas ({shift.salesCount})</span><span className="font-mono">{formatCLP(shift.salesTotal)}</span></div>
        {(shift.salesBySeller || []).length > 0 && (
          <div className="pt-1 pb-1 space-y-0.5">
            <div className="text-xs font-semibold" style={{ color: C.gray }}>Desglose por vendedor</div>
            {shift.salesBySeller.map(v => (
              <div key={v.seller} className="flex justify-between text-xs">
                <span style={{ color: C.ink }}>{v.seller} · {v.count} venta{v.count === 1 ? "" : "s"}</span>
                <span className="font-mono">{formatCLP(v.total)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-between"><span style={{ color: C.gray }}>Dotación inicial</span><span className="font-mono">{formatCLP(shift.openingAmount)}</span></div>
        <div className="flex justify-between"><span style={{ color: C.gray }}>Refuerzos ({(shift.reinforcements || []).length})</span><span className="font-mono">+{formatCLP(shift.reinforcementsTotal || 0)}</span></div>
        {(shift.reinforcements || []).length > 0 && (
          <div className="pl-3 space-y-0.5">
            {shift.reinforcements.map(r => (
              <div key={r.id} className="flex justify-between text-xs"><span style={{ color: C.gray }}>{r.reason || "Refuerzo"} · {r.by}</span><span className="font-mono">+{formatCLP(r.amount)}</span></div>
            ))}
          </div>
        )}
        <div className="flex justify-between"><span style={{ color: C.gray }}>Retiros ({shift.withdrawals.length})</span><span className="font-mono">−{formatCLP(shift.withdrawalsTotal)}</span></div>
        {shift.withdrawals.length > 0 && (
          <div className="pl-3 space-y-0.5">
            {shift.withdrawals.map(w => (
              <div key={w.id} className="flex justify-between text-xs"><span style={{ color: C.gray }}>{w.reason || "Retiro"} · {w.by}</span><span className="font-mono">−{formatCLP(w.amount)}</span></div>
            ))}
          </div>
        )}
        <div className="flex justify-between pt-2" style={{ borderTop: `1px dashed ${C.paperLine}` }}><span style={{ color: C.gray }}>Efectivo esperado</span><span className="font-mono">{formatCLP(shift.expectedCash)}</span></div>
        <div className="flex justify-between"><span style={{ color: C.gray }}>Efectivo contado</span><span className="font-mono">{formatCLP(shift.countedCash)}</span></div>
        <div className="flex justify-between font-semibold pt-2" style={{ borderTop: `1px dashed ${C.paperLine}`, color: shift.difference === 0 ? C.greenDark : C.rust }}>
          <span>{shift.difference === 0 ? "Cuadratura exacta" : shift.difference > 0 ? "Sobrante" : "Faltante"}</span>
          <span className="font-mono">{formatCLP(Math.abs(shift.difference))}</span>
        </div>
      </div>
    </Modal>
  );
}

function CajaView({ sales, openShifts, setOpenShifts, shiftsLog, setShiftsLog, session, role, toast }) {
  const [openingAmount, setOpeningAmount] = useState("");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [reinforceOpen, setReinforceOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const [viewingShift, setViewingShift] = useState(null);

  // Caja única para todo el equipo: no importa quién la abrió, cualquier
  // vendedor cobra con ella hasta que alguien la cierra. Si por el cambio de
  // modelo quedó más de una caja individual abierta de antes, se combinan acá
  // en una sola vista (la más antigua manda la fecha de apertura) para no
  // perder el rastro del efectivo — se cierran todas juntas al hacer el cierre.
  const sharedShift = useMemo(() => {
    if (openShifts.length === 0) return null;
    const sorted = [...openShifts].sort((a, b) => new Date(a.openedAt) - new Date(b.openedAt));
    if (sorted.length === 1) return sorted[0];
    const [primary, ...extra] = sorted;
    return {
      ...primary,
      _allIds: sorted.map(s => s.id),
      openedBy: [...new Set(sorted.map(s => s.openedBy))].join(", "),
      openingAmount: sorted.reduce((a, s) => a + s.openingAmount, 0),
      withdrawals: sorted.flatMap(s => s.withdrawals || []),
      reinforcements: sorted.flatMap(s => s.reinforcements || []),
    };
  }, [openShifts]);

  async function persistOpenShifts(next) {
    setOpenShifts(next);
    await saveJSON("open-shifts", next);
  }

  async function openShift() {
    if (sharedShift) return;
    if (openingAmount === "" || Number(openingAmount) < 0) return toast("Ingresa el monto de dotación inicial", "error");
    const shift = {
      id: uid("shift"), openedBy: session.name, openedByRole: session.role,
      openedAt: new Date().toISOString(), openingAmount: Number(openingAmount),
      withdrawals: [], reinforcements: [], status: "open",
    };
    const latest = await loadJSON("open-shifts", openShifts);
    if (latest.length > 0) return toast("Ya hay una caja abierta", "error");
    await persistOpenShifts([...latest, shift]);
    setOpeningAmount("");
    toast("Caja abierta", "success");
  }

  const shiftSalesList = useMemo(() => {
    if (!sharedShift) return [];
    const start = new Date(sharedShift.openedAt).getTime();
    // Todas las ventas del turno cuentan, sin importar quién las hizo — es
    // una sola caja compartida. Quién vendió cada una ya quedó guardado en
    // la venta misma (cada vendedor entra con su propia cuenta al sistema).
    return sales.filter(s => new Date(s.date).getTime() >= start);
  }, [sales, sharedShift]);

  const summary = useMemo(() => {
    // "Fiado" cuenta como venta del turno (para el total), pero no aporta
    // efectivo: expectedCash de más abajo solo suma byMethod.Efectivo, así
    // que una venta fiada nunca infla el efectivo esperado en caja. Ojo: el
    // desglose por método que se guarda al cerrar la caja (turnosCerrados,
    // operacion.js) solo tiene columna propia para los cuatro métodos de
    // siempre — el total del cierre SÍ incluye lo fiado, pero si se vuelve a
    // abrir un cierre ya guardado, esta línea puntual se ve en 0. No se
    // agregó esa columna para no arriesgar romper el cierre de caja (una
    // función crítica) si la migración 0012 aún no está aplicada.
    const byMethod = { Efectivo: 0, "Débito": 0, "Crédito": 0, Transferencia: 0, Fiado: 0 };
    shiftSalesList.forEach(s => { byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] || 0) + s.total; });
    const total = shiftSalesList.reduce((a, s) => a + s.total, 0);
    return { byMethod, total, count: shiftSalesList.length };
  }, [shiftSalesList]);

  const salesBySeller = useMemo(() => {
    const map = {};
    shiftSalesList.forEach(s => {
      const key = s.seller || "Sin nombre";
      if (!map[key]) map[key] = { seller: key, count: 0, total: 0 };
      map[key].count += 1;
      map[key].total += s.total;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [shiftSalesList]);

  const withdrawalsTotal = (sharedShift?.withdrawals || []).reduce((s, w) => s + w.amount, 0);
  const reinforcementsTotal = (sharedShift?.reinforcements || []).reduce((s, r) => s + r.amount, 0);
  const expectedCash = sharedShift ? sharedShift.openingAmount + summary.byMethod.Efectivo + reinforcementsTotal - withdrawalsTotal : 0;

  async function registerWithdrawal(amount, reason) {
    const w = { id: uid("wd"), amount, reason, date: new Date().toISOString(), by: session.name };
    const latest = await loadJSON("open-shifts", openShifts);
    const primary = [...latest].sort((a, b) => new Date(a.openedAt) - new Date(b.openedAt))[0];
    if (!primary) return;
    const updated = { ...primary, withdrawals: [...(primary.withdrawals || []), w] };
    await persistOpenShifts(latest.map(s => s.id === primary.id ? updated : s));
    setWithdrawOpen(false);
    toast("Retiro registrado", "success");
  }

  async function registerReinforcement(amount, reason) {
    const r = { id: uid("rf"), amount, reason, date: new Date().toISOString(), by: session.name };
    const latest = await loadJSON("open-shifts", openShifts);
    const primary = [...latest].sort((a, b) => new Date(a.openedAt) - new Date(b.openedAt))[0];
    if (!primary) return;
    const updated = { ...primary, reinforcements: [...(primary.reinforcements || []), r] };
    await persistOpenShifts(latest.map(s => s.id === primary.id ? updated : s));
    setReinforceOpen(false);
    toast("Refuerzo agregado a la caja", "success");
  }

  async function confirmClose() {
    if (countedCash === "") return toast("Ingresa el efectivo contado en caja", "error");
    if (!sharedShift) return;
    const closedAt = new Date().toISOString();
    const record = {
      id: sharedShift.id,
      openedBy: sharedShift.openedBy, openedAt: sharedShift.openedAt,
      closedBy: session.name, closedAt,
      openingAmount: sharedShift.openingAmount,
      salesByMethod: summary.byMethod, salesTotal: summary.total, salesCount: summary.count,
      salesBySeller,
      withdrawals: sharedShift.withdrawals, withdrawalsTotal,
      reinforcements: sharedShift.reinforcements || [], reinforcementsTotal,
      expectedCash, countedCash: Number(countedCash),
      difference: Number(countedCash) - expectedCash,
    };
    const closingIds = sharedShift._allIds || [sharedShift.id];
    const latestLog = await loadJSON("shifts-log", shiftsLog);
    const latestOpen = await loadJSON("open-shifts", openShifts);
    const newLog = [record, ...latestLog];
    const newOpenShifts = latestOpen.filter(s => !closingIds.includes(s.id));
    setShiftsLog(newLog);
    await saveJSON("shifts-log", newLog);
    await persistOpenShifts(newOpenShifts);
    setClosing(false); setCountedCash("");
    toast("Caja cerrada correctamente", "success");
  }

  if (!sharedShift) {
    return (
      <div className="max-w-md mx-auto">
        <div className="rounded-xl p-5" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: C.greenSoft }}><Unlock size={18} style={{ color: C.green }} /></div>
            <div>
              <h3 className="font-semibold text-sm" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Apertura de caja</h3>
              <p className="text-xs" style={{ color: C.gray }}>Es una sola caja para todo el equipo — ingresa el efectivo con el que parte el turno, {session.name}</p>
            </div>
          </div>
          <Field label="Monto de dotación inicial"><input autoFocus type="number" value={openingAmount} onChange={e => setOpeningAmount(e.target.value)} onKeyDown={e => e.key === "Enter" && openShift()} className={`${inputCls} font-mono`} style={inputStyle()} placeholder="0" /></Field>
          <Btn full icon={Unlock} onClick={openShift}>Abrir caja</Btn>
        </div>
        <ShiftHistory shiftsLog={shiftsLog} onView={setViewingShift} />
        {viewingShift && <ShiftDetailModal shift={viewingShift} onClose={() => setViewingShift(null)} />}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: C.ink }}>
        <div>
          <div className="text-xs" style={{ color: C.grayLight }}>Caja del equipo, abierta desde</div>
          <div className="text-sm font-semibold" style={{ color: C.paper }}>{sharedShift.openedBy} · {formatDate(sharedShift.openedAt)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs" style={{ color: C.grayLight }}>Dotación inicial</div>
          <div className="font-mono font-semibold" style={{ color: C.brass }}>{formatCLP(sharedShift.openingAmount)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {PAYMENT_METHODS.map(method => (
          <div key={method} className="rounded-xl p-3.5" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
            <div className="text-xs mb-1" style={{ color: C.gray }}>{method}</div>
            <div className="font-mono font-semibold" style={{ color: C.ink }}>{formatCLP(summary.byMethod[method] || 0)}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl p-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
        <div className="flex justify-between text-sm mb-1"><span style={{ color: C.gray }}>Ventas del turno ({summary.count})</span><span className="font-mono font-semibold" style={{ color: C.greenDark }}>{formatCLP(summary.total)}</span></div>
        <div className="flex justify-between text-sm mb-1"><span style={{ color: C.gray }}>Refuerzos ({(sharedShift.reinforcements || []).length})</span><span className="font-mono font-semibold" style={{ color: C.brassText }}>+{formatCLP(reinforcementsTotal)}</span></div>
        <div className="flex justify-between text-sm mb-1"><span style={{ color: C.gray }}>Retiros ({sharedShift.withdrawals.length})</span><span className="font-mono font-semibold" style={{ color: C.rust }}>−{formatCLP(withdrawalsTotal)}</span></div>
        <div className="flex justify-between text-base font-semibold pt-2 mt-2" style={{ borderTop: `1px dashed ${C.paperLine}`, color: C.ink }}><span>Efectivo esperado en caja</span><span className="font-mono">{formatCLP(expectedCash)}</span></div>
      </div>

      {salesBySeller.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: C.paperDark }}>
            <Users size={15} style={{ color: C.gray }} />
            <span className="text-sm font-semibold" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Desglose por vendedor</span>
          </div>
          <div className="divide-y" style={{ borderColor: C.paperLine }}>
            {salesBySeller.map(v => (
              <div key={v.seller} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <span className="text-sm truncate" style={{ color: C.ink }}>{v.seller}</span>
                <span className="text-xs flex-shrink-0" style={{ color: C.gray }}>{v.count} venta{v.count === 1 ? "" : "s"}</span>
                <span className="font-mono font-semibold text-sm flex-shrink-0" style={{ color: C.greenDark }}>{formatCLP(v.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(sharedShift.reinforcements || []).length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <div className="px-4 py-2 text-xs font-semibold" style={{ background: C.paperDark, color: C.gray }}>Refuerzos del turno</div>
          <div className="divide-y" style={{ borderColor: C.paperLine }}>
            {sharedShift.reinforcements.map(r => (
              <div key={r.id} className="px-4 py-2 flex justify-between text-sm">
                <span style={{ color: C.ink }}>{r.reason || "Refuerzo de caja"} <span className="text-xs" style={{ color: C.gray }}>· {formatDate(r.date)} · {r.by}</span></span>
                <span className="font-mono" style={{ color: C.brassText }}>+{formatCLP(r.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {sharedShift.withdrawals.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <div className="px-4 py-2 text-xs font-semibold" style={{ background: C.paperDark, color: C.gray }}>Retiros del turno</div>
          <div className="divide-y" style={{ borderColor: C.paperLine }}>
            {sharedShift.withdrawals.map(w => (
              <div key={w.id} className="px-4 py-2 flex justify-between text-sm">
                <span style={{ color: C.ink }}>{w.reason || "Retiro de efectivo"} <span className="text-xs" style={{ color: C.gray }}>· {formatDate(w.date)} · {w.by}</span></span>
                <span className="font-mono" style={{ color: C.rust }}>−{formatCLP(w.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Btn variant="ghost" full icon={ArrowUpCircle} onClick={() => setReinforceOpen(true)}>Agregar refuerzo</Btn>
        <Btn variant="ghost" full icon={ArrowDownCircle} onClick={() => setWithdrawOpen(true)}>Registrar retiro</Btn>
      </div>
      <Btn variant="rust" full icon={Lock} onClick={() => { setClosing(true); setCountedCash(""); }}>Cerrar caja</Btn>

      <ShiftHistory shiftsLog={shiftsLog} onView={setViewingShift} />
      {viewingShift && <ShiftDetailModal shift={viewingShift} onClose={() => setViewingShift(null)} />}
      {withdrawOpen && <WithdrawalModal onClose={() => setWithdrawOpen(false)} onConfirm={registerWithdrawal} />}
      {reinforceOpen && <ReinforcementModal onClose={() => setReinforceOpen(false)} onConfirm={registerReinforcement} />}

      {closing && (
        <Modal title="Cierre de caja" onClose={() => setClosing(false)}>
          <div className="rounded-lg p-3 mb-3 space-y-1 text-sm" style={{ background: C.paperDark }}>
            <div className="flex justify-between"><span style={{ color: C.gray }}>Dotación inicial</span><span className="font-mono">{formatCLP(sharedShift.openingAmount)}</span></div>
            <div className="flex justify-between"><span style={{ color: C.gray }}>+ Ventas en efectivo</span><span className="font-mono">{formatCLP(summary.byMethod.Efectivo)}</span></div>
            <div className="flex justify-between"><span style={{ color: C.gray }}>+ Refuerzos</span><span className="font-mono">{formatCLP(reinforcementsTotal)}</span></div>
            <div className="flex justify-between"><span style={{ color: C.gray }}>− Retiros</span><span className="font-mono">{formatCLP(withdrawalsTotal)}</span></div>
            <div className="flex justify-between font-semibold pt-1" style={{ borderTop: `1px dashed ${C.paperLine}` }}><span>= Efectivo esperado</span><span className="font-mono">{formatCLP(expectedCash)}</span></div>
          </div>
          {salesBySeller.length > 0 && (
            <div className="rounded-lg p-3 mb-3 space-y-1 text-sm" style={{ background: C.paperDark }}>
              <div className="text-xs font-semibold mb-1" style={{ color: C.gray }}>Desglose por vendedor</div>
              {salesBySeller.map(v => (
                <div key={v.seller} className="flex justify-between text-xs">
                  <span style={{ color: C.ink }}>{v.seller} · {v.count} venta{v.count === 1 ? "" : "s"}</span>
                  <span className="font-mono">{formatCLP(v.total)}</span>
                </div>
              ))}
            </div>
          )}
          <Field label="Efectivo contado físicamente en caja"><input autoFocus type="number" value={countedCash} onChange={e => setCountedCash(e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} placeholder="0" /></Field>
          {countedCash !== "" && (
            <div className="rounded-lg p-3 mb-3 flex justify-between text-sm font-semibold" style={{ background: Number(countedCash) - expectedCash === 0 ? C.greenSoft : C.rustSoft, color: Number(countedCash) - expectedCash === 0 ? C.greenDark : C.rust }}>
              <span>{Number(countedCash) - expectedCash === 0 ? "Cuadratura exacta" : Number(countedCash) - expectedCash > 0 ? "Sobrante" : "Faltante"}</span>
              <span className="font-mono">{formatCLP(Math.abs(Number(countedCash) - expectedCash))}</span>
            </div>
          )}
          <div className="flex gap-2">
            <Btn variant="ghost" full onClick={() => setClosing(false)}>Cancelar</Btn>
            <Btn variant="rust" full icon={Lock} onClick={confirmClose}>Confirmar cierre</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   ANÁLISIS — el negocio conectado
   Cruza ventas, inventario, recepciones y proveedores para responder:
   qué se vende más, qué conviene dejar de comprar, qué se está agotando,
   a quién se le compra más y quién deja más rentabilidad, y cómo se
   comparan precios entre productos parecidos. Solo administradores.
--------------------------------------------------------- */
/* ---------------------------------------------------------
   PREDICCIÓN DE PAN
   El pan se vende por unidad pero llega 2 veces al día: el pedido de la
   noche anterior llega en la mañana, y el pedido que se hace en la mañana
   llega al mediodía. Este módulo cruza ventas + mermas + recepciones reales
   del negocio para ir prediciendo cuánto pedir cada día, considerando el
   día de la semana y los feriados chilenos — en especial los irrenunciables
   (donde la panadería no reparte nada ese día, así que el pedido del día
   anterior debe alcanzar para cubrirlo completo).

   Esto NO es una lista fija: se recalcula solo con el historial real que
   se va acumulando en el sistema (ventas, mermas y recepciones de pan), y
   mejora mientras más días de datos reales existan.
--------------------------------------------------------- */

// Feriados chilenos conocidos para 2026. Los 5 marcados como irrenunciables
// (Ley 19.973) son los únicos donde el comercio —y la panadería— cierra por
// completo. Esta lista es editable desde el panel: cada año cambian algunas
// fechas (Semana Santa, y algunos feriados que la ley corre al lunes más
// cercano), así que conviene revisarla y completarla a comienzos de cada año.
const DEFAULT_BREAD_HOLIDAYS = [
  { date: "2026-01-01", label: "Año Nuevo", irrenunciable: true },
  { date: "2026-04-03", label: "Viernes Santo", irrenunciable: false },
  { date: "2026-04-04", label: "Sábado Santo", irrenunciable: false },
  { date: "2026-05-01", label: "Día del Trabajo", irrenunciable: true },
  { date: "2026-05-21", label: "Glorias Navales", irrenunciable: false },
  { date: "2026-09-18", label: "Independencia Nacional", irrenunciable: true },
  { date: "2026-09-19", label: "Glorias del Ejército", irrenunciable: true },
  { date: "2026-10-12", label: "Encuentro de Dos Mundos", irrenunciable: false },
  { date: "2026-11-01", label: "Día de Todos los Santos", irrenunciable: false },
  { date: "2026-12-08", label: "Inmaculada Concepción", irrenunciable: false },
  { date: "2026-12-25", label: "Navidad", irrenunciable: true },
];

const DOW_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function classifyBreadDay(dateStr, holidays) {
  const d = new Date(`${dateStr}T12:00:00`);
  const dow = d.getDay();
  const holiday = holidays.find(h => h.date === dateStr) || null;
  return { dow, dowName: DOW_NAMES[dow], holiday };
}
function breadDayKey(info) {
  return info.holiday ? `feriado:${info.holiday.label}` : `dow:${info.dow}`;
}

function buildBreadHistory(products, sales, movements, purchaseItems, breadCategory) {
  const breadIds = new Set(products.filter(p => p.category === breadCategory).map(p => p.id));
  const byDate = new Map();
  function bucket(dateStr) {
    if (!byDate.has(dateStr)) byDate.set(dateStr, { sold: 0, merma: 0, receivedMorning: 0, receivedMidday: 0 });
    return byDate.get(dateStr);
  }
  sales.forEach(s => {
    const dateStr = s.date.slice(0, 10);
    (s.items || []).forEach(it => { if (breadIds.has(it.productId)) bucket(dateStr).sold += Number(it.qty) || 0; });
  });
  movements.forEach(m => {
    if (m.category === "Merma" && breadIds.has(m.productId)) {
      bucket(m.date.slice(0, 10)).merma += Number(m.qty) || 0;
    }
  });
  purchaseItems.forEach(pi => {
    if (breadIds.has(pi.productId)) {
      const b = bucket(pi.date.slice(0, 10));
      const hour = new Date(pi.date).getHours();
      if (hour < 12) b.receivedMorning += Number(pi.qty) || 0; else b.receivedMidday += Number(pi.qty) || 0;
    }
  });
  return byDate;
}

function predictBreadConsumption(dateStr, byDate, holidays, shortageDates) {
  const info = classifyBreadDay(dateStr, holidays);
  const key = breadDayKey(info);
  const isShort = shortageDates ? shortageDates.has : () => false;
  let matches = [];
  byDate.forEach((v, d) => {
    if (d === dateStr || isShort(d)) return; // un día con desabasto no refleja demanda real, se excluye
    if (breadDayKey(classifyBreadDay(d, holidays)) === key) matches.push(v.sold + v.merma);
  });
  if (matches.length === 0 && info.holiday) {
    byDate.forEach((v, d) => { if (d !== dateStr && !isShort(d) && classifyBreadDay(d, holidays).dow === info.dow) matches.push(v.sold + v.merma); });
  }
  if (matches.length === 0) return null;
  const avg = matches.reduce((a, b) => a + b, 0) / matches.length;
  return { avg, sampleSize: matches.length, info };
}

function breadSplitRatio(byDate) {
  let morning = 0, midday = 0;
  byDate.forEach(v => { morning += v.receivedMorning; midday += v.receivedMidday; });
  const total = morning + midday;
  if (total === 0) return { morningShare: 0.6, middayShare: 0.4, hasData: false };
  return { morningShare: morning / total, middayShare: midday / total, hasData: true };
}

function buildBreadRecommendations(byDate, holidays, splitR, shortageDates, daysAhead = 7) {
  const out = [];
  const today = new Date();
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const info = classifyBreadDay(dateStr, holidays);
    const pred = predictBreadConsumption(dateStr, byDate, holidays, shortageDates);
    const nextDateStr = new Date(d.getTime() + 86400000).toISOString().slice(0, 10);
    const nextInfo = classifyBreadDay(nextDateStr, holidays);
    const nextIsClosed = !!(nextInfo.holiday && nextInfo.holiday.irrenunciable);
    const nextPred = nextIsClosed ? predictBreadConsumption(nextDateStr, byDate, holidays, shortageDates) : null;
    const isClosedToday = !!(info.holiday && info.holiday.irrenunciable);

    let evening = null, midday = null;
    if (!isClosedToday) {
      if (pred) {
        evening = Math.ceil(pred.avg * splitR.morningShare);
        midday = Math.ceil(pred.avg * splitR.middayShare);
      }
    } else {
      evening = 0; midday = 0;
    }
    if (nextIsClosed && nextPred && midday !== null) {
      midday += Math.ceil(nextPred.avg);
    }
    out.push({ dateStr, info, pred, isClosedToday, nextIsClosed, nextPred, evening, midday });
  }
  return out;
}

function BreadHolidayRow({ h, onRemove }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 text-sm" style={{ borderBottom: `1px solid ${C.paperLine}` }}>
      <span>{formatDateOnly(h.date)} — {h.label} {h.irrenunciable && <Badge tone="rust">irrenunciable</Badge>}</span>
      <button onClick={() => onRemove(h.date)} style={{ color: C.rust }}><Trash2 size={15} /></button>
    </div>
  );
}

function BreadDayCloseCard({ products, setProducts, movements, setMovements, breadCategory, session, toast }) {
  const freshBread = products.find(p => p.category === breadCategory && p.name === "PAN");
  const coldBread = products.find(p => p.category === breadCategory && p.name === "PAN FRÍO");
  const [toColdQty, setToColdQty] = useState("");
  const [mermaQty, setMermaQty] = useState("");
  const [mermaReason, setMermaReason] = useState(SHRINKAGE_REASONS[0]);
  const [saving, setSaving] = useState(false);

  if (!freshBread) return null;

  const toColdNum = Number(toColdQty) || 0;
  const mermaNum = Number(mermaQty) || 0;
  const totalOut = toColdNum + mermaNum;
  const overStock = totalOut > freshBread.stock;

  async function confirmClose() {
    if (totalOut <= 0) return toast("Ingresa al menos una cantidad", "error");
    if (overStock) return toast("Esa cantidad supera el stock actual de pan fresco", "error");
    setSaving(true);
    try {
      const latestProducts = await loadJSON("products-catalog", products);
      let np = latestProducts.map(p => {
        if (p.id !== freshBread.id) return p;
        const nextStock = Math.max(0, p.stock - totalOut);
        return { ...p, stock: nextStock, stockZeroSince: nextStockZeroSince(p.stock, p.stockZeroSince, nextStock) };
      });
      if (toColdNum > 0 && coldBread) {
        np = np.map(p => p.id === coldBread.id ? { ...p, stock: p.stock + toColdNum, cost: freshBread.cost || p.cost, stockZeroSince: nextStockZeroSince(p.stock, p.stockZeroSince, p.stock + toColdNum) } : p);
      }
      const latestMovements = await loadJSON("movements-log", movements);
      let nm = latestMovements;
      if (mermaNum > 0) {
        nm = [{
          id: uid("mov"), date: new Date().toISOString(), type: "egreso",
          concept: `Merma (${mermaReason}): ${freshBread.name} — cierre del día`,
          amount: mermaNum * (freshBread.cost || 0), category: "Merma", auto: true,
          reason: mermaReason, productId: freshBread.id, productName: freshBread.name, qty: mermaNum, unitType: "unidad",
          reportedBy: session.name, authorizedBy: session.name,
        }, ...latestMovements];
      }
      setProducts(np); setMovements(nm);
      await saveJSON("products-catalog", np, { origen: "pan_frio" });
      await saveJSON("movements-log", nm);
      setToColdQty(""); setMermaQty("");
      toast("Cierre del día registrado", "success");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg p-3 mb-4" style={{ background: C.paperDark }}>
      <div className="text-sm font-semibold mb-1" style={{ color: C.ink }}>Cierre del día — lo que sobró de pan fresco</div>
      <p className="text-xs mb-3" style={{ color: C.gray }}>Stock actual de pan fresco: {freshBread.stock} un.{coldBread ? ` · Pan Frío: ${coldBread.stock} un.` : ""}. Reparte lo que sobró entre Pan Frío (para vender mañana más barato) y merma real (lo que ya no sirve).</p>
      <div className="grid sm:grid-cols-2 gap-2 mb-2">
        <Field label="Pasar a Pan Frío (unidades)"><input type="number" value={toColdQty} onChange={e => setToColdQty(e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} placeholder="0" /></Field>
        <Field label="Merma real (unidades)"><input type="number" value={mermaQty} onChange={e => setMermaQty(e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} placeholder="0" /></Field>
      </div>
      {mermaNum > 0 && (
        <Field label="Motivo de la merma">
          <div className="grid grid-cols-3 gap-1.5">
            {SHRINKAGE_REASONS.map(r => (
              <button key={r} type="button" onClick={() => setMermaReason(r)} className="py-1.5 rounded-md text-[11px] font-medium" style={mermaReason === r ? { background: C.rust, color: "#fff" } : { background: "#fff", color: C.gray }}>{r}</button>
            ))}
          </div>
        </Field>
      )}
      {overStock && <p className="text-xs mb-2" style={{ color: C.rust }}>Eso suma más de lo que queda en stock de pan fresco.</p>}
      <Btn size="sm" icon={Check} disabled={saving || totalOut <= 0 || overStock} onClick={confirmClose}>Guardar cierre del día</Btn>
    </div>
  );
}

function BreadPredictionPanel({ products, setProducts, sales, movements, setMovements, purchaseItems, settings, setSettings, session, toast }) {
  const [holidays, setHolidays] = useState(null);
  const [shortages, setShortages] = useState(null);
  const [newDate, setNewDate] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newIrren, setNewIrren] = useState(false);
  const breadCategory = settings.breadCategory || "PAN";
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayShortage = shortages?.find(s => s.date === todayStr) || { date: todayStr, morning: false, afternoon: false };

  useEffect(() => {
    (async () => {
      const h = await loadJSON("bread-holidays", null);
      if (!h) { setHolidays(DEFAULT_BREAD_HOLIDAYS); await saveJSON("bread-holidays", DEFAULT_BREAD_HOLIDAYS); }
      else setHolidays(h);
      const s = await loadJSON("bread-shortages", []);
      setShortages(s);
    })();
  }, []);

  const breadCategoryOptions = useMemo(() => [...new Set(products.map(p => p.category).filter(Boolean))].sort(), [products]);
  const breadProductCount = products.filter(p => p.category === breadCategory).length;

  async function setBreadCategory(cat) {
    const ns = { ...settings, breadCategory: cat };
    setSettings(ns); await saveJSON("business-settings", ns);
  }

  async function addHoliday() {
    if (!newDate || !newLabel.trim()) return toast("Completa fecha y nombre del feriado", "error");
    const nh = [...holidays.filter(h => h.date !== newDate), { date: newDate, label: newLabel.trim(), irrenunciable: newIrren }].sort((a, b) => a.date.localeCompare(b.date));
    setHolidays(nh); await saveJSON("bread-holidays", nh);
    setNewDate(""); setNewLabel(""); setNewIrren(false);
    toast("Feriado agregado", "success");
  }
  async function removeHoliday(date) {
    const nh = holidays.filter(h => h.date !== date);
    setHolidays(nh); await saveJSON("bread-holidays", nh);
  }

  async function toggleShortage(field) {
    const latest = await loadJSON("bread-shortages", shortages || []);
    const existing = latest.find(s => s.date === todayStr);
    let updated;
    if (existing) {
      updated = latest.map(s => s.date === todayStr ? { ...s, [field]: !s[field] } : s);
    } else {
      updated = [...latest, { date: todayStr, morning: false, afternoon: false, [field]: true }];
    }
    setShortages(updated); await saveJSON("bread-shortages", updated);
  }

  const shortageDates = useMemo(() => new Set((shortages || []).filter(s => s.morning || s.afternoon).map(s => s.date)), [shortages]);
  const byDate = useMemo(() => holidays ? buildBreadHistory(products, sales, movements, purchaseItems, breadCategory) : new Map(), [products, sales, movements, purchaseItems, breadCategory, holidays]);
  const daysWithData = byDate.size;
  const splitR = useMemo(() => breadSplitRatio(byDate), [byDate]);
  const recommendations = useMemo(() => holidays ? buildBreadRecommendations(byDate, holidays, splitR, shortageDates, 7) : [], [byDate, holidays, splitR, shortageDates]);

  if (!holidays || !shortages) return null;

  return (
    <div className="rounded-xl overflow-hidden mt-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
      <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: C.paperDark }}>
        <TrendingUp size={15} style={{ color: C.ink }} />
        <span className="text-sm font-semibold" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Predicción de pedido de pan</span>
      </div>

      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs" style={{ color: C.gray }}>Categoría que se toma como "pan":</span>
          <select value={breadCategory} onChange={e => setBreadCategory(e.target.value)} className={`${inputCls} w-auto text-sm`} style={inputStyle()}>
            {!breadCategoryOptions.includes(breadCategory) && <option value={breadCategory}>{breadCategory}</option>}
            {breadCategoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="text-xs" style={{ color: C.grayLight }}>({breadProductCount} producto(s) en esa categoría · {daysWithData} día(s) con historial)</span>
        </div>

        <BreadDayCloseCard products={products} setProducts={setProducts} movements={movements} setMovements={setMovements} breadCategory={breadCategory} session={session} toast={toast} />

        <div className="rounded-lg p-3 mb-4" style={{ background: C.rustSoft }}>
          <div className="text-sm font-semibold mb-1.5" style={{ color: C.rust }}>¿Faltó pan hoy?</div>
          <p className="text-xs mb-2" style={{ color: C.rust }}>Si algún reparto no llegó o no alcanzó, avísale al sistema — así ese día no se usa como referencia de "poca demanda" en la predicción (fue un problema de abastecimiento, no que se vendiera menos).</p>
          <div className="flex gap-2">
            <label className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-md" style={{ background: "#fff", color: C.rust }}>
              <input type="checkbox" checked={todayShortage.morning} onChange={() => toggleShortage("morning")} /> Faltó en la mañana
            </label>
            <label className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-md" style={{ background: "#fff", color: C.rust }}>
              <input type="checkbox" checked={todayShortage.afternoon} onChange={() => toggleShortage("afternoon")} /> Faltó a mediodía
            </label>
          </div>
        </div>

        {daysWithData < 5 ? (
          <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: C.brassSoft, color: C.brassText }}>
            Todavía hay poco historial de pan (solo {daysWithData} día{daysWithData === 1 ? "" : "s"} con ventas, mermas o recepciones registradas). La predicción va a ir mejorando sola a medida que el sistema acumule más días reales de uso — por ahora los números de abajo son una referencia poco confiable.
          </div>
        ) : (
          <p className="text-xs mb-4" style={{ color: C.grayLight }}>
            Calculado sobre {daysWithData} días de historial real{shortageDates.size > 0 ? ` (${shortageDates.size} día(s) con desabasto no se cuentan como referencia)` : ""}. Reparto observado entre lo que llega en la mañana y a mediodía: {(splitR.morningShare * 100).toFixed(0)}% / {(splitR.middayShare * 100).toFixed(0)}%{!splitR.hasData && " (sin recepciones registradas todavía, se usa un reparto supuesto de 60/40)"}.
          </p>
        )}

        <div className="overflow-x-auto rounded-lg" style={{ border: `1.5px solid ${C.paperLine}` }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: C.paperDark, color: C.gray }}>
                <th className="px-3 py-2 text-left font-medium">Día</th>
                <th className="px-3 py-2 text-right font-medium">Pedido de la noche antes<br /><span className="font-normal text-[10px]">(llega esa mañana)</span></th>
                <th className="px-3 py-2 text-right font-medium">Pedido de esa mañana<br /><span className="font-normal text-[10px]">(llega a mediodía)</span></th>
              </tr>
            </thead>
            <tbody>
              {recommendations.map(r => (
                <tr key={r.dateStr} style={{ borderTop: `1px solid ${C.paperLine}` }}>
                  <td className="px-3 py-2.5">
                    <div className="font-medium" style={{ color: C.ink }}>{formatDateOnly(r.dateStr)}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs" style={{ color: C.gray }}>{r.info.holiday ? r.info.holiday.label : r.info.dowName}</span>
                      {r.isClosedToday && <Badge tone="rust">panadería cerrada</Badge>}
                      {r.nextIsClosed && <Badge tone="brass">mañana es feriado irrenunciable</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {r.isClosedToday ? <span style={{ color: C.gray }}>— no llega pan —</span> : r.evening === null ? <span style={{ color: C.gray }}>sin datos aún</span> : <span className="font-semibold" style={{ color: C.ink }}>{r.evening} un.</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {r.isClosedToday ? <span style={{ color: C.gray }}>— no llega pan —</span> : r.midday === null ? <span style={{ color: C.gray }}>sin datos aún</span> : <span className="font-semibold" style={{ color: C.ink }}>{r.midday} un.</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 pt-4" style={{ borderTop: `1px dashed ${C.paperLine}` }}>
          <div className="text-sm font-semibold mb-2" style={{ color: C.ink }}>Calendario de feriados usado para la predicción</div>
          <p className="text-xs mb-2" style={{ color: C.gray }}>Revísalo cada tanto — algunas fechas cambian cada año (Semana Santa, y feriados que la ley corre al lunes más cercano). Los marcados "irrenunciable" son los únicos donde el sistema asume que no llega pan ese día.</p>
          <div className="rounded-lg overflow-hidden mb-3" style={{ border: `1.5px solid ${C.paperLine}` }}>
            <div className="max-h-48 overflow-y-auto">
              {holidays.map(h => <BreadHolidayRow key={h.date} h={h} onRemove={removeHoliday} />)}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Fecha"><input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className={`${inputCls} w-auto`} style={inputStyle()} /></Field>
            <Field label="Nombre"><input value={newLabel} onChange={e => setNewLabel(e.target.value)} className={`${inputCls} w-auto`} style={inputStyle()} placeholder="Ej. San Pedro y San Pablo" /></Field>
            <label className="flex items-center gap-1.5 text-sm mb-3.5" style={{ color: C.ink }}>
              <input type="checkbox" checked={newIrren} onChange={e => setNewIrren(e.target.checked)} /> Irrenunciable
            </label>
            <Btn size="sm" icon={Plus} onClick={addHoliday}>Agregar</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}


function RankBadge({ n }) {
  const tones = ["#c3963c", "#9a9a9a", "#a9784f"];
  if (n > 3) return <span className="w-5 text-center text-xs font-mono" style={{ color: C.grayLight }}>{n}</span>;
  return (
    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: tones[n - 1] }}>{n}</span>
  );
}

/* ---------------------------------------------------------
   PREDICTOR DE INVERSIÓN
   Antes de destinar plata a comprar más stock de algo, o a ampliar una
   categoría, esta sección cruza lo que YA se vende (ingresos, margen,
   quiebres de stock, rotación) para mostrar qué categorías vienen dando
   señales sólidas y cuáles no. Importante: el sistema solo conoce lo que
   el almacén ya vende — no predice demanda de un rubro que nunca se ha
   ofrecido. Sirve para decidir dónde profundizar (más stock, más
   variedad) dentro de lo que ya funciona, no como bola de cristal para
   algo completamente nuevo.
--------------------------------------------------------- */

function buildCategoryInvestmentStats(products, sales, lastSaleMap, windowDays) {
  const now = Date.now();
  const msDay = 24 * 60 * 60 * 1000;
  const recentStart = now - windowDays * msDay;
  const priorStart = recentStart - windowDays * msDay;

  const productById = new Map(products.map(p => [p.id, p]));
  const byCat = new Map();
  function bucket(cat) {
    if (!byCat.has(cat)) byCat.set(cat, {
      cat, recentRevenue: 0, recentCost: 0, recentQty: 0, priorRevenue: 0,
      recentDays: new Set(), recentProducts: new Set(),
    });
    return byCat.get(cat);
  }

  sales.forEach(s => {
    const t = new Date(s.date).getTime();
    if (t < priorStart) return;
    const isRecent = t >= recentStart;
    (s.items || []).forEach(it => {
      const prod = it.productId ? productById.get(it.productId) : null;
      if (!prod) return; // producto ya no está en el catálogo vigente: no se puede atribuir a una categoría actual
      const cat = prod.category?.trim() || "Sin categoría";
      const b = bucket(cat);
      const revenue = (it.price || 0) * (it.qty || 0);
      if (isRecent) {
        b.recentRevenue += revenue;
        b.recentCost += (it.cost || 0) * (it.qty || 0);
        b.recentQty += it.qty || 0;
        b.recentDays.add(s.date.slice(0, 10));
        b.recentProducts.add(prod.id);
      } else {
        b.priorRevenue += revenue;
      }
    });
  });

  const catalogByCat = new Map();
  products.forEach(p => {
    const cat = p.category?.trim() || "Sin categoría";
    if (!catalogByCat.has(cat)) catalogByCat.set(cat, []);
    catalogByCat.get(cat).push(p);
  });

  let totalRevenue = 0, totalCost = 0;
  byCat.forEach(b => { totalRevenue += b.recentRevenue; totalCost += b.recentCost; });
  const overallMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : null;

  const rows = [...byCat.values()]
    .filter(b => b.recentDays.size > 0)
    .map(b => {
      const catalog = catalogByCat.get(b.cat) || [];
      const activeStock = catalog.filter(p => p.stock > 0);
      const outOfStock = catalog.filter(p => p.stock <= 0).length;
      const belowMin = catalog.filter(p => p.stock > 0 && p.stock <= p.minStock).length;
      const stalledCount = activeStock.filter(p => {
        const last = lastSaleMap.get(p.id);
        const days = last ? Math.floor((now - last) / msDay) : null;
        return days === null || days >= 45; // mismo umbral que "quizás no conviene volver a comprar"
      }).length;
      const stalledShare = activeStock.length > 0 ? stalledCount / activeStock.length : null;
      const margin = b.recentRevenue > 0 ? ((b.recentRevenue - b.recentCost) / b.recentRevenue) * 100 : null;
      const growthPct = b.priorRevenue > 0 ? ((b.recentRevenue - b.priorRevenue) / b.priorRevenue) * 100 : null;
      const consistency = b.recentDays.size / windowDays;
      const breadth = catalog.length > 0 ? b.recentProducts.size / catalog.length : null;

      const lowConfidence = b.recentDays.size < 5;
      const marginOk = margin !== null && overallMargin !== null && margin >= overallMargin;
      const growthOk = growthPct === null || growthPct >= 0;
      const consistencyOk = consistency >= 0.5;
      const cautious = stalledShare !== null && stalledShare >= 0.5;
      const positives = [marginOk, growthOk, consistencyOk].filter(Boolean).length;

      let verdict;
      if (lowConfidence) verdict = { tone: "gray", label: "Datos insuficientes aún" };
      else if (cautious) verdict = { tone: "brass", label: "Con matices" };
      else if (positives >= 3) verdict = { tone: "green", label: "Candidato sólido" };
      else if (positives >= 2) verdict = { tone: "brass", label: "Señal mixta" };
      else verdict = { tone: "rust", label: "No parece el momento" };

      return {
        cat: b.cat, totalProducts: catalog.length, recentRevenue: b.recentRevenue, recentQty: b.recentQty,
        daysWithSales: b.recentDays.size, productsSold: b.recentProducts.size, breadth,
        margin, growthPct, consistency, outOfStock, belowMin, stalledShare, lowConfidence, verdict,
      };
    })
    .sort((a, b) => b.recentRevenue - a.recentRevenue);

  return { rows, overallMargin };
}

/* ---------------------------------------------------------
   MEMORIA DE PRECIOS — stock antiguo con precio ya bajado
   Cuando el precio de venta de un producto baja (por ejemplo porque llegó
   una compra más barata) y todavía queda stock de la compra anterior, ese
   stock se termina vendiendo al precio nuevo aunque se compró pensando en
   venderse al precio viejo: la pérdida (o el margen que se deja de ganar)
   queda escondida, porque el sistema no distingue "esta unidad es de la
   compra vieja" de "esta es de la compra nueva" — solo hay un precio de
   venta vigente por producto.

   Esto no inventa un seguimiento de lotes que el sistema no tiene: usa lo
   que ya es real y se guarda — el historial de costo/precio de cada
   producto (memoria completa, sin el tope de un año que se pidió: la
   tabla producto_precio_historial no tiene límite de tiempo) y las
   recepciones de stock (compras con factura + reposiciones rápidas) —
   para estimar cuánto de lo que hay ahora en bodega es anterior a la
   última baja de precio del producto, y qué tan grande es la diferencia.
--------------------------------------------------------- */

function findLastPriceDrop(priceHistory) {
  if (!Array.isArray(priceHistory) || priceHistory.length < 2) return null;
  for (let i = priceHistory.length - 1; i > 0; i--) {
    const prev = priceHistory[i - 1], cur = priceHistory[i];
    if (Number(cur.price) < Number(prev.price)) {
      return { date: cur.date, oldPrice: Number(prev.price), newPrice: Number(cur.price), oldCost: Number(prev.cost) || 0 };
    }
  }
  return null;
}

/* Misma cuenta que usa el panel de Análisis de abajo, pero acá no es solo un
   aviso: es la que decide cuánto cobrar en la caja. Si a un producto por
   unidad todavía le quedan unidades de antes de su última baja de precio,
   se cobran esas primero al precio viejo y recién las que sobren al precio
   nuevo — así la próxima compra no se aprovecha de una rebaja que en
   realidad era para el lote que llegó después. No se aplica a productos por
   peso: ahí no tiene sentido repartir un mismo pesaje entre dos precios. */
/* ¿Es pan? La sección la define el negocio en Ajustes; por omisión, "PAN". */
function esPan(product, breadCategory) {
  const seccion = breadCategory || "PAN";
  return normalize(product?.category || "") === normalize(seccion);
}

function unitsStillAtOldPrice(product, purchaseItems, breadCategory) {
  if (product.unitType === "peso") return null;
  // Excepción del pan. La regla del precio anterior existe para el stock que
  // se compró caro y sigue en la repisa: mientras quede de ese, se cobra al
  // precio de antes. Con el pan eso no aplica — se hornea y se repone todos
  // los días, así que el pan de hoy nunca es el que quedó de antes del cambio
  // de precio. Sin esta excepción, bajar el pan de 220 a 200 no servía de
  // nada: la caja seguía cobrando 220.
  if (esPan(product, breadCategory)) return null;
  if (!(product.stock > 0)) return null;
  const drop = findLastPriceDrop(product.priceHistory);
  if (!drop) return null;
  const dropTime = new Date(drop.date).getTime();
  const receivedSince = purchaseItems
    .filter(pi => pi.productId === product.id && new Date(pi.date).getTime() > dropTime)
    .reduce((a, pi) => a + (Number(pi.qty) || 0), 0);
  const qty = Math.max(0, Math.min(product.stock, product.stock - receivedSince));
  if (qty <= 0) return null;
  return { qty, oldPrice: drop.oldPrice, newPrice: drop.newPrice };
}

function buildPriceDropRisks(products, purchaseItems, breadCategory) {
  const now = Date.now();
  const msDay = 24 * 60 * 60 * 1000;
  const receivedByProduct = new Map();
  purchaseItems.forEach(pi => {
    if (!pi.productId) return;
    const list = receivedByProduct.get(pi.productId) || [];
    list.push({ time: new Date(pi.date).getTime(), qty: Number(pi.qty) || 0 });
    receivedByProduct.set(pi.productId, list);
  });

  const rows = [];
  products.forEach(p => {
    if (!(p.stock > 0)) return;
    if (esPan(p, breadCategory)) return;   // misma excepción que en la caja
    const drop = findLastPriceDrop(p.priceHistory);
    if (!drop) return;
    const dropTime = new Date(drop.date).getTime();
    const receivedSince = (receivedByProduct.get(p.id) || [])
      .filter(r => r.time > dropTime)
      .reduce((a, r) => a + r.qty, 0);
    const unitsAtRisk = Math.max(0, Math.min(p.stock, p.stock - receivedSince));
    if (unitsAtRisk <= 0) return;
    const marginLossPerUnit = drop.oldPrice - drop.newPrice;
    const opportunityCost = unitsAtRisk * marginLossPerUnit;
    const belowOldCost = drop.oldCost > 0 && drop.newPrice < drop.oldCost;
    const realLoss = belowOldCost ? unitsAtRisk * (drop.oldCost - drop.newPrice) : 0;
    const daysSinceDrop = Math.floor((now - dropTime) / msDay);
    rows.push({
      id: p.id, name: p.name, unitType: p.unitType, stock: p.stock, unitsAtRisk,
      oldPrice: drop.oldPrice, newPrice: drop.newPrice, daysSinceDrop, opportunityCost, belowOldCost, realLoss,
    });
  });

  return rows.sort((a, b) => (b.realLoss - a.realLoss) || (b.opportunityCost - a.opportunityCost));
}

/* En la caja, cuando a un producto le queda poco stock al precio anterior y
   el cliente pide más de lo que corresponde a ese precio, se cobra TODO al
   precio anterior (más alto) en vez de mezclar dos precios en la misma
   boleta —eso confundiría al cliente—. Esto hace que esas ventas dejen más
   margen del esperado, no menos: es una excepción y conviene que quede a la
   vista de un administrador, en vez de perderse entre el resto de las
   ventas. Ver checkout() en POSView, donde se calcula extraQty/extraProfit. */
function buildOldPriceSalesLog(sales) {
  const rows = [];
  sales.forEach(s => {
    (s.items || []).forEach(it => {
      if (!it.oldPriceApplied) return;
      rows.push({
        saleId: s.id, invoiceNumber: s.invoiceNumber, date: s.date, name: it.name,
        qty: it.qty, oldPrice: it.oldPrice, newPrice: it.newPrice,
        extraQty: it.extraQty || 0, extraProfit: it.extraProfit || 0,
      });
    });
  });
  return rows.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function PriceDropAlertPanel({ products, purchaseItems, sales, breadCategory }) {
  const rows = useMemo(() => buildPriceDropRisks(products, purchaseItems, breadCategory), [products, purchaseItems, breadCategory]);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows.slice(0, 12);
  const hasRealLoss = rows.some(r => r.belowOldCost);
  const totalOpportunity = rows.reduce((a, r) => a + r.opportunityCost, 0);
  const totalRealLoss = rows.reduce((a, r) => a + r.realLoss, 0);

  const oldPriceSales = useMemo(() => buildOldPriceSalesLog(sales), [sales]);
  const [showAllSales, setShowAllSales] = useState(false);
  const shownSales = showAllSales ? oldPriceSales : oldPriceSales.slice(0, 8);
  const totalExtraProfit = oldPriceSales.reduce((a, r) => a + r.extraProfit, 0);

  return (
    <div className="rounded-xl overflow-hidden mt-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
      <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: hasRealLoss ? C.rustSoft : C.brassSoft }}>
        <PackageMinus size={15} style={{ color: hasRealLoss ? C.rust : "#8a6a1f" }} />
        <span className="text-sm font-semibold" style={{ color: hasRealLoss ? C.rust : "#8a6a1f", fontFamily: "'Space Grotesk', sans-serif" }}>Stock que quedó con precio antiguo ({rows.length})</span>
      </div>
      <div className="p-4">
        <p className="text-xs mb-3" style={{ color: C.gray }}>
          Cuando baja el precio de venta y todavía queda stock de la compra anterior, esas unidades terminan vendiéndose más baratas de lo pensado — una pérdida de margen difícil de notar porque no aparece como error en ninguna parte. Esto compara el historial de precio de cada producto contra lo recibido después de su última baja, para estimarlo.
        </p>
        {rows.length === 0 ? (
          <EmptyState icon={PackageMinus} title="Sin señales por ahora" hint="No se detecta stock que venga de antes de la última baja de precio de algún producto." />
        ) : (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-sm">
              {totalRealLoss > 0 && <span style={{ color: C.rust }}>Riesgo de vender bajo costo: <b className="font-mono">{formatCLP(totalRealLoss)}</b></span>}
              <span style={{ color: "#8a6a1f" }}>Margen que se dejaría de ganar en total: <b className="font-mono">{formatCLP(totalOpportunity)}</b></span>
            </div>
            <div className="divide-y" style={{ borderColor: C.paperLine }}>
              {shown.map(r => (
                <div key={r.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate" style={{ color: C.ink }}>{r.name}</span>
                    <span className="font-mono text-sm font-semibold flex-shrink-0" style={{ color: r.belowOldCost ? C.rust : "#8a6a1f" }}>{formatCLP(r.belowOldCost ? r.realLoss : r.opportunityCost)}</span>
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: C.gray }}>
                    {r.unitsAtRisk}{r.unitType === "peso" ? " kg" : " un."} de {r.stock}{r.unitType === "peso" ? " kg" : " un."} en stock parecen venir de antes de la baja de {formatCLP(r.oldPrice)} a {formatCLP(r.newPrice)}, hace {r.daysSinceDrop} día{r.daysSinceDrop === 1 ? "" : "s"}
                    {r.belowOldCost && <span style={{ color: C.rust }}> — esas unidades costaron más de lo que ahora se están vendiendo</span>}.
                  </div>
                </div>
              ))}
            </div>
            {rows.length > shown.length && (
              <button onClick={() => setShowAll(true)} className="text-xs font-medium mt-2 underline" style={{ color: C.gray }}>Ver los {rows.length - shown.length} restantes</button>
            )}
          </>
        )}
        <p className="text-xs mt-3" style={{ color: C.grayLight }}>
          Es una estimación, no una medición exacta: el sistema no distingue lote por lote qué unidad física es cuál. Se calcula comparando el stock actual contra lo recibido (compras y reposiciones) desde la última baja de precio registrada en cada producto.
        </p>

        {oldPriceSales.length > 0 && (
          <div className="mt-4 pt-4" style={{ borderTop: `1px dashed ${C.paperLine}` }}>
            <div className="text-sm font-semibold mb-1" style={{ color: C.ink }}>Ventas donde se mantuvo el precio anterior ({oldPriceSales.length})</div>
            <p className="text-xs mb-2" style={{ color: C.gray }}>
              Para no cobrarle al cliente dos precios distintos del mismo producto en la misma boleta, cuando la cantidad pedida superó lo que quedaba al precio anterior, se cobró todo a ese precio más alto. Esto no genera pérdida — al contrario, esas unidades de más dejaron una ganancia extra sobre lo esperado. Es un caso excepcional, no algo que deba pasar seguido.
            </p>
            {totalExtraProfit > 0 && (
              <p className="text-sm font-semibold mb-2" style={{ color: C.greenDark }}>Ganancia extra acumulada por este motivo: {formatCLP(totalExtraProfit)}</p>
            )}
            <div className="divide-y" style={{ borderColor: C.paperLine }}>
              {shownSales.map((r, idx) => (
                <div key={`${r.saleId}-${idx}`} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="truncate" style={{ color: C.ink }}>Boleta #{r.invoiceNumber} · {formatDate(r.date)} — {r.qty}× {r.name}</div>
                    <div style={{ color: C.gray }}>Cobrado a {formatCLP(r.oldPrice)} c/u (precio anterior; el vigente es {formatCLP(r.newPrice)}){r.extraQty > 0 ? ` · ${r.extraQty} de esas unidades ya correspondían al precio nuevo` : ""}</div>
                  </div>
                  {r.extraProfit > 0 && <Badge tone="green">+{formatCLP(r.extraProfit)}</Badge>}
                </div>
              ))}
            </div>
            {oldPriceSales.length > shownSales.length && (
              <button onClick={() => setShowAllSales(true)} className="text-xs font-medium mt-2 underline" style={{ color: C.gray }}>Ver las {oldPriceSales.length - shownSales.length} restantes</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InvestmentPredictorPanel({ products, sales, lastSaleMap }) {
  const [windowDays, setWindowDays] = useState(30);
  const msDay = 24 * 60 * 60 * 1000;

  const { rows, overallMargin } = useMemo(
    () => buildCategoryInvestmentStats(products, sales, lastSaleMap, windowDays),
    [products, sales, lastSaleMap, windowDays]
  );

  const historyDays = useMemo(() => {
    if (sales.length === 0) return 0;
    let oldest = Date.now();
    sales.forEach(s => { const t = new Date(s.date).getTime(); if (t < oldest) oldest = t; });
    return Math.floor((Date.now() - oldest) / msDay);
  }, [sales]);

  const shortHistory = historyDays < windowDays * 2;

  return (
    <div className="rounded-xl overflow-hidden mt-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
      <div className="px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap" style={{ background: C.paperDark }}>
        <div className="flex items-center gap-2">
          <Sparkles size={15} style={{ color: C.ink }} />
          <span className="text-sm font-semibold" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Predictor de inversión por categoría</span>
        </div>
        <div className="flex gap-1.5">
          {[[30, "30 días"], [60, "60 días"], [90, "90 días"]].map(([v, l]) => (
            <button key={v} onClick={() => setWindowDays(v)} className="px-2.5 py-1 rounded-lg text-xs font-medium" style={windowDays === v ? { background: C.ink, color: C.paper } : { background: "#fff", color: C.gray }}>{l}</button>
          ))}
        </div>
      </div>

      <div className="p-4">
        <p className="text-xs mb-3" style={{ color: C.gray }}>
          Cruza ventas, márgenes, quiebres de stock y rotación de lo que <b>ya se vende</b> para ver qué categorías dan señales sólidas para profundizar (más stock, más variedad) — no predice demanda de un rubro que nunca se ha ofrecido, porque el sistema no tiene datos de eso.
        </p>

        {shortHistory && (
          <div className="rounded-lg p-3 mb-3 text-sm" style={{ background: C.brassSoft, color: C.brassText }}>
            Todavía hay {historyDays} día{historyDays === 1 ? "" : "s"} de historial de ventas registrado, menos que los {windowDays * 2} necesarios para comparar contra un período anterior completo. La variación (crecimiento) de cada categoría es referencial hasta que se acumulen más días.
          </div>
        )}

        {overallMargin !== null && (
          <p className="text-xs mb-3" style={{ color: C.grayLight }}>Margen promedio del negocio en el período: {overallMargin.toFixed(0)}% · se usa como referencia para el "margen sobre el promedio" de cada categoría.</p>
        )}

        {rows.length === 0 ? (
          <EmptyState icon={Sparkles} title="Sin ventas suficientes en este período" hint="Elige una ventana más amplia o espera a acumular más días de venta." />
        ) : (
          <div className="divide-y" style={{ borderColor: C.paperLine }}>
            {rows.map((r, i) => (
              <div key={r.cat} className="py-3">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <RankBadge n={i + 1} />
                  <span className="text-sm font-medium flex-1 truncate" style={{ color: C.ink }}>{r.cat}</span>
                  <Badge tone={r.verdict.tone}>{r.verdict.label}</Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs pl-7" style={{ color: C.gray }}>
                  <span className="font-mono font-semibold" style={{ color: C.greenDark }}>{formatCLP(r.recentRevenue)}</span>
                  <span className="flex items-center gap-1">
                    {r.growthPct === null ? "sin período anterior para comparar" : (
                      <>
                        {r.growthPct >= 0 ? <TrendingUp size={12} style={{ color: C.greenDark }} /> : <TrendingDown size={12} style={{ color: C.rust }} />}
                        <span style={{ color: r.growthPct >= 0 ? C.greenDark : C.rust }}>{r.growthPct >= 0 ? "+" : ""}{r.growthPct.toFixed(0)}% vs. período anterior</span>
                      </>
                    )}
                  </span>
                  <span>{r.margin === null ? "sin margen calculable" : `margen ${r.margin.toFixed(0)}%`}</span>
                  <span>{r.daysWithSales} de {windowDays} días con venta</span>
                  <span>{r.productsSold} de {r.totalProducts} producto(s) vendidos</span>
                </div>
                {(r.outOfStock > 0 || r.belowMin > 0) && (
                  <div className="text-xs mt-1 pl-7" style={{ color: C.rust }}>
                    {r.outOfStock > 0 && `${r.outOfStock} producto(s) sin stock ahora mismo`}{r.outOfStock > 0 && r.belowMin > 0 && " · "}{r.belowMin > 0 && `${r.belowMin} bajo el mínimo`} — posible demanda insatisfecha: puede ser razón para invertir más, no menos.
                  </div>
                )}
                {r.stalledShare !== null && r.stalledShare >= 0.5 && (
                  <div className="text-xs mt-1 pl-7" style={{ color: "#8a6a1f" }}>
                    {Math.round(r.stalledShare * 100)}% de los productos con stock de esta categoría llevan 45+ días sin venderse — antes de invertir más, conviene revisar si es la variedad correcta.
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AnalyticsView({ sales, products, setProducts, suppliers, invoicesIndex, purchaseItems, movements, setMovements, settings, setSettings, session, toast }) {
  const [range, setRange] = useState("30");
  const now = Date.now();

  const filteredSales = useMemo(() => {
    if (range === "0") return sales;
    const rangeMs = Number(range) * 24 * 60 * 60 * 1000;
    return sales.filter(s => now - new Date(s.date).getTime() <= rangeMs);
  }, [sales, range]);

  // --- Productos: qué se vende más ---
  const productStats = useMemo(() => {
    const map = new Map();
    filteredSales.forEach(s => {
      s.items.forEach(it => {
        const key = it.productId || it.name;
        if (!map.has(key)) map.set(key, { key, name: it.name, unitType: it.unitType, qty: 0, revenue: 0, costBasis: 0 });
        const e = map.get(key);
        e.qty += it.qty; e.revenue += it.price * it.qty; e.costBasis += (it.cost || 0) * it.qty;
      });
    });
    return [...map.values()].map(e => ({ ...e, profit: e.revenue - e.costBasis }));
  }, [filteredSales]);

  const topByRevenue = useMemo(() => [...productStats].sort((a, b) => b.revenue - a.revenue).slice(0, 8), [productStats]);
  const topByQty = useMemo(() => [...productStats].sort((a, b) => b.qty - a.qty).slice(0, 6), [productStats]);
  const chartData = topByRevenue.map(p => ({ name: p.name.length > 14 ? p.name.slice(0, 14) + "…" : p.name, revenue: p.revenue }));

  // --- Productos que quizás no deberían volver a comprarse ---
  const lastSaleMap = useMemo(() => {
    const map = new Map();
    sales.forEach(s => s.items.forEach(it => {
      if (!it.productId) return;
      const t = new Date(s.date).getTime();
      if (!map.has(it.productId) || t > map.get(it.productId)) map.set(it.productId, t);
    }));
    return map;
  }, [sales]);

  const lowRotation = useMemo(() => {
    return products.filter(p => p.stock > 0).map(p => {
      const last = lastSaleMap.get(p.id);
      const days = last ? Math.floor((now - last) / (24 * 60 * 60 * 1000)) : null;
      return { ...p, daysSinceSale: days, tiedUpValue: p.stock * p.cost };
    }).filter(p => p.daysSinceSale === null || p.daysSinceSale >= 45)
      .sort((a, b) => (b.daysSinceSale ?? 99999) - (a.daysSinceSale ?? 99999))
      .slice(0, 8);
  }, [products, lastSaleMap]);

  // --- Stock por agotarse ---
  const lowStock = useMemo(() => products.filter(p => p.stock <= p.minStock).sort((a, b) => (a.stock / (a.minStock || 1)) - (b.stock / (b.minStock || 1))), [products]);

  // --- Proveedores: a quién se le compra más y quién deja más rentabilidad ---
  const supplierStats = useMemo(() => {
    return suppliers.map(s => {
      const invs = invoicesIndex.filter(i => i.supplierId === s.id);
      const totalGastado = invs.reduce((a, i) => a + i.totalGross, 0);
      const items = purchaseItems.filter(i => i.supplierId === s.id);
      let wSum = 0, wBase = 0;
      items.forEach(it => {
        if (!it.productId) return;
        const prod = products.find(p => p.id === it.productId);
        if (!prod || !prod.price) return;
        const base = it.netCost * it.qty;
        const m = ((prod.price - it.netCost) / prod.price) * 100;
        wSum += m * base; wBase += base;
      });
      return { id: s.id, name: s.name, category: s.category, totalGastado, facturas: invs.length, margin: wBase > 0 ? wSum / wBase : null, lastDate: invs[0]?.date || null };
    }).filter(s => s.facturas > 0);
  }, [suppliers, invoicesIndex, purchaseItems, products]);

  const topSuppliersBySpend = useMemo(() => [...supplierStats].sort((a, b) => b.totalGastado - a.totalGastado).slice(0, 6), [supplierStats]);
  const topSuppliersByMargin = useMemo(() => [...supplierStats].filter(s => s.margin !== null).sort((a, b) => b.margin - a.margin).slice(0, 6), [supplierStats]);

  // --- Comparar precios entre productos similares (misma categoría) ---
  const [expandedCompareCat, setExpandedCompareCat] = useState(null);
  const byCategory = useMemo(() => {
    const map = new Map();
    products.filter(p => p.price > 0).forEach(p => {
      const cat = p.category?.trim() || "Sin categoría";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(p);
    });
    return [...map.entries()]
      .filter(([, items]) => items.length >= 2)
      .map(([cat, items]) => {
        const sorted = items.sort((a, b) => a.price - b.price);
        return { cat, items: sorted, min: sorted[0].price, max: sorted[sorted.length - 1].price };
      })
      .sort((a, b) => b.items.length - a.items.length);
  }, [products]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} style={{ color: C.greenDark }} />
          <h2 className="text-base font-semibold" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Análisis del negocio</h2>
        </div>
        <div className="flex gap-1.5">
          {[["7", "7 días"], ["30", "30 días"], ["90", "90 días"], ["0", "Todo"]].map(([v, l]) => (
            <button key={v} onClick={() => setRange(v)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={range === v ? { background: C.ink, color: C.paper } : { background: C.paperDark, color: C.gray }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Más vendidos */}
      <div className="rounded-xl p-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
        <div className="flex items-center gap-2 mb-3">
          <Award size={16} style={{ color: C.greenDark }} />
          <span className="text-sm font-semibold" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Productos que más venden</span>
        </div>
        {chartData.length === 0 ? (
          <EmptyState icon={BarChart3} title="Sin ventas en este período" hint="Elige un rango más amplio para ver el ranking." />
        ) : (
          <>
            <div style={{ width: "100%", height: 180 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.paperLine} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: C.gray }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.ink }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip formatter={v => formatCLP(v)} contentStyle={{ borderRadius: 8, border: `1px solid ${C.paperLine}`, fontSize: 12 }} />
                  <Bar dataKey="revenue" fill={C.green} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-4 mt-2">
              <div>
                <div className="text-[11px] font-semibold mb-1" style={{ color: C.gray }}>Por ingresos</div>
                {topByRevenue.slice(0, 5).map((p, i) => (
                  <div key={p.key} className="flex items-center gap-2 py-1 text-xs">
                    <RankBadge n={i + 1} /><span className="flex-1 truncate" style={{ color: C.ink }}>{p.name}</span><span className="font-mono" style={{ color: C.greenDark }}>{formatCLP(p.revenue)}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[11px] font-semibold mb-1" style={{ color: C.gray }}>Por unidades vendidas</div>
                {topByQty.slice(0, 5).map((p, i) => (
                  <div key={p.key} className="flex items-center gap-2 py-1 text-xs">
                    <RankBadge n={i + 1} /><span className="flex-1 truncate" style={{ color: C.ink }}>{p.name}</span><span className="font-mono" style={{ color: C.gray }}>{p.qty}{p.unitType === "peso" ? " kg" : " un."}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Bajo movimiento */}
        <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: C.rustSoft }}>
            <PackageX size={15} style={{ color: C.rust }} />
            <span className="text-sm font-semibold" style={{ color: C.rust, fontFamily: "'Space Grotesk', sans-serif" }}>Quizás no conviene volver a comprar</span>
          </div>
          {lowRotation.length === 0 ? (
            <p className="text-xs p-4" style={{ color: C.gray }}>No hay productos con stock estancado por ahora.</p>
          ) : (
            <div className="divide-y" style={{ borderColor: C.paperLine }}>
              {lowRotation.map(p => (
                <div key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm truncate" style={{ color: C.ink }}>{p.name}</div>
                    <div className="text-xs" style={{ color: C.gray }}>{p.daysSinceSale === null ? "Nunca se ha vendido" : `Sin venderse hace ${p.daysSinceSale} días`} · stock {p.stock}{p.unitType === "peso" ? " kg" : ""}</div>
                  </div>
                  <span className="text-xs font-mono flex-shrink-0" style={{ color: C.rust }}>{formatCLP(p.tiedUpValue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stock por agotarse */}
        <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: C.brassSoft }}>
            <AlertTriangle size={15} style={{ color: "#8a6a1f" }} />
            <span className="text-sm font-semibold" style={{ color: "#8a6a1f", fontFamily: "'Space Grotesk', sans-serif" }}>Stock por agotarse ({lowStock.length})</span>
          </div>
          {lowStock.length === 0 ? (
            <p className="text-xs p-4" style={{ color: C.gray }}>Todo el stock está sobre el mínimo. Buen trabajo.</p>
          ) : (
            <div className="divide-y max-h-72 overflow-y-auto" style={{ borderColor: C.paperLine }}>
              {lowStock.map(p => (
                <div key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-sm truncate" style={{ color: C.ink }}>{p.name}</span>
                  <Badge tone={p.stock <= 0 ? "rust" : "brass"}>{p.stock}{p.unitType === "peso" ? " kg" : ""} / mín. {p.minStock}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Proveedores por gasto */}
        <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: C.paperDark }}>
            <Building2 size={15} style={{ color: C.ink }} />
            <span className="text-sm font-semibold" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Proveedores a los que más se compra</span>
          </div>
          {topSuppliersBySpend.length === 0 ? (
            <p className="text-xs p-4" style={{ color: C.gray }}>Aún no hay recepciones registradas.</p>
          ) : (
            <div className="divide-y" style={{ borderColor: C.paperLine }}>
              {topSuppliersBySpend.map((s, i) => (
                <div key={s.id} className="px-4 py-2.5 flex items-center gap-2.5">
                  <RankBadge n={i + 1} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate" style={{ color: C.ink }}>{s.name}</div>
                    <div className="text-xs" style={{ color: C.gray }}>{s.facturas} factura(s) · última {formatDate(s.lastDate)}</div>
                  </div>
                  <span className="text-sm font-mono font-semibold" style={{ color: C.greenDark }}>{formatCLP(s.totalGastado)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Proveedores por rentabilidad */}
        <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: C.greenSoft }}>
            <Medal size={15} style={{ color: C.greenDark }} />
            <span className="text-sm font-semibold" style={{ color: C.greenDark, fontFamily: "'Space Grotesk', sans-serif" }}>Proveedores más rentables</span>
          </div>
          {topSuppliersByMargin.length === 0 ? (
            <p className="text-xs p-4" style={{ color: C.gray }}>Faltan datos de precio/costo para calcular márgenes.</p>
          ) : (
            <div className="divide-y" style={{ borderColor: C.paperLine }}>
              {topSuppliersByMargin.map((s, i) => (
                <div key={s.id} className="px-4 py-2.5 flex items-center gap-2.5">
                  <RankBadge n={i + 1} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate" style={{ color: C.ink }}>{s.name}</div>
                    <div className="text-xs" style={{ color: C.gray }}>{s.facturas} factura(s)</div>
                  </div>
                  <span className="text-sm font-mono font-semibold" style={{ color: C.greenDark }}>{s.margin.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Comparación de precios por categoría */}
      <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
        <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: C.paperDark }}>
          <Scale size={15} style={{ color: C.ink }} />
          <span className="text-sm font-semibold" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Comparar precios entre productos similares</span>
          <span className="text-xs ml-auto" style={{ color: C.grayLight }}>{byCategory.length} categoría(s)</span>
        </div>
        {byCategory.length === 0 ? (
          <p className="text-xs p-4" style={{ color: C.gray }}>Agrupa productos por categoría (2 o más) para comparar precios entre marcas o variedades.</p>
        ) : (
          <div className="divide-y max-h-96 overflow-y-auto" style={{ borderColor: C.paperLine }}>
            {byCategory.map(({ cat, items, min, max }) => {
              const isOpen = expandedCompareCat === cat;
              const shown = items.slice(0, 20);
              return (
                <div key={cat}>
                  <button onClick={() => setExpandedCompareCat(isOpen ? null : cat)} className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-black/[.02]">
                    <span className="text-sm font-medium truncate" style={{ color: C.ink }}>{cat}</span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs" style={{ color: C.gray }}>{items.length} productos</span>
                      <span className="text-xs font-mono" style={{ color: C.gray }}>{formatCLP(min)}{min !== max ? ` – ${formatCLP(max)}` : ""}</span>
                      <ChevronRight size={14} style={{ color: C.grayLight, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-3">
                      <div className="flex flex-wrap gap-1.5">
                        {shown.map((p, idx) => {
                          const margin = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0;
                          return (
                            <span key={p.id} className="text-xs px-2 py-1 rounded-md font-mono flex items-center gap-1" style={idx === 0 ? { background: C.greenSoft, color: C.greenDark } : idx === items.length - 1 ? { background: C.rustSoft, color: C.rust } : { background: C.paperDark, color: C.gray }}>
                              {p.name}: {formatCLP(p.price)}{p.unitType === "peso" ? "/kg" : ""} <span style={{ opacity: 0.7 }}>({margin.toFixed(0)}%)</span>
                            </span>
                          );
                        })}
                        {items.length > shown.length && <span className="text-xs px-2 py-1" style={{ color: C.grayLight }}>+{items.length - shown.length} más</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PriceDropAlertPanel products={products} purchaseItems={purchaseItems} sales={sales} breadCategory={settings.breadCategory} />

      <InvestmentPredictorPanel products={products} sales={sales} lastSaleMap={lastSaleMap} />

      <BreadPredictionPanel products={products} setProducts={setProducts} sales={sales} movements={movements} setMovements={setMovements} purchaseItems={purchaseItems} settings={settings} setSettings={setSettings} session={session} toast={toast} />
    </div>
  );
}


/* ---------------------------------------------------------
   PROVEEDORES
   Directorio de proveedores/vendedores del negocio, organizado por
   categoría (rubro). Los administradores pueden crear, editar y
   eliminar; el resto del equipo puede consultarlo (útil al recibir
   pedidos). Cuando una recepción queda asociada a un proveedor
   registrado, aquí se ve el total comprado y la última compra.
--------------------------------------------------------- */
function InvoiceViewerModal({ invoiceMeta, onClose, purchaseItems = [] }) {
  const [pages, setPages] = useState([]);
  const [pageIdx, setPageIdx] = useState(0);
  const [loading, setLoading] = useState(!invoiceMeta.noDocument);

  useEffect(() => {
    if (invoiceMeta.noDocument) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await loadJSON(`invoice-image:${invoiceMeta.id}`, null);
        if (!cancelled && res) {
          setPages(Array.isArray(res.pages) ? res.pages : []);
        }
      } catch (e) { /* imagen no disponible */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [invoiceMeta.id, invoiceMeta.noDocument]);

  const image = pages[pageIdx];

  return (
    <Modal title={`${invoiceMeta.noDocument ? "Entrada libre" : "Factura"} — ${invoiceMeta.supplierName}`} onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          {invoiceMeta.noDocument ? (
            <div className="rounded-lg p-4" style={{ background: C.rustSoft, border: `1.5px solid ${C.rust}` }}>
              <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold" style={{ color: C.rust }}><AlertTriangle size={13} />Sin boleta ni factura</div>
              <p className="text-sm" style={{ color: C.ink }}>{invoiceMeta.reason || "Sin motivo registrado."}</p>
            </div>
          ) : loading ? (
            <div className="rounded-lg flex items-center justify-center" style={{ height: 220, background: C.paperDark }}><Loader2 className="animate-spin" size={20} style={{ color: C.gray }} /></div>
          ) : image ? (
            <>
              {image.mediaType === "application/pdf" ? (
                <div className="rounded-lg p-4 flex flex-col items-center gap-2" style={{ background: C.paperDark }}>
                  <Receipt size={24} style={{ color: C.gray }} />
                  <span className="text-sm text-center" style={{ color: C.ink }}>{image.name}</span>
                  <a href={image.dataUrl} download={image.name} className="text-xs underline" style={{ color: C.green }}>Descargar PDF</a>
                </div>
              ) : (
                <img src={image.dataUrl} alt={`Factura página ${pageIdx + 1}`} className="w-full rounded-lg" style={{ border: `1.5px solid ${C.paperLine}` }} />
              )}
              {pages.length > 1 && (
                <div className="flex items-center justify-between mt-2">
                  <button disabled={pageIdx === 0} onClick={() => setPageIdx(i => i - 1)} className="p-3 rounded-md disabled:opacity-30" style={{ background: C.paperDark, color: C.ink }}><ChevronLeft size={18} /></button>
                  <span className="text-xs" style={{ color: C.gray }}>Página {pageIdx + 1} de {pages.length}</span>
                  <button disabled={pageIdx === pages.length - 1} onClick={() => setPageIdx(i => i + 1)} className="p-3 rounded-md disabled:opacity-30" style={{ background: C.paperDark, color: C.ink }}><ChevronRight size={18} /></button>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg p-4 text-center text-sm" style={{ background: C.paperDark, color: C.gray }}>No se encontró la imagen adjunta.</div>
          )}
        </div>
        <div className="text-sm space-y-1.5">
          <div className="flex justify-between"><span style={{ color: C.gray }}>Fecha</span><span>{formatDate(invoiceMeta.date)}</span></div>
          {invoiceMeta.refNumber && <div className="flex justify-between"><span style={{ color: C.gray }}>N° documento</span><span className="font-mono">{invoiceMeta.refNumber}</span></div>}
          <div className="flex justify-between"><span style={{ color: C.gray }}>Productos</span><span>{purchaseItems.filter(pi => pi.invoiceId === invoiceMeta.id).length || invoiceMeta.itemCount || 0}</span></div>
          <div className="flex justify-between"><span style={{ color: C.gray }}>Registrada por</span><span>{invoiceMeta.registeredBy}</span></div>
          <div className="flex justify-between pt-2 font-semibold" style={{ borderTop: `1px dashed ${C.paperLine}` }}><span>Monto neto</span><span className="font-mono">{formatCLP(invoiceMeta.totalNet)}</span></div>
          <div className="flex justify-between font-semibold"><span>Total con IVA</span><span className="font-mono">{formatCLP(invoiceMeta.totalGross)}</span></div>
        </div>
      </div>
    </Modal>
  );
}

function PriceComparisonPanel({ purchaseItems }) {
  const comparison = useMemo(() => {
    const byProduct = new Map();
    purchaseItems.forEach(pi => {
      if (!pi.supplierId) return;
      const key = normalize(pi.productName);
      if (!byProduct.has(key)) byProduct.set(key, { name: pi.productName, suppliers: new Map() });
      const entry = byProduct.get(key);
      const prev = entry.suppliers.get(pi.supplierId);
      if (!prev || new Date(pi.date) > new Date(prev.date)) {
        entry.suppliers.set(pi.supplierId, { supplierName: pi.supplierName, netCost: pi.netCost, date: pi.date });
      }
    });
    return [...byProduct.values()].filter(p => p.suppliers.size >= 2);
  }, [purchaseItems]);

  if (comparison.length === 0) return null;

  return (
    <div className="rounded-xl overflow-hidden mb-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
      <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: C.greenSoft }}>
        <TrendingUp size={16} style={{ color: C.greenDark }} />
        <span className="text-sm font-semibold" style={{ color: C.greenDark, fontFamily: "'Space Grotesk', sans-serif" }}>Comparación de precios entre proveedores</span>
      </div>
      <div className="divide-y" style={{ borderColor: C.paperLine }}>
        {comparison.map(p => {
          const rows = [...p.suppliers.values()].sort((a, b) => a.netCost - b.netCost);
          return (
            <div key={p.name} className="px-4 py-2.5">
              <div className="text-sm font-medium mb-1" style={{ color: C.ink }}>{p.name}</div>
              <div className="flex flex-wrap gap-2">
                {rows.map((r, idx) => (
                  <span key={r.supplierName} className="text-xs px-2 py-1 rounded-md font-mono" style={idx === 0 ? { background: C.greenSoft, color: C.greenDark } : { background: C.paperDark, color: C.gray }}>
                    {r.supplierName}: {formatCLP(r.netCost)}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SupplierModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({
    id: initial?.id || uid("sup"),
    name: initial?.name || "",
    category: initial?.category || "",
    rut: initial?.rut || "",
    contactName: initial?.contactName || "",
    phone: initial?.phone || "",
    email: initial?.email || "",
    address: initial?.address || "",
    notes: initial?.notes || "",
  });
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function submit() {
    if (!form.name.trim()) return;
    onSave({ ...form, name: form.name.trim() });
  }
  return (
    <Modal title={initial?.id ? "Editar proveedor" : "Nuevo proveedor"} onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-x-3">
        <Field label="Nombre o razón social"><input autoFocus value={form.name} onChange={e => set("name", e.target.value)} className={inputCls} style={inputStyle()} /></Field>
        <Field label="Categoría / rubro"><input value={form.category} onChange={e => set("category", e.target.value)} className={inputCls} style={inputStyle()} placeholder="Ej. Frutas y verduras, Abarrotes, Bebidas…" /></Field>
        <Field label="RUT (opcional)"><input value={form.rut} onChange={e => set("rut", e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} placeholder="76.481.454-1" /></Field>
        <Field label="Persona de contacto (opcional)"><input value={form.contactName} onChange={e => set("contactName", e.target.value)} className={inputCls} style={inputStyle()} /></Field>
        <Field label="Teléfono (opcional)"><input value={form.phone} onChange={e => set("phone", e.target.value)} className={inputCls} style={inputStyle()} /></Field>
        <Field label="Correo (opcional)"><input value={form.email} onChange={e => set("email", e.target.value)} className={inputCls} style={inputStyle()} /></Field>
      </div>
      <Field label="Dirección (opcional)"><input value={form.address} onChange={e => set("address", e.target.value)} className={inputCls} style={inputStyle()} /></Field>
      <Field label="Notas (opcional)"><textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} className={inputCls} style={inputStyle()} placeholder="Condiciones de pago, días de despacho, etc." /></Field>
      <Btn full icon={Check} onClick={submit}>Guardar proveedor</Btn>
    </Modal>
  );
}

function SupplierCard({ s, role, invoicesIndex, purchaseItems, balance, onEdit, onDelete, onViewInvoice, onViewLedger, products }) {
  const [expanded, setExpanded] = useState(false);
  const invoices = useMemo(() => invoicesIndex.filter(i => i.supplierId === s.id), [invoicesIndex, s.id]);
  const items = useMemo(() => purchaseItems.filter(i => i.supplierId === s.id), [purchaseItems, s.id]);

  const totalGastado = invoices.reduce((a, i) => a + i.totalGross, 0);
  const lastDate = invoices[0]?.date || null;
  const linkedProducts = useMemo(() => products.filter(p => p.supplierId === s.id).length, [products, s.id]);

  const margin = useMemo(() => {
    let weightedMarginSum = 0, weightedBase = 0;
    items.forEach(it => {
      if (!it.productId) return;
      const product = products.find(p => p.id === it.productId);
      if (!product || !product.price) return;
      const base = it.netCost * it.qty;
      const m = ((product.price - it.netCost) / product.price) * 100;
      weightedMarginSum += m * base;
      weightedBase += base;
    });
    return weightedBase > 0 ? weightedMarginSum / weightedBase : null;
  }, [items, products]);

  return (
    <div className="rounded-xl p-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: C.greenSoft }}><Building2 size={16} style={{ color: C.greenDark }} /></div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: C.ink }}>{s.name}</div>
            {s.category && <Badge tone="brass">{s.category}</Badge>}
          </div>
        </div>
        {role === "admin" && (
          <div className="flex gap-1 flex-shrink-0">
            <button title="Editar" onClick={() => onEdit(s)} className="p-2.5 rounded-md" style={{ background: C.paperDark, color: C.ink }}><Pencil size={16} /></button>
            <button title="Eliminar" onClick={() => onDelete(s)} className="p-2.5 rounded-md" style={{ background: C.rustSoft, color: C.rust }}><Trash2 size={16} /></button>
          </div>
        )}
      </div>
      <div className="space-y-1 text-xs mb-2" style={{ color: C.gray }}>
        {s.contactName && <div>Contacto: {s.contactName}</div>}
        {s.phone && <div className="flex items-center gap-1"><Phone size={11} />{s.phone}</div>}
        {s.email && <div className="flex items-center gap-1"><Mail size={11} />{s.email}</div>}
        {s.rut && <div className="font-mono">RUT {s.rut}</div>}
        {s.address && <div>{s.address}</div>}
        {linkedProducts > 0 && <div className="flex items-center gap-1"><Package size={11} />{linkedProducts} producto(s) catalogado(s) a este proveedor</div>}
      </div>
      {s.notes && <p className="text-xs italic mb-2" style={{ color: C.grayLight }}>{s.notes}</p>}

      {invoices.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-2 pt-2" style={{ borderTop: `1px dashed ${C.paperLine}` }}>
            <div>
              <div className="text-[10px]" style={{ color: C.gray }}>Total comprado</div>
              <div className="font-mono font-semibold text-sm" style={{ color: C.greenDark }}>{formatCLP(totalGastado)}</div>
            </div>
            <div>
              <div className="text-[10px]" style={{ color: C.gray }}>Rentabilidad estimada</div>
              <div className="font-mono font-semibold text-sm" style={{ color: margin === null ? C.gray : margin >= 0 ? C.greenDark : C.rust }}>{margin === null ? "—" : `${margin.toFixed(0)}%`}</div>
            </div>
          </div>
          <div className="text-[11px] mt-1 mb-2" style={{ color: C.gray }}>{invoices.length} factura(s) · última {formatDate(lastDate)}</div>
          <button onClick={() => setExpanded(e => !e)} className="text-xs font-medium flex items-center gap-1" style={{ color: C.green }}>
            <Receipt size={12} /> {expanded ? "Ocultar facturas" : "Ver facturas catalogadas"}
          </button>
          {expanded && (
            <div className="mt-2 space-y-1">
              {invoices.map(inv => (
                <button key={inv.id} onClick={() => onViewInvoice(inv)} className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs hover:bg-black/[.03] text-left" style={{ background: C.paperDark }}>
                  <span className="flex items-center gap-1.5" style={{ color: C.ink }}>
                    {formatDate(inv.date)}{inv.refNumber ? ` · Doc ${inv.refNumber}` : ""}
                    {inv.noDocument && <Badge tone="rust">sin boleta</Badge>}
                    {inv.paymentMethod === "Crédito con el proveedor" && <Badge tone="brass">crédito</Badge>}
                  </span>
                  <span className="font-mono" style={{ color: C.gray }}>{formatCLP(inv.totalGross)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-xs pt-2" style={{ color: C.grayLight, borderTop: `1px dashed ${C.paperLine}` }}>Sin facturas catalogadas aún.</p>
      )}

      <div className="flex items-center justify-between pt-2 mt-2" style={{ borderTop: `1px dashed ${C.paperLine}` }}>
        <div>
          <div className="text-[10px]" style={{ color: C.gray }}>Se le debe (crédito)</div>
          <div className="font-mono font-semibold text-sm" style={{ color: balance > 0 ? C.rust : C.greenDark }}>{formatCLP(balance)}</div>
        </div>
        <button onClick={() => onViewLedger(s)} className="text-xs font-medium flex items-center gap-1" style={{ color: C.green }}>
          <History size={12} /> Ver movimientos y abonar
        </button>
      </div>
    </div>
  );
}

function SuppliersView({ suppliers, setSuppliers, invoicesIndex, purchaseItems, supplierLedger, setSupplierLedger, movements, setMovements, products, role, toast }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [viewingLedger, setViewingLedger] = useState(null);

  function balanceOf(supplierId) {
    return supplierLedger.reduce((s, m) => {
      if (m.supplierId !== supplierId) return s;
      return s + (m.type === "cargo" ? m.amount : -m.amount);
    }, 0);
  }

  const categories = useMemo(() => [...new Set(suppliers.map(s => s.category).filter(Boolean))].sort(), [suppliers]);
  const filtered = useMemo(() => {
    const q = normalize(query);
    return suppliers.filter(s => (!q || normalize(s.name).includes(q) || normalize(s.contactName).includes(q)) && (!category || s.category === category));
  }, [suppliers, query, category]);

  const totalDebt = suppliers.reduce((s, sup) => s + Math.max(0, balanceOf(sup.id)), 0);
  const withDebt = suppliers.filter(sup => balanceOf(sup.id) > 0).length;

  async function persist(ns) { setSuppliers(ns); await saveJSON("suppliers", ns); }

  async function saveSupplier(s) {
    const latest = await loadJSON("suppliers", suppliers);
    const exists = latest.some(x => x.id === s.id);
    const ns = exists ? latest.map(x => x.id === s.id ? s : x) : [...latest, s];
    await persist(ns);
    setEditing(null);
    toast(exists ? "Proveedor actualizado" : "Proveedor registrado", "success");
  }
  async function deleteSupplier(id) {
    const latest = await loadJSON("suppliers", suppliers);
    await persist(latest.filter(s => s.id !== id));
    setDeleting(null);
    toast("Proveedor eliminado", "success");
  }

  async function registerPayment(supplier, amount, paymentMethod, note) {
    const latestLedger = await loadJSON("supplier-ledger", supplierLedger);
    const abono = {
      id: uid("provmov"), supplierId: supplier.id, type: "abono",
      amount, date: new Date().toISOString(), invoiceId: null, paymentMethod, note: note || "",
    };
    const newLedger = [abono, ...latestLedger];
    setSupplierLedger(newLedger);
    await saveJSON("supplier-ledger", newLedger);

    // El abono sí es plata real saliendo de caja —a diferencia de la
    // recepción a crédito original, que no generó egreso— así que recién
    // acá se refleja como gasto en el libro de caja general.
    const latestMovements = await loadJSON("movements-log", movements);
    const asiento = {
      id: uid("mov"), date: abono.date, type: "egreso",
      concept: `Pago a proveedor — ${supplier.name}`,
      amount, category: "Pago a proveedor", auto: true,
      supplierId: supplier.id,
    };
    const newMovements = [asiento, ...latestMovements];
    setMovements(newMovements);
    await saveJSON("movements-log", newMovements);
    toast("Pago registrado", "success");
  }

  return (
    <div>
      <PriceComparisonPanel purchaseItems={purchaseItems} />

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-xl p-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <div className="text-xs mb-1" style={{ color: C.gray }}>Se debe a proveedores</div>
          <div className="text-lg font-semibold font-mono" style={{ color: C.rust }}>{formatCLP(totalDebt)}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <div className="text-xs mb-1" style={{ color: C.gray }}>Proveedores con deuda</div>
          <div className="text-lg font-semibold font-mono" style={{ color: C.ink }}>{withDebt}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.gray }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre o contacto…" className={`${inputCls} pl-9`} style={inputStyle()} />
        </div>
        <select value={category} onChange={e => setCategory(e.target.value)} className={`${inputCls} w-auto`} style={inputStyle()}>
          <option value="">Todas las categorías</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <Btn icon={Plus} onClick={() => setEditing({})}>Nuevo proveedor</Btn>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Building2} title="Sin proveedores" hint="Registra a los proveedores y vendedores con los que trabaja el negocio." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map(s => (
            <SupplierCard key={s.id} s={s} role={role} invoicesIndex={invoicesIndex} purchaseItems={purchaseItems} products={products} balance={balanceOf(s.id)} onEdit={setEditing} onDelete={setDeleting} onViewInvoice={setViewingInvoice} onViewLedger={setViewingLedger} />
          ))}
        </div>
      )}

      {editing !== null && <SupplierModal initial={editing.id ? editing : null} onClose={() => setEditing(null)} onSave={saveSupplier} />}
      {deleting && (
        <Modal title="Eliminar proveedor" onClose={() => setDeleting(null)}>
          <p className="text-sm mb-4" style={{ color: C.ink }}>¿Eliminar <strong>{deleting.name}</strong>? Las recepciones y facturas ya registradas no se modifican.</p>
          <div className="flex gap-2"><Btn variant="ghost" full onClick={() => setDeleting(null)}>Cancelar</Btn><Btn variant="rust" full onClick={() => deleteSupplier(deleting.id)}>Eliminar</Btn></div>
        </Modal>
      )}
      {viewingInvoice && <InvoiceViewerModal invoiceMeta={viewingInvoice} purchaseItems={purchaseItems} onClose={() => setViewingInvoice(null)} />}
      {viewingLedger && (
        <SupplierLedgerModal
          supplier={viewingLedger}
          ledger={supplierLedger}
          toast={toast}
          onRegisterPayment={registerPayment}
          onClose={() => setViewingLedger(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   CATEGORÍAS (secciones de productos) — CRUD
   Antes solo se creaban al vuelo desde ProductModal/DraftRow, sin ninguna
   pantalla para administrarlas. Acá se pueden crear a mano, renombrar,
   ordenar o desactivar. La creación-al-vuelo sigue intacta (migración
   0007): cualquiera del equipo puede seguir escribiendo una sección nueva
   al recibir mercadería, esta pantalla solo agrega la administración.
--------------------------------------------------------- */
function CategoriesView({ categories, setCategories, products, setProducts, toast }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [merging, setMerging] = useState(false);

  const countOf = (name) => products.filter(p => p.category === name).length;

  const sorted = useMemo(
    () => [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)),
    [categories]
  );
  const filtered = useMemo(() => {
    const q = normalize(query);
    return sorted.filter(c => !q || normalize(c.name).includes(q));
  }, [sorted, query]);

  async function persist(ns) { setCategories(ns); await saveJSON("product-categories", ns); }

  async function saveCategory(c) {
    const latest = await loadJSON("product-categories", categories);
    const exists = latest.some(x => x.id === c.id);
    const ns = exists ? latest.map(x => x.id === c.id ? c : x) : [...latest, c];
    await persist(ns);
    setEditing(null);
    toast(exists ? "Categoría actualizada" : "Categoría creada", "success");
  }
  /* Unificar: el catálogo llegó del Excel con la misma sección escrita de
     varias formas —"LACTEOS" y "LÁCTEOS", "UTILES ASEO" y "ASEO"—, y el
     sistema las trataba como secciones distintas. Acá se mueven todos los
     productos a la que se quiere conservar y las otras quedan desactivadas
     (no se borran: su historial sigue en pie). */
  async function aplicarUnificacion(destino, origenes) {
    const nombresOrigen = new Set(origenes.map(c => c.name));
    if (!destino || nombresOrigen.size === 0) return;
    try {
      // Se mueve por identificador, en la base, y recién después se relee: es
      // una sola consulta en vez de comparar el catálogo entero, y no se
      // confunde entre dos secciones que se escriben casi igual.
      const { movidos } = await unificarCategorias(destino.id, origenes.map(c => c.id));

      const [catalogoAlDia, categoriasAlDia] = await Promise.all([
        loadJSON("products-catalog", products),
        loadJSON("product-categories", categories),
      ]);
      setProducts(catalogoAlDia);
      setCategories(categoriasAlDia);

      setMerging(false);
      toast(`${movidos} producto(s) movidos a "${destino.name}" · ${origenes.length} categoría(s) desactivada(s)`, "success");
    } catch (e) {
      toast(friendlyError(e, "No se pudieron unificar las categorías"), "error");
    }
  }

  async function deleteCategory(id) {
    const latest = await loadJSON("product-categories", categories);
    await persist(latest.filter(c => c.id !== id));
    setDeleting(null);
    toast("Categoría desactivada", "success");
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.gray }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar sección…" className={`${inputCls} pl-9`} style={inputStyle()} />
        </div>
        <Btn variant="ghost" icon={Blend} onClick={() => setMerging(true)}>Unificar</Btn>
        <Btn icon={Plus} onClick={() => setEditing({})}>Nueva categoría</Btn>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Tags} title="Sin categorías" hint="Crea las secciones en las que se organiza el catálogo — Verduras, Frutas, Abarrotes, Aseo… También se crean solas al recibir un producto de un tipo nuevo." />
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <div className="divide-y" style={{ borderColor: C.paperLine }}>
            {filtered.map(c => (
              <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium" style={{ color: C.ink }}>{c.name}</div>
                  <div className="text-xs" style={{ color: C.gray }}>{countOf(c.name)} producto(s) · orden {c.order ?? 0}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditing(c)} className="p-2 rounded-lg hover:bg-black/5" style={{ color: C.gray }}><Pencil size={15} /></button>
                  <button onClick={() => setDeleting(c)} className="p-2 rounded-lg hover:bg-black/5" style={{ color: C.rust }}><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {merging && (
        <UnificarCategoriasModal
          categories={sorted}
          countOf={countOf}
          onClose={() => setMerging(false)}
          onConfirm={aplicarUnificacion}
        />
      )}
      {editing !== null && <CategoryModal initial={editing.id ? editing : null} onClose={() => setEditing(null)} onSave={saveCategory} />}
      {deleting && (
        <Modal title="Desactivar categoría" onClose={() => setDeleting(null)}>
          <p className="text-sm mb-4" style={{ color: C.ink }}>
            ¿Desactivar <strong>{deleting.name}</strong>?
            {countOf(deleting.name) > 0
              ? ` Los ${countOf(deleting.name)} producto(s) que ya la tienen asignada la conservan tal cual — solo deja de estar disponible para elegirla en productos nuevos.`
              : " No hay productos usándola en este momento."}
          </p>
          <div className="flex gap-2"><Btn variant="ghost" full onClick={() => setDeleting(null)}>Cancelar</Btn><Btn variant="rust" full onClick={() => deleteCategory(deleting.id)}>Desactivar</Btn></div>
        </Modal>
      )}
    </div>
  );
}

/* Distancia de edición, acotada: sirve para detectar que "CONCERVAS" y
   "CONSERVAS" son la misma sección escrita con la mano apurada. */
function distanciaTexto(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 99;
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = fila[j];
      fila[j] = a[i - 1] === b[j - 1]
        ? anterior
        : 1 + Math.min(anterior, fila[j], fila[j - 1]);
      anterior = guardado;
    }
  }
  return fila[b.length];
}

/* ¿Son la misma sección escrita distinto? Se compara sin tildes ni mayúsculas
   ni espacios: así "LÁCTEOS" y "LACTEOS" caen juntas. Después se acepta que
   una contenga a la otra ("UTILES ASEO" / "ASEO") o que estén a un par de
   letras de distancia ("CONCERVAS" / "CONSERVAS"). */
function pareceLaMisma(a, b) {
  const x = normalize(a).replace(/[^a-z0-9]/g, "");
  const y = normalize(b).replace(/[^a-z0-9]/g, "");
  if (!x || !y || x === y) return x === y;
  // Que una contenga a la otra no basta: "ASEO" está dentro de "ASEO PERSONAL"
  // y son secciones distintas. Solo cuenta si lo que sobra es poco —"UTILES
  // ASEO" y "UTILES DE ASEO"—, no una palabra entera que cambia el sentido.
  if (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x))
      && Math.abs(x.length - y.length) <= 3) return true;
  return distanciaTexto(x, y) <= (Math.min(x.length, y.length) >= 6 ? 2 : 1);
}

/* Unificar secciones repetidas. El catálogo vino del Excel con la misma
   sección escrita de varias maneras, así que la pantalla propone sola las
   candidatas en vez de hacer buscarlas a mano entre sesenta. */
function UnificarCategoriasModal({ categories, countOf, onClose, onConfirm }) {
  const [destinoId, setDestinoId] = useState("");
  const [elegidas, setElegidas] = useState(() => new Set());
  const [trabajando, setTrabajando] = useState(false);

  const destino = categories.find(c => c.id === destinoId) || null;

  // Al elegir la sección que se conserva, se marcan solas las que se le
  // parecen; igual se pueden desmarcar o agregar otras a mano.
  function elegirDestino(id) {
    setDestinoId(id);
    const d = categories.find(c => c.id === id);
    if (!d) return setElegidas(new Set());
    setElegidas(new Set(
      categories.filter(c => c.id !== id && pareceLaMisma(c.name, d.name)).map(c => c.id)
    ));
  }

  const alternar = (id) => setElegidas(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  const origenes = categories.filter(c => elegidas.has(c.id) && c.id !== destinoId);
  const aMover = origenes.reduce((s, c) => s + countOf(c.name), 0);

  const ordenadas = useMemo(() => {
    if (!destino) return categories;
    return [...categories].sort((a, b) => {
      const pa = pareceLaMisma(a.name, destino.name) ? 0 : 1;
      const pb = pareceLaMisma(b.name, destino.name) ? 0 : 1;
      return pa - pb || a.name.localeCompare(b.name, "es");
    });
  }, [categories, destino]);

  async function submit() {
    if (trabajando || !destino || origenes.length === 0) return;
    setTrabajando(true);
    try { await onConfirm(destino, origenes); }
    finally { setTrabajando(false); }
  }

  return (
    <Modal title="Unificar categorías" onClose={onClose}>
      <Field label="Se conserva esta categoría">
        <select value={destinoId} onChange={e => elegirDestino(e.target.value)} className={inputCls} style={inputStyle()}>
          <option value="">Elige la categoría correcta…</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({countOf(c.name)})</option>
          ))}
        </select>
      </Field>

      {destino && (
        <>
          <p className="text-sm mb-2" style={{ color: C.gray }}>
            Marca las que son lo mismo escrito distinto. Sus productos pasan a
            <strong style={{ color: C.ink }}> {destino.name}</strong> y ellas quedan desactivadas.
          </p>
          <div className="rounded-lg overflow-hidden mb-4 max-h-72 overflow-y-auto" style={{ border: `1.5px solid ${C.paperLine}` }}>
            {ordenadas.filter(c => c.id !== destinoId).map(c => {
              const marcada = elegidas.has(c.id);
              const sugerida = pareceLaMisma(c.name, destino.name);
              return (
                <button key={c.id} onClick={() => alternar(c.id)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left"
                  style={{ borderBottom: `1px solid ${C.paperLine}`, background: marcada ? C.greenSoft : "#fff" }}>
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                      style={{ background: marcada ? C.green : "#fff", border: `1.5px solid ${marcada ? C.green : C.paperLine}` }}>
                      {marcada && <Check size={13} style={{ color: "#fff" }} />}
                    </span>
                    <span className="text-sm truncate" style={{ color: C.ink }}>{c.name}</span>
                    {sugerida && <Badge tone="brass">se parece</Badge>}
                  </span>
                  <span className="text-xs flex-shrink-0" style={{ color: C.gray }}>{countOf(c.name)} prod.</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {origenes.length > 0 && (
        <div className="rounded-lg p-3 mb-4" style={{ background: C.brassSoft }}>
          <p className="text-xs" style={{ color: C.brassText }}>
            Se moverán <strong>{aMover} producto(s)</strong> a "{destino.name}" y se desactivarán {origenes.length} categoría(s).
            Los productos no se tocan en nada más: mismo precio, mismo stock, mismo historial.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Btn variant="ghost" full onClick={onClose}>Cancelar</Btn>
        <Btn full icon={trabajando ? Loader2 : Blend} disabled={trabajando || !destino || origenes.length === 0} onClick={submit}>
          {trabajando ? "Unificando…" : "Unificar"}
        </Btn>
      </div>
    </Modal>
  );
}

function CategoryModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({
    id: initial?.id || uid("cat"),
    name: initial?.name || "",
    order: initial?.order ?? 0,
  });
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function submit() {
    if (!form.name.trim()) return;
    onSave({ ...form, name: form.name.trim(), order: Number(form.order) || 0 });
  }
  return (
    <Modal title={initial?.id ? "Editar categoría" : "Nueva categoría"} onClose={onClose}>
      <Field label="Nombre"><input autoFocus value={form.name} onChange={e => set("name", e.target.value)} className={inputCls} style={{ ...inputStyle(), textTransform: "uppercase" }} placeholder="Ej. Verduras, Frutas, Abarrotes…" /></Field>
      <Field label="Orden (opcional)"><input type="number" value={form.order} onChange={e => set("order", e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} placeholder="0" /></Field>
      <p className="text-xs mb-4" style={{ color: C.gray }}>El orden decide en qué posición aparece esta sección en las listas — menor número, más arriba.</p>
      <Btn full icon={Check} onClick={submit}>Guardar</Btn>
    </Modal>
  );
}

/* ---------------------------------------------------------
   FIADO — CLIENTES Y SU LIBRO DE DEUDA
   Migración 0012. "quick" en CustomerModal es el formulario reducido que se
   usa desde el POS (solo nombre y teléfono, para no frenar una venta);
   desde acá (administración) se completa con dirección, límite y notas.
--------------------------------------------------------- */
function CustomerModal({ initial, onClose, onSave, quick }) {
  const [form, setForm] = useState({
    id: initial?.id || uid("cus"),
    name: initial?.name || "",
    phone: initial?.phone || "",
    address: initial?.address || "",
    notes: initial?.notes || "",
    creditLimit: initial?.creditLimit ?? "",
  });
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function submit() {
    if (!form.name.trim()) return;
    onSave({
      ...form,
      name: form.name.trim(),
      creditLimit: form.creditLimit === "" ? null : Number(form.creditLimit),
    });
  }
  return (
    <Modal title={initial?.id ? "Editar cliente" : "Nuevo cliente"} onClose={onClose}>
      <Field label="Nombre"><input autoFocus value={form.name} onChange={e => set("name", e.target.value)} onKeyDown={e => quick && e.key === "Enter" && submit()} className={inputCls} style={inputStyle()} placeholder="Nombre del cliente" /></Field>
      <Field label="Teléfono (opcional)"><input value={form.phone} onChange={e => set("phone", e.target.value)} onKeyDown={e => quick && e.key === "Enter" && submit()} className={inputCls} style={inputStyle()} /></Field>
      {!quick && (
        <>
          <Field label="Dirección (opcional)"><input value={form.address} onChange={e => set("address", e.target.value)} className={inputCls} style={inputStyle()} /></Field>
          <Field label="Límite de crédito (opcional)">
            <input type="number" value={form.creditLimit} onChange={e => set("creditLimit", e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} placeholder="Sin límite definido" />
          </Field>
          <Field label="Notas (opcional)"><textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} className={inputCls} style={inputStyle()} placeholder="Referencias, condiciones de pago, etc." /></Field>
        </>
      )}
      <Btn full icon={Check} onClick={submit}>Guardar cliente</Btn>
    </Modal>
  );
}

function CustomerLedgerModal({ customer, ledger, onRegisterPayment, toast, onClose }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Efectivo");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const entries = useMemo(() => {
    return ledger
      .filter(m => m.customerId === customer.id)
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [ledger, customer.id]);

  const balance = entries.reduce((s, m) => s + (m.type === "cargo" ? m.amount : -m.amount), 0);

  async function submit() {
    const n = Number(amount);
    if (!n || n <= 0) return toast("Ingresa un monto válido", "error");
    setSaving(true);
    try {
      await onRegisterPayment(customer, n, method, note.trim());
      setAmount(""); setNote("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Fiado — ${customer.name}`} onClose={onClose} wide>
      <div className="rounded-lg p-3 mb-3 flex items-center justify-between" style={{ background: C.ink }}>
        <span className="text-sm" style={{ color: C.grayLight }}>Debe actualmente</span>
        <span className="font-mono font-bold text-lg" style={{ color: balance > 0 ? C.brass : "#fff" }}>{formatCLP(balance)}</span>
      </div>

      <div className="rounded-lg p-3 mb-3" style={{ background: C.paperDark, border: `1.5px solid ${C.paperLine}` }}>
        <div className="text-xs font-semibold mb-2" style={{ color: C.ink }}>Registrar abono (pago que hizo el cliente)</div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Monto" className={`${inputCls} font-mono`} style={inputStyle()} />
          <select value={method} onChange={e => setMethod(e.target.value)} className={inputCls} style={inputStyle()}>
            {["Efectivo", "Débito", "Crédito", "Transferencia"].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Nota (opcional)" className={`${inputCls} mb-2`} style={inputStyle()} />
        <Btn full size="sm" icon={saving ? Loader2 : Check} disabled={saving} onClick={submit}>{saving ? "Guardando…" : "Registrar abono"}</Btn>
      </div>

      <div className="text-xs font-semibold mb-1.5" style={{ color: C.ink }}>Historial</div>
      {entries.length === 0 ? (
        <p className="text-xs" style={{ color: C.gray }}>Sin movimientos todavía.</p>
      ) : (
        <div className="rounded-lg overflow-hidden" style={{ border: `1.5px solid ${C.paperLine}` }}>
          <div className="max-h-72 overflow-y-auto divide-y" style={{ borderColor: C.paperLine }}>
            {entries.map(m => (
              <div key={m.id} className="flex items-center justify-between px-3 py-2 text-xs">
                <div>
                  <div style={{ color: C.ink }}>{m.type === "cargo" ? "Venta fiada" : `Abono${m.paymentMethod ? ` (${m.paymentMethod})` : ""}`}</div>
                  <div style={{ color: C.gray }}>{formatDate(m.date)}{m.note ? ` · ${m.note}` : ""}</div>
                </div>
                <span className="font-mono font-semibold" style={{ color: m.type === "cargo" ? C.rust : C.greenDark }}>
                  {m.type === "cargo" ? "+" : "−"}{formatCLP(m.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3"><Btn variant="ghost" full onClick={onClose}>Cerrar</Btn></div>
    </Modal>
  );
}

/* ---------------------------------------------------------
   CRÉDITO CON PROVEEDORES — libro de deuda del negocio
   Migración 0014, espejo de CustomerLedgerModal en sentido contrario:
   acá el cargo nace de recibir mercadería "a crédito" en Recepción, y el
   abono es un pago que EL GALPÓN le hizo al proveedor.
--------------------------------------------------------- */
function SupplierLedgerModal({ supplier, ledger, onRegisterPayment, toast, onClose }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Efectivo");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const entries = useMemo(() => {
    return ledger
      .filter(m => m.supplierId === supplier.id)
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [ledger, supplier.id]);

  const balance = entries.reduce((s, m) => s + (m.type === "cargo" ? m.amount : -m.amount), 0);

  async function submit() {
    const n = Number(amount);
    if (!n || n <= 0) return toast("Ingresa un monto válido", "error");
    setSaving(true);
    try {
      await onRegisterPayment(supplier, n, method, note.trim());
      setAmount(""); setNote("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Crédito — ${supplier.name}`} onClose={onClose} wide>
      <div className="rounded-lg p-3 mb-3 flex items-center justify-between" style={{ background: C.ink }}>
        <span className="text-sm" style={{ color: C.grayLight }}>Se le debe actualmente</span>
        <span className="font-mono font-bold text-lg" style={{ color: balance > 0 ? C.brass : "#fff" }}>{formatCLP(balance)}</span>
      </div>

      <div className="rounded-lg p-3 mb-3" style={{ background: C.paperDark, border: `1.5px solid ${C.paperLine}` }}>
        <div className="text-xs font-semibold mb-2" style={{ color: C.ink }}>Registrar abono (pago que se le hizo al proveedor)</div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Monto" className={`${inputCls} font-mono`} style={inputStyle()} />
          <select value={method} onChange={e => setMethod(e.target.value)} className={inputCls} style={inputStyle()}>
            {["Efectivo", "Transferencia"].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Nota (opcional)" className={`${inputCls} mb-2`} style={inputStyle()} />
        <Btn full size="sm" icon={saving ? Loader2 : Check} disabled={saving} onClick={submit}>{saving ? "Guardando…" : "Registrar abono"}</Btn>
      </div>

      <div className="text-xs font-semibold mb-1.5" style={{ color: C.ink }}>Historial</div>
      {entries.length === 0 ? (
        <p className="text-xs" style={{ color: C.gray }}>Sin movimientos todavía.</p>
      ) : (
        <div className="rounded-lg overflow-hidden" style={{ border: `1.5px solid ${C.paperLine}` }}>
          <div className="max-h-72 overflow-y-auto divide-y" style={{ borderColor: C.paperLine }}>
            {entries.map(m => (
              <div key={m.id} className="flex items-center justify-between px-3 py-2 text-xs">
                <div>
                  <div style={{ color: C.ink }}>{m.type === "cargo" ? "Recepción a crédito" : `Abono${m.paymentMethod ? ` (${m.paymentMethod})` : ""}`}</div>
                  <div style={{ color: C.gray }}>{formatDate(m.date)}{m.note ? ` · ${m.note}` : ""}</div>
                </div>
                <span className="font-mono font-semibold" style={{ color: m.type === "cargo" ? C.rust : C.greenDark }}>
                  {m.type === "cargo" ? "+" : "−"}{formatCLP(m.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3"><Btn variant="ghost" full onClick={onClose}>Cerrar</Btn></div>
    </Modal>
  );
}

function ClientesView({ customers, setCustomers, customerLedger, setCustomerLedger, movements, setMovements, toast }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [viewingLedger, setViewingLedger] = useState(null);

  function balanceOf(customerId) {
    return customerLedger.reduce((s, m) => {
      if (m.customerId !== customerId) return s;
      return s + (m.type === "cargo" ? m.amount : -m.amount);
    }, 0);
  }

  const filtered = useMemo(() => {
    const q = normalize(query);
    return customers.filter(c => !q || normalize(c.name).includes(q) || normalize(c.phone).includes(q));
  }, [customers, query]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sorted = useMemo(() => [...filtered].sort((a, b) => balanceOf(b.id) - balanceOf(a.id)), [filtered, customerLedger]);

  const totalDebt = customers.reduce((s, c) => s + Math.max(0, balanceOf(c.id)), 0);
  const withDebt = customers.filter(c => balanceOf(c.id) > 0).length;
  const overLimit = customers.filter(c => c.creditLimit != null && balanceOf(c.id) > c.creditLimit).length;

  async function persist(nc) { setCustomers(nc); await saveJSON("customers", nc); }

  async function saveCustomer(c) {
    const latest = await loadJSON("customers", customers);
    const exists = latest.some(x => x.id === c.id);
    const nc = exists ? latest.map(x => x.id === c.id ? c : x) : [...latest, c];
    await persist(nc);
    setEditing(null);
    toast(exists ? "Cliente actualizado" : "Cliente registrado", "success");
  }
  async function deleteCustomer(id) {
    const latest = await loadJSON("customers", customers);
    await persist(latest.filter(c => c.id !== id));
    setDeleting(null);
    toast("Cliente eliminado", "success");
  }

  async function registerPayment(customer, amount, paymentMethod, note) {
    const latestLedger = await loadJSON("customer-ledger", customerLedger);
    const abono = {
      id: uid("cliemov"), customerId: customer.id, type: "abono",
      amount, date: new Date().toISOString(), saleId: null, paymentMethod, note: note || "",
    };
    const newLedger = [abono, ...latestLedger];
    setCustomerLedger(newLedger);
    await saveJSON("customer-ledger", newLedger);

    // El abono sí es plata real entrando a la caja —a diferencia de la venta
    // fiada original, que solo quedó registrada como deuda— así que recién
    // acá se refleja como ingreso en el libro de caja general.
    const latestMovements = await loadJSON("movements-log", movements);
    const asiento = {
      id: uid("mov"), date: abono.date, type: "ingreso",
      concept: `Abono de fiado — ${customer.name}`,
      amount, category: "Abono de fiado", auto: true,
    };
    const newMovements = [asiento, ...latestMovements];
    setMovements(newMovements);
    await saveJSON("movements-log", newMovements);
    toast("Abono registrado", "success");
  }

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
        <div className="rounded-xl p-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <div className="text-xs mb-1" style={{ color: C.gray }}>Total por cobrar</div>
          <div className="text-lg font-semibold font-mono" style={{ color: C.rust }}>{formatCLP(totalDebt)}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <div className="text-xs mb-1" style={{ color: C.gray }}>Clientes con deuda</div>
          <div className="text-lg font-semibold font-mono" style={{ color: C.ink }}>{withDebt}</div>
        </div>
        <div className="rounded-xl p-4 col-span-2 lg:col-span-1" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <div className="text-xs mb-1" style={{ color: C.gray }}>Sobre su límite</div>
          <div className="text-lg font-semibold font-mono" style={{ color: overLimit > 0 ? C.rust : C.ink }}>{overLimit}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.gray }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre o teléfono…" className={`${inputCls} pl-9`} style={inputStyle()} />
        </div>
        <Btn icon={Plus} onClick={() => setEditing({})}>Nuevo cliente</Btn>
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon={CreditCard} title="Sin clientes" hint="Registra a los clientes a los que se les puede vender fiado, o créalos directamente desde el POS al elegir 'Fiado' como forma de pago." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {sorted.map(c => {
            const balance = balanceOf(c.id);
            const over = c.creditLimit != null && balance > c.creditLimit;
            return (
              <div key={c.id} className="rounded-xl p-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: balance > 0 ? C.brassSoft : C.greenSoft }}>
                      <CreditCard size={16} style={{ color: balance > 0 ? C.brassText : C.greenDark }} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: C.ink }}>{c.name}</div>
                      {c.phone && <div className="text-xs" style={{ color: C.gray }}>{c.phone}</div>}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button title="Editar" onClick={() => setEditing(c)} className="p-2.5 rounded-md" style={{ background: C.paperDark, color: C.ink }}><Pencil size={16} /></button>
                    <button title="Eliminar" onClick={() => setDeleting(c)} className="p-2.5 rounded-md" style={{ background: C.rustSoft, color: C.rust }}><Trash2 size={16} /></button>
                  </div>
                </div>
                {c.address && <p className="text-xs mb-2" style={{ color: C.gray }}>{c.address}</p>}
                <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px dashed ${C.paperLine}` }}>
                  <div>
                    <div className="text-[10px]" style={{ color: C.gray }}>Debe actualmente</div>
                    <div className="font-mono font-semibold text-sm" style={{ color: balance > 0 ? C.rust : C.greenDark }}>{formatCLP(balance)}</div>
                  </div>
                  {c.creditLimit != null && <Badge tone={over ? "rust" : "gray"}>límite {formatCLP(c.creditLimit)}</Badge>}
                </div>
                <button onClick={() => setViewingLedger(c)} className="mt-2 text-xs font-medium flex items-center gap-1" style={{ color: C.green }}>
                  <History size={12} /> Ver movimientos y abonar
                </button>
              </div>
            );
          })}
        </div>
      )}

      {editing !== null && <CustomerModal initial={editing.id ? editing : null} onClose={() => setEditing(null)} onSave={saveCustomer} />}
      {deleting && (
        <Modal title="Eliminar cliente" onClose={() => setDeleting(null)}>
          <p className="text-sm mb-4" style={{ color: C.ink }}>¿Eliminar <strong>{deleting.name}</strong>? Las ventas y movimientos de fiado ya registrados no se modifican.</p>
          <div className="flex gap-2"><Btn variant="ghost" full onClick={() => setDeleting(null)}>Cancelar</Btn><Btn variant="rust" full onClick={() => deleteCustomer(deleting.id)}>Eliminar</Btn></div>
        </Modal>
      )}
      {viewingLedger && (
        <CustomerLedgerModal
          customer={viewingLedger}
          ledger={customerLedger}
          toast={toast}
          onRegisterPayment={registerPayment}
          onClose={() => setViewingLedger(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   INVENTARIO
--------------------------------------------------------- */
/* Corregir el nombre de un producto. Es lo único que toca: no cambia precio,
   costo ni stock, así que no necesita aprobación de nadie — un nombre mal
   escrito lo ve primero quien está frente a la repisa. */
function CorregirNombreModal({ product, onClose, onSave }) {
  const [nombre, setNombre] = useState(product?.name || "");
  const [guardando, setGuardando] = useState(false);
  const limpio = nombre.trim();

  async function submit() {
    if (!limpio || guardando) return;
    setGuardando(true);
    try { await onSave(limpio); } finally { setGuardando(false); }
  }

  return (
    <Modal title="Corregir nombre" onClose={onClose}>
      <div className="rounded-lg p-3 mb-4" style={{ background: C.paperDark }}>
        <div className="text-xs" style={{ color: C.gray }}>Nombre actual</div>
        <div className="text-sm font-semibold" style={{ color: C.ink }}>{product?.name}</div>
        {product?.barcode && (
          <div className="text-xs font-mono mt-1" style={{ color: C.gray }}>{product.barcode}</div>
        )}
      </div>
      <Field label="Nombre corregido">
        <input autoFocus value={nombre} onChange={e => setNombre(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          className={inputCls} style={inputStyle()} />
      </Field>
      <div className="flex gap-2">
        <Btn variant="ghost" full onClick={onClose}>Cancelar</Btn>
        <Btn full icon={guardando ? Loader2 : Check} disabled={!limpio || guardando} onClick={submit}>
          {guardando ? "Guardando…" : "Guardar"}
        </Btn>
      </div>
    </Modal>
  );
}

function ProductTable({ items, role, suppliers, onRestock, onShrink, onEdit, onDelete, onRename }) {
  const [page, setPage] = useState(0);
  const pageSize = 40;
  useEffect(() => { setPage(0); }, [items]);
  const pageItems = items.slice(page * pageSize, page * pageSize + pageSize);

  if (items.length === 0) {
    return <EmptyState icon={Package} title="Sin productos" hint="No hay nada que mostrar aquí." />;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: C.gray, borderBottom: `1.5px solid ${C.paperLine}` }}>
              <th className="px-4 py-2.5 font-medium">Producto</th>
              <th className="px-4 py-2.5 font-medium">Código</th>
              <th className="px-4 py-2.5 font-medium text-right">Precio</th>
              {role === "admin" && <th className="px-4 py-2.5 font-medium text-right">Costo</th>}
              <th className="px-4 py-2.5 font-medium text-right">Stock</th>
              <th className="px-4 py-2.5 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map(p => {
              const supplierName = p.supplierId ? suppliers.find(s => s.id === p.supplierId)?.name : null;
              return (
              <tr key={p.id} style={{ borderBottom: `1px solid ${C.paperLine}` }}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium" style={{ color: C.ink }}>{p.name}</span>
                    {p.quickAccess && <span title="Acceso rápido en Vender"><Tags size={12} style={{ color: C.green }} /></span>}
                  </div>
                  {role === "admin" && supplierName && <div className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: C.grayLight }}><Building2 size={10} />{supplierName}</div>}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: C.gray }}>{p.barcode}</td>
                <td className="px-4 py-2.5 text-right font-mono">
                  <div className="flex items-center justify-end gap-1.5">
                    {formatCLP(p.price)}{p.unitType === "peso" ? "/kg" : ""}
                    {role === "admin" && p.priceApproval && <Badge tone="brass">pend.</Badge>}
                  </div>
                </td>
                {role === "admin" && <td className="px-4 py-2.5 text-right font-mono" style={{ color: C.gray }}>{formatCLP(p.cost)}</td>}
                <td className="px-4 py-2.5 text-right">
                  <Badge tone={p.stock <= p.minStock ? "rust" : "green"}>{p.stock}{p.unitType === "peso" ? " kg" : ""}</Badge>
                </td>
                {role === "admin" && (
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <button title="Reponer stock" onClick={() => onRestock(p)} className="p-2.5 rounded-md" style={{ background: C.greenSoft, color: C.greenDark }}><PackagePlus size={17} /></button>
                      <button title="Registrar merma" onClick={() => onShrink(p)} className="p-2.5 rounded-md" style={{ background: C.rustSoft, color: C.rust }}><PackageMinus size={17} /></button>
                      <button title="Editar" onClick={() => onEdit(p)} className="p-2.5 rounded-md" style={{ background: C.paperDark, color: C.ink }}><Pencil size={17} /></button>
                      <button title="Eliminar" onClick={() => onDelete(p)} className="p-2.5 rounded-md" style={{ background: C.rustSoft, color: C.rust }}><Trash2 size={17} /></button>
                    </div>
                  </td>
                )}
                {role !== "admin" && (
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      {/* Corregir el nombre no cambia plata ni stock: quien está
                          frente a la repisa es quien ve que dice "COCA COLA 15L"
                          en vez de 1.5L, y puede arreglarlo sin pedir permiso. */}
                      <button title="Corregir nombre" onClick={() => onRename(p)} className="p-2.5 rounded-md" style={{ background: C.paperDark, color: C.ink }}><Pencil size={17} /></button>
                      <button title="Registrar merma" onClick={() => onShrink(p)} className="p-2.5 rounded-md" style={{ background: C.rustSoft, color: C.rust }}><PackageMinus size={17} /></button>
                    </div>
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager page={page} setPage={setPage} total={items.length} pageSize={pageSize} />
    </>
  );
}

function UnclassifiedRow({ product, categoryOptions, onAssign }) {
  const [choice, setChoice] = useState("");
  const [customName, setCustomName] = useState("");
  const usingCustom = choice === "__new__";

  function confirm() {
    const finalName = usingCustom ? customName.trim() : choice;
    if (!finalName) return;
    onAssign(product, finalName);
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5 px-4 py-3" style={{ borderBottom: `1px solid ${C.paperLine}` }}>
      <div className="flex-1 min-w-[160px]">
        <div className="font-medium text-sm" style={{ color: C.ink }}>{product.name}</div>
        <div className="text-xs font-mono" style={{ color: C.gray }}>{product.barcode} · {formatCLP(product.price)}{product.unitType === "peso" ? "/kg" : ""} · stock {product.stock}</div>
      </div>
      <select value={choice} onChange={e => setChoice(e.target.value)} className={`${inputCls} w-auto text-sm`} style={inputStyle()}>
        <option value="">Elegir categoría…</option>
        {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
        <option value="__new__">+ Categoría nueva…</option>
      </select>
      {usingCustom && (
        <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Nombre de la categoría" className={`${inputCls} w-auto text-sm`} style={{ ...inputStyle(), textTransform: "uppercase" }} />
      )}
      <Btn size="sm" icon={Check} disabled={!choice || (usingCustom && !customName.trim())} onClick={confirm}>Asignar</Btn>
    </div>
  );
}

/* Productos sin stock desde hace 6 meses o más: candidatos a sacarlos del
   catálogo porque ya no se venden ni se reponen. No se borran directo —un
   administrador pide la eliminación y otro (o el mismo, más adelante) la
   aprueba— para que no se pierda un producto por un clic apurado. */
function StaleStockPanel({ products, setProducts, session, toast }) {
  const now = Date.now();
  const mesMs = 1000 * 60 * 60 * 24 * 30.44;
  const pending = products.filter(p => p.deletionRequest);
  const candidates = products.filter(p =>
    p.stock === 0 && p.stockZeroSince && !p.deletionRequest && (now - new Date(p.stockZeroSince).getTime()) >= mesMs * 6
  );
  if (pending.length === 0 && candidates.length === 0) return null;

  function monthsSince(iso) { return Math.floor((now - new Date(iso).getTime()) / mesMs); }

  async function requestDeletion(product) {
    const latest = await loadJSON("products-catalog", products);
    const np = latest.map(p => p.id === product.id ? { ...p, deletionRequest: { requestedBy: session.name, date: new Date().toISOString() } } : p);
    setProducts(np); await saveJSON("products-catalog", np);
    toast("Eliminación solicitada — queda pendiente de aprobación", "success");
  }
  async function approveDeletion(product) {
    const latest = await loadJSON("products-catalog", products);
    const np = latest.filter(p => p.id !== product.id);
    setProducts(np); await saveJSON("products-catalog", np);
    toast(`"${product.name}" eliminado del catálogo`, "success");
  }
  async function cancelRequest(product) {
    const latest = await loadJSON("products-catalog", products);
    const np = latest.map(p => p.id === product.id ? { ...p, deletionRequest: null } : p);
    setProducts(np); await saveJSON("products-catalog", np);
    toast("Solicitud de eliminación cancelada", "success");
  }

  return (
    <div className="rounded-xl overflow-hidden mb-4" style={{ background: "#fff", border: `1.5px solid ${C.rust}` }}>
      <div className="px-4 py-3 flex items-center gap-2" style={{ background: C.rustSoft }}>
        <PackageX size={16} style={{ color: C.rust }} />
        <span className="text-sm font-semibold" style={{ color: C.rust, fontFamily: "'Space Grotesk', sans-serif" }}>Sin stock hace 6 meses o más ({candidates.length + pending.length})</span>
      </div>
      <div className="divide-y" style={{ borderColor: C.paperLine }}>
        {pending.map(p => (
          <div key={p.id} className="px-4 py-3 flex flex-wrap items-center gap-2.5">
            <div className="flex-1 min-w-[180px]">
              <div className="text-sm font-medium" style={{ color: C.ink }}>{p.name}</div>
              <div className="text-xs" style={{ color: C.gray }}>Sin stock hace {monthsSince(p.stockZeroSince)} meses · Eliminación pedida por {p.deletionRequest.requestedBy}</div>
            </div>
            <Badge tone="brass">pendiente de aprobar</Badge>
            <Btn size="sm" icon={Check} onClick={() => approveDeletion(p)}>Aprobar y eliminar</Btn>
            <Btn size="sm" variant="ghost" onClick={() => cancelRequest(p)}>Cancelar</Btn>
          </div>
        ))}
        {candidates.map(p => (
          <div key={p.id} className="px-4 py-3 flex flex-wrap items-center gap-2.5">
            <div className="flex-1 min-w-[180px]">
              <div className="text-sm font-medium" style={{ color: C.ink }}>{p.name}</div>
              <div className="text-xs" style={{ color: C.gray }}>{p.category || "Sin categoría"} · Sin stock hace {monthsSince(p.stockZeroSince)} meses</div>
            </div>
            <Btn size="sm" variant="ghost" icon={Trash2} onClick={() => requestDeletion(p)}>Solicitar eliminación</Btn>
          </div>
        ))}
      </div>
    </div>
  );
}

function InventoryView({ products, setProducts, movements, setMovements, purchaseItems, setPurchaseItems, suppliers, setSuppliers, categories, settings, role, session, toast }) {
  const [query, setQuery] = useState("");
  const [selectedSection, setSelectedSection] = useState(null); // null = grilla de secciones, "__unclassified__", o nombre de categoría
  const [editing, setEditing] = useState(null);
  const [restocking, setRestocking] = useState(null);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [shrinking, setShrinking] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [shrinkageSummaryOpen, setShrinkageSummaryOpen] = useState(false);

  // Productos que ya estaban en 0 antes de que existiera este seguimiento no
  // tienen fecha registrada. No hay cómo saber desde cuándo llevan así, así
  // que se marcan desde hoy la primera vez que se detectan — el aviso de "6
  // meses o más" empieza a contar desde ese momento, no desde antes.
  useEffect(() => {
    if (role !== "admin") return;
    const sinFecha = products.filter(p => p.stock === 0 && !p.stockZeroSince);
    if (sinFecha.length === 0) return;
    (async () => {
      const latest = await loadJSON("products-catalog", products);
      const now = new Date().toISOString();
      const np = latest.map(p => (p.stock === 0 && !p.stockZeroSince) ? { ...p, stockZeroSince: now } : p);
      setProducts(np);
      await saveJSON("products-catalog", np, { origen: "backfill_stock_cero" });
    })();
  }, [products, role]);

  function isUnclassified(p) { return !p.category || !p.category.trim() || p.category.trim() === "Sin Clasificar"; }

  const { sections, unclassifiedCount } = useMemo(() => {
    const map = new Map();
    let unclassified = 0;
    products.forEach(p => {
      if (isUnclassified(p)) { unclassified++; return; }
      const cat = p.category.trim();
      map.set(cat, (map.get(cat) || 0) + 1);
    });
    const list = [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b));
    return { sections: list, unclassifiedCount: unclassified };
  }, [products]);

  const categoryOptions = useMemo(() => sections.map(s => s.name), [sections]);

  const searchResults = useMemo(() => {
    if (!query) return null;
    const q = normalize(query);
    return products.filter(p => normalize(p.name).includes(q) || normalize(p.barcode).includes(q));
  }, [products, query]);

  const sectionItems = useMemo(() => {
    if (selectedSection === "__unclassified__") return products.filter(isUnclassified);
    if (selectedSection) return products.filter(p => !isUnclassified(p) && p.category.trim() === selectedSection);
    return [];
  }, [products, selectedSection]);

  async function persist(np) { setProducts(np); await saveJSON("products-catalog", np); }

  // Relee lo más reciente justo antes de fusionar el cambio, para no partir de
  // una copia local que otro dispositivo ya haya dejado atrás.
  async function saveProduct(p) {
    const latest = await loadJSON("products-catalog", products);
    const prev = latest.find(x => x.id === p.id);
    const exists = !!prev;
    const withZero = { ...p, stockZeroSince: nextStockZeroSince(prev?.stock, prev?.stockZeroSince, p.stock) };
    const np = exists ? latest.map(x => x.id === p.id ? withZero : x) : [...latest, withZero];
    await persist(np);
    setEditing(null);
    toast(exists ? "Producto actualizado" : "Producto creado", "success");
  }

  async function assignCategory(product, newCategory) {
    const upperCat = upperField(newCategory);
    const latest = await loadJSON("products-catalog", products);
    const np = latest.map(p => p.id === product.id ? { ...p, category: upperCat } : p);
    await persist(np);
    toast(`"${product.name}" movido a "${upperCat}"`, "success");
  }

  async function deleteProduct(id) {
    const latest = await loadJSON("products-catalog", products);
    await persist(latest.filter(p => p.id !== id));
    setDeleting(null);
    toast("Producto eliminado", "success");
  }

  async function confirmRestock(qty, cost) {
    const latestProducts = await loadJSON("products-catalog", products);
    const np = latestProducts.map(p => p.id === restocking.id ? { ...p, stock: p.stock + qty, cost: cost || p.cost, priceHistory: pushPriceHistory(p.priceHistory, cost || p.cost, p.price), stockZeroSince: nextStockZeroSince(p.stock, p.stockZeroSince, p.stock + qty) } : p);
    const latestMovements = await loadJSON("movements-log", movements);
    const nm = [{ id: uid("mov"), date: new Date().toISOString(), type: "egreso", concept: `Reposición: ${restocking.name}`, amount: qty * cost, category: "Compra de mercadería", auto: true }, ...latestMovements];
    // También se deja registro en el historial de recepciones (con la hora
    // real) — es lo que usa la Predicción de Pan para distinguir si la
    // reposición llegó en la mañana o al mediodía.
    const latestPurchaseItems = await loadJSON("purchase-items-log", purchaseItems);
    const npi = [{ id: uid("pi"), date: new Date().toISOString(), invoiceId: null, supplierId: restocking.supplierId || null, supplierName: "Reposición directa", productId: restocking.id, productName: restocking.name, qty, netCost: cost }, ...latestPurchaseItems];
    setProducts(np); setMovements(nm); setPurchaseItems(npi);
    await saveJSON("products-catalog", np, { origen: "reposicion_directa" });
    await saveJSON("movements-log", nm);
    await saveJSON("purchase-items-log", npi);
    setRestocking(null);
    toast("Stock actualizado", "success");
  }

  async function confirmShrinkage({ qty, reason, note, authorizedBy }) {
    const product = shrinking;
    const latestProducts = await loadJSON("products-catalog", products);
    const np = latestProducts.map(p => {
      if (p.id !== product.id) return p;
      const nextStock = Math.max(0, p.stock - qty);
      return { ...p, stock: nextStock, stockZeroSince: nextStockZeroSince(p.stock, p.stockZeroSince, nextStock) };
    });
    const latestMovements = await loadJSON("movements-log", movements);
    const nm = [{
      id: uid("mov"), date: new Date().toISOString(), type: "egreso",
      concept: `Merma (${reason}): ${product.name}${note ? ` — ${note}` : ""}`,
      amount: qty * (product.cost || 0), category: "Merma", auto: true,
      reason, productId: product.id, productName: product.name, qty, unitType: product.unitType,
      reportedBy: session.name, authorizedBy,
    }, ...latestMovements];
    setProducts(np); setMovements(nm);
    await saveJSON("products-catalog", np, { origen: "merma" });
    await saveJSON("movements-log", nm);
    setShrinking(null);
    toast("Merma registrada y descontada del inventario", "success");
  }

  async function handleImport(rows) {
    const latest = await loadJSON("products-catalog", products);
    const byBarcode = new Map(latest.map(p => [p.barcode, p]));
    rows.forEach(r => {
      const bc = r.barcode || `INT-${uid()}`;
      const existing = byBarcode.get(bc);
      const item = {
        id: existing?.id || uid("prod"),
        barcode: bc,
        name: upperField(r.name),
        category: upperField(r.category) || existing?.category || "",
        price: Number(r.price) || existing?.price || 0,
        cost: Number(r.cost) || existing?.cost || 0,
        stock: r.stock !== "" && r.stock !== undefined ? Number(r.stock) : (existing?.stock || 0),
        stockZeroSince: nextStockZeroSince(existing?.stock, existing?.stockZeroSince, r.stock !== "" && r.stock !== undefined ? Number(r.stock) : (existing?.stock || 0)),
        minStock: existing?.minStock ?? 5,
      };
      byBarcode.set(bc, item);
    });
    const np = [...byBarcode.values()];
    await persist(np);
    setImporting(false);
    toast(`${rows.length} producto(s) importados`, "success");
  }

  const lowStock = products.filter(p => p.stock <= p.minStock).length;
  const tableHandlers = { role, suppliers, onRestock: setRestocking, onShrink: setShrinking, onEdit: setEditing, onDelete: setDeleting, onRename: setRenaming };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.gray }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar en todo el inventario…" className={`${inputCls} pl-9`} style={inputStyle()} />
        </div>
        <Btn variant="ghost" icon={Tags} onClick={() => setEditing({ quickAccess: true })}>Nuevo sin código (acceso rápido)</Btn>
        {role === "admin" && (
          <>
            <Btn variant="ghost" icon={Upload} onClick={() => setImporting(true)}>Importar</Btn>
            <Btn variant="ghost" icon={PackageMinus} onClick={() => setShrinkageSummaryOpen(true)}>Mermas</Btn>
            <Btn icon={Plus} onClick={() => setEditing({})}>Nuevo</Btn>
          </>
        )}
      </div>
      <p className="text-xs mb-3 -mt-1.5" style={{ color: C.grayLight }}>
        Los productos de "acceso rápido" aparecen como botones en Vender, agrupados por categoría, para venderlos sin escanear.
        {role !== "admin" && " El precio de venta lo calcula el sistema y queda a la espera de que un administrador lo confirme."}
      </p>
      {lowStock > 0 && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-sm" style={{ background: C.brassSoft, color: C.brassText }}>
          <AlertTriangle size={15} /> {lowStock} producto(s) con stock bajo o agotado
        </div>
      )}
      {role === "admin" && <StaleStockPanel products={products} setProducts={setProducts} session={session} toast={toast} />}

      {searchResults ? (
        <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <div className="px-4 py-2.5 text-xs flex items-center justify-between" style={{ color: C.gray, borderBottom: `1px solid ${C.paperLine}` }}>
            <span>{searchResults.length} resultado(s) para "{query}"</span>
            <button onClick={() => setQuery("")} className="underline">Limpiar búsqueda</button>
          </div>
          <ProductTable items={searchResults} {...tableHandlers} />
        </div>
      ) : selectedSection === "__unclassified__" ? (
        <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.paperLine}` }}>
            <button onClick={() => setSelectedSection(null)} className="text-sm font-medium flex items-center gap-1.5" style={{ color: C.green }}>
              <ChevronLeft size={16} /> Todas las secciones
            </button>
            <span className="text-sm font-semibold" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Sin clasificar ({sectionItems.length})</span>
          </div>
          {sectionItems.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Todo clasificado" hint="No queda ningún producto por asignar a una sección." />
          ) : (
            <div>
              {sectionItems.map(p => (
                <UnclassifiedRow key={p.id} product={p} categoryOptions={categoryOptions} onAssign={assignCategory} />
              ))}
            </div>
          )}
        </div>
      ) : selectedSection ? (
        <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.paperLine}` }}>
            <button onClick={() => setSelectedSection(null)} className="text-sm font-medium flex items-center gap-1.5" style={{ color: C.green }}>
              <ChevronLeft size={16} /> Todas las secciones
            </button>
            <span className="text-sm font-semibold" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>{selectedSection} ({sectionItems.length})</span>
          </div>
          <ProductTable items={sectionItems} {...tableHandlers} />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {unclassifiedCount > 0 && (
            <button
              onClick={() => setSelectedSection("__unclassified__")}
              className="text-left rounded-xl p-4 transition active:scale-[.98]"
              style={{ background: C.rustSoft, border: `1.5px solid ${C.rust}` }}
            >
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={16} style={{ color: C.rust }} />
                <span className="font-semibold text-sm" style={{ color: C.rust }}>Sin clasificar</span>
              </div>
              <p className="text-xs" style={{ color: C.rust }}>{unclassifiedCount} producto(s) esperando una sección</p>
            </button>
          )}
          {sections.map(s => (
            <button
              key={s.name}
              onClick={() => setSelectedSection(s.name)}
              className="text-left rounded-xl p-4 transition active:scale-[.98]"
              style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Package size={16} style={{ color: C.green }} />
                <span className="font-semibold text-sm" style={{ color: C.ink }}>{s.name}</span>
              </div>
              <p className="text-xs" style={{ color: C.gray }}>{s.count} producto(s)</p>
            </button>
          ))}
        </div>
      )}

      {editing !== null && <ProductModal initial={editing} products={products} suppliers={suppliers} setSuppliers={setSuppliers} categories={categories} role={role} session={session} toast={toast} onClose={() => setEditing(null)} onSave={saveProduct} />}
      {restocking && <RestockModal product={restocking} onClose={() => setRestocking(null)} onConfirm={confirmRestock} />}
      {importing && <ImportModal onClose={() => setImporting(false)} onImport={handleImport} />}
      {renaming && (
        <CorregirNombreModal
          product={renaming}
          onClose={() => setRenaming(null)}
          onSave={async (nombre) => {
            try {
              const latest = await loadJSON("products-catalog", products);
              const np = latest.map(p => p.id === renaming.id ? { ...p, name: upperField(nombre) } : p);
              setProducts(np);
              await saveJSON("products-catalog", np);
              setRenaming(null);
              toast("Nombre corregido", "success");
            } catch (e) {
              toast(friendlyError(e, "No se pudo cambiar el nombre"), "error");
            }
          }}
        />
      )}
      {shrinking && <ShrinkageModal product={shrinking} adminPin={settings.adminPin} role={role} session={session} onClose={() => setShrinking(null)} onConfirm={confirmShrinkage} toast={toast} />}
      {shrinkageSummaryOpen && <ShrinkageSummaryModal movements={movements} onClose={() => setShrinkageSummaryOpen(false)} />}
      {deleting && (
        <Modal title="Eliminar producto" onClose={() => setDeleting(null)}>
          <p className="text-sm mb-4" style={{ color: C.ink }}>¿Eliminar <strong>{deleting.name}</strong>? Esta acción no se puede deshacer.</p>
          <div className="flex gap-2"><Btn variant="ghost" full onClick={() => setDeleting(null)}>Cancelar</Btn><Btn variant="rust" full onClick={() => deleteProduct(deleting.id)}>Eliminar</Btn></div>
        </Modal>
      )}
    </div>
  );
}

const SHRINKAGE_REASONS = ["Pérdida", "Robo", "Vencimiento", "Daño o rotura", "Otro"];

function ShrinkageModal({ product, adminPin, role, session, onClose, onConfirm, toast }) {
  const hasKgConversion = !!product.unitsPerKg;
  const [kgMode, setKgMode] = useState(hasKgConversion);
  const [qty, setQty] = useState("");
  const [kg, setKg] = useState("");
  const [reason, setReason] = useState(SHRINKAGE_REASONS[0]);
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");
  const [authorizerName, setAuthorizerName] = useState("");
  const isPeso = product.unitType === "peso";
  const qtyNum = kgMode && hasKgConversion ? Math.round((Number(kg) || 0) * product.unitsPerKg) : (Number(qty) || 0);
  const valueLost = qtyNum * (product.cost || 0);
  const needsAuthorizerName = role !== "admin";

  async function submit() {
    if (qtyNum <= 0) return toast("Ingresa una cantidad válida", "error");
    if (qtyNum > product.stock) return toast("Esa cantidad supera el stock disponible", "error");
    if (needsAuthorizerName && !authorizerName.trim()) return toast("Indica qué administrador autoriza", "error");
    try {
      if (!(await autorizarConPin(pin))) {
        return toast("Ese PIN no es de un administrador. Sirve el PIN del negocio (Ajustes) o el personal de un administrador.", "error");
      }
    } catch (e) {
      return toast(friendlyError(e, "No se pudo comprobar el PIN"), "error");
    }
    onConfirm({ qty: qtyNum, reason, note: note.trim(), authorizedBy: needsAuthorizerName ? authorizerName.trim() : session.name });
  }

  return (
    <Modal title={`Registrar merma — ${product.name}`} onClose={onClose}>
      <div className="rounded-lg p-3 mb-3" style={{ background: C.paperDark }}>
        <div className="text-xs" style={{ color: C.gray }}>Stock actual: {product.stock}{isPeso ? " kg" : " un."}</div>
      </div>
      {hasKgConversion && (
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          <button type="button" onClick={() => setKgMode(true)} className="py-2 rounded-lg text-sm font-medium" style={kgMode ? { background: C.brass, color: C.ink } : { background: C.paperDark, color: C.gray }}>Contar en Kg</button>
          <button type="button" onClick={() => setKgMode(false)} className="py-2 rounded-lg text-sm font-medium" style={!kgMode ? { background: C.brass, color: C.ink } : { background: C.paperDark, color: C.gray }}>Contar en unidades</button>
        </div>
      )}
      {kgMode && hasKgConversion ? (
        <Field label={`Kg que sobraron (1 Kg = ${product.unitsPerKg} unidades)`}>
          <input autoFocus type="number" step="0.001" value={kg} onChange={e => setKg(e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} placeholder="0" />
          {kg !== "" && <p className="text-xs mt-1" style={{ color: C.gray }}>= {qtyNum} unidades</p>}
        </Field>
      ) : (
        <Field label={isPeso ? "Cantidad perdida (kg)" : "Cantidad perdida"}>
          <input autoFocus type="number" step={isPeso ? "0.001" : "1"} value={qty} onChange={e => setQty(e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} placeholder="0" />
        </Field>
      )}
      <Field label="Motivo">
        <div className="grid grid-cols-2 gap-1.5">
          {SHRINKAGE_REASONS.map(r => (
            <button key={r} type="button" onClick={() => setReason(r)} className="py-2 rounded-lg text-xs font-medium" style={reason === r ? { background: C.rust, color: "#fff" } : { background: C.paperDark, color: C.gray }}>{r}</button>
          ))}
        </div>
      </Field>
      <Field label="Detalle (opcional)"><input value={note} onChange={e => setNote(e.target.value)} className={inputCls} style={inputStyle()} placeholder="Ej. Se encontró vitrina rota, faltante en el conteo…" /></Field>
      {qtyNum > 0 && (
        <div className="rounded-lg p-3 mb-3 flex justify-between text-sm font-semibold" style={{ background: C.rustSoft }}>
          <span style={{ color: C.rust }}>Valor de la pérdida</span><span className="font-mono" style={{ color: C.rust }}>{formatCLP(valueLost)}</span>
        </div>
      )}
      <Field label="PIN de administrador (el del negocio o el tuyo, si eres admin)"><input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} className={inputCls} style={inputStyle()} placeholder="••••" /></Field>
      {needsAuthorizerName && (
        <Field label="Nombre del administrador que autoriza"><input value={authorizerName} onChange={e => setAuthorizerName(e.target.value)} className={inputCls} style={inputStyle()} placeholder="Nombre" /></Field>
      )}
      <div className="flex gap-2">
        <Btn variant="ghost" full onClick={onClose}>Cancelar</Btn>
        <Btn variant="rust" full icon={Lock} onClick={submit}>Autorizar y descontar</Btn>
      </div>
    </Modal>
  );
}

function ShrinkageSummaryModal({ movements, onClose }) {
  const [range, setRange] = useState("30");
  const now = Date.now();
  const shrinkages = useMemo(() => {
    const list = movements.filter(m => m.category === "Merma");
    if (range === "0") return list;
    const rangeMs = Number(range) * 24 * 60 * 60 * 1000;
    return list.filter(m => now - new Date(m.date).getTime() <= rangeMs);
  }, [movements, range]);

  const total = shrinkages.reduce((a, m) => a + m.amount, 0);
  const byReason = useMemo(() => {
    const map = new Map();
    shrinkages.forEach(m => map.set(m.reason || "Otro", (map.get(m.reason || "Otro") || 0) + m.amount));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [shrinkages]);

  return (
    <Modal title="Resumen de mermas" onClose={onClose} wide>
      <div className="flex gap-1.5 mb-3">
        {[["7", "7 días"], ["30", "30 días"], ["90", "90 días"], ["0", "Todo"]].map(([v, l]) => (
          <button key={v} onClick={() => setRange(v)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={range === v ? { background: C.ink, color: C.paper } : { background: C.paperDark, color: C.gray }}>{l}</button>
        ))}
      </div>
      <div className="rounded-lg p-3 mb-3 flex justify-between items-center" style={{ background: C.rustSoft }}>
        <span className="text-sm font-semibold" style={{ color: C.rust }}>Total perdido en el período</span>
        <span className="text-lg font-mono font-bold" style={{ color: C.rust }}>{formatCLP(total)}</span>
      </div>
      {byReason.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {byReason.map(([reason, amt]) => (
            <span key={reason} className="text-xs px-2.5 py-1.5 rounded-lg font-mono" style={{ background: C.paperDark, color: C.ink }}>{reason}: <strong>{formatCLP(amt)}</strong></span>
          ))}
        </div>
      )}
      <div className="rounded-xl overflow-hidden" style={{ border: `1.5px solid ${C.paperLine}` }}>
        {shrinkages.length === 0 ? (
          <EmptyState icon={PackageMinus} title="Sin mermas registradas" hint="Las pérdidas, robos o vencimientos que registres aparecerán aquí." />
        ) : (
          <div className="divide-y max-h-80 overflow-y-auto" style={{ borderColor: C.paperLine }}>
            {shrinkages.map(m => (
              <div key={m.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm truncate" style={{ color: C.ink }}>{m.productName} <Badge tone="rust">{m.reason}</Badge></div>
                  <div className="text-xs" style={{ color: C.gray }}>{formatDate(m.date)} · {m.qty}{m.unitType === "peso" ? " kg" : " un."} · reportado por {m.reportedBy}{m.authorizedBy ? ` · autorizado por ${m.authorizedBy}` : ""}</div>
                </div>
                <span className="text-sm font-mono font-semibold flex-shrink-0" style={{ color: C.rust }}>{formatCLP(m.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
/* ---------------------------------------------------------
   FACTURAS
--------------------------------------------------------- */
/* Resumen para fiscalización: solo ventas con boleta emitida de verdad —
   débito y crédito la emiten siempre; efectivo y transferencia solo cuando
   quedó marcado "Sí, con boleta" al cobrar. Sirve para responder rápido si el
   SII pide el detalle de un período. */
function FiscalSummaryModal({ sales, onClose }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const conBoleta = useMemo(
    () => sales.filter(s => s.paymentMethod === "Débito" || s.paymentMethod === "Crédito" || s.boletaEmitida === true),
    [sales]
  );

  const enRango = useMemo(() => {
    return conBoleta
      .filter(s => {
        const d = s.date.slice(0, 10);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      })
      .sort((a, b) => a.invoiceNumber - b.invoiceNumber);
  }, [conBoleta, from, to]);

  const totalMonto = enRango.reduce((a, s) => a + s.total, 0);
  const porMetodo = useMemo(() => {
    const m = {};
    enRango.forEach(s => {
      m[s.paymentMethod] = m[s.paymentMethod] || { count: 0, total: 0 };
      m[s.paymentMethod].count++;
      m[s.paymentMethod].total += s.total;
    });
    return m;
  }, [enRango]);

  return (
    <Modal title="Resumen de ventas con boleta (fiscalización)" onClose={onClose}>
      <div id="fiscal-summary-print">
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Field label="Desde"><input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} style={inputStyle()} /></Field>
          <Field label="Hasta"><input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} style={inputStyle()} /></Field>
        </div>
        <p className="text-xs mb-3" style={{ color: C.gray }}>Deja las fechas vacías para ver todo el historial. Incluye solo boletas efectivamente emitidas: débito y crédito siempre cuentan; efectivo y transferencia solo si quedaron marcadas con boleta.</p>

        <div className="rounded-lg p-3 mb-3" style={{ background: C.ink }}>
          <div className="flex justify-between text-sm"><span style={{ color: C.grayLight }}>Boletas emitidas</span><span className="font-mono font-semibold" style={{ color: "#fff" }}>{enRango.length}</span></div>
          <div className="flex justify-between text-sm"><span style={{ color: C.grayLight }}>Monto total</span><span className="font-mono font-semibold" style={{ color: C.brass }}>{formatCLP(totalMonto)}</span></div>
          {Object.keys(porMetodo).length > 0 && (
            <div className="pt-2 mt-2 space-y-1" style={{ borderTop: `1px dashed ${C.inkSoft}` }}>
              {Object.entries(porMetodo).map(([m, v]) => (
                <div key={m} className="flex justify-between text-xs"><span style={{ color: C.grayLight }}>{m} ({v.count})</span><span className="font-mono" style={{ color: "#fff" }}>{formatCLP(v.total)}</span></div>
              ))}
            </div>
          )}
        </div>

        {enRango.length === 0 ? (
          <EmptyState icon={FileText} title="Sin boletas en este rango" hint="Ajusta las fechas, o revisa que las ventas en efectivo/transferencia tengan boleta marcada." />
        ) : (
          <div className="rounded-lg overflow-hidden mb-2" style={{ border: `1.5px solid ${C.paperLine}` }}>
            <div className="max-h-72 overflow-y-auto divide-y" style={{ borderColor: C.paperLine }}>
              {enRango.map(s => (
                <div key={s.id} className="flex justify-between px-3 py-2 text-xs">
                  <span style={{ color: C.ink }}>Boleta #{s.invoiceNumber} · {formatDate(s.date)} · {s.paymentMethod}</span>
                  <span className="font-mono" style={{ color: C.gray }}>{formatCLP(s.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-2">
        <Btn variant="ghost" full onClick={onClose}>Cerrar</Btn>
        <Btn full icon={Printer} onClick={() => window.print()}>Imprimir</Btn>
      </div>
      <style>{`@media print { body * { visibility: hidden; } #fiscal-summary-print, #fiscal-summary-print * { visibility: visible; } #fiscal-summary-print { position: fixed; top: 0; left: 0; width: 100%; } }`}</style>
    </Modal>
  );
}

function InvoicesView({ sales, settings }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [viewing, setViewing] = useState(null);
  const [fiscalOpen, setFiscalOpen] = useState(false);
  const pageSize = 20;

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return sales;
    return sales.filter(s => normalize(String(s.invoiceNumber)).includes(q) || normalize(s.seller).includes(q) || normalize(s.customer || "").includes(q));
  }, [sales, query]);
  useEffect(() => { setPage(0); }, [query]);
  const pageItems = filtered.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative max-w-sm flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.gray }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por N° boleta, vendedor o cliente…" className={`${inputCls} pl-9`} style={inputStyle()} />
        </div>
        <Btn variant="ghost" icon={FileText} onClick={() => setFiscalOpen(true)}>SII</Btn>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
        {pageItems.length === 0 ? (
          <EmptyState icon={FileText} title="Sin facturas" hint="Las ventas realizadas aparecerán aquí." />
        ) : (
          <div className="divide-y" style={{ borderColor: C.paperLine }}>
            {pageItems.map(s => (
              <button key={s.id} onClick={() => setViewing(s)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/[.02] text-left">
                <div>
                  <div className="text-sm font-medium font-mono" style={{ color: C.ink }}>Boleta #{s.invoiceNumber}</div>
                  <div className="text-xs" style={{ color: C.gray }}>{formatDate(s.date)} · {s.seller}{s.customer ? ` · ${s.customer}` : ""}</div>
                </div>
                <div className="flex items-center gap-3">
                  {s.boletaEmitida === false && <Badge tone="rust">sin boleta</Badge>}
                  <Badge tone={s.paymentMethod === "Fiado" ? "brass" : "gray"}>{s.paymentMethod}</Badge>
                  <span className="font-mono font-semibold text-sm" style={{ color: C.green }}>{formatCLP(s.total)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <Pager page={page} setPage={setPage} total={filtered.length} pageSize={pageSize} />
      {viewing && <ReceiptModal sale={viewing} settings={settings} onClose={() => setViewing(null)} />}
      {fiscalOpen && <FiscalSummaryModal sales={sales} onClose={() => setFiscalOpen(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------
   SUELDOS — pagos diarios a trabajadores
   Los trabajadores no tienen sueldo fijo ni horario fijo: se les paga
   un monto cada vez que corresponde. Aquí se administra la lista de
   trabajadores y se registra cada pago, que queda como egreso en
   Finanzas bajo la categoría "Sueldos".
--------------------------------------------------------- */
function WorkerModal({ initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  return (
    <Modal title={initial?.id ? "Editar trabajador" : "Nuevo trabajador"} onClose={onClose}>
      <Field label="Nombre"><input autoFocus value={name} onChange={e => setName(e.target.value)} className={inputCls} style={inputStyle()} placeholder="Ej. Rosita" /></Field>
      <Btn full icon={Check} disabled={!name.trim()} onClick={() => onSave({ id: initial?.id || uid("wrk"), name: name.trim(), active: initial?.active ?? true, createdAt: initial?.createdAt || new Date().toISOString() })}>Guardar</Btn>
    </Modal>
  );
}

function PayWorkerModal({ worker, onClose, onSave }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  return (
    <Modal title={`Pagar a ${worker.name}`} onClose={onClose}>
      <Field label="Monto pagado"><input autoFocus type="number" value={amount} onChange={e => setAmount(e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} placeholder="0" /></Field>
      <Field label="Fecha"><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} style={inputStyle()} /></Field>
      <Field label="Nota (opcional)"><input value={note} onChange={e => setNote(e.target.value)} className={inputCls} style={inputStyle()} placeholder="Ej. día completo, media jornada…" /></Field>
      <Btn full icon={Check} disabled={!amount || Number(amount) <= 0} onClick={() => onSave({ amount: Number(amount), date, note: note.trim() })}>Registrar pago</Btn>
    </Modal>
  );
}

function WorkerCard({ worker, movements, onPay, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const payments = useMemo(
    () => movements.filter(m => m.category === "Sueldos" && m.workerId === worker.id).sort((a, b) => new Date(b.date) - new Date(a.date)),
    [movements, worker.id]
  );
  const now = new Date().toISOString();
  const totalMes = payments.filter(m => isSameMonth(m.date, now)).reduce((s, m) => s + m.amount, 0);
  const totalTodo = payments.reduce((s, m) => s + m.amount, 0);

  return (
    <div className="rounded-xl p-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: C.greenSoft }}><User size={16} style={{ color: C.greenDark }} /></div>
          <div className="text-sm font-semibold truncate" style={{ color: C.ink }}>{worker.name}</div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={() => onEdit(worker)} className="p-2.5 rounded-md" style={{ background: C.paperDark, color: C.ink }}><Pencil size={16} /></button>
          <button onClick={() => onDelete(worker)} className="p-2.5 rounded-md" style={{ background: C.rustSoft, color: C.rust }}><Trash2 size={16} /></button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <div className="text-[10px]" style={{ color: C.gray }}>Pagado este mes</div>
          <div className="text-sm font-semibold font-mono" style={{ color: C.ink }}>{formatCLP(totalMes)}</div>
        </div>
        <div>
          <div className="text-[10px]" style={{ color: C.gray }}>Total histórico</div>
          <div className="text-sm font-semibold font-mono" style={{ color: C.gray }}>{formatCLP(totalTodo)}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Btn size="sm" icon={Check} onClick={() => onPay(worker)}>Pagar sueldo</Btn>
        {payments.length > 0 && (
          <button onClick={() => setExpanded(e => !e)} className="text-xs font-medium" style={{ color: C.green }}>
            {expanded ? "Ocultar pagos" : `Ver ${payments.length} pago(s)`}
          </button>
        )}
      </div>
      {expanded && (
        <div className="mt-2 space-y-1 pt-2" style={{ borderTop: `1px dashed ${C.paperLine}` }}>
          {payments.slice(0, 20).map(p => (
            <div key={p.id} className="flex justify-between text-xs">
              <span style={{ color: C.gray }}>{formatDateOnly(p.paymentDate)}{p.note ? ` · ${p.note}` : ""}</span>
              <span className="font-mono" style={{ color: C.rust }}>{formatCLP(p.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PayrollPanel({ workers, setWorkers, movements, setMovements, session, toast }) {
  const [editingWorker, setEditingWorker] = useState(null);
  const [payingWorker, setPayingWorker] = useState(null);
  const [deletingWorker, setDeletingWorker] = useState(null);
  const activeWorkers = workers.filter(w => w.active);

  async function saveWorker(w) {
    const latest = await loadJSON("workers", workers);
    const exists = latest.some(x => x.id === w.id);
    const nw = exists ? latest.map(x => x.id === w.id ? w : x) : [...latest, w];
    setWorkers(nw); await saveJSON("workers", nw);
    setEditingWorker(null);
    toast(exists ? "Trabajador actualizado" : "Trabajador agregado", "success");
  }

  async function deleteWorker(worker) {
    const latest = await loadJSON("workers", workers);
    const nw = latest.filter(w => w.id !== worker.id);
    setWorkers(nw); await saveJSON("workers", nw);
    setDeletingWorker(null);
    toast("Trabajador eliminado", "success");
  }

  async function registerPayment({ amount, date, note }) {
    const latestMovements = await loadJSON("movements-log", movements);
    const payment = {
      id: uid("mov"), date: new Date(`${date}T12:00:00`).toISOString(), paymentDate: date,
      type: "egreso", concept: `Sueldo: ${payingWorker.name}${note ? ` — ${note}` : ""}`,
      amount, category: "Sueldos", auto: true,
      workerId: payingWorker.id, workerName: payingWorker.name, note, paidBy: session.name,
    };
    const nm = [payment, ...latestMovements];
    setMovements(nm); await saveJSON("movements-log", nm);
    setPayingWorker(null);
    toast(`Pago registrado a ${payingWorker.name}`, "success");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: C.gray }}>Cada trabajador se paga por día, sin sueldo fijo ni horario fijo. Registra cada pago aquí apenas se haga.</p>
        <Btn size="sm" icon={Plus} onClick={() => setEditingWorker({})}>Nuevo trabajador</Btn>
      </div>
      {activeWorkers.length === 0 ? (
        <EmptyState icon={Users} title="Sin trabajadores registrados" hint="Agrega a tu equipo para empezar a llevar el registro de pagos." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {activeWorkers.map(w => (
            <WorkerCard key={w.id} worker={w} movements={movements} onPay={setPayingWorker} onEdit={setEditingWorker} onDelete={setDeletingWorker} />
          ))}
        </div>
      )}
      {editingWorker !== null && <WorkerModal initial={editingWorker.id ? editingWorker : null} onClose={() => setEditingWorker(null)} onSave={saveWorker} />}
      {payingWorker && <PayWorkerModal worker={payingWorker} onClose={() => setPayingWorker(null)} onSave={registerPayment} />}
      {deletingWorker && (
        <Modal title="Eliminar trabajador" onClose={() => setDeletingWorker(null)}>
          <p className="text-sm mb-4" style={{ color: C.ink }}>¿Eliminar a <strong>{deletingWorker.name}</strong> de la lista? Los pagos que ya se le registraron se mantienen en Egresos, solo deja de aparecer para pagos nuevos.</p>
          <div className="flex gap-2"><Btn variant="ghost" full onClick={() => setDeletingWorker(null)}>Cancelar</Btn><Btn variant="rust" full onClick={() => deleteWorker(deletingWorker)}>Eliminar</Btn></div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   FINANZAS (solo admin)
--------------------------------------------------------- */
// Categorías que el libro de caja reconoce. Antes este campo era texto libre,
// pero cualquier valor inventado terminaba archivado como "General" y
// fragmentaba los informes sin que nadie se enterara.
//
// Agrupadas para la sección "Pagos y gastos" (migración 0011): separa los
// gastos propios del local (arriendo, bencina, gas, insumos, mantención,
// impuestos…) de los pagos a proveedores de mercadería, que son otra cosa.
// Cada categoría nueva necesita también su valor en el enum de la base
// (galpon.categoria_movimiento) y su traducción en lib/datos/traduccion.js —
// si falta cualquiera de las dos, la categoría se guarda igual pero cae a
// "General" en la base sin avisar, así que hay que mantenerlas juntas.
const GRUPOS_CATEGORIA_MOVIMIENTO = [
  {
    label: "Gastos del local",
    options: [
      "General", "Arriendo", "Bencina y combustible", "Gas", "Insumos y aseo",
      "Mantención y reparaciones", "Impuestos y contribuciones", "Otro gasto del local",
    ],
  },
  {
    label: "Mercadería",
    options: ["Compra de mercadería", "Pago a proveedor"],
  },
  {
    label: "Otros movimientos",
    options: ["Sueldos", "Merma", "Consumo interno", "Entrada libre", "Ajuste de inventario"],
  },
];
const CATEGORIAS_MOVIMIENTO = GRUPOS_CATEGORIA_MOVIMIENTO.flatMap(g => g.options);

// Solo egresos (migración de esta sesión: Egresos es la única pantalla que
// usa este modal, y ahí todo lo que se registra a mano es un pago o un
// gasto — nunca un ingreso, así que no tiene caso preguntarlo). Tampoco se
// adjunta boleta/factura acá: eso ya se hace en Recepción, que es donde
// realmente llega el documento de la compra.
function MovementModal({ onClose, onSave }) {
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("General");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await onSave({ id: uid("mov"), date: new Date().toISOString(), type: "egreso", concept, category: category || "General", amount: Number(amount), auto: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Nuevo pago" onClose={onClose}>
      <Field label="Categoría">
        <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls} style={inputStyle()}>
          {GRUPOS_CATEGORIA_MOVIMIENTO.map(g => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map(c => <option key={c} value={c}>{c}</option>)}
            </optgroup>
          ))}
        </select>
      </Field>
      <Field label="Concepto"><input autoFocus value={concept} onChange={e => setConcept(e.target.value)} className={inputCls} style={inputStyle()} placeholder="Ej. Pago de arriendo, bencina de la camioneta…" /></Field>
      <Field label="Monto">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-base" style={{ color: C.gray }}>$</span>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className={`${inputCls} font-mono pl-7`} style={inputStyle()} placeholder="0" />
        </div>
      </Field>

      <Btn full icon={saving ? Loader2 : Check} disabled={!concept || !amount || saving} onClick={submit}>{saving ? "Guardando…" : "Guardar"}</Btn>
    </Modal>
  );
}

function MovementReceiptViewerModal({ movement, onClose }) {
  const [pages, setPages] = useState([]);
  const [pageIdx, setPageIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await loadJSON(`movement-doc:${movement.id}`, null);
        if (!cancelled && res) setPages(Array.isArray(res.pages) ? res.pages : []);
      } catch (e) { /* archivo no disponible */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [movement.id]);

  const image = pages[pageIdx];

  return (
    <Modal title={`Boleta/factura — ${movement.concept}`} onClose={onClose}>
      {loading ? (
        <div className="rounded-lg flex items-center justify-center" style={{ height: 220, background: C.paperDark }}><Loader2 className="animate-spin" size={20} style={{ color: C.gray }} /></div>
      ) : image ? (
        <>
          {image.mediaType === "application/pdf" ? (
            <div className="rounded-lg p-4 flex flex-col items-center gap-2" style={{ background: C.paperDark }}>
              <Receipt size={24} style={{ color: C.gray }} />
              <span className="text-sm text-center" style={{ color: C.ink }}>{image.name}</span>
              <a href={image.dataUrl} download={image.name} className="text-xs underline" style={{ color: C.green }}>Descargar PDF</a>
            </div>
          ) : (
            <img src={image.dataUrl} alt={`Archivo ${pageIdx + 1}`} className="w-full rounded-lg" style={{ border: `1.5px solid ${C.paperLine}` }} />
          )}
          {pages.length > 1 && (
            <div className="flex items-center justify-between mt-2">
              <button disabled={pageIdx === 0} onClick={() => setPageIdx(i => i - 1)} className="p-3 rounded-md disabled:opacity-30" style={{ background: C.paperDark, color: C.ink }}><ChevronLeft size={18} /></button>
              <span className="text-xs" style={{ color: C.gray }}>Archivo {pageIdx + 1} de {pages.length}</span>
              <button disabled={pageIdx === pages.length - 1} onClick={() => setPageIdx(i => i + 1)} className="p-3 rounded-md disabled:opacity-30" style={{ background: C.paperDark, color: C.ink }}><ChevronRight size={18} /></button>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-lg p-4 text-center text-sm" style={{ background: C.paperDark, color: C.gray }}>No se encontró el archivo adjunto.</div>
      )}
    </Modal>
  );
}

function FinanceView({ sales, movements, products }) {
  const [range, setRange] = useState("mes");
  const now = new Date().toISOString();

  // Finanzas es solo estadística del negocio (migración de esta sesión):
  // registrar pagos, gastos y sueldos vive en Egresos y Sueldos, cada uno en
  // su propia pestaña. Acá solo se lee movements-log para armar los números
  // y los gráficos — nunca se escribe nada desde esta pantalla.
  const filteredMovs = useMemo(() => {
    if (range === "todo") return movements;
    if (range === "hoy") return movements.filter(m => isSameDay(m.date, now));
    return movements.filter(m => isSameMonth(m.date, now));
  }, [movements, range]);

  const totalIngresos = filteredMovs.filter(m => m.type === "ingreso").reduce((s, m) => s + m.amount, 0);
  const totalEgresos = filteredMovs.filter(m => m.type === "egreso").reduce((s, m) => s + m.amount, 0);
  const ventasHoy = sales.filter(s => isSameDay(s.date, now)).reduce((s, x) => s + x.total, 0);
  const inventoryValue = products.reduce((s, p) => s + p.stock * p.cost, 0);

  const chartData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = dayKey(d.toISOString());
      const total = sales.filter(s => dayKey(s.date) === key).reduce((s, x) => s + x.total, 0);
      days.push({ label: d.toLocaleDateString("es-CL", { weekday: "short" }), total });
    }
    return days;
  }, [sales]);

  const monthlyData = useMemo(() => {
    const map = new Map();
    movements.forEach(m => {
      const d = new Date(m.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, { key, label: d.toLocaleDateString("es-CL", { month: "short", year: "2-digit" }), ingresos: 0, egresos: 0 });
      const e = map.get(key);
      if (m.type === "ingreso") e.ingresos += m.amount; else e.egresos += m.amount;
    });
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-12);
  }, [movements]);

  const hasHistorical = movements.some(m => m.historical);

  const cards = [
    { label: "Ventas de hoy", value: ventasHoy, tone: "green" },
    { label: `Ingresos (${range})`, value: totalIngresos, tone: "green" },
    { label: `Egresos (${range})`, value: totalEgresos, tone: "rust" },
    { label: `Balance (${range})`, value: totalIngresos - totalEgresos, tone: totalIngresos - totalEgresos >= 0 ? "green" : "rust" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {["hoy", "mes", "todo"].map(r => (
          <button key={r} onClick={() => setRange(r)} className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize" style={range === r ? { background: C.ink, color: C.paper } : { background: C.paperDark, color: C.gray }}>{r}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className="rounded-xl p-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
            <div className="text-xs mb-1" style={{ color: C.gray }}>{c.label}</div>
            <div className="text-lg font-semibold font-mono" style={{ color: c.tone === "green" ? C.greenDark : C.rust }}>{formatCLP(c.value)}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl p-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Ventas — últimos 7 días</span>
          <span className="text-xs font-mono" style={{ color: C.gray }}>Valor inventario: {formatCLP(inventoryValue)}</span>
        </div>
        <div style={{ width: "100%", height: 180 }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.paperLine} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.gray }} axisLine={{ stroke: C.paperLine }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: C.gray }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={v => formatCLP(v)} contentStyle={{ borderRadius: 8, border: `1px solid ${C.paperLine}`, fontSize: 12 }} />
              <Bar dataKey="total" fill={C.green} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl p-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Comparativo mensual — ingresos vs. egresos</span>
          {hasHistorical && <span className="text-xs" style={{ color: C.grayLight }}>incluye histórico importado</span>}
        </div>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.paperLine} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.gray }} axisLine={{ stroke: C.paperLine }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: C.gray }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={v => formatCLP(v)} contentStyle={{ borderRadius: 8, border: `1px solid ${C.paperLine}`, fontSize: 12 }} />
              <Bar dataKey="ingresos" name="Ingresos" fill={C.green} radius={[4, 4, 0, 0]} />
              <Bar dataKey="egresos" name="Egresos" fill={C.rust} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   EGRESOS (solo admin)
   Antes vivía dentro de Finanzas ("Nuevo pago o gasto" + el libro de
   movimientos). Se separó a su propia pestaña para que Finanzas quede solo
   como estadística del negocio y esta sea la pantalla donde de verdad se
   registran pagos y gastos día a día.
--------------------------------------------------------- */
function ExpensesView({ movements, setMovements, toast }) {
  const [range, setRange] = useState("mes");
  const [adding, setAdding] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState(null);
  const now = new Date().toISOString();

  // Solo egresos: pagos a proveedores (con crédito o sin él), gastos del
  // local, sueldos, mermas, etc. Las ventas y demás ingresos se ven en Caja
  // y Boletas — acá solo importa la plata que sale.
  const egresos = useMemo(() => movements.filter(m => m.type === "egreso"), [movements]);
  const filteredMovs = useMemo(() => {
    if (range === "todo") return egresos;
    if (range === "hoy") return egresos.filter(m => isSameDay(m.date, now));
    return egresos.filter(m => isSameMonth(m.date, now));
  }, [egresos, range]);

  async function saveMovement(m) {
    const latest = await loadJSON("movements-log", movements);
    const nm = [m, ...latest];
    setMovements(nm); await saveJSON("movements-log", nm);
    setAdding(false);
    toast("Pago registrado", "success");
  }

  return (
    <div className="space-y-4">
      <Btn size="lg" full icon={Plus} onClick={() => setAdding(true)}>Nuevo pago</Btn>

      <div className="flex gap-1.5">
        {["hoy", "mes", "todo"].map(r => (
          <button key={r} onClick={() => setRange(r)} className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize" style={range === r ? { background: C.ink, color: C.paper } : { background: C.paperDark, color: C.gray }}>{r}</button>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
        {filteredMovs.length === 0 ? (
          <EmptyState icon={ArrowDownCircle} title="Sin egresos" hint="Los pagos y gastos que registres aparecerán aquí." />
        ) : (
          <div className="divide-y" style={{ borderColor: C.paperLine }}>
            {filteredMovs.slice(0, 80).map(m => (
              <div key={m.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <ArrowDownCircle size={16} style={{ color: C.rust }} />
                  <div>
                    <div className="text-sm" style={{ color: C.ink }}>{m.concept}</div>
                    <div className="text-xs" style={{ color: C.gray }}>{formatDate(m.date)} · {m.category}{!m.auto ? " · manual" : ""}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  {m.hasDocument && (
                    <button onClick={() => setViewingReceipt(m)} aria-label="Ver boleta o factura adjunta" className="flex items-center justify-center" style={{ color: C.gray }}><Receipt size={16} /></button>
                  )}
                  <span className="font-mono font-semibold text-sm" style={{ color: C.rust }}>−{formatCLP(m.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {adding && <MovementModal onClose={() => setAdding(false)} onSave={saveMovement} />}
      {viewingReceipt && <MovementReceiptViewerModal movement={viewingReceipt} onClose={() => setViewingReceipt(null)} />}
    </div>
  );
}
/* ---------------------------------------------------------
   CONTEOS DE INVENTARIO PROGRAMADOS
   Obligación mensual: un conteo el día 15 y otro el día 29, cada uno
   de UNA sola categoría de productos. Un administrador programa la
   fecha, la categoría y a quién se le asigna (vendedor o admin). La
   persona asignada hace el conteo o pide una excepción; solo un
   administrador puede aprobar la excepción y reprogramar para otro día.
--------------------------------------------------------- */
function nextOccurrence(day) {
  const now = new Date();
  let d = new Date(now.getFullYear(), now.getMonth(), day);
  if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    d = new Date(now.getFullYear(), now.getMonth() + 1, day);
  }
  return d.toISOString().slice(0, 10);
}
function formatDateOnly(str) {
  if (!str) return "";
  try {
    return new Date(`${str}T00:00:00`).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
  } catch { return str; }
}
function isOverdue(record) {
  return record.status === "pendiente" && record.dueDate < new Date().toISOString().slice(0, 10);
}

function ScheduleCountModal({ users, categories, onClose, onSave, toast, session }) {
  const [dueDate, setDueDate] = useState(nextOccurrence(15));
  const [category, setCategory] = useState(categories[0] || "");
  const [assignedToId, setAssignedToId] = useState("");

  function submit() {
    if (!dueDate) return toast("Elige una fecha", "error");
    if (!category.trim()) return toast("Elige una categoría", "error");
    const user = users.find(u => u.id === assignedToId);
    if (!user) return toast("Asigna un perfil para este conteo", "error");
    onSave({
      id: uid("inv-count"), dueDate, category: category.trim(),
      assignedToId: user.id, assignedToName: user.name,
      assignedBy: session.name, status: "pendiente",
      createdAt: new Date().toISOString(),
      completedAt: null, completedBy: null, items: [],
      exception: null,
    });
  }

  return (
    <Modal title="Programar inventario obligatorio" onClose={onClose}>
      <Field label="Fecha">
        <div className="flex gap-1.5 mb-1.5">
          <button type="button" onClick={() => setDueDate(nextOccurrence(15))} className="text-[11px] px-2 py-1 rounded-md" style={{ background: C.paperDark, color: C.gray }}>Próximo día 15</button>
          <button type="button" onClick={() => setDueDate(nextOccurrence(29))} className="text-[11px] px-2 py-1 rounded-md" style={{ background: C.paperDark, color: C.gray }}>Próximo día 29</button>
        </div>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} style={inputStyle()} />
      </Field>
      <Field label="Categoría a inventariar">
        <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls} style={inputStyle()}>
          <option value="">Elige una categoría</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Asignar a">
        <select value={assignedToId} onChange={e => setAssignedToId(e.target.value)} className={inputCls} style={inputStyle()}>
          <option value="">Elige un perfil</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role === "admin" ? "Administrador" : "Vendedor"})</option>)}
        </select>
      </Field>
      <Btn full icon={Check} onClick={submit}>Programar</Btn>
    </Modal>
  );
}

function CountExecutionModal({ record, products, onClose, onSubmit }) {
  const categoryProducts = useMemo(() => products.filter(p => p.category === record.category), [products, record.category]);
  const [counts, setCounts] = useState(() => Object.fromEntries(categoryProducts.map(p => [p.id, String(p.stock)])));

  function submit() {
    const items = categoryProducts.map(p => {
      const counted = Number(counts[p.id]);
      const safeCounted = Number.isFinite(counted) ? counted : p.stock;
      return { productId: p.id, name: p.name, unitType: p.unitType, expected: p.stock, counted: safeCounted, diff: Number((safeCounted - p.stock).toFixed(3)) };
    });
    onSubmit(items);
  }

  const totalDiff = Object.entries(counts).reduce((sum, [id, v]) => {
    const p = categoryProducts.find(x => x.id === id);
    if (!p) return sum;
    const counted = Number(v);
    return sum + (Number.isFinite(counted) ? counted - p.stock : 0);
  }, 0);

  return (
    <Modal title={`Conteo — ${record.category}`} onClose={onClose} wide>
      <p className="text-xs mb-3" style={{ color: C.gray }}>Cuenta físicamente cada producto de esta categoría y anota la cantidad real. Al confirmar, el stock del sistema se ajusta a lo contado y las diferencias quedan registradas.</p>
      {categoryProducts.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Sin productos en esta categoría" hint="No hay nada que contar aquí." />
      ) : (
        <div className="rounded-xl overflow-hidden mb-3" style={{ border: `1.5px solid ${C.paperLine}` }}>
          <div className="max-h-80 overflow-y-auto divide-y" style={{ borderColor: C.paperLine }}>
            {categoryProducts.map(p => {
              const counted = Number(counts[p.id]);
              const diff = Number.isFinite(counted) ? counted - p.stock : 0;
              return (
                <div key={p.id} className="px-3 py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm truncate" style={{ color: C.ink }}>{p.name}</div>
                    <div className="text-xs" style={{ color: C.gray }}>Sistema: {p.stock}{p.unitType === "peso" ? " kg" : ""}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <input
                      type="number" step={p.unitType === "peso" ? "0.001" : "1"}
                      value={counts[p.id]} onChange={e => setCounts(c => ({ ...c, [p.id]: e.target.value }))}
                      className={`${inputCls} font-mono w-24 text-center`} style={inputStyle()}
                    />
                    {diff !== 0 && <Badge tone={diff > 0 ? "green" : "rust"}>{diff > 0 ? "+" : ""}{diff}</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {totalDiff !== 0 && (
        <div className="rounded-lg p-3 mb-3 text-sm font-semibold" style={{ background: totalDiff < 0 ? C.rustSoft : C.greenSoft, color: totalDiff < 0 ? C.rust : C.greenDark }}>
          Diferencia neta: {totalDiff > 0 ? "+" : ""}{totalDiff.toFixed(2)} unidades respecto al sistema
        </div>
      )}
      <Btn full icon={Check} onClick={submit} disabled={categoryProducts.length === 0}>Confirmar conteo y ajustar stock</Btn>
    </Modal>
  );
}

function CountDetailModal({ record, onClose }) {
  return (
    <Modal title={`Detalle del conteo — ${record.category}`} onClose={onClose} wide>
      <div className="text-sm space-y-1 mb-3">
        <div className="flex justify-between"><span style={{ color: C.gray }}>Fecha programada</span><span>{formatDateOnly(record.dueDate)}</span></div>
        <div className="flex justify-between"><span style={{ color: C.gray }}>Asignado a</span><span>{record.assignedToName}</span></div>
        <div className="flex justify-between"><span style={{ color: C.gray }}>Completado por</span><span>{record.completedBy} · {formatDate(record.completedAt)}</span></div>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: `1.5px solid ${C.paperLine}` }}>
        <div className="max-h-72 overflow-y-auto divide-y" style={{ borderColor: C.paperLine }}>
          {record.items.map(i => (
            <div key={i.productId} className="px-3 py-2 flex items-center justify-between text-sm">
              <span style={{ color: C.ink }}>{i.name}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs" style={{ color: C.gray }}>{i.expected} → {i.counted}</span>
                {i.diff !== 0 && <Badge tone={i.diff > 0 ? "green" : "rust"}>{i.diff > 0 ? "+" : ""}{i.diff}</Badge>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function ExceptionRequestModal({ onClose, onSubmit }) {
  const [reason, setReason] = useState("");
  return (
    <Modal title="Solicitar excepción" onClose={onClose}>
      <p className="text-xs mb-3" style={{ color: C.gray }}>Explica por qué no puedes hacer el conteo en la fecha programada. Un administrador debe aprobarlo y reprogramar para otro día.</p>
      <Field label="Motivo"><textarea autoFocus value={reason} onChange={e => setReason(e.target.value)} rows={3} className={inputCls} style={inputStyle()} placeholder="Ej. Estaré con licencia médica esos días…" /></Field>
      <Btn full variant="rust" disabled={!reason.trim()} onClick={() => onSubmit(reason.trim())}>Enviar solicitud</Btn>
    </Modal>
  );
}

function ExceptionApprovalModal({ record, onClose, onApprove }) {
  const [newDate, setNewDate] = useState(nextOccurrence(15));
  return (
    <Modal title="Aprobar excepción y reprogramar" onClose={onClose}>
      <div className="rounded-lg p-3 mb-3" style={{ background: C.paperDark }}>
        <div className="text-xs" style={{ color: C.gray }}>Motivo de {record.exception.requestedBy}:</div>
        <p className="text-sm mt-1" style={{ color: C.ink }}>{record.exception.reason}</p>
      </div>
      <Field label="Nueva fecha para este conteo"><input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className={inputCls} style={inputStyle()} /></Field>
      <Btn full icon={Check} onClick={() => onApprove(newDate)}>Aprobar y reprogramar</Btn>
    </Modal>
  );
}

function CountCard({ record, role, session, onExecute, onRequestException, onApproveException, onViewDetail }) {
  const overdue = isOverdue(record);
  const isMine = record.assignedToId === session.userId;
  return (
    <div className="rounded-xl p-4" style={{ background: "#fff", border: `1.5px solid ${overdue ? C.rust : C.paperLine}` }}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div>
          <div className="text-sm font-semibold" style={{ color: C.ink }}>{record.category}</div>
          <div className="text-xs" style={{ color: C.gray }}>{formatDateOnly(record.dueDate)} · asignado a {record.assignedToName}{isMine ? " (tú)" : ""}</div>
        </div>
        <Badge tone={record.status === "completado" ? "green" : record.status === "excepcion_solicitada" ? "brass" : overdue ? "rust" : "gray"}>
          {record.status === "completado" ? "Completado" : record.status === "excepcion_solicitada" ? "Excepción pendiente" : overdue ? "Atrasado" : "Pendiente"}
        </Badge>
      </div>

      {record.status === "excepcion_solicitada" && (
        <p className="text-xs italic mb-2" style={{ color: C.gray }}>"{record.exception.reason}"</p>
      )}

      <div className="flex flex-wrap gap-1.5 mt-2">
        {record.status === "pendiente" && (isMine || role === "admin") && (
          <Btn size="sm" icon={ClipboardList} onClick={() => onExecute(record)}>Hacer conteo</Btn>
        )}
        {record.status === "pendiente" && isMine && (
          <Btn size="sm" variant="ghost" icon={CalendarClock} onClick={() => onRequestException(record)}>Pedir excepción</Btn>
        )}
        {record.status === "excepcion_solicitada" && role === "admin" && (
          <Btn size="sm" variant="rust" icon={CalendarCheck2} onClick={() => onApproveException(record)}>Revisar excepción</Btn>
        )}
        {record.status === "completado" && (
          <Btn size="sm" variant="ghost" icon={ClipboardList} onClick={() => onViewDetail(record)}>Ver detalle</Btn>
        )}
      </div>
    </div>
  );
}

function InventoryCountsView({ counts, setCounts, products, setProducts, movements, setMovements, users, session, role, toast }) {
  const [scheduling, setScheduling] = useState(false);
  const [executing, setExecuting] = useState(null);
  const [requestingException, setRequestingException] = useState(null);
  const [approvingException, setApprovingException] = useState(null);
  const [viewingDetail, setViewingDetail] = useState(null);

  const categories = useMemo(() => [...new Set(products.map(p => p.category).filter(Boolean))].sort(), [products]);

  async function persist(nc) { setCounts(nc); await saveJSON("inventory-counts", nc); }

  async function scheduleNew(record) {
    const latest = await loadJSON("inventory-counts", counts);
    await persist([record, ...latest]);
    setScheduling(false);
    toast("Inventario programado", "success");
  }

  async function submitCount(items) {
    const date = new Date().toISOString();
    const latestProducts = await loadJSON("products-catalog", products);
    const newProducts = latestProducts.map(p => {
      const item = items.find(i => i.productId === p.id);
      return item ? { ...p, stock: item.counted, stockZeroSince: nextStockZeroSince(p.stock, p.stockZeroSince, item.counted) } : p;
    });
    const diffItems = items.filter(i => i.diff !== 0);
    const latestMovements = await loadJSON("movements-log", movements);
    const diffMovements = diffItems.map(i => {
      const prod = latestProducts.find(p => p.id === i.productId);
      return {
        id: uid("mov"), date, type: i.diff < 0 ? "egreso" : "ingreso",
        concept: `Ajuste por conteo de inventario: ${i.name} (${i.diff > 0 ? "+" : ""}${i.diff})`,
        amount: Math.abs(i.diff) * (prod?.cost || 0),
        category: "Ajuste de inventario", auto: true,
        // Dejan el rastro de qué conteo y qué producto originaron el ajuste.
        countId: executing.id, productId: i.productId, diff: i.diff,
      };
    });
    const newMovements = [...diffMovements, ...latestMovements];
    const latestCounts = await loadJSON("inventory-counts", counts);
    const newCounts = latestCounts.map(r => r.id === executing.id ? { ...r, status: "completado", completedAt: date, completedBy: session.name, items } : r);

    setProducts(newProducts); setMovements(newMovements); setCounts(newCounts);
    await Promise.all([
      saveJSON("products-catalog", newProducts, { origen: "conteo" }),
      saveJSON("inventory-counts", newCounts),
    ]);
    // El detalle del ajuste apunta al conteo, así que va después de él.
    await saveJSON("movements-log", newMovements);
    setExecuting(null);
    toast("Conteo registrado y stock ajustado", "success");
  }

  async function submitException(reason) {
    const latest = await loadJSON("inventory-counts", counts);
    const nc = latest.map(r => r.id === requestingException.id
      ? { ...r, status: "excepcion_solicitada", exception: { reason, requestedBy: session.name, requestedAt: new Date().toISOString(), approvedBy: null, approvedAt: null, previousDueDate: r.dueDate } }
      : r);
    await persist(nc);
    setRequestingException(null);
    toast("Excepción enviada, a la espera de un administrador", "success");
  }

  async function approveException(newDate) {
    const latest = await loadJSON("inventory-counts", counts);
    const nc = latest.map(r => r.id === approvingException.id
      ? { ...r, status: "pendiente", dueDate: newDate, exception: { ...r.exception, approvedBy: session.name, approvedAt: new Date().toISOString() } }
      : r);
    await persist(nc);
    setApprovingException(null);
    toast("Excepción aprobada y conteo reprogramado", "success");
  }

  const visible = role === "admin" ? counts : counts.filter(r => r.assignedToId === session.userId);
  const sorted = [...visible].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const pending = sorted.filter(r => r.status !== "completado");
  const completed = sorted.filter(r => r.status === "completado");

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: C.gray }}>Inventario obligatorio de una categoría el día 15 y otro el día 29 de cada mes.</p>
        {role === "admin" && <Btn icon={Plus} onClick={() => setScheduling(true)}>Programar inventario</Btn>}
      </div>

      {pending.length === 0 && completed.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Sin conteos programados" hint={role === "admin" ? "Programa el primero para el día 15 o 29." : "Cuando un administrador te asigne uno, aparecerá aquí."} />
      ) : (
        <div className="space-y-3">
          {pending.map(r => (
            <CountCard key={r.id} record={r} role={role} session={session} onExecute={setExecuting} onRequestException={setRequestingException} onApproveException={setApprovingException} onViewDetail={setViewingDetail} />
          ))}
          {completed.length > 0 && (
            <>
              <div className="text-xs font-semibold pt-2" style={{ color: C.gray }}>Completados</div>
              {completed.map(r => (
                <CountCard key={r.id} record={r} role={role} session={session} onExecute={setExecuting} onRequestException={setRequestingException} onApproveException={setApprovingException} onViewDetail={setViewingDetail} />
              ))}
            </>
          )}
        </div>
      )}

      {scheduling && <ScheduleCountModal users={users} categories={categories} onClose={() => setScheduling(false)} onSave={scheduleNew} toast={toast} session={session} />}
      {executing && <CountExecutionModal record={executing} products={products} onClose={() => setExecuting(null)} onSubmit={submitCount} />}
      {requestingException && <ExceptionRequestModal onClose={() => setRequestingException(null)} onSubmit={submitException} />}
      {approvingException && <ExceptionApprovalModal record={approvingException} onClose={() => setApprovingException(null)} onApprove={approveException} />}
      {viewingDetail && <CountDetailModal record={viewingDetail} onClose={() => setViewingDetail(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------
   INVENTARIO GENERAL — conteo puntual de todo el local (agosto 2026)
   Actividad de una sola noche: varias personas contando el local entero al
   mismo tiempo, cualquiera cuenta cualquier producto (sin repartirse nada
   de antemano), y cada conteo ajusta el stock al toque. Pensada para el
   teléfono: buscar por nombre o escanear con la cámara, anotar la cantidad
   real, confirmar, seguir con el siguiente. Reutiliza el mismo libro de
   conteos que ya existía (galpon.conteo/conteo_detalle) — ver
   registrarConteoInventarioGeneral en lib/datos — así que no hizo falta
   ninguna tabla nueva ni migración para esto.
--------------------------------------------------------- */
function GeneralInventoryView({ products, setProducts, inventoryCounts, session, toast, onLogout, adminEscapeHatch, onAdminEscape }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [countedValue, setCountedValue] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const inputRef = useRef(null);

  // Producto nuevo: para cuando lo que hay que contar no está en el
  // catálogo. Precio y costo quedan pendientes de un administrador (mismo
  // mecanismo de aprobación que ya existe para Recepción) — acá solo se
  // pide lo mínimo para poder anotar la cantidad contada de inmediato.
  const [addingNew, setAddingNew] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", category: "", barcode: "", unitType: "unidad" });
  const [creatingNew, setCreatingNew] = useState(false);
  const categoriasExistentes = useMemo(
    () => Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort(),
    [products]
  );
  // Crear una categoría nueva es solo para administradores (política de la
  // base, a propósito, para que no aparezcan secciones sueltas). Si quien
  // cuenta no es admin y escribe una que no existe, se detecta acá antes de
  // guardar — no vale la pena que el intento de crearla reviente el guardado
  // del producto entero.
  const categoriasExistentesNorm = useMemo(
    () => new Set(categoriasExistentes.map(c => normalize(c))),
    [categoriasExistentes]
  );

  const matches = useMemo(() => {
    if (query.trim().length < 1) return [];
    const q = normalize(query);
    return products.filter(p => normalize(p.name).includes(q) || normalize(p.barcode).includes(q)).slice(0, 12);
  }, [query, products]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const totalContadosHoy = useMemo(
    () => inventoryCounts.filter(c => c.status === "completado" && (c.completedAt || "").slice(0, 10) === todayStr).length,
    [inventoryCounts, todayStr]
  );

  // Para avisar (no bloquear: cualquiera puede recontar si hubo un error)
  // cuando un producto ya se contó hoy — por este mismo teléfono o por
  // cualquiera de los otros dos. Se queda con el conteo más reciente si
  // alguien lo contó más de una vez.
  const contadosHoyPorProducto = useMemo(() => {
    const m = new Map();
    for (const c of inventoryCounts) {
      if (c.status !== "completado" || (c.completedAt || "").slice(0, 10) !== todayStr) continue;
      for (const it of (c.items || [])) {
        const previo = m.get(it.productId);
        if (!previo || new Date(c.completedAt) > new Date(previo.at)) {
          m.set(it.productId, { counted: it.counted, at: c.completedAt, by: c.completedBy });
        }
      }
    }
    return m;
  }, [inventoryCounts, todayStr]);

  function pick(p) {
    setSelected(p);
    setQuery("");
    setCountedValue("");
    setTimeout(() => document.getElementById("conteo-cantidad")?.focus(), 50);
  }

  function handleScan(code) {
    const clean = code.trim();
    const found = products.find(p => p.barcode === clean);
    setScannerOpen(false);
    if (!found) {
      setNewForm({ name: "", category: "", barcode: clean, unitType: "unidad" });
      setAddingNew(true);
      toast(`Código ${clean} no está en el catálogo — complétalo como producto nuevo`, "success");
      return;
    }
    pick(found);
  }

  async function crearProductoNuevo() {
    const name = newForm.name.trim();
    if (!name) return toast("Escribe el nombre del producto", "error");
    if (creatingNew) return;
    setCreatingNew(true);
    try {
      // Se relee lo más reciente antes de escribir: con 3 teléfonos contando
      // a la vez, partir de una copia local vieja del catálogo completo
      // podría hacer pasar por "eliminado" (y desactivar) un producto que
      // otro dispositivo recién agregó.
      const latestProducts = await loadJSON("products-catalog", products);
      const barcode = newForm.barcode.trim();
      const date = new Date().toISOString();
      const categoriaEscrita = upperField(newForm.category || "");
      const categoriaYaExiste = !categoriaEscrita || categoriasExistentesNorm.has(normalize(categoriaEscrita));
      // Solo un admin puede crear una categoría nueva. Si no lo es y escribió
      // una que no existe, el producto igual se guarda — sin categoría, no
      // sin contar — y un admin se la asigna después.
      const categoriaFinal = (session.role === "admin" || categoriaYaExiste) ? categoriaEscrita : "";
      const nuevo = {
        id: uid("prod"),
        barcode: barcode || `INT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: upperField(name),
        category: categoriaFinal,
        price: 0,
        cost: 0,
        stock: 0,
        minStock: 5,
        supplierId: null,
        unitType: newForm.unitType === "peso" ? "peso" : "unidad",
        quickAccess: !barcode,
        priceApproval: { suggestedPrice: 0, netCost: 0, requestedBy: session.name, date, isNewProduct: true },
        priceHistory: [],
      };
      const actualizados = [...latestProducts, nuevo];
      await saveJSON("products-catalog", actualizados, { origen: "carga_inicial" });

      // guardarJSON no avisa si un producto se saltó en silencio (pasa cuando
      // su código de barras ya lo tiene otro producto, aunque esté
      // desactivado — el guardado evita duplicar el código, pero antes eso
      // se veía recién al contar, con un error confuso de "producto no
      // existe"). Se relee para confirmar que de verdad quedó creado antes
      // de avisar éxito y dejar contarlo.
      const verificacion = await loadJSON("products-catalog", actualizados);
      const quedoCreado = verificacion.some(p => p.id === nuevo.id);
      if (!quedoCreado) {
        setProducts(verificacion);
        toast(`Ya existe un producto con ese código de barras (probablemente desactivado) — no se pudo crear otro igual. Vuelve a intentarlo dejando el código de barras en blanco.`, "error");
        return;
      }

      setProducts(verificacion);
      const avisoCategoria = categoriaEscrita && !categoriaFinal ? " — sin categoría (un admin la asigna después)" : "";
      toast(`"${nuevo.name}" agregado al catálogo — precio pendiente de aprobación${avisoCategoria}`, "success");
      setAddingNew(false);
      pick(nuevo);
    } catch (e) {
      toast(friendlyError(e, "No se pudo agregar el producto"), "error");
    } finally {
      setCreatingNew(false);
    }
  }

  async function confirm() {
    if (!selected || saving) return;
    const n = Number(countedValue);
    if (countedValue === "" || !Number.isFinite(n) || n < 0) return toast("Ingresa una cantidad válida", "error");
    setSaving(true);
    try {
      const { stock, diff } = await registrarConteoInventarioGeneral({ product: selected, counted: n });
      setProducts(prev => prev.map(p => p.id === selected.id ? { ...p, stock } : p));
      setSessionCount(s => s + 1);
      toast(diff === 0 ? "Conteo registrado — sin diferencia" : `Conteo registrado — ${diff > 0 ? "+" : ""}${diff} vs. sistema`, "success");
      setSelected(null); setCountedValue("");
      inputRef.current?.focus();
    } catch (e) {
      toast(friendlyError(e, "No se pudo registrar el conteo"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.paper }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between" style={{ background: C.ink, color: C.paper }}>
        <div>
          <div className="font-semibold text-sm" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Inventario general</div>
          <div className="text-[11px] opacity-70">{session.name} · {totalContadosHoy} contados entre todos · {sessionCount} tuyos</div>
        </div>
        <div className="flex items-center gap-1">
          {adminEscapeHatch && (
            <button onClick={onAdminEscape} className="px-2 py-1.5 rounded-lg text-[11px] font-medium" style={{ color: C.paper, background: "rgba(255,255,255,0.12)" }} title="Salir del Inventario General y usar el panel completo">
              Panel completo
            </button>
          )}
          {onLogout && <button onClick={onLogout} className="p-2 rounded-lg" style={{ color: C.paper }}><LogOut size={18} /></button>}
        </div>
      </div>

      <div className="p-4 flex-1 max-w-md mx-auto w-full">
        <div className="rounded-xl p-3 mb-4" style={{ background: C.brassSoft }}>
          <p className="text-xs" style={{ color: "#8a6a1f" }}>Cuenta lo que tengas al frente: escanea el código o busca por nombre, anota la cantidad real y confirma. No hace falta repartirse nada — cualquiera cuenta cualquier producto.</p>
        </div>

        {addingNew ? (
          <div className="rounded-xl p-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
            <div className="text-base font-semibold mb-3" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Producto nuevo</div>

            <label className="block mb-3">
              <span className="block text-sm font-semibold mb-1.5" style={{ color: C.ink }}>Nombre</span>
              <input autoFocus value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} className={`${inputCls} text-base`} style={{ ...inputStyle(), textTransform: "uppercase" }} placeholder="Nombre del producto" />
            </label>

            <label className="block mb-3">
              <span className="block text-sm font-semibold mb-1.5" style={{ color: C.ink }}>Categoría (opcional)</span>
              <input list="categorias-inventario-general" value={newForm.category} onChange={e => setNewForm(f => ({ ...f, category: e.target.value }))} className={`${inputCls} text-base`} style={{ ...inputStyle(), textTransform: "uppercase" }} placeholder="Ej. Bebidas, Abarrotes…" />
              <datalist id="categorias-inventario-general">
                {categoriasExistentes.map(c => <option key={c} value={c} />)}
              </datalist>
            </label>

            <label className="block mb-3">
              <span className="block text-sm font-semibold mb-1.5" style={{ color: C.ink }}>Se vende por</span>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setNewForm(f => ({ ...f, unitType: "unidad" }))} className="py-2 rounded-lg text-sm font-medium" style={newForm.unitType === "unidad" ? { background: C.brass, color: C.ink } : { background: C.paperDark, color: C.gray }}>Unidad</button>
                <button type="button" onClick={() => setNewForm(f => ({ ...f, unitType: "peso" }))} className="py-2 rounded-lg text-sm font-medium" style={newForm.unitType === "peso" ? { background: C.brass, color: C.ink } : { background: C.paperDark, color: C.gray }}>Peso (kg)</button>
              </div>
            </label>

            <label className="block mb-4">
              <span className="block text-sm font-semibold mb-1.5" style={{ color: C.ink }}>Código de barras (opcional)</span>
              <input value={newForm.barcode} onChange={e => setNewForm(f => ({ ...f, barcode: e.target.value }))} className={`${inputCls} font-mono text-sm`} style={inputStyle()} placeholder="Déjalo vacío si no tiene" />
            </label>

            <p className="text-xs mb-4" style={{ color: C.gray }}>El precio y el costo quedan pendientes — un administrador los completa después desde Aprobaciones. Apenas lo crees, vas a poder anotar la cantidad contada.</p>

            <div className="flex gap-2">
              <Btn variant="ghost" full onClick={() => setAddingNew(false)}>Cancelar</Btn>
              <Btn full size="lg" icon={creatingNew ? Loader2 : Check} disabled={creatingNew || !newForm.name.trim()} onClick={crearProductoNuevo}>Crear y contar</Btn>
            </div>
          </div>
        ) : !selected ? (
          <>
            <div className="relative mb-3">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.gray }} />
              <input ref={inputRef} autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Busca el producto por nombre…" className={`${inputCls} pl-10 text-base`} style={inputStyle()} />
            </div>
            <Btn full size="lg" variant="dark" icon={Camera} onClick={() => setScannerOpen(true)}>Escanear código</Btn>

            {matches.length > 0 && (
              <div className="mt-3 rounded-xl overflow-hidden" style={{ border: `1.5px solid ${C.paperLine}`, background: "#fff" }}>
                {matches.map(p => {
                  const yaContado = contadosHoyPorProducto.get(p.id);
                  return (
                    <button key={p.id} onClick={() => pick(p)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-black/[.03]" style={{ borderBottom: `1px solid ${C.paperLine}` }}>
                      <div>
                        <div className="text-sm font-medium" style={{ color: C.ink }}>{p.name}</div>
                        <div className="text-xs flex items-center gap-1" style={{ color: yaContado ? "#2f7a4d" : C.gray }}>
                          {yaContado && <CheckCircle2 size={12} />}
                          {yaContado ? `Ya contado hoy — ${yaContado.counted}${p.unitType === "peso" ? " kg" : ""}` : (p.category || "Sin categoría")}
                        </div>
                      </div>
                      <div className="text-xs font-mono flex-shrink-0 ml-2" style={{ color: C.gray }}>sistema: {p.stock}{p.unitType === "peso" ? " kg" : ""}</div>
                    </button>
                  );
                })}
              </div>
            )}
            {query.trim().length > 0 && matches.length === 0 && (
              <>
                <EmptyState icon={Search} title="Sin resultados" hint="Prueba con otra palabra, escanea el código, o agrégalo como producto nuevo." />
                <Btn full variant="ghost" icon={Plus} onClick={() => { setNewForm({ name: upperField(query), category: "", barcode: "", unitType: "unidad" }); setAddingNew(true); }}>
                  Agregar "{query}" como producto nuevo
                </Btn>
              </>
            )}
          </>
        ) : (
          <div className="rounded-xl p-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
            <div className="text-base font-semibold mb-0.5" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>{selected.name}</div>
            <div className="text-xs mb-4" style={{ color: C.gray }}>{selected.category || "Sin categoría"} · sistema dice {selected.stock}{selected.unitType === "peso" ? " kg" : ""}</div>

            {contadosHoyPorProducto.get(selected.id) && (
              <div className="rounded-lg p-3 mb-4 flex items-start gap-2" style={{ background: "#fef3e6", color: "#8a5a1f" }}>
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                <p className="text-xs">
                  Este producto ya se contó hoy: <strong>{contadosHoyPorProducto.get(selected.id).counted}{selected.unitType === "peso" ? " kg" : ""}</strong>
                  {contadosHoyPorProducto.get(selected.id).by ? ` (${contadosHoyPorProducto.get(selected.id).by}` : ""}
                  {contadosHoyPorProducto.get(selected.id).at ? `, ${new Date(contadosHoyPorProducto.get(selected.id).at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })})` : (contadosHoyPorProducto.get(selected.id).by ? ")" : "")}.
                  {" "}Si vuelves a confirmar, se toma como una corrección de ese conteo — solo hazlo si de verdad es distinto.
                </p>
              </div>
            )}

            <label className="block mb-4">
              <span className="block text-sm font-semibold mb-1.5" style={{ color: C.ink }}>Cantidad real contada{selected.unitType === "peso" ? " (kg)" : ""}</span>
              <input
                id="conteo-cantidad" type="number" inputMode="decimal" step={selected.unitType === "peso" ? "0.001" : "1"}
                autoFocus value={countedValue} onChange={e => setCountedValue(e.target.value)}
                onKeyDown={e => e.key === "Enter" && confirm()}
                className={`${inputCls} font-mono text-2xl text-center`} style={inputStyle()} placeholder="0"
              />
            </label>

            <div className="flex gap-2">
              <Btn variant="ghost" full onClick={() => { setSelected(null); setCountedValue(""); }}>Cancelar</Btn>
              <Btn full size="lg" icon={saving ? Loader2 : Check} disabled={saving || countedValue === ""} onClick={confirm}>Confirmar</Btn>
            </div>
          </div>
        )}
      </div>

      {scannerOpen && <CameraScanner onDetect={handleScan} onClose={() => setScannerOpen(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------
   TRANSFORMACIÓN DE PRODUCTOS
   Para productos del local que se transforman en otro producto distinto
   (ej. lechugas → ensaladas de lechuga). El costo de los insumos se toma
   por su PRECIO DE VENTA (no su costo neto) porque ese precio ya trae el
   margen habitual (19% IVA + 30%) incorporado — sumarle el margen de nuevo
   al producto resultante sería cobrarlo dos veces. Al costo de los insumos
   se le suma el costo de materiales (bolsas, guantes, etc.) por unidad
   resultante, más un costo fijo (agua, luz, gas) configurable, y de ahí
   sale el precio recomendado — sin agregar ningún margen adicional.
--------------------------------------------------------- */
function ProductSearchSelect({ products, value, onSelect, placeholder }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = products.find(p => p.id === value);
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = normalize(query);
    return products.filter(p => normalize(p.name).includes(q)).slice(0, 8);
  }, [query, products]);

  return (
    <div className="relative flex-1 min-w-[160px]">
      <input
        value={selected ? selected.name : query}
        onChange={e => { onSelect(""); setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { if (selected) { onSelect(""); setQuery(""); } setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={`${inputCls} text-sm`} style={inputStyle()}
      />
      {open && matches.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded-lg overflow-hidden shadow-lg max-h-56 overflow-y-auto" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
          {matches.map(p => (
            <button key={p.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onSelect(p.id); setQuery(""); setOpen(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-black/[.03] flex items-center justify-between" style={{ borderBottom: `1px solid ${C.paperLine}` }}>
              <span style={{ color: C.ink }}>{p.name}</span>
              <span className="text-xs font-mono flex-shrink-0 ml-2" style={{ color: C.gray }}>stock {p.stock}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TransformInputRow({ row, products, onChange, onRemove, canRemove }) {
  const product = products.find(p => p.id === row.productId);
  const withStock = useMemo(() => products.filter(p => p.stock > 0), [products]);
  return (
    <div className="flex flex-wrap items-center gap-2 mb-2">
      <ProductSearchSelect products={withStock} value={row.productId} onSelect={id => onChange({ ...row, productId: id })} placeholder="Escribe el nombre del producto…" />
      <input type="number" step={product?.unitType === "peso" ? "0.001" : "1"} value={row.qty} onChange={e => onChange({ ...row, qty: e.target.value })} placeholder="Cantidad" className={`${inputCls} w-28 font-mono text-sm`} style={inputStyle()} />
      {product && <span className="text-xs font-mono w-24 text-right" style={{ color: C.gray }}>{formatCLP(product.cost)}{product.unitType === "peso" ? "/kg" : ""}</span>}
      {canRemove && <button onClick={onRemove} style={{ color: C.rust }}><Trash2 size={16} /></button>}
    </div>
  );
}

function TransformationsHistory({ log }) {
  const [open, setOpen] = useState(false);
  if (log.length === 0) return null;
  return (
    <div className="mt-4">
      <button onClick={() => setOpen(o => !o)} className="text-xs font-medium underline" style={{ color: C.gray }}>{open ? "Ocultar" : "Ver"} historial de transformaciones ({log.length})</button>
      {open && (
        <div className="rounded-lg overflow-hidden mt-2" style={{ border: `1.5px solid ${C.paperLine}` }}>
          <div className="max-h-64 overflow-y-auto divide-y" style={{ borderColor: C.paperLine }}>
            {log.slice(0, 50).map(t => (
              <div key={t.id} className="px-3 py-2 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: C.ink }}>{t.inputs.map(i => `${i.qty} ${i.name}`).join(" + ")} → {t.qtyOutput} {t.outputName}</span>
                  <span style={{ color: C.gray }}>{formatDate(t.date)}</span>
                </div>
                <div style={{ color: C.gray }}>Costo por unidad: {formatCLP(t.costPerUnit)} · Precio recomendado: {formatCLP(t.recommendedPrice)} · por {t.performedBy}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TransformView({ products, setProducts, movements, setMovements, settings, setSettings, session, role, toast }) {
  const isAdmin = (role || session.role) === "admin";
  const [inputs, setInputs] = useState([{ productId: "", qty: "" }]);
  const [outputMode, setOutputMode] = useState("existing");
  const [outputProductId, setOutputProductId] = useState("");
  const [newOutputName, setNewOutputName] = useState("");
  const [newOutputCategory, setNewOutputCategory] = useState("");
  const [qtyOutput, setQtyOutput] = useState("");
  const [additionalCost, setAdditionalCost] = useState(settings.transformCostoAdicional ?? 280);
  const [editingCost, setEditingCost] = useState(false);
  const [applyPrice, setApplyPrice] = useState(true);
  const [finalPrice, setFinalPrice] = useState("");
  const [priceEdited, setPriceEdited] = useState(false);
  const [confirmedLossTransform, setConfirmedLossTransform] = useState(false);
  const [log, setLog] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { (async () => setLog(await loadJSON("transformations-log", [])))(); }, []);

  const outputProduct = products.find(p => p.id === outputProductId);

  function updateInput(i, row) { setInputs(prev => prev.map((r, idx) => idx === i ? row : r)); }
  function addInputRow() { setInputs(prev => [...prev, { productId: "", qty: "" }]); }
  function removeInputRow(i) { setInputs(prev => prev.filter((_, idx) => idx !== i)); }

  const validInputs = inputs.filter(r => r.productId && Number(r.qty) > 0);
  const totalInputCost = validInputs.reduce((sum, r) => {
    const p = products.find(x => x.id === r.productId);
    return sum + (p ? p.cost * Number(r.qty) : 0);
  }, 0);
  const qtyOutNum = Number(qtyOutput) || 0;
  const totalAdditionalCost = Number(additionalCost) || 0;
  const totalCost = totalInputCost + totalAdditionalCost;
  const costPerUnit = qtyOutNum > 0 ? totalCost / qtyOutNum : 0;
  const recommendedPrice = Math.round(costPerUnit / 10) * 10;
  // El precio se puede ajustar a mano — el calculado es solo el punto de
  // partida. Una vez definido, se aplica igual para todas las unidades
  // resultantes de esta tanda (no hay precios distintos dentro de la misma
  // venta).
  useEffect(() => { if (!priceEdited) setFinalPrice(recommendedPrice ? String(recommendedPrice) : ""); }, [recommendedPrice, priceEdited]);
  const finalPriceNum = Number(finalPrice) || 0;
  const sellsAtLossTransform = finalPriceNum > 0 && costPerUnit > 0 && finalPriceNum <= costPerUnit;

  const stockOk = validInputs.every(r => {
    const p = products.find(x => x.id === r.productId);
    return p && Number(r.qty) <= p.stock;
  });
  const outputReady = outputMode === "existing" ? !!outputProductId : newOutputName.trim().length > 0;
  const canConfirm = validInputs.length > 0 && stockOk && outputReady && qtyOutNum > 0 && finalPriceNum > 0 && !saving && (!sellsAtLossTransform || confirmedLossTransform);

  async function confirm() {
    setSaving(true);
    try {
      const latestProducts = await loadJSON("products-catalog", products);
      let np = [...latestProducts];

      validInputs.forEach(r => {
        np = np.map(p => {
          if (p.id !== r.productId) return p;
          const nextStock = Math.max(0, p.stock - Number(r.qty));
          return { ...p, stock: nextStock, stockZeroSince: nextStockZeroSince(p.stock, p.stockZeroSince, nextStock) };
        });
      });

      const now = new Date().toISOString();
      let finalOutputId = outputProductId;
      let finalOutputName = outputProduct?.name;

      if (outputMode === "new") {
        const newProd = {
          id: uid("prod"), barcode: `INT-${Date.now()}`, name: upperField(newOutputName), category: upperField(newOutputCategory) || "PREPARADOS",
          price: finalPriceNum, cost: costPerUnit, stock: qtyOutNum, stockZeroSince: qtyOutNum > 0 ? null : now, minStock: 3, supplierId: null,
          unitType: "unidad", quickAccess: true, priceApproval: null,
          priceHistory: [{ date: now, cost: costPerUnit, price: finalPriceNum }],
        };
        np = [...np, newProd];
        finalOutputId = newProd.id; finalOutputName = newProd.name;
      } else {
        np = np.map(p => {
          if (p.id !== outputProductId) return p;
          const newPrice = applyPrice ? finalPriceNum : p.price;
          return { ...p, stock: p.stock + qtyOutNum, cost: costPerUnit, price: newPrice, priceHistory: pushPriceHistory(p.priceHistory, costPerUnit, newPrice), stockZeroSince: nextStockZeroSince(p.stock, p.stockZeroSince, p.stock + qtyOutNum) };
        });
      }

      const latestMovements = await loadJSON("movements-log", movements);
      const nm = totalAdditionalCost > 0 ? [{
        id: uid("mov"), date: now, type: "egreso",
        concept: `Transformación a ${finalOutputName}: costos adicionales`,
        amount: totalAdditionalCost, category: "Transformación de productos", auto: true,
      }, ...latestMovements] : latestMovements;

      const latestLog = await loadJSON("transformations-log", log);
      const record = {
        id: uid("transf"), date: now,
        inputs: validInputs.map(r => { const p = products.find(x => x.id === r.productId); return { productId: r.productId, name: p.name, qty: Number(r.qty), costEach: p.cost }; }),
        outputProductId: finalOutputId, outputName: finalOutputName, qtyOutput: qtyOutNum,
        additionalCost: totalAdditionalCost,
        totalCost, costPerUnit, recommendedPrice, appliedPrice: finalPriceNum, performedBy: session.name,
      };
      const nl = [record, ...latestLog];

      const ns = { ...settings, transformCostoAdicional: Number(additionalCost) || 0 };

      setProducts(np); setMovements(nm); setLog(nl); setSettings(ns);
      // El producto de salida puede ser nuevo, y la transformación lo referencia:
      // tiene que existir antes. Por eso el catálogo va primero y solo entonces
      // se registra la transformación.
      await saveJSON("products-catalog", np, { origen: "transformacion" });
      await saveJSON("transformations-log", nl);
      await Promise.all([
        saveJSON("movements-log", nm),
        saveJSON("business-settings", ns),
      ]);

      setInputs([{ productId: "", qty: "" }]);
      setOutputProductId(""); setNewOutputName(""); setNewOutputCategory(""); setQtyOutput(""); setPriceEdited(false); setConfirmedLossTransform(false); setEditingCost(false);
      toast("Transformación registrada", "success");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <p className="text-xs mb-4" style={{ color: C.gray }}>Para productos que cambian de forma dentro del local (ej. lechugas → ensaladas). El precio recomendado se calcula sobre el costo real de los insumos más los costos adicionales — no lleva margen agregado, revisa si conviene aplicar el margen habitual del 19%+30% antes de confirmar.</p>

      <div className="rounded-xl p-4 mb-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
        <div className="text-sm font-semibold mb-2" style={{ color: C.ink }}>1. Productos que entran a transformación</div>
        {inputs.map((row, i) => (
          <TransformInputRow key={i} row={row} products={products} onChange={r => updateInput(i, r)} onRemove={() => removeInputRow(i)} canRemove={inputs.length > 1} />
        ))}
        <button onClick={addInputRow} className="text-xs font-medium underline" style={{ color: C.green }}>+ Agregar otro insumo</button>
        {!stockOk && <p className="text-xs mt-2" style={{ color: C.rust }}>Alguna cantidad supera el stock disponible de ese producto.</p>}

        <div className="text-sm font-semibold mt-4 mb-2" style={{ color: C.ink }}>2. Producto resultante</div>
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          <button type="button" onClick={() => setOutputMode("existing")} className="py-2 rounded-lg text-sm font-medium" style={outputMode === "existing" ? { background: C.brass, color: C.ink } : { background: C.paperDark, color: C.gray }}>Producto ya existente</button>
          <button type="button" onClick={() => setOutputMode("new")} className="py-2 rounded-lg text-sm font-medium" style={outputMode === "new" ? { background: C.brass, color: C.ink } : { background: C.paperDark, color: C.gray }}>Producto nuevo</button>
        </div>
        {outputMode === "existing" ? (
          <div className="mb-2">
            <ProductSearchSelect products={products} value={outputProductId} onSelect={setOutputProductId} placeholder="Escribe el nombre del producto resultante…" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input value={newOutputName} onChange={e => setNewOutputName(e.target.value)} placeholder="Nombre (ej. Ensalada de lechuga)" className={`${inputCls} text-sm`} style={{ ...inputStyle(), textTransform: "uppercase" }} />
            <input value={newOutputCategory} onChange={e => setNewOutputCategory(e.target.value)} placeholder="Categoría (ej. Preparados)" className={`${inputCls} text-sm`} style={{ ...inputStyle(), textTransform: "uppercase" }} />
          </div>
        )}
        <Field label="Unidades resultantes"><input type="number" value={qtyOutput} onChange={e => setQtyOutput(e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} placeholder="Ej. 6" /></Field>

        <div className="text-sm font-semibold mt-2 mb-2" style={{ color: C.ink }}>3. Costos adicionales</div>
        {!editingCost || !isAdmin ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs" style={{ color: C.gray }}>Bolsas, guantes, agua, luz, gas y demás gastos de transformar — se aplica automático, sin preguntar cada vez.</p>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-mono font-semibold" style={{ color: C.ink }}>{formatCLP(Number(additionalCost) || 0)}</span>
              {isAdmin && <button type="button" onClick={() => setEditingCost(true)} className="text-xs font-medium underline" style={{ color: C.green }}>Editar</button>}
            </div>
          </div>
        ) : (
          <Field label="Costos adicionales de esta tanda">
            <div className="flex items-center gap-2">
              <input autoFocus type="number" value={additionalCost} onChange={e => setAdditionalCost(e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} />
              <button type="button" onClick={() => setEditingCost(false)} className="text-xs font-medium underline shrink-0" style={{ color: C.gray }}>Listo</button>
            </div>
            <p className="text-[11px] mt-1" style={{ color: C.gray }}>Este monto queda como el nuevo valor automático para la próxima vez.</p>
          </Field>
        )}
      </div>

      {qtyOutNum > 0 && validInputs.length > 0 && (
        <div className="rounded-xl p-4 mb-4" style={{ background: C.ink }}>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span style={{ color: C.grayLight }}>Costo de insumos ({validInputs.length})</span><span className="font-mono" style={{ color: C.paper }}>{formatCLP(totalInputCost)}</span></div>
            <div className="flex justify-between"><span style={{ color: C.grayLight }}>Costos adicionales</span><span className="font-mono" style={{ color: C.paper }}>{formatCLP(totalAdditionalCost)}</span></div>
            <div className="flex justify-between pt-1.5" style={{ borderTop: `1px dashed ${C.inkSoft}` }}><span style={{ color: C.grayLight }}>Costo total</span><span className="font-mono font-semibold" style={{ color: C.paper }}>{formatCLP(totalCost)}</span></div>
            <div className="flex justify-between"><span style={{ color: C.grayLight }}>Costo por unidad resultante</span><span className="font-mono font-semibold" style={{ color: C.brass }}>{formatCLP(costPerUnit)}</span></div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-3 mt-2" style={{ borderTop: `1px dashed ${C.inkSoft}` }}>
            <div>
              <div className="text-sm" style={{ color: "#fff" }}>Precio de venta a usar</div>
              <div className="text-[11px]" style={{ color: C.grayLight }}>Sugerido: {formatCLP(recommendedPrice)} — puedes cambiarlo, se aplica igual a las {qtyOutNum} unidades</div>
            </div>
            <input
              type="number" value={finalPrice}
              onChange={e => { setFinalPrice(e.target.value); setPriceEdited(true); setConfirmedLossTransform(false); }}
              className="w-28 px-2.5 py-2 rounded-lg font-mono text-right font-bold text-base"
              style={{ background: "#fff", border: "none", color: C.ink }}
            />
          </div>
          {priceEdited && (
            <button type="button" onClick={() => { setPriceEdited(false); setConfirmedLossTransform(false); }} className="text-[11px] underline mt-1" style={{ color: C.grayLight }}>Volver a usar el precio sugerido</button>
          )}

          {sellsAtLossTransform && (
            <div className="rounded-lg p-3 mt-3" style={{ background: C.rustSoft }}>
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle size={14} style={{ color: C.rust }} />
                <span className="text-sm font-semibold" style={{ color: C.rust }}>Este precio no cubre el costo</span>
              </div>
              <p className="text-xs mb-2" style={{ color: C.rust }}>El costo por unidad es {formatCLP(costPerUnit)} — vender a {formatCLP(finalPriceNum)} deja pérdida.</p>
              <label className="flex items-center gap-2 text-xs font-medium" style={{ color: C.rust }}>
                <input type="checkbox" checked={confirmedLossTransform} onChange={e => setConfirmedLossTransform(e.target.checked)} />
                Entiendo, continuar de todas formas
              </label>
            </div>
          )}

          {outputMode === "existing" && outputProduct && (
            <label className="flex items-center gap-2 text-xs font-medium mt-3" style={{ color: C.grayLight }}>
              <input type="checkbox" checked={applyPrice} onChange={e => setApplyPrice(e.target.checked)} />
              Actualizar también el precio de venta de {outputProduct.name} a {formatCLP(finalPriceNum)}
            </label>
          )}
        </div>
      )}

      <Btn full icon={Blend} disabled={!canConfirm} onClick={confirm}>{saving ? "Guardando…" : "Confirmar transformación"}</Btn>

      <TransformationsHistory log={log} />
    </div>
  );
}

/* ---------------------------------------------------------
   USUARIOS (solo admin)
   Perfiles del equipo: usuario y contraseña propios, rol, y un
   resumen de la actividad de cada persona (ventas, recepciones,
   turnos de caja) cruzando los datos que ya registra el sistema.
--------------------------------------------------------- */
function userStats(user, sales, invoicesIndex, shiftsLog) {
  const userSales = sales.filter(s => s.seller === user.name);
  const salesTotal = userSales.reduce((a, s) => a + s.total, 0);
  const userInvoices = invoicesIndex.filter(i => i.registeredBy === user.name);
  const receptionsTotal = userInvoices.reduce((a, i) => a + i.totalGross, 0);
  const userShifts = shiftsLog.filter(s => s.openedBy === user.name || s.closedBy === user.name);
  return { salesCount: userSales.length, salesTotal, receptionsCount: userInvoices.length, receptionsTotal, shiftsCount: userShifts.length };
}

function UserModal({ initial, users, onClose, onSave, toast }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState({
    name: initial?.name || "",
    username: initial?.username || "",
    password: "",
    role: initial?.role || "vendedor",
    pin: initial?.pin || "",
  });
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function submit() {
    if (!form.name.trim()) return toast("Escribe el nombre", "error");
    if (!form.username.trim()) return toast("Escribe un nombre de usuario", "error");
    if (!isEdit && !form.password) return toast("Escribe una contraseña", "error");
    // Al crear, el PIN es obligatorio (sin él no hay forma de identificarse en
    // la caja). Al editar, en blanco significa "no cambiarlo" — el PIN nunca
    // se lee de vuelta desde la base, así que no hay un valor previo que
    // mostrar. Si escriben algo, tiene que ser un PIN válido.
    if (!isEdit && (!form.pin.trim() || form.pin.trim().length < 4)) {
      return toast("Ingresa un PIN de vendedor de al menos 4 dígitos", "error");
    }
    if (form.pin.trim() && form.pin.trim().length < 4) {
      return toast("El PIN debe tener al menos 4 dígitos", "error");
    }
    const taken = users.some(u => normalize(u.username) === normalize(form.username.trim()) && u.id !== initial?.id);
    if (taken) return toast("Ese nombre de usuario ya está en uso", "error");
    // La unicidad del PIN ya no se puede comprobar aquí: el PIN de las demás
    // personas nunca llega al navegador. La revisa el servidor al guardar
    // (galpon.fijar_pin, migración 0013) y, si choca, el error vuelve como
    // toast desde UsersView.saveUser.
    onSave({
      id: initial?.id || uid("user"),
      name: form.name.trim(),
      username: form.username.trim(),
      password: form.password ? form.password : (initial?.password || ""),
      role: form.role,
      pin: form.pin.trim(),
      createdAt: initial?.createdAt || new Date().toISOString(),
    });
  }

  return (
    <Modal title={isEdit ? "Editar usuario" : "Nuevo usuario"} onClose={onClose}>
      <Field label="Nombre"><input autoFocus value={form.name} onChange={e => set("name", e.target.value)} className={inputCls} style={inputStyle()} placeholder="Ej. Carla Muñoz" /></Field>
      <Field label="Nombre de usuario"><input value={form.username} onChange={e => set("username", e.target.value)} className={`${inputCls} font-mono`} style={inputStyle()} placeholder="Ej. carla" /></Field>
      <Field label={isEdit ? "Nueva contraseña (déjalo vacío para no cambiarla)" : "Contraseña"}>
        <input type="password" value={form.password} onChange={e => set("password", e.target.value)} className={inputCls} style={inputStyle()} placeholder="••••" />
      </Field>
      <Field label={isEdit ? "Nuevo PIN de vendedor (déjalo vacío para no cambiarlo)" : "PIN de vendedor (para identificarse antes de cada venta — distinto del PIN de administrador de Ajustes)"}>
        <input type="password" inputMode="numeric" maxLength={6} value={form.pin} onChange={e => set("pin", e.target.value.replace(/\D/g, ""))} className={`${inputCls} font-mono`} style={inputStyle()} placeholder="••••" />
      </Field>
      <Field label="Rol">
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => set("role", "vendedor")} className="py-2 rounded-lg text-sm font-medium" style={form.role === "vendedor" ? { background: C.brass, color: C.ink } : { background: C.paperDark, color: C.gray }}>Vendedor</button>
          <button type="button" onClick={() => set("role", "admin")} className="py-2 rounded-lg text-sm font-medium" style={form.role === "admin" ? { background: C.brass, color: C.ink } : { background: C.paperDark, color: C.gray }}>Administrador</button>
        </div>
      </Field>
      <Btn full icon={Check} onClick={submit}>Guardar</Btn>
    </Modal>
  );
}

function UserCard({ user, sales, invoicesIndex, shiftsLog, isSelf, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const stats = userStats(user, sales, invoicesIndex, shiftsLog);
  return (
    <div className="rounded-xl p-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: user.role === "admin" ? C.brassSoft : C.greenSoft }}>
            <User size={16} style={{ color: user.role === "admin" ? "#8a6a1f" : C.greenDark }} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate flex items-center gap-1.5" style={{ color: C.ink }}>{user.name}{isSelf && <span className="text-[10px] font-normal" style={{ color: C.gray }}>(tú)</span>}</div>
            <div className="text-xs font-mono" style={{ color: C.gray }}>@{user.username}</div>
          </div>
        </div>
        <Badge tone={user.role === "admin" ? "brass" : "green"}>{user.role === "admin" ? "Administrador" : "Vendedor"}</Badge>
      </div>
      <div className="flex gap-1.5 mt-2">
        <button onClick={() => onEdit(user)} className="p-2.5 rounded-md" style={{ background: C.paperDark, color: C.ink }}><Pencil size={16} /></button>
        {!isSelf && <button onClick={() => onDelete(user)} className="p-2.5 rounded-md" style={{ background: C.rustSoft, color: C.rust }}><Trash2 size={16} /></button>}
        <button onClick={() => setExpanded(e => !e)} className="text-xs font-medium flex items-center gap-1 ml-auto" style={{ color: C.green }}>
          {expanded ? "Ocultar resumen" : "Ver resumen"}
        </button>
      </div>
      {expanded && (
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3" style={{ borderTop: `1px dashed ${C.paperLine}` }}>
          <div>
            <div className="text-[10px]" style={{ color: C.gray }}>Ventas</div>
            <div className="text-sm font-semibold" style={{ color: C.ink }}>{stats.salesCount}</div>
            <div className="text-[10px] font-mono" style={{ color: C.greenDark }}>{formatCLP(stats.salesTotal)}</div>
          </div>
          <div>
            <div className="text-[10px]" style={{ color: C.gray }}>Recepciones</div>
            <div className="text-sm font-semibold" style={{ color: C.ink }}>{stats.receptionsCount}</div>
            <div className="text-[10px] font-mono" style={{ color: C.gray }}>{formatCLP(stats.receptionsTotal)}</div>
          </div>
          <div>
            <div className="text-[10px]" style={{ color: C.gray }}>Turnos de caja</div>
            <div className="text-sm font-semibold" style={{ color: C.ink }}>{stats.shiftsCount}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function UsersView({ users, setUsers, sales, invoicesIndex, shiftsLog, session, toast }) {
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // Si guardar falla (por ejemplo, un PIN de vendedor que ya usa otra
  // persona — algo que solo el servidor puede saber con certeza, migración
  // 0013) se deshace el cambio optimista: lo que llegó a mostrarse en
  // pantalla no llegó a guardarse de verdad.
  async function persist(nu) {
    const previo = users;
    setUsers(nu);
    try {
      await saveJSON("users", nu);
    } catch (e) {
      setUsers(previo);
      throw e;
    }
  }

  async function saveUser(u) {
    try {
      const latest = await loadJSON("users", users);
      const exists = latest.some(x => x.id === u.id);
      const nu = exists ? latest.map(x => x.id === u.id ? u : x) : [...latest, u];
      await persist(nu);
      setEditing(null);
      toast(exists ? "Usuario actualizado" : "Usuario creado", "success");
    } catch (e) {
      toast(friendlyError(e, "No se pudo guardar el usuario"), "error");
    }
  }

  async function deleteUser(user) {
    const admins = users.filter(u => u.role === "admin");
    if (user.role === "admin" && admins.length <= 1) {
      toast("No puedes eliminar al único administrador", "error");
      setDeleting(null);
      return;
    }
    await persist(users.filter(u => u.id !== user.id));
    setDeleting(null);
    toast("Usuario eliminado", "success");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: C.gray }}>Cada persona entra con su propio usuario y contraseña, y tiene un PIN de vendedor propio (distinto del PIN de administrador de Ajustes) para identificarse antes de cada venta en la caja común. Puedes revisar cuánto ha vendido o recepcionado cada quien.</p>
        <Btn icon={Plus} onClick={() => setEditing({})}>Nuevo usuario</Btn>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {users.map(u => (
          <UserCard key={u.id} user={u} sales={sales} invoicesIndex={invoicesIndex} shiftsLog={shiftsLog} isSelf={u.id === session.userId} onEdit={setEditing} onDelete={setDeleting} />
        ))}
      </div>

      {editing !== null && <UserModal initial={editing.id ? editing : null} users={users} onClose={() => setEditing(null)} onSave={saveUser} toast={toast} />}
      {deleting && (
        <Modal title="Eliminar usuario" onClose={() => setDeleting(null)}>
          <p className="text-sm mb-4" style={{ color: C.ink }}>¿Eliminar a <strong>{deleting.name}</strong> (@{deleting.username})? Ya no podrá iniciar sesión. El historial de ventas y recepciones que ya hizo se mantiene.</p>
          <div className="flex gap-2"><Btn variant="ghost" full onClick={() => setDeleting(null)}>Cancelar</Btn><Btn variant="rust" full onClick={() => deleteUser(deleting)}>Eliminar</Btn></div>
        </Modal>
      )}
    </div>
  );
}

function MyAccountModal({ session, users, setUsers, onClose, toast }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [guardando, setGuardando] = useState(false);

  // La contraseña la guarda Supabase Auth hasheada, así que no hay con qué
  // compararla acá: se comprueba la actual iniciando sesión con ella, y el
  // cambio lo hace la propia sesión — sin necesidad de ser administrador.
  async function submit() {
    if (!newPassword || newPassword.length < 4) {
      return toast("La nueva contraseña debe tener al menos 4 caracteres", "error");
    }
    if (guardando) return;
    setGuardando(true);
    try {
      const sb = obtenerCliente();
      const { error: errorActual } = await sb.auth.signInWithPassword({
        email: `${session.username}@elgalpon.local`,
        password: currentPassword,
      });
      if (errorActual) return toast("Tu contraseña actual no es correcta", "error");

      const { error } = await sb.auth.updateUser({ password: newPassword });
      if (error) return toast(friendlyError(error, "No se pudo cambiar la contraseña"), "error");

      toast("Contraseña actualizada", "success");
      onClose();
    } catch (e) {
      toast(friendlyError(e, "No se pudo cambiar la contraseña"), "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal title="Mi cuenta" onClose={onClose}>
      <div className="rounded-lg p-3 mb-3" style={{ background: C.paperDark }}>
        <div className="text-sm font-semibold" style={{ color: C.ink }}>{session.name}</div>
        <div className="text-xs font-mono" style={{ color: C.gray }}>@{session.username} · {session.role === "admin" ? "Administrador" : "Vendedor"}</div>
      </div>
      <Field label="Contraseña actual"><input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className={inputCls} style={inputStyle()} /></Field>
      <Field label="Contraseña nueva"><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} className={inputCls} style={inputStyle()} placeholder="••••" /></Field>
      <Btn full icon={Check} onClick={submit} disabled={guardando}>{guardando ? "Guardando…" : "Actualizar contraseña"}</Btn>
    </Modal>
  );
}


/* ---------------------------------------------------------
   AJUSTES (solo admin)
--------------------------------------------------------- */
function SettingsView({ settings, setSettings, toast, products, sales, allData, onRestore }) {
  const [businessName, setBusinessName] = useState(settings.businessName);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [ivaIncluded, setIvaIncluded] = useState(settings.ivaIncluded);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const logoInputRef = useRef(null);
  const restoreInputRef = useRef(null);

  async function saveGeneral() {
    const ns = { ...settings, businessName: businessName.trim() || "Mi Negocio", ivaIncluded };
    setSettings(ns); await saveJSON("business-settings", ns);
    toast("Ajustes guardados", "success");
  }
  async function changePin() {
    // El PIN vive en la base guardado con bcrypt. Se comprueba el actual y se
    // cambia allá mismo: en ningún momento pasa por el navegador en claro.
    if (!(await verificarPin(currentPin))) return toast("PIN actual incorrecto", "error");
    if (!newPin || newPin.length < 4) return toast("El nuevo PIN debe tener al menos 4 dígitos", "error");
    try {
      await cambiarPin(newPin);
      setCurrentPin(""); setNewPin("");
      toast("PIN actualizado", "success");
    } catch (err) {
      toast(friendlyError(err, "No se pudo cambiar el PIN"), "error");
    }
  }
  async function handleLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingLogo(true);
      // El logo se sube al almacenamiento de archivos y en la base queda solo
      // la ruta. Antes se guardaba como texto base64 dentro de los ajustes.
      const url = await subirLogo(file);
      setSettings({ ...settings, businessLogo: url });
      toast("Logo actualizado", "success");
    } catch (err) {
      toast(friendlyError(err, "No se pudo subir el logo"), "error");
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }
  async function removeLogo() {
    await quitarLogo();
    setSettings({ ...settings, businessLogo: null });
    toast("Logo quitado", "success");
  }

  function downloadBackup() {
    const payload = { exportedAt: new Date().toISOString(), businessName: settings.businessName, ...allData };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `respaldo-${normalize(settings.businessName).replace(/\s+/g, "-")}-${stamp}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    (async () => {
      const ns = { ...settings, lastBackupAt: new Date().toISOString() };
      setSettings(ns); await saveJSON("business-settings", ns);
    })();
    toast("Respaldo descargado — guárdalo en un lugar seguro (drive, correo, etc.)", "success");
  }

  function handleRestoreFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.products || !parsed.settings) throw new Error("no-shape");
        setRestoreFile(parsed);
      } catch {
        toast("Ese archivo no parece ser un respaldo válido de este sistema", "error");
      }
    };
    reader.readAsText(file);
    if (restoreInputRef.current) restoreInputRef.current.value = "";
  }

  async function confirmRestore() {
    setRestoring(true);
    try {
      await onRestore(restoreFile);
      toast("Datos restaurados desde el respaldo", "success");
    } catch (err) {
      // Acá se muestra el error tal como viene, aunque sea técnico: en una
      // restauración lo que importa es saber en qué se atascó, y un mensaje
      // genérico obliga a adivinar. Queda además en la consola completo.
      console.error("[restaurar] falló", err);
      const detalle = (err && err.message) ? String(err.message) : "";
      toast(detalle ? `No se pudo restaurar: ${detalle}` : "No se pudo restaurar el respaldo", "error");
    } finally {
      setRestoring(false);
      setRestoreFile(null);
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="rounded-xl p-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
        <h3 className="text-base font-semibold mb-3" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Mi negocio</h3>
        <Field label="Logo del negocio">
          <div className="flex items-center gap-3">
            <div className="w-24 h-24 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: C.paperDark, border: `1.5px solid ${C.paperLine}` }}>
              {settings.businessLogo ? <img src={settings.businessLogo} alt="Logo" className="w-full h-full object-contain p-1" /> : <Store size={28} style={{ color: C.gray }} />}
            </div>
            <div className="flex flex-col gap-1.5">
              <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogo} className="hidden" />
              <Btn size="sm" variant="ghost" icon={uploadingLogo ? Loader2 : ImagePlus} disabled={uploadingLogo} onClick={() => logoInputRef.current?.click()}>
                {uploadingLogo ? "Subiendo…" : settings.businessLogo ? "Cambiar logo" : "Subir logo"}
              </Btn>
              {settings.businessLogo && <button onClick={removeLogo} className="text-xs underline text-left" style={{ color: C.rust }}>Quitar logo</button>}
            </div>
          </div>
        </Field>
        <p className="text-xs mb-3" style={{ color: C.grayLight }}>El logo y el nombre aparecen en el encabezado del sistema y en las boletas de los clientes.</p>
        <Field label="Nombre del negocio"><input value={businessName} onChange={e => setBusinessName(e.target.value)} className={inputCls} style={inputStyle()} /></Field>
        <label className="flex items-center gap-2 mb-3 text-sm" style={{ color: C.ink }}>
          <input type="checkbox" checked={ivaIncluded} onChange={e => setIvaIncluded(e.target.checked)} />
          Los precios incluyen IVA (19%) — se desglosa en la factura
        </label>
        <Btn onClick={saveGeneral} icon={Check}>Guardar</Btn>
      </div>

      <div className="rounded-xl p-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
        <h3 className="text-base font-semibold mb-3" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Cambiar PIN de administrador</h3>
        <Field label="PIN actual"><input type="password" value={currentPin} onChange={e => setCurrentPin(e.target.value)} className={inputCls} style={inputStyle()} /></Field>
        <Field label="PIN nuevo"><input type="password" value={newPin} onChange={e => setNewPin(e.target.value)} className={inputCls} style={inputStyle()} /></Field>
        <Btn onClick={changePin} icon={Lock}>Actualizar PIN</Btn>
      </div>

      <div className="rounded-xl p-4" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
        <h3 className="text-base font-semibold mb-1" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Respaldo de datos</h3>
        <p className="text-xs mb-3" style={{ color: C.gray }}>Descarga toda la información del sistema (productos, ventas, boletas, movimientos, proveedores, usuarios, etc.) en un archivo que puedes guardar donde quieras — tu computador, un correo, Google Drive. Es tu copia de seguridad.</p>
        <Btn icon={Download} onClick={downloadBackup}>Descargar respaldo completo</Btn>
        <p className="text-xs mt-2" style={{ color: C.grayLight }}>
          {settings.lastBackupAt ? `Último respaldo descargado: ${formatDate(settings.lastBackupAt)}` : "Todavía no has descargado ningún respaldo."}
        </p>
        <div className="mt-4 pt-4" style={{ borderTop: `1px dashed ${C.paperLine}` }}>
          <div className="text-sm font-medium mb-1.5" style={{ color: C.ink }}>Restaurar desde un respaldo</div>
          <p className="text-xs mb-2" style={{ color: C.rust }}>Esto reemplaza TODOS los datos actuales del sistema por los del archivo — úsalo solo si perdiste información y necesitas recuperarla.</p>
          <input ref={restoreInputRef} type="file" accept="application/json" onChange={handleRestoreFile} className="hidden" />
          <Btn variant="ghost" size="sm" icon={Upload} onClick={() => restoreInputRef.current?.click()}>Elegir archivo de respaldo</Btn>
        </div>
      </div>

      <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
        <div>
          <div className="text-sm font-medium" style={{ color: C.ink }}>{products.length} productos · {sales.length} ventas registradas</div>
          <div className="text-xs" style={{ color: C.gray }}>Los datos se guardan automáticamente y son compartidos por todo el equipo.</div>
        </div>
      </div>
      <p className="text-xs px-1" style={{ color: C.grayLight }}>Nota: el PIN es un control de acceso simple dentro de la app, útil para separar el rol de vendedor y administrador — no reemplaza medidas de seguridad bancaria.</p>

      {restoreFile && (
        <Modal title="Confirmar restauración" onClose={() => !restoring && setRestoreFile(null)}>
          <p className="text-sm mb-2" style={{ color: C.ink }}>Este archivo es del <strong>{restoreFile.exportedAt ? formatDate(restoreFile.exportedAt) : "fecha desconocida"}</strong>{restoreFile.businessName ? ` (negocio: ${restoreFile.businessName})` : ""}.</p>
          <p className="text-sm mb-4" style={{ color: C.rust }}>Al restaurar, se van a <strong>reemplazar todos los datos actuales</strong> del sistema (productos, ventas, movimientos, usuarios, etc.) por los que trae este archivo. Esto no se puede deshacer. ¿Confirmas?</p>
          <div className="flex gap-2">
            <Btn variant="ghost" full disabled={restoring} onClick={() => setRestoreFile(null)}>Cancelar</Btn>
            <Btn variant="rust" full disabled={restoring} icon={restoring ? Loader2 : Upload} onClick={confirmRestore}>{restoring ? "Restaurando…" : "Sí, restaurar"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
/* ---------------------------------------------------------
   MARCELITA — asistente virtual del sistema
   Avatar ilustrado (imagen provista por el negocio) + chat con IA que
   puede buscar precios en internet cuando un producto no está en el
   inventario local, y una sección de sugerencias/fallas que los
   administradores pueden revisar.
--------------------------------------------------------- */
const MARCELITA_IMAGE = "data:image/jpeg;base64,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";

function MarcelitaAvatar({ size = 40 }) {
  return (
    <img
      src={MARCELITA_IMAGE}
      alt="Marcelita"
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        objectFit: "cover", objectPosition: "center center",
        border: `2px solid ${C.brass}`,
      }}
    />
  );
}

function ChatBubble({ msg, onConfirm, onCancel }) {
  const isUser = msg.role === "user";
  if (msg.type === "count-confirm") {
    const resolved = msg.data?.resolved;
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl px-3 py-2.5 text-sm" style={{ background: C.brassSoft, border: `1.5px solid ${C.brass}`, color: C.ink }}>
          <div className="flex items-center gap-1.5 mb-1.5 font-semibold text-xs" style={{ color: "#8a6a1f" }}>
            <ClipboardList size={14} /> Programar conteo
          </div>
          <div className="text-xs mb-2">{msg.content}</div>
          {resolved === "confirmed" ? (
            <Badge tone="green">programado ✓</Badge>
          ) : resolved === "cancelled" ? (
            <Badge tone="gray">cancelado</Badge>
          ) : (
            <div className="flex gap-2">
              <Btn size="sm" icon={Check} onClick={onConfirm}>Confirmar</Btn>
              <Btn size="sm" variant="ghost" onClick={onCancel}>Cancelar</Btn>
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap" style={isUser ? { background: C.ink, color: C.paper } : { background: C.paperDark, color: C.ink }}>
        {msg.content}
      </div>
    </div>
  );
}

const PURCHASE_LIST_KEYWORDS = ["listado", "lista", "compra", "comprar", "reponer", "reposicion", "reposición", "falta", "faltan", "queden", "quedan", "acaban", "acabando", "agotando", "agotan", "bajo stock", "stock bajo", "sin stock", "pedido"];

// El emparejamiento anterior solo miraba si el NOMBRE del producto contenía
// la palabra completa de la consulta ("tomate".includes("tomates") es falso),
// así que cualquier plural/singular distinto ya rompía el calce y Marcelita
// terminaba diciendo que no tenía acceso al inventario. Esto compara en
// ambas direcciones y sin la "s"/"es" final, para que "tomates" calce con
// "Tomate" y viceversa.
function stemWord(w) {
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
  return w;
}

// Busca productos reales del inventario que calcen con la consulta, primero
// por nombre y, si no hay ningún producto parecido, por categoría (ej.
// "cuánto stock tengo de bebidas" no nombra ningún producto puntual, pero sí
// una categoría real) — así Marcelita puede responder preguntas de stock
// tanto de un producto puntual como de una categoría completa.
function findLocalMatches(text, products) {
  const qWords = normalize(text).split(" ").filter(w => w.length > 2).map(stemWord);
  if (qWords.length === 0) return { items: [], category: null };

  const productMatches = products.filter(p => {
    const nameWords = normalize(p.name).split(" ").map(stemWord);
    return qWords.some(qw => nameWords.some(nw => nw.includes(qw) || qw.includes(nw)));
  }).slice(0, 8);
  if (productMatches.length > 0) return { items: productMatches, category: null };

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
  const matchedCategory = categories.find(c => {
    const catWords = normalize(c).split(" ").map(stemWord);
    return qWords.some(qw => catWords.some(cw => cw.includes(qw) || qw.includes(cw)));
  });
  if (matchedCategory) {
    return { items: products.filter(p => p.category === matchedCategory).slice(0, 8), category: matchedCategory };
  }
  return { items: [], category: null };
}

// Detecta si el mensaje pide un listado de compra por categoría (ej. "hazme
// un listado de lo que no queda de útiles de aseo") y, si es así, calcula el
// listado real desde el inventario — nunca lo inventa la IA. Se considera
// "falta" cuando el stock del producto llega a su propio "stock mínimo"
// configurado (o menos), tanto para productos por unidad como por peso/kg.
function detectPurchaseListRequest(text, products) {
  const q = normalize(text);
  const hasIntent = PURCHASE_LIST_KEYWORDS.some(k => q.includes(normalize(k)));
  if (!hasIntent) return null;

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
  let bestCat = null, bestScore = 0;
  categories.forEach(cat => {
    const nCat = normalize(cat);
    if (q.includes(nCat) && nCat.length > bestScore) { bestCat = cat; bestScore = nCat.length; }
  });
  if (!bestCat) {
    // También intenta por palabra suelta (ej. "aseo" calza con "Útiles de aseo")
    categories.forEach(cat => {
      const words = normalize(cat).split(" ").filter(w => w.length > 3);
      if (words.some(w => q.includes(w)) && words.join("").length > bestScore) { bestCat = cat; bestScore = words.join("").length; }
    });
  }
  if (!bestCat) {
    return `El usuario está pidiendo un listado de compra, pero no se identificó a qué categoría de productos se refiere (categorías disponibles: ${categories.join(", ") || "no hay categorías cargadas"}). Pídele que aclare cuál categoría quiere revisar.`;
  }

  const catProducts = products.filter(p => p.category === bestCat);
  const low = catProducts
    .filter(p => p.stock <= (p.minStock ?? 0))
    .sort((a, b) => (a.stock / (a.minStock || 1)) - (b.stock / (b.minStock || 1)));

  if (low.length === 0) {
    return `El usuario pidió el listado de compra de la categoría "${bestCat}". Se revisó el inventario real: NINGÚN producto de esa categoría está en su stock mínimo o por debajo — no hace falta comprar nada de esa categoría por ahora. Dile esto claramente, sin inventar productos.`;
  }
  const lines = low.map(p => `- ${p.name}: quedan ${p.stock}${p.unitType === "peso" ? " kg" : " unidades"} (mínimo configurado: ${p.minStock}${p.unitType === "peso" ? " kg" : " unidades"})`).join("\n");
  return `El usuario pidió el listado de compra de la categoría "${bestCat}". Este es el listado REAL calculado desde el inventario (productos en su stock mínimo o por debajo) — preséntaselo como una lista de compra clara y ordenada, con este mismo dato exacto, sin agregar ni quitar productos:\n${lines}`;
}

// Marcelita devuelve categoría y persona como texto libre — acá se calzan
// contra las categorías y usuarios reales (sin distinguir mayúsculas ni
// tildes) antes de dejar programar nada. Si algo no calza con confianza, se
// pide aclarar en vez de adivinar: esto queda escrito en el sistema real.
function resolveCountToolUse(input, users, categories) {
  const catQ = normalize(input?.categoria || "");
  const category = categories.find(c => normalize(c) === catQ)
    || categories.find(c => catQ && (normalize(c).includes(catQ) || catQ.includes(normalize(c))));
  if (!category) {
    return { ok: false, message: `No identifiqué la categoría "${input?.categoria || ""}" entre las reales del inventario. ¿Cuál es exactamente?` };
  }

  const userQ = normalize(input?.asignado_a || "");
  const user = users.find(u => normalize(u.name) === userQ)
    || users.find(u => userQ && normalize(u.name).split(" ").includes(userQ))
    || users.find(u => userQ && (normalize(u.name).includes(userQ) || userQ.includes(normalize(u.name).split(" ")[0])));
  if (!user) {
    return { ok: false, message: `No identifiqué a "${input?.asignado_a || ""}" entre los usuarios del sistema. ¿A quién se lo asigno?` };
  }

  const dueDate = input?.fecha || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return { ok: false, message: `La fecha "${input?.fecha || ""}" no quedó clara. ¿Para cuándo quieres programarlo? (ej. 2026-08-25)` };
  }

  return { ok: true, category, userId: user.id, userName: user.name, dueDate };
}

function MarcelitaChat({ products, session, role, users, counts, setCounts, toast }) {
  const canScheduleCounts = role === "admin";
  const categories = useMemo(() => [...new Set(products.map(p => p.category).filter(Boolean))].sort(), [products]);
  const [messages, setMessages] = useState([
    { role: "assistant", content: `¡Hola ${session.name.split(" ")[0]}! Soy Marcelita 🙂 ¿En qué te ayudo? Puedo explicarte cómo usar el sistema, buscarte precios de un producto que no tengas en el inventario, armarte un listado de compra por categoría${canScheduleCounts ? ", o programarle un conteo a alguien del equipo" : ""} (ej. "hazme un listado de lo que falta de bebidas").` }
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  // Candado sincrónico (además de "sending") para que un doble Enter+clic
  // muy rápido no alcance a mandar dos consultas antes de que el estado
  // termine de actualizarse — cada consulta de más gasta cupo compartido.
  const lockRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function confirmCount(data, idx) {
    const latest = await loadJSON("inventory-counts", counts);
    const record = {
      id: uid("inv-count"), dueDate: data.dueDate, category: data.category,
      assignedToId: data.userId, assignedToName: data.userName,
      assignedBy: session.name, status: "pendiente",
      createdAt: new Date().toISOString(),
      completedAt: null, completedBy: null, items: [], exception: null,
    };
    const nc = [record, ...latest];
    setCounts(nc);
    await saveJSON("inventory-counts", nc);
    setMessages(prev => prev.map((m, i) => i === idx ? { ...m, data: { ...m.data, resolved: "confirmed" } } : m));
    toast("Conteo programado", "success");
  }
  function cancelCount(idx) {
    setMessages(prev => prev.map((m, i) => i === idx ? { ...m, data: { ...m.data, resolved: "cancelled" } } : m));
  }

  async function send() {
    const text = input.trim();
    if (!text || sending || lockRef.current) return;
    lockRef.current = true;
    const newHistory = [...messages, { role: "user", content: text }];
    setMessages(newHistory);
    setInput("");
    setSending(true);
    try {
      const purchaseListContext = detectPurchaseListRequest(text, products);
      let localContext;
      if (purchaseListContext) {
        localContext = purchaseListContext;
      } else {
        const localFound = findLocalMatches(text, products);
        localContext = localFound.items.length > 0
          ? `Se encontraron estos productos ${localFound.category ? `de la categoría "${localFound.category}"` : "parecidos"} en el inventario local: ${localFound.items.map(p => `${p.name} (${formatCLP(p.price)}${p.unitType === "peso" ? "/kg" : ""}, stock ${p.stock})`).join("; ")}. Si el usuario pregunta por su stock, precio o disponibilidad, respóndele con estos datos reales — nunca digas que no tienes acceso al inventario cuando aquí hay datos.`
          : `No se encontró ningún producto ni categoría parecida en el inventario local. Si el usuario pregunta por un producto que el negocio podría vender pero no tiene cargado, usa la búsqueda web para comparar precios en tiendas online chilenas. Si en cambio pregunta por algo del inventario que no identificaste bien, pídele que aclare el nombre exacto del producto o categoría — no digas que no tienes acceso al inventario.`;
      }
      if (canScheduleCounts) {
        localContext += ` Usuarios reales del equipo para asignar conteos: ${users.map(u => u.name).join(", ") || "ninguno cargado"}. Categorías reales de inventario para conteos: ${categories.join(", ") || "ninguna cargada"}.`;
      }
      const result = await askMarcelita(newHistory, localContext, canScheduleCounts);
      setMessages(prev => {
        const next = [...prev];
        if (result.text) next.push({ role: "assistant", content: result.text });
        if (result.toolUse) {
          const resolved = resolveCountToolUse(result.toolUse, users, categories);
          if (resolved.ok) {
            next.push({
              role: "assistant", type: "count-confirm",
              content: `¿Programo el conteo de "${resolved.category}" para ${resolved.userName}, con fecha ${resolved.dueDate}?`,
              data: resolved,
            });
          } else {
            next.push({ role: "assistant", content: resolved.message });
          }
        }
        if (!result.text && !result.toolUse) next.push({ role: "assistant", content: "No encontré una respuesta clara, ¿puedes reformular la pregunta?" });
        return next;
      });
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Se me cruzaron los cables: ${friendlyError(err, "no pude responder")}. Intenta de nuevo.` }]);
    } finally {
      setSending(false);
      // Pequeño respiro antes de permitir la próxima consulta — evita ráfagas
      // de mensajes seguidos que consuman cupo compartido de golpe.
      setTimeout(() => { lockRef.current = false; }, 1200);
    }
  }

  return (
    <div className="flex flex-col" style={{ height: 420 }}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 py-2 space-y-2">
        {messages.map((m, i) => (
          <ChatBubble key={i} msg={m} onConfirm={() => confirmCount(m.data, i)} onCancel={() => cancelCount(i)} />
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-3 py-2 flex items-center gap-1.5" style={{ background: C.paperDark }}>
              <Loader2 size={13} className="animate-spin" style={{ color: C.gray }} />
              <span className="text-xs" style={{ color: C.gray }}>Marcelita está pensando…</span>
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-1.5 pt-2 mt-1" style={{ borderTop: `1px solid ${C.paperLine}` }}>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Pregúntale algo a Marcelita…"
          className={`${inputCls} text-sm`} style={inputStyle()}
        />
        <button onClick={send} disabled={sending || !input.trim()} className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 disabled:opacity-40" style={{ background: C.green, color: "#fff" }}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

const FEEDBACK_TYPES = ["Sugerencia", "Falla o error", "Comentario"];

function MarcelitaFeedback({ feedback, setFeedback, session, role, toast }) {
  const [type, setType] = useState(FEEDBACK_TYPES[0]);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("pendiente");

  async function submit() {
    if (!message.trim()) return;
    const entry = {
      id: uid("fb"), date: new Date().toISOString(),
      author: session.name, role: session.role,
      type, message: message.trim(), status: "pendiente",
      adminNote: null, resolvedBy: null, resolvedAt: null,
    };
    const latest = await loadJSON("marcelita-feedback", feedback);
    const nf = [entry, ...latest];
    setFeedback(nf); await saveJSON("marcelita-feedback", nf);
    setMessage("");
    toast("Gracias, quedó enviado a los administradores", "success");
  }

  async function resolve(id, resolved) {
    const latest = await loadJSON("marcelita-feedback", feedback);
    const nf = latest.map(f => f.id === id ? { ...f, status: resolved ? "resuelto" : "pendiente", resolvedBy: resolved ? session.name : null, resolvedAt: resolved ? new Date().toISOString() : null } : f);
    setFeedback(nf); await saveJSON("marcelita-feedback", nf);
  }

  const visible = role === "admin" ? feedback : feedback.filter(f => f.author === session.name);
  const shown = role === "admin" && filter !== "todo" ? visible.filter(f => f.status === filter) : visible;

  return (
    <div className="flex flex-col" style={{ height: 420 }}>
      <div className="rounded-lg p-3 mb-3" style={{ background: C.paperDark }}>
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {FEEDBACK_TYPES.map(t => (
            <button key={t} onClick={() => setType(t)} className="py-1.5 rounded-md text-[11px] font-medium" style={type === t ? { background: C.brass, color: C.ink } : { background: "#fff", color: C.gray }}>{t}</button>
          ))}
        </div>
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2} className={`${inputCls} text-sm`} style={inputStyle()} placeholder="Cuéntanos qué pasó, qué sugieres, o déjanos un comentario…" />
        <div className="mt-2"><Btn size="sm" icon={Send} disabled={!message.trim()} onClick={submit}>Enviar a los administradores</Btn></div>
      </div>

      {role === "admin" && (
        <div className="flex gap-1.5 mb-2">
          {[["pendiente", "Pendientes"], ["resuelto", "Resueltas"], ["todo", "Todas"]].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)} className="px-2.5 py-1 rounded-md text-[11px] font-medium" style={filter === v ? { background: C.ink, color: C.paper } : { background: C.paperDark, color: C.gray }}>{l}</button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
        {shown.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: C.gray }}>{role === "admin" ? "Nada por aquí." : "Aún no has enviado nada."}</p>
        ) : shown.map(f => (
          <div key={f.id} className="rounded-lg p-2.5" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
            <div className="flex items-center justify-between mb-1">
              <Badge tone={f.type === "Falla o error" ? "rust" : f.type === "Sugerencia" ? "brass" : "gray"}>{f.type}</Badge>
              <Badge tone={f.status === "resuelto" ? "green" : "gray"}>{f.status === "resuelto" ? "Resuelto" : "Pendiente"}</Badge>
            </div>
            <p className="text-sm mb-1" style={{ color: C.ink }}>{f.message}</p>
            <p className="text-[11px]" style={{ color: C.gray }}>{f.author} · {formatDate(f.date)}</p>
            {role === "admin" && (
              <button onClick={() => resolve(f.id, f.status !== "resuelto")} className="text-[11px] font-medium mt-1.5 flex items-center gap-1" style={{ color: f.status === "resuelto" ? C.gray : C.green }}>
                <CheckCircle2 size={12} /> {f.status === "resuelto" ? "Marcar como pendiente" : "Marcar como resuelto"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MarcelitaWidget({ products, feedback, setFeedback, session, role, toast, users, counts, setCounts }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("chat");
  const pendingCount = role === "admin" ? feedback.filter(f => f.status !== "resuelto").length : 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 lg:bottom-5 lg:right-5 z-40 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition"
        style={{ width: 56, height: 56, background: C.ink, display: open ? "none" : "flex" }}
        title="Marcelita, tu asistente"
      >
        <MarcelitaAvatar size={48} />
        {pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ background: C.rust, color: "#fff" }}>{pendingCount}</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end bg-black/30 sm:bg-transparent" onClick={() => setOpen(false)}>
          <div
            onClick={e => e.stopPropagation()}
            className="w-full sm:w-[380px] sm:mr-5 sm:mb-5 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ background: C.paper, maxHeight: "85vh", border: `1.5px solid ${C.paperLine}` }}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ background: C.ink }}>
              <div className="flex items-center gap-2.5">
                <MarcelitaAvatar size={36} />
                <div>
                  <div className="text-sm font-semibold" style={{ color: C.paper, fontFamily: "'Space Grotesk', sans-serif" }}>Marcelita</div>
                  <div className="text-[11px]" style={{ color: C.grayLight }}>Asistente del sistema</div>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-full" style={{ color: C.grayLight }}><X size={18} /></button>
            </div>

            <div className="flex gap-1 px-3 pt-2.5" style={{ background: C.paper, borderBottom: `1px solid ${C.paperLine}` }}>
              <button onClick={() => setTab("chat")} className="flex-1 pb-2 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2" style={tab === "chat" ? { color: C.greenDark, borderColor: C.green } : { color: C.gray, borderColor: "transparent" }}>
                <Bot size={13} /> Chat
              </button>
              <button onClick={() => setTab("feedback")} className="flex-1 pb-2 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 relative" style={tab === "feedback" ? { color: C.greenDark, borderColor: C.green } : { color: C.gray, borderColor: "transparent" }}>
                <MessageSquare size={13} /> Sugerencias
                {pendingCount > 0 && <span className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center" style={{ background: C.rust, color: "#fff" }}>{pendingCount}</span>}
              </button>
            </div>

            <div className="p-3">
              {tab === "chat"
                ? <MarcelitaChat products={products} session={session} role={role} users={users} counts={counts} setCounts={setCounts} toast={toast} />
                : <MarcelitaFeedback feedback={feedback} setFeedback={setFeedback} session={session} role={role} toast={toast} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}


/* ---------------------------------------------------------
   ACTIVIDADES PENDIENTES
   Junta en un solo lugar las señales de "esto necesita que alguien haga
   algo" que hoy viven repartidas en cada pestaña (conteos atrasados,
   aprobaciones de precio, clientes sobre su límite de fiado, la caja abierta
   hace mucho, feedback sin resolver) — y les agrega fecha/urgencia para que
   se pueda mirar de un vistazo qué es lo más urgente, no solo cuánto hay.
   No duplica el botón de "resolver" de cada pestaña: cada tarjeta lleva un
   "Ir a…" que salta directo a donde se actúa. Se calcula con lo que el
   sistema ya tiene cargado — sin tablas nuevas ni otra fuente de verdad. */
function construirActividades({ rolEfectivo, session, products, inventoryCounts, customers, customerLedger, openShifts, feedback }) {
  const items = [];
  const hoyStr = new Date().toISOString().slice(0, 10);

  // --- Conteos de inventario: atrasados, por vencer, y (para admin) las
  // excepciones que alguien pidió y siguen sin respuesta. ---
  const misConteos = rolEfectivo === "admin" ? inventoryCounts : inventoryCounts.filter(r => r.assignedToId === session.userId);
  for (const r of misConteos) {
    if (r.status === "completado") continue;
    if (r.status === "excepcion_solicitada") {
      if (rolEfectivo === "admin") {
        items.push({
          id: `conteo-excepcion-${r.id}`, tab: "conteos", tabLabel: "Conteos", severidad: "media",
          titulo: `Excepción pendiente — conteo de ${r.category}`,
          detalle: `${r.assignedToName} pidió mover la fecha (${r.exception?.reason || "sin motivo detallado"}). Falta aprobarla o rechazarla.`,
        });
      }
      continue;
    }
    if (isOverdue(r)) {
      items.push({
        id: `conteo-vencido-${r.id}`, tab: "conteos", tabLabel: "Conteos", severidad: "alta",
        titulo: `Conteo atrasado — ${r.category}`,
        detalle: `Estaba programado para el ${formatDateOnly(r.dueDate)}, asignado a ${r.assignedToName}.`,
      });
    } else {
      const dias = Math.round((new Date(`${r.dueDate}T00:00:00`) - new Date(`${hoyStr}T00:00:00`)) / 86400000);
      if (dias >= 0 && dias <= 2) {
        items.push({
          id: `conteo-proximo-${r.id}`, tab: "conteos", tabLabel: "Conteos", severidad: "baja",
          titulo: `Conteo por vencer — ${r.category}`,
          detalle: (dias === 0 ? "Vence hoy" : `Vence en ${dias} día${dias === 1 ? "" : "s"}`) + `, asignado a ${r.assignedToName}.`,
        });
      }
    }
  }

  // --- Aprobaciones de precio (solo admin: es quien las resuelve en
  // Recepción → Aprobaciones). ---
  if (rolEfectivo === "admin") {
    for (const p of products) {
      if (!p.priceApproval) continue;
      items.push({
        id: `precio-${p.id}`, tab: "recepcion", tabLabel: "Recepción", severidad: "media",
        titulo: `Precio por aprobar — ${p.name}`,
        detalle: `${p.priceApproval.requestedBy} propuso ${formatCLP(p.priceApproval.suggestedPrice)} (costo neto ${formatCLP(p.priceApproval.netCost)}).`,
      });
    }
  }

  // --- Clientes fiado sobre su límite de crédito (solo admin: es quien ve
  // Fiado). El saldo se calcula igual que en ClientesView: cargos menos
  // abonos, nunca un contador guardado aparte. ---
  if (rolEfectivo === "admin") {
    for (const c of customers) {
      if (c.creditLimit == null) continue;
      const saldo = customerLedger.reduce((s, m) => m.customerId === c.id ? s + (m.type === "cargo" ? m.amount : -m.amount) : s, 0);
      if (saldo > c.creditLimit) {
        items.push({
          id: `fiado-${c.id}`, tab: "clientes", tabLabel: "Fiado", severidad: "alta",
          titulo: `${c.name} superó su límite de fiado`,
          detalle: `Debe ${formatCLP(saldo)}, sobre el límite de ${formatCLP(c.creditLimit)}.`,
        });
      }
    }
  }

  // --- La caja lleva demasiadas horas abierta (visible para todos: ambos
  // roles operan la caja). Bajo el modelo de caja única solo hay una a la
  // vez; se toma la más antigua por si quedó algo del modelo anterior. ---
  if (openShifts.length > 0) {
    const masAntigua = [...openShifts].sort((a, b) => new Date(a.openedAt) - new Date(b.openedAt))[0];
    const horasAbierta = (Date.now() - new Date(masAntigua.openedAt).getTime()) / 3600000;
    if (horasAbierta >= 16) {
      items.push({
        id: `turno-${masAntigua.id}`, tab: "caja", tabLabel: "Caja", severidad: horasAbierta >= 24 ? "alta" : "media",
        titulo: "La caja lleva mucho tiempo abierta",
        detalle: `Abierta desde ${formatDate(masAntigua.openedAt)} (${masAntigua.openedBy}). Si el turno ya terminó, conviene cerrarla.`,
      });
    }
  }

  // --- Feedback de Marcelita sin resolver (solo admin: es quien lo cierra).
  // No vive en ninguna pestaña —es el ícono flotante de Marcelita—, así que
  // esta tarjeta no lleva botón "Ir a": se lo dice en el propio texto. ---
  if (rolEfectivo === "admin") {
    for (const f of feedback) {
      if (f.status === "resuelto") continue;
      items.push({
        id: `feedback-${f.id}`, tab: null, tabLabel: null, severidad: f.type === "Falla o error" ? "alta" : "baja",
        titulo: `${f.type} sin resolver — ${f.author}`,
        detalle: (f.message?.length > 90 ? `${f.message.slice(0, 90)}…` : f.message) + " — revísalo en el ícono de Marcelita, abajo a la derecha.",
      });
    }
  }

  const orden = { alta: 0, media: 1, baja: 2 };
  return items.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
}

/* La recomendación de pan de hoy se agrega aparte, dentro de la propia
   pestaña: a diferencia de las demás señales (que ya viven en memoria en
   SistemaVentas), depende de bread-holidays/bread-shortages, que hoy solo
   carga BreadPredictionPanel bajo demanda. Traer esas dos colecciones también
   en la carga inicial —solo para sumar un aviso más, informativo— no valía la
   complejidad de tocar ese flujo compartido; por eso este aviso no cuenta en
   el badge de la pestaña, y aparece recién al abrirla. */
function useActividadPan({ role, products, sales, movements, purchaseItems, settings }) {
  const [holidays, setHolidays] = useState(null);
  const [shortages, setShortages] = useState(null);

  // El panel completo (Análisis → Predicción de pan) es solo para admin, así
  // que este aviso también lo es: de lo contrario el botón "Ir a Análisis"
  // llevaría a un vendedor a una pestaña que no puede ver. Ni siquiera se
  // cargan bread-holidays/bread-shortages si no hace falta.
  useEffect(() => {
    if (role !== "admin") return;
    (async () => {
      const [h, s] = await Promise.all([
        loadJSON("bread-holidays", DEFAULT_BREAD_HOLIDAYS),
        loadJSON("bread-shortages", []),
      ]);
      setHolidays(h || DEFAULT_BREAD_HOLIDAYS);
      setShortages(s || []);
    })();
  }, [role]);

  return useMemo(() => {
    if (role !== "admin" || !holidays) return null;
    const breadCategory = settings.breadCategory || "PAN";
    const byDate = buildBreadHistory(products, sales, movements, purchaseItems, breadCategory);
    const splitR = breadSplitRatio(byDate);
    const shortageDates = new Set((shortages || []).filter(s => s.morning || s.afternoon).map(s => s.date));
    const [hoy] = buildBreadRecommendations(byDate, holidays, splitR, shortageDates, 1);
    if (!hoy || hoy.isClosedToday || !hoy.pred) return null;
    return {
      id: "pan-hoy", tab: "analisis", tabLabel: "Análisis", severidad: "baja",
      titulo: "Recomendación de pan de hoy",
      detalle: `Según el historial: ~${hoy.evening} para la mañana y ~${hoy.midday} para el mediodía.`,
    };
  }, [holidays, shortages, products, sales, movements, purchaseItems, settings]);
}

function ActividadCard({ item, onIr }) {
  const tono = item.severidad === "alta" ? C.rust : item.severidad === "media" ? C.brass : C.green;
  const tonoSoft = item.severidad === "alta" ? C.rustSoft : item.severidad === "media" ? C.brassSoft : C.greenSoft;
  return (
    <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: "#fff", border: `1.5px solid ${C.paperLine}` }}>
      <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: tono }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold" style={{ color: C.ink }}>{item.titulo}</div>
        <div className="text-xs mt-0.5" style={{ color: C.gray }}>{item.detalle}</div>
      </div>
      {item.tab && (
        <button
          onClick={() => onIr(item.tab)}
          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg flex-shrink-0"
          style={{ background: tonoSoft, color: tono }}
        >
          Ir a {item.tabLabel}
        </button>
      )}
    </div>
  );
}

function ActividadesView({ session, role, products, inventoryCounts, customers, customerLedger, openShifts, feedback, sales, movements, purchaseItems, settings, setTab }) {
  const actividades = useMemo(
    () => construirActividades({ rolEfectivo: role, session, products, inventoryCounts, customers, customerLedger, openShifts, feedback }),
    [role, session, products, inventoryCounts, customers, customerLedger, openShifts, feedback]
  );
  const pan = useActividadPan({ role, products, sales, movements, purchaseItems, settings });
  const todas = pan ? [...actividades, pan] : actividades;

  const grupos = [
    { clave: "alta", titulo: "Urgente", items: todas.filter(a => a.severidad === "alta") },
    { clave: "media", titulo: "Pronto", items: todas.filter(a => a.severidad === "media") },
    { clave: "baja", titulo: "Para revisar", items: todas.filter(a => a.severidad === "baja") },
  ].filter(g => g.items.length > 0);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Bell size={20} style={{ color: C.green }} />
        <div>
          <h2 className="text-lg font-semibold" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>Actividades pendientes</h2>
          <p className="text-xs" style={{ color: C.gray }}>Lo que el sistema detectó que necesita una decisión o una acción — no reemplaza cada pestaña, solo junta los avisos en un lugar.</p>
        </div>
      </div>

      {todas.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: "#fff", border: `1.5px dashed ${C.paperLine}` }}>
          <CheckCircle2 size={28} style={{ color: C.green }} className="mx-auto mb-2" />
          <p className="text-sm font-medium" style={{ color: C.ink }}>Todo al día — no hay nada pendiente por ahora.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {grupos.map(g => (
            <div key={g.clave}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: C.gray }}>{g.titulo} ({g.items.length})</div>
              <div className="space-y-2">
                {g.items.map(item => <ActividadCard key={item.id} item={item} onIr={setTab} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   APP PRINCIPAL
--------------------------------------------------------- */

/* Ventana del Inventario General (actividad puntual de una sola noche,
   agosto 2026): desde acá y hasta acá, cualquiera que NO sea administrador
   ve solo la pantalla de conteo — nada de vender, recepción, etc. — para
   que nadie mueva stock mientras se cuenta el local entero. Un
   administrador nunca queda bloqueado: sigue viendo el sistema completo y
   puede entrar al conteo por su cuenta si quiere ayudar a contar.
   Horario de Chile continental (UTC-4 en agosto, sin horario de verano). */
const INVENTARIO_GENERAL_INICIO = new Date("2026-08-23T01:00:00Z"); // 22-ago 21:00 hora Chile
const INVENTARIO_GENERAL_FIN    = new Date("2026-08-23T13:00:00Z"); // 23-ago 09:00 hora Chile

/* Las pestañas agrupadas por lo que se hace con ellas. Doce opciones sueltas en
   una barra obligaban a arrastrar para encontrar cualquier cosa; agrupadas, el
   menú se lee de una mirada y cada grupo corresponde a un momento del día. */
const GRUPOS = {
  vendedor: [
    { titulo: "Mesón", items: [
      { id: "pos", label: "Vender", icon: ShoppingCart },
      { id: "caja", label: "Caja", icon: Banknote },
      { id: "facturas", label: "Boletas", icon: FileText },
      { id: "actividades", label: "Actividades", icon: Bell },
      { id: "inventario-general", label: "Inventario General", icon: ClipboardCheck },
    ]},
    { titulo: "Bodega", items: [
      { id: "inventario", label: "Inventario", icon: Package },
      { id: "recepcion", label: "Recepción", icon: Truck },
      { id: "conteos", label: "Conteos", icon: ClipboardList },
      { id: "transformar", label: "Transformar", icon: Blend },
    ]},
  ],
  admin: [
    { titulo: "Mesón", items: [
      { id: "pos", label: "Vender", icon: ShoppingCart },
      { id: "caja", label: "Caja", icon: Banknote },
      { id: "facturas", label: "Boletas", icon: FileText },
      { id: "inventario-general", label: "Inventario General", icon: ClipboardCheck },
      { id: "actividades", label: "Actividades", icon: Bell },
    ]},
    { titulo: "Bodega", items: [
      { id: "inventario", label: "Inventario", icon: Package },
      { id: "recepcion", label: "Recepción", icon: Truck },
      { id: "conteos", label: "Conteos", icon: ClipboardList },
      { id: "transformar", label: "Transformar", icon: Blend },
      { id: "categorias", label: "Categorías", icon: Tags },
    ]},
    { titulo: "Administración", items: [
      { id: "proveedores", label: "Proveedores", icon: Building2 },
      { id: "clientes", label: "Fiado", icon: CreditCard },
      { id: "egresos", label: "Egresos", icon: ArrowDownCircle },
      { id: "sueldos", label: "Sueldos", icon: Users },
      { id: "finanzas", label: "Finanzas", icon: Wallet },
      { id: "analisis", label: "Análisis", icon: BarChart3 },
      { id: "usuarios", label: "Usuarios", icon: User },
      { id: "ajustes", label: "Ajustes", icon: SettingsIcon },
    ]},
  ],
};

/* La lista plana que siguen usando las comprobaciones de rol. */
const TABS = {
  vendedor: GRUPOS.vendedor.flatMap(g => g.items),
  admin: GRUPOS.admin.flatMap(g => g.items),
};

/* En el teléfono la barra inferior no debe pasar de cinco destinos: más que eso
   y los toques empiezan a errarse. Van los cuatro de uso diario y el resto
   queda detrás de "Más". */
const MOVIL_PRINCIPALES = ["pos", "caja", "inventario", "recepcion"];

/* Un punto de color por pestaña que necesita atención. */
function Aviso({ n }) {
  if (!n) return null;
  return (
    <span
      className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold flex items-center justify-center flex-shrink-0"
      style={{ background: C.rust, color: "#fff" }}
      aria-label={`${n} pendiente${n === 1 ? "" : "s"}`}
    >{n}</span>
  );
}

/* Menú lateral. Desde 1024px de ancho queda fijo a la izquierda: en un
   computador hay espacio de sobra y tener las doce opciones siempre visibles
   ahorra un clic en cada cambio de pantalla. */
function MenuLateral({ grupos, tab, setTab, avisos, settings }) {
  return (
    <aside
      className="hidden lg:flex lg:flex-col fixed inset-y-0 left-0 w-64 z-40"
      style={{ background: C.inkSoft, borderRight: `1px solid ${C.ink}` }}
    >
      <div className="flex items-center gap-3 px-5 h-16 flex-shrink-0" style={{ borderBottom: `1px solid rgba(255,255,255,.08)` }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
             style={{ background: settings.businessLogo ? "#fff" : C.brass }}>
          {settings.businessLogo
            ? <img src={settings.businessLogo} alt="" className="w-full h-full object-contain p-0.5" />
            : <Store size={18} style={{ color: C.ink }} aria-hidden="true" />}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate" style={{ color: "#fff" }}>{settings.businessName}</div>
          <div className="text-xs" style={{ color: C.grayLight }}>Punto de venta</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3" aria-label="Secciones del sistema">
        {grupos.map(grupo => (
          <div key={grupo.titulo} className="mb-5">
            <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.grayLight }}>
              {grupo.titulo}
            </div>
            {grupo.items.map(t => {
              const activo = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  aria-current={activo ? "page" : undefined}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium mb-0.5 text-left"
                  style={activo
                    ? { background: C.green, color: "#fff" }
                    : { background: "transparent", color: "#e8e0d0" }}
                >
                  <t.icon size={18} className="flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">{t.label}</span>
                  <Aviso n={avisos[t.id]} />
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

/* Barra inferior del teléfono. Se queda fija al alcance del pulgar y respeta el
   área segura de los teléfonos con barra de gestos. */
function BarraInferior({ items, tab, setTab, avisos, onMas, masActivo }) {
  // Lo que queda detrás de "Más" (Actividades, Conteos, etc.) no debería
  // desaparecer del radar solo por no caber en la barra: se suma acá para
  // que "Más" también avise, en vez de que haya que entrar a mirar.
  const idsVisibles = new Set(items.map(i => i.id));
  const avisosOcultos = Object.entries(avisos || {})
    .filter(([id]) => id !== "__mas" && !idsVisibles.has(id))
    .reduce((s, [, n]) => s + (n || 0), 0);
  const avisosConMas = { ...avisos, __mas: avisosOcultos };

  const boton = (t, activo, alPulsar, etiqueta, Icono) => (
    <button
      key={t}
      onClick={alPulsar}
      aria-current={activo ? "page" : undefined}
      className="flex-1 flex flex-col items-center justify-center gap-1 py-2 relative"
      style={{ color: activo ? C.green : C.gray, minHeight: 56 }}
    >
      <span className="relative">
        <Icono size={22} aria-hidden="true" />
        {!!avisosConMas[t] && (
          <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center"
                style={{ background: C.rust, color: "#fff" }}>{avisosConMas[t]}</span>
        )}
      </span>
      <span className="text-[11px] font-medium leading-none">{etiqueta}</span>
    </button>
  );

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex"
      aria-label="Navegación principal"
      style={{
        background: "#fff",
        borderTop: `1px solid ${C.paperLine}`,
        paddingBottom: "env(safe-area-inset-bottom)",
        boxShadow: "0 -1px 3px rgba(15,23,42,.06)",
      }}
    >
      {items.map(t => boton(t.id, tab === t.id, () => setTab(t.id), t.label, t.icon))}
      {boton("__mas", masActivo, onMas, "Más", MoreHorizontal)}
    </nav>
  );
}

/* El resto de las secciones, en una hoja que sube desde abajo. */
function HojaDeSecciones({ grupos, tab, setTab, avisos, onClose }) {
  return (
    <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Todas las secciones">
      <button className="absolute inset-0" onClick={onClose} aria-label="Cerrar" style={{ background: "rgba(15,23,42,.5)" }} />
      <div className="relative rounded-t-2xl max-h-[80vh] overflow-y-auto" style={{ background: "#fff", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="sticky top-0 flex items-center justify-between px-5 py-4" style={{ background: "#fff", borderBottom: `1px solid ${C.paperLine}` }}>
          <span className="font-semibold" style={{ color: C.ink }}>Todas las secciones</span>
          <button onClick={onClose} className="p-2 -mr-2 rounded-lg" aria-label="Cerrar"><X size={20} style={{ color: C.gray }} /></button>
        </div>
        <div className="px-3 py-3">
          {grupos.map(grupo => (
            <div key={grupo.titulo} className="mb-4">
              <div className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.gray }}>{grupo.titulo}</div>
              {grupo.items.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); onClose(); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left"
                  style={tab === t.id ? { background: C.greenSoft, color: C.greenDark } : { color: C.ink }}
                >
                  <t.icon size={20} className="flex-shrink-0" aria-hidden="true" />
                  <span className="text-sm font-medium">{t.label}</span>
                  <Aviso n={avisos[t.id]} />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SistemaVentas() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [movements, setMovements] = useState([]);
  const [openShifts, setOpenShifts] = useState([]);
  const [shiftsLog, setShiftsLog] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerLedger, setCustomerLedger] = useState([]);
  const [supplierLedger, setSupplierLedger] = useState([]);
  const [invoicesIndex, setInvoicesIndex] = useState([]);
  const [purchaseItems, setPurchaseItems] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [users, setUsers] = useState([]);
  const [inventoryCounts, setInventoryCounts] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [myAccountOpen, setMyAccountOpen] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [adminGateOpen, setAdminGateOpen] = useState(false);
  // Máscara de "Volver a vender": oculta el panel de Administración sin
  // tocar la sesión real. Arranca siempre en false — un administrador que
  // entra normal (o al recuperar la sesión al recargar) ve todo, como hoy;
  // solo se activa si él mismo elige "Volver a vender".
  const [modoVenta, setModoVenta] = useState(false);
  // Inventario General (agosto 2026): por pedido puntual de esta noche, los
  // administradores también caen directo en Inventario General al entrar
  // (antes quedaban siempre afuera del bloqueo). Arranca en false en cada
  // sesión nueva; el propio administrador puede salir con el botón de
  // escape que ve solo él dentro de esa pantalla, por si necesita entrar al
  // panel completo durante la ventana.
  const [saltarInventarioGeneral, setSaltarInventarioGeneral] = useState(false);
  const [session, setSession] = useState(null);
  // Mientras no se haya revisado si había una sesión abierta, no se decide
  // qué mostrar: sin esto, quien recarga la página ve parpadear el ingreso.
  const [sesionRevisada, setSesionRevisada] = useState(false);
  const [tab, setTab] = useState("pos");
  const [toastData, setToastState] = useState(null);

  const toast = useCallback((msg, type = "success") => {
    setToastState({ msg, type });
    setTimeout(() => setToastState(null), 2400);
  }, []);

  // Salir cierra la sesión en Supabase y borra las copias en memoria, para que
  // la próxima persona no arrastre los datos de la anterior.
  const cerrarSesion = useCallback(async () => {
    try {
      await obtenerCliente().auth.signOut();
    } catch (e) {
      console.error("[sesión] no se pudo cerrar", e);
    }
    olvidarInstantaneas();
    setSession(null);
    // La próxima persona que entre parte sin la máscara de "Volver a
    // vender" puesta — ve el panel completo o no, según su propio rol real.
    setModoVenta(false);
    setSaltarInventarioGeneral(false);
  }, []);

  // Si ya había una sesión abierta (por ejemplo, al recargar la página), se
  // recupera antes de mostrar la pantalla de ingreso.
  useEffect(() => {
    (async () => {
      try {
        const sb = obtenerCliente();
        const { data: { session: sesionSupabase } } = await sb.auth.getSession();
        if (!sesionSupabase?.user) return;
        await cargarCatalogos({ forzar: true });
        const { data: perfil } = await sb
          .from("perfil").select("id,nombre,usuario,rol,activo")
          .eq("id", sesionSupabase.user.id).maybeSingle();
        if (perfil?.activo) {
          fijarUsuarioActual(perfil.id);
          setSession({ role: perfil.rol, name: perfil.nombre, username: perfil.usuario, userId: perfil.id });
        }
      } catch (e) {
        console.error("[sesión] no se pudo recuperar", e);
      } finally {
        setSesionRevisada(true);
      }
    })();
  }, []);

  // Carga de los datos del negocio. Solo corre cuando hay una sesión iniciada:
  // las políticas de la base exigen un perfil activo, así que pedir los datos
  // antes de entrar devolvía vacío en todo y dejaba la pantalla colgada.
  useEffect(() => {
    if (!sesionRevisada) return;   // todavía no se sabe si había sesión abierta
    if (!session) {
      // Sin sesión no hay nada que cargar: se muestra la pantalla de ingreso.
      setLoading(false);
      return;
    }
    let cancelado = false;
    (async () => {
      setLoading(true);
      try {
        const [s, p, cat, sl, mv, os, sh, sup, cu, cl, spl, invIdx, pItems, fb, us, ic, wk] = await Promise.all([
          loadJSON("business-settings", null),
          loadJSON("products-catalog", []),
          loadJSON("product-categories", []),
          loadJSON("sales-log", []),
          loadJSON("movements-log", []),
          loadJSON("open-shifts", []),
          loadJSON("shifts-log", []),
          loadJSON("suppliers", []),
          loadJSON("customers", []),
          loadJSON("customer-ledger", []),
          loadJSON("supplier-ledger", []),
          loadJSON("invoices-index", []),
          loadJSON("purchase-items-log", []),
          loadJSON("marcelita-feedback", []),
          loadJSON("users", []),
          loadJSON("inventory-counts", []),
          loadJSON("workers", []),
        ]);
        if (cancelado) return;

        // Ya no hay bloques de migración acá. En la versión anterior, la primera
        // apertura importaba la planilla Excel, retiraba productos del sistema
        // viejo y sembraba el PAN, porque no existía otro lugar donde hacerlo.
        // Ahora eso vive en las migraciones de la base, y dejarlo aquí era
        // peligroso: bastaba una lectura fallida para que la aplicación creyera
        // que era la primera vez y volviera a inyectar todo el histórico.
        setSettings(s || DEFAULT_SETTINGS);
        setProducts(p); setCategories(cat); setSales(sl); setMovements(mv);
        setOpenShifts(os); setShiftsLog(sh); setSuppliers(sup);
        setCustomers(cu); setCustomerLedger(cl); setSupplierLedger(spl);
        setInvoicesIndex(invIdx); setPurchaseItems(pItems); setFeedback(fb);
        setUsers(us); setInventoryCounts(ic); setWorkers(wk);
      } catch (e) {
        console.error("[carga inicial] no se pudieron leer los datos", e);
        toast(friendlyError(e, "No se pudieron cargar los datos del negocio"), "error");
      } finally {
        // Pase lo que pase se sale del estado de carga: quedarse girando para
        // siempre es peor que entrar y ver un aviso de que algo falló.
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [session, sesionRevisada, toast]);

  // Sincronización entre dispositivos: como el almacenamiento no empuja cambios en
  // vivo, se refresca periódicamente todo lo compartido (catálogo, ventas, cajas
  // abiertas, etc.) para que lo que haga una persona aparezca en las demás pantallas
  // en segundos, sin que nadie tenga que recargar manualmente.
  useEffect(() => {
    if (loading || !session) return;
    let cancelled = false;
    async function refresh() {
      // Si este mismo dispositivo acaba de guardar algo (por ejemplo, una
      // recepción de productos o una venta), se salta este ciclo entero: la
      // lectura podría haber empezado antes de que esa escritura terminara de
      // asentarse, y aplicarla pisaría el cambio recién hecho. El siguiente
      // ciclo, unos segundos después, ya trae todo consistente.
      if (Date.now() - momentoUltimaEscritura() < 3000) return;
      // Los registros que solo crecen (ventas, caja, compras) se piden acotados
      // a los últimos días: lo anterior ya está en pantalla y no cambia. Sin ese
      // recorte, cada caja releería años de historial cada pocos segundos.
      const reciente = { reciente: true };
      const results = await Promise.allSettled([
        loadJSONStrict("business-settings"),
        // El catálogo también va acotado: la capa de datos devuelve solo los
        // productos que cambiaron desde la última vuelta, y acá se fusionan.
        loadJSONStrict("products-catalog", reciente),
        loadJSONStrict("product-categories"),
        loadJSONStrict("sales-log", reciente),
        loadJSONStrict("movements-log", reciente),
        loadJSONStrict("open-shifts"),
        loadJSONStrict("shifts-log", reciente),
        loadJSONStrict("suppliers"),
        loadJSONStrict("customers"),
        loadJSONStrict("customer-ledger", reciente),
        loadJSONStrict("supplier-ledger", reciente),
        loadJSONStrict("invoices-index", reciente),
        loadJSONStrict("purchase-items-log", reciente),
        loadJSONStrict("marcelita-feedback", reciente),
        loadJSONStrict("users"),
        loadJSONStrict("inventory-counts", reciente),
        loadJSONStrict("workers"),
      ]);
      if (cancelled) return;
      // Cada lectura se aplica de forma independiente: si una falla (por ejemplo
      // un corte de red momentáneo), esa pieza en particular simplemente se deja
      // como estaba — nunca se reemplaza el catálogo, las ventas, etc. por una
      // lista vacía solo porque la sincronización tuvo un tropiezo puntual.
      const [s, p, cat, sl, mv, os, sh, sup, cu, cl, spl, invIdx, pItems, fb, us, ic, wk] = results.map(r => r.status === "fulfilled" ? r.value : undefined);
      if (s) setSettings(s);
      // Los datos "mutables" (catálogo, proveedores, cajas abiertas, usuarios) solo
      // se reemplazan si lo leído trae algo, o si igual no había nada localmente —
      // así una lectura vacía puntual nunca borra lo que ya se veía en pantalla.
      if (p !== undefined) setProducts(prev => fusionarProductos(prev, p));
      if (cat !== undefined) setCategories(prev => (cat.length > 0 || prev.length === 0) ? cat : prev);
      if (os !== undefined) setOpenShifts(prev => (os.length > 0 || prev.length === 0) ? os : prev);
      if (sup !== undefined) setSuppliers(prev => (sup.length > 0 || prev.length === 0) ? sup : prev);
      if (cu !== undefined) setCustomers(prev => (cu.length > 0 || prev.length === 0) ? cu : prev);
      if (us !== undefined) setUsers(prev => (us.length > 0 || prev.length === 0) ? us : prev);
      if (wk !== undefined) setWorkers(prev => (wk.length > 0 || prev.length === 0) ? wk : prev);
      if (sl !== undefined) setSales(prev => mergeById(prev, sl));
      if (mv !== undefined) setMovements(prev => mergeById(prev, mv));
      if (cl !== undefined) setCustomerLedger(prev => mergeById(prev, cl));
      if (spl !== undefined) setSupplierLedger(prev => mergeById(prev, spl));
      if (sh !== undefined) setShiftsLog(prev => mergeById(prev, sh));
      if (invIdx !== undefined) setInvoicesIndex(prev => mergeById(prev, invIdx));
      if (pItems !== undefined) setPurchaseItems(prev => mergeById(prev, pItems));
      if (fb !== undefined) setFeedback(prev => mergeById(prev, fb));
      if (ic !== undefined) setInventoryCounts(prev => mergeById(prev, ic));
    }
    // Cada 15 segundos en vez de 5: ahora cada ciclo son consultas a una base de
    // datos, no lecturas locales, y 15 segundos siguen siendo imperceptibles
    // para quien está en otra caja.
    const interval = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 15000);
    function onVisible() { if (document.visibilityState === "visible") refresh(); }
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [loading, session]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.paper }}>
        <style>{FONTS}</style>
        <Loader2 className="animate-spin" size={24} style={{ color: C.green }} />
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <style>{FONTS}</style>
        <LoginScreen users={users} businessName={settings.businessName} businessLogo={settings.businessLogo} onLogin={(s) => { setModoVenta(false); setSaltarInventarioGeneral(false); setSession(s); }} toast={toast} />
        <Toast toast={toastData} />
      </div>
    );
  }

  // "Volver a vender" no cierra la sesión real (sigue siendo la de un
  // administrador): solo activa esta máscara, que hace que el resto de la
  // pantalla — pestañas, menú, badges — se vea y se comporte exactamente
  // como para un vendedor cualquiera. Así, en la caja compartida, quien use
  // el computador después de un administrador no hereda de regalo el menú
  // completo de Administración con solo tocar "Más". Volver a entrar (ver
  // el botón de la barra superior) SÍ vuelve a pedir usuario y contraseña
  // cada vez (AdminGateModal): que la sesión de fondo sea de un
  // administrador no prueba que quien está ahora frente al teclado sea esa
  // misma persona — es una caja compartida entre varios vendedores.
  const rolEfectivo = (session.role === "admin" && modoVenta) ? "vendedor" : session.role;

  // Ventana del Inventario General: mientras dure, todo el que entra ve SOLO
  // esta pantalla — nada de menú, nada de otras pestañas — para que nadie
  // mueva stock mientras el local se cuenta entero. Por pedido puntual de
  // esta noche (23-ago-2026), esto incluye también a los administradores:
  // antes quedaban siempre afuera del bloqueo, ahora entran igual que
  // cualquiera, pero conservan un botón de escape (solo ellos lo ven) por si
  // necesitan el panel completo durante la ventana.
  const ahora = new Date();
  const inventarioGeneralActivo = ahora >= INVENTARIO_GENERAL_INICIO && ahora < INVENTARIO_GENERAL_FIN;
  if (inventarioGeneralActivo && !saltarInventarioGeneral) {
    return (
      <div style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <style>{FONTS}</style>
        <GeneralInventoryView
          products={products} setProducts={setProducts} inventoryCounts={inventoryCounts}
          session={session} toast={toast} onLogout={cerrarSesion}
          adminEscapeHatch={rolEfectivo === "admin"}
          onAdminEscape={() => setSaltarInventarioGeneral(true)}
        />
        <Toast toast={toastData} />
      </div>
    );
  }

  const tabs = TABS[rolEfectivo];
  const pendingApprovals = products.filter(p => p.priceApproval).length;
  const pendingCounts = rolEfectivo === "admin"
    ? inventoryCounts.filter(r => r.status === "excepcion_solicitada").length
    : inventoryCounts.filter(r => r.assignedToId === session.userId && r.status === "pendiente").length;

  const allData = { settings, products, categories, sales, movements, openShifts, shiftsLog, suppliers, customers, customerLedger, supplierLedger, invoicesIndex, purchaseItems, feedback, users, inventoryCounts, workers };

  async function restoreAll(archivo) {
    // Los respaldos del sistema anterior traen identificadores propios
    // ("sup_msseiz1q_vg20o2"), y las tablas usan uuid. Antes de escribir nada
    // se traduce el archivo completo, referencias incluidas, para que los
    // vínculos entre productos, proveedores y documentos sigan en pie.
    const { datos: data, traducidos, sueltos } = normalizarRespaldo(archivo);
    if (traducidos > 0) {
      console.info(`[restaurar] ${traducidos} identificadores antiguos traducidos a uuid`);
    }
    const totalSueltos = Object.values(sueltos || {}).reduce((a, b) => a + b, 0);
    if (totalSueltos > 0) {
      console.warn("[restaurar] referencias que apuntaban a algo inexistente:", sueltos);
    }

    const keys = {
      settings: "business-settings", products: "products-catalog", categories: "product-categories",
      sales: "sales-log", movements: "movements-log",
      openShifts: "open-shifts", shiftsLog: "shifts-log", suppliers: "suppliers", invoicesIndex: "invoices-index",
      purchaseItems: "purchase-items-log", feedback: "marcelita-feedback", users: "users",
      inventoryCounts: "inventory-counts", workers: "workers",
      customers: "customers", customerLedger: "customer-ledger",
      supplierLedger: "supplier-ledger",
    };
    const setters = {
      settings: setSettings, products: setProducts, categories: setCategories, sales: setSales, movements: setMovements,
      openShifts: setOpenShifts, shiftsLog: setShiftsLog, suppliers: setSuppliers, invoicesIndex: setInvoicesIndex,
      purchaseItems: setPurchaseItems, feedback: setFeedback, users: setUsers,
      inventoryCounts: setInventoryCounts, workers: setWorkers,
      customers: setCustomers, customerLedger: setCustomerLedger,
      supplierLedger: setSupplierLedger,
    };
    // Orden obligatorio: cada cosa depende de la anterior. Las boletas apuntan a
    // quien vendió, las líneas de compra al documento, los sueldos al trabajador.
    // Antes se guardaba todo en paralelo, cuando no había relaciones que romper.
    // "categories" va antes que "products" porque un producto apunta a su
    // sección (categoria_id); si el catálogo llegara primero, cada producto
    // dispararía su propia creación-al-vuelo de la sección en vez de usar la
    // que trae el respaldo. "customers" va antes que "sales" porque una venta
    // fiada apunta a un cliente; "customerLedger" va después de "sales" porque
    // un cargo de fiado apunta a la venta que lo originó (migración 0012).
    // "supplierLedger" va después de "invoicesIndex" por la misma razón: un
    // cargo a crédito (migración 0014) apunta al documento de compra que lo
    // originó.
    const orden = [
      "workers", "suppliers", "customers", "settings", "categories", "products", "openShifts",
      "invoicesIndex", "sales", "purchaseItems", "movements", "shiftsLog",
      "customerLedger", "supplierLedger", "inventoryCounts", "feedback",
    ];
    for (const field of orden) {
      if (data[field] === undefined) continue;
      // Las boletas conservan su número original: si la secuencia les asignara
      // otro, el histórico dejaría de calzar con los asientos de caja.
      // sinBajas: restaurar agrega y actualiza, nunca da de baja. Lo que no
      // viene en el archivo no fue eliminado; puede ser algo que ya estaba.
      await saveJSON(keys[field], data[field], {
        sinBajas: true,
        ...(field === "sales" ? { preservarNumero: true } : {}),
      });
      setters[field](data[field]);
    }

    // Y la secuencia se adelanta más allá del último número restaurado, para
    // que la próxima venta no choque con una boleta que ya existe.
    try {
      await obtenerCliente().rpc("sincronizar_boletas");
    } catch (e) {
      console.error("[restaurar] no se pudo reordenar el correlativo", e);
    }
    // Las cuentas del equipo no se restauran desde el respaldo: las contraseñas
    // las guarda Supabase Auth y nunca salen en el archivo.
  }

  const grupos = GRUPOS[rolEfectivo];
  // No incluye la recomendación de pan (ver useActividadPan): esa depende de
  // bread-holidays/bread-shortages, que no están cargados acá — el badge de
  // la pestaña cuenta las demás señales, y el aviso de pan aparece recién al
  // abrirla.
  const actividadesPendientes = construirActividades({
    rolEfectivo, session, products, inventoryCounts, customers, customerLedger, openShifts, feedback,
  }).length;
  const avisos = {
    recepcion: rolEfectivo === "admin" ? pendingApprovals : 0,
    conteos: pendingCounts,
    actividades: actividadesPendientes,
  };
  const principales = tabs.filter(t => MOVIL_PRINCIPALES.includes(t.id));
  const seccionActual = tabs.find(t => t.id === tab);
  const enBarraInferior = MOVIL_PRINCIPALES.includes(tab);

  return (
    <div className="min-h-dvh" style={{ background: C.paper, fontFamily: "'IBM Plex Sans', system-ui, -apple-system, sans-serif", color: C.ink }}>
      <style>{FONTS}</style>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform: translate(-50%,8px);} to {opacity:1; transform: translate(-50%,0);} }
        input:focus, select:focus, textarea:focus { border-color: ${C.green} !important; box-shadow: 0 0 0 3px ${C.greenSoft}; outline: none; }

        /* Las tarjetas y campos comparten un mismo radio y una sombra apenas
           perceptible: lo justo para separarlos del fondo sin que la pantalla
           se llene de cajas flotando. */
        .rounded-lg { border-radius: 10px !important; }
        .rounded-xl { border-radius: 14px !important; }
        main .rounded-xl { box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 1px 3px rgba(15,23,42,.06); }

        /* En pantallas angostas las tablas anchas se desplazan solas en vez de
           empujar la página entera hacia el costado. */
        @media (max-width: 767px) {
          main table { display: block; overflow-x: auto; white-space: nowrap; }
        }
      `}</style>

      <MenuLateral grupos={grupos} tab={tab} setTab={setTab} avisos={avisos} settings={settings} />

      <div className="lg:pl-64">
        {/* Barra superior. En computador solo lleva el nombre de la sección y la
            cuenta; el logo y el menú ya viven en la barra lateral. */}
        <header
          className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 sm:px-6 h-16"
          style={{ background: "#fff", borderBottom: `1px solid ${C.paperLine}` }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
                 style={{ background: settings.businessLogo ? C.paperDark : C.brass }}>
              {settings.businessLogo
                ? <img src={settings.businessLogo} alt="" className="w-full h-full object-contain p-0.5" />
                : <Store size={18} style={{ color: C.ink }} aria-hidden="true" />}
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-base truncate" style={{ color: C.ink }}>
                {seccionActual?.label || settings.businessName}
              </h1>
              <div className="text-xs truncate" style={{ color: C.gray }}>
                {session.name} · {rolEfectivo === "admin" ? "Administrador" : "Vendedor"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Dos casos, según lo que se ve AHORA en pantalla (rolEfectivo),
                no según quién es realmente la sesión de fondo (session.role):
                 1) Se ve como vendedor (ya sea porque la sesión real lo es, o
                    porque un administrador puso "Volver a vender") → siempre
                    pide entrar con cuenta de administrador de verdad
                    (AdminGateModal). Es una caja compartida: que la sesión de
                    fondo ya sea de un administrador no prueba que quien está
                    ahora frente al teclado sea esa misma persona, así que
                    "Volver a vender" exige repetir el login cada vez que se
                    quiere volver a Administración — nunca lo salta.
                 2) Se ve el panel de Administración → "Volver a vender"
                    activa la máscara y no toca la sesión ni la caja abierta. */}
            {rolEfectivo !== "admin" ? (
              <button
                onClick={() => setAdminGateOpen(true)}
                className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg font-medium"
                style={{ background: C.paperDark, color: C.ink }}
              >
                <Lock size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Panel de administración</span>
              </button>
            ) : (
              <button
                onClick={() => { setModoVenta(true); setTab("pos"); }}
                className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg font-medium"
                style={{ background: C.greenSoft, color: C.greenDark }}
              >
                <ShoppingCart size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Volver a vender</span>
              </button>
            )}
            <button
              onClick={() => setMyAccountOpen(true)}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg font-medium"
              style={{ background: C.paperDark, color: C.ink }}
            >
              <User size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Mi cuenta</span>
            </button>
            <button
              onClick={cerrarSesion}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg font-medium"
              style={{ background: C.paperDark, color: C.ink }}
            >
              <LogOut size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </header>

        {/* El espacio de abajo deja respirar el contenido por encima de la
            barra inferior del teléfono, que va fija. */}
        <main className="p-4 sm:p-6 max-w-6xl mx-auto pb-24 lg:pb-6">
        {tab === "pos" && <POSView products={products} setProducts={setProducts} settings={settings} setSettings={setSettings} sales={sales} setSales={setSales} movements={movements} setMovements={setMovements} suppliers={suppliers} setSuppliers={setSuppliers} categories={categories} purchaseItems={purchaseItems} session={session} toast={toast} role={rolEfectivo} customers={customers} setCustomers={setCustomers} customerLedger={customerLedger} setCustomerLedger={setCustomerLedger} openShifts={openShifts} setTab={setTab} />}
        {tab === "actividades" && <ActividadesView session={session} role={rolEfectivo} products={products} inventoryCounts={inventoryCounts} customers={customers} customerLedger={customerLedger} openShifts={openShifts} feedback={feedback} sales={sales} movements={movements} purchaseItems={purchaseItems} settings={settings} setTab={setTab} />}
        {tab === "inventario-general" && <GeneralInventoryView products={products} setProducts={setProducts} inventoryCounts={inventoryCounts} session={session} toast={toast} />}
        {tab === "caja" && <CajaView sales={sales} openShifts={openShifts} setOpenShifts={setOpenShifts} shiftsLog={shiftsLog} setShiftsLog={setShiftsLog} session={session} role={rolEfectivo} toast={toast} />}
        {tab === "facturas" && <InvoicesView sales={sales} settings={settings} />}
        {tab === "inventario" && <InventoryView products={products} setProducts={setProducts} movements={movements} setMovements={setMovements} purchaseItems={purchaseItems} setPurchaseItems={setPurchaseItems} suppliers={suppliers} setSuppliers={setSuppliers} categories={categories} settings={settings} role={rolEfectivo} session={session} toast={toast} />}
        {tab === "recepcion" && <ReceivingView products={products} setProducts={setProducts} movements={movements} setMovements={setMovements} suppliers={suppliers} setSuppliers={setSuppliers} categories={categories} invoicesIndex={invoicesIndex} setInvoicesIndex={setInvoicesIndex} purchaseItems={purchaseItems} setPurchaseItems={setPurchaseItems} supplierLedger={supplierLedger} setSupplierLedger={setSupplierLedger} role={rolEfectivo} session={session} toast={toast} />}
        {tab === "categorias" && rolEfectivo === "admin" && <CategoriesView categories={categories} setCategories={setCategories} products={products} setProducts={setProducts} toast={toast} />}
        {tab === "proveedores" && rolEfectivo === "admin" && <SuppliersView suppliers={suppliers} setSuppliers={setSuppliers} invoicesIndex={invoicesIndex} purchaseItems={purchaseItems} supplierLedger={supplierLedger} setSupplierLedger={setSupplierLedger} movements={movements} setMovements={setMovements} products={products} role={rolEfectivo} toast={toast} />}
        {tab === "clientes" && rolEfectivo === "admin" && <ClientesView customers={customers} setCustomers={setCustomers} customerLedger={customerLedger} setCustomerLedger={setCustomerLedger} movements={movements} setMovements={setMovements} toast={toast} />}
        {tab === "egresos" && rolEfectivo === "admin" && <ExpensesView movements={movements} setMovements={setMovements} toast={toast} />}
        {tab === "sueldos" && rolEfectivo === "admin" && <PayrollPanel workers={workers} setWorkers={setWorkers} movements={movements} setMovements={setMovements} session={session} toast={toast} />}
        {tab === "finanzas" && rolEfectivo === "admin" && <FinanceView sales={sales} movements={movements} products={products} />}
        {tab === "analisis" && rolEfectivo === "admin" && <AnalyticsView sales={sales} products={products} setProducts={setProducts} suppliers={suppliers} invoicesIndex={invoicesIndex} purchaseItems={purchaseItems} movements={movements} setMovements={setMovements} settings={settings} setSettings={setSettings} session={session} toast={toast} />}
        {tab === "ajustes" && rolEfectivo === "admin" && <SettingsView settings={settings} setSettings={setSettings} toast={toast} products={products} sales={sales} allData={allData} onRestore={restoreAll} />}
        {tab === "usuarios" && rolEfectivo === "admin" && <UsersView users={users} setUsers={setUsers} sales={sales} invoicesIndex={invoicesIndex} shiftsLog={shiftsLog} session={session} toast={toast} />}
        {tab === "transformar" && <TransformView products={products} setProducts={setProducts} movements={movements} setMovements={setMovements} settings={settings} setSettings={setSettings} session={session} role={rolEfectivo} toast={toast} />}
        {tab === "conteos" && <InventoryCountsView counts={inventoryCounts} setCounts={setInventoryCounts} products={products} setProducts={setProducts} movements={movements} setMovements={setMovements} users={users} session={session} role={rolEfectivo} toast={toast} />}
        </main>
      </div>

      <BarraInferior
        items={principales} tab={tab} setTab={setTab} avisos={avisos}
        onMas={() => setMenuAbierto(true)} masActivo={!enBarraInferior}
      />
      {menuAbierto && (
        <HojaDeSecciones
          grupos={grupos} tab={tab} setTab={setTab} avisos={avisos}
          onClose={() => setMenuAbierto(false)}
        />
      )}

      <MarcelitaWidget products={products} feedback={feedback} setFeedback={setFeedback} session={session} role={rolEfectivo} toast={toast} users={users} counts={inventoryCounts} setCounts={setInventoryCounts} />
      {myAccountOpen && <MyAccountModal session={session} users={users} setUsers={setUsers} onClose={() => setMyAccountOpen(false)} toast={toast} />}
      {adminGateOpen && (
        <AdminGateModal
          toast={toast}
          onClose={() => setAdminGateOpen(false)}
          onEnter={(perfilAdmin) => {
            setAdminGateOpen(false);
            // null significa que el inicio de sesión terminó cerrando la
            // sesión (contraseña de una cuenta que no era admin): se vuelve
            // a la pantalla de ingreso, igual que un "Salir" cualquiera.
            setSession(perfilAdmin);
            if (perfilAdmin) { setModoVenta(false); setTab("pos"); }
          }}
        />
      )}
      <Toast toast={toastData} />
    </div>
  );
}
