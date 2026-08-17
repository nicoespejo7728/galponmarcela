-- =====================================================================
--  EL GALPÓN — Migración 0003: vistas de negocio y operaciones atómicas
--
--  Todo lo que hoy se calcula recorriendo arrays completos en el navegador
--  pasa a resolverse en la base, que es donde están los datos.
-- =====================================================================

-- ---------------------------------------------------------------------
--  VISTAS
-- ---------------------------------------------------------------------

-- Estado comercial de cada producto: margen, valor inmovilizado y rotación.
create or replace view galpon.v_producto_estado as
select
  p.id,
  p.codigo_barras,
  p.nombre,
  c.nombre                              as categoria,
  pr.nombre                             as proveedor,
  p.precio,
  p.costo,
  p.stock,
  p.stock_minimo,
  p.tipo_unidad,
  p.acceso_rapido,
  (p.stock <= p.stock_minimo)           as bajo_minimo,
  round(p.stock * p.costo, 2)           as valor_inmovilizado,
  case when p.precio > 0
       then round((p.precio - p.costo * (1 + coalesce(cfg.iva_tasa, 0.19)))
                  / p.precio, 4)
  end                                   as margen,
  v.ultima_venta,
  case when v.ultima_venta is not null
       then (current_date - v.ultima_venta::date)
  end                                   as dias_sin_venta,
  coalesce(v.unidades_vendidas, 0)      as unidades_vendidas,
  coalesce(v.ingresos, 0)               as ingresos_historicos,
  coalesce(v.utilidad, 0)               as utilidad_historica
from galpon.producto p
left join galpon.categoria  c   on c.id  = p.categoria_id
left join galpon.proveedor  pr  on pr.id = p.proveedor_id
cross join lateral (select iva_tasa from galpon.config_negocio where id = 1) cfg
left join lateral (
  select
    max(ve.fecha)                                        as ultima_venta,
    sum(vd.cantidad)                                     as unidades_vendidas,
    sum(vd.subtotal)                                     as ingresos,
    sum(vd.subtotal - vd.cantidad * vd.costo_unitario)   as utilidad
  from galpon.venta_detalle vd
  join galpon.venta ve on ve.id = vd.venta_id and not ve.anulada
  where vd.producto_id = p.id
) v on true
where p.activo;

comment on view galpon.v_producto_estado is
  'Reemplaza los cálculos de margen, valor inmovilizado y días sin venta que '
  'hoy se hacen en el navegador recorriendo todo el registro de ventas.';


-- Resumen de cada turno de caja, con los totales vivos si sigue abierto
-- y el snapshot congelado si ya se cerró.
create or replace view galpon.v_turno_resumen as
select
  t.id,
  t.estado,
  pa.nombre                             as abierto_por,
  t.abierto_at,
  pc.nombre                             as cerrado_por,
  t.cerrado_at,
  t.monto_apertura,
  coalesce(t.ventas_total,   vv.total)      as ventas_total,
  coalesce(t.ventas_cantidad, vv.cantidad)  as ventas_cantidad,
  coalesce(t.ventas_efectivo, vv.efectivo)  as ventas_efectivo,
  coalesce(t.retiros_total,   mv.retiros)   as retiros_total,
  coalesce(t.refuerzos_total, mv.refuerzos) as refuerzos_total,
  coalesce(
    t.efectivo_esperado,
    t.monto_apertura + coalesce(vv.efectivo, 0)
      + coalesce(mv.refuerzos, 0) - coalesce(mv.retiros, 0)
  )                                     as efectivo_esperado,
  t.efectivo_contado,
  t.diferencia
from galpon.turno t
join galpon.perfil pa on pa.id = t.perfil_id
left join galpon.perfil pc on pc.id = t.cerrado_por
left join lateral (
  select
    count(*)                                                        as cantidad,
    sum(v.total)                                                    as total,
    sum(v.total) filter (where v.metodo_pago = 'efectivo')          as efectivo
  from galpon.venta v
  where v.turno_id = t.id and not v.anulada
) vv on true
left join lateral (
  select
    sum(monto) filter (where tipo = 'retiro')   as retiros,
    sum(monto) filter (where tipo = 'refuerzo') as refuerzos
  from galpon.turno_movimiento tm
  where tm.turno_id = t.id
) mv on true;


-- Comportamiento por proveedor: cuánto se le compra y qué margen deja.
create or replace view galpon.v_proveedor_resumen as
select
  pr.id,
  pr.nombre,
  pr.categoria,
  pr.rut,
  pr.contacto_nombre,
  pr.telefono,
  coalesce(c.facturas, 0)          as facturas,
  coalesce(c.total_neto, 0)        as total_comprado_neto,
  c.ultima_compra,
  coalesce(pd.productos, 0)        as productos_vinculados
from galpon.proveedor pr
left join lateral (
  select count(*) as facturas, sum(f.total_neto) as total_neto, max(f.fecha) as ultima_compra
  from galpon.factura_compra f where f.proveedor_id = pr.id
) c on true
left join lateral (
  select count(*) as productos
  from galpon.producto p where p.proveedor_id = pr.id and p.activo
) pd on true;


