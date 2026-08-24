-- =====================================================================
--  EL GALPÓN — Migración 0026: datos nuevos para la Recepción simplificada
-- =====================================================================
--
-- La pantalla de Recepción se rehace para ser más rápida: proveedor, monto
-- de la factura, fecha, número de documento, si es factura o boleta, cómo
-- se paga (y cuándo, si es a crédito) — y de ahí directo a pistolear. Tres
-- datos que antes no se guardaban en ninguna parte:
--
--   1. Si el documento es factura o boleta. Antes solo existía "número de
--      documento", sin decir de qué tipo era.
--   2. El monto total que dice la factura, tal cual, antes de escanear
--      nada — es una referencia rápida para cuadrar a ojo, no reemplaza el
--      total que se calcula sumando las líneas realmente recibidas (que
--      puede diferir: mermas de despacho, redondeos, etc.).
--   3. Cuándo hay que pagarle al proveedor, cuando la recepción quedó a
--      crédito. Antes esa fecha no se guardaba en ninguna parte — quedaba
--      en la cabeza de quien recibió, o en el papel de la factura.
--
-- Las tres son opcionales y las recepciones anteriores quedan en null: no
-- hay forma de adivinar esos datos para el pasado sin arriesgarse a
-- inventar una cifra tributaria, el mismo criterio que ya usó la 0023 con
-- boleta_emitida.
-- =====================================================================

create type galpon.tipo_documento_compra as enum ('factura', 'boleta');

alter table galpon.factura_compra
  add column if not exists tipo_documento galpon.tipo_documento_compra,
  add column if not exists monto_informado numeric(12,2),
  add column if not exists fecha_pago_prevista date;

comment on column galpon.factura_compra.tipo_documento is
  'Si el proveedor entregó factura o boleta. Nulo en las recepciones '
  'anteriores a esta migración, cuando la pantalla no lo preguntaba.';
comment on column galpon.factura_compra.monto_informado is
  'El total que dice la factura, escrito antes de pistolear los '
  'productos — una referencia rápida para cuadrar a ojo. El total real '
  '(total_neto/total_bruto) se sigue calculando solo de las líneas '
  'efectivamente recibidas; puede no coincidir exacto y no bloquea nada.';
comment on column galpon.factura_compra.fecha_pago_prevista is
  'Cuándo hay que pagarle al proveedor. Solo tiene sentido cuando '
  'metodo_pago = ''credito''; en efectivo/transferencia queda vacía '
  'porque ya se pagó en el acto.';
