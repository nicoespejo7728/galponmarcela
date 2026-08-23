-- =====================================================================
--  EL GALPÓN — Migración 0022: los consumos que quedaron afuera
-- =====================================================================
--
-- Dos arreglos del consumo interno, los dos descubiertos al mirar por qué
-- el panel de Consumos salía vacío.
--
-- 1. El motivo era obligatorio en la tabla y opcional en la pantalla.
--
--    consumo_interno.motivo venía como NOT NULL desde la 0001, y
--    registrar_consumo_interno (0020) escribe NULL cuando el vendedor no
--    pone nada — que es el caso normal, porque en el mesón el motivo es
--    opcional a propósito. El primer consumo sin motivo habría reventado
--    con una violación de NOT NULL, mucho después de escribir el código.
--    Manda la pantalla: el motivo es opcional, así que la columna acepta
--    nulos.
--
-- 2. Los consumos del sistema anterior no estaban en ninguna tabla.
--
--    Hasta la 0020 el consumo interno solo escribía un movimiento de
--    egreso con el nombre escrito a mano en el concepto ("Consumo
--    interno: FRAN") y descontaba el stock; consumo_interno nunca se
--    usó. Por eso el panel nuevo salía vacío aunque sí había consumos.
--    Se traen esas cabeceras para que aparezcan como pendientes de
--    descontar, que es lo que son.
--
--    Sin detalle: el sistema anterior no lo guardaba en ninguna parte, así
--    que solo se sabe el total. Va dicho en el motivo, para que nadie
--    piense que el detalle se perdió acá.
--
--    No se toca el stock ni el kárdex: esos consumos ya se descontaron
--    cuando ocurrieron, y volver a descontarlos duplicaría el movimiento
--    —el mismo error que dejó doce productos con el stock al doble
--    durante la unificación—. Solo se traen las cabeceras.

alter table galpon.consumo_interno
  alter column motivo drop not null;

comment on column galpon.consumo_interno.motivo is
  'Por qué se llevó los productos. Opcional: en el mesón se registra el '
  'consumo sin obligar a explicarlo.';

-- El nombre venía escrito a mano, así que se calza contra los perfiles
-- activos por el comienzo del nombre ("FRAN" → "Fran", "Marcela" →
-- "MARCELA URRA"). Lo que no calza con nadie —"CASA", que es la casa y no
-- una persona— conserva el texto y queda sin perfil: la pantalla agrupa
-- igual por nombre.
insert into galpon.consumo_interno
  (fecha, responsable_id, responsable, motivo, costo_total, movimiento_id)
select
  m.fecha,
  (select p.id from galpon.perfil p
    where p.activo and p.nombre ilike btrim(replace(m.concepto, 'Consumo interno:', '')) || '%'
    order by length(p.nombre) limit 1),
  btrim(replace(m.concepto, 'Consumo interno:', '')),
  'Registrado con el sistema anterior — sin detalle de productos',
  m.monto,
  m.id
from galpon.movimiento m
where m.categoria::text = 'consumo_interno'
  and not exists (
    select 1 from galpon.consumo_interno c where c.movimiento_id = m.id
  );
