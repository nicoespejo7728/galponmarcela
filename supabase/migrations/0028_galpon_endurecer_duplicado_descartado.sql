-- =====================================================================
--  EL GALPÓN — Migración 0028: aislamiento estricto de duplicado_descartado
-- =====================================================================
--
-- Auditoría de aislamiento (agosto 2026): el proyecto de Supabase donde
-- vive este esquema es compartido con otro sistema, para no pagar un
-- proyecto aparte. Se revisaron los permisos y las políticas de TODAS las
-- tablas de galpon: el rol "anon" no tiene ni siquiera USAGE sobre el
-- esquema (no puede ver nada sin iniciar sesión), y cada tabla exige
-- galpon.es_miembro() o galpon.es_admin() — funciones que comprueban el
-- usuario autenticado contra galpon.perfil, así que una cuenta del OTRO
-- sistema (que no tiene fila en perfil) queda igual de afuera que
-- cualquier desconocido. Los buckets de Storage (galpon-facturas,
-- galpon-publico) también están bien acotados por bucket_id.
--
-- Una sola tabla quedó con las políticas declaradas para el rol "public"
-- en vez de "authenticated": duplicado_descartado. En la práctica no es
-- una puerta abierta —"anon" no tiene acceso al esquema y las políticas
-- igual exigen es_miembro()/es_admin()— pero es la única que no sigue el
-- mismo patrón que el resto, y no hay razón para que sea distinta. Esto
-- la deja igual a todas las demás: solo cuentas autenticadas.
-- =====================================================================

drop policy if exists duplicado_descartado_lectura on galpon.duplicado_descartado;
create policy duplicado_descartado_lectura on galpon.duplicado_descartado
  for select to authenticated
  using (galpon.es_miembro());

drop policy if exists duplicado_descartado_insert on galpon.duplicado_descartado;
create policy duplicado_descartado_insert on galpon.duplicado_descartado
  for insert to authenticated
  with check (galpon.es_admin());

drop policy if exists duplicado_descartado_delete on galpon.duplicado_descartado;
create policy duplicado_descartado_delete on galpon.duplicado_descartado
  for delete to authenticated
  using (galpon.es_admin());
