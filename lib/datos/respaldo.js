import { esUuid, nuevoId } from "@/lib/datos/traduccion";

/* Traducción de identificadores al restaurar un respaldo.

   El sistema anterior generaba identificadores propios, del estilo
   "sup_msseiz1q_vg20o2" o "prod_lx3k7_ab12". Las tablas usan uuid, así que un
   respaldo viejo no entra tal cual: la base rechaza el primer proveedor y se
   corta la carga entera.

   Acá se recorre el respaldo completo, se le asigna un uuid a cada
   identificador antiguo, y se reescriben también todas las referencias que lo
   usaban. Lo importante es que la traducción sea una sola para todo el archivo:
   si el proveedor cambia de identificador, los productos que lo apuntaban
   tienen que cambiar con él, o el vínculo se pierde. */

/* Dónde vive cada referencia dentro del respaldo. Es el mapa que hay que
   mantener al día si alguna vez se agrega un campo que apunte a otra cosa. */
const REFERENCIAS = {
  products: ["supplierId"],
  suppliers: [],
  workers: [],
  feedback: [],
  sales: [],
  movements: ["supplierId", "invoiceId", "productId", "workerId", "saleId"],
  openShifts: [],
  shiftsLog: [],
  invoicesIndex: ["supplierId"],
  purchaseItems: ["invoiceId", "supplierId", "productId"],
  inventoryCounts: [],
  transformations: ["outputProductId"],
};

/* Listas anidadas que también traen referencias. */
const ANIDADOS = {
  sales: [{ campo: "items", refs: ["productId"] }],
  inventoryCounts: [{ campo: "items", refs: ["productId"] }],
  transformations: [{ campo: "inputs", refs: ["productId"] }],
  openShifts: [
    { campo: "withdrawals", refs: [], propio: true },
    { campo: "reinforcements", refs: [], propio: true },
  ],
  shiftsLog: [
    { campo: "withdrawals", refs: [], propio: true },
    { campo: "reinforcements", refs: [], propio: true },
  ],
};

export function normalizarRespaldo(datos) {
  if (!datos || typeof datos !== "object") return { datos, traducidos: 0 };

  const equivalencias = new Map();
  const traducir = (viejo) => {
    if (!viejo || typeof viejo !== "string") return viejo;
    if (esUuid(viejo)) return viejo;         // ya está en el formato correcto
    if (!equivalencias.has(viejo)) equivalencias.set(viejo, nuevoId());
    return equivalencias.get(viejo);
  };

  const copia = JSON.parse(JSON.stringify(datos));

  // Primera pasada: se traducen los identificadores propios de cada registro.
  // Tiene que ir completa antes de tocar las referencias, para que cuando un
  // producto busque a su proveedor la equivalencia ya exista.
  for (const coleccion of Object.keys(REFERENCIAS)) {
    const lista = copia[coleccion];
    if (!Array.isArray(lista)) continue;
    for (const fila of lista) {
      if (fila?.id) fila.id = traducir(fila.id);
      for (const anidado of ANIDADOS[coleccion] || []) {
        if (!anidado.propio) continue;
        for (const hijo of fila?.[anidado.campo] || []) {
          if (hijo?.id) hijo.id = traducir(hijo.id);
        }
      }
    }
  }

  // Segunda pasada: las referencias hacia otros registros.
  for (const [coleccion, campos] of Object.entries(REFERENCIAS)) {
    const lista = copia[coleccion];
    if (!Array.isArray(lista)) continue;
    for (const fila of lista) {
      for (const campo of campos) {
        if (fila?.[campo]) fila[campo] = traducir(fila[campo]);
      }
      for (const anidado of ANIDADOS[coleccion] || []) {
        for (const hijo of fila?.[anidado.campo] || []) {
          for (const campo of anidado.refs) {
            if (hijo?.[campo]) hijo[campo] = traducir(hijo[campo]);
          }
        }
      }
    }
  }

  // Los conteos apuntan a la persona asignada, pero ese identificador viene de
  // las cuentas del sistema anterior y las cuentas no se restauran: las maneja
  // Supabase Auth. Inventarle un uuid solo crearía una referencia rota, así que
  // se descarta y queda el nombre, que la capa de datos sí puede resolver
  // contra las cuentas que existen de verdad.
  for (const c of copia.inventoryCounts || []) {
    if (c.assignedToId && !esUuid(c.assignedToId)) c.assignedToId = null;
  }

  // Referencias que apuntan a algo que el respaldo no trae. El sistema anterior
  // guardaba cada colección por separado y sin comprobar nada entre ellas, así
  // que hay líneas de compra que nombran documentos perdidos y movimientos que
  // nombran facturas que ya no están. La base sí lo comprueba y rechazaría la
  // fila entera: se prefiere conservar el registro y soltar el vínculo roto.
  const sueltos = descolgarReferenciasRotas(copia);

  return { datos: copia, traducidos: equivalencias.size, sueltos };
}

/* Dónde tiene que existir cada referencia para ser válida. */
const DESTINOS = [
  ["products", "supplierId", "suppliers"],
  ["invoicesIndex", "supplierId", "suppliers"],
  ["purchaseItems", "supplierId", "suppliers"],
  ["purchaseItems", "invoiceId", "invoicesIndex"],
  ["purchaseItems", "productId", "products"],
  ["movements", "supplierId", "suppliers"],
  ["movements", "invoiceId", "invoicesIndex"],
  ["movements", "productId", "products"],
  ["movements", "workerId", "workers"],
  ["transformations", "outputProductId", "products"],
];

function descolgarReferenciasRotas(copia) {
  const idsDe = (coleccion) =>
    new Set((copia[coleccion] || []).map((x) => x?.id).filter(Boolean));

  const conocidos = {};
  const sueltos = {};

  for (const [coleccion, campo, destino] of DESTINOS) {
    if (!Array.isArray(copia[coleccion])) continue;
    conocidos[destino] = conocidos[destino] || idsDe(destino);
    for (const fila of copia[coleccion]) {
      if (fila?.[campo] && !conocidos[destino].has(fila[campo])) {
        fila[campo] = null;
        const k = `${coleccion}.${campo}`;
        sueltos[k] = (sueltos[k] || 0) + 1;
      }
    }
  }

  // Las líneas de una venta también pueden nombrar productos que ya no están.
  conocidos.products = conocidos.products || idsDe("products");
  for (const v of copia.sales || []) {
    for (const it of v.items || []) {
      if (it?.productId && !conocidos.products.has(it.productId)) {
        it.productId = null;
        sueltos["sales.items.productId"] = (sueltos["sales.items.productId"] || 0) + 1;
      }
    }
  }

  return sueltos;
}
