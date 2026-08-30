-- =====================================================================
--  EL GALPÓN — Migración 0035: cobro directo a la máquina Point
-- =====================================================================
--
-- Al pagar con Débito o Crédito, el sistema le manda el monto a la máquina
-- Point de Mercado Pago (en vez de que la vendedora lo teclee dos veces) y
-- espera a que confirme el pago antes de cerrar la venta. Esta tabla es el
-- puente entre esos dos momentos: la crea y la actualiza el servidor (ver
-- app/api/mercadopago/cobrar y app/api/mercadopago/webhook), y la pantalla
-- de Vender la va mirando mientras espera.
--
-- No tiene referencia a galpon.venta a propósito: la orden se crea ANTES de
-- que la venta exista (la venta recién se registra si Mercado Pago confirma
-- el pago), así que en el momento de crear esta fila todavía no hay venta a
-- la cual apuntar.
-- =====================================================================

create table galpon.pago_point (
  id                 uuid primary key default gen_random_uuid(),
  terminal_id        text not null,
  monto              numeric(12,2) not null,
  monto_pagado       numeric(12,2),
  external_reference text not null,
  mp_order_id        text,
  -- creado: recién se mandó a la máquina. esperando: la máquina la recibió
  -- (o todavía no hay noticia). action_required: la máquina pide confirmar
  -- algo (ej. elegir cuotas). aprobado / rechazado / cancelado / expirado:
  -- estados finales — ver app/api/mercadopago/webhook.
  estado             text not null default 'creado'
                       check (estado in ('creado','esperando','action_required',
                                          'aprobado','rechazado','cancelado','expirado')),
  creado_por         uuid references galpon.perfil(id) on delete set null,
  creado_at          timestamptz not null default now(),
  actualizado_at     timestamptz not null default now(),

  constraint pago_point_external_reference_uniq unique (external_reference)
);

comment on table galpon.pago_point is
  'Seguimiento de un cobro empujado a una máquina Point de Mercado Pago, '
  'desde que se crea la orden hasta que se confirma o falla. La venta '
  '(galpon.venta) recién se registra si el estado termina en aprobado.';

create index pago_point_mp_order_id_idx on galpon.pago_point(mp_order_id);

create trigger pago_point_actualizado_at before update on galpon.pago_point
  for each row execute function galpon.tg_actualizado_at();

alter table galpon.pago_point enable row level security;
alter table galpon.pago_point force row level security;

-- Todo el equipo puede ver el estado de un cobro (para esperarlo en
-- pantalla). Crear y actualizar filas lo hace siempre el servidor con la
-- clave de servicio (ver las rutas de mercadopago), que no pasa por RLS —
-- así que de "authenticated" solo hace falta permitir la lectura, más el
-- comodín de administrador por si hiciera falta corregir algo a mano.
create policy pago_point_lectura on galpon.pago_point
  for select to authenticated using (galpon.es_miembro());
create policy pago_point_admin on galpon.pago_point
  for all to authenticated using (galpon.es_admin()) with check (galpon.es_admin());
