import { createClient } from "@supabase/supabase-js";

/* Alta, cambio de contraseña y baja de cuentas del equipo.

   Crear una cuenta o cambiarle la contraseña exige la clave de servicio de
   Supabase, que jamás puede estar en el navegador. Por eso estas tres
   operaciones pasan por aquí, y solo las puede ejecutar un administrador. */

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

/* Comprueba que quien llama tenga sesión y sea administrador de El Galpón. */
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
    return { error: "Solo un administrador puede gestionar las cuentas del equipo.", estado: 403 };
  }
  return { perfil };
}

function correoDe(usuario) {
  return `${String(usuario || "").trim().toLowerCase()}@${DOMINIO}`;
}

export async function POST(request) {
  if (faltaConfiguracion()) {
    return Response.json({ error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." }, { status: 503 });
  }
  const guardia = await exigirAdministrador(request);
  if (guardia.error) return Response.json({ error: guardia.error }, { status: guardia.estado });

  const { nombre, usuario, contrasena, rol } = await request.json();

  if (!nombre?.trim() || !usuario?.trim()) {
    return Response.json({ error: "El nombre y el usuario son obligatorios." }, { status: 400 });
  }
  if (!contrasena || String(contrasena).length < 4) {
    return Response.json({ error: "La contraseña debe tener al menos 4 caracteres." }, { status: 400 });
  }

  const sb = clienteServicio();
  const { data, error } = await sb.auth.admin.createUser({
    email: correoDe(usuario),
    password: String(contrasena),
    email_confirm: true,
    // El trigger galpon.tg_crear_perfil lee estos metadatos para crear el
    // perfil. Sin "app": "galpon" no se crea, que es justamente lo que separa
    // a este sistema de los demás que comparten el mismo Supabase.
    user_metadata: {
      app: "galpon",
      nombre: nombre.trim(),
      usuario: usuario.trim().toLowerCase(),
      rol: rol === "admin" ? "admin" : "vendedor",
    },
  });

  if (error) {
    const yaExiste = /already been registered|already exists/i.test(error.message);
    return Response.json(
      { error: yaExiste ? `El usuario "${usuario}" ya existe.` : error.message },
      { status: yaExiste ? 409 : 500 }
    );
  }

  return Response.json({ id: data.user.id });
}

export async function PATCH(request) {
  if (faltaConfiguracion()) {
    return Response.json({ error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." }, { status: 503 });
  }
  const guardia = await exigirAdministrador(request);
  if (guardia.error) return Response.json({ error: guardia.error }, { status: guardia.estado });

  const { id, contrasena } = await request.json();
  if (!id) return Response.json({ error: "Falta indicar la cuenta." }, { status: 400 });
  if (!contrasena || String(contrasena).length < 4) {
    return Response.json({ error: "La contraseña debe tener al menos 4 caracteres." }, { status: 400 });
  }

  const sb = clienteServicio();
  const { error } = await sb.auth.admin.updateUserById(id, { password: String(contrasena) });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request) {
  if (faltaConfiguracion()) {
    return Response.json({ error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." }, { status: 503 });
  }
  const guardia = await exigirAdministrador(request);
  if (guardia.error) return Response.json({ error: guardia.error }, { status: guardia.estado });

  const { id } = await request.json();
  if (!id) return Response.json({ error: "Falta indicar la cuenta." }, { status: 400 });
  if (id === guardia.perfil.id) {
    return Response.json({ error: "No puedes eliminar tu propia cuenta." }, { status: 400 });
  }

  const sb = clienteServicio();

  // No se borra la cuenta: se desactiva. Sus ventas, turnos y recepciones deben
  // seguir existiendo en el historial con su nombre.
  const { error } = await sb.from("perfil").update({ activo: false }).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Y se le quita el acceso, para que no pueda volver a entrar.
  await sb.auth.admin.updateUserById(id, { ban_duration: "876000h" });

  return Response.json({ ok: true });
}
