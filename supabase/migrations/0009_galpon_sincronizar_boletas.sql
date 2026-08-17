-- =====================================================================
--  EL GALPÓN — Migración 0009: correlativo de boletas tras una restauración
-- =====================================================================

-- Al restaurar un respaldo, las boletas entran con su número original en vez de
-- pedirlo a la secuencia. Después hay que adelantar la secuencia más allá del
-- último número usado, o la primera venta nueva chocaría contra el índice único.
create or replace function galpon.sincronizar_boletas()
returns integer
language plpgsql
security definer
set search_path = galpon, public
as $$
declare
  v_max integer;
begin
  if not galpon.es_admin() then
    raise exception 'Solo un administrador puede reordenar el correlativo de boletas';
  end if;

  select coalesce(max(numero_boleta), 0) into v_max from galpon.venta;
  perform setval('galpon.boleta_seq', greatest(v_max, 1), v_max > 0);
  return v_max;
end;
$$;

revoke execute on function galpon.sincronizar_boletas() from anon, public;
grant execute on function galpon.sincronizar_boletas() to authenticated, service_role;
