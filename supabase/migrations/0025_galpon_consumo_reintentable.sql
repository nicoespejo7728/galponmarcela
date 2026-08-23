-- =====================================================================
--  EL GALPÓN — Migración 0025: consumo interno reintentable
-- =====================================================================
--
-- El consumo interno también se registra en el mesón, con la persona
-- esperando, y también tiene que poder anotarse con la conexión caída y
-- subirse después. Para eso hace falta una cosa: que subirlo dos veces no
-- lo duplique.
--
-- Hasta ahora el identificador lo generaba la base, así que un reintento
-- —la conexión se cortó justo después de escribir, y el navegador no
-- alcanzó a enterarse— creaba un segundo consumo idéntico y descontaba el
-- stock de nuevo. Ahora el identificador puede venir del navegador: si ya
-- existe, la función no hace nada y devuelve el mismo, en vez de repetirlo.
--
-- Es la misma idea que ya usa la venta, donde el id de la boleta lo pone
-- el navegador justamente para poder reintentar sin miedo.

-- La versión de tres argumentos se elimina: con las dos conviviendo,
-- PostgREST no sabe cuál llamar cuando le llegan tres y responde con un
-- error de función ambigua.
drop function if exists galpon.registrar_consumo_interno(uuid, text, jsonb);

create or replace function galpon.registrar_consumo_interno(
  p_perfil uuid, p_motivo text, p_items jsonb, p_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = galpon, public
as $$
declare
  v_id uuid;
  v_nombre text;
  v_total numeric := 0;
  it jsonb;
  v_stock numeric;
begin
  if not galpon.es_miembro() then
    raise exception 'Necesitas una sesión activa para registrar un consumo';
  end if;

  -- Si ya está, no se hace nada. Este es todo el punto de la migración: que
  -- reintentar una subida que sí había llegado no descuente el stock dos
  -- veces. Sin esto, un corte de red en el peor momento se paga en
  -- inventario, y nadie se entera hasta el conteo.
  if p_id is not null then
    select id into v_id from galpon.consumo_interno where id = p_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  select nombre into v_nombre from galpon.perfil where id = p_perfil and activo;
  if v_nombre is null then
    raise exception 'Esa persona no tiene una cuenta activa en el sistema';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay productos que registrar';
  end if;

  insert into galpon.consumo_interno (id, responsable_id, responsable, motivo, costo_total)
  values (coalesce(p_id, gen_random_uuid()), p_perfil, v_nombre,
          nullif(btrim(coalesce(p_motivo, '')), ''), 0)
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    insert into galpon.consumo_interno_detalle
      (consumo_id, producto_id, nombre_producto, cantidad, costo_unitario, precio_unitario, tipo_unidad)
    values (
      v_id,
      (it->>'producto_id')::uuid,
      it->>'nombre',
      (it->>'cantidad')::numeric,
      coalesce((it->>'costo')::numeric, 0),
      coalesce((it->>'precio')::numeric, 0),
      coalesce((it->>'tipo_unidad')::galpon.tipo_unidad, 'unidad')
    );

    update galpon.producto
    set stock = greatest(0, stock - (it->>'cantidad')::numeric)
    where id = (it->>'producto_id')::uuid
    returning stock into v_stock;

    insert into galpon.kardex
      (producto_id, origen, cantidad, stock_resultante, costo_unitario, referencia_id, registrado_por, nota)
    values (
      (it->>'producto_id')::uuid, 'consumo_interno',
      -((it->>'cantidad')::numeric), coalesce(v_stock, 0),
      coalesce((it->>'costo')::numeric, 0), v_id, p_perfil,
      'Consumo interno de ' || v_nombre
    );

    v_total := v_total + coalesce((it->>'costo')::numeric, 0) * (it->>'cantidad')::numeric;
  end loop;

  update galpon.consumo_interno set costo_total = v_total where id = v_id;
  return v_id;
end;
$$;

comment on function galpon.registrar_consumo_interno(uuid, text, jsonb, uuid) is
  'Registra un consumo interno a nombre de un perfil: cabecera, detalle, '
  'descuento de stock y kárdex, todo en una transacción. Con p_id se puede '
  'reintentar sin duplicar, que es lo que permite anotarlo sin conexión y '
  'subirlo después.';

grant execute on function galpon.registrar_consumo_interno(uuid, text, jsonb, uuid)
  to authenticated, service_role;
revoke execute on function galpon.registrar_consumo_interno(uuid, text, jsonb, uuid) from anon;
