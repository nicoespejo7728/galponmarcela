-- =====================================================================
--  EL GALPÓN — Migración 0044: entrar a la cuenta completa con tarjeta
-- =====================================================================
--
-- Fran pidió un paso más sobre lo que ya hace la migración 0043: que la
-- tarjeta no solo identifique a quién vende o autorice una merma/fiado,
-- sino que también reemplace el usuario y contraseña para entrar al
-- sistema — a CUALQUIER cuenta, vendedor o administrador.
--
-- Para las cuentas de administrador (que al entrar abren todo: Ajustes,
-- reportes, Usuarios, etc. — no una acción puntual y acotada como merma o
-- fiado) Fran pidió un paso extra de confirmación: que aparezca "Eres
-- [nombre]" y haya que escribir el PIN de esa persona antes de entrar — el
-- mismo PIN de vendedor que ya tiene cada quien, reutilizado por ahora (se
-- puede separar en un PIN propio para esto más adelante si se prefiere).
-- Los vendedores entran directo con solo la tarjeta, sin este paso: su
-- cuenta no abre nada que no abriera ya identificarse con tarjeta o PIN en
-- la caja.
--
-- Por qué esto no se puede hacer con una función RPC común: abrir una
-- sesión real de Supabase Auth sin pedir contraseña requiere la clave de
-- servicio, que nunca puede estar en el navegador — así que ese paso lo
-- hace un endpoint del servidor (app/api/tarjeta/ingresar), con esa clave.
-- Leer qué perfil tiene asignada una tarjeta ya lo puede hacer ese
-- endpoint (la tabla perfil ya es legible por el rol de servicio, igual
-- que en app/api/usuarios). Lo que falta es poder comprobar el PIN de ESE
-- perfil en particular sin pasar por identificar_por_pin/autorizar_con_pin
-- (migraciones 0013/0015): esas dos exigen galpon.es_miembro(), que mira
-- auth.uid() — y el rol de servicio no tiene ningún auth.uid(), porque no
-- entra con una sesión de alguien, entra con la clave de servicio
-- directo. Por eso esta función es nueva, en vez de reusar esas dos.
--
-- A propósito queda cerrada a cualquiera que no sea el rol de servicio
-- (ni anon ni authenticated pueden llamarla): no filtra si un PIN
-- cualquiera pertenece a un perfil cualquiera, nada más que el propio
-- endpoint del servidor, ya con el UID de la tarjeta ya confirmado, puede
-- usarla para comprobar el PIN de esa persona puntual.
-- =====================================================================

create or replace function galpon.verificar_pin_de_perfil(p_perfil_id uuid, p_pin text)
returns boolean
language sql
stable
security definer
set search_path = galpon, public, extensions
as $$
  select exists (
    select 1 from galpon.perfil
    where id = p_perfil_id
      and activo
      and pin_hash is not null
      and pin_hash = extensions.crypt(coalesce(p_pin, ''), pin_hash)
  );
$$;

comment on function galpon.verificar_pin_de_perfil(uuid, text) is
  'Comprueba si p_pin es el PIN de vendedor de ESE perfil puntual (no "algún '
  'administrador", como autorizar_con_pin). No exige es_miembro(): la usa '
  'app/api/tarjeta/ingresar con la clave de servicio, antes de que exista '
  'ninguna sesión. Ver migración 0044.';

revoke all on function galpon.verificar_pin_de_perfil(uuid, text) from public;
grant execute on function galpon.verificar_pin_de_perfil(uuid, text) to service_role;
