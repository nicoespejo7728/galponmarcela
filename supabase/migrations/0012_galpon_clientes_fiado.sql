-- =====================================================================
--  EL GALPÓN — Migración 0012: Fiado (crédito a clientes)
--
--  Agrega la posibilidad de vender "fiado": el cliente se lleva la
--  mercadería ahora y paga después. La venta queda igual que cualquier
--  otra —descuenta stock, aparece en el historial y en Boletas— pero en
--  vez de generar plata en caja de inmediato, queda registrada como una
--  deuda del cliente. Cuando el cliente paga (total o parcialmente), eso
--  sí es plata real entrando a la caja, y ahí se registra el ingreso.
--
--  Piezas nuevas:
--   1. "fiado" como forma de pago del POS (galpon.metodo_pago).
--   2. galpon.cliente: el cliente al que se le puede fiar.
--   3. galpon.venta.cliente_id: a quién quedó debiendo una venta fiada.
--   4. galpon.cliente_movimiento: el libro de esa deuda —cargos (ventas
--      fiadas) y abonos (pagos recibidos)—. El saldo de cada cliente NO
--      se guarda como un número aparte: se deriva sumando cargos y
--      restando abonos, igual que el stock se deriva del kárdex en vez
--      de guardarse como un contador que se puede desincronizar.
--   5. "abono_fiado" como categoría del libro de caja general, para el
--      ingreso que se genera cuando un cliente paga su deuda.
--
--  OJO AL APLICAR: igual que en la migración 0011, si el editor de SQL de
--  Supabase corre todo el archivo como una sola transacción y se queja con
--  "unsafe use of new value of enum type", hay que correr primero el
--  bloque 1 (los dos ALTER TYPE) solo, con su propio Run, y recién después
--  seleccionar el resto del archivo y darle Run de nuevo. Este archivo no
--  inserta ninguna fila que use los valores nuevos, así que lo más probable
--  es que corra completo sin problema — pero se deja la salida igual por
--  si acaso.
-- =====================================================================


-- 1. Valores nuevos de enum.
alter type galpon.metodo_pago add value if not exists 'fiado';
alter type galpon.categoria_movimiento add value if not exists 'abono_fiado';


-- 2. Clientes a los que se les puede fiar.
create table galpon.cliente (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  telefono        text,
  direccion       text,
  notas           text,
  limite_credito  numeric(12,2) check (limite_credito is null or limite_credito >= 0),
  activo          boolean not null default true,
  creado_at       timestamptz not null default now(),
  actualizado_at  timestamptz not null default now()
);

comment on table galpon.cliente is
  'Clientes habituales a los que se les puede vender fiado. El saldo que '
  'debe cada uno no se guarda acá: se deriva de galpon.cliente_movimiento.';
comment on column galpon.cliente.limite_credito is
  'Tope de deuda sugerido para este cliente. Nulo = sin tope definido. '
  'Es solo una alerta para quien vende en el POS, no un bloqueo duro: el '
  'vendedor puede igual completar la venta si lo supera.';


-- 3. La venta necesita saber a quién se le fió, cuando corresponda.
alter table galpon.venta
  add column cliente_id uuid references galpon.cliente(id) on delete set null;

comment on column galpon.venta.cliente_id is
  'Solo se llena cuando metodo_pago = fiado: el cliente que quedó '
  'debiendo esta venta.';


-- 4. El libro de fiado.
create type galpon.tipo_movimiento_cliente as enum ('cargo', 'abono');

create table galpon.cliente_movimiento (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references galpon.cliente(id) on delete cascade,
  tipo           galpon.tipo_movimiento_cliente not null,
  monto          numeric(12,2) not null check (monto > 0),
  fecha          timestamptz not null default now(),
  venta_id       uuid references galpon.venta(id) on delete set null,
  metodo_pago    galpon.metodo_pago,
  nota           text,
  registrado_por uuid references galpon.perfil(id) on delete set null
);

comment on table galpon.cliente_movimiento is
  'Cada fila es un cargo (una venta que se fio) o un abono (un pago que '
  'el cliente hizo para bajar su deuda). El saldo actual de un cliente es '
  'la suma de sus cargos menos la suma de sus abonos.';
comment on column galpon.cliente_movimiento.venta_id is
  'Solo en cargos que nacen de una venta fiada en el POS. Un abono no '
  'apunta a una venta en particular: puede cubrir una o varias.';
comment on column galpon.cliente_movimiento.metodo_pago is
  'Solo en abonos: con qué pagó el cliente (efectivo, transferencia…). '
  'Nunca puede ser "fiado" — eso sería fiar el pago de un fiado.';

create index cliente_movimiento_cliente_idx on galpon.cliente_movimiento(cliente_id);


-- 5. Acceso: mismo criterio que proveedores y libro de caja — todo el
--    equipo lee, y como el fiado se registra desde el POS (cualquier
--    vendedor puede fiar una venta o anotar un cliente nuevo), el alta
--    también es para todo el equipo. Editar datos del cliente (por
--    ejemplo, su límite de crédito) o borrar quedan solo para el admin.
alter table galpon.cliente enable row level security;
alter table galpon.cliente_movimiento enable row level security;

create policy cliente_lectura on galpon.cliente
  for select to authenticated using (galpon.es_miembro());
create policy cliente_insert on galpon.cliente
  for insert to authenticated with check (galpon.es_miembro());
create policy cliente_update on galpon.cliente
  for update to authenticated using (galpon.es_admin()) with check (galpon.es_admin());
create policy cliente_delete on galpon.cliente
  for delete to authenticated using (galpon.es_admin());

create policy cliente_movimiento_lectura on galpon.cliente_movimiento
  for select to authenticated using (galpon.es_miembro());
create policy cliente_movimiento_insert on galpon.cliente_movimiento
  for insert to authenticated with check (galpon.es_miembro());
create policy cliente_movimiento_update on galpon.cliente_movimiento
  for update to authenticated using (galpon.es_admin()) with check (galpon.es_admin());
create policy cliente_movimiento_delete on galpon.cliente_movimiento
  for delete to authenticated using (galpon.es_admin());
