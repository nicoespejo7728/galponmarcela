-- =====================================================================
--  EL GALPÓN — Migración 0002: índices, restricciones e integridad activa
-- =====================================================================

-- Búsqueda por infijos en la barra del POS ("leche" encuentra "LECHE ENTERA")
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
--  UNICIDAD
-- ---------------------------------------------------------------------

-- Perfiles: nombre y usuario únicos sin importar mayúsculas ni tildes.
create unique index perfil_nombre_uniq
  on galpon.perfil (upper(btrim(nombre)));
create unique index perfil_usuario_uniq
  on galpon.perfil (lower(btrim(usuario)));

create unique index trabajador_nombre_uniq
  on galpon.trabajador (upper(btrim(nombre)));

create unique index proveedor_nombre_uniq
  on galpon.proveedor (upper(btrim(nombre)));

create unique index categoria_nombre_uniq
  on galpon.categoria (upper(btrim(nombre)));

create unique index producto_codigo_barras_uniq
  on galpon.producto (upper(btrim(codigo_barras)));

-- No puede haber dos productos con el mismo nombre en la misma sección.
create unique index producto_nombre_categoria_uniq
  on galpon.producto (categoria_id, upper(btrim(nombre)))
  where activo;

create unique index venta_numero_boleta_uniq
  on galpon.venta (numero_boleta);

-- Una sola caja abierta por persona a la vez.
create unique index turno_abierto_por_perfil_uniq
  on galpon.turno (perfil_id)
  where estado = 'abierto';

-- Una sola solicitud de precio pendiente por producto.
create unique index aprobacion_precio_pendiente_uniq
  on galpon.aprobacion_precio (producto_id)
  where estado = 'pendiente';

-- Una sola excepción sin resolver por conteo.
create unique index conteo_excepcion_pendiente_uniq
  on galpon.conteo_excepcion (conteo_id)
  where aprobado_at is null;

create unique index factura_pagina_orden_uniq
  on galpon.factura_compra_pagina (factura_id, orden);

-- Número de documento único por proveedor (cuando hay documento).
create unique index factura_documento_proveedor_uniq
  on galpon.factura_compra (proveedor_id, upper(btrim(numero_documento)))
  where numero_documento is not null and proveedor_id is not null;


-- ---------------------------------------------------------------------
--  ÍNDICES DE CONSULTA
--  Uno por cada patrón de acceso real de la aplicación.
-- ---------------------------------------------------------------------

create index producto_categoria_idx      on galpon.producto (categoria_id) where activo;
create index producto_proveedor_idx      on galpon.producto (proveedor_id) where activo;
create index producto_acceso_rapido_idx  on galpon.producto (acceso_rapido) where acceso_rapido and activo;
create index producto_bajo_stock_idx     on galpon.producto (stock) where activo and stock <= stock_minimo;
-- Búsqueda por nombre con acentos e infijos (barra de búsqueda del POS)
create index producto_nombre_trgm_idx    on galpon.producto using gin (nombre extensions.gin_trgm_ops);

create index precio_historial_producto_idx on galpon.producto_precio_historial (producto_id, fecha desc);

create index aprobacion_pendiente_idx    on galpon.aprobacion_precio (estado, solicitado_at desc);

create index venta_fecha_idx             on galpon.venta (fecha desc);
create index venta_vendedor_fecha_idx    on galpon.venta (vendedor_id, fecha desc);
create index venta_turno_idx             on galpon.venta (turno_id);
create index venta_metodo_fecha_idx      on galpon.venta (metodo_pago, fecha desc);

create index venta_detalle_venta_idx     on galpon.venta_detalle (venta_id);
create index venta_detalle_producto_idx  on galpon.venta_detalle (producto_id, id);

create index turno_perfil_idx            on galpon.turno (perfil_id, abierto_at desc);
create index turno_estado_idx            on galpon.turno (estado, abierto_at desc);
create index turno_movimiento_turno_idx  on galpon.turno_movimiento (turno_id, fecha);

create index factura_fecha_idx           on galpon.factura_compra (fecha desc);
create index factura_proveedor_idx       on galpon.factura_compra (proveedor_id, fecha desc);
create index factura_pagina_factura_idx  on galpon.factura_compra_pagina (factura_id);

create index compra_detalle_producto_idx on galpon.compra_detalle (producto_id, fecha desc);
create index compra_detalle_proveedor_idx on galpon.compra_detalle (proveedor_id, fecha desc);
create index compra_detalle_factura_idx  on galpon.compra_detalle (factura_id);

