-- =====================================================================
--  EL GALPÓN — Migración 0023: si la venta llevó boleta o no
-- =====================================================================
--
-- En la caja se elige "¿Se emitió boleta? Sí / No" en cada venta, y esa
-- respuesta no se guardaba en ninguna parte: la tabla venta nunca tuvo la
-- columna, así que el dato vivía solo en la memoria del navegador y se
-- perdía al recargar.
--
-- Se notaba en dos lugares. En el historial, el distintivo "sin boleta"
-- solo aparecía en la venta recién hecha y nunca en las de ayer. Y en el
-- resumen para el SII, que junta las ventas con boleta, quedaban fuera
-- todas las ventas en efectivo declaradas — solo entraban las de tarjeta,
-- que se reconocen por la forma de pago.
--
-- La columna queda SIN valor por omisión y las ventas anteriores quedan en
-- nulo a propósito: de esas no se sabe si llevaron boleta, y suponerlo en
-- un sentido o en el otro cambiaría una cifra tributaria por una
-- adivinanza. Nulo significa "no se registró", y el resumen del SII las
-- trata igual que hasta ahora.

alter table galpon.venta
  add column if not exists boleta_emitida boolean;

comment on column galpon.venta.boleta_emitida is
  'Si se emitió boleta por esta venta. Nulo en las ventas anteriores a la '
  'migración 0023, cuando la respuesta no se guardaba: significa "no se '
  'registró", no "no se emitió".';

-- El resumen del SII y el historial filtran por esta columna sobre tramos
-- de fechas, así que se indexan juntas. Parcial: las nulas son el pasado y
-- no se consultan por acá.
create index if not exists venta_boleta_emitida_idx
  on galpon.venta (fecha desc, boleta_emitida)
  where boleta_emitida is not null;
