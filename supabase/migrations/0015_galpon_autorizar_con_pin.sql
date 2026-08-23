-- =====================================================================
--  EL GALPÓN — Migración 0015: autorizar con el PIN de cualquier admin
--
--  Desde la 0013 conviven dos PIN: el personal de cada persona, para
--  identificarse en la caja, y el "PIN de administrador" del negocio, que
--  autoriza mermas y consumo interno. En el mesón eso se confunde: se pide
--  "el PIN de administrador" y quien está autorizando escribe el suyo, que
--  es el único que recuerda.
--
--  Esta función acepta los dos caminos: el PIN del negocio, o el PIN
--  personal de una persona con rol admin. Sigue siendo una autorización de
--  administrador — nadie que no lo sea puede autorizar— y deja de depender
--  de que alguien recuerde un PIN que casi no se usa.
-- =====================================================================

create or replace function galpon.autorizar_con_pin(p_pin text)
returns boolean
language sql
stable
security definer
set search_path = galpon, public, extensions
as $$
  select galpon.es_miembro()
     and (
       exists (
         select 1 from galpon.config_negocio
         where id = 1
           and pin_admin_hash is not null
           and pin_admin_hash = extensions.crypt(p_pin, pin_admin_hash)
       )
       or exists (
         select 1 from galpon.perfil
         where activo
           and rol = 'admin'
           and pin_hash is not null
           and pin_hash = extensions.crypt(p_pin, pin_hash)
       )
     );
$$;

comment on function galpon.autorizar_con_pin(text) is
  'Autoriza una operación que exige administrador: acepta el PIN del negocio '
  '(config_negocio.pin_admin_hash) o el PIN personal de cualquier admin activo. '
  'Devuelve solo verdadero o falso; ningún hash sale de la base.';

revoke execute on function galpon.autorizar_con_pin(text) from anon;
grant execute on function galpon.autorizar_con_pin(text) to authenticated, service_role;
