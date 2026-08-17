-- =====================================================================
--  EL GALPÓN — Migración 0004: seguridad a nivel de fila (RLS)
--
--  Importante: este esquema convive con INTRANET en el mismo proyecto,
--  así que auth.users es compartido. Las políticas exigen que quien
--  consulta tenga un perfil ACTIVO en galpon.perfil — un usuario de
--  INTRANET sin perfil aquí no ve absolutamente nada.
-- =====================================================================

-- ---------------------------------------------------------------------
--  FUNCIONES DE APOYO
-- ---------------------------------------------------------------------

create or replace function galpon.es_miembro()
returns boolean
language sql
stable
security definer
set search_path = galpon, public
as $$
  select exists (
    select 1 from galpon.perfil
    where id = auth.uid() and activo
  );
$$;

create or replace function galpon.es_admin()
returns boolean
language sql
stable
security definer
set search_path = galpon, public
as $$
  select exists (
    select 1 from galpon.perfil
    where id = auth.uid() and activo and rol = 'admin'
  );
$$;

comment on function galpon.es_miembro is
  'Verdadero si quien consulta tiene un perfil activo en El Galpón. Es la '
  'puerta de entrada de todas las políticas.';


-- ---------------------------------------------------------------------
--  ACTIVAR RLS EN TODAS LAS TABLAS
-- ---------------------------------------------------------------------

do $$
declare t record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'galpon'
  loop
    execute format('alter table galpon.%I enable row level security', t.tablename);
    execute format('alter table galpon.%I force row level security', t.tablename);
  end loop;
end $$;


-- ---------------------------------------------------------------------
--  POLÍTICAS
-- ---------------------------------------------------------------------

-- 1. Tablas de solo lectura para todo el equipo, escritura solo admin:
--    configuración, catálogos maestros y calendario.
do $$
declare t text;
begin
  foreach t in array array[
    'config_negocio', 'trabajador', 'proveedor', 'categoria',
    'feriado', 'falta_pan'
  ]
  loop
    execute format(
      'create policy %I on galpon.%I for select to authenticated using (galpon.es_miembro())',
      t || '_lectura', t);
    execute format(
      'create policy %I on galpon.%I for all to authenticated using (galpon.es_admin()) with check (galpon.es_admin())',
      t || '_admin', t);
  end loop;
end $$;


-- 2. Perfiles: cada quien ve a todo el equipo (los nombres se muestran en
--    ventas y turnos), pero solo puede editar el suyo; el admin, todos.
create policy perfil_lectura on galpon.perfil
  for select to authenticated
  using (galpon.es_miembro());

create policy perfil_propio_update on galpon.perfil
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and rol = (select rol from galpon.perfil where id = auth.uid()));

create policy perfil_admin on galpon.perfil
  for all to authenticated
  using (galpon.es_admin())
  with check (galpon.es_admin());

comment on policy perfil_propio_update on galpon.perfil is
  'Un vendedor puede cambiar su nombre, pero no ascenderse a administrador: '
  'el WITH CHECK ancla el rol al que ya tenía.';


-- 3. Catálogo de productos: todo el equipo lee y actualiza stock; solo el
--    admin fija precios (lo hace vía aprobacion_precio o directamente).
create policy producto_lectura on galpon.producto
  for select to authenticated using (galpon.es_miembro());

create policy producto_insert on galpon.producto
  for insert to authenticated with check (galpon.es_miembro());

create policy producto_update on galpon.producto
  for update to authenticated
  using (galpon.es_miembro()) with check (galpon.es_miembro());

create policy producto_delete on galpon.producto
  for delete to authenticated using (galpon.es_admin());

create policy precio_historial_lectura on galpon.producto_precio_historial
  for select to authenticated using (galpon.es_miembro());
create policy precio_historial_insert on galpon.producto_precio_historial
  for insert to authenticated with check (galpon.es_miembro());


-- 4. Aprobaciones de precio: cualquiera solicita, solo el admin resuelve.
create policy aprobacion_lectura on galpon.aprobacion_precio
  for select to authenticated using (galpon.es_miembro());
create policy aprobacion_insert on galpon.aprobacion_precio
  for insert to authenticated
  with check (galpon.es_miembro() and solicitado_por = auth.uid());
create policy aprobacion_resolver on galpon.aprobacion_precio
  for update to authenticated
  using (galpon.es_admin()) with check (galpon.es_admin());


-- 5. Turnos de caja: cada persona opera solo la suya; el admin ve y opera todas.
create policy turno_lectura on galpon.turno
  for select to authenticated
  using (galpon.es_miembro());

create policy turno_abrir on galpon.turno
  for insert to authenticated
  with check (perfil_id = auth.uid() and galpon.es_miembro());

