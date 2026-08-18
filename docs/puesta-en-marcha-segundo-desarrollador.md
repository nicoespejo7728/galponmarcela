# Sumar a una segunda persona al proyecto

Guía completa para que otra persona, con **su propia cuenta de Claude** y su
computador con **Windows**, empiece a desarrollar El Galpón sin tocar los datos
reales del negocio.

Está pensada para leerse de corrido. La parte A la hace Nico; la parte B, la
persona que se suma —se le puede enviar tal cual—; la parte C es de los dos.

**Cómo se conectan las dos cuentas de Claude:** no se conectan. Cada sesión de
Claude trabaja sobre una copia del proyecto en su propio computador, y el punto
de encuentro es GitHub. Uno sube (`push`), el otro baja (`pull`). No hay nada
que enlazar entre las cuentas.

**Lo bueno de este montaje:** como cada uno usa su propia base de datos, no hay
ninguna clave que pasarse. Ni contraseñas, ni claves de Supabase, ni acceso al
panel donde están los datos de Espejo Fruits.

---

# Parte A — Lo que hace Nico (15 minutos)

## A1. Pedirle el usuario de GitHub

Si todavía no tiene cuenta, que la cree en <https://github.com/signup> (es
gratis, pide correo y nada más) y te mande su **nombre de usuario**.

## A2. Invitarlo al repositorio

1. Entra a <https://github.com/nicoespejo7728/galponmarcela>
2. **Settings** (arriba a la derecha, en la barra del repositorio)
3. Menú izquierdo → **Collaborators**
4. Botón **Add people**
5. Escribe su nombre de usuario, selecciónalo
6. Permiso: **Write**
7. **Add ... to this repository**

Le llega un correo con la invitación. Hasta que la acepte, no puede clonar.

> **Write** le deja crear ramas y abrir pull requests. No le deja borrar el
> repositorio ni cambiar su configuración.

## A3. Proteger `main` (recomendado, 2 minutos)

Cada push a `main` publica en `www.galponmarcela.cl`. Para que eso nunca pase
por descuido:

1. **Settings** → **Branches** → **Add branch protection rule**
2. Branch name pattern: `main`
3. Marca **Require a pull request before merging**
4. Marca **Require approvals** → 1
5. **Create**

Desde ahí, todo cambio —tuyo también— entra revisado por pull request.

## A4. Enviarle esta guía

El archivo es `docs/puesta-en-marcha-segundo-desarrollador.md` dentro del
repositorio, así que una vez que acepte la invitación lo tiene solo. Para el
primer día, mándale el enlace directo o el archivo por correo.

## A5. Lo que NO hay que enviarle

- Tu archivo `.env.local`.
- Las claves de Supabase del proyecto INTRANET.
- La `SUPABASE_SERVICE_ROLE_KEY`.
- El respaldo `respaldo-el-galpon-2026-08-17.json` (tiene contraseñas del
  equipo en texto plano; bórralo cuando ya no lo necesites).

Él arma su propia base vacía en la parte B. No necesita nada de eso.

---

# Parte B — Lo que hace la persona que se suma

Tiempo total: entre 45 minutos y una hora, casi todo esperando instaladores.

## B1. Aceptar la invitación de GitHub

Busca el correo de GitHub ("invited you to collaborate") y pulsa **Accept
invitation**. Si no llega, entra a <https://github.com/notifications> con tu
cuenta.

## B2. Instalar Git

1. Descarga **Git for Windows**: <https://git-scm.com/download/win>
2. Ejecuta el instalador y acepta todo lo que viene por omisión (siguiente,
   siguiente, siguiente). No hace falta cambiar ninguna opción.
3. Al terminar tienes **Git Bash** en el menú Inicio. **Todos los comandos de
   esta guía se escriben en Git Bash**, no en el símbolo del sistema: así las
   rutas con `/` y los comandos funcionan igual que en Mac.

Comprueba abriendo Git Bash y escribiendo:

```bash
git --version
```

Tiene que responder algo como `git version 2.4x.x`.

## B3. Instalar Node.js

1. Descarga la versión **LTS** desde <https://nodejs.org>
2. Instalador, siguiente hasta el final.
3. **Cierra y vuelve a abrir Git Bash** (si no, no encuentra el comando).

```bash
node --version    # tiene que decir v20 o superior
npm --version
```

## B4. Presentarte ante Git

Una sola vez, con tu nombre y el correo de tu cuenta de GitHub:

```bash
git config --global user.name "Tu Nombre"
git config --global user.email "tucorreo@ejemplo.cl"
```

