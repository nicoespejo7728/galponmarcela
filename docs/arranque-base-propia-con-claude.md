# Armar la base de datos de desarrollo desde el otro computador

La base de El Galpón vive en el proyecto Supabase `INTRANET`, que es de la
cuenta de Nico y además guarda los datos de Espejo Fruits. Esa base **no se
asocia** a otra cuenta de Supabase: para verla desde otra cuenta habría que
sumar a esa persona a la organización completa, y con eso vería también todo lo
de Espejo Fruits.

Lo que corresponde es que el segundo computador tenga **su propia base**: misma
estructura, sin datos. Como Claude ya tiene ahí el conector de Supabase, lo
puede armar solo.

## Mensaje para pegar en el Claude del otro computador

> Trabajo en el proyecto El Galpón, que está clonado en esta carpeta
> (`galponmarcela`). Necesito una base de datos de desarrollo propia, separada
> de la de producción. Usa el conector de Supabase de mi cuenta y hazlo tú:
>
> 1. Crea un proyecto Supabase nuevo, gratuito, llamado `galpon-dev`, en la
>    región más cercana a Chile.
> 2. Aplica las migraciones de `supabase/migrations/` una por una y **en orden
>    numérico**, de la `0001` a la `0009`. Si alguna falla, detente y dime cuál
>    y por qué; no sigas con la siguiente.
> 3. Expón el esquema `galpon` en la API del proyecto:
>    `alter role authenticator set pgrst.db_schemas = 'public, graphql_public, galpon';`
>    y **enseguida refresca la caché de la API**, que si no queda con la lista
>    vieja en memoria y todas las consultas responden 404:
>    `notify pgrst, 'reload config';` y `notify pgrst, 'reload schema';`
>    Sin este paso el sistema abre pero no carga nada.
> 4. Crea dos buckets de Storage: `galpon-facturas` privado y `galpon-publico`
>    público.
> 5. Crea mi cuenta de administrador: un usuario de Supabase Auth con correo
>    `dev@elgalpon.local`, confirmado, con la contraseña que te indique; y su
>    fila en `galpon.perfil` con `nombre` 'Dev', `usuario` 'dev' y `rol` 'admin'.
> 6. Escribe `.env.local` en la raíz del proyecto con la URL y la clave
>    publicable de ese proyecto nuevo. La clave de servicio va sin el prefijo
>    `NEXT_PUBLIC_`. No subas ese archivo a git.
> 7. Levanta `npm run dev` y comprueba que puedo entrar en
>    `http://localhost:3000/sistema` con el usuario `dev`.
>
> Antes de empezar, lee `CLAUDE.md` y `README.md`: ahí están las reglas del
> proyecto. Y no toques nunca el proyecto Supabase `INTRANET`, que es la base
> real del negocio.

## Si al entrar dice "No se pudo entrar al sistema"

Con la consola del navegador abierta (F12) se distingue en un vistazo:

- **`Could not find the table 'galpon.perfil' in the schema cache`** — las
  tablas están y los permisos también; lo que quedó atrasado es la caché de la
  API. Se arregla con `notify pgrst, 'reload schema';` y, si insiste,
  reiniciando el proyecto desde Project Settings → General → Restart project.
- **`The schema must be one of the following: public, graphql_public`** — falta
  exponer `galpon` (paso 3).

Esta consulta responde las tres preguntas de una vez, y hay que correrla en el
proyecto que aparece en la dirección de los errores del navegador:

```sql
select
  (select count(*) from information_schema.tables
     where table_schema = 'galpon') as tablas,
  (select count(*) from information_schema.role_table_grants
     where table_schema = 'galpon' and grantee = 'authenticated'
       and privilege_type = 'SELECT') as con_permiso,
  (select rolconfig::text from pg_roles
     where rolname = 'authenticator') as esquemas_api;
```

Con las migraciones bien aplicadas devuelve 35, 35 y una lista que incluye
`galpon`. Si `tablas` es 0, las migraciones se aplicaron en otro proyecto. Si
`con_permiso` es 0, faltó la migración `0004`, que es la que da acceso al rol
`authenticated`.

> El editor SQL de Supabase muestra solo el resultado de la última consulta
> cuando se pegan varias juntas. Por eso esta va en una sola.

## Qué queda después

Dos bases con la misma estructura y datos distintos:

| | Base | Quién la toca |
|---|---|---|
| Producción | `INTRANET`, esquema `galpon` | Nico |
| Desarrollo | `galpon-dev` | el segundo computador |

El código es el mismo para las dos: lo único que cambia es `.env.local`, que no
viaja por git. Por eso una rama probada en `galpon-dev` funciona igual al
fusionarla a producción.

## Si en algún momento se necesita ver los datos reales

Sin dar acceso al panel: Nico le pasa `NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_ANON_KEY` de producción, por gestor de contraseñas, y esa
persona las pone en su `.env.local`. La aplicación funciona contra los datos de
verdad y su cuenta de trabajador manda —lo protegen las políticas RLS—, pero
**todo lo que pruebe se escribe sobre ventas y stock reales**. Es para mirar,
no para desarrollar.
