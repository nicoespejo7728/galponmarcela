-- =====================================================================
--  EL GALPÓN — Migración 0017: duplicados que no hay que unificar
--
--  La pantalla Revisar propone unir productos que se llaman igual, pero
--  varios no son el mismo: "BIGTIME MENTA" a 1.500 es el paquete y a 450
--  la unidad suelta. Sin memoria, esos casos reaparecen cada vez que
--  alguien entra a revisar y hay que volver a decidirlos.
--
--  Acá se anota que ese grupo ya se miró y se decidió dejarlo separado.
--  Se guarda la clave del grupo —el nombre sin tildes ni espacios—, no
--  los identificadores: así el descarte sigue en pie aunque después se
--  agregue otra ficha con el mismo nombre.
-- =====================================================================

create table if not exists galpon.duplicado_descartado (
  clave          text primary key,
  nombre         text not null,
  motivo         text,
  descartado_por uuid references galpon.perfil(id) on delete set null,
  descartado_at  timestamptz not null default now()
);

comment on table galpon.duplicado_descartado is
  'Grupos de productos con el mismo nombre que alguien revisó y decidió NO unificar. '
  'La clave es el nombre normalizado, sin tildes ni signos.';

alter table galpon.duplicado_descartado enable row level security;

drop policy if exists duplicado_descartado_lectura on galpon.duplicado_descartado;
create policy duplicado_descartado_lectura on galpon.duplicado_descartado
  for select using (galpon.es_miembro());

drop policy if exists duplicado_descartado_insert on galpon.duplicado_descartado;
create policy duplicado_descartado_insert on galpon.duplicado_descartado
  for insert with check (galpon.es_admin());

drop policy if exists duplicado_descartado_delete on galpon.duplicado_descartado;
create policy duplicado_descartado_delete on galpon.duplicado_descartado
  for delete using (galpon.es_admin());

grant select on galpon.duplicado_descartado to authenticated;
grant insert, delete on galpon.duplicado_descartado to authenticated;
grant all on galpon.duplicado_descartado to service_role;