> Si tu correo está marcado como privado en GitHub, usa el que GitHub te da
> para eso: lo encuentras en **Settings → Emails**, dice
> `12345678+usuario@users.noreply.github.com`. Si no lo haces, el primer push
> te va a rebotar con el error `GH007`.

## B5. Clonar el proyecto

Elige dónde vivirá. Por ejemplo, en tu carpeta de usuario:

```bash
cd ~
mkdir proyectos
cd proyectos
git clone https://github.com/nicoespejo7728/galponmarcela.git
cd galponmarcela
```

La primera vez te va a pedir iniciar sesión en GitHub: se abre una ventana del
navegador, entras con tu cuenta y listo. En Windows queda guardado.

Instala las dependencias (tarda unos minutos):

```bash
npm install
```

## B6. Crear tu propia base de datos

Esto es lo que te deja trabajar tranquilo: una copia vacía del sistema, con la
misma estructura, donde puedes probar, romper y borrar sin consecuencias.

1. Entra a <https://supabase.com> y crea una cuenta (el plan gratuito alcanza
   de sobra).
2. **New project**:
   - Name: `galpon-dev`
   - Database password: genera una y **guárdala en tu gestor de contraseñas**
   - Region: South America (São Paulo) o la más cercana
3. Espera 2 o 3 minutos a que termine de crearse.

### B6.1 Aplicar las migraciones

En el panel de Supabase, menú izquierdo → **SQL Editor** → **New query**.

En tu carpeta del proyecto está `supabase/migrations/` con nueve archivos.
**Uno por uno y en orden numérico**, abre el archivo, copia todo su contenido,
pégalo en el editor y pulsa **Run**:

```
0001_galpon_esquema.sql
0002_galpon_indices_triggers.sql
0003_galpon_vistas_funciones.sql
0004_galpon_rls.sql
0005_galpon_semillas.sql
0006_galpon_endurecer.sql
0007_galpon_categorias_por_el_equipo.sql
0008_galpon_nombres_repetidos.sql
0009_galpon_sincronizar_boletas.sql
```

Cada uno tiene que terminar con **Success**. Si uno falla, no sigas con el
siguiente: el orden importa y el error se arrastra.

### B6.2 Publicar el esquema `galpon` en la API

Las tablas viven en un esquema propio, y Supabase no lo expone solo:

1. **Project Settings** (el engranaje, abajo a la izquierda) → **API**
2. Busca **Exposed schemas** (o *Data API* → *Exposed schemas*)
3. Agrega `galpon` a la lista, junto a `public`
4. **Save**

Si no encuentras esa opción en tu versión del panel, hace lo mismo desde el
SQL Editor:

```sql
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, galpon';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
```

Las dos últimas líneas no son opcionales: el valor queda guardado, pero el
servicio que atiende la API sigue con la lista vieja en memoria hasta que se le
avisa. Si aun así no toma el cambio, **Project Settings → General → Restart
project** lo levanta de cero.

> Si te saltas este paso, el sistema abre pero no carga nada y la consola del
> navegador muestra errores de esquema.

### B6.3 Crear los dos depósitos de archivos

Menú izquierdo → **Storage** → **New bucket**:

- `galpon-facturas` — **privado** (deja el interruptor "Public bucket"
  apagado). Guarda las fotos de facturas de compra.
- `galpon-publico` — **público**. Guarda el logo del negocio.

### B6.4 Crear tu cuenta de administrador

El sistema no entra con correo, sino con usuario. Por dentro cada usuario es
una cuenta de Supabase Auth con el correo `<usuario>@elgalpon.local`.

1. Menú izquierdo → **Authentication** → **Users** → **Add user** → **Create
   new user**
2. Email: `dev@elgalpon.local`
3. Password: la que quieras (anótala, es con la que entrarás al sistema)
4. Marca **Auto Confirm User**
5. **Create user**

Ahora, en el **SQL Editor**, dale perfil de administrador:

```sql
insert into galpon.perfil (id, nombre, usuario, rol)
select id, 'Dev', 'dev', 'admin'
from auth.users
where email = 'dev@elgalpon.local'
on conflict (id) do nothing;
```

Tiene que decir `Success. 1 row`.

### B6.5 Copiar tus claves

**Project Settings** → **API**. Necesitas dos valores:

- **Project URL** — algo como `https://abcdefgh.supabase.co`
- La clave **publicable** (`anon` / `publishable`) — un texto largo

## B7. Configurar el proyecto

En Git Bash, dentro de la carpeta del proyecto:

```bash
cp .env.example .env.local
notepad .env.local
```

Completa **con tus valores**, los de tu proyecto `galpon-dev`:

