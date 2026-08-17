/* Comparación entre la última lectura y lo que la aplicación quiere guardar.

   Las pantallas siguen trabajando con la lista completa en memoria y llaman a
   guardar con la lista entera, igual que antes. En vez de reescribir todo, se
   compara contra la última copia conocida y se manda a la base solo lo que
   cambió: lo nuevo, lo modificado y lo que desapareció. */

export function diferencias(anterior, actual, clave = "id") {
  const antes = new Map();
  for (const x of anterior || []) if (x && x[clave]) antes.set(x[clave], x);

  const nuevos = [];
  const cambiados = [];
  const vistos = new Set();

  for (const x of actual || []) {
    if (!x || !x[clave]) continue;
    vistos.add(x[clave]);
    const previo = antes.get(x[clave]);
    if (previo) cambiados.push({ antes: previo, ahora: x });
    else nuevos.push(x);
  }

  const eliminados = [];
  for (const [id, x] of antes) if (!vistos.has(id)) eliminados.push(x);

  return { nuevos, cambiados, eliminados };
}

/* Para los registros que solo crecen (ventas, movimientos de caja, compras):
   basta con saber cuáles son nuevos. Nunca se editan ni se borran desde las
   pantallas, y tratarlos así evita reescrituras innecesarias. */
export function soloNuevos(anterior, actual, clave = "id") {
  const antes = new Set((anterior || []).map((x) => x?.[clave]));
  return (actual || []).filter((x) => x && x[clave] && !antes.has(x[clave]));
}
