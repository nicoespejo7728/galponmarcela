-- =====================================================================
--  EL GALPÓN — Esquema de base de datos (PostgreSQL / Supabase)
--  Migración 0001: esquema, tipos enumerados y tablas
--
--  Reemplaza el almacenamiento actual de 18 blobs JSON en window.storage
--  por un modelo relacional normalizado.
--
--  Convenciones:
--   · Todo vive en el esquema `galpon` (aislado de las tablas de INTRANET).
--   · Identificadores: uuid v4 (gen_random_uuid), no strings con prefijo.
--   · Dinero: numeric(12,2) en CLP. Cantidades: numeric(12,3) (peso).
--   · Fechas con hora: timestamptz. Fechas sin hora: date.
--   · Nombres de tabla y columna en español, singular, snake_case.
-- =====================================================================

create schema if not exists galpon;
create extension if not exists pgcrypto with schema extensions;

comment on schema galpon is
  'Sistema de punto de venta e inventario del almacén El Galpón.';

-- ---------------------------------------------------------------------
--  TIPOS ENUMERADOS
--  Cada uno reemplaza un conjunto de strings libres que hoy se comparan
--  con === en el código de la aplicación.
-- ---------------------------------------------------------------------

create type galpon.rol_usuario as enum ('admin', 'vendedor');

create type galpon.tipo_unidad as enum ('unidad', 'peso');

create type galpon.metodo_pago as enum
  ('efectivo', 'debito', 'credito', 'transferencia');

create type galpon.tipo_movimiento as enum ('ingreso', 'egreso');

create type galpon.categoria_movimiento as enum (
  'venta',
  'consumo_interno',
  'compra_mercaderia',
  'entrada_libre',
  'merma',
  'sueldo',
  'ajuste_inventario',
  'transformacion',
  'venta_historica',
  'compra_historica',
  'sueldo_historico',
  'gasto_historico',
  'general'
);

create type galpon.motivo_merma as enum
  ('perdida', 'robo', 'vencimiento', 'dano_rotura', 'otro');

create type galpon.estado_turno as enum ('abierto', 'cerrado');

create type galpon.tipo_mov_turno as enum ('retiro', 'refuerzo');

create type galpon.estado_conteo as enum
  ('pendiente', 'excepcion_solicitada', 'completado');

create type galpon.tipo_feedback as enum
  ('sugerencia', 'falla', 'comentario');

create type galpon.estado_feedback as enum ('pendiente', 'resuelto');

create type galpon.estado_aprobacion as enum
  ('pendiente', 'aprobada', 'descartada');

create type galpon.origen_compra as enum
  ('recepcion', 'reposicion_directa');

-- Cada razón por la que el stock de un producto puede cambiar. Hoy hay
-- 5 caminos distintos de descuento y 3 de incremento, cada uno escrito a
-- mano; el kárdex los unifica en un solo libro auditable.
create type galpon.origen_kardex as enum (
  'venta',
  'consumo_interno',
  'merma',
  'recepcion',
  'reposicion_directa',
  'conteo',
  'transformacion_insumo',
  'transformacion_salida',
  'pan_frio',
  'ajuste_manual',
  'carga_inicial'
);

-- =====================================================================
--  1. CONFIGURACIÓN, PERSONAS Y CATÁLOGOS BASE
-- =====================================================================

-- Singleton: una sola fila, forzada por el CHECK sobre la PK.
create table galpon.config_negocio (
  id                       smallint primary key default 1
                             check (id = 1),
  nombre_negocio           text        not null default 'El Galpón',
  logo_path                text,        -- ruta en Supabase Storage, no base64
  pin_admin_hash           text        not null,  -- bcrypt, nunca texto plano
  iva_tasa                 numeric(5,4) not null default 0.19
                             check (iva_tasa >= 0 and iva_tasa < 1),
  iva_incluido             boolean     not null default true,
  margen_objetivo          numeric(5,4) not null default 0.30
                             check (margen_objetivo >= 0),
  categoria_pan            text        not null default 'PAN',
  costo_materiales_transf  numeric(12,2) not null default 0,
  costo_fijo_transf        numeric(12,2) not null default 0,
  ultimo_respaldo_at       timestamptz,
  creado_at                timestamptz not null default now(),
  actualizado_at           timestamptz not null default now()
);