create index movimiento_fecha_idx        on galpon.movimiento (fecha desc);
create index movimiento_categoria_idx    on galpon.movimiento (categoria, fecha desc);
create index movimiento_tipo_fecha_idx   on galpon.movimiento (tipo, fecha desc);
create index movimiento_venta_idx        on galpon.movimiento (venta_id);
create index movimiento_factura_idx      on galpon.movimiento (factura_id);
-- El análisis financiero casi siempre excluye los movimientos históricos
create index movimiento_no_historico_idx on galpon.movimiento (fecha desc) where not historico;

create index merma_producto_idx          on galpon.movimiento_merma (producto_id);
create index sueldo_trabajador_idx       on galpon.movimiento_sueldo (trabajador_id, fecha_pago desc);
create index ajuste_conteo_idx           on galpon.movimiento_ajuste (conteo_id);

create index conteo_asignado_idx         on galpon.conteo (asignado_a, estado, fecha_limite);
create index conteo_estado_fecha_idx     on galpon.conteo (estado, fecha_limite);
create index conteo_detalle_conteo_idx   on galpon.conteo_detalle (conteo_id);

create index transformacion_fecha_idx    on galpon.transformacion (fecha desc);
create index transformacion_insumo_idx   on galpon.transformacion_insumo (transformacion_id);

create index consumo_fecha_idx           on galpon.consumo_interno (fecha desc);
create index consumo_detalle_idx         on galpon.consumo_interno_detalle (consumo_id);

create index kardex_producto_fecha_idx   on galpon.kardex (producto_id, fecha desc);
create index kardex_origen_fecha_idx     on galpon.kardex (origen, fecha desc);
create index kardex_referencia_idx       on galpon.kardex (referencia_id);

create index feedback_autor_idx          on galpon.feedback (autor_id, fecha desc);
create index feedback_estado_idx         on galpon.feedback (estado, fecha desc);


-- ---------------------------------------------------------------------
--  TRIGGERS
-- ---------------------------------------------------------------------

-- 1. Mantener actualizado_at al día
create or replace function galpon.tg_actualizado_at()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_at := now();
  return new;
end;
$$;

create trigger config_negocio_actualizado_at before update on galpon.config_negocio
  for each row execute function galpon.tg_actualizado_at();
create trigger perfil_actualizado_at     before update on galpon.perfil
  for each row execute function galpon.tg_actualizado_at();
create trigger proveedor_actualizado_at  before update on galpon.proveedor
  for each row execute function galpon.tg_actualizado_at();
create trigger producto_actualizado_at   before update on galpon.producto
  for each row execute function galpon.tg_actualizado_at();


-- 2. Nombres de producto y sección siempre en MAYÚSCULAS, sin espacios
--    sobrantes. Antes esto se hacía a mano en cada punto del código y se
--    escapaban casos (el import CSV, por ejemplo).
create or replace function galpon.tg_normalizar_nombre()
returns trigger
language plpgsql
as $$
begin
  new.nombre := upper(btrim(new.nombre));
  return new;
end;
$$;

create trigger producto_nombre_mayusculas  before insert or update on galpon.producto
  for each row execute function galpon.tg_normalizar_nombre();
create trigger categoria_nombre_mayusculas before insert or update on galpon.categoria
  for each row execute function galpon.tg_normalizar_nombre();


-- 3. Código de barras: si viene vacío se genera uno interno con prefijo INT-,
--    igual que hoy, pero sin depender de que la aplicación se acuerde.
create or replace function galpon.tg_codigo_barras_interno()
returns trigger
language plpgsql
as $$
begin
  if new.codigo_barras is null or btrim(new.codigo_barras) = '' then
    new.codigo_barras := 'INT-' || replace(gen_random_uuid()::text, '-', '');
    new.acceso_rapido := true;   -- sin código: se vende desde el catálogo rápido
  else
    new.codigo_barras := btrim(new.codigo_barras);
  end if;
  return new;
end;
$$;

create trigger producto_codigo_interno before insert on galpon.producto
  for each row execute function galpon.tg_codigo_barras_interno();


-- 4. KÁRDEX: cada fila insertada aplica su cantidad al stock del producto
--    de forma atómica y deja registrado el saldo resultante.
--    Esta es la pieza que hace imposible el desalineo entre historial y saldo.
create or replace function galpon.tg_kardex_aplicar()
returns trigger
language plpgsql
as $$
declare
  v_stock numeric(12,3);
begin
  update galpon.producto
     set stock = stock + new.cantidad
   where id = new.producto_id
  returning stock into v_stock;

  if not found then
    raise exception 'Producto % no existe', new.producto_id;
  end if;

  new.stock_resultante := v_stock;
  return new;
