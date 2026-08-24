/* Cuánto se le carga a alguien por lo que se llevó.

   Son dos cosas distintas y hasta ahora el sistema usaba una sola:

   - **Lo que le costó al negocio** — el costo de la mercadería. Es un hecho
     contable y se guarda tal cual en la base, junto con el detalle de cada
     producto.
   - **Lo que la persona debe** — que no tiene por qué ser lo mismo.

   A un vendedor se le descuenta el **precio de venta**: si se llevó una
   bebida, se llevó lo mismo que se habría llevado un cliente, y el negocio
   dejó de venderla. Cobrarle el costo sería regalarle el margen — y encima
   sin que se note, porque en ninguna parte aparecería la venta que no se hizo.

   Lo que se lleva **la casa** se valoriza al costo. Los dueños no son
   clientes: no hay margen que cobrarse a sí mismos, y lo único real ahí es lo
   que la mercadería le salió al negocio.

   Los dos números se calculan siempre y se muestran los dos. El que manda para
   la cuenta es uno solo, pero ver el otro al lado es lo que deja notar cuánta
   venta se está yendo en consumo. */

export const BASE_VENTA = "venta";
export const BASE_COSTO = "costo";

function suma(items, campo) {
  return (items || []).reduce((s, i) => {
    const cantidad = Number(i?.qty) || 0;
    const valor = Number(i?.[campo]) || 0;
    return s + cantidad * valor;
  }, 0);
}

/* `costoGuardado` es el total al costo que trae el registro. Se usa como
   respaldo para los consumos del sistema anterior, que se migraron con el
   total pero sin el detalle de qué se llevó: de esos no hay forma de saber a
   qué precio se vendía cada cosa ese día, y inventarlo sería peor que
   dejarlos como están. */
export function valorDelConsumo(items, { esCasa = false, costoGuardado = null } = {}) {
  const hayDetalle = Array.isArray(items) && items.length > 0;
  const aCosto = hayDetalle ? suma(items, "cost") : (Number(costoGuardado) || 0);
  const aVenta = hayDetalle ? suma(items, "price") : null;

  /* Sin detalle no se puede valorizar a precio de venta, así que queda al
     costo — y se dice, para que nadie crea que ese número ya lleva el margen. */
  const base = esCasa || !hayDetalle || aVenta === null ? BASE_COSTO : BASE_VENTA;
  const cargo = base === BASE_VENTA ? aVenta : aCosto;

  return {
    cargo,
    aCosto,
    aVenta,
    base,
    esCasa: !!esCasa,
    sinDetalle: !hayDetalle,
    /* Lo que el negocio deja de ganar cuando el consumo se cobra al costo.
       Solo tiene sentido cuando se conocen los dos números. */
    margenQueSePierde: base === BASE_COSTO && aVenta !== null ? aVenta - aCosto : 0,
  };
}

/* En una palabra, para ponerlo al lado de la cifra. */
export function explicarBase(base, esCasa) {
  if (base === BASE_VENTA) return "a precio de venta";
  return esCasa ? "al costo (es de la casa)" : "al costo";
}
