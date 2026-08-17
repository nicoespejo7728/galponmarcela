"use client";

import { createBrowserClient } from "@supabase/ssr";

/* Cliente de Supabase para el navegador.
   Todo el sistema de ventas corre del lado del cliente, así que este es el
   único punto por donde salen las consultas. La clave publicable es segura de
   exponer: lo que protege los datos son las políticas RLS del esquema galpon,
   que exigen tener un perfil activo. */

let _cliente = null;

export function obtenerCliente() {
  if (_cliente) return _cliente;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !clave) {
    throw new Error(
      "Faltan las variables NEXT_PUBLIC_SUPABASE_URL y " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY. Cárgalas en Vercel (Settings → " +
        "Environment Variables) o en el archivo .env.local para desarrollo."
    );
  }

  // db.schema apunta al esquema propio del almacén, aislado del resto del
  // proyecto Supabase. Requiere tener "galpon" en Settings → API →
  // Exposed schemas.
  _cliente = createBrowserClient(url, clave, { db: { schema: "galpon" } });
  return _cliente;
}

/* Cliente para Storage (fotos de facturas y logo). Storage no vive dentro de
   un esquema, así que necesita un cliente sin el `db.schema` apuntado. */
let _clienteArchivos = null;

export function obtenerClienteArchivos() {
  if (_clienteArchivos) return _clienteArchivos;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  _clienteArchivos = createBrowserClient(url, clave);
  return _clienteArchivos;
}

export const BUCKET_FACTURAS = "galpon-facturas";
export const BUCKET_PUBLICO = "galpon-publico";