-- Libro de caja consolidado, con el detalle específico de cada tipo
-- resuelto en una sola consulta.
create or replace view galpon.v_libro_caja as
select
  m.id,
  m.fecha,
  m.tipo,
  m.categoria,
  m.concepto,
  m.monto,
  case when m.tipo = 'ingreso' then m.monto else -m.monto end as monto_con_signo,
  m.automatico,
  m.historico,
  p.nombre                as registrado_por,
  v.numero_boleta,
  prov.nombre             as proveedor,
  mm.nombre_producto      as merma_producto,
  mm.cantidad             as merma_cantidad,
  mm.motivo               as merma_motivo,
  ms.nombre_trabajador    as sueldo_trabajador,
  ms.fecha_pago           as sueldo_fecha_pago
from galpon.movimiento m
left join galpon.perfil            p    on p.id    = m.registrado_por
left join galpon.venta             v    on v.id    = m.venta_id
left join galpon.proveedor         prov on prov.id = m.proveedor_id
left join galpon.movimiento_merma  mm   on mm.movimiento_id = m.id
left join galpon.movimiento_sueldo ms   on ms.movimiento_id = m.id;


-- Ventas por día y método de pago: la base del panel de análisis.
create or replace view galpon.v_ventas_diarias as
select
  (v.fecha at time zone 'America/Santiago')::date  as dia,
  count(*)                                          as boletas,
  sum(v.total)                                      as total,
  sum(v.total) filter (where v.metodo_pago = 'efectivo')      as efectivo,
  sum(v.total) filter (where v.metodo_pago = 'debito')        as debito,
  sum(v.total) filter (where v.metodo_pago = 'credito')       as credito,
  sum(v.total) filter (where v.metodo_pago = 'transferencia') as transferencia,
  sum(d.utilidad)                                   as utilidad
from galpon.venta v
left join lateral (
  select sum(vd.subtotal - vd.cantidad * vd.costo_unitario) as utilidad
  from galpon.venta_detalle vd where vd.venta_id = v.id
) d on true
where not v.anulada
group by 1;

comment on view galpon.v_ventas_diarias is
  'Agrupa por día en hora de Chile. El sistema actual agrupa con la fecha '
  'local del navegador sobre timestamps UTC, lo que corre las ventas de la '
  'noche al día siguiente.';


-- ---------------------------------------------------------------------
--  OPERACIONES ATÓMICAS
-- ---------------------------------------------------------------------

-- Registrar una venta completa en una sola transacción: valida stock,
-- inserta la boleta y su detalle, mueve el kárdex y asienta la caja.
--
-- Resuelve el problema de concurrencia actual: hoy dos cajas vendiendo el
-- mismo producto a la vez pueden dejar el stock en negativo, porque la
-- validación se hace en el navegador y no se vuelve a revisar al cobrar.
create or replace function galpon.registrar_venta(
  p_items        jsonb,             -- [{producto_id, cantidad}]
  p_metodo_pago  galpon.metodo_pago,
  p_turno_id     uuid default null,
  p_permitir_sin_stock boolean default false
) returns galpon.venta
language plpgsql
security definer
set search_path = galpon, public, extensions
as $$
declare
  v_venta   galpon.venta;
  v_perfil  uuid := auth.uid();
  v_item    jsonb;
  v_prod    galpon.producto;
  v_cant    numeric(12,3);
  v_total   numeric(14,2) := 0;
  v_turno   uuid := p_turno_id;
begin
  if v_perfil is null then
    raise exception 'Sesión no válida';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;

  -- Si no se indicó turno, se toma la caja abierta de quien vende.
  if v_turno is null then
    select id into v_turno
      from galpon.turno
     where perfil_id = v_perfil and estado = 'abierto';
  end if;

  insert into galpon.venta (vendedor_id, turno_id, metodo_pago, total)
  values (v_perfil, v_turno, p_metodo_pago, 0)
  returning * into v_venta;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cant := (v_item->>'cantidad')::numeric;

    if v_cant <= 0 then
      raise exception 'Cantidad inválida: %', v_cant;
    end if;

    -- FOR UPDATE serializa a las cajas que tocan el mismo producto.
    select * into v_prod
      from galpon.producto
     where id = (v_item->>'producto_id')::uuid
       for update;

    if not found then
      raise exception 'Producto % no existe', v_item->>'producto_id';
    end if;

    if v_prod.stock < v_cant and not p_permitir_sin_stock then
      raise exception 'Stock insuficiente de "%": quedan %, se intentan vender %',
        v_prod.nombre, v_prod.stock, v_cant
        using errcode = 'check_violation';
    end if;

    insert into galpon.venta_detalle (
      venta_id, producto_id, nombre_producto, codigo_barras,
      cantidad, precio_unitario, costo_unitario, tipo_unidad)
    values (
      v_venta.id, v_prod.id, v_prod.nombre, v_prod.codigo_barras,
      v_cant, v_prod.precio, v_prod.costo, v_prod.tipo_unidad);

    insert into galpon.kardex (
      producto_id, origen, cantidad, costo_unitario,
      referencia_id, registrado_por)
    values (
      v_prod.id, 'venta', -v_cant, v_prod.costo, v_venta.id, v_perfil);

    v_total := v_total + round(v_cant * v_prod.precio, 2);
  end loop;

  update galpon.venta set total = v_total where id = v_venta.id
  returning * into v_venta;

  insert into galpon.movimiento (
    tipo, categoria, concepto, monto, automatico, registrado_por, venta_id)
  values (
    'ingreso', 'venta',
    'Boleta N° ' || v_venta.numero_boleta,
    v_total, true, v_perfil, v_venta.id);

  return v_venta;
