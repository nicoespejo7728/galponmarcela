-- Pedido de Fran (nov-2026): simplificar la navegación para quienes, aunque
-- sean administradores (como Mauricio, su socio), usan el sistema sobre
-- todo para el trabajo de bodega (recepción, inventario, conteos) y casi
-- nunca tocan las secciones de oficina (Sueldos, Finanzas, Análisis,
-- Usuarios, Ajustes, Mi Registro). Antes no había forma de aliviar ese
-- menú sin quitarle permisos de administrador a la persona.
--
-- Esta columna guarda, por persona, si prefiere ver el menú reducido (solo
-- Mesón y Bodega) o el completo — una preferencia propia, nunca un permiso:
-- quien la tiene en "true" sigue siendo administrador en todo lo demás, con
-- un botón siempre a mano para volver a ver el menú completo cuando lo
-- necesite.
alter table galpon.perfil
  add column if not exists vista_simplificada boolean not null default false;
