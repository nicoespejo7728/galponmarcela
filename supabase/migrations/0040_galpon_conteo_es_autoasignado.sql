-- =====================================================================
--  EL GALPÓN — Migración 0040: columna es_autoasignado en galpon.conteo
-- =====================================================================
--
-- Arregla de raíz el aviso de "conteo atrasado" que no desaparecía
-- (reportado por Fran dos veces, oct. 2026).
--
-- La migración/fix anterior (sin número, en operacion.js) agregó
-- "estado.neq.completado" y "completado_at.gte.<hace 3 días>" a la
-- sincronización "reciente" de conteos, pensando que alcanzaba con una
-- ventana de unos días para que el cambio a "completado" viajara a las
-- demás pantallas. No alcanzaba: si el conteo se completó hace MÁS de
-- esos 3 días (exactamente lo que pasó con el caso real de Fran — un
-- conteo de BAZAR completado 22 días tarde), la condición ya nunca
-- calza, ni ese día ni ningún día después. El aviso quedaba pegado para
-- siempre en cualquier pantalla que ya tenía ese conteo cargado como
-- pendiente, sin importar cuánto se esperara.
--
-- La tabla galpon.conteo mezcla dos cosas muy distintas:
--   1) Conteos PROGRAMADOS (una categoría, asignados por un admin a otra
--      persona, para completarse días después) — unos 128 al mes en
--      todo el local (64 categorías × 2 veces al mes).
--   2) Conteos del Inventario General — un producto suelto, contado y
--      completado en el mismo instante por la misma persona que lo
--      cuenta (asignado_a = asignado_por). Son más de mil cada quincena.
-- Por eso la sincronización no puede traer la tabla completa cada 15
-- segundos: el volumen de (2) lo haría demasiado pesado. Pero (1) es
-- justo el caso que puede demorarse semanas en completarse y necesita
-- que el cambio llegue sin fecha de vencimiento.
--
-- Esta columna separa ambos casos para que el código pueda traer SIEMPRE
-- los conteos programados (sin ventana de tiempo — son pocos, nunca van
-- a ser un problema de volumen) y seguir acotando por fecha solo los del
-- Inventario General (que sí son muchos, pero nacen completados y nunca
-- necesitan "viajar" a otra pantalla como pendientes).
-- =====================================================================

alter table galpon.conteo
  add column if not exists es_autoasignado boolean
  generated always as (asignado_a = asignado_por) stored;

comment on column galpon.conteo.es_autoasignado is
  'true cuando quien cuenta y quien asignó el conteo son la misma persona '
  '(el caso del Inventario General, que nace ya completado). false cuando '
  'un admin lo asignó a otra persona (el conteo programado de categoría '
  'completa). Se usa para sincronizar siempre los programados sin '
  'ventana de tiempo, sin tener que traer también los miles del '
  'Inventario General en cada ciclo.';

create index if not exists conteo_es_autoasignado_idx
  on galpon.conteo (es_autoasignado)
  where es_autoasignado = false;