end;
$$;

create trigger kardex_aplicar before insert on galpon.kardex
  for each row execute function galpon.tg_kardex_aplicar();

-- El kárdex es un libro: no se corrige, se contra-asienta.
create or replace function galpon.tg_kardex_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'El kárdex es inmutable: registre un movimiento inverso en vez de modificarlo';
end;
$$;

create trigger kardex_sin_update before update or delete on galpon.kardex
  for each row execute function galpon.tg_kardex_inmutable();


-- 5. Historial de precios automático: se registra una fila cada vez que el
--    costo o el precio de un producto cambian de verdad.
create or replace function galpon.tg_registrar_precio()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT'
     or new.precio is distinct from old.precio
     or new.costo  is distinct from old.costo then
    insert into galpon.producto_precio_historial (producto_id, costo, precio)
    values (new.id, new.costo, new.precio);
  end if;
  return null;
end;
$$;

create trigger producto_historial_precio after insert or update on galpon.producto
  for each row execute function galpon.tg_registrar_precio();


-- 6. Piso duro de margen: no se puede fijar un precio de venta por debajo
--    del costo con IVA. Se calcula contra el costo actual y el costo
--    histórico más alto, igual que la regla del sistema actual.
create or replace function galpon.tg_piso_margen()
returns trigger
language plpgsql
as $$
declare
  v_iva          numeric;
  v_costo_maximo numeric;
begin
  if new.precio = 0 or new.costo = 0 then
    return new;   -- producto todavía sin costear
  end if;

  select iva_tasa into v_iva from galpon.config_negocio where id = 1;
  v_iva := coalesce(v_iva, 0.19);

  select greatest(new.costo, coalesce(max(costo), 0))
    into v_costo_maximo
    from galpon.producto_precio_historial
   where producto_id = new.id;

  if new.precio <= round(v_costo_maximo * (1 + v_iva), 2) then
    raise exception
      'El precio % de "%" no cubre el costo con IVA (%). Registre la venta bajo costo de forma explícita.',
      new.precio, new.nombre, round(v_costo_maximo * (1 + v_iva), 2)
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function galpon.tg_piso_margen is
  'Regla de negocio del sistema actual. Se deja SIN activar por defecto para '
  'no bloquear la migración de datos históricos: actívela después de migrar con '
  'CREATE TRIGGER producto_piso_margen BEFORE INSERT OR UPDATE ON galpon.producto '
  'FOR EACH ROW EXECUTE FUNCTION galpon.tg_piso_margen();';


-- 7. Al aprobar un precio se aplica al producto en la misma operación.
create or replace function galpon.tg_aplicar_aprobacion()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'aprobada' and old.estado = 'pendiente' then
    update galpon.producto
       set precio = new.precio_aprobado
     where id = new.producto_id;
  end if;
  return new;
end;
$$;

create trigger aprobacion_aplicar after update on galpon.aprobacion_precio
  for each row execute function galpon.tg_aplicar_aprobacion();


-- 8. Coherencia entre el tipo de movimiento y su tabla de detalle:
--    una merma no puede colgar de un movimiento de categoría 'sueldo'.
create or replace function galpon.tg_validar_detalle_movimiento(
) returns trigger
language plpgsql
as $$
declare
  v_categoria galpon.categoria_movimiento;
  v_esperada  galpon.categoria_movimiento;
begin
  select categoria into v_categoria
    from galpon.movimiento where id = new.movimiento_id;

  v_esperada := case tg_table_name
                  when 'movimiento_merma'  then 'merma'::galpon.categoria_movimiento
                  when 'movimiento_sueldo' then 'sueldo'::galpon.categoria_movimiento
                  when 'movimiento_ajuste' then 'ajuste_inventario'::galpon.categoria_movimiento
                end;

  -- Los sueldos importados del Excel llevan su propia categoría histórica
  if v_categoria <> v_esperada
     and not (tg_table_name = 'movimiento_sueldo'
              and v_categoria = 'sueldo_historico') then
    raise exception 'El movimiento % es de categoría % y no admite detalle de tipo %',
      new.movimiento_id, v_categoria, tg_table_name
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger merma_categoria_valida  before insert or update on galpon.movimiento_merma
  for each row execute function galpon.tg_validar_detalle_movimiento();
create trigger sueldo_categoria_valida before insert or update on galpon.movimiento_sueldo
  for each row execute function galpon.tg_validar_detalle_movimiento();
create trigger ajuste_categoria_valida before insert or update on galpon.movimiento_ajuste
  for each row execute function galpon.tg_validar_detalle_movimiento();
