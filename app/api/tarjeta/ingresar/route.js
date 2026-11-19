import { createClient } from "@supabase/supabase-js";

/* Entrar a la cuenta completa (usuario y contraseña) con solo la tarjeta
   NFC — migración 0044, a pedido de Fran.

   Por qué esto necesita un endpoint de servidor y no una función RPC
   normal: abrir una sesión real de Supabase Auth sin pedir contraseña
   exige la clave de servicio, que jamás puede estar en el navegador (ver
   también app/api/usuarios, que ya usa esta misma clave para crear y
   cambiar cuentas). Este endpoint corre ANTES de que exista ninguna
   sesión — es justo lo que reemplaza a la pantalla de usuario/contraseña
   — así que, a diferencia de app/api/usuarios, no exige tener una sesión
   para llamarlo: lo único que hace falta es la tarjeta.

   Dos pasos en una sola ruta:
   1) Se manda solo { uid }. Si la tarjeta es de un administrador, no se
      abre la sesión todavía — se responde { requierePin: true, nombre,
      rol } para que la pantalla muestre "Eres [nombre]" y pida su PIN. Si
      es de un vendedor, se abre la sesión de una.
   2) Se manda { uid, pin }. Se comprueba que el PIN sea el de ESA persona
      (galpon.verificar_pin_de_perfil, migración 0044 — no el de "algún
      administrador" como autorizar_con_pin) y, si calza, se abre la
      sesión.

   "Abrir la sesión" quiere decir: generar un enlace de acceso sin
   contraseña (auth.admin.generateLink, tipo magiclink) y devolver el
   token al navegador — nunca se manda ningún correo de verdad, el dominio
   @elgalpon.local no es una casilla real. El navegador usa ese token con
   auth.verifyOtp() para terminar de abrir su propia sesión, exactamente
   como si hubiera escrito usuario y contraseña (mismo resultado que
   signInWithPassword, visto desde el resto del sistema). */

export const runtime = "nodejs";

const DOMINIO = "elgalpon.local";

function faltaConfiguracion() {
  return (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function clienteServicio() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: "galpon" }, auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// Mismo criterio que galpon.normalizar_tarjeta() (migración 0043): sin esto
// "04:a2:24:cb" y "04A224CB" no calzarían como la misma tarjeta. El UID ya
// se guarda normalizado (asignar_tarjeta_perfil lo normaliza antes de
// guardar), así que comparar así contra la columna alcanza, sin necesidad
// de llamar a la función de la base para esto.
function normalizarTarjeta(uid) {
  const limpio = String(uid || "").toUpperCase().replace(/[^0-9A-Za-z]/g, "");
  return limpio || null;
}

export async function POST(request) {
  if (faltaConfiguracion()) {
    return Response.json({ error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const uidNormalizado = normalizarTarjeta(body?.uid);
  if (!uidNormalizado) {
    return Response.json({ error: "Tarjeta no reconocida." }, { status: 400 });
  }
  const pin = body?.pin != null ? String(body.pin).trim() : "";

  const sb = clienteServicio();

  // Migración 0045: la tarjeta ya no vive en una columna de "perfil" (que
  // solo alcanzaba para una), sino en "perfil_tarjeta" — cada perfil puede
  // tener hasta dos (principal/respaldo), cualquiera de las dos abre lo
  // mismo. Primero se busca a quién pertenece esta tarjeta, después se
  // trae su perfil.
  const { data: tarjeta, error: errorTarjeta } = await sb
    .from("perfil_tarjeta")
    .select("perfil_id")
    .eq("tarjeta_uid", uidNormalizado)
    .maybeSingle();

  if (errorTarjeta) {
    return Response.json({ error: errorTarjeta.message }, { status: 500 });
  }

  const { data: perfil, error: errorPerfil } = tarjeta
    ? await sb
        .from("perfil")
        .select("id,nombre,usuario,rol,activo")
        .eq("id", tarjeta.perfil_id)
        .maybeSingle()
    : { data: null, error: null };

  if (errorPerfil) {
    return Response.json({ error: errorPerfil.message }, { status: 500 });
  }
  if (!perfil || !perfil.activo) {
    return Response.json(
      { error: "Esta tarjeta no está asignada a ninguna cuenta activa — pide a un administrador que te la asigne desde Usuarios." },
      { status: 404 }
    );
  }

  // Las cuentas de administrador abren todo el sistema (Ajustes, reportes,
  // Usuarios, etc.), no solo una acción puntual — por eso Fran pidió este
  // paso extra solo para ellas. Un vendedor pasa directo.
  if (perfil.rol === "admin") {
    if (!pin) {
      return Response.json({ requierePin: true, nombre: perfil.nombre, rol: perfil.rol });
    }
    const { data: pinValido, error: errorPin } = await sb.rpc("verificar_pin_de_perfil", {
      p_perfil_id: perfil.id,
      p_pin: pin,
    });
    if (errorPin) {
      return Response.json({ error: errorPin.message }, { status: 500 });
    }
    if (!pinValido) {
      return Response.json(
        { requierePin: true, nombre: perfil.nombre, rol: perfil.rol, error: "PIN incorrecto — inténtalo de nuevo." },
        { status: 401 }
      );
    }
  }

  const email = `${perfil.usuario}@${DOMINIO}`;
  const { data: enlace, error: errorEnlace } = await sb.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (errorEnlace) {
    return Response.json({ error: errorEnlace.message }, { status: 500 });
  }

  const tokenHash = enlace?.properties?.hashed_token;
  if (!tokenHash) {
    return Response.json(
      { error: "No se pudo generar el acceso con la tarjeta — intenta de nuevo o entra con tu usuario y contraseña." },
      { status: 500 }
    );
  }

  return Response.json({ email, tokenHash, nombre: perfil.nombre, rol: perfil.rol });
}
