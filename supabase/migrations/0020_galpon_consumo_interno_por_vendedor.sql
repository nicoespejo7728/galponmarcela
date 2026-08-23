-- =====================================================================
--  EL GALPÓN — Migración 0020: consumo interno a nombre del vendedor
-- =====================================================================
--
-- Hasta ahora el consumo interno pedía tres cosas en el mesón —quién
-- retira (escrito a mano), el motivo, y el PIN de un administrador— y
-- después no quedaba en ninguna parte donde revisarlo: se escribía un
-- movimiento de egreso y se imprimía un comprobante, nada más. En la
-- práctica el vendedor tenía que ir a buscar a un administrador para
-- llevarse una colación.
--
-- Se da vuelta el orden. El vendedor registra su propio consumo con SU
-- PIN de vendedor (migración 0013), que es lo que ya usa antes de cada
-- venta, y eso queda guardado a nombre de su perfil. Después, en el panel
-- de administración, se revisa lo acumulado por persona y se marca lo que
-- ya se descontó del sueldo.
--
-- Las tablas consumo_interno y consumo_interno_detalle existían desde la
-- 0001 pero nunca se habían usado. Acá se les agrega el estado de "ya
-- descontado" y se escribe la función que las llena de una sola vez.

alter table galpon.consumo_interno
  add column if not exists descontado_at timestamptz,
  add column if not exists descontado_por uuid references galpon.perfil(id);

comment on column galpon.consumo_interno.descontado_at is
  'Cuándo un administrador marcó este consumo como ya descontado a la '
  'persona. Nulo mientras esté pendiente de descuento.';

-- El panel de administración solo mira lo pendiente, agrupado por persona
-- y de lo más nuevo a lo más viejo. El índice parcial deja fuera todo lo
-- ya saldado, que es lo que va a crecer sin parar.
create index if not exists consumo_interno_pendiente_idx
  on galpon.consumo_interno (responsable_id, fecha desc)
  where descontado_at is null;

-- Registra el consumo completo en una sola transacción: cabecera, detalle,
-- descuento de stock y una línea de kárdex por producto. Que sea una sola
-- transacción importa: si se hiciera desde el navegador en varios pasos, un
-- corte a medio camino dejaría el stock descontado sin el consumo que lo
-- explique, o al revés. Ya pasó con la unificación de productos (stock
-- duplicado en 12 productos) y por eso estas cosas viven acá adentro.
--
-- El perfil llega desde galpon.identificar_por_pin(): el navegador nunca ve
-- los hashes de PIN, solo pregunta de quién es el PIN y pasa el id.
create or replace function galpon.registrar_consumo_interno(
  p_perfil uuid, p_motivo text, p_items jsonb)
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

  select nombre into v_nombre from galpon.perfil where id = p_perfil and activo;
  if v_nombre is null then
    raise exception 'Esa persona no tiene una cuenta activa en el sistema';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay productos que registrar';
  end if;

  insert into galpon.consumo_interno (responsable_id, responsable, motivo, costo_total)
  values (p_perfil, v_nombre, nullif(btrim(coalesce(p_motivo, '')), ''), 0)
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

    -- greatest(0, …) por lo mismo de siempre: el stock de un producto que
    -- se vendió sin estar bien contado puede quedar en negativo, y un stock
    -- negativo confunde más de lo que informa.
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

comment on function galpon.registrar_consumo_interno(uuid, text, jsonb) is
  'Registra un consumo interno a nombre de un perfil: cabecera, detalle, '
  'descuento de stock y kárdex, todo en una transacción. La llama cualquier '
  'miembro activo — el vendedor se identifica con su PIN, no necesita a un '
  'administrador al lado.';

-- El descuento al sueldo se hace fuera del sistema (en la liquidación), así
-- que acá solo se anota que ya se hizo, para que deje de aparecer entre lo
-- pendiente. No se borra nada: el historial queda.
create or replace function galpon.marcar_consumos_descontados(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = galpon, public
as $$
declare v_cuantos integer;
begin
  if not galpon.es_admin() then
    raise exception 'Solo un administrador puede marcar consumos como descontados';
  end if;

  with marcados as (
    update galpon.consumo_interno
    set descontado_at = now(), descontado_por = auth.uid()
    where id = any(p_ids) and descontado_at is null
    returning id
  )
  select count(*) into v_cuantos from marcados;

  return v_cuantos;
end;
$$;

comment on function galpon.marcar_consumos_descontados(uuid[]) is
  'Marca consumos como ya descontados a la persona. Admin-only. Idempotente: '
  'ignora los que ya estaban marcados y devuelve cuántos cambió de verdad.';

grant execute on function galpon.registrar_consumo_interno(uuid, text, jsonb)
  to authenticated, service_role;
grant execute on function galpon.marcar_consumos_descontados(uuid[])
  to authenticated, service_role;

revoke execute on function galpon.registrar_consumo_interno(uuid, text, jsonb) from anon;
revoke execute on function galpon.marcar_consumos_descontados(uuid[]) from anon;
