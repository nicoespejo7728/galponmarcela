import { createClient } from "@supabase/supabase-js";

/* Lectura automática de documentos de compra.

   La versión anterior llamaba a la API de Claude directamente desde el
   navegador, sin credenciales propias. En un sitio público eso no es viable: la
   clave tiene que quedarse en el servidor. Esta ruta la guarda, comprueba que
   quien llama tenga sesión iniciada en El Galpón, y recién ahí consulta. */

export const runtime = "nodejs";
export const maxDuration = 60;

const MODELO = "claude-sonnet-4-5";
const ESPERAS = [5000, 12000, 20000, 30000];

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/* Solo el equipo del almacén puede gastar la cuota de IA. Se valida el token de
   la sesión contra Supabase y se exige un perfil activo en el esquema galpon. */
async function sesionValida(request) {
  const cabecera = request.headers.get("authorization") || "";
  const token = cabecera.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) return null;

  const sb = createClient(url, clave, {
    db: { schema: "galpon" },
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: usuario } = await sb.auth.getUser(token);
  if (!usuario?.user) return null;

  const { data: perfil } = await sb
    .from("perfil").select("id,rol,activo").eq("id", usuario.user.id).maybeSingle();

  if (!perfil || !perfil.activo) return null;
  return perfil;
}

export async function POST(request) {
  const perfil = await sesionValida(request);
  if (!perfil) {
    return Response.json(
      { error: "Tu sesión expiró. Vuelve a entrar al sistema e inténtalo de nuevo." },
      { status: 401 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error:
          "La lectura automática de documentos no está configurada todavía. " +
          "Carga los productos a mano por ahora, o pídele al administrador que " +
          "agregue la clave de Anthropic en el servidor.",
        sinConfigurar: true,
      },
      { status: 503 }
    );
  }

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "No se entendió la solicitud." }, { status: 400 });
  }

  const peticion = {
    model: cuerpo.model || MODELO,
    max_tokens: cuerpo.max_tokens || 4096,
    messages: cuerpo.messages || [],
  };

  // Reintentos ante saturación del servicio: el mismo comportamiento que tenía
  // la versión anterior, pero ahora del lado del servidor.
  for (let intento = 0; intento <= ESPERAS.length; intento++) {
    let respuesta;
    try {
      respuesta = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(peticion),
      });
    } catch {
      if (intento < ESPERAS.length) { await dormir(ESPERAS[intento]); continue; }
      return Response.json(
        { error: "No se pudo conectar con el servicio de lectura. Intenta de nuevo en un momento." },
        { status: 502 }
      );
    }

    const datos = await respuesta.json().catch(() => ({}));

    if (respuesta.ok && !datos.error) return Response.json(datos);

    const mensaje = String(datos?.error?.message || "");
    const reintentable =
      respuesta.status === 429 ||
      respuesta.status === 529 ||
      /rate limit|too many requests|overloaded/i.test(mensaje);

    if (reintentable && intento < ESPERAS.length) {
      await dormir(ESPERAS[intento]);
      continue;
    }

    return Response.json(
      { error: mensaje || "El servicio de lectura respondió con un error." },
      { status: respuesta.status || 500 }
    );
  }

  return Response.json(
    { error: "El servicio de lectura está saturado. Intenta de nuevo en unos minutos." },
    { status: 503 }
  );
}
