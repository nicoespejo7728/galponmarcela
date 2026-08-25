-- =====================================================================
--  EL GALPÓN — Migración 0031: liquidaciones de precio por producto
-- =====================================================================
--
-- Distinto de la oferta por cantidad (galpon.oferta, migración 0030): acá
-- no hay tramos ni se juntan varios productos — es un producto puntual al
-- que se le baja el precio de venta por un tiempo, para darle salida a
-- stock que no se está moviendo. Un producto puede tener como mucho una
-- liquidación activa a la vez.
--
-- La única regla dura del precio es que no puede quedar bajo el costo (se
-- vendería perdiendo plata de verdad, no solo con poco margen); por eso el
-- precio se guarda tal cual lo escribe el administrador y es la pantalla
-- la que avisa si quedó bajo el costo del producto — la base no lo
-- rechaza, porque el costo cambia con cada recepción y no vale la pena
-- duplicar esa comparación en un trigger.
-- =====================================================================

create table galpon.liquidacion (
  id                 uuid primary key default gen_random_uuid(),
  producto_id        uuid not null references galpon.producto(id) on delete cascade,
  precio_liquidacion numeric(12,2) not null check (precio_liquidacion > 0),
  fecha_fin          date,
  activo             boolean not null default true,
  creado_at          timestamptz not null default now(),
  actualizado_at     timestamptz not null default now()
);

comment on table galpon.liquidacion is
  'Precio rebajado puntual de un producto ("liquidación"), para darle '
  'salida a stock estancado. A diferencia de galpon.oferta, no tiene '
  'tramos de cantidad ni agrupa productos: es un precio de venta '
  'temporal para uno solo. fecha_fin es opcional — sin ella, queda '
  'activa hasta que un administrador la desactive a mano.';

comment on column galpon.liquidacion.fecha_fin is
  'Día en que deja de aplicarse, inclusive. Nula = sin fecha de término, '
  'se desactiva a mano desde "Ofertas".';

-- Como mucho una liquidación activa por producto a la vez — evita la
-- ambigüedad de qué precio corresponde si hubiera dos vigentes.
create unique index liquidacion_producto_activa_uniq
  on galpon.liquidacion (producto_id) where activo;

create index liquidacion_producto_idx on galpon.liquidacion (producto_id);

create trigger liquidacion_actualizado_at before update on galpon.liquidacion
  for each row execute function galpon.tg_actualizado_at();

alter table galpon.liquidacion enable row level security;
alter table galpon.liquidacion force row level security;

-- Mismo criterio que el resto del catálogo y que galpon.oferta: todo el
-- equipo lee (lo necesita el POS para cobrar bien), solo un administrador
-- crea, edita o desactiva.
create policy liquidacion_lectura on galpon.liquidacion
  for select to authenticated using (galpon.es_miembro());
create policy liquidacion_admin on galpon.liquidacion
  for all to authenticated using (galpon.es_admin()) with check (galpon.es_admin());
