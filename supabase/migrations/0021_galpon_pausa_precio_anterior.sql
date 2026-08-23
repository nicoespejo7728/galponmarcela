-- =====================================================================
--  EL GALPÓN — Migración 0021: pausa de la regla del precio anterior
-- =====================================================================
--
-- La regla del precio anterior existe para el stock que se compró caro y
-- sigue en la repisa: mientras quede de ese, se cobra al precio de antes.
-- Es correcta en régimen normal, pero durante la marcha blanca se equivoca
-- una y otra vez, porque los precios y el stock se están corrigiendo a
-- mano y la regla no tiene cómo distinguir una corrección de una baja
-- real. Ya pasó con el pan, con las verduras y con las zanahorias: se
-- baja el precio y la caja sigue cobrando el viejo.
--
-- En vez de ir agregando excepciones de a una —cada una descubierta
-- cobrándole de más a un cliente— se apaga la regla completa mientras
-- dure la puesta en marcha. Vuelve sola, sin que nadie tenga que
-- acordarse de encenderla.

alter table galpon.config_negocio
  add column if not exists precio_anterior_pausa_hasta date;

comment on column galpon.config_negocio.precio_anterior_pausa_hasta is
  'Hasta cuándo queda apagada la regla del precio anterior (se cobra '
  'siempre el precio actual). Vacío o en el pasado = la regla vuelve a '
  'aplicarse, que es el régimen normal.';

update galpon.config_negocio
set precio_anterior_pausa_hasta = current_date + 7
where id = 1 and precio_anterior_pausa_hasta is null;
