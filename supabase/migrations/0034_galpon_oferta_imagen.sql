-- =====================================================================
--  EL GALPÓN — Migración 0034: imagen promocional de una oferta
-- =====================================================================
--
-- Al crear o editar una oferta por cantidad (galpon.oferta) se puede armar,
-- en el navegador, una imagen promocional para compartir (WhatsApp, redes):
-- el nombre de la oferta, los tramos "N por $X" y, si se adjuntaron,
-- fotos de los productos que participan. Esta migración solo guarda DÓNDE
-- quedó esa imagen ya armada — el armado (canvas) vive en el código, no acá.
--
-- Va al bucket público galpon-publico (el mismo del logo del negocio, migración
-- 0001): a diferencia de las fotos de facturas, esta imagen es para
-- compartirla afuera, así que necesita un enlace que no venza como el
-- firmado de galpon-facturas.
-- =====================================================================

create table galpon.oferta_imagen (
  id             uuid primary key default gen_random_uuid(),
  oferta_id      uuid not null references galpon.oferta(id) on delete cascade,
  storage_path   text not null,
  tipo_mime      text not null default 'image/jpeg',
  creado_por     uuid references galpon.perfil(id) on delete set null,
  creado_at      timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  -- Una sola imagen vigente por carpeta: al regenerarla se reemplaza (se
  -- sube al mismo storage_path y se actualiza esta fila), no se acumulan
  -- versiones viejas sueltas en el bucket.
  constraint oferta_imagen_oferta_uniq unique (oferta_id)
);

comment on table galpon.oferta_imagen is
  'Imagen promocional generada en el navegador para una carpeta de oferta '
  '(galpon.oferta), a partir de su nombre, sus tramos y —opcionalmente— fotos '
  'de los productos que participan. Una sola fila vigente por carpeta. Vive '
  'en el bucket público galpon-publico, bajo ofertas/{oferta_id}.jpg.';

create trigger oferta_imagen_actualizado_at before update on galpon.oferta_imagen
  for each row execute function galpon.tg_actualizado_at();

alter table galpon.oferta_imagen enable row level security;
alter table galpon.oferta_imagen force row level security;

-- Mismo criterio que el resto de "oferta": todo el equipo lee, solo un
-- administrador crea, cambia o borra la imagen.
create policy oferta_imagen_lectura on galpon.oferta_imagen
  for select to authenticated using (galpon.es_miembro());
create policy oferta_imagen_admin on galpon.oferta_imagen
  for all to authenticated using (galpon.es_admin()) with check (galpon.es_admin());
