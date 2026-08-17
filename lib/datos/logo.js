import { obtenerCliente, obtenerClienteArchivos, BUCKET_PUBLICO } from "@/lib/supabase/cliente";

/* Logo del negocio.

   Antes se guardaba como texto base64 dentro de los ajustes, lo que hacía que
   cada lectura de la configuración arrastrara ~80 KB. Ahora vive en un bucket
   público y en la base queda solo la ruta. */

const RUTA = "logo";

export async function subirLogo(archivo) {
  if (!archivo) throw new Error("No se recibió ninguna imagen");
  if (!archivo.type?.startsWith("image/")) {
    throw new Error("El logo debe ser una imagen (JPG, PNG o WebP)");
  }
  if (archivo.size > 2 * 1024 * 1024) {
    throw new Error("La imagen pesa más de 2 MB. Usa una más liviana.");
  }

  const extension = (archivo.name.split(".").pop() || "png").toLowerCase();
  const ruta = `${RUTA}.${extension}`;

  const archivos = obtenerClienteArchivos();
  const { error } = await archivos.storage
    .from(BUCKET_PUBLICO)
    .upload(ruta, archivo, { contentType: archivo.type, upsert: true });
  if (error) throw new Error(`No se pudo subir el logo: ${error.message}`);

  const sb = obtenerCliente();
  const { error: e2 } = await sb.from("config_negocio").update({ logo_path: ruta }).eq("id", 1);
  if (e2) throw new Error(`No se pudo guardar el logo: ${e2.message}`);

  const { data } = archivos.storage.from(BUCKET_PUBLICO).getPublicUrl(ruta);
  // El parámetro de tiempo obliga al navegador a recargar la imagen aunque la
  // ruta sea la misma de antes.
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function quitarLogo() {
  const sb = obtenerCliente();
  const { error } = await sb.from("config_negocio").update({ logo_path: null }).eq("id", 1);
  if (error) throw new Error(`No se pudo quitar el logo: ${error.message}`);
}
