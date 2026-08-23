-- =====================================================================
--  EL GALPÓN — Migración 0016: unificar productos duplicados
--
--  El inventario general del 22-23/08 dejó el mismo producto partido en
--  dos: la cámara del teléfono leyó mal algunos códigos y se creó un
--  registro nuevo con el stock, mientras el original —el que lee la
--  pistola— quedó en cero.
--
--  Unir eso a mano son cuatro pasos (mover stock, dejar rastro en el
--  kárdex, poner el duplicado en cero, desactivarlo) y basta con que uno
--  se repita para que el saldo quede al doble. Por eso va como una sola
--  función: o pasa todo, o no pasa nada.
-- =====================================================================

create or replace function galpon.unificar_productos(p_destino uuid, p_origenes uuid[])
returns table (movidos numeric, desactivados integer)
language plpgsql
security definer
set search_path = galpon, public
as $$
declare
  r record;
  v_total numeric := 0;
  v_cuantos integer := 0;
  v_stock_destino numeric;
begin
  if not galpon.es_admin() then
    raise exception 'Solo un administrador puede unificar productos';
  end if;
  if p_destino is null then
    raise exception 'Falta indicar cuál producto se conserva';
  end if;
  if not exists (select 1 from galpon.producto where id = p_destino and activo) then
    raise exception 'El producto que se conserva no existe o está desactivado';
  end if;

  select stock into v_stock_destino from galpon.producto where id = p_destino for update;

  for r in
    select id, stock from galpon.producto
    where id = any(p_origenes) and id <> p_destino and activo
    for update
  loop
    if r.stock <> 0 then
      insert into galpon.kardex (producto_id, origen, cantidad, stock_resultante, registrado_por, nota)
      values (r.id, 'ajuste_manual', -r.stock, 0, auth.uid(),
              'Unificación: el stock pasa al producto que se conserva');

      v_stock_destino := v_stock_destino + r.stock;

      insert into galpon.kardex (producto_id, origen, cantidad, stock_resultante, registrado_por, nota)
      values (p_destino, 'ajuste_manual', r.stock, v_stock_destino, auth.uid(),
              'Unificación: stock recibido de un duplicado');

      v_total := v_total + r.stock;
    end if;

    update galpon.producto set stock = 0, activo = false where id = r.id;
    v_cuantos := v_cuantos + 1;
  end loop;

  update galpon.producto set stock = v_stock_destino where id = p_destino;

  return query select v_total, v_cuantos;
end;
$$;

comment on function galpon.unificar_productos(uuid, uuid[]) is
  'Une productos duplicados en uno solo: mueve el stock al que se conserva, lo deja '
  'anotado en el kárdex y desactiva los demás. Todo en una transacción, para que un '
  'reintento no sume el saldo dos veces. Solo administradores.';

revoke execute on function galpon.unificar_productos(uuid, uuid[]) from anon;
grant execute on function galpon.unificar_productos(uuid, uuid[]) to authenticated, service_role;
