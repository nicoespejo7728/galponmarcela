-- =====================================================================
--  EL GALPÓN — Migración 0045: dos tarjetas NFC por perfil (principal + respaldo)
-- =====================================================================
--
-- Fran empezó a asignar tarjetas de verdad y pidió que cada perfil
-- (vendedor o administrador) pueda tener DOS tarjetas propias — una
-- "principal" y una de "respaldo", por si se pierde o se olvida la
-- primera — en vez de una sola, como dejó armado la migración 0043. Las
-- dos funcionan exactamente igual para todo (identificarse en Vender,
-- autorizar si la persona es administradora, entrar a la cuenta completa):
-- "principal"/"respaldo" es solo una etiqueta para que quien administra
-- sepa cuál es cuál, no cambia ningún permiso ni prioridad entre ellas.
--
-- Reemplaza galpon.perfil.tarjeta_uid (una sola columna) por una tabla
-- aparte con hasta dos filas por perfil. Se confirmó contra la base antes
-- de escribir esto que ningún perfil tenía todavía una tarjeta asignada,
-- así que no hace falta migrar ningún dato — se da de baja la columna
-- vieja directamente.
-- =====================================================================

create table galpon.perfil_tarjeta (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references galpon.perfil(id) on delete cascade,
  etiqueta text not null check (etiqueta in ('principal', 'respaldo')),
  tarjeta_uid text not null,
  creado_at timestamptz not null default now(),
  unique (perfil_id, etiqueta)
);

comment on table galpon.perfil_tarjeta is
  'Hasta 2 tarjetas NFC por perfil (principal y respaldo, mismo permiso '
  'las dos) — reemplaza a la columna galpon.perfil.tarjeta_uid de la '
  'migración 0043. Ver galpon.asignar_tarjeta_perfil().';

-- Una misma tarjeta física no puede quedar asignada dos veces (ni a dos
-- perfiles distintos, ni como principal Y respaldo de la misma persona a
-- la vez con dos UIDs iguales) — mismo criterio que ya usaba la 0043.
create unique index perfil_tarjeta_uid_unica_idx
  on galpon.perfil_tarjeta (galpon.normalizar_tarjeta(tarjeta_uid));

create index perfil_tarjeta_perfil_id_idx on galpon.perfil_tarjeta (perfil_id);

alter table galpon.perfil_tarjeta enable row level security;

-- Mismo criterio que galpon.perfil: cualquier miembro activo puede leer
-- (la tarjeta no es secreta), pero asignar o quitar es solo de admin.
create policy perfil_tarjeta_lectura on galpon.perfil_tarjeta for select
  using (galpon.es_miembro());

create policy perfil_tarjeta_admin on galpon.perfil_tarjeta for all
  using (galpon.es_admin())
  with check (galpon.es_admin());

-- --- Funciones: espejo de la 0043, ahora contra la tabla nueva ---

create or replace function galpon.identificar_por_tarjeta(p_uid text)
  returns table(id uuid, nombre text, usuario text, rol galpon.rol_usuario)
  language sql
  stable security definer
  set search_path to 'galpon', 'public', 'extensions'
as $function$
  select p.id, p.nombre, p.usuario, p.rol
  from galpon.perfil p
  join galpon.perfil_tarjeta t on t.perfil_id = p.id
  where galpon.es_miembro()
    and p.activo
    and galpon.normalizar_tarjeta(t.tarjeta_uid) = galpon.normalizar_tarjeta(p_uid)
  limit 1;
$function$;

create or replace function galpon.autorizar_con_tarjeta(p_uid text)
  returns boolean
  language sql
  stable security definer
  set search_path to 'galpon', 'public', 'extensions'
