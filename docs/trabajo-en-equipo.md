# Trabajar el proyecto entre dos personas

Dos personas, cada una con su cuenta de Claude y su propio computador, sobre el
mismo repositorio. Lo que sigue es lo que hay que dejar hecho una vez, y la
rutina de cada día.

El repositorio es el único punto de encuentro: no se pasan archivos sueltos ni
parches por chat.

> **¿Recién sumando a alguien?** `puesta-en-marcha-segundo-desarrollador.md`
> (en esta misma carpeta) es la versión paso a paso, con cada clic: crear la
> cuenta, instalar Git y Node en Windows, armar una base de datos propia y
> hacer el primer pull request. Este documento es el resumen para consultar
> después.

---

## 1. Lo que hace el dueño del proyecto, una sola vez

### Acceso al código

GitHub → `nicoespejo7728/galponmarcela` → **Settings → Collaborators → Add
people** → el usuario de la otra persona, con permiso **Write**.

Con eso puede clonar, crear ramas y abrir pull requests. `main` sigue siendo
tuyo (ver punto 4).

### Acceso a la base de datos

Acá hay que tener cuidado: el sistema vive en el esquema `galpon` **dentro del
proyecto Supabase `INTRANET`**, que también guarda datos de Espejo Fruits. Dar
acceso al panel de Supabase es dar acceso a todo eso.

Dos caminos:

**a) Base de desarrollo aparte (recomendado).** La otra persona crea un
proyecto Supabase gratuito propio y aplica las migraciones de
`supabase/migrations/` en orden. Queda con un sistema idéntico y vacío, donde
puede romper lo que quiera. Nunca ve datos reales.

**b) Contra la base real.** Solo las claves, no el panel:
`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`. La clave
publicable no es un riesgo por sí sola —lo que protege los datos son las
políticas RLS y su cuenta de trabajador—, pero cualquier prueba que haga se
escribe sobre las ventas de verdad.

`SUPABASE_SERVICE_ROLE_KEY` no se comparte salvo que vaya a trabajar la
pestaña Usuarios, y en ese caso conviene que use su propia base.

Las claves se pasan por un gestor de contraseñas o un servicio de secreto de un
solo uso. No por chat, correo ni WhatsApp.

### Vercel

El despliegue lo sigue manejando una sola cuenta: cada rama que se empuja al
repositorio genera una vista previa automática, sin que la otra persona tenga
que entrar a Vercel.

Si necesita abrir esas vistas previas, en **Settings → Deployment Protection**
se puede desactivar la autenticación de Vercel para las vistas previas. Quedan
en direcciones públicas pero imposibles de adivinar; los datos siguen
protegidos por el inicio de sesión del sistema.

---

## 2. Lo que hace la otra persona, una sola vez

```bash
git clone https://github.com/nicoespejo7728/galponmarcela.git
cd galponmarcela
npm install
cp .env.example .env.local        # y completar las claves recibidas
npm run dev                       # http://localhost:3000/sistema
```

Después, en su cuenta de Claude, abre una tarea sobre esa carpeta. Claude lee
solo el archivo `CLAUDE.md` de la raíz: ahí están las reglas del proyecto, así
que no hace falta explicárselas cada vez.

---

## 3. La rutina de cada cambio

Ya no es obligatorio pasar por pull request. Para un cambio chico y ya
probado, directo a `main`:

```bash
git checkout main
git pull                                  # siempre, antes de empezar
# ... trabajo ...
npm run build                             # tiene que pasar
git add -A
git commit -m "Vender: ..."
git push
```

Apenas se empuja, Vercel despliega solo a producción — no hay ningún paso
extra que hacer.

Para un cambio grande, o uno que conviene que la otra persona mire antes de
que llegue al almacén, sigue disponible el camino de antes, con rama y pull
request:

```bash
git checkout -b vender/carrito-por-peso   # zona/qué-hace
# ... trabajo ...
npm run build                             # tiene que pasar
git add -A
git commit -m "Vender: ..."
git push -u origin vender/carrito-por-peso
```

Y en GitHub, **Compare & pull request**. Vercel deja el enlace de la vista
previa como comentario en el pull request: ahí se revisa antes de fusionar.

Nombres de rama por zona: `vender/`, `inventario/`, `caja/`, `datos/`,
`docs/`. Ramas cortas y fusionadas pronto; una rama de dos semanas sobre
`sistema-ventas.jsx` es un conflicto asegurado.

### El acuerdo que evita los conflictos

`components/sistema-ventas.jsx` son 10.700 líneas en un archivo solo. Git no
sabe fusionar dos ediciones simultáneas ahí adentro con criterio.

Antes de empezar, digan en qué pestaña van a trabajar. Dos personas en pestañas
distintas del mismo archivo casi nunca chocan; dos personas en la misma pestaña
chocan siempre. Esto importa más ahora que el push directo a `main` es el
camino normal: ya no hay una revisión de por medio que frene un choque antes
de que llegue a producción.

### Migraciones

Van numeradas: la siguiente libre es la `0010`. Si los dos crean una `0010`, el
segundo renumera la suya antes de fusionar. Una migración ya aplicada no se
edita nunca: se escribe la que corrige.

Aplicar una migración a la base real la hace el dueño del proyecto, después de
fusionar el pull request.

---

## 4. Protección de `main` (ya no es el modo por defecto)

Antes se recomendaba activar en GitHub → **Settings → Branches → Add branch
protection rule**, patrón `main`, las opciones **Require a pull request before
merging** y **Require approvals: 1** — así nadie empujaba sin querer directo a
producción.

Con el cambio a push directo, si esa regla está activada hay que
**desactivarla**: si no, el `git push` a `main` del punto 3 se va a rechazar.
Si en algún momento el equipo prefiere volver a exigir revisión antes de que
un cambio llegue a `www.galponmarcela.cl`, se reactiva desde el mismo lugar.

---

## 5. Si un push queda rechazado

**`GH007: Your push would publish a private email address`.** El correo del
commit está marcado como privado en GitHub. Se arregla firmando con el correo
que sí acepta:

```bash
git config user.email "tu-correo@ejemplo.cl"
git commit --amend --reset-author --no-edit
git push
```

**`! [rejected] ... (fetch first)`.** Alguien empujó antes. `git pull --rebase`
y volver a empujar.
