import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

/* Cobro directo en la máquina Point de Mercado Pago.

   Al pagar con Débito o Crédito, en vez de que la vendedora teclee el monto
   de nuevo en la máquina, el sistema le manda una orden por API: el monto
   aparece solo en la pantalla de la máquina, la clienta paga ahí, y Mercado
   Pago avisa el resultado por webhook (ver app/api/mercadopago/webhook).

   La fila en galpon.pago_point recién se crea si Mercado Pago aceptó la
   orden — si algo falla antes (falta configuración, la máquina no existe,
   etc.) no queda ningún rastro a medias en la base. */

export const runtime = "nodejs";

const EXPIRACION_ORDEN = "PT5M"; // 5 minutos: tiempo de sobra para pagar, sin dejar un cobro viejo colgado.

function clienteServicio() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: "galpon" }, auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/* Cualquiera del equipo con sesión activa puede cobrar una venta — no hace
   falta ser administrador, es la misma pantalla de Vender de siempre. */
async function exigirSesion(request) {
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
    .from("perfil").select("id,activo").eq("id", usuario.user.id).maybeSingle();
  if (!perfil?.activo) return { error: "Tu cuenta no está activa.", estado: 403 };
  return { perfil };
}

export async function POST(request) {
  const guardia = await exigirSesion(request);
  if (guardia.error) return Response.json({ error: guardia.error }, { status: guardia.estado });

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    return Response.json({ error: "Falta configurar MERCADOPAGO_ACCESS_TOKEN en el servidor." }, { status: 503 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." }, { status: 503 });
  }

  const { monto, terminalId } = await request.json().catch(() => ({}));
  const montoNum = Number(monto);
  if (!Number.isFinite(montoNum) || montoNum <= 0) {
    return Response.json({ error: "El monto no es válido." }, { status: 400 });
  }
  if (!terminalId || typeof terminalId !== "string") {
    return Response.json({ error: "Falta indicar la máquina Point." }, { status: 400 });
  }

  const referenciaExterna = randomUUID();
  let respuestaMP;
  try {
    respuestaMP = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": referenciaExterna,
      },
      body: JSON.stringify({
        type: "point",
        external_reference: referenciaExterna,
        expiration_time: EXPIRACION_ORDEN,
        transactions: { payments: [{ amount: montoNum.toFixed(2) }] },
        config: {
          point: {
            terminal_id: terminalId,
            // La boleta la imprime el sistema (ver lib/boleta.js) — que la
            // máquina no saque un ticket propio además.
            print_on_terminal: "no_ticket",
          },
        },
      }),
    });
  } catch (e) {
    return Response.json({ error: `No se pudo contactar a Mercado Pago: ${e.message}` }, { status: 502 });
  }

  const datosMP = await respuestaMP.json().catch(() => null);
  if (!respuestaMP.ok) {
    return Response.json(
      { error: datosMP?.message || `Mercado Pago respondió ${respuestaMP.status}` },
      { status: respuestaMP.status }
    );
  }

  const sb = clienteServicio();
  const { data: fila, error } = await sb.from("pago_point").insert({
    terminal_id: terminalId,
    monto: montoNum,
    external_reference: referenciaExterna,
    mp_order_id: datosMP.id,
    estado: "esperando",
    creado_por: guardia.perfil.id,
  }).select("id").single();

  if (error) {
    // La orden ya está en la máquina aunque esto falle — se avisa tal cual,
    // no se le puede decir a la vendedora que no se mandó nada.
    return Response.json(
      { error: `La orden se creó en Mercado Pago pero no se pudo guardar el seguimiento: ${error.message}`, mpOrderId: datosMP.id },
      { status: 500 }
    );
  }

  return Response.json({ id: fila.id, mpOrderId: datosMP.id });
}

/* Cancela un cobro en curso — la vendedora se arrepintió, o se demoró
   demasiado y hay que cortar. Mercado Pago solo deja cancelar una orden
   mientras siga en estado "created" (todavía no se le mostró tarjeta). */
export async function DELETE(request) {
  const guardia = await exigirSesion(request);
  if (guardia.error) return Response.json({ error: guardia.error }, { status: guardia.estado });

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    return Response.json({ error: "Falta configurar MERCADOPAGO_ACCESS_TOKEN en el servidor." }, { status: 503 });
  }

  const { id } = await request.json().catch(() => ({}));
  if (!id) return Response.json({ error: "Falta indicar el cobro." }, { status: 400 });

  const sb = clienteServicio();
  const { data: fila, error: errorLectura } = await sb
    .from("pago_point").select("id,mp_order_id,estado").eq("id", id).maybeSingle();
  if (errorLectura || !fila) return Response.json({ error: "No se encontró ese cobro." }, { status: 404 });

  if (["aprobado", "rechazado", "cancelado", "expirado"].includes(fila.estado)) {
    // Ya terminó de una forma u otra — no hay nada que cancelar.
    return Response.json({ ok: true, estado: fila.estado });
  }

  try {
    const resp = await fetch(`https://api.mercadopago.com/v1/orders/${fila.mp_order_id}/cancel`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok && resp.status !== 404) {
      const datos = await resp.json().catch(() => null);
      // Si la máquina ya está mostrando la tarjeta, Mercado Pago no deja
      // cancelar — se avisa así en vez de fingir que se pudo.
      return Response.json(
        { error: datos?.message || "Mercado Pago no permitió cancelar (puede que ya esté mostrando la tarjeta en la máquina)." },
        { status: resp.status }
      );
    }
  } catch (e) {
    return Response.json({ error: `No se pudo contactar a Mercado Pago: ${e.message}` }, { status: 502 });
  }

  await sb.from("pago_point").update({ estado: "cancelado" }).eq("id", id);
  return Response.json({ ok: true });
}
