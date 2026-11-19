/* La migración 0045 creó galpon.perfil_tarjeta pero se quedó corta en los
   permisos de tabla: le dio "select" a authenticated (por eso ver y asignar
   tarjetas desde Usuarios funcionaba bien, ya que eso lo hace el navegador),
   pero nunca le dio ningún permiso a service_role — el rol que usa el
   servidor (app/api/tarjeta/ingresar) para entrar a la cuenta con la
   tarjeta. Por eso entrar con tarjeta fallaba con "permission denied for
   table perfil_tarjeta" aunque todo lo demás (asignar, ver, autorizar)
   funcionara. Se iguala a los permisos que ya tienen perfil y
   config_negocio. */

grant delete, insert, references, select, trigger, truncate, update
  on galpon.perfil_tarjeta to service_role;
