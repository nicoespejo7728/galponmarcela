-- =====================================================================
--  EL GALPÓN — Migración 0032: pago combinado (ventas, recepciones, egresos)
-- =====================================================================
--
-- Hay clientes y proveedores que pagan parte con un medio y el resto con
-- otro (ej. una parte en efectivo, la diferencia por transferencia). Hasta
-- ahora el sistema solo aceptaba UN medio de pago por venta, por recepción
-- y no llevaba ninguno en los egresos manuales.
--
-- Se agrega 'combinado' a los dos enums de medio de pago que ya existían
-- (metodo_pago para ventas, metodo_pago_proveedor para recepciones y
-- egresos), y una columna desglose_pago (jsonb) en las tres tablas: un
-- arreglo [{"metodo": "efectivo", "monto": 6000}, ...] que solo se llena
-- cuando metodo_pago = 'combinado' — en cualquier otro caso queda nulo, el
-- medio de pago de la columna ya lo dice todo.
--
-- galpon.movimiento (egresos) no tenía columna de medio de pago: el pago
-- manual de un gasto nunca se registraba con qué se pagó. Se agrega acá
-- junto con lo demás, reutilizando metodo_pago_proveedor (mismo vocabulario
-- que ya usa la recepción: efectivo/transferencia/combinado — el valor
-- "credito" de ese enum no se ofrece en la pantalla de egresos, es solo
-- para no crear un tercer tipo con las mismas dos palabras).
-- =====================================================================

alter type galpon.metodo_pago add value if not exists 'combinado';
alter type galpon.metodo_pago_proveedor add value if not exists 'combinado';

alter table galpon.venta add column if not exists desglose_pago jsonb;
alter table galpon.factura_compra add column if not exists desglose_pago jsonb;
alter table galpon.movimiento add column if not exists metodo_pago galpon.metodo_pago_proveedor;
alter table galpon.movimiento add column if not exists desglose_pago jsonb;

comment on column galpon.venta.desglose_pago is
  'Detalle de un pago combinado: [{"metodo":"efectivo","monto":6000}, '
  '{"metodo":"transferencia","monto":4000}, ...]. Solo se llena cuando '
  'metodo_pago = ''combinado''; nulo en cualquier otro caso.';

comment on column galpon.factura_compra.desglose_pago is
  'Mismo criterio que galpon.venta.desglose_pago, para una recepción '
  'pagada a un proveedor con más de un medio.';

comment on column galpon.movimiento.metodo_pago is
  'Con qué se pagó este egreso (migración 0032) — antes no se registraba '
  'en absoluto. Nulo en movimientos automáticos o históricos donde no se '
  'sabe (mermas, sueldos, ajustes, importados del Excel).';

comment on column galpon.movimiento.desglose_pago is
  'Mismo criterio que galpon.venta.desglose_pago, para un egreso pagado '
  'con más de un medio.';
