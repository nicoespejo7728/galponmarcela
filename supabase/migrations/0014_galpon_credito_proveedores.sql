-- =====================================================================
--  EL GALPÓN — Migración 0014: Pago y crédito con proveedores
-- =====================================================================
--
-- Hasta ahora, recibir mercadería solo restaba caja de inmediato (como
-- "Compra de mercadería"): no importaba si en realidad se pagó al
-- contado o si el proveedor la dejó a crédito para cobrarla después.
-- Esta migración agrega esa distinción en el momento mismo de la
-- recepción, con el mismo diseño que el fiado a clientes (migración
-- 0012), pero en sentido contrario: acá es EL GALPÓN quien debe.
--
--   - Efectivo / Transferencia: la plata sale de caja de inmediato,
--     igual que siempre — el egreso "Compra de mercadería" se registra
--     en el acto.
--   - Crédito con el proveedor: la mercadería entra al stock igual,
--     pero la plata NO sale de caja todavía. Queda anotada como una
--     deuda de EL GALPÓN hacia ese proveedor, en un libro nuevo
--     (galpon.proveedor_movimiento) que es el espejo de
--     galpon.cliente_movimiento: cada fila es un cargo (una recepción
--     a crédito) o un abono (un pago que se le hizo al proveedor). El
--     saldo que se le debe a cada proveedor no se guarda como número
--     aparte — se deriva sumando cargos y restando abonos, igual que
--     el saldo de un cliente fiado.
--
-- "Crédito" acá es un concepto distinto del "Crédito" que ya existe en
-- galpon.metodo_pago (que en el POS significa tarjeta de crédito): por
-- eso se crea un enum aparte, galpon.metodo_pago_proveedor, en vez de
-- reusar el mismo tipo con un significado distinto según el contexto.
--
-- Esta migración no agrega valores a un enum ya existente, así que no
-- aplica el caveat de "unsafe use of new value of enum type" de las
-- migraciones 0011/0012 — se puede aplicar de una sola vez.
-- =====================================================================


-- 1. Forma de pago con la que se recibió cada documento de compra.
create type galpon.metodo_pago_proveedor as enum
  ('efectivo', 'transferencia', 'credito');

alter table galpon.factura_compra
  add column metodo_pago galpon.metodo_pago_proveedor not null default 'efectivo';

comment on column galpon.factura_compra.metodo_pago is
  'Cómo se pagó esta recepción. "credito" es la única que no genera un '
  'egreso de caja en el acto: en cambio abre un cargo en '
  'galpon.proveedor_movimiento (migración 0014). Las recepciones '
  'anteriores a esta migración quedan en "efectivo" por defecto — ya '
  'estaban contabilizadas como egreso inmediato, así que es lo correcto.';


-- 2. El libro de crédito con proveedores — espejo de cliente_movimiento.
create type galpon.tipo_movimiento_proveedor as enum ('cargo', 'abono');

create table galpon.proveedor_movimiento (
  id             uuid primary key default gen_random_uuid(),
  proveedor_id   uuid not null references galpon.proveedor(id) on delete cascade,
  tipo           galpon.tipo_movimiento_proveedor not null,
  monto          numeric(12,2) not null check (monto > 0),
  fecha          timestamptz not null default now(),
  factura_id     uuid references galpon.factura_compra(id) on delete set null,
  metodo_pago    galpon.metodo_pago_proveedor,
  nota           text,
  registrado_por uuid references galpon.perfil(id) on delete set null
);

comment on table galpon.proveedor_movimiento is
  'Cada fila es un cargo (una recepción que se dejó a crédito) o un '
  'abono (un pago que se le hizo al proveedor para bajar la deuda). El '
  'saldo que se le debe a un proveedor es la suma de sus cargos menos '
  'la suma de sus abonos — no vive en ninguna fila propia.';
comment on column galpon.proveedor_movimiento.factura_id is
  'Solo en cargos que nacen de una recepción a crédito. Un abono no '
  'necesariamente paga UNA factura en particular: puede cubrir el saldo '
  'general con ese proveedor, así que esta columna queda vacía en abonos.';
comment on column galpon.proveedor_movimiento.metodo_pago is
  'Solo en abonos: con qué se le pagó al proveedor (efectivo, '
  'transferencia). Nunca puede ser "credito" — eso sería fiar el pago '
  'de un crédito.';

create index proveedor_movimiento_proveedor_idx on galpon.proveedor_movimiento(proveedor_id);


-- 3. Acceso: mismo criterio que factura_compra y cliente_movimiento —
--    todo el equipo lee y registra (cualquiera puede recibir mercadería
--    a crédito o anotar que se le pagó algo a un proveedor); editar o
--    borrar un movimiento ya registrado queda solo para el admin.
alter table galpon.proveedor_movimiento enable row level security;
alter table galpon.proveedor_movimiento force row level security;

create policy proveedor_movimiento_lectura on galpon.proveedor_movimiento
  for select to authenticated using (galpon.es_miembro());
create policy proveedor_movimiento_insert on galpon.proveedor_movimiento
  for insert to authenticated with check (galpon.es_miembro());
create policy proveedor_movimiento_update on galpon.proveedor_movimiento
  for update to authenticated using (galpon.es_admin()) with check (galpon.es_admin());
create policy proveedor_movimiento_delete on galpon.proveedor_movimiento
  for delete to authenticated using (galpon.es_admin());
