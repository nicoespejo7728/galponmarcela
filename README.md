# El Galpón de Marcela

Sitio público del almacén y sistema interno de punto de venta e inventario.

| | |
|---|---|
| Sitio | `www.galponmarcela.cl` |
| Sistema | `www.galponmarcela.cl/sistema` |
| Base de datos | Supabase, proyecto `INTRANET`, esquema `galpon` |
| Alojamiento | Vercel |

## Cómo está armado

```
app/
  page.jsx                     sitio público
  sistema/page.jsx             punto de venta (solo navegador)
  api/analizar-factura/        lectura de documentos con IA
  api/usuarios/                alta y baja de cuentas del equipo
components/
  sitio-publico.jsx            portado del HTML original
  sistema-ventas.jsx           las 12 pestañas del sistema
lib/
  supabase/cliente.js          conexión, apuntada al esquema galpon
  datos/                       puente entre las pantallas y la base
supabase/migrations/           el esquema completo, versionado
docs/modelo-er-el-galpon.html  diagrama entidad-relación navegable
```

### El puente de datos

El sistema se escribió contra un almacenamiento de tipo "una llave, un JSON":
cada pantalla pide la lista completa y guarda la lista completa. `lib/datos`
mantiene ese contrato hacia afuera —por eso las 10.500 líneas de pantallas
siguen intactas— y por dentro traduce a consultas sobre las 30 tablas.

La pieza clave es la copia de la última lectura: al guardar se compara contra
ella y solo se manda a la base lo que cambió. Un producto que no se tocó no
genera ni una consulta.

Tres cosas que cambiaron de verdad:

- **El stock entra por el kárdex.** Las pantallas siguen calculando el nuevo
  stock, pero el puente manda la *diferencia* con un motivo (`venta`, `merma`,
  `recepcion`…), y el saldo lo lleva la base. Así queda el rastro de dónde salió
  cada unidad, que antes no existía.
- **El número de boleta lo asigna Postgres.** Antes cada caja buscaba "el
  primer número libre" recorriendo todas las ventas, y dos cajas simultáneas
  podían repetirlo.
- **La sincronización entre cajas pide solo lo reciente.** Cada 15 segundos se
  consultan los últimos días, no dos años de historial.

## Variables de entorno

Se cargan en Vercel (Settings → Environment Variables) y en `.env.local` para
desarrollo. Ver `.env.example`.

| Variable | Para qué | Obligatoria |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Dirección del proyecto Supabase | Sí |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave publicable; lo que protege los datos son las políticas RLS | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` | Crear cuentas del equipo desde "Usuarios". Solo servidor | Sí |
| `ANTHROPIC_API_KEY` | Leer documentos de compra con foto. Sin ella, esa función avisa y el resto sigue funcionando | No |

`SUPABASE_SERVICE_ROLE_KEY` nunca debe llevar el prefijo `NEXT_PUBLIC_`: eso la
publicaría en el navegador y daría acceso total a la base.

## Trabajo en equipo

Dos personas sobre el mismo repositorio: `docs/trabajo-en-equipo.md` tiene el
acceso a dar, el flujo de ramas y pull requests, y el acuerdo para no chocar
dentro de `sistema-ventas.jsx`. Las reglas del proyecto para una sesión de
Claude están en `CLAUDE.md`.

## Desarrollo

```bash
npm install
cp .env.example .env.local     # y completar las claves
npm run dev                    # http://localhost:3000
```

## Cuentas

El equipo entra con su usuario de siempre (`fran`, `yane`…). Por dentro, cada
usuario es una cuenta de Supabase Auth con el correo `<usuario>@elgalpon.local`;
las contraseñas las guarda Supabase hasheadas.

Las cuentas nuevas se crean desde la pestaña **Usuarios**, y solo un
administrador puede hacerlo. Eliminar una cuenta la desactiva en vez de
borrarla: sus ventas, turnos y recepciones deben seguir en el historial.

Hay dos PIN y conviene no confundirlos. El **PIN de administrador** (mermas,
aprobaciones) es uno solo para el negocio, se guarda con bcrypt y se cambia
desde **Ajustes**. El **PIN de vendedor** es propio de cada persona, se asigna
en **Usuarios**, y con él se identifica quién hace cada venta y quién registra
cada consumo interno.

## Base de datos

El esquema vive en `supabase/migrations/`, ya aplicado. El diagrama
entidad-relación completo está en `docs/modelo-er-el-galpon.html` — se abre en
cualquier navegador.

Requisitos del proyecto Supabase:

1. `galpon` entre los esquemas expuestos en la API.
2. Buckets `galpon-facturas` (privado) y `galpon-publico`.
3. Al menos una cuenta administradora.

Los tres ya están configurados.
