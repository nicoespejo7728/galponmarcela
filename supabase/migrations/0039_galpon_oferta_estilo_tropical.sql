-- =====================================================================
--  EL GALPÓN — Migración 0039: cuarto estilo de cartel, "tropical"
-- =====================================================================
--
-- La migración 0038 dejó galpon.oferta.estilo_imagen limitado a tres
-- valores ('vibrante', 'alerta', 'elegante'). Se agregó un cuarto estilo
-- —"tropical": fondo claro, banners azules, fotos apiladas, pensado para
-- bebidas/helados/ofertas de temporada— así que hay que ampliar esa
-- restricción para que lo acepte.
--
-- Se escribe como una migración aparte (no se edita la 0038) porque esa
-- ya pudo haberse corrido: si todavía no, esto de todos modos deja la
-- columna en el mismo estado final; si ya corrió, esto es lo único que
-- falta. El nombre de la restricción es el que Postgres le pone solo a
-- un "check" sin nombre propio (tabla_columna_check).
-- =====================================================================

alter table galpon.oferta
  drop constraint if exists oferta_estilo_imagen_check;

alter table galpon.oferta
  add constraint oferta_estilo_imagen_check
  check (estilo_imagen in ('vibrante', 'alerta', 'elegante', 'tropical'));

comment on column galpon.oferta.estilo_imagen is
  'Estilo visual elegido para el cartel promocional de esta carpeta: '
  '"vibrante" (morado/rosado, por omisión), "alerta" (amarillo/negro, '
  'liquidaciones), "elegante" (fondo oscuro, dorado, productos premium) o '
  '"tropical" (fondo claro, veraniego, bebidas/helados). El armado real '
  'de la imagen vive en el código (lib/promo-oferta.js).';
