-- =====================================================================
--  EL GALPÓN — Migración 0033: grupos de productos (venta unificada)
-- =====================================================================
--
-- Caso real: varias jamonadas de distintas marcas y proveedores, cada una
-- con su propio costo, se COMPRAN y RECIBEN por separado (cada marca es su
-- propia fila en galpon.producto, con su propio proveedor) pero se VENDEN
-- todas como un solo producto — "Jamonada tradicional" — a un solo precio,
-- sin que el cliente ni el vendedor tengan que saber de qué marca salió.
--
-- galpon.producto_grupo es ese "producto unificado": nombre y precio de
-- venta propios, y una lista de miembros (galpon.producto_grupo_miembro)
-- que son productos reales del catálogo. Igual que una carpeta de oferta
-- (migración 0030), un producto pertenece como mucho a un grupo a la vez.
--
-- La resolución de CUÁL marca se descuenta al vender el grupo (orden
-- aproximado "el que se recibió hace más tiempo primero", completando con
-- la siguiente si una se acaba a medio pesaje) y el costo promedio para
-- margen viven en la aplicación, no acá: no se necesita tabla nueva para
-- eso, se calculan con lo que ya hay en galpon.producto en cada venta.
-- =====================================================================

create table galpon.producto_grupo (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  precio         numeric(12,2) not null check (precio >= 0),
  tipo_unidad    galpon.tipo_unidad not null default 'peso',
  activo         boolean not null default true,
  creado_at      timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

comment on table galpon.producto_grupo is
  'Un "producto unificado": agrupa varios productos reales (distintas marcas '
  'o proveedores) que se venden todos bajo un solo nombre y a un solo precio, '
  'aunque se reciban y cuesten distinto cada uno por separado.';

create trigger producto_grupo_actualizado_at before update on galpon.producto_grupo
  for each row execute function galpon.tg_actualizado_at();

create table galpon.producto_grupo_miembro (
  grupo_id    uuid not null references galpon.producto_grupo(id) on delete cascade,
  producto_id uuid not null references galpon.producto(id) on delete cascade,
  primary key (grupo_id, producto_id),
  -- Un producto participa, como mucho, de un solo grupo a la vez — mismo
  -- criterio que oferta_producto_producto_uniq en la migración 0030.
  constraint producto_grupo_miembro_producto_uniq unique (producto_id)
);

comment on table galpon.producto_grupo_miembro is
  'Qué productos reales componen cada grupo de venta unificada. Un producto '
  'solo puede estar en un grupo a la vez.';

create index producto_grupo_miembro_grupo_idx on galpon.producto_grupo_miembro (grupo_id);

alter table galpon.producto_grupo enable row level security;
alter table galpon.producto_grupo force row level security;
alter table galpon.producto_grupo_miembro enable row level security;
alter table galpon.producto_grupo_miembro force row level security;

-- Mismo criterio que el resto del catálogo: todo el equipo lee (lo necesita
-- el POS para vender), solo un administrador crea, edita o borra grupos.
create policy producto_grupo_lectura on galpon.producto_grupo
  for select to authenticated using (galpon.es_miembro());
create policy producto_grupo_admin on galpon.producto_grupo
  for all to authenticated using (galpon.es_admin()) with check (galpon.es_admin());

create policy producto_grupo_miembro_lectura on galpon.producto_grupo_miembro
  for select to authenticated using (galpon.es_miembro());
create policy producto_grupo_miembro_admin on galpon.producto_grupo_miembro
  for all to authenticated using (galpon.es_admin()) with check (galpon.es_admin());
