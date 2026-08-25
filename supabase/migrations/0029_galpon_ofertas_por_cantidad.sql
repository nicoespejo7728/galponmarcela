-- =====================================================================
--  EL GALPÓN — Migración 0029: ofertas por cantidad
-- =====================================================================
--
-- "3 jugos de tetrapack por $1.000, solo en efectivo o transferencia" — un
-- producto puede tener uno o varios tramos de cantidad a la vez (por
-- ejemplo 3x$1.000 Y también 6x$1.800), cada uno acotado a los medios de
-- pago con los que corre. El carrito (ver sistema-ventas.jsx) elige sola
-- la combinación de tramos que le sale más barata al cliente para la
-- cantidad que lleva y la forma de pago elegida.
--
-- Solo aplica a productos que se venden por unidad: un tramo "N por $X"
-- no tiene el mismo sentido con productos que se venden por peso.
-- =====================================================================

create table galpon.oferta_cantidad (
  id             uuid primary key default gen_random_uuid(),
  producto_id    uuid not null references galpon.producto(id) on delete cascade,
  cantidad       integer not null check (cantidad >= 2),
  precio_total   numeric(12,2) not null check (precio_total > 0),
  -- Medios de pago con los que corre ESTE tramo. Se listan los permitidos,
  -- no los excluidos: así, si el día de mañana se agrega un medio de pago
  -- nuevo al sistema, no activa de golpe ofertas viejas que nadie pensó
  -- para ese medio. Vacío equivale, en la práctica, a "no corre con nada".
  medios_pago    galpon.metodo_pago[] not null default '{}'::galpon.metodo_pago[],
  activo         boolean not null default true,
  creado_at      timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  constraint oferta_cantidad_producto_cantidad_uniq unique (producto_id, cantidad)
);

comment on table galpon.oferta_cantidad is
  'Ofertas "N unidades por $X" de un mismo producto. Un producto puede '
  'tener varios tramos activos a la vez; el carrito arma sola la '
  'combinación que le sale más barata al cliente.';

comment on column galpon.oferta_cantidad.medios_pago is
  'Medios de pago con los que corre el tramo. Vacío = no corre con '
  'ninguno (equivale a desactivado sin borrar la fila).';

create index oferta_cantidad_producto_idx on galpon.oferta_cantidad (producto_id)
  where activo;

create trigger oferta_cantidad_actualizado_at before update on galpon.oferta_cantidad
  for each row execute function galpon.tg_actualizado_at();

alter table galpon.oferta_cantidad enable row level security;
alter table galpon.oferta_cantidad force row level security;

-- Mismo criterio que el resto del catálogo: todo el equipo lee (lo necesita
-- el POS para cobrar bien), solo un administrador crea, edita o borra
-- tramos — es una decisión de precio, igual que el precio de venta mismo.
create policy oferta_cantidad_lectura on galpon.oferta_cantidad
  for select to authenticated using (galpon.es_miembro());

create policy oferta_cantidad_admin on galpon.oferta_cantidad
  for all to authenticated
  using (galpon.es_admin())
  with check (galpon.es_admin());


-- ---------------------------------------------------------------------
--  Cuánto se descontó por oferta de cantidad en cada línea de boleta
-- ---------------------------------------------------------------------
--
-- precio_unitario y cantidad siguen siendo el precio de lista y la
-- cantidad real (no se tocan, para no distorsionar el margen ni el
-- historial de precios). descuento_cantidad guarda, aparte, cuántos pesos
-- se descontaron en esa línea por una oferta de cantidad. Lo que en
-- definitiva se cobró por la línea es precio_unitario * cantidad -
-- descuento_cantidad.
alter table galpon.venta_detalle
  add column descuento_cantidad numeric(12,2) not null default 0
    check (descuento_cantidad >= 0);

comment on column galpon.venta_detalle.descuento_cantidad is
  'Pesos descontados en esta línea por una oferta de cantidad (ver '
  'galpon.oferta_cantidad). Lo cobrado de verdad es precio_unitario * '
  'cantidad - descuento_cantidad. En 0 para toda venta sin oferta.';
