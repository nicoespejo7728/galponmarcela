import { createClient } from "@supabase/supabase-js";

/* Herramienta de diagnóstico para la integración con las máquinas Point de
   Mercado Pago (ver componentes/sistema-ventas.jsx, botón "Probar conexión
   con Mercado Pago" en Ajustes).

   Antes de poder mandarle un cobro a una máquina hay que saber su
   "terminal_id" tal como lo conoce la API de Mercado Pago — no es el número
   de serie que se ve en la app de Mercado Pago, sino un identificador propio
   (algo como "NEWLAND_N950__N950NCBA01837910") que solo se puede consultar
   por API. Esta ruta lista las máquinas asociadas a la cuenta para poder
   copiar ese identificador una sola vez, al configurar cada caja. */

export const runtime = "nodejs";

/* Mismo criterio que /api/usuarios: solo un administrador puede tocar esto,
   porque toca la configuración de cómo se cobra en el mesón. */
async function exigirAdministrador(request) {
  const token = (request.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "Falta la sesión.", estado: 401 };

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      db: { schema: "galpon" },
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  const { data: usuario } = await sb.auth.getUser(token);
  if (!usuario?.user) return { error: "Tu sesión expiró. Vuelve a entrar.", estado: 401 };

  const { data: perfil } = await sb
    .from("perfil").select("id,rol,activo").eq("id", usuario.user.id).maybeSingle();

  if (!perfil?.activo) return { error: "Tu cuenta no está activa.", estado: 403 };
  if (perfil.rol !== "admin") {
    return { error: "Solo un administrador puede ver esto.", estado: 403 };
  }
  return { perfil };
}

export async function GET(request) {
  const guardia = await exigirAdministrador(request);
  if (guardia.error) return Response.json({ error: guardia.error }, { status: guardia.estado });

  // Esto SÍ necesita el token de producción, aunque el resto de la
  // integración se esté probando con el de prueba: las máquinas físicas
  // están asociadas a la cuenta real, no a un usuario de prueba (que no
  // tiene ninguna tienda ni caja propia). Es una simple lectura — no cobra
  // nada — así que no hay riesgo en usarlo acá.
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    return Response.json(
      { error: "Falta configurar MERCADOPAGO_ACCESS_TOKEN en Vercel." },
      { status: 503 }
    );
  }

  let respuesta;
  try {
    respuesta = await fetch("https://api.mercadopago.com/point/integration-api/devices", {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    return Response.json({ error: `No se pudo contactar a Mercado Pago: ${e.message}` }, { status: 502 });
  }

  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    return Response.json(
      { error: datos?.message || `Mercado Pago respondió ${respuesta.status}` },
      { status: respuesta.status }
    );
  }

  return Response.json(datos);
}
