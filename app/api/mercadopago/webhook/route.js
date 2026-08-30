import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";

/* Aviso de Mercado Pago cuando cambia el estado de una orden de Point
   (aprobada, rechazada, cancelada, expirada...). No lo llama el navegador:
   lo llama Mercado Pago directamente, así que no hay sesión de por medio —
   en su lugar se valida la firma (x-signature) contra un secreto que se
   configura en el panel de Mercado Pago (Tus integraciones → la app →
   Webhooks → Configurar notificaciones), para no atender avisos falsos. */

export const runtime = "nodejs";

function clienteServicio() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: "galpon" }, auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/* Arma el mismo "manifiesto" que firmó Mercado Pago y compara en tiempo
   constante — no alcanza con comparar los textos con === porque eso deja
   asomar por cuánto tiempo se tarda en fallar, y con eso se puede adivinar
   la firma letra por letra. */
function firmaValida(request, dataId) {
  const secreto = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secreto) return false; // sin secreto configurado no se puede confiar en ningún aviso

  const cabecera = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  const partes = {};
  for (const trozo of cabecera.split(",")) {
    const [k, v] = trozo.split("=");
    if (k && v) partes[k.trim()] = v.trim();
  }
  const { ts, v1 } = partes;
  if (!ts || !v1 || !dataId) return false;

  const manifiesto = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  const esperado = createHmac("sha256", secreto).update(manifiesto).digest("hex");

  const a = Buffer.from(esperado, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* El "status" de la orden usa las mismas palabras que Mercado Pago manda en
   el aviso (order.processed, order.canceled...). "refunded" y cualquier
   otro que no se contempla acá se dejan sin tocar a propósito: un reembolso
   pasa mucho después de que la venta ya se cerró y esta tabla dejó de
   mirarse — es un caso aparte, no el de "cobrando ahora en el mesón". */
function mapearEstado(estadoMP) {
  switch (estadoMP) {
    case "created": return "esperando";
    case "action_required": return "action_required";
    case "processed": return "aprobado";
    case "failed": return "rechazado";
    case "canceled": return "cancelado";
    case "expired": return "expirado";
    default: return null;
  }
}

export async function POST(request) {
  const url = new URL(request.url);
  const dataId = url.searchParams.get("data.id") || url.searchParams.get("id");

  let cuerpo = null;
  try { cuerpo = await request.json(); } catch { /* algunos avisos llegan sin cuerpo */ }

  if (!firmaValida(request, dataId)) {
    console.error("[mercadopago webhook] firma inválida o MERCADOPAGO_WEBHOOK_SECRET sin configurar");
    return new Response(null, { status: 401 });
  }

  const tipo = url.searchParams.get("type") || cuerpo?.type;
  const idOrden = dataId || cuerpo?.data?.id;
  if (tipo !== "order" || !idOrden) {
    // No es un aviso de orden de Point — se responde 200 igual para que
    // Mercado Pago no lo siga reintentando.
    return new Response(null, { status: 200 });
  }

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    console.error("[mercadopago webhook] falta MERCADOPAGO_ACCESS_TOKEN");
    return new Response(null, { status: 200 });
  }

  // Se pide el estado completo a Mercado Pago en vez de confiar solo en el
  // aviso — es lo que recomienda la documentación, y de paso trae el monto
  // realmente pagado.
  let datosOrden;
  try {
    const resp = await fetch(`https://api.mercadopago.com/v1/orders/${idOrden}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    datosOrden = await resp.json().catch(() => null);
    if (!resp.ok) throw new Error(datosOrden?.message || `Mercado Pago respondió ${resp.status}`);
  } catch (e) {
    console.error("[mercadopago webhook] no se pudo consultar la orden", idOrden, e);
    // Se responde 200 igual: si se reintenta más tarde, la próxima consulta
    // puede correr con la misma suerte que esta, y Mercado Pago reintenta
    // cada 15 minutos durante horas — no hace falta ayudarlo con un 500.
    return new Response(null, { status: 200 });
  }

  const estado = mapearEstado(datosOrden.status);
  if (estado) {
    const montoPagado = datosOrden.transactions?.payments?.[0]?.amount != null
      ? Number(datosOrden.transactions.payments[0].amount) : null;
    const sb = clienteServicio();
    await sb.from("pago_point").update({ estado, monto_pagado: montoPagado }).eq("mp_order_id", idOrden);
  }

  return new Response(null, { status: 200 });
}
