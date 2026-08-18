# Publicar desde el segundo computador (Windows)

Cómo un cambio hecho en el otro computador llega a verse: primero en su propio
navegador, después en una vista previa en internet, y al final en
`www.galponmarcela.cl`.

## Lo primero: qué actualiza qué

Conviene tenerlo claro antes de empezar, porque `git push` **no** publica el
sitio por sí solo.

| Lo que haces | Qué se actualiza |
|---|---|
| Guardar un archivo con `npm run dev` corriendo | Tu navegador, al instante (`localhost:3000`) |
| `git push` de tu rama | Una **vista previa** en internet, con dirección propia. El sitio real no se toca |
| Fusionar el pull request a `main` | `www.galponmarcela.cl`, en 1 o 2 minutos |

Es a propósito: `main` es lo que está usando el almacén ahora mismo. Nada llega
ahí sin pasar antes por una rama y un pull request.

---

## Preparar la terminal, una sola vez

Todo esto se hace en **Git Bash** (viene con Git for Windows; búscalo en el
menú Inicio). Funciona igual que una terminal de Mac o Linux, así que los
comandos de esta guía sirven tal cual.

### 1. Quién firma los commits

```bash
git config --global user.name "Tu Nombre"
git config --global user.email "tucorreo@ejemplo.cl"
```

Si tu correo está oculto en GitHub, usa el que te da GitHub para esto —
**Settings → Emails**, dice algo como `12345678+usuario@users.noreply.github.com`.
Si no, el primer push rebota con el error `GH007`.

### 2. La contraseña de GitHub

No se usa contraseña: Git for Windows instala el **Credential Manager**, que
abre una ventana del navegador la primera vez que empujas. Entras con tu cuenta
de GitHub, autorizas, y queda guardado en Windows para siempre.

Comprueba que está activo:

```bash
git config --global credential.helper
```

Tiene que responder `manager`. Si no responde nada:

```bash
git config --global credential.helper manager
```

> **Si la ventana no aparece o falla**, usa un token: GitHub → **Settings →
> Developer settings → Personal access tokens → Fine-grained tokens → Generate
> new token**. Repositorio: solo `galponmarcela`. Permiso: **Contents → Read and
> write**. Cuando `git push` pida usuario y contraseña, el usuario es tu nombre
> de GitHub y la contraseña es el token.

### 3. Comprobar que el repositorio apunta donde debe

```bash
cd ~/proyectos/galponmarcela        # o donde lo hayas clonado
git remote -v
```

Las dos líneas tienen que decir
`https://github.com/nicoespejo7728/galponmarcela.git`.

---

## El ciclo de trabajo, cada vez

```bash
# 1. Partir de lo último que hay publicado
git checkout main
git pull

# 2. Una rama para lo que vas a hacer
git checkout -b vender/descuento-por-kilo

# 3. Trabajar, viéndolo en tu navegador
npm run dev                 # http://localhost:3000/sistema
#    (se recarga solo al guardar; Ctrl+C para parar)

# 4. Comprobar que compila de verdad
npm run build

# 5. Guardar y subir
git add -A
git commit -m "Vender: descuento por kilo en productos a granel"
git push -u origin vender/descuento-por-kilo
```

La primera vez que empujas una rama va con `-u origin <rama>`. Después, dentro
de esa misma rama, basta con `git push`.

### Y en GitHub

Al entrar al repositorio aparece un aviso amarillo con **Compare & pull
request**. Púlsalo, escribe en dos líneas qué cambiaste y **Create pull
request**.

Vercel construye tu rama sola y deja el enlace de la vista previa como
comentario en el pull request, con el aspecto
`galponmarcela-git-vender-descuento-xxxx.vercel.app`. Ahí se revisa el cambio
funcionando, sin tocar el sitio real.

Cuando Nico fusiona el pull request, Vercel publica en
`www.galponmarcela.cl`. Un par de minutos.

---

## Lo que Nico tiene que habilitar una vez

Para que la otra persona pueda **abrir** esas vistas previas, hay que soltar la
protección que Vercel les pone por omisión (hoy solo las ve quien tenga la
cuenta de Vercel del proyecto):

1. Vercel → proyecto `galponmarcela` → **Settings**
2. **Deployment Protection**
3. **Vercel Authentication**: desactivarla para las vistas previas

Quedan en direcciones públicas, pero imposibles de adivinar, y solo muestran la
pantalla de ingreso: los datos siguen protegidos por el inicio de sesión del
sistema y las políticas de la base.

Si prefieres no soltar esa protección, la alternativa es que él revise en su
`localhost` y tú mires la vista previa antes de fusionar.

---

## Después de fusionar, los dos

En el otro computador y en el de Nico, para quedar al día:

```bash
git checkout main
git pull
```

La rama ya fusionada se puede borrar sin miedo:

```bash
git branch -d vender/descuento-por-kilo
```

---

## Errores que van a aparecer

**`GH007: your push would publish a private email address`**
El correo del commit está oculto en GitHub. Arregla la configuración (paso 1) y
después:

```bash
git commit --amend --reset-author --no-edit
git push
```

**`! [rejected] ... (fetch first)`**
Alguien empujó antes que tú a esa misma rama.

```bash
git pull --rebase
git push
```

**`Permission denied` o `Authentication failed`**
No aceptaste la invitación al repositorio, o Windows guardó las credenciales de
otra cuenta de GitHub. Para borrarlas: Panel de control → **Administrador de
credenciales** → *Credenciales de Windows* → quita las entradas
`git:https://github.com` y vuelve a empujar; te preguntará de nuevo.

**`protected branch` al empujar a `main`**
Está bien que pase: `main` no recibe pushes directos. Crea una rama y abre un
pull request.

**La vista previa no aparece en el pull request**
La construcción falló. En el pull request, `Details` junto a la comprobación de
Vercel muestra el registro. Casi siempre es lo mismo que habría fallado en
`npm run build`.
