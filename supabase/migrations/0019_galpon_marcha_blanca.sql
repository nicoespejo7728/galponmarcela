-- =====================================================================
--  EL GALPÓN — Migración 0019: marcha blanca
--
--  Mientras el sistema se pone en marcha, todo el equipo necesita poder
--  corregir cantidades y precios en Inventario: el catálogo viene del
--  Excel y del conteo, y quien encuentra el error es quien está frente a
--  la repisa, no siempre un administrador.
--
--  Es una excepción con fecha de término, no un permiso nuevo. Va como
--  dato y no como constante en el código para poder estirarla o cortarla
--  desde Ajustes, sin esperar un despliegue.
-- =====================================================================

alter table galpon.config_negocio
  add column if not exists marcha_blanca_hasta date;

comment on column galpon.config_negocio.marcha_blanca_hasta is
  'Hasta cuándo los vendedores pueden ajustar stock y precios en Inventario. '
  'Vacío o en el pasado = solo administradores, que es el régimen normal.';

update galpon.config_negocio
set marcha_blanca_hasta = current_date + 7
where id = 1 and marcha_blanca_hasta is null;
