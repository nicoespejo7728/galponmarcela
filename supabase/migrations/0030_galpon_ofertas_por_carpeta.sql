-- =====================================================================
--  EL GALPÓN — Migración 0030: ofertas agrupadas en "carpetas"
-- =====================================================================
--
-- La migración 0029 enganchaba el tramo "N por $X" a un solo producto. En
-- la práctica una oferta reúne VARIOS productos —distintos sabores, marcas
-- o formatos, cada uno con su propio código de barras— y el cliente puede
-- completar la cantidad mezclando cualquiera de ellos: "3 jugos de
-- tetrapack por $1.000" corre igual si lleva 3 sabores distintos.
--
-- Esta migración reemplaza esa relación directa por una "carpeta"
-- (galpon.oferta) que agrupa productos (galpon.oferta_producto), y a la
-- que ahora cuelgan los tramos (galpon.oferta_tramo, antes oferta_cantidad).
-- La tabla galpon.oferta_cantidad está vacía en producción a esta fecha
-- —la funcionalidad por producto se acababa de habilitar y no llegó a
-- usarse—, así que se reemplaza directo en vez de migrar filas.
-- =====================================================================

drop table galpon.oferta_cantidad;

create table galpon.oferta (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  activo         boolean not null default true,
  creado_at      timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

comment on table galpon.oferta is
  'Una "carpeta" de oferta por cantidad: agrupa productos (galpon.oferta_producto) '
  'que participan de los mismos tramos "N por $X" (galpon.oferta_tramo) sin '
  'importar cuál de ellos completa la cantidad — tres sabores distintos '
  'cuentan igual que tres unidades del mismo.';

create trigger oferta_actualizado_at before update on galpon.oferta
  for each row execute function galpon.tg_actualizado_at();

create table galpon.oferta_producto (
  oferta_id   uuid not null references galpon.oferta(id) on delete cascade,
  producto_id uuid not null references galpon.producto(id) on delete cascade,
  primary key (oferta_id, producto_id),
  -- Un producto participa, como mucho, de una sola carpeta a la vez: evita
  -- la ambigüedad de qué oferta aplicaría si un producto estuviera en dos.
  constraint oferta_producto_producto_uniq unique (producto_id)
);

comment on table galpon.oferta_producto is
  'Qué productos participan de cada carpeta de oferta. Un producto solo '
  'puede estar en una carpeta a la vez.';

create index oferta_producto_oferta_idx on galpon.oferta_producto (oferta_id);

create table galpon.oferta_tramo (
  id             uuid primary key default gen_random_uuid(),
  oferta_id      uuid not null references galpon.oferta(id) on delete cascade,
  cantidad       integer not null check (cantidad >= 2),
  precio_total   numeric(12,2) not null check (precio_total > 0),
  medios_pago    galpon.metodo_pago[] not null default '{}'::galpon.metodo_pago[],
  activo         boolean not null default true,
  creado_at      timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  constraint oferta_tramo_oferta_cantidad_uniq unique (oferta_id, cantidad)
);

comment on table galpon.oferta_tramo is
  'Tramos "N por $X" de una carpeta de oferta (galpon.oferta). Una carpeta '
  'puede tener varios tramos activos a la vez (3x$1.000 y también '
  '6x$1.800); el carrito arma sola la combinación que le sale más barata '
  'al cliente, sumando las unidades de todos los productos de la carpeta '
  'que lleve, sin importar cuáles exactamente.';

comment on column galpon.oferta_tramo.medios_pago is
  'Medios de pago con los que corre el tramo. Vacío = no corre con '
  'ninguno (equivale a desactivado sin borrar la fila).';

create index oferta_tramo_oferta_idx on galpon.oferta_tramo (oferta_id)
  where activo;

create trigger oferta_tramo_actualizado_at before update on galpon.oferta_tramo
  for each row execute function galpon.tg_actualizado_at();

alter table galpon.oferta enable row level security;
alter table galpon.oferta force row level security;
alter table galpon.oferta_producto enable row level security;
alter table galpon.oferta_producto force row level security;
alter table galpon.oferta_tramo enable row level security;
alter table galpon.oferta_tramo force row level security;

-- Mismo criterio que el resto del catálogo: todo el equipo lee (lo
-- necesita el POS para cobrar bien), solo un administrador crea, edita o
-- borra — es una decisión de precio, igual que el precio de venta mismo.
create policy oferta_lectura on galpon.oferta
  for select to authenticated using (galpon.es_miembro());
create policy oferta_admin on galpon.oferta
  for all to authenticated using (galpon.es_admin()) with check (galpon.es_admin());

create policy oferta_producto_lectura on galpon.oferta_producto
  for select to authenticated using (galpon.es_miembro());
create policy oferta_producto_admin on galpon.oferta_producto
  for all to authenticated using (galpon.es_admin()) with check (galpon.es_admin());

create policy oferta_tramo_lectura on galpon.oferta_tramo
  for select to authenticated using (galpon.es_miembro());
create policy oferta_tramo_admin on galpon.oferta_tramo
  for all to authenticated using (galpon.es_admin()) with check (galpon.es_admin());
