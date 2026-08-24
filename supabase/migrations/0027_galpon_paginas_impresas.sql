-- =====================================================================
--  EL GALPÓN — Migración 0027: qué se imprimió de la hoja carta
-- =====================================================================
--
-- La hoja carta de códigos internos (lib/hoja-carta.js) ahora se organiza
-- por categoría, una hoja por categoría cuando alcanza el tamaño y varias
-- categorías chicas compartiendo hoja cuando no. Para poder avisar "esta
-- categoría cambió desde la última vez que se imprimió su hoja" hace falta
-- recordar, por categoría, qué códigos tenía la última vez que se mandó a
-- imprimir.
--
-- Va como una columna más en config_negocio (fila única del negocio) y no
-- como tabla aparte: es un solo diccionario chico { categoría → {fecha,
-- códigos} } que se pisa entero cada vez que se reimprime, no un historial.
-- =====================================================================

alter table galpon.config_negocio
  add column if not exists paginas_impresas jsonb not null default '{}'::jsonb;

comment on column galpon.config_negocio.paginas_impresas is
  'Última impresión de la hoja carta de códigos internos, por categoría: '
  '{ "<categoría>": { "impresoAt": "<iso>", "codigos": ["...", ...] } }. '
  'Se pisa entera (o por categoría) cada vez que se reimprime — no es un '
  'historial — y sirve solo para avisar en pantalla qué categoría quedó '
  'desactualizada porque se le agregó o quitó un código desde la última '
  'vez que se imprimió su hoja.';
