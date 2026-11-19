#!/usr/bin/env node
"use strict";

/* Puente NFC de El Galpón
   =========================

   Qué hace: lee las tarjetas con el lector PC/SC enchufado a ESTE
   computador, y avisa al sistema web (que corre en el navegador, en esta
   misma máquina) cada vez que alguien acerca una.

   Por qué existe: el lector que compró Fran no es de los que "escriben"
   el número como si fuera un teclado (como el lector de código de barras,
   que el navegador ya lee directo) — es un lector PC/SC de verdad, y un
   navegador no puede hablar ese protocolo por sí solo. Este programa hace
   de puente: corre aparte del navegador, habla con el lector por PC/SC, y
   pasa el número de la tarjeta por un WebSocket en este mismo computador
   (ws://127.0.0.1:17890) para que la pestaña del sistema lo reciba.

   Qué NO hace: no sabe nada de quién es cada tarjeta, ni toca la base de
   datos. Eso lo decide el sistema web, que ya tiene el número y lo manda a
   Supabase (ver identificarPorTarjeta/autorizarConTarjeta en
   lib/datos/index.js, y las funciones galpon.identificar_por_tarjeta /
   galpon.autorizar_con_tarjeta de la migración 0043). Este puente solo lee
   el número y lo pasa para adelante — ni siquiera se guarda en un archivo.

   Tiene que estar corriendo (ver README.md para dejarlo arrancando solo
   con Windows) en CADA computador que tenga un lector enchufado. Si no
   está corriendo, o no hay lector conectado, el sistema web simplemente no
   recibe tarjetas y sigue funcionando con PIN como siempre — no es un
   reemplazo que pueda dejar a alguien sin poder identificarse o autorizar
   algo, es un atajo quc se suma. */

const { NFC } = require("nfc-pcsc");
const { WebSocketServer } = require("ws");

const PUERTO = 17890;

const wss = new WebSocketServer({ host: "127.0.0.1", port: PUERTO });
const clientes = new Set();

wss.on("connection", (ws) => {
  clientes.add(ws);
  ws.send(JSON.stringify({ tipo: "conectado" }));
  ws.on("close", () => clientes.delete(ws));
  ws.on("error", () => clientes.delete(ws));
});

wss.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(
      `Ya hay otro puente NFC corriendo en este computador (puerto ${PUERTO} ocupado). ` +
      "No hace falta abrir dos — si esto apareció solo, ciérralo e inténtalo de nuevo."
    );
    process.exit(1);
  }
  console.error("Error del servidor del puente:", err.message);
});

function avisarTarjeta(uid, nombreLector) {
  const mensaje = JSON.stringify({ tipo: "tarjeta", uid, lector: nombreLector, momento: new Date().toISOString() });
  for (const ws of clientes) {
    if (ws.readyState === ws.OPEN) ws.send(mensaje);
  }
}

console.log("============================================");
console.log(" Puente NFC de El Galpón");
console.log(`  escuchando en ws://127.0.0.1:${PUERTO}`);
console.log(" Dejar esta ventana abierta mientras se use la tarjeta.");
console.log("============================================");

const nfc = new NFC();

nfc.on("reader", (reader) => {
  console.log(`[OK] Lector conectado: ${reader.reader.name}`);

  // "aid" en blanco: no hace falta seleccionar ninguna aplicación de la
  // tarjeta (como sí haría una tarjeta bancaria) — con NTAG213/215/216
  // alcanza con que la tarjeta entregue su número de serie (UID), que es
  // lo único que usa el sistema.
  reader.on("card", (card) => {
    // card.uid viene como texto hexadecimal (ej. "04A224CB"). Se deja en
    // mayúsculas; la normalización fina (sacar separadores, etc.) la hace
    // igual la base al comparar (galpon.normalizar_tarjeta), así que no
    // hace falta duplicarla acá.
    const uid = String(card.uid || "").toUpperCase();
    if (!uid) return;
    console.log(`  Tarjeta detectada: ${uid}`);
    avisarTarjeta(uid, reader.reader.name);
  });

  reader.on("error", (err) => {
    // Errores comunes y esperables: tarjeta retirada a medio leer, o una
    // tarjeta de un tipo distinto a NTAG. No tumban el puente.
    console.error(`  Aviso del lector ${reader.reader.name}: ${err.message}`);
  });

  reader.on("end", () => {
    console.log(`[--] Lector desconectado: ${reader.reader.name}`);
  });
});

nfc.on("error", (err) => {
  console.error(
    "[ERROR] No se pudo hablar con el sistema de lectores de este computador " +
    "(el servicio PC/SC de Windows — normalmente viene de fábrica y no hay que instalar nada):",
    err.message
  );
});