comment on table galpon.config_negocio is
  'Parámetros del negocio. Una única fila (id = 1). Reemplaza business-settings.';
comment on column galpon.config_negocio.iva_tasa is
  'IVA que antes estaba escrito a mano como 1.19 en cuatro lugares del código.';
comment on column galpon.config_negocio.logo_path is
  'Ruta del logo en el bucket de Storage. Antes era un data URL base64 en la BD.';


-- Perfiles de acceso al sistema. La identidad y la contraseña las maneja
-- Supabase Auth (auth.users); aquí va solo lo propio del negocio.
create table galpon.perfil (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null,
  usuario     text not null,   -- login histórico; el email de Auth es <usuario>@elgalpon.local
  rol         galpon.rol_usuario not null default 'vendedor',
  activo      boolean not null default true,
  creado_at   timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

comment on table galpon.perfil is
  'Personas que usan el sistema. Reemplaza la lista `users` con contraseñas en texto plano.';
comment on column galpon.perfil.nombre is
  'Único e insensible a mayúsculas: era la clave con la que todo el sistema anterior '
  'cruzaba ventas, turnos y recepciones. Se mantiene la unicidad para poder migrar.';


-- Nómina. Separada de `perfil` a propósito: hay trabajadores a los que se
-- les paga sueldo pero que no entran al sistema, y viceversa.
create table galpon.trabajador (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  perfil_id   uuid references galpon.perfil(id) on delete set null,
  activo      boolean not null default true,
  creado_at   timestamptz not null default now()
);

comment on table galpon.trabajador is
  'Personas a las que se les paga sueldo. `perfil_id` las vincula con su cuenta '
  'de usuario cuando la tienen (caso Fran), que antes no existía.';


create table galpon.proveedor (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  categoria       text,          -- rubro
  rut             text,
  contacto_nombre text,
  telefono        text,
  email           text,
  direccion       text,
  notas           text,
  activo          boolean not null default true,
  creado_at       timestamptz not null default now(),
  actualizado_at  timestamptz not null default now()
);

comment on table galpon.proveedor is
  'Unifica las dos formas incompatibles que hoy conviven: la del formulario '
  '(contactName/notes) y la del import legacy (linkman/remark).';


-- Las secciones del almacén pasan de ser un string libre a una tabla.
-- Es la solución de raíz al problema que hoy se combate forzando MAYÚSCULAS:
-- "Bebidas", "bebidas" y "BEBIDAS" ya no pueden convertirse en tres secciones.
create table galpon.categoria (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  orden     smallint not null default 0,
  activa    boolean not null default true,
  creado_at timestamptz not null default now()
);

comment on table galpon.categoria is
  'Secciones del almacén. Antes era un campo de texto libre dentro de cada producto.';


-- =====================================================================
--  2. CATÁLOGO DE PRODUCTOS
-- =====================================================================

create table galpon.producto (
  id               uuid primary key default gen_random_uuid(),
  codigo_barras    text not null,
  nombre           text not null,
  categoria_id     uuid references galpon.categoria(id) on delete set null,
  precio           numeric(12,2) not null default 0 check (precio >= 0),
  costo            numeric(12,2) not null default 0 check (costo >= 0),
  stock            numeric(12,3) not null default 0,
  stock_minimo     numeric(12,3) not null default 5 check (stock_minimo >= 0),
  proveedor_id     uuid references galpon.proveedor(id) on delete set null,
  tipo_unidad      galpon.tipo_unidad not null default 'unidad',
  unidades_por_kg  numeric(10,3) check (unidades_por_kg is null or unidades_por_kg > 0),
  acceso_rapido    boolean not null default false,
  activo           boolean not null default true,
  creado_at        timestamptz not null default now(),
  actualizado_at   timestamptz not null default now(),

  -- La conversión Kg → unidades solo tiene sentido en productos que se
  -- venden por unidad pero se compran por kilo (caso PAN: 12 unidades/Kg).
  constraint producto_unidades_por_kg_coherente
    check (tipo_unidad = 'unidad' or unidades_por_kg is null)
);

comment on column galpon.producto.codigo_barras is
  'Único. Si el producto no trae código real se autogenera con prefijo INT-.';
comment on column galpon.producto.costo is
  'Costo NETO, sin IVA. El precio de venta sí es final al público.';
comment on column galpon.producto.stock is
  'Derivado del kárdex: lo mantiene al día un trigger, no la aplicación.';


-- Reemplaza el array priceHistory, que hoy se trunca a las últimas 15 entradas.
create table galpon.producto_precio_historial (
  id           uuid primary key default gen_random_uuid(),
  producto_id  uuid not null references galpon.producto(id) on delete cascade,
  fecha        timestamptz not null default now(),
  costo        numeric(12,2) not null,
  precio       numeric(12,2) not null,
  cambiado_por uuid references galpon.perfil(id) on delete set null
);

comment on table galpon.producto_precio_historial is
  'Historial completo de costo y precio. Sin el tope de 15 entradas de hoy: '
  'ese tope rompe el cálculo del piso duro de margen, que necesita el costo '
  'histórico más alto.';


-- Un vendedor no puede fijar precios: propone y un admin aprueba.
create table galpon.aprobacion_precio (
  id                uuid primary key default gen_random_uuid(),
  producto_id       uuid not null references galpon.producto(id) on delete cascade,
  precio_sugerido   numeric(12,2) not null check (precio_sugerido >= 0),
  costo_neto        numeric(12,2) not null check (costo_neto >= 0),
  es_producto_nuevo boolean not null default false,
  estado            galpon.estado_aprobacion not null default 'pendiente',
  solicitado_por    uuid not null references galpon.perfil(id) on delete restrict,
  solicitado_at     timestamptz not null default now(),
  resuelto_por      uuid references galpon.perfil(id) on delete set null,
  resuelto_at       timestamptz,
  precio_aprobado   numeric(12,2),

  constraint aprobacion_resuelta_coherente check (
    (estado = 'pendiente'  and resuelto_por is null and resuelto_at is null)
    or
    (estado <> 'pendiente' and resuelto_por is not null and resuelto_at is not null)
  ),
  constraint aprobacion_precio_aprobado_coherente check (
    estado <> 'aprobada' or precio_aprobado is not null
  )
);

comment on table galpon.aprobacion_precio is
  'Reemplaza el objeto priceApproval incrustado en el producto. Al ser tabla '
  'aparte queda el registro de las aprobaciones pasadas, que hoy se pierde.';


-- =====================================================================
--  3. CAJA Y TURNOS
-- =====================================================================

-- Una sola tabla para el turno abierto y el turno cerrado. Hoy son dos
-- colecciones (open-shifts / shifts-log) que comparten el mismo id.
create table galpon.turno (
  id                    uuid primary key default gen_random_uuid(),
  perfil_id             uuid not null references galpon.perfil(id) on delete restrict,
  rol_apertura          galpon.rol_usuario not null,
  abierto_at            timestamptz not null default now(),
  monto_apertura        numeric(12,2) not null default 0 check (monto_apertura >= 0),
  estado                galpon.estado_turno not null default 'abierto',

  cerrado_por           uuid references galpon.perfil(id) on delete set null,
  cerrado_at            timestamptz,
  efectivo_contado      numeric(12,2),

  -- Snapshot congelado al cierre. Se materializa a propósito: es el arqueo
  -- firmado de ese momento y no debe cambiar si después se corrige una venta.
  ventas_efectivo       numeric(12,2),
  ventas_debito         numeric(12,2),
  ventas_credito        numeric(12,2),
  ventas_transferencia  numeric(12,2),
  ventas_total          numeric(12,2),
  ventas_cantidad       integer,
  retiros_total         numeric(12,2),
  refuerzos_total       numeric(12,2),
  efectivo_esperado     numeric(12,2),
  diferencia            numeric(12,2)
    generated always as (efectivo_contado - efectivo_esperado) stored,

  constraint turno_cierre_coherente check (
    (estado = 'abierto' and cerrado_at is null and efectivo_contado is null)
    or
    (estado = 'cerrado' and cerrado_at is not null and efectivo_contado is not null
     and cerrado_por is not null and efectivo_esperado is not null)
  ),
  constraint turno_cierre_posterior check (cerrado_at is null or cerrado_at >= abierto_at)
);

comment on column galpon.turno.diferencia is
  'Positivo = sobrante, negativo = faltante, cero = caja cuadrada.';


create table galpon.turno_movimiento (
  id             uuid primary key default gen_random_uuid(),
  turno_id       uuid not null references galpon.turno(id) on delete cascade,
  tipo           galpon.tipo_mov_turno not null,
  monto          numeric(12,2) not null check (monto > 0),
  motivo         text,
  fecha          timestamptz not null default now(),
  registrado_por uuid not null references galpon.perfil(id) on delete restrict
);

comment on table galpon.turno_movimiento is
  'Retiros y refuerzos de caja. Unifica los arrays withdrawals y reinforcements, '
  'que hoy tienen exactamente la misma forma.';


-- =====================================================================
--  4. VENTAS
-- =====================================================================

create sequence galpon.boleta_seq as integer start 1;

create table galpon.venta (
  id             uuid primary key default gen_random_uuid(),
  numero_boleta  integer not null default nextval('galpon.boleta_seq'),
  fecha          timestamptz not null default now(),
  vendedor_id    uuid not null references galpon.perfil(id) on delete restrict,
  turno_id       uuid references galpon.turno(id) on delete set null,
  metodo_pago    galpon.metodo_pago not null,
  total          numeric(12,2) not null check (total >= 0),
  anulada        boolean not null default false,
  anulada_por    uuid references galpon.perfil(id) on delete set null,
  anulada_at     timestamptz,
  creado_at      timestamptz not null default now()
);

comment on column galpon.venta.numero_boleta is
  'Correlativo por secuencia de Postgres. Antes se buscaba "el primer número '
  'libre" recorriendo todas las ventas, lo que podía repetir boletas.';
comment on column galpon.venta.turno_id is
  'Vínculo explícito con la caja. Antes era implícito (vendedor + rango de '
  'fechas) y se rompía si alguien cambiaba de nombre.';


create table galpon.venta_detalle (
  id               uuid primary key default gen_random_uuid(),
  venta_id         uuid not null references galpon.venta(id) on delete cascade,
  producto_id      uuid references galpon.producto(id) on delete set null,
  nombre_producto  text not null,          -- snapshot al momento de la venta
  codigo_barras    text,                   -- snapshot
  cantidad         numeric(12,3) not null check (cantidad > 0),
  precio_unitario  numeric(12,2) not null check (precio_unitario >= 0),
  costo_unitario   numeric(12,2) not null default 0 check (costo_unitario >= 0),
  tipo_unidad      galpon.tipo_unidad not null,
  subtotal         numeric(14,2)
    generated always as (round(cantidad * precio_unitario, 2)) stored
);

comment on column galpon.venta_detalle.costo_unitario is
  'Costo congelado al vender: es la base del margen histórico, que quedaría '
  'falseado si se recalculara con el costo de hoy.';


-- =====================================================================
--  5. COMPRAS Y RECEPCIÓN
-- =====================================================================

create table galpon.factura_compra (
  id                    uuid primary key default gen_random_uuid(),
  fecha                 timestamptz not null default now(),
  proveedor_id          uuid references galpon.proveedor(id) on delete set null,
  nombre_proveedor      text not null default 'Sin proveedor',  -- snapshot
  numero_documento      text,
  total_neto            numeric(14,2) not null default 0 check (total_neto >= 0),
  iva_tasa              numeric(5,4)  not null default 0.19,
  total_bruto           numeric(14,2)
    generated always as (round(total_neto * (1 + iva_tasa), 2)) stored,
  registrado_por        uuid not null references galpon.perfil(id) on delete restrict,
  sin_documento         boolean not null default false,
  motivo_sin_documento  text,
  creado_at             timestamptz not null default now(),

  -- Entrada libre: sin documento, pero exige motivo escrito y queda marcada
  -- como excepción. Con documento: exige número de referencia.
  constraint factura_documento_coherente check (
    (sin_documento = false and numero_documento is not null
       and motivo_sin_documento is null)
    or
    (sin_documento = true  and numero_documento is null
       and motivo_sin_documento is not null)
  )
);

comment on table galpon.factura_compra is
  'Documento de compra recibido. total_bruto se calcula solo a partir del neto '
  'y de la tasa de IVA vigente al momento de la recepción.';


create table galpon.factura_compra_pagina (
  id             uuid primary key default gen_random_uuid(),
  factura_id     uuid not null references galpon.factura_compra(id) on delete cascade,
  orden          smallint not null check (orden >= 0),
  storage_path   text not null,      -- objeto en el bucket, no base64
  tipo_mime      text not null,
  nombre_archivo text,
  bytes          integer,
  creado_at      timestamptz not null default now()
);

comment on table galpon.factura_compra_pagina is
  'Fotos y PDF del documento. Antes vivían en claves sueltas invoice-image:<id> '
  'como base64 y quedaban fuera del respaldo.';


create table galpon.compra_detalle (
  id                     uuid primary key default gen_random_uuid(),
  fecha                  timestamptz not null default now(),
  factura_id             uuid references galpon.factura_compra(id) on delete set null,
  proveedor_id           uuid references galpon.proveedor(id) on delete set null,
  nombre_proveedor       text,          -- snapshot
  producto_id            uuid references galpon.producto(id) on delete set null,
  nombre_producto        text not null, -- snapshot
  cantidad               numeric(12,3) not null check (cantidad > 0),
  costo_neto_unitario    numeric(12,2) not null check (costo_neto_unitario >= 0),
  origen                 galpon.origen_compra not null default 'recepcion',
  registrado_por         uuid references galpon.perfil(id) on delete set null
);

comment on table galpon.compra_detalle is
  'Línea de compra. Alimenta la comparación de precios entre proveedores. '
  'Ahora producto_id se llena siempre: antes quedaba nulo para productos nuevos '
  'y se perdía el vínculo.';


-- =====================================================================
--  6. LIBRO DE CAJA — tabla base + detalle por tipo
-- =====================================================================

create table galpon.movimiento (
  id              uuid primary key default gen_random_uuid(),
  fecha           timestamptz not null default now(),
  tipo            galpon.tipo_movimiento not null,
  categoria       galpon.categoria_movimiento not null,
  concepto        text not null,
  monto           numeric(14,2) not null check (monto >= 0),
  automatico      boolean not null default true,
  historico       boolean not null default false,
  registrado_por  uuid references galpon.perfil(id) on delete set null,

  -- Vínculos con el hecho que originó el movimiento (excluyentes entre sí)
  venta_id        uuid references galpon.venta(id) on delete set null,
  factura_id      uuid references galpon.factura_compra(id) on delete set null,
  proveedor_id    uuid references galpon.proveedor(id) on delete set null,

  creado_at       timestamptz not null default now()
);

comment on table galpon.movimiento is
  'Libro de caja. El monto es siempre positivo; el signo lo da `tipo`. '
  'Los campos propios de cada tipo viven en las tablas de detalle.';
comment on column galpon.movimiento.automatico is
  'true = lo generó el sistema (venta, recepción); false = alta manual.';


create table galpon.movimiento_merma (
  movimiento_id          uuid primary key
                           references galpon.movimiento(id) on delete cascade,
  producto_id            uuid references galpon.producto(id) on delete set null,
  nombre_producto        text not null,
  cantidad               numeric(12,3) not null check (cantidad > 0),
  tipo_unidad            galpon.tipo_unidad not null,
  motivo                 galpon.motivo_merma not null,
  reportado_por          uuid not null references galpon.perfil(id) on delete restrict,
  autorizado_por         uuid references galpon.perfil(id) on delete set null,
  autorizado_por_nombre  text
);

comment on column galpon.movimiento_merma.autorizado_por is
  'FK real al admin que autoriza. Antes era texto libre sin validar contra usuarios.';


create table galpon.movimiento_sueldo (
  movimiento_id     uuid primary key
                      references galpon.movimiento(id) on delete cascade,
  trabajador_id     uuid not null references galpon.trabajador(id) on delete restrict,
  nombre_trabajador text not null,   -- snapshot
  fecha_pago        date not null,   -- fecha sin hora, distinta del timestamp
  nota              text,
  pagado_por        uuid not null references galpon.perfil(id) on delete restrict
);


create table galpon.movimiento_ajuste (
  movimiento_id  uuid primary key
                   references galpon.movimiento(id) on delete cascade,
  conteo_id      uuid,   -- FK añadida más abajo (conteo se define después)
  producto_id    uuid references galpon.producto(id) on delete set null,
  diferencia     numeric(12,3) not null
);

comment on table galpon.movimiento_ajuste is
  'Ajuste de inventario nacido de un conteo. diferencia > 0 = sobrante.';


-- =====================================================================
--  7. CONTEOS DE INVENTARIO
-- =====================================================================

create table galpon.conteo (
  id             uuid primary key default gen_random_uuid(),
  fecha_limite   date not null,
  categoria_id   uuid references galpon.categoria(id) on delete set null,
  asignado_a     uuid not null references galpon.perfil(id) on delete restrict,
  asignado_por   uuid not null references galpon.perfil(id) on delete restrict,
  estado         galpon.estado_conteo not null default 'pendiente',
  creado_at      timestamptz not null default now(),
  completado_at  timestamptz,
  completado_por uuid references galpon.perfil(id) on delete set null,

  constraint conteo_completado_coherente check (
    (estado <> 'completado' and completado_at is null and completado_por is null)
    or
    (estado =  'completado' and completado_at is not null and completado_por is not null)
  )
);

comment on table galpon.conteo is
  'Conteo de inventario programado. Obligatorios los días 15 y 29 de cada mes.';


create table galpon.conteo_detalle (
  id              uuid primary key default gen_random_uuid(),
  conteo_id       uuid not null references galpon.conteo(id) on delete cascade,
  producto_id     uuid not null references galpon.producto(id) on delete restrict,
  nombre_producto text not null,
  tipo_unidad     galpon.tipo_unidad not null,
  esperado        numeric(12,3) not null,
  contado         numeric(12,3) not null check (contado >= 0),
  diferencia      numeric(12,3)
    generated always as (round(contado - esperado, 3)) stored,

  constraint conteo_detalle_producto_unico unique (conteo_id, producto_id)
);


create table galpon.conteo_excepcion (
  id                     uuid primary key default gen_random_uuid(),
  conteo_id              uuid not null references galpon.conteo(id) on delete cascade,
  motivo                 text not null,
  solicitado_por         uuid not null references galpon.perfil(id) on delete restrict,
  solicitado_at          timestamptz not null default now(),
  aprobado_por           uuid references galpon.perfil(id) on delete set null,
  aprobado_at            timestamptz,
  fecha_limite_anterior  date not null,
  fecha_limite_nueva     date
);

comment on table galpon.conteo_excepcion is
  'Solicitud de reprogramación. Antes era un objeto anidado que solo guardaba '
  'la última petición: ahora queda el historial completo.';

-- FK diferida de movimiento_ajuste hacia conteo
alter table galpon.movimiento_ajuste
  add constraint movimiento_ajuste_conteo_fk
  foreign key (conteo_id) references galpon.conteo(id) on delete set null;


-- =====================================================================
--  8. TRANSFORMACIONES Y CONSUMO INTERNO
-- =====================================================================

create table galpon.transformacion (
  id                       uuid primary key default gen_random_uuid(),
  fecha                    timestamptz not null default now(),
  producto_salida_id       uuid not null references galpon.producto(id) on delete restrict,
  nombre_salida            text not null,
  cantidad_salida          numeric(12,3) not null check (cantidad_salida > 0),
  costo_materiales_unitario numeric(12,2) not null default 0,
  costo_fijo               numeric(12,2) not null default 0,
  costo_total              numeric(14,2) not null default 0,
  costo_unitario           numeric(12,2) not null default 0,
  precio_recomendado       numeric(12,2),
  precio_aplicado          numeric(12,2) not null,
  realizado_por            uuid not null references galpon.perfil(id) on delete restrict,
  movimiento_id            uuid references galpon.movimiento(id) on delete set null
);

comment on table galpon.transformacion is
  'Elaboración de un producto a partir de otros (ej. preparados). Los insumos '
  'se valorizan a precio de venta, no a costo: es una decisión de costeo del negocio.';


create table galpon.transformacion_insumo (
  id                uuid primary key default gen_random_uuid(),
  transformacion_id uuid not null references galpon.transformacion(id) on delete cascade,
  producto_id       uuid not null references galpon.producto(id) on delete restrict,
  nombre_producto   text not null,
  cantidad          numeric(12,3) not null check (cantidad > 0),
  valor_unitario    numeric(12,2) not null
);


-- Hoy el ticket de consumo interno se imprime y se pierde: solo queda el
-- movimiento de caja, sin el detalle de qué se consumió.
create table galpon.consumo_interno (
  id             uuid primary key default gen_random_uuid(),
  fecha          timestamptz not null default now(),
  responsable_id uuid references galpon.perfil(id) on delete set null,
  responsable    text not null,
  motivo         text not null,
  autorizado_por uuid references galpon.perfil(id) on delete set null,
  costo_total    numeric(14,2) not null default 0,
  movimiento_id  uuid references galpon.movimiento(id) on delete set null
);

create table galpon.consumo_interno_detalle (
  id              uuid primary key default gen_random_uuid(),
  consumo_id      uuid not null references galpon.consumo_interno(id) on delete cascade,
  producto_id     uuid references galpon.producto(id) on delete set null,
  nombre_producto text not null,
  cantidad        numeric(12,3) not null check (cantidad > 0),
  costo_unitario  numeric(12,2) not null default 0,
  precio_unitario numeric(12,2) not null default 0,
  tipo_unidad     galpon.tipo_unidad not null
);


-- =====================================================================
--  9. KÁRDEX — libro mayor de existencias
-- =====================================================================

-- Toda variación de stock pasa por aquí. Un trigger actualiza
-- producto.stock, así que el saldo nunca puede quedar desalineado del
-- historial y siempre se puede reconstruir de dónde salió cada unidad.
create table galpon.kardex (
  id                uuid primary key default gen_random_uuid(),
  producto_id       uuid not null references galpon.producto(id) on delete cascade,
  fecha             timestamptz not null default now(),
  origen            galpon.origen_kardex not null,
  cantidad          numeric(12,3) not null check (cantidad <> 0),  -- con signo
  stock_resultante  numeric(12,3) not null,
  costo_unitario    numeric(12,2),
  referencia_id     uuid,        -- venta, factura, conteo, transformación...
  registrado_por    uuid references galpon.perfil(id) on delete set null,
  nota              text
);

comment on table galpon.kardex is
  'Libro mayor de existencias. Cada fila es un movimiento de stock con signo; '
  'stock_resultante lo calcula el trigger. Resuelve el problema actual de que '
  'dos cajas vendiendo a la vez pueden dejar el stock en negativo sin rastro.';


-- =====================================================================
--  10. FEEDBACK Y CALENDARIO DEL PAN
-- =====================================================================

create table galpon.feedback (
  id           uuid primary key default gen_random_uuid(),
  fecha        timestamptz not null default now(),
  autor_id     uuid not null references galpon.perfil(id) on delete cascade,
  rol          galpon.rol_usuario not null,
  tipo         galpon.tipo_feedback not null,
  mensaje      text not null check (length(btrim(mensaje)) > 0),
  estado       galpon.estado_feedback not null default 'pendiente',
  nota_admin   text,
  resuelto_por uuid references galpon.perfil(id) on delete set null,
  resuelto_at  timestamptz,

  constraint feedback_resuelto_coherente check (
    (estado = 'pendiente' and resuelto_por is null and resuelto_at is null)
    or
    (estado = 'resuelto'  and resuelto_por is not null and resuelto_at is not null)
  )
);


create table galpon.feriado (
  fecha         date primary key,
  etiqueta      text not null,
  irrenunciable boolean not null default false
);

comment on column galpon.feriado.irrenunciable is
  'true = el local permanece cerrado. Afecta la predicción de demanda de pan.';


create table galpon.falta_pan (
  fecha   date primary key,
  manana  boolean not null default false,
  tarde   boolean not null default false
);

comment on table galpon.falta_pan is
  'Días en que faltó pan. Se excluyen del cálculo de predicción para no '
  'aprender una demanda artificialmente baja.';
