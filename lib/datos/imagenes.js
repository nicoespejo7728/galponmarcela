import { obtenerCliente, obtenerClienteArchivos, BUCKET_FACTURAS } from "@/lib/supabase/cliente";
import { traerTodo } from "@/lib/datos/catalogos";

/* Fotos y PDF de documentos: facturas de recepción y, desde la migración
   0011, boletas/facturas de gastos y pagos manuales del libro de caja.

   Antes vivían como texto base64 dentro del almacenamiento del navegador, una
   clave por factura, y quedaban fuera del respaldo. Ahora el archivo va a un
   bucket privado de Supabase y en la base queda solo la ruta. */

const EXTENSIONES = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function aBinario(dataUrl) {
  const coma = dataUrl.indexOf(",");
  const base64 = coma >= 0 ? dataUrl.slice(coma + 1) : dataUrl;
  const bruto = atob(base64);
  const bytes = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

export async function guardarPaginasDeFactura(facturaId, valor) {
  const paginas = Array.isArray(valor?.pages) ? valor.pages : [];
  if (paginas.length === 0) return;

  const archivos = obtenerClienteArchivos();
  const sb = obtenerCliente();
  const filas = [];

  for (let i = 0; i < paginas.length; i++) {
    const p = paginas[i];
    if (!p?.dataUrl) continue;
    const ext = EXTENSIONES[p.mediaType] || "bin";
    const ruta = `${facturaId}/${i + 1}.${ext}`;
    const contenido = aBinario(p.dataUrl);

    const { error } = await archivos.storage
      .from(BUCKET_FACTURAS)
      .upload(ruta, contenido, { contentType: p.mediaType, upsert: true });

    if (error) throw new Error(`No se pudo guardar la foto del documento: ${error.message}`);

    filas.push({
      factura_id: facturaId,
      orden: i,
      storage_path: ruta,
      tipo_mime: p.mediaType,
      nombre_archivo: p.name || null,
      bytes: contenido.length,
    });
  }

  if (filas.length) {
    const { error } = await sb
      .from("factura_compra_pagina")
      .upsert(filas, { onConflict: "factura_id,orden" });
    if (error) throw new Error(`No se pudo registrar el documento: ${error.message}`);
  }
}

/* Igual que guardarPaginasDeFactura/leerPaginasDeFactura, pero para el
   documento (opcional) de un gasto o pago manual del libro de caja —
   galpon.movimiento_documento en vez de factura_compra_pagina, y la ruta
   queda bajo "movimientos/" para no mezclarse con las de recepción. */
export async function guardarDocumentosDeMovimiento(movimientoId, valor) {
  const paginas = Array.isArray(valor?.pages) ? valor.pages : [];
  if (paginas.length === 0) return;

  const archivos = obtenerClienteArchivos();
  const sb = obtenerCliente();
  const filas = [];

  for (let i = 0; i < paginas.length; i++) {
    const p = paginas[i];
    if (!p?.dataUrl) continue;
    const ext = EXTENSIONES[p.mediaType] || "bin";
    const ruta = `movimientos/${movimientoId}/${i + 1}.${ext}`;
    const contenido = aBinario(p.dataUrl);

    const { error } = await archivos.storage
      .from(BUCKET_FACTURAS)
      .upload(ruta, contenido, { contentType: p.mediaType, upsert: true });

    if (error) throw new Error(`No se pudo guardar la boleta/factura del gasto: ${error.message}`);

    filas.push({
      movimiento_id: movimientoId,
      orden: i,
      storage_path: ruta,
      tipo_mime: p.mediaType,
      nombre_archivo: p.name || null,
      bytes: contenido.length,
    });
  }

  if (filas.length) {
    const { error } = await sb
      .from("movimiento_documento")
      .upsert(filas, { onConflict: "movimiento_id,orden" });
    if (error) throw new Error(`No se pudo registrar la boleta/factura del gasto: ${error.message}`);
  }
}

export async function leerDocumentosDeMovimiento(movimientoId) {
  const sb = obtenerCliente();
  const archivos = obtenerClienteArchivos();

  const filas = await traerTodo(() =>
    sb.from("movimiento_documento").select("*").eq("movimiento_id", movimientoId).order("orden")
  );
  if (filas.length === 0) return null;

  const paginas = [];
  for (const f of filas) {
    const { data, error } = await archivos.storage
      .from(BUCKET_FACTURAS)
      .createSignedUrl(f.storage_path, 3600);
    if (error) continue;
    paginas.push({
      mediaType: f.tipo_mime,
      dataUrl: data.signedUrl,
      name: f.nombre_archivo || `Página ${f.orden + 1}`,
    });
  }
  return paginas.length ? { pages: paginas } : null;
}

export async function leerPaginasDeFactura(facturaId) {
  const sb = obtenerCliente();
  const archivos = obtenerClienteArchivos();

  const filas = await traerTodo(() =>
    sb.from("factura_compra_pagina").select("*").eq("factura_id", facturaId).order("orden")
  );
  if (filas.length === 0) return null;

  // El bucket es privado: cada página se abre con un enlace firmado que dura
  // una hora, suficiente para verla sin dejarla accesible a cualquiera.
  const paginas = [];
  for (const f of filas) {
    const { data, error } = await archivos.storage
      .from(BUCKET_FACTURAS)
      .createSignedUrl(f.storage_path, 3600);
    if (error) continue;
    paginas.push({
      mediaType: f.tipo_mime,
      dataUrl: data.signedUrl,
      name: f.nombre_archivo || `Página ${f.orden + 1}`,
    });
  }
  return paginas.length ? { pages: paginas } : null;
}
