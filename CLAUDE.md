# Notas para quien trabaje este repositorio con Claude

Este archivo lo lee Claude solo al abrir el proyecto. Está para que una sesión
nueva —de cualquier cuenta, en cualquier computador— entienda las reglas del
proyecto sin tener que reconstruirlas preguntando.

Lo demás está en `README.md` (cómo está armado) y en
`docs/trabajo-en-equipo.md` (cómo se coordinan dos personas).

## Lo que no se toca

- **`SUPABASE_SERVICE_ROLE_KEY` jamás lleva el prefijo `NEXT_PUBLIC_`.** Con ese
  prefijo Next la publica en el JavaScript del navegador y cualquiera queda con
  acceso total a la base, sin las políticas RLS de por medio.
- **La base es el esquema `galpon` dentro del proyecto Supabase `INTRANET`**, que
  además guarda datos de Espejo Fruits. Nada de consultas fuera de `galpon`.
- **Hay datos reales en producción** desde el primer día: 4.772 productos, el
  historial de ventas y el kárdex. Nada de scripts que borren o rehagan tablas
  sin acordarlo antes.
- **Tailwind está limitado a `/sistema`.** Su preflight pisa el CSS propio del
  sitio público. Ver `tailwind.config.js` antes de ampliar el alcance.

## Cómo se escribe acá

- **Todo en español**: nombres de archivos, funciones, variables, ramas y
  mensajes de commit. La capa de datos usa `cargarJSON`, `guardarJSON`,
  `normalizarRespaldo`; las pantallas conservan los nombres ingleses del
  artefacto original (`POSView`, `addToCart`) y así se quedan.
- **Los comentarios explican el porqué, no el qué.** En prosa, en párrafos
  cortos, como se le explicaría a alguien que llega en seis meses. Si un
  comentario repite lo que el código ya dice, sobra.
- **JavaScript, no TypeScript.**

## `components/sistema-ventas.jsx`

Son ~10.700 líneas y 800 KB: las 12 pestañas del sistema en un solo archivo,
portadas del artefacto original. No se reescribe ni se reordena. Se edita el
trozo puntual que hay que cambiar, con búsquedas exactas.

Es también la razón del flujo de ramas: dos personas editando este archivo a la
vez producen conflictos que git no sabe resolver. Antes de empezar, avisa en qué
pestaña vas a trabajar.

## Paleta y componentes

- `const C` en `sistema-ventas.jsx` es la paleta completa. No hay colores
  sueltos en el código: si falta un tono, se agrega ahí.
- `Btn` tiene las variantes `primary`, `dark`, `ghost`, `ghostClaro`, `danger`,
  `rust`. Sobre fondo oscuro va `ghostClaro`: `ghost` lleva texto tinta y queda
  negro sobre negro.
- Mínimos que ya están en el CSS global (`FONTS`): 14px de texto, 16px en
  campos —bajo eso iOS acerca la pantalla sola—, 44px de área táctil en
  botones, foco siempre visible.
- Cualquier par texto/fondo nuevo se comprueba con contraste AA (4.5:1).

## Antes de dar algo por listo

1. `npm run build` — tiene que compilar sin errores.
2. Mirarlo de verdad a 1440, 834 y 390 px de ancho. Los problemas de esta
   pantalla —elementos apretados, texto invisible sobre fondo oscuro, desborde
   lateral en teléfono— no aparecen leyendo el código, solo mirando.
3. Si tocaste el puente de datos, probar contra datos parecidos a los reales.
   Un mock vacío no detecta choques con lo que ya está en la base: eso ya pasó
   dos veces.

## Sin internet

El almacén está en un barrio y la conexión se corta. Desde agosto de 2026 el
sistema sigue funcionando sin ella:

- El programa queda instalado en el equipo (`public/sw.js`), así que abre
  aunque no haya red — en menos de un segundo.
- Los datos para operar quedan en IndexedDB (`lib/datos/copia-local.js`), así
  que abre **con** el catálogo, los precios y la gente.
- Las ventas, los consumos y los egresos se guardan en una cola
  (`lib/datos/pendientes.js`) y suben solos al volver la conexión.
- Cada equipo recuerda una huella del PIN de quien ya se identificó en él
  (`lib/datos/pin-local.js`), porque sin identificar a nadie no hay venta.

Dos reglas que no se rompen:

- **Todo lo que entre a la cola tiene que poder reintentarse sin duplicar.**
  El identificador lo pone el navegador y la escritura tolera la llave
  repetida. Una operación que no cumpla eso no puede encolarse.
- **El stock se mueve por el kárdex, que es una resta, no un valor absoluto.**
  Por eso dos cajas pueden vender a ciegas y el stock queda bien al subir.
  Escribir `producto.stock` directo rompería justamente esto.

`navigator.onLine` en `false` es una certeza y se usa para saltarse la red;
en `true` no promete nada (un módem prendido sin internet se ve "en línea"),
así que ahí mandan los plazos de espera.

## Base de datos

Las migraciones viven en `supabase/migrations/`, numeradas y en orden. Una
migración aplicada no se edita: se escribe la siguiente. El diagrama completo
está en `docs/modelo-er-el-galpon.html`.

## Ramas

`main` es lo que está publicado — cada push ahí despliega directo a
producción. Ya no es obligatorio pasar por pull request: se puede empujar
directo a `main` cuando el cambio ya se probó (`npm run build` + mirarlo en
los tres anchos). Para cambios grandes, o que conviene que alguien más revise
antes de que lleguen al almacén, sigue disponible el camino de rama + PR
—`vender/`, `inventario/`, `datos/`, `docs/` según lo que toque. Ver
`docs/trabajo-en-equipo.md`.
