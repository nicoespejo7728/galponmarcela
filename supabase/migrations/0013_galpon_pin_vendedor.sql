-- =====================================================================
--  EL GALPÓN — Migración 0013: PIN de vendedor
-- =====================================================================
--
-- Reemplaza el "PIN de vendedor" que en la práctica nunca funcionó: la
-- pantalla comparaba contra un campo user.pin que jamás se guardaba en la
-- base (usuarios.leer()/escribir() no lo tocaban), así que la comprobación
-- siempre fallaba. Ahora cada persona del equipo tiene un PIN propio,
-- guardado con bcrypt igual que el PIN de administrador de config_negocio,
-- y se identifica escribiendo SOLO ese PIN antes de cada venta en la caja
-- común de los dos computadores del local — sin elegir su nombre de una
-- lista ni cerrar sesión y volver a entrar con usuario y contraseña.
--
-- Esta migración no agrega valores a ningún enum, así que no aplica el
-- caveat de "unsafe use of new value of enum type" de las migraciones
-- 0011/0012 — se puede aplicar de una sola vez.

alter table galpon.perfil
  add column if not exists pin_hash text;

comment on column galpon.perfil.pin_hash is
  'Hash bcrypt del PIN de vendedor (identificación rápida en la caja común, '
  'migración 0013). No es el PIN de administrador de Ajustes (config_negocio.'
  'pin_admin_hash, usado solo en Consumo interno): son dos PIN distintos con '
  'distinto propósito.';

-- Identifica a quién pertenece un PIN sin exponer los hashes al cliente: el
-- navegador nunca ve pin_hash, solo pregunta "¿de quién es este PIN?" y la
-- función security definer contesta con el perfil o ninguna fila.
create or replace function galpon.identificar_por_pin(p_pin text)
returns table (id uuid, nombre text, usuario text, rol galpon.rol_usuario)
language sql
stable
security definer
set search_path = galpon, public, extensions
as $$
  select p.id, p.nombre, p.usuario, p.rol
  from galpon.perfil p
  where galpon.es_miembro()
    and p.activo
    and p.pin_hash is not null
    and p.pin_hash = extensions.crypt(p_pin, p.pin_hash)
  limit 1;
$$;

comment on function galpon.identificar_por_pin(text) is
  'Devuelve el perfil dueño de ese PIN de vendedor (una fila o ninguna). '
  'Cualquier miembro activo puede llamarla: es la caja común preguntando '
  'quién está vendiendo, no una consulta administrativa.';

revoke execute on function galpon.identificar_por_pin(text) from anon;

-- Fija o cambia el PIN de vendedor de una persona. Solo un administrador
-- puede hacerlo, y la función exige que ningún otro perfil activo esté
-- usando ya ese mismo PIN — la comprobación de unicidad que antes se hacía
-- (sin efecto real) en el navegador.
create or replace function galpon.fijar_pin(p_perfil_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = galpon, public, extensions
as $$
declare
  v_choque uuid;
begin
  if not galpon.es_admin() then
    raise exception 'Solo un administrador puede asignar el PIN de vendedor';
  end if;
  if length(btrim(p_pin)) < 4 then
    raise exception 'El PIN debe tener al menos 4 dígitos';
  end if;

  select p.id into v_choque
  from galpon.perfil p
  where p.id <> p_perfil_id
    and p.activo
    and p.pin_hash is not null
    and p.pin_hash = extensions.crypt(p_pin, p.pin_hash)
  limit 1;

  if v_choque is not null then
    raise exception 'Ese PIN ya lo usa otra persona del equipo — elige uno distinto';
  end if;

  update galpon.perfil
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
         actualizado_at = now()
   where id = p_perfil_id;
end;
$$;

comment on function galpon.fijar_pin(uuid, text) is
  'Asigna el PIN de vendedor de un perfil. Admin-only; revisa unicidad '
  'contra los demás perfiles activos antes de guardar.';

revoke execute on function galpon.fijar_pin(uuid, text) from anon;
