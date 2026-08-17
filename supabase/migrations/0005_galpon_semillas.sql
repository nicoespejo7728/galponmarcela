-- =====================================================================
--  EL GALPÓN — Migración 0005: datos iniciales
-- =====================================================================

-- Configuración del negocio (fila única).
insert into galpon.config_negocio (id, nombre_negocio, pin_admin_hash)
values (1, 'El Galpón', extensions.crypt('1234', extensions.gen_salt('bf')))
on conflict (id) do nothing;

comment on column galpon.config_negocio.pin_admin_hash is
  'Hash bcrypt. El PIN inicial es 1234 (el mismo de hoy) y DEBE cambiarse '
  'desde Ajustes en el primer ingreso. Se verifica con galpon.verificar_pin().';


-- Verificación del PIN de administrador sin exponer el hash al cliente.
create or replace function galpon.verificar_pin(p_pin text)
returns boolean
language sql
stable
security definer
set search_path = galpon, public, extensions
as $$
  select galpon.es_miembro()
     and exists (
       select 1 from galpon.config_negocio
       where id = 1 and pin_admin_hash = extensions.crypt(p_pin, pin_admin_hash)
     );
$$;

create or replace function galpon.cambiar_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = galpon, public, extensions
as $$
begin
  if not galpon.es_admin() then
    raise exception 'Solo un administrador puede cambiar el PIN';
  end if;
  if length(btrim(p_pin)) < 4 then
    raise exception 'El PIN debe tener al menos 4 caracteres';
  end if;
  update galpon.config_negocio
     set pin_admin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf'))
   where id = 1;
end;
$$;

revoke execute on function galpon.verificar_pin(text) from anon;
revoke execute on function galpon.cambiar_pin(text)  from anon;


-- Secciones del almacén. Se completa con las que traiga la migración de datos.
insert into galpon.categoria (nombre, orden) values
  ('PAN', 1), ('PREPARADOS', 2), ('BEBIDAS', 3), ('ABARROTES', 4),
  ('LÁCTEOS', 5), ('CARNES', 6), ('VERDURAS', 7), ('FRUTAS', 8),
  ('LIMPIEZA', 9), ('CIGARRILLOS', 10), ('CONFITES', 11), ('OTROS', 99)
on conflict do nothing;


-- Nómina rescatada de la planilla Excel del negocio.
insert into galpon.trabajador (nombre) values
  ('Fran'), ('Yane'), ('Dani'), ('Rosita'), ('Angel'), ('Yenny'), ('German')
on conflict do nothing;


-- Feriados chilenos 2026 (Ley 19.973 para los irrenunciables).
insert into galpon.feriado (fecha, etiqueta, irrenunciable) values
  ('2026-01-01', 'Año Nuevo',                  true),
  ('2026-04-03', 'Viernes Santo',              false),
  ('2026-04-04', 'Sábado Santo',               false),
  ('2026-05-01', 'Día del Trabajo',            true),
  ('2026-05-21', 'Glorias Navales',            false),
  ('2026-09-18', 'Independencia Nacional',     true),
  ('2026-09-19', 'Glorias del Ejército',       true),
  ('2026-10-12', 'Encuentro de Dos Mundos',    false),
  ('2026-11-01', 'Día de Todos los Santos',    false),
  ('2026-12-08', 'Inmaculada Concepción',      false),
  ('2026-12-25', 'Navidad',                    true)
on conflict (fecha) do nothing;


-- ---------------------------------------------------------------------
--  ALTA DE PERSONAS
--  El perfil se crea solo cuando Supabase Auth crea el usuario, para que
--  nunca queden perfiles huérfanos ni cuentas sin perfil.
-- ---------------------------------------------------------------------

create or replace function galpon.tg_crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = galpon, public
as $$
begin
  -- Solo se crea perfil si el alta viene marcada como de El Galpón. Así los
  -- usuarios de INTRANET, que comparten auth.users, no entran a este sistema.
  if new.raw_user_meta_data->>'app' is distinct from 'galpon' then
    return new;
  end if;

  insert into galpon.perfil (id, nombre, usuario, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'usuario', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'rol')::galpon.rol_usuario, 'vendedor')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger galpon_crear_perfil
  after insert on auth.users
  for each row execute function galpon.tg_crear_perfil();

comment on function galpon.tg_crear_perfil is
  'Crea el perfil de El Galpón al dar de alta un usuario en Supabase Auth. '
  'Requiere raw_user_meta_data = {"app":"galpon","nombre":"...","usuario":"...","rol":"admin|vendedor"}.';
