-- =====================================================================
--  EL GALPÓN — Migración 0018: unificar categorías en la base
--
--  Estaba hecho desde el navegador en dos pasos —mover los productos y
--  después desactivar la categoría— y cuando algo fallaba a mitad de
--  camino no había forma de saber qué: la pantalla mostraba un aviso
--  genérico y los productos podían quedar movidos con la categoría
--  todavía activa.
--
--  Va como una sola función, igual que la de productos: o pasa todo o no
--  pasa nada, y el error dice qué fue.
-- =====================================================================

create or replace function galpon.unificar_categorias(p_destino uuid, p_origenes uuid[])
returns table (movidos integer, desactivadas integer)
language plpgsql
security definer
set search_path = galpon, public
as $$
declare
  v_movidos integer := 0;
  v_desactivadas integer := 0;
begin
  if not galpon.es_admin() then
    raise exception 'Solo un administrador puede unificar categorías';
  end if;
  if p_destino is null then
    raise exception 'Falta indicar cuál categoría se conserva';
  end if;
  if not exists (select 1 from galpon.categoria where id = p_destino and activa) then
    raise exception 'La categoría que se conserva no existe o está desactivada';
  end if;

  with movidos as (
    update galpon.producto
    set categoria_id = p_destino
    where categoria_id = any(p_origenes) and categoria_id <> p_destino
    returning id
  )
  select count(*) into v_movidos from movidos;

  with apagadas as (
    update galpon.categoria
    set activa = false
    where id = any(p_origenes) and id <> p_destino and activa
    returning id
  )
  select count(*) into v_desactivadas from apagadas;

  return query select v_movidos, v_desactivadas;
end;
$$;

comment on function galpon.unificar_categorias(uuid, uuid[]) is
  'Une categorías: mueve los productos a la que se conserva y desactiva las demás, '
  'en una sola transacción. Solo administradores.';

revoke execute on function galpon.unificar_categorias(uuid, uuid[]) from anon;
grant execute on function galpon.unificar_categorias(uuid, uuid[]) to authenticated, service_role;
