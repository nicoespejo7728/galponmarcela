-- =====================================================================
--  EL GALPÓN — Migración 0011: sección "Pagos y gastos" en Finanzas
--
--  Hasta ahora el libro de caja (galpon.movimiento) distinguía muy pocas
--  categorías manuales: básicamente "General" y poco más. Todo gasto propio
--  del local —arriendo, bencina, gas, insumos de aseo, mantención,
--  impuestos— terminaba cayendo en "General", mezclado entre sí y sin
--  poder separarlo de un pago a un proveedor de mercadería. Esta migración
--  agrega categorías propias para eso, y una tabla para adjuntar boletas o
--  facturas de estos gastos (opcional, nunca obligatorio).
--
--  OJO AL APLICAR: el bloque 1 (ALTER TYPE ... ADD VALUE) debe ejecutarse
--  ANTES y por separado del resto si el editor de SQL de Supabase se queja
--  con algo como "unsafe use of new value of enum type" — Postgres no deja
--  usar un valor de enum recién agregado dentro de la misma transacción en
--  que se agregó. Si el editor corre todo el archivo como una sola
--  transacción y da ese error: selecciona solo el bloque 1, dale Run, y
--  después selecciona el resto del archivo (bloques 2 y 3) y dale Run de
--  nuevo. Si no da error, se puede correr el archivo completo de una vez.
-- =====================================================================


-- 1. Categorías nuevas para gastos del local y pagos a proveedores. Antes de
--    esta migración, elegir cualquiera de estas categorías en la pantalla
--    quedaba guardado como "general" en la base (la traducción cae a ese
--    valor por defecto cuando no reconoce la categoría) — con esto quedan
--    distinguidas de verdad.
alter type galpon.categoria_movimiento add value if not exists 'arriendo';
alter type galpon.categoria_movimiento add value if not exists 'bencina';
alter type galpon.categoria_movimiento add value if not exists 'gas';
alter type galpon.categoria_movimiento add value if not exists 'insumos_aseo';
alter type galpon.categoria_movimiento add value if not exists 'mantencion';
alter type galpon.categoria_movimiento add value if not exists 'impuestos';
alter type galpon.categoria_movimiento add value if not exists 'pago_proveedor';
alter type galpon.categoria_movimiento add value if not exists 'otro_gasto_local';


-- 2. Boletas/facturas adjuntas a un pago o gasto manual. A diferencia de
--    factura_compra_pagina (la foto de la recepción de mercadería, que hoy
--    es obligatoria salvo "entrada libre"), acá adjuntar es SIEMPRE
--    opcional — se puede registrar el gasto sin nada adjunto.
create table galpon.movimiento_documento (
  id             uuid primary key default gen_random_uuid(),
  movimiento_id  uuid not null references galpon.movimiento(id) on delete cascade,
  orden          integer not null default 0,
  storage_path   text not null,
  tipo_mime      text not null,
  nombre_archivo text,
  bytes          integer,
  creado_at      timestamptz not null default now(),

  unique (movimiento_id, orden)
);

comment on table galpon.movimiento_documento is
  'Foto o PDF de la boleta/factura de un gasto o pago registrado a mano en '
  'el libro de caja. Adjuntar es opcional — un movimiento puede no tener '
  'ninguna fila acá. El archivo va al mismo bucket privado que las facturas '
  'de recepción (galpon-facturas), bajo la ruta movimientos/{movimiento_id}/.';


-- 3. Mismo nivel de acceso que el resto del libro de caja: cualquier
--    miembro activo puede ver y adjuntar, solo un admin puede borrar.
alter table galpon.movimiento_documento enable row level security;

create policy movimiento_documento_lectura on galpon.movimiento_documento
  for select to authenticated using (galpon.es_miembro());

create policy movimiento_documento_insert on galpon.movimiento_documento
  for insert to authenticated with check (galpon.es_miembro());

create policy movimiento_documento_delete on galpon.movimiento_documento
  for delete to authenticated using (galpon.es_admin());


-- 4. Nota aparte, no es parte de esta migración (Storage no se versiona acá):
--    si al probar "adjuntar boleta" en un gasto la subida falla con un error
--    de permisos, es porque la política de Storage del bucket galpon-facturas
--    quedó configurada solo para la ruta de facturas de recepción. Hay que
--    revisarla en el Dashboard → Storage → Policies y asegurarse de que
--    también permita subir/leer bajo el prefijo "movimientos/".
