-- =====================================================================
--  EL GALPÓN — Migración 0010: caja común y venta identificada por PIN
--
--  Hasta ahora cada persona tenía su propia caja y su propia sesión, así
--  que "quien vende" y "quien tiene la sesión iniciada en el navegador"
--  eran siempre la misma persona — por eso 0004 exigía vendedor_id =
--  auth.uid() en cada venta, y perfil_id = auth.uid() para operar un turno.
--
--  Ahora la caja es una sola, compartida por todo el equipo. Antes de cada
--  venta la app pide elegir el nombre y el PIN de vendedor de quien
--  realmente está cobrando (verificado en el cliente), y esa persona puede
--  ser distinta de quien tiene la sesión abierta — por ejemplo, un
--  administrador con su propia sesión identificando a un vendedor para esa
--  venta puntual. Lo mismo pasa al operar la caja compartida: retiros,
--  refuerzos y cierre ya no son solo de quien la abrió.
--
--  Esta migración relaja esas cuatro políticas para que cualquier persona
--  con perfil activo (galpon.es_miembro()) pueda escribir, en vez de exigir
--  que coincida con auth.uid(). Es el mismo nivel de acceso que ya tenían
--  movimiento, conteo, transformacion y consumo_interno desde 0004 — venta
--  y turno quedaban como excepción más estricta, y esa excepción es
--  justamente la que dejó de tener sentido con la caja común.
-- =====================================================================

drop policy if exists venta_insert on galpon.venta;
create policy venta_insert on galpon.venta
  for insert to authenticated
  with check (galpon.es_miembro());

comment on policy venta_insert on galpon.venta is
  'La caja es común: cualquier miembro activo registra la venta. A quién se '
  'le atribuye (vendedor_id) lo decide la app según el PIN de vendedor con '
  'el que se identificó quien cobró, no necesariamente quien tiene la '
  'sesión abierta.';

drop policy if exists venta_detalle_insert on galpon.venta_detalle;
create policy venta_detalle_insert on galpon.venta_detalle
  for insert to authenticated
  with check (
    galpon.es_miembro()
    and exists (select 1 from galpon.venta v where v.id = venta_id)
  );

drop policy if exists turno_operar on galpon.turno;
create policy turno_operar on galpon.turno
  for update to authenticated
  using (galpon.es_miembro())
  with check (galpon.es_miembro());

comment on policy turno_operar on galpon.turno is
  'La caja es una sola compartida por el equipo: cualquier miembro activo '
  'puede operarla (retiros, refuerzos, cierre), no solo quien la abrió.';

drop policy if exists turno_mov_insert on galpon.turno_movimiento;
create policy turno_mov_insert on galpon.turno_movimiento
  for insert to authenticated
  with check (
    galpon.es_miembro()
    and registrado_por = auth.uid()
    and exists (
      select 1 from galpon.turno t
      where t.id = turno_id and t.estado = 'abierto'
    )
  );

comment on policy turno_mov_insert on galpon.turno_movimiento is
  'Solo se puede retirar o reforzar efectivo de una caja abierta — ya no '
  'tiene que ser la propia: la caja es una sola para todo el equipo. Quién '
  'lo registró (registrado_por) sigue siendo siempre quien tiene la sesión '
  'abierta.';
