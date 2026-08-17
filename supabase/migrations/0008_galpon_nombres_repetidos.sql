-- =====================================================================
--  EL GALPÓN — Migración 0008: nombres repetidos dentro de una sección
-- =====================================================================

-- El catálogo real tiene 63 casos de productos distintos que comparten nombre
-- dentro de la misma sección: cinco "LADY SPEED STICK" con códigos de barras
-- diferentes, dos "PAPAS", dos "LECHUGA COSTINA". Son variantes reales del
-- mismo artículo, no errores de carga.
--
-- La unicidad de nombre por sección fue una suposición al diseñar el esquema, y
-- los datos la desmienten. Lo que identifica de verdad a un producto es su
-- código de barras, que sí es único y no tiene un solo duplicado en las 4.772
-- filas del catálogo.
drop index if exists galpon.producto_nombre_categoria_uniq;

comment on column galpon.producto.nombre is
  'Puede repetirse dentro de una sección: el negocio tiene variantes distintas '
  'del mismo artículo con el mismo nombre. Lo que identifica al producto es el '
  'código de barras.';
