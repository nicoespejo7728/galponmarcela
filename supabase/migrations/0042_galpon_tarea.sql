-- =====================================================================
--  EL GALPÓN — Migración 0042: tareas asignadas (actividades extra)
-- =====================================================================
--
-- Hasta ahora "Actividades pendientes" solo mostraba avisos que el propio
-- sistema calculaba (conteos atrasados, aprobaciones de precio, clientes
-- sobre su límite de fiado, etc.) — no existía ninguna forma de que un
-- administrador le encargara a alguien una tarea suelta del día a día:
-- limpiar, ordenar, reponer, hacer ensaladas, hacer pichanga...
--
-- Esta migración agrega esa pieza: una tabla chica donde un administrador
-- crea la tarea, escribe de qué se trata y elige a quién se la asigna, y
-- la persona asignada —o cualquier administrador— la marca como hecha
-- cuando corresponda.
-- =====================================================================

create type galpon.estado_tarea as enum ('pendiente', 'completada', 'cancelada');

create table galpon.tarea (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  detalle text,
  asignado_a uuid not null references galpon.perfil(id),
  asignado_por uuid not null references galpon.perfil(id),
  estado galpon.estado_tarea not null default 'pendiente',
  creado_at timestamptz not null default now(),
  completado_at timestamptz,
  completado_por uuid references galpon.perfil(id)
);

comment on table galpon.tarea is
  'Tareas sueltas que un administrador asigna a un perfil (limpiar, ordenar, '
  'reponer, hacer ensaladas, hacer pichanga, etc.), aparte de los avisos que '
  'el sistema calcula solo. Se muestran y se crean desde la pestaña '
  'Actividades.';

create index tarea_asignado_a_idx on galpon.tarea (asignado_a);
create index tarea_estado_idx on galpon.tarea (estado);

alter table galpon.tarea enable row level security;

-- Solo un administrador crea y asigna tareas: son quienes reparten el
-- trabajo del día, igual que programar un conteo de inventario.
create policy tarea_insert on galpon.tarea for insert
  with check (galpon.es_admin());

-- Cualquier persona activa puede ver todas las tareas (igual que los
-- conteos de inventario): un vendedor necesita ver las suyas, y un
-- administrador necesita ver el estado de todas para hacer seguimiento.
create policy tarea_lectura on galpon.tarea for select
  using (galpon.es_miembro());

-- Un administrador puede corregir o reasignar cualquier tarea; la persona
-- asignada solo puede tocar la suya — en la práctica, para marcarla hecha.
create policy tarea_actualizar on galpon.tarea for update
  using (galpon.es_admin() or asignado_a = auth.uid())
  with check (galpon.es_admin() or asignado_a = auth.uid());

-- Borrar (por ejemplo, una tarea creada por error) es solo de administrador.
create policy tarea_eliminar on galpon.tarea for delete
  using (galpon.es_admin());
