-- =====================================================================
--  EL GALPÓN — Migración 0041: stock ilimitado (servicios) + impresiones
-- =====================================================================
--
-- El negocio empezó a vender impresiones (fotocopias/impresión de hojas),
-- que no son un producto con unidades que se puedan agotar: no tiene
-- sentido llevarles stock, ni bloquear la venta por "falta de stock", ni
-- avisar que están "bajo el mínimo" o "sin stock hace meses". Esta columna
-- marca ese tipo de producto para que el resto del sistema (el carrito, el
-- kárdex, los avisos de stock bajo y de stock parado en Análisis e
-- Inventario) lo trate como lo que es: algo que nunca se agota.
--
-- Pensada para cualquier servicio futuro parecido (laminado, encuadernado,
-- etc.), no solo para impresiones.
-- =====================================================================

alter table galpon.producto
  add column if not exists stock_ilimitado boolean not null default false;

comment on column galpon.producto.stock_ilimitado is
  'true para productos/servicios que no llevan stock de verdad (ej. '
  'impresiones): la venta nunca se bloquea por falta de stock, el kárdex '
  'no les descuenta nada, y los avisos de stock bajo o stock parado los '
  'ignoran.';

-- --- Carpeta nueva para agruparlos ---
with cat as (
  insert into galpon.categoria (nombre, orden)
  values ('Impresiones', (select coalesce(max(orden), 0) + 1 from galpon.categoria))
  returning id
)
-- --- Los 6 tipos de impresión que se venden en el mesón ---
-- El nombre arranca con "Impresión" a propósito: así basta escribir
-- "impresion" en el buscador de Vender para que aparezcan los seis.
insert into galpon.producto (codigo_barras, nombre, categoria_id, precio, costo, stock, stock_minimo, tipo_unidad, stock_ilimitado)
select
  'INT-' || (extract(epoch from now()) * 1000)::bigint::text || '-' || v.n,
  v.nombre, cat.id, v.precio, 0, 0, 0, 'unidad', true
from cat, (values
  (1, 'Impresión página carta blanco y negro', 300),
  (2, 'Impresión página oficio blanco y negro', 350),
  (3, 'Impresión 1/2 página carta color', 350),
  (4, 'Impresión página carta color', 500),
  (5, 'Impresión 1/2 página oficio color', 400),
  (6, 'Impresión página oficio color', 600)
) as v(n, nombre, precio);
