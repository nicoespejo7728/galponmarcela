# Puente NFC de El Galpón

Programa chico que hay que dejar corriendo en **cada computador que tenga
un lector NFC enchufado** (según lo conversado: el de Caja y el de
Recepción/Administración). Lee las tarjetas y se las pasa al sistema web
que corre en el navegador, en esa misma máquina.

No hace falta entenderlo para usarlo — esto queda acá documentado para
cuando lleguen los lectores y lo instalemos juntos. **Por ahora no hay que
hacer nada con este archivo.**

## Por qué hace falta un programa aparte

El lector que compraste no es de los "simples" (que escriben el número
como si fuera un teclado, como el lector de código de barras que el
sistema ya usa). Es un lector/programador NFC de verdad, de los que hablan
con el computador por un protocolo llamado PC/SC — y un navegador (Chrome)
no puede hablar ese protocolo por sí solo. Este programa es el puente:
corre aparte de Chrome, en el mismo computador, y le pasa a la pestaña del
sistema el número de cada tarjeta que se acerca.

## Lo único que hay que saber de antemano

Los dos computadores con lector son de sistemas distintos (uno Windows, el
otro macOS), así que el paso previo es distinto en cada uno — pero en los
dos es por la misma razón: la pieza que habla con el lector es un módulo
nativo (no JavaScript puro), y compilarlo la primera vez necesita un
compilador de C++ que no viene instalado de fábrica. Es un paso extra que
casi nunca hace falta para páginas web normales, así que lo aviso ahora
para que no sea sorpresa. Esto lo puedo hacer yo mismo, conectado a cada
computador, cuando llegue el momento — no es algo que tengas que resolver
tú; lo documento acá nomás para que sepas que ese día va a tomar un rato
(a veces con un reinicio) antes de que el lector quede funcionando en cada
uno.

### En el computador Windows

1. **Python 3** (lo pide la instalación del módulo nativo, no el programa en sí).
2. **Las herramientas de compilación de C++ de Visual Studio** (no hace
   falta Visual Studio completo, solo ese componente — es una descarga de
   varios cientos de MB).

### En el computador macOS

1. **Las herramientas de línea de comandos de Xcode** — se instalan
   escribiendo `xcode-select --install` en la Terminal (sale un diálogo
   que las descarga; no hace falta instalar Xcode completo desde la App
   Store, solo este componente). Traen el compilador de C++ y los mismos
   encabezados de PC/SC que macOS ya trae instalados de fábrica — a
   diferencia de Windows, macOS no necesita ningún driver ni servicio
   aparte para hablar con un lector de tarjetas inteligentes, ya viene
   integrado en el sistema.
2. **Node.js**, si todavía no está instalado en ese computador (se puede
   revisar escribiendo `node -v` en la Terminal — si da un número de
   versión, ya está). Si falta, se instala desde
   [nodejs.org](https://nodejs.org) o, si ya tienes Homebrew, con
   `brew install node`.

(En el computador Windows no hace falta revisar esto: como ya tiene el
resto del sistema instalado para trabajar en el código, ya tiene Node.js.)

## Instalación (cuando lleguen los lectores)

Desde esta carpeta (`herramientas/puente-nfc`):

```
npm install
npm start
```

Si todo sale bien, debería verse algo como:

```
============================================
 Puente NFC de El Galpón
  escuchando en ws://127.0.0.1:17890
 Dejar esta ventana abierta mientras se use la tarjeta.
============================================
[OK] Lector conectado: ACS ACR122U PICC Interface 0
```

Y al acercar una tarjeta:

```
  Tarjeta detectada: 04A224CB
```

Si en vez de "Lector conectado" no aparece nada al enchufar el lector,
probablemente falta el driver (Windows) o el reconocimiento no se
completó (macOS) — en los dos casos debería reconocerlo solo como lector
de tarjetas inteligentes (CCID) la primera vez que se enchufa, sin
instalar nada aparte; si no, lo revisamos juntos con el lector en la mano.

## Dejarlo arrancando solo

### En Windows

1. Presiona `Win + R`, escribe `shell:startup` y presiona Enter — se abre
   la carpeta de inicio de Windows.
2. Crea un acceso directo ahí que ejecute, en esta carpeta:
   `npm start` (o directamente `node puente.js`).
3. La próxima vez que se encienda el computador, el puente arranca solo
   (va a aparecer una ventana negra de consola — se puede minimizar, pero
   no cerrar, mientras se quiera usar la tarjeta ese día).

Si prefieres que no aparezca ninguna ventana, esto también se puede armar
con el Programador de tareas de Windows para que corra oculto — lo dejamos
así si molesta la ventana.

### En macOS

La forma más simple, con ventana visible (igual que en Windows): en
Preferencias/Configuración del Sistema → General → Elementos de inicio
("Login Items"), agregar una app o script que abra la Terminal y corra
`npm start` en esta carpeta.

Si prefieres que no aparezca ninguna ventana, se puede armar un "LaunchAgent"
(el equivalente de macOS al Programador de tareas de Windows) que lo
arranque oculto al iniciar sesión — es un archivo chico de configuración
que yo mismo puedo dejar listo cuando esté el lector en la mano, para no
tener que explicar los detalles de antemano.

## Si algo no funciona

- "Ya hay otro puente NFC corriendo" → ya está abierto en otra ventana,
  no hace falta abrir dos.
- El sistema web no detecta la tarjeta aunque el puente diga "Tarjeta
  detectada" → revisar que el navegador tenga la pestaña del sistema
  abierta y no bloqueada (algunos navegadores piden permiso la primera vez
  para conectarse a `ws://127.0.0.1:17890` desde una página `https://`;
  hay que aceptar ese permiso si aparece).
- Cualquier otra cosa seguramente la resolvemos juntos cuando lo probemos
  con el lector de verdad en la mano — probar en la práctica siempre saca
  cosas que no se ven de antemano.