end;
$$;

comment on function galpon.registrar_venta is
  'Venta completa en una transacción: valida stock con bloqueo de fila, crea '
  'boleta, detalle, kárdex y movimiento de caja. Es el único camino correcto '
  'para vender.';


-- Cerrar un turno: calcula el arqueo y congela el snapshot.
create or replace function galpon.cerrar_turno(
  p_turno_id         uuid,
  p_efectivo_contado numeric
) returns galpon.turno
language plpgsql
security definer
set search_path = galpon, public
as $$
declare
  v_turno galpon.turno;
  v_ef numeric := 0; v_de numeric := 0; v_cr numeric := 0; v_tr numeric := 0;
  v_cant integer := 0;
  v_ret numeric := 0; v_ref numeric := 0;
begin
  select * into v_turno from galpon.turno where id = p_turno_id for update;
  if not found then
    raise exception 'El turno no existe';
  end if;
  if v_turno.estado = 'cerrado' then
    raise exception 'El turno ya estaba cerrado';
  end if;

  select
    coalesce(sum(total) filter (where metodo_pago = 'efectivo'), 0),
    coalesce(sum(total) filter (where metodo_pago = 'debito'), 0),
    coalesce(sum(total) filter (where metodo_pago = 'credito'), 0),
    coalesce(sum(total) filter (where metodo_pago = 'transferencia'), 0),
    count(*)
  into v_ef, v_de, v_cr, v_tr, v_cant
  from galpon.venta
  where turno_id = p_turno_id and not anulada;

  select
    coalesce(sum(monto) filter (where tipo = 'retiro'), 0),
    coalesce(sum(monto) filter (where tipo = 'refuerzo'), 0)
  into v_ret, v_ref
  from galpon.turno_movimiento where turno_id = p_turno_id;

  update galpon.turno set
    estado               = 'cerrado',
    cerrado_por          = auth.uid(),
    cerrado_at           = now(),
    efectivo_contado     = p_efectivo_contado,
    ventas_efectivo      = v_ef,
    ventas_debito        = v_de,
    ventas_credito       = v_cr,
    ventas_transferencia = v_tr,
    ventas_total         = v_ef + v_de + v_cr + v_tr,
    ventas_cantidad      = v_cant,
    retiros_total        = v_ret,
    refuerzos_total      = v_ref,
    efectivo_esperado    = v_turno.monto_apertura + v_ef + v_ref - v_ret
  where id = p_turno_id
  returning * into v_turno;

  return v_turno;
end;
$$;


-- Completar un conteo: iguala el stock a lo contado y genera un movimiento
-- de ajuste por cada diferencia, valorizado al costo del producto.
create or replace function galpon.completar_conteo(p_conteo_id uuid)
returns galpon.conteo
language plpgsql
security definer
set search_path = galpon, public
as $$
declare
  v_conteo galpon.conteo;
  v_det    record;
  v_mov    uuid;
  v_perfil uuid := auth.uid();
begin
  select * into v_conteo from galpon.conteo where id = p_conteo_id for update;
  if not found then
    raise exception 'El conteo no existe';
  end if;
  if v_conteo.estado = 'completado' then
    raise exception 'El conteo ya estaba completado';
  end if;

  for v_det in
    select cd.*, p.costo
      from galpon.conteo_detalle cd
      join galpon.producto p on p.id = cd.producto_id
     where cd.conteo_id = p_conteo_id and cd.diferencia <> 0
  loop
    insert into galpon.kardex (
      producto_id, origen, cantidad, costo_unitario, referencia_id, registrado_por, nota)
    values (
      v_det.producto_id, 'conteo', v_det.diferencia, v_det.costo,
      p_conteo_id, v_perfil, 'Ajuste por conteo de inventario');

    insert into galpon.movimiento (
      tipo, categoria, concepto, monto, automatico, registrado_por)
    values (
      case when v_det.diferencia > 0 then 'ingreso' else 'egreso' end,
      'ajuste_inventario',
      'Ajuste de inventario: ' || v_det.nombre_producto,
      round(abs(v_det.diferencia) * v_det.costo, 2),
      true, v_perfil)
    returning id into v_mov;

    insert into galpon.movimiento_ajuste (movimiento_id, conteo_id, producto_id, diferencia)
    values (v_mov, p_conteo_id, v_det.producto_id, v_det.diferencia);
  end loop;

  update galpon.conteo
     set estado = 'completado', completado_at = now(), completado_por = v_perfil
   where id = p_conteo_id
  returning * into v_conteo;

  return v_conteo;
end;
$$;
