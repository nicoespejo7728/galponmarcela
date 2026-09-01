-- =====================================================================
--  EL GALPÓN — Migración 0037: aceptar a propósito una baja de precio
--  con stock del precio anterior (flexibiliza la migración 0021)
-- =====================================================================
--
-- La regla del precio anterior (ver unitsStillAtOldPrice en el POS) sigue
-- cobrando el precio viejo mientras cree que queda stock comprado a ese
-- precio, para no vender perdiendo margen sin darse cuenta. Es correcta
-- casi siempre, pero a veces quien recibe la mercadería SABE que el
-- precio bajó de verdad —el proveedor avisó una rebaja permanente, por
-- ejemplo— y prefiere vender de inmediato al precio nuevo todo lo que hay
-- en la repisa, aunque eso signifique perder margen en esas unidades. La
-- regla no tiene forma de distinguir eso de una simple corrección, y
-- hasta ahora la única salida era una limpieza manual en la base (ver las
-- aguas Benedictino, 1-sep-2026).
--
-- Esta migración deja un camino normal para esa excepción: la fila de
-- historial que registra la baja de precio se puede marcar como "sin
-- protección", y findLastPriceDrop() (en el POS) la salta al buscar la
-- última baja que proteger — sigue buscando más atrás por si hay una
-- baja anterior sin confirmar. La marca nunca la pone la persona a mano:
-- la pone el sistema, justo después de que quien recibe confirma en
-- pantalla que está consciente de la pérdida (ver ReceivingView).

alter table galpon.producto_precio_historial
  add column if not exists omite_proteccion_anterior boolean not null default false;

comment on column galpon.producto_precio_historial.omite_proteccion_anterior is
  'true cuando quien registró esta baja de precio confirmó a propósito que '
  'acepta vender el stock del precio anterior al precio nuevo — '
  'findLastPriceDrop() la salta y no protege esas unidades. La pone el '
  'sistema (galpon.marcar_precio_sin_proteccion), nunca se escribe a mano.';

-- El gatillo que registra el historial (migración 0002, tg_registrar_precio)
-- inserta la fila automáticamente en cuanto cambia precio o costo del
-- producto, sin que el cliente pueda mandar columnas propias en ese mismo
-- insert. Por eso la marca se pone aparte, en un segundo paso, sobre la
-- fila que el gatillo acaba de crear — la más reciente de ese producto.
create or replace function galpon.marcar_precio_sin_proteccion(p_producto_id uuid)
returns void
language plpgsql
security definer
set search_path = galpon, public
as $$
begin
  if not galpon.es_admin() then
    raise exception 'Solo un administrador puede aceptar una baja de precio sin la protección del precio anterior';
  end if;

  update galpon.producto_precio_historial
  set omite_proteccion_anterior = true
  where producto_id = p_producto_id
    and fecha = (
      select max(fecha) from galpon.producto_precio_historial where producto_id = p_producto_id
    );
end;
$$;

comment on function galpon.marcar_precio_sin_proteccion(uuid) is
  'Marca la última fila de historial de precio de un producto como '
  'confirmada por quien recibió o corrigió el precio: la regla del precio '
  'anterior deja de protegerla. Se llama justo después de guardar un '
  'precio nuevo, nunca antes. Solo administradores.';

revoke execute on function galpon.marcar_precio_sin_proteccion(uuid) from anon;
grant execute on function galpon.marcar_precio_sin_proteccion(uuid) to authenticated, service_role;
