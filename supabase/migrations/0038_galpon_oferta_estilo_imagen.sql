-- =====================================================================
--  EL GALPÓN — Migración 0038: estilo del cartel de la oferta
-- =====================================================================
--
-- Hasta ahora la imagen promocional de una oferta (galpon.oferta_imagen,
-- migración 0034) se armaba siempre con el mismo diseño. Ahora hay tres
-- para elegir por carpeta — "vibrante" (morado/rosado, para cualquier
-- producto), "alerta" (franjas amarillo/negro, para liquidaciones) y
-- "elegante" (fondo oscuro y letras doradas, para productos premium) — y
-- quien administra elige cuál usar al crear o editar la oferta (no hay un
-- estilo único para todo el negocio). Esta migración solo guarda cuál
-- quedó elegida; el armado (canvas) sigue viviendo en el código.
--
-- Va en galpon.oferta (no en oferta_imagen): el estilo elegido tiene que
-- sobrevivir aunque la imagen se quite y se vuelva a generar más tarde.
-- =====================================================================

alter table galpon.oferta
  add column if not exists estilo_imagen text not null default 'vibrante'
  check (estilo_imagen in ('vibrante', 'alerta', 'elegante'));

comment on column galpon.oferta.estilo_imagen is
  'Estilo visual elegido para el cartel promocional de esta carpeta: '
  '"vibrante" (morado/rosado, por omisión), "alerta" (amarillo/negro, '
  'liquidaciones) o "elegante" (fondo oscuro, dorado, productos premium). '
  'El armado real de la imagen vive en el código (lib/promo-oferta.js).';