```
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu clave publicable>
SUPABASE_SERVICE_ROLE_KEY=<tu clave de servicio, opcional>
ANTHROPIC_API_KEY=
```

- La **clave de servicio** (Project Settings → API → `service_role`) solo hace
  falta si vas a trabajar la pestaña Usuarios. Es tuya y de tu base de pruebas;
  aun así, nunca la escribas con el prefijo `NEXT_PUBLIC_` ni la subas a git.
- `ANTHROPIC_API_KEY` es opcional: sirve para leer facturas con foto. Si la
  quieres, saca una tuya en <https://console.anthropic.com>. Sin ella, esa
  función avisa y el resto funciona igual.

`.env.local` está en `.gitignore`: no se sube nunca. Guárdalo así.

## B8. Levantar el sistema

```bash
npm run dev
```

Abre <http://localhost:3000/sistema>, entra con usuario `dev` y la contraseña
que pusiste en B6.4. Vas a ver el sistema completo, vacío. El PIN de
administrador de arranque es `1234`, y se cambia desde Ajustes.

Para parar el servidor: `Ctrl + C` en Git Bash.

## B9. Conectar el proyecto a tu cuenta de Claude

Con la aplicación de escritorio de Claude:

1. Abre Claude e inicia una tarea nueva de Cowork.
2. Conecta la carpeta `galponmarcela` que clonaste.
3. Listo: Claude lee solo el archivo `CLAUDE.md` de la raíz, donde están las
   reglas del proyecto, las convenciones y qué comprobar antes de dar algo por
   terminado. No hace falta que se las expliques cada vez.

Antes de pedir el primer cambio, léete `README.md` (cómo está armado el
proyecto, sobre todo la parte del puente de datos) y `CLAUDE.md`.

## B10. Tu primer cambio, de punta a punta

```bash
git checkout main
git pull
git checkout -b vender/tu-cambio

# ... trabajas con Claude ...

npm run build          # tiene que compilar sin errores
git add -A
git commit -m "Vender: descripción corta de lo que hace"
git push -u origin vender/tu-cambio
```

Entra a GitHub: aparece un botón **Compare & pull request**. Púlsalo, escribe
en dos líneas qué cambiaste y **Create pull request**.

Vercel construye tu rama sola y deja el enlace de la vista previa como
comentario en el pull request. Nico revisa ahí y fusiona.

---

# Parte C — Las cuatro reglas de convivencia

1. **Nunca directo a `main`.** Todo entra por rama y pull request, aunque sea
   una línea. `main` es lo que están usando en el almacén ahora mismo.

2. **Avisar en qué pestaña se va a trabajar.** `components/sistema-ventas.jsx`
   son 10.700 líneas en un archivo solo. Dos personas en pestañas distintas casi
   nunca chocan; dos personas en la misma pestaña chocan siempre, y git no sabe
   resolver eso con criterio.

3. **`git pull` antes de empezar, siempre.** Ramas cortas y fusionadas pronto.
   Una rama de dos semanas sobre ese archivo es un conflicto asegurado.

4. **Las migraciones van numeradas y no se editan.** La siguiente libre es la
   `0010`. Si los dos crean una `0010`, el segundo renumera antes de fusionar.
   Una migración ya aplicada nunca se corrige encima: se escribe la que la
   arregla. Aplicarlas a la base real la hace Nico, después de fusionar.

---

# Si algo falla

| Qué ves | Qué pasa |
|---|---|
| `GH007: your push would publish a private email address` | El correo del commit está oculto en GitHub. Ver B4, y después `git commit --amend --reset-author --no-edit` y volver a empujar. |
| `! [rejected] ... (fetch first)` | Alguien empujó antes que tú. `git pull --rebase` y vuelve a empujar. |
| El sistema abre pero no carga nada | Falta exponer el esquema `galpon` en la API (B6.2), o las claves de `.env.local` no son las de tu proyecto. |
| "No se pudo entrar al sistema" y en la consola `Could not find the table 'galpon.perfil' in the schema cache` | La base está bien; la caché de la API quedó atrasada. `notify pgrst, 'reload schema';` y recarga con Ctrl+Shift+R. Si insiste, reinicia el proyecto. |
| "Usuario o contraseña incorrectos" | Ese sí es la cuenta. Si dice cualquier otra cosa, el problema no es la contraseña. |
| `Permission denied` al clonar | No aceptaste la invitación de GitHub, o iniciaste sesión con otra cuenta. |
| `npm: command not found` | No cerraste y volviste a abrir Git Bash después de instalar Node. |
| Al subir una foto de factura falla | Faltan los buckets de Storage (B6.3), o sus permisos. |
