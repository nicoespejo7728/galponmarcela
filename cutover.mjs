// Script de corte para el inventario general de El Galpón.
// Lee credenciales desde .env.local (nunca las imprime). Habla directo con
// PostgREST (esquema "galpon") usando la service_role key, igual que hace
// la propia app pero sin RLS de por medio.
//
// Modo por defecto: DRY RUN (no escribe nada, solo informa).
// Para aplicar de verdad: node cutover.mjs --apply

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Busca .env.local junto al script, o en el directorio actual, o en la raíz
// del proyecto un nivel arriba — para que funcione sin importar desde dónde
// se corra (aquí en el sandbox, o en tu máquina dentro de la carpeta del
// proyecto).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const candidatos = [
  path.join(process.cwd(), ".env.local"),
  path.join(__dirname, ".env.local"),
  "/mnt/user-data/uploads/galponmarcela/.env.local",
];
const envPath = candidatos.find(p => fs.existsSync(p));
if (!envPath) {
  throw new Error("No se encontró .env.local. Corre este script desde la raíz del proyecto (junto al archivo .env.local).");
}
const envText = fs.readFileSync(envPath, "utf8");
function envVar(name) {
  const m = envText.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!m) throw new Error(`Falta ${name} en .env.local`);
  return m[1].trim();
}
const SUPABASE_URL = envVar("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = envVar("SUPABASE_SERVICE_ROLE_KEY");

const APPLY = process.argv.includes("--apply");

async function rest(path, { method = "GET", body, extraHeaders = {}, prefer } = {}) {
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Accept-Profile": "galpon",
    "Content-Profile": "galpon",
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
    ...extraHeaders,
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

async function fetchAll(table, select, extraQuery = "") {
  const out = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const rows = await rest(`${table}?select=${select}${extraQuery}&order=id&limit=${pageSize}&offset=${from}`);
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

function clave(s) {
  return (s || "").toString().trim().toLowerCase().normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
}

const STOPWORDS = new Set([
  "de","del","la","el","los","las","con","sin","para","por","en","y","al",
  "un","una","unos","unas","kg","gr","grs","g","ml","lt","lts","l","cc","x",
]);

function tokens(name) {
  return clave(name)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

async function main() {
  console.log(APPLY ? "=== MODO APLICAR (se escribe en la base) ===" : "=== MODO DRY-RUN (solo informe, no escribe nada) ===");

  const categorias = await fetchAll("categoria", "id,nombre,activa", "");
  const catById = new Map(categorias.map(c => [c.id, c]));
  const catByName = new Map(categorias.filter(c => c.activa).map(c => [clave(c.nombre), c]));

  const productos = await fetchAll(
    "producto",
    "id,codigo_barras,nombre,categoria_id,costo,precio,stock,proveedor_id,creado_at",
    "&activo=eq.true"
  );
  console.log(`Productos activos: ${productos.length}`);
  console.log(`Categorías activas: ${categorias.filter(c => c.activa).length}`);

  // --- 1. Duplicados ---
  // Paso A: mismo código de barras REAL (no autogenerado "INT-...").
  const porBarcode = new Map();
  for (const p of productos) {
    const bc = (p.codigo_barras || "").trim().toUpperCase();
    if (!bc || bc.startsWith("INT-")) continue;
    if (!porBarcode.has(bc)) porBarcode.set(bc, []);
    porBarcode.get(bc).push(p);
  }
  const dedupDecisions = new Map(); // id -> "keep" | producto a desactivar
  const toDeactivate = [];

  function pickKeeper(group) {
    return [...group].sort((a, b) => {
      const aReal = !(a.codigo_barras || "").toUpperCase().startsWith("INT-");
      const bReal = !(b.codigo_barras || "").toUpperCase().startsWith("INT-");
      if (aReal !== bReal) return aReal ? -1 : 1;
      const aCat = a.categoria_id ? 1 : 0, bCat = b.categoria_id ? 1 : 0;
      if (aCat !== bCat) return bCat - aCat;
      return new Date(a.creado_at) - new Date(b.creado_at);
    })[0];
  }

  for (const [, group] of porBarcode) {
    if (group.length <= 1) continue;
    const keeper = pickKeeper(group);
    for (const p of group) {
      if (p.id === keeper.id) continue;
      dedupDecisions.set(p.id, { motivo: "mismo código de barras", keeperId: keeper.id, keeperNombre: keeper.nombre, nombre: p.nombre, id: p.id });
      toDeactivate.push(p.id);
    }
  }

  // Paso B: mismo nombre normalizado, entre los que no se resolvieron ya por B.
  const yaResueltos = new Set(toDeactivate);
  const porNombre = new Map();
  for (const p of productos) {
    if (yaResueltos.has(p.id)) continue;
    const k = clave(p.nombre);
    if (!k) continue;
    if (!porNombre.has(k)) porNombre.set(k, []);
    porNombre.get(k).push(p);
  }
  for (const [, group] of porNombre) {
    if (group.length <= 1) continue;
    const keeper = pickKeeper(group);
    for (const p of group) {
      if (p.id === keeper.id) continue;
      dedupDecisions.set(p.id, { motivo: "mismo nombre", keeperId: keeper.id, keeperNombre: keeper.nombre, nombre: p.nombre, id: p.id });
      toDeactivate.push(p.id);
    }
  }

  console.log(`\nDuplicados detectados: ${toDeactivate.length} producto(s) a desactivar (se conserva 1 por grupo).`);
  const sampleDups = [...dedupDecisions.values()].slice(0, 15);
  for (const d of sampleDups) console.log(`  - "${d.nombre}" (${d.motivo}) -> se mantiene "${d.keeperNombre}"`);
  if (dedupDecisions.size > 15) console.log(`  ... y ${dedupDecisions.size - 15} más.`);

  const activosPostDedup = productos.filter(p => !dedupDecisions.has(p.id));

  // --- 2. Categorización automática de los sin categoría ---
  const clasificados = activosPostDedup.filter(p => p.categoria_id);
  const sinClasificar = activosPostDedup.filter(p => !p.categoria_id);

  // Construir mapa palabra -> {categoriaId: conteo} a partir de lo ya clasificado.
  const wordCatCount = new Map(); // word -> Map(categoriaId -> count)
  for (const p of clasificados) {
    const cat = p.categoria_id;
    for (const t of new Set(tokens(p.nombre))) {
      if (!wordCatCount.has(t)) wordCatCount.set(t, new Map());
      const m = wordCatCount.get(t);
      m.set(cat, (m.get(cat) || 0) + 1);
    }
  }
  // Palabra "confiable" = aparece casi siempre asociada a UNA sola categoría.
  const wordToCategory = new Map();
  for (const [word, counts] of wordCatCount) {
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    if (total < 2) continue; // una sola aparición no es señal suficiente
    const [bestCat, bestCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (bestCount / total >= 0.85) wordToCategory.set(word, bestCat);
  }

  const asignaciones = []; // {producto, categoriaId, categoriaNombre, score}
  const siguenSinClasificar = [];
  for (const p of sinClasificar) {
    const ts = tokens(p.nombre);
    const votos = new Map();
    for (const t of ts) {
      const cat = wordToCategory.get(t);
      if (cat) votos.set(cat, (votos.get(cat) || 0) + 1);
    }
    if (votos.size === 0) { siguenSinClasificar.push(p); continue; }
    const [bestCat, votes] = [...votos.entries()].sort((a, b) => b[1] - a[1])[0];
    asignaciones.push({ producto: p, categoriaId: bestCat, categoriaNombre: catById.get(bestCat)?.nombre, votes });
  }

  console.log(`\nSin categoría antes: ${sinClasificar.length}`);
  console.log(`Se les puede asignar categoría automáticamente: ${asignaciones.length}`);
  console.log(`Siguen sin poder clasificarse con confianza: ${siguenSinClasificar.length}`);

  const porCategoriaCount = new Map();
  for (const a of asignaciones) porCategoriaCount.set(a.categoriaNombre, (porCategoriaCount.get(a.categoriaNombre) || 0) + 1);
  console.log("\nDistribución de lo auto-asignado:");
  for (const [nombre, n] of [...porCategoriaCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${nombre}: ${n}`);
  }
  console.log("\nEjemplos de asignación:");
  for (const a of asignaciones.slice(0, 20)) console.log(`  "${a.producto.nombre}" -> ${a.categoriaNombre}`);

  // --- 3. Stock a poner en cero ---
  const conStock = activosPostDedup.filter(p => Number(p.stock) !== 0);
  console.log(`\nProductos con stock distinto de 0 (se llevarán a 0 vía kárdex): ${conStock.length}`);
  const totalUnidadesActuales = conStock.reduce((s, p) => s + Number(p.stock), 0);
  console.log(`Suma total de stock actual (referencial, unidades+kg mezclados): ${totalUnidadesActuales.toFixed(2)}`);

  if (!APPLY) {
    console.log("\n(DRY RUN: no se escribió nada. Ejecuta con --apply para aplicar de verdad.)");
    return;
  }

  // ===================== ESCRITURA REAL =====================
  console.log("\n--- Aplicando cambios ---");

  // 1. Desactivar duplicados (soft delete, igual que el resto del sistema).
  const idsDesactivar = [...dedupDecisions.keys()];
  for (let i = 0; i < idsDesactivar.length; i += 200) {
    const lote = idsDesactivar.slice(i, i + 200);
    await rest(`producto?id=in.(${lote.join(",")})`, { method: "PATCH", body: { activo: false } });
  }
  console.log(`Desactivados: ${idsDesactivar.length}`);

  // 2. Asignar categoría automática.
  // Se agrupa por categoría destino para hacer menos llamadas.
  const porCategoria = new Map();
  for (const a of asignaciones) {
    if (!porCategoria.has(a.categoriaId)) porCategoria.set(a.categoriaId, []);
    porCategoria.get(a.categoriaId).push(a.producto.id);
  }
  let totalCategorizados = 0;
  for (const [catId, ids] of porCategoria) {
    for (let i = 0; i < ids.length; i += 200) {
      const lote = ids.slice(i, i + 200);
      await rest(`producto?id=in.(${lote.join(",")})`, { method: "PATCH", body: { categoria_id: catId } });
      totalCategorizados += lote.length;
    }
  }
  console.log(`Categorizados automáticamente: ${totalCategorizados}`);

  // 3. Stock a cero, vía kárdex (el trigger actualiza producto.stock).
  const idsDesactivarSet = new Set(idsDesactivar);
  const kardexRows = conStock
    .filter(p => !idsDesactivarSet.has(p.id))
    .map(p => ({
      producto_id: p.id,
      origen: "conteo",
      cantidad: -Number(p.stock),
      nota: "Corte a cero para inventario general — " + new Date().toISOString().slice(0, 10),
    }));
  let totalStockCero = 0;
  for (let i = 0; i < kardexRows.length; i += 200) {
    const lote = kardexRows.slice(i, i + 200);
    await rest("kardex", { method: "POST", body: lote, prefer: "return=minimal" });
    totalStockCero += lote.length;
  }
  console.log(`Stock llevado a 0 en: ${totalStockCero} producto(s)`);

  console.log("\n=== Listo ===");
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
