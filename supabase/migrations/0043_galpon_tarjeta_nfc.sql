-- =====================================================================
--  EL GALPÓN — Migración 0043: identificación y autorización con tarjeta NFC
-- =====================================================================
--
-- Fran compró tarjetas NFC (NTAG213/215/216, sin chip de seguridad — el
-- número de serie es de fábrica y cualquier celular con NFC lo lee, no es
-- un secreto) y lectores NFC de PC/SC para reemplazar, donde tenga sentido,
-- el PIN de 4 dígitos por un simple "acercar la tarjeta".
--
-- Esta migración espeja exactamente el mecanismo que ya existe para el PIN
-- (ver migraciones 0013 y 0015, y las funciones verificar_pin/
-- autorizar_con_pin/identificar_por_pin en este mismo esquema):
--
--   - galpon.perfil.tarjeta_uid      → tarjeta PERSONAL de cada trabajador.
--     Sirve para identificar quién vende (como el PIN de vendedor) y, si
--     esa persona es administradora, también sirve para autorizar lo que
--     hoy pide PIN de administrador (merma, cliente de fiado nuevo) — tal
--     cual como ya funciona pin_hash hoy para ambos usos.
--   - galpon.config_negocio.tarjeta_admin_uid → tarjeta del NEGOCIO (una
--     sola, compartida), equivalente a pin_admin_hash: cualquiera que la
--     tenga en la mano autoriza, sin que sea la tarjeta personal de un
--     admin en particular.
--
-- A diferencia del PIN, el número de la tarjeta NO se guarda con hash:
-- no hay nada que proteger ahí (no es secreto — se lee con cualquier
-- lector o celular con solo acercarlo), así que guardarlo en texto plano
-- no empeora la seguridad, y permite que un administrador vea en pantalla
-- qué tarjeta tiene asignada cada quien.
--
-- OJO DE SEGURIDAD (pedido explícito de Fran, nov. 2026): a diferencia del
-- PIN, que solo lo sabe quien lo memorizó, la tarjeta es un objeto físico
-- que se puede perder, prestar o — al no tener chip de seguridad — copiar
-- con un lector barato. Fran decidió igual reemplazar también la
-- autorización de administrador (no solo la identificación de vendedor)
-- a sabiendas de esto. Si se pierde una tarjeta de administrador, hay que
-- borrarle el tarjeta_uid al perfil (o cambiar tarjeta_admin_uid si era la
-- del negocio) para que deje de servir — igual que se cambiaría un PIN
-- filtrado.
-- =====================================================================

alter table galpon.perfil
  add column if not exists tarjeta_uid text;

alter table galpon.config_negocio
  add column if not exists tarjeta_admin_uid text;

-- Normaliza el número de serie de la tarjeta: cada lector/puente puede
-- entregarlo con mayúsculas o minúsculas distintas, o con separadores
-- (":", "-", espacios) entre bytes — esto hace que "04:a2:24:cb" y
-- "04A224CB" sean la misma tarjeta tanto al guardar como al comparar.
create or replace function galpon.normalizar_tarjeta(p_uid text)
  returns text
  language sql
  immutable
as $function$
  select nullif(upper(regexp_replace(coalesce(p_uid, ''), '[^0-9A-Za-z]', '', 'g')), '');
$function$;

-- Único índice funcional: evita que dos perfiles queden con la misma
-- tarjeta asignada (comparando ya normalizado), sin bloquear perfiles que
-- todavía no tienen ninguna.
create unique index if not exists perfil_tarjeta_uid_normalizada_idx
  on galpon.perfil (galpon.normalizar_tarjeta(tarjeta_uid))
  where tarjeta_uid is not null;

comment on column galpon.perfil.tarjeta_uid is
  'Número de serie de la tarjeta NFC personal de este trabajador (NTAG213/'
  '215/216, sin hash — no es secreto). Identifica quién vende (como el PIN '
  'de vendedor) y, si es administrador, también autoriza lo que pide PIN '
  'de administrador. Ver migración 0043.';

comment on column galpon.config_negocio.tarjeta_admin_uid is
  'Número de serie de la tarjeta NFC del negocio (compartida), equivalente '
  'a pin_admin_hash pero sin hash — no es secreto. Cualquiera que la tenga '
  'en la mano autoriza. Ver migración 0043.';

-- Espejo de identificar_por_pin(): misma forma de retorno, mismo criterio
-- (perfil activo), solo que compara tarjeta_uid normalizado en vez de
-- hacer crypt() contra un hash — acá no hace falta, porque la tarjeta no
-- es secreta.
create or replace function galpon.identificar_por_tarjeta(p_uid text)
  returns table(id uuid, nombre text, usuario text, rol galpon.rol_usuario)
  language sql
  stable security definer
  set search_path to 'galpon', 'public', 'extensions'
as $function$
  select p.id, p.nombre, p.usuario, p.rol
  from galpon.perfil p
  where galpon.es_miembro()
    and p.activo
    and p.tarjeta_uid is not null
    and galpon.normalizar_tarjeta(p.tarjeta_uid) = galpon.normalizar_tarjeta(p_uid)
  limit 1;
$function$;

-- Espejo de autorizar_con_pin(): sirve la tarjeta del negocio o la
-- personal de cualquier administrador activo.
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
         select 1 from galpon.perfil
         where activo
           and rol = 'admin'
           and tarjeta_uid is not null
           and galpon.normalizar_tarjeta(tarjeta_uid) = galpon.normalizar_tarjeta(p_uid)
       )
     );
$function$;

-- Asignar/quitar la tarjeta personal de un trabajador (desde Usuarios) y
-- la tarjeta del negocio (desde Ajustes). Separadas de un simple UPDATE
-- directo a la tabla porque conviene normalizar antes de guardar, y para
-- la del negocio porque solo un administrador puede tocarla — igual que
-- cambiar_pin().
create or replace function galpon.asignar_tarjeta_perfil(p_perfil_id uuid, p_uid text)
  returns void
  language plpgsql
  security definer
  set search_path to 'galpon', 'public', 'extensions'
as $function$
begin
  if not galpon.es_admin() then
    raise exception 'Solo un administrador puede asignar tarjetas';
  end if;
  update galpon.perfil
     set tarjeta_uid = galpon.normalizar_tarjeta(p_uid)
   where id = p_perfil_id;
end; $function$;

create or replace function galpon.asignar_tarjeta_negocio(p_uid text)
  returns void
  language plpgsql
  security definer
  set search_path to 'galpon', 'public', 'extensions'
as $function$
begin
  if not galpon.es_admin() then
    raise exception 'Solo un administrador puede asignar la tarjeta del negocio';
  end if;
  update galpon.config_negocio
     set tarjeta_admin_uid = galpon.normalizar_tarjeta(p_uid)
   where id = 1;
end; $function$;

-- Explícito en vez de confiar en el privilegio por omisión del esquema:
-- las funciones de PIN existentes quedaron con una mezcla de permisos
-- (algunas con PUBLIC, otras solo con authenticated) según cuándo se
-- crearon — para no heredar esa lotería, acá se deja clarito.
grant execute on function galpon.identificar_por_tarjeta(text) to authenticated;
grant execute on function galpon.autorizar_con_tarjeta(text) to authenticated;
grant execute on function galpon.asignar_tarjeta_perfil(uuid, text) to authenticated;
grant execute on function galpon.asignar_tarjeta_negocio(text) to authenticated;
