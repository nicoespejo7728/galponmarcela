-- =====================================================================
--  EL GALPÓN — Migración 0007: quién puede crear una sección
-- =====================================================================

-- Crear una sección no es un privilegio de administración: pasa sola cuando un
-- vendedor recibe mercadería de un rubro que todavía no existe en el catálogo.
-- Con la política anterior, esa recepción se perdía entera.
create policy categoria_insert on galpon.categoria
  for insert to authenticated
  with check (galpon.es_miembro());

comment on policy categoria_insert on galpon.categoria is
  'Cualquiera del equipo puede crear una sección al recibir mercadería. '
  'Renombrarla o desactivarla sigue siendo cosa de un administrador.';
