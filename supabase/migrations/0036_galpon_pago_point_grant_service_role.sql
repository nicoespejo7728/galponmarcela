-- =====================================================================
--  EL GALPÓN — Migración 0036: permiso de tabla que faltó en pago_point
-- =====================================================================
--
-- La migración 0035 creó galpon.pago_point y sus políticas RLS, pero se le
-- olvidó el GRANT de tabla en sí — RLS no alcanza si el rol ni siquiera
-- tiene permiso para tocar la tabla. Sin esto, cada intento de cobro fallaba
-- con "permission denied for table pago_point" justo después de que
-- Mercado Pago ya había aceptado la orden (ver app/api/mercadopago/cobrar):
-- la orden llegaba a la máquina, pero el sistema no lograba guardar el
-- seguimiento.
-- =====================================================================

grant select, insert, update, delete on galpon.pago_point to service_role;