as $function$
  select galpon.es_miembro()
     and galpon.normalizar_tarjeta(p_uid) is not null
     and (
       exists (
         select 1 from galpon.config_negocio
         where id = 1
           and tarjeta_admin_uid is not null
           and galpon.normalizar_tarjeta(tarjeta_admin_uid) = galpon.normalizar_tarjeta(p_uid)
       )
       or exists (
         select 1 from galpon.perfil p
         join galpon.perfil_tarjeta t on t.perfil_id = p.id
         where p.activo
           and p.rol = 'admin'
           and galpon.normalizar_tarjeta(t.tarjeta_uid) = galpon.normalizar_tarjeta(p_uid)
       )
     );
$function$;

-- Ahora recibe también la etiqueta ('principal' | 'respaldo'): asigna o
-- quita SOLO esa tarjeta de la persona, sin tocar la otra. Avisa con un
-- mensaje claro si la tarjeta ya está en uso en otro lado, en vez de dejar
-- que se vea solo el error crudo de la restricción única.
create or replace function galpon.asignar_tarjeta_perfil(p_perfil_id uuid, p_etiqueta text, p_uid text)
  returns void
  language plpgsql
  security definer
  set search_path to 'galpon', 'public', 'extensions'
as $function$
declare
  v_uid text := galpon.normalizar_tarjeta(p_uid);
begin
  if not galpon.es_admin() then
    raise exception 'Solo un administrador puede asignar tarjetas';
  end if;
  if p_etiqueta not in ('principal', 'respaldo') then
    raise exception 'Etiqueta de tarjeta inválida: %', p_etiqueta;
  end if;

  if v_uid is null then
    delete from galpon.perfil_tarjeta where perfil_id = p_perfil_id and etiqueta = p_etiqueta;
    return;
  end if;

  if exists (
    select 1 from galpon.perfil_tarjeta
    where galpon.normalizar_tarjeta(tarjeta_uid) = v_uid
      and not (perfil_id = p_perfil_id and etiqueta = p_etiqueta)
  ) then
    raise exception 'Esta tarjeta ya está asignada a otra persona (o a la otra tarjeta de esta misma persona)';
  end if;

  if exists (
    select 1 from galpon.config_negocio
    where id = 1 and tarjeta_admin_uid is not null
      and galpon.normalizar_tarjeta(tarjeta_admin_uid) = v_uid
  ) then
    raise exception 'Esta tarjeta ya está asignada como la tarjeta del negocio (en Ajustes)';
  end if;

  insert into galpon.perfil_tarjeta (perfil_id, etiqueta, tarjeta_uid)
  values (p_perfil_id, p_etiqueta, v_uid)
  on conflict (perfil_id, etiqueta)
  do update set tarjeta_uid = excluded.tarjeta_uid;
end; $function$;

-- Mismo chequeo de colisión para la tarjeta del negocio, en el otro
-- sentido (que no sea ya la tarjeta personal de alguien).
create or replace function galpon.asignar_tarjeta_negocio(p_uid text)
  returns void
  language plpgsql
  security definer
  set search_path to 'galpon', 'public', 'extensions'
as $function$
declare
  v_uid text := galpon.normalizar_tarjeta(p_uid);
begin
  if not galpon.es_admin() then
    raise exception 'Solo un administrador puede asignar la tarjeta del negocio';
  end if;

  if v_uid is not null and exists (
    select 1 from galpon.perfil_tarjeta where galpon.normalizar_tarjeta(tarjeta_uid) = v_uid
  ) then
    raise exception 'Esta tarjeta ya está asignada como tarjeta personal de alguien';
  end if;

  update galpon.config_negocio
     set tarjeta_admin_uid = v_uid
   where id = 1;
end; $function$;

-- --- Da de baja lo que dejaba armado la 0043 para la tarjeta personal ---
-- (la tabla nueva de arriba la reemplaza; la tarjeta del negocio en
-- config_negocio no cambia).
drop index if exists galpon.perfil_tarjeta_uid_normalizada_idx;
alter table galpon.perfil drop column if exists tarjeta_uid;
