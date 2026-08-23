-- =====================================================================
--  EL GALPÓN — Migración 0024: el consumo de la casa
-- =====================================================================
--
-- El consumo interno se anota a nombre de quien puso el PIN, y eso está
-- bien para el equipo: a cada vendedor se le descuenta del sueldo lo que
-- se llevó. Pero los dueños no se descuentan nada a sí mismos — lo que se
-- llevan es de la casa, y tenerlo repartido en tres cuentas separadas no
-- sirve para nada: la pregunta es cuánto se llevó la casa, no cuánto se
-- llevó cada uno.
--
-- Así que la marca va en el perfil y no en el consumo. Cada consumo sigue
-- guardando quién lo registró —eso es un hecho, y el kárdex lo referencia—
-- pero el panel los junta bajo "CASA". Y como es una marca del perfil, se
-- puede cambiar desde Usuarios cuando cambie quién es de la casa, sin
-- esperar otra migración.

alter table galpon.perfil
  add column if not exists consumo_a_casa boolean not null default false;

comment on column galpon.perfil.consumo_a_casa is
  'Si el consumo interno de esta persona se agrupa como "CASA" en vez de '
  'quedar como una cuenta propia por descontar del sueldo. Los dueños van '
  'en true; el equipo, en false.';

update galpon.perfil
set consumo_a_casa = true, actualizado_at = now()
where activo
  and upper(btrim(nombre)) in ('FRAN', 'MARCELA URRA', 'MAURICIO ASTUDILLO');