create policy turno_operar on galpon.turno
  for update to authenticated
  using (perfil_id = auth.uid() or galpon.es_admin())
  with check (perfil_id = auth.uid() or galpon.es_admin());

create policy turno_mov_lectura on galpon.turno_movimiento
  for select to authenticated using (galpon.es_miembro());

create policy turno_mov_insert on galpon.turno_movimiento
  for insert to authenticated
  with check (
    galpon.es_miembro()
    and registrado_por = auth.uid()
    and exists (
      select 1 from galpon.turno t
      where t.id = turno_id
        and t.estado = 'abierto'
        and (t.perfil_id = auth.uid() or galpon.es_admin())
    )
  );

comment on policy turno_mov_insert on galpon.turno_movimiento is
  'Solo se puede retirar o reforzar efectivo de una caja abierta y propia. '
  'La regla existía en la interfaz; ahora la garantiza la base.';


-- 6. Ventas: todo el equipo lee (los paneles las necesitan); insertar solo
--    a nombre propio; anular solo el admin.
create policy venta_lectura on galpon.venta
  for select to authenticated using (galpon.es_miembro());
create policy venta_insert on galpon.venta
  for insert to authenticated
  with check (galpon.es_miembro() and vendedor_id = auth.uid());
create policy venta_anular on galpon.venta
  for update to authenticated
  using (galpon.es_admin()) with check (galpon.es_admin());

create policy venta_detalle_lectura on galpon.venta_detalle
  for select to authenticated using (galpon.es_miembro());
create policy venta_detalle_insert on galpon.venta_detalle
  for insert to authenticated
  with check (exists (
    select 1 from galpon.venta v
    where v.id = venta_id and v.vendedor_id = auth.uid()
  ));


-- 7. Compras y recepción: todo el equipo puede recibir mercadería.
do $$
declare t text;
begin
  foreach t in array array[
    'factura_compra', 'factura_compra_pagina', 'compra_detalle'
  ]
  loop
    execute format(
      'create policy %I on galpon.%I for select to authenticated using (galpon.es_miembro())',
      t || '_lectura', t);
    execute format(
      'create policy %I on galpon.%I for insert to authenticated with check (galpon.es_miembro())',
      t || '_insert', t);
    execute format(
      'create policy %I on galpon.%I for update to authenticated using (galpon.es_admin()) with check (galpon.es_admin())',
      t || '_update', t);
    execute format(
      'create policy %I on galpon.%I for delete to authenticated using (galpon.es_admin())',
      t || '_delete', t);
  end loop;
end $$;


-- 8. Libro de caja, conteos, transformaciones, consumo y kárdex:
--    lectura para el equipo, alta para el equipo, corrección solo admin.
do $$
declare t text;
begin
  foreach t in array array[
    'movimiento', 'movimiento_merma', 'movimiento_sueldo', 'movimiento_ajuste',
    'conteo', 'conteo_detalle', 'conteo_excepcion',
    'transformacion', 'transformacion_insumo',
    'consumo_interno', 'consumo_interno_detalle',
    'kardex'
  ]
  loop
    execute format(
      'create policy %I on galpon.%I for select to authenticated using (galpon.es_miembro())',
      t || '_lectura', t);
    execute format(
      'create policy %I on galpon.%I for insert to authenticated with check (galpon.es_miembro())',
      t || '_insert', t);
    execute format(
      'create policy %I on galpon.%I for update to authenticated using (galpon.es_admin()) with check (galpon.es_admin())',
      t || '_update', t);
    execute format(
      'create policy %I on galpon.%I for delete to authenticated using (galpon.es_admin())',
      t || '_delete', t);
  end loop;
end $$;


-- 9. Feedback: el vendedor solo ve y escribe el suyo; el admin ve todo y resuelve.
create policy feedback_lectura on galpon.feedback
  for select to authenticated
  using (galpon.es_admin() or autor_id = auth.uid());

create policy feedback_insert on galpon.feedback
  for insert to authenticated
  with check (galpon.es_miembro() and autor_id = auth.uid());

create policy feedback_resolver on galpon.feedback
  for update to authenticated
  using (galpon.es_admin()) with check (galpon.es_admin());


-- ---------------------------------------------------------------------
--  PERMISOS DE ESQUEMA
-- ---------------------------------------------------------------------

grant usage on schema galpon to authenticated, service_role;
grant select, insert, update, delete on all tables in schema galpon to authenticated;
grant all on all tables in schema galpon to service_role;
grant usage, select on all sequences in schema galpon to authenticated, service_role;
grant execute on all functions in schema galpon to authenticated, service_role;

alter default privileges in schema galpon
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema galpon
  grant usage, select on sequences to authenticated;

-- El rol anónimo no tiene acceso a nada: el POS siempre exige sesión.
revoke all on schema galpon from anon;
