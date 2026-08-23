/* De lo que cobra el proveedor a lo que se cobra en el mesón.

   Hay dos clases de factura sobre el mostrador y hasta ahora el sistema
   suponía que todas eran de la primera:

   - **Neto**: el precio unitario viene sin IVA. Al costo hay que sumarle el
     19% y encima el 30% de ganancia.
   - **Con IVA incluido**: el proveedor ya cobra con el 19% adentro. Sumarle
     otro 19% es cobrarlo dos veces, y el producto sale a la venta un 19% más
     caro de lo que corresponde.

   Suponer siempre "neto" no es un error que se note: no revienta nada, no sale
   ningún mensaje, solo que ese producto queda caro y se vende menos. Por eso
   hay que preguntarlo, y no adivinarlo.

   Adentro el sistema guarda SIEMPRE el costo neto. No es un detalle de
   implementación: `costo` es lo que usan el margen, Finanzas, el historial de
   precios y la alerta de "estás vendiendo bajo el costo". Si un producto
   guardara su costo con IVA y otro sin IVA, ninguna de esas cuatro cosas
   volvería a cuadrar, y el desajuste sería invisible. Así que la elección del
   selector se aplica en el borde —al escribir— y de ahí para adentro hay una
   sola unidad de medida. */

export const IVA = 0.19;

/* El 30% es el mínimo de referencia, no una regla: el precio se puede cambiar
   producto por producto. Lo que nunca se cruza es el costo con IVA, y de eso
   se encarga la alerta de venta bajo el costo. */
export const MARGEN = 0.30;

export const FORMAS_DE_COSTO = [
  {
    id: "neto",
    etiqueta: "Neto (sin IVA)",
    corto: "neto",
    ayuda: "El precio unitario de la factura viene sin IVA. Al precio de venta se le suma el 19% y después el 30%.",
  },
  {
    id: "conIva",
    etiqueta: "Con IVA incluido",
    corto: "con IVA",
    ayuda: "El proveedor ya cobra con el 19% adentro. Al precio de venta sólo se le suma el 30%.",
  },
];

export const FORMA_POR_OMISION = "neto";

export function incluyeIva(forma) {
  return forma === "conIva";
}

/* Lo escrito → el neto que se guarda. */
export function netoDesde(valor, forma) {
  const n = Number(valor) || 0;
  return incluyeIva(forma) ? n / (1 + IVA) : n;
}

/* El neto guardado → lo que dice la factura, para poder mostrarlo de vuelta
   en el campo tal como se escribió. */
export function comoEnLaFactura(neto, forma) {
  const n = Number(neto) || 0;
  return incluyeIva(forma) ? n * (1 + IVA) : n;
}

/* Los precios de venta se redondean hacia arriba a la decena. Nadie cobra
   $1.547 en un almacén: se cobra $1.550, y hacia arriba para que el redondeo
   nunca se coma el margen. */
export function redondearPrecio(valor) {
  return Math.ceil((Number(valor) || 0) / 10) * 10;
}

/* El precio sugerido, siempre a partir del costo NETO. */
export function precioSugerido(costoNeto) {
  const conIva = (Number(costoNeto) || 0) * (1 + IVA);
  return redondearPrecio(conIva * (1 + MARGEN));
}

/* El piso que no se cruza: el costo con IVA. Vender ahí o más abajo es
   pérdida segura, sin contar ninguna ganancia. */
export function pisoDePerdida(costoNeto) {
  return (Number(costoNeto) || 0) * (1 + IVA);
}

/* Un número que se pueda volver a mostrar en un campo.

   Dividir por 1,19 y volver a multiplicar no devuelve exactamente lo que
   entró: devuelve 1000.0000000000001, y eso puesto en un campo de texto se ve
   como un error del sistema. Cuatro decimales alcanzan de sobra para un
   costo unitario y hacen que el ida y vuelta se vea limpio. */
export function redondearBonito(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n === 0) return 0;
  return Number(n.toFixed(4));
}

/* La cuenta, en palabras, para poder mostrarla al lado del selector.

   Esto es lo que vuelve visible la elección: en vez de un multiplicador
   escondido, en la pantalla se lee "$1.000 + 19% + 30% = $1.550" o
   "$1.190 + 30% = $1.550". Sin esto el selector es un interruptor que nadie
   sabe si dejó bien puesto. */
export function explicarPrecio(escrito, forma) {
  const partida = Number(escrito) || 0;
  const neto = netoDesde(partida, forma);
  const pasos = incluyeIva(forma) ? ["30%"] : ["19%", "30%"];
  return {
    partida,
    neto,
    pasos,
    precio: precioSugerido(neto),
    /* "1.000 + 19% + 30%" — los pasos que de verdad se aplican. */
    cuenta: pasos.join(" + "),
  };
}
