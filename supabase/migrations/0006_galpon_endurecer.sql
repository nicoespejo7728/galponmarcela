-- =====================================================================
--  EL GALPÓN — Migración 0006: endurecimiento de funciones y vistas
-- =====================================================================

-- Fijar search_path en las funciones de trigger: sin esto, un rol con permiso
-- de crear objetos podría anteponer un esquema propio y secuestrar la llamada.
alter function galpon.tg_actualizado_at()             set search_path = galpon, public;
alter function galpon.tg_normalizar_nombre()          set search_path = galpon, public;
alter function galpon.tg_codigo_barras_interno()      set search_path = galpon, public, extensions;
alter function galpon.tg_kardex_aplicar()             set search_path = galpon, public;
alter function galpon.tg_kardex_inmutable()           set search_path = galpon, public;
alter function galpon.tg_registrar_precio()           set search_path = galpon, public;
alter function galpon.tg_piso_margen()                set search_path = galpon, public;
alter function galpon.tg_aplicar_aprobacion()         set search_path = galpon, public;
alter function galpon.tg_validar_detalle_movimiento() set search_path = galpon, public;

-- Las vistas deben evaluarse con los permisos de QUIEN consulta, no de quien
-- las creó. Sin esto, cualquier vista sería un agujero que se salta el RLS.
alter view galpon.v_producto_estado   set (security_invoker = true);
alter view galpon.v_turno_resumen     set (security_invoker = true);
alter view galpon.v_proveedor_resumen set (security_invoker = true);
alter view galpon.v_libro_caja        set (security_invoker = true);
alter view galpon.v_ventas_diarias    set (security_invoker = true);

-- Ninguna función del esquema es alcanzable sin sesión iniciada.
revoke execute on all functions in schema galpon from anon, public;
grant  execute on all functions in schema galpon to authenticated, service_role;
