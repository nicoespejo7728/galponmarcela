import { obtenerCliente, obtenerClienteArchivos, BUCKET_PUBLICO } from "@/lib/supabase/cliente";
import {
  cargarCatalogos, traerTodo, nombreDeCategoria, nombreDePerfil,
  asegurarCategoria, registrarProveedor, olvidarProveedor,
  registrarCliente, olvidarCliente, registrarCategoria, olvidarCategoria,
} from "@/lib/datos/catalogos";
import { num, distintos, clave, traducir, A_METODO_PAGO, DESDE_METODO_PAGO } from "@/lib/datos/traduccion";
import { diferencias } from "@/lib/datos/diferencias";

/* Colecciones del catálogo: configuración, productos, proveedores, nómina y
   personas del sistema. */

/* =====================================================================
   business-settings  ↔  galpon.config_negocio
   ===================================================================== */

export const configuracion = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    const { data, error } = await sb.from("config_negocio").select("*").eq("id", 1).single();
    if (error) throw new Error(error.message);

    let logo = null;
    if (data.logo_path) {
      const { data: pub } = obtenerClienteArchivos()
        .storage.from(BUCKET_PUBLICO).getPublicUrl(data.logo_path);
      logo = pub?.publicUrl || null;
    }

    return {
      businessName: data.nombre_negocio,
      businessLogo: logo,
      // El PIN ya no viaja al navegador: se guarda con bcrypt y se comprueba
      // llamando a galpon.verificar_pin(). Se deja el campo para no romper las
      // pantallas que lo leen, pero nunca contiene el PIN real.
      adminPin: null,
      // El correlativo de boleta lo lleva una secuencia de Postgres.
      invoiceCounter: 1,
      ivaIncluded: data.iva_incluido,
      breadCategory: data.categoria_pan,
      transformMaterialsCost: num(data.costo_materiales_transf),
      transformFixedCost: num(data.costo_fijo_transf),
      lastBackupAt: data.ultimo_respaldo_at,
      // Hasta cuándo el equipo entero puede ajustar stock y precios en
      // Inventario. Ver migración 0019.
      marchaBlancaHasta: data.marcha_blanca_hasta || null,
      // Hasta cuándo queda apagada la regla del precio anterior. Ver
      // migración 0021.
      pausaPrecioAnteriorHasta: data.precio_anterior_pausa_hasta || null,
      // Qué se imprimió por última vez de la hoja carta, por categoría —
      // para avisar en pantalla cuál quedó desactualizada. Ver migración 0027.
      printedPages: data.paginas_impresas || {},

      // Banderas de migraciones que la versión anterior corría una sola vez
      // (importar el Excel, pasar nombres a mayúsculas, sembrar el PAN…).
      // Los datos ya vienen migrados, así que van todas en true para que esos
      // bloques no se vuelvan a ejecutar y dupliquen información.
      historicalImported: true,
      legacyProductsRemoved: true,
      legacyImportV2Done: true,
      productsUppercased: true,
      breadProductEnsured: true,
      coldBreadEnsured: true,
    };
  },

  async escribir(valor) {
    const sb = obtenerCliente();
    const fila = {
      nombre_negocio: valor.businessName || "El Galpón",
      iva_incluido: valor.ivaIncluded !== false,
      categoria_pan: (valor.breadCategory || "PAN").toUpperCase(),
      costo_materiales_transf: num(valor.transformMaterialsCost),
      costo_fijo_transf: num(valor.transformFixedCost),
      ultimo_respaldo_at: valor.lastBackupAt || null,
      marcha_blanca_hasta: valor.marchaBlancaHasta || null,
      precio_anterior_pausa_hasta: valor.pausaPrecioAnteriorHasta || null,
      paginas_impresas: valor.printedPages || {},
    };
    const { error } = await sb.from("config_negocio").update(fila).eq("id", 1);
    if (error) throw new Error(error.message);
    // El logo y el PIN tienen su propio camino (Storage y RPC), no se tocan aquí.
  },
};

/* =====================================================================
   products-catalog  ↔  galpon.producto (+ historial y aprobaciones)
   ===================================================================== */

const CAMPOS_PRODUCTO = [
  "barcode", "name", "category", "price", "cost", "minStock",
  "supplierId", "unitType", "unitsPerKg", "quickAccess",
];

/* Sincronización del catálogo.

   Releer los 5.000 productos cada 15 segundos era, de lejos, la mayor carga
   de la base: 48.000 consultas en pocos días para reenviar casi siempre lo
   mismo. Ahora la primera lectura trae el catálogo completo y las siguientes
   piden solo lo que cambió desde entonces, mirando `actualizado_at` —que un
   disparador mantiene al día en cada escritura—.

   El historial de precios seguía el mismo camino y pesaba todavía más
   (50.000 consultas): como solo cambia cuando cambia un precio, se lee entero
   junto con el catálogo y se conserva en memoria entre refrescos. */
let ultimoCambioVisto = null;
let historialPorProducto = new Map();

/* La marca de agua se pide con "mayor o igual", no con "mayor": si se pidiera
   solo lo estrictamente posterior, una escritura que quedó con la misma marca
   de tiempo que la última vista —y que se asentó un instante después— no
   volvería a aparecer nunca.

   Pedir "mayor o igual" trae de vuelta las filas del borde, así que se recuerda
   cuáles eran y se descartan. Sin eso, una operación masiva —un cambio de
   precios a todo el catálogo, o el corte a cero del inventario general, que
   dejan miles de filas con la misma marca— se reenviaría entera en cada ciclo
   para siempre. */
let idsEnElBorde = new Set();

/* Cuando el borde es una operación masiva —miles de filas escritas en el mismo
   instante, como el corte a cero del inventario— no tiene sentido volver a
   pedirlas para descartarlas una por una: a esa altura la operación terminó
   hace rato. Pasado este tamaño se pide "estrictamente posterior". */
const BORDE_MASIVO = 100;

function anotarMarcaDeAgua(filas) {
  let maximo = ultimoCambioVisto;
  for (const f of filas) {
    if (!f?.actualizado_at) continue;
    if (!maximo || f.actualizado_at > maximo) maximo = f.actualizado_at;
  }
  if (!maximo) return;
  if (maximo === ultimoCambioVisto) {
    // El borde no se movió: se suma lo que llegó en esta vuelta.
    for (const f of filas) {
      if (f?.actualizado_at === maximo && f.id) idsEnElBorde.add(f.id);
    }
  } else {
    ultimoCambioVisto = maximo;
    idsEnElBorde = new Set(
      filas.filter((f) => f?.actualizado_at === maximo && f.id).map((f) => f.id)
    );
  }
}

/* Se olvida lo aprendido cuando cambia la sesión: la próxima lectura vuelve a
   traer el catálogo entero. */
export function olvidarCatalogoDeProductos() {
  ultimoCambioVisto = null;
  idsEnElBorde = new Set();
  historialPorProducto = new Map();
}

export const productos = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    await cargarCatalogos();

    // Solo la sincronización periódica pide lecturas parciales. Cualquier otra
    // —al entrar, o justo antes de guardar— trae el catálogo completo.
    const incremental = !!opciones.reciente && !!ultimoCambioVisto;

    const [filas, aprobaciones] = await Promise.all([
      traerTodo(() =>
        incremental
          // Sin filtro de "activo": un producto dado de baja en otra caja tiene
          // que llegar igual, para poder sacarlo de la pantalla.
          ? (idsEnElBorde.size > BORDE_MASIVO
              ? sb.from("producto").select("*")
                  .gt("actualizado_at", ultimoCambioVisto)
                  .order("actualizado_at")
              : sb.from("producto").select("*")
                  .gte("actualizado_at", ultimoCambioVisto)
                  .order("actualizado_at"))
          : sb.from("producto").select("*").eq("activo", true).order("nombre")
      ),
      traerTodo(() =>
        sb.from("aprobacion_precio")
          .select("*")
          .eq("estado", "pendiente")
      ),
    ]);

    if (!incremental) {
      const historial = await traerTodo(() =>
        sb.from("producto_precio_historial")
          .select("producto_id,fecha,costo,precio")
          .order("producto_id").order("fecha", { ascending: true })
      );
      const porProducto = new Map();
      for (const h of historial) {
        const lista = porProducto.get(h.producto_id) || [];
        lista.push({ date: h.fecha, cost: num(h.costo), price: num(h.precio) });
        porProducto.set(h.producto_id, lista);
      }
      historialPorProducto = porProducto;
    }
    const porProducto = historialPorProducto;

    // Las filas del borde ya se entregaron en la vuelta anterior; se descartan
    // antes de anotar nada, para no reenviarlas ni volver a fusionarlas.
    const nuevas = incremental ? filas.filter((f) => !idsEnElBorde.has(f.id)) : filas;
    anotarMarcaDeAgua(filas);

    const pendientes = new Map(aprobaciones.map((a) => [a.producto_id, a]));

    return nuevas.map((f) => {
      const ap = pendientes.get(f.id);
      return {
        id: f.id,
        // Marca para la fusión: este producto ya no está activo y hay que
        // sacarlo de la pantalla y de la copia de referencia.
        ...(f.activo === false ? { __eliminado: true } : {}),
        barcode: f.codigo_barras,
        name: f.nombre,
        category: nombreDeCategoria(f.categoria_id),
        price: num(f.precio),
        cost: num(f.costo),
        stock: num(f.stock),
        minStock: num(f.stock_minimo, 5),
        supplierId: f.proveedor_id,
        unitType: f.tipo_unidad,
        unitsPerKg: f.unidades_por_kg == null ? null : num(f.unidades_por_kg),
        quickAccess: !!f.acceso_rapido,
        // Sirve para decidir cuál de dos fichas repetidas es la original del
        // catálogo y cuál se creó durante un conteo: la vieja es la que tiene
        // el código que lee la pistola.
        createdAt: f.creado_at,
        // En pantalla se muestran las últimas 15 entradas, pero el piso duro de
        // margen necesita el costo más alto de toda la historia: se entrega
        // aparte para que ese cálculo no dependa del recorte.
        priceHistory: (porProducto.get(f.id) || []).slice(-15),
        maxHistoricCost: (porProducto.get(f.id) || []).reduce(
          (m, h) => Math.max(m, h.cost || 0), 0),
        priceApproval: ap
          ? {
              suggestedPrice: num(ap.precio_sugerido),
              netCost: num(ap.costo_neto),
              requestedBy: nombreDePerfil(ap.solicitado_por),
              date: ap.solicitado_at,
              ...(ap.es_producto_nuevo ? { isNewProduct: true } : {}),
              __id: ap.id,
            }
          : null,
      };
    });
  },

  /* El guardado compara contra la última lectura y manda a la base solo lo que
     cambió de verdad. Es lo que permite conservar las pantallas tal como están:
     ellas siguen entregando la lista completa de productos. */
  async escribir(actual, anterior, opciones = {}) {
    const sb = obtenerCliente();
    const { nuevos, cambiados, eliminados } = diferencias(anterior, actual);
    const origenStock = opciones.origen || "ajuste_manual";
    const idUsuario = opciones.idUsuario || null;

    // --- Productos nuevos ---
    if (nuevos.length) {
      // Las secciones se resuelven una sola vez, no una por producto: al migrar
      // un catálogo entero eso son miles de vueltas idénticas.
      const seccionPorNombre = new Map();
      for (const nombre of new Set(nuevos.map((p) => p.category))) {
        seccionPorNombre.set(nombre, await asegurarCategoria(nombre));
      }

      const filas = nuevos.map((p) => ({
        id: p.id,
        codigo_barras: p.barcode || "",
        nombre: p.name,
        categoria_id: seccionPorNombre.get(p.category) ?? null,
        precio: num(p.price),
        costo: num(p.cost),
        stock_minimo: num(p.minStock, 5),
        proveedor_id: p.supplierId || null,
        tipo_unidad: p.unitType === "peso" ? "peso" : "unidad",
        unidades_por_kg: p.unitType === "peso" ? null : (p.unitsPerKg ?? null),
        acceso_rapido: !!p.quickAccess,
        // El stock NO se escribe directo: entra por el kárdex, que es quien
        // lleva el saldo y deja el rastro de dónde salió cada unidad.
      }));

      // Los que ya están por código de barras se dejan como están. Es lo que
      // permite volver a intentar una restauración que se cortó por la mitad
      // sin terminar con el catálogo duplicado.
      const yaCargados = new Set(
        (await traerTodo(() => sb.from("producto").select("codigo_barras")))
          .map((x) => (x.codigo_barras || "").trim().toUpperCase())
      );
      const filasNuevas = filas.filter(
        (f) => !yaCargados.has((f.codigo_barras || "").trim().toUpperCase())
      );
      const idsNuevos = new Set(filasNuevas.map((f) => f.id));

      // De a tandas. Con un producto por consulta, migrar el catálogo del
      // negocio —casi 5.000 artículos— tomaba varios minutos y cualquier
      // tropiezo a mitad de camino dejaba la carga por la mitad.
      await enTandas(filasNuevas, async (tanda) => {
        const { error } = await sb.from("producto").insert(tanda);
        if (error) throw new Error(`Productos: ${error.message}`);
      });

      const movimientos = nuevos
        .filter((p) => idsNuevos.has(p.id))
        .filter((p) => num(p.stock) !== 0)
        .map((p) => ({
          producto_id: p.id,
          origen: motivoDeKardex(origenStock, num(p.stock)),
          cantidad: num(p.stock),
          costo_unitario: num(p.cost),
          registrado_por: idUsuario,
        }));
      await enTandas(movimientos, async (tanda) => {
        const { error } = await sb.from("kardex").insert(tanda);
        if (error) throw new Error(`Stock inicial: ${error.message}`);
      });

      // Si el código de barras ya existía (aunque fuera de un producto
      // inactivo), el producto se saltó más arriba y su id nunca llegó a
      // existir en la tabla — pedir aquí una aprobación de precio para él
      // reventaba con una violación de llave foránea (aprobacion_precio
      // apunta a un producto.id que no existe). Se filtra igual que el
      // stock inicial, por la misma razón.
      for (const p of nuevos.filter((p) => idsNuevos.has(p.id))) {
        if (p.priceApproval) await crearAprobacion(sb, p, idUsuario);
      }
    }

    // --- Productos modificados ---
    for (const { antes, ahora } of cambiados) {
      if (distintos(antes, ahora, CAMPOS_PRODUCTO)) {
        const categoria_id =
          antes.category === ahora.category
            ? undefined
            : await asegurarCategoria(ahora.category);
        const fila = {
          codigo_barras: ahora.barcode || antes.barcode,
          nombre: ahora.name,
          precio: num(ahora.price),
          costo: num(ahora.cost),
          stock_minimo: num(ahora.minStock, 5),
          proveedor_id: ahora.supplierId || null,
          tipo_unidad: ahora.unitType === "peso" ? "peso" : "unidad",
          unidades_por_kg: ahora.unitType === "peso" ? null : (ahora.unitsPerKg ?? null),
          acceso_rapido: !!ahora.quickAccess,
        };
        if (categoria_id !== undefined) fila.categoria_id = categoria_id;
        const { error } = await sb.from("producto").update(fila).eq("id", ahora.id);
        if (error) throw new Error(`Producto "${ahora.name}": ${error.message}`);
      }

      // El movimiento de stock se deduce de la diferencia con la lectura previa.
      const delta = +(num(ahora.stock) - num(antes.stock)).toFixed(3);
      if (delta !== 0) {
        await moverKardex(sb, ahora.id, delta, origenStock, ahora.cost, idUsuario);
      }

      // Solicitudes de precio: nacen, se aprueban o se descartan.
      const antesAp = antes.priceApproval;
      const ahoraAp = ahora.priceApproval;
      if (!antesAp && ahoraAp) {
        await crearAprobacion(sb, ahora, idUsuario);
      } else if (antesAp && !ahoraAp) {
        const seAplico = num(ahora.price) !== num(antes.price);
        await sb.from("aprobacion_precio")
          .update({
            estado: seAplico ? "aprobada" : "descartada",
            resuelto_por: idUsuario,
            resuelto_at: new Date().toISOString(),
            precio_aprobado: seAplico ? num(ahora.price) : null,
          })
          .eq("id", antesAp.__id || "")
          .eq("estado", "pendiente");
      }
    }

    // --- Productos retirados ---
    // Se marcan como inactivos en vez de borrarlos: sus ventas, compras y
    // movimientos de stock deben seguir existiendo en el historial.
    for (const p of (opciones.sinBajas ? [] : eliminados)) {
      const { error } = await sb.from("producto").update({ activo: false }).eq("id", p.id);
      if (error) throw new Error(`No se pudo retirar "${p.name}": ${error.message}`);
    }
  },
};

/* Envía una lista larga a la base de a pedazos. Una sola consulta con miles de
   filas puede pasarse del tamaño máximo de petición; de a mil pasa siempre. */
async function enTandas(filas, hacer, tamano = 1000) {
  for (let i = 0; i < filas.length; i += tamano) {
    await hacer(filas.slice(i, i + tamano));
  }
}

/* Una transformación consume unos productos y produce otro: son dos motivos
   distintos en el kárdex, y el signo de la cantidad es lo que los separa. */
function motivoDeKardex(origen, cantidad) {
  if (origen !== "transformacion") return origen;
  return cantidad < 0 ? "transformacion_insumo" : "transformacion_salida";
}

async function moverKardex(sb, productoId, cantidad, origen, costo, idUsuario) {
  const motivo = motivoDeKardex(origen, cantidad);
  const { error } = await sb.from("kardex").insert({
    producto_id: productoId,
    origen: motivo,
    cantidad,
    costo_unitario: costo == null ? null : num(costo),
    registrado_por: idUsuario,
  });
  if (error) throw new Error(`Movimiento de stock: ${error.message}`);
}

async function crearAprobacion(sb, producto, idUsuario) {
  const ap = producto.priceApproval;
  const { error } = await sb.from("aprobacion_precio").insert({
    producto_id: producto.id,
    precio_sugerido: num(ap.suggestedPrice),
    costo_neto: num(ap.netCost),
    es_producto_nuevo: !!ap.isNewProduct,
    solicitado_por: idUsuario,
  });
  // Si ya había una pendiente, el índice único la rechaza: no es un error real.
  if (error && !/duplicat|unique/i.test(error.message)) {
    throw new Error(`Solicitud de precio: ${error.message}`);
  }
}

/* Compara dos listas de tramos de una carpeta de oferta. No hace falta nada
   más fino que "¿son iguales del todo?": son pocas filas por carpeta (una
   a tres, normalmente) y reemplazarTramos de todos modos reemplaza el
   tramo entero cuando algo cambió, así que no vale la pena distinguir cuál
   de los tramos fue el que cambió. */
function distintosTramos(antes, ahora) {
  const normalizar = (lista) => (lista || [])
    .map((t) => ({
      id: t.id || null,
      quantity: num(t.quantity),
      price: num(t.price),
      paymentMethods: [...(t.paymentMethods || [])].sort(),
    }))
    .sort((a, b) => a.quantity - b.quantity);
  return JSON.stringify(normalizar(antes)) !== JSON.stringify(normalizar(ahora));
}

/* La lista de qué productos participan de una carpeta no es un id ni un
   string: se compara ordenando y comparando los arreglos. */
function distintaListaIds(antes, ahora) {
  const normalizar = (lista) => [...new Set((lista || []).filter(Boolean))].sort();
  const a = normalizar(antes), b = normalizar(ahora);
  return a.length !== b.length || a.some((id, i) => id !== b[i]);
}

/* =====================================================================
   quantity-offers  ↔  galpon.oferta (+ oferta_producto, oferta_tramo)

   Una "carpeta" de oferta agrupa varios productos —sabores, marcas o
   formatos distintos, cada uno con su propio código de barras— bajo los
   mismos tramos "N por $X": el cliente completa la cantidad mezclando
   cualquiera de los productos de la carpeta, sin que importe cuáles.
   Es un catálogo chico (unas pocas carpetas, no miles) que se lee entero y
   se compara contra la última lectura — mismo patrón que "categorías" y
   "proveedores" — salvo que acá cada carpeta trae dos listas anidadas
   (productIds y tiers) que no encajan en una comparación campo por campo,
   así que se resuelven aparte con distintaListaIds/distintosTramos. */
export const ofertas = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    const [carpetas, miembros, tramos] = await Promise.all([
      traerTodo(() => sb.from("oferta").select("*").eq("activo", true).order("nombre")),
      traerTodo(() => sb.from("oferta_producto").select("oferta_id,producto_id")),
      traerTodo(() => sb.from("oferta_tramo").select("*").eq("activo", true)),
    ]);

    const productosPorOferta = new Map();
    for (const m of miembros) {
      const lista = productosPorOferta.get(m.oferta_id) || [];
      lista.push(m.producto_id);
      productosPorOferta.set(m.oferta_id, lista);
    }
    const tramosPorOferta = new Map();
    for (const t of tramos) {
      const lista = tramosPorOferta.get(t.oferta_id) || [];
      lista.push({
        id: t.id,
        quantity: num(t.cantidad),
        price: num(t.precio_total),
        paymentMethods: (t.medios_pago || []).map((m) => DESDE_METODO_PAGO[m]).filter(Boolean),
      });
      tramosPorOferta.set(t.oferta_id, lista);
    }

    return carpetas.map((o) => ({
      id: o.id,
      name: o.nombre,
      productIds: productosPorOferta.get(o.id) || [],
      tiers: tramosPorOferta.get(o.id) || [],
      createdAt: o.creado_at,
    }));
  },

  async escribir(actual, anterior, opciones = {}) {
    const sb = obtenerCliente();
    const { nuevos, cambiados, eliminados } = diferencias(anterior, actual);

    async function reemplazarProductos(ofertaId, productIds) {
      const { data: existentes, error: errLeer } = await sb
        .from("oferta_producto").select("producto_id").eq("oferta_id", ofertaId);
      if (errLeer) throw new Error(`Oferta: ${errLeer.message}`);
      const actuales = new Set((productIds || []).filter(Boolean));
      const previos = new Set((existentes || []).map((x) => x.producto_id));
      const aQuitar = [...previos].filter((id) => !actuales.has(id));
      const aAgregar = [...actuales].filter((id) => !previos.has(id));
      if (aQuitar.length) {
        const { error } = await sb.from("oferta_producto")
          .delete().eq("oferta_id", ofertaId).in("producto_id", aQuitar);
        if (error) throw new Error(`Oferta: ${error.message}`);
      }
      if (aAgregar.length) {
        const { error } = await sb.from("oferta_producto")
          .insert(aAgregar.map((producto_id) => ({ oferta_id: ofertaId, producto_id })));
        // Un producto ya asignado a otra carpeta choca con la llave única de
        // oferta_producto.producto_id: se avisa tal cual, para que quien
        // administra sepa que tiene que sacarlo de la otra carpeta primero.
        if (error) throw new Error(`Oferta: ${/unique|duplicat/i.test(error.message)
          ? "uno de los productos elegidos ya pertenece a otra oferta"
          : error.message}`);
      }
    }

    async function reemplazarTramos(ofertaId, tiers) {
      const validos = (tiers || []).filter((t) => num(t.quantity) >= 2 && num(t.price) > 0);
      const { data: existentes, error: errLeer } = await sb
        .from("oferta_tramo").select("id").eq("oferta_id", ofertaId);
      if (errLeer) throw new Error(`Oferta: ${errLeer.message}`);
      const idsAConservar = new Set(validos.filter((t) => t.id).map((t) => t.id));
      const aBorrar = (existentes || []).filter((f) => !idsAConservar.has(f.id)).map((f) => f.id);
      if (aBorrar.length) {
        const { error } = await sb.from("oferta_tramo").delete().in("id", aBorrar);
        if (error) throw new Error(`Oferta: ${error.message}`);
      }
      for (const t of validos) {
        const fila = {
          oferta_id: ofertaId,
          cantidad: Math.floor(num(t.quantity)),
          precio_total: num(t.price),
          medios_pago: (t.paymentMethods || []).map((m) => traducir(A_METODO_PAGO, m, null)).filter(Boolean),
        };
        if (t.id) {
          const { error } = await sb.from("oferta_tramo").update(fila).eq("id", t.id);
          if (error) throw new Error(`Oferta: ${error.message}`);
        } else {
          const { error } = await sb.from("oferta_tramo").insert(fila);
          if (error) throw new Error(`Oferta: ${error.message}`);
        }
      }
    }

    for (const o of nuevos) {
      const { error } = await sb.from("oferta").insert({ id: o.id, nombre: o.name });
      if (error) throw new Error(`Oferta "${o.name}": ${error.message}`);
      await reemplazarProductos(o.id, o.productIds);
      await reemplazarTramos(o.id, o.tiers);
    }

    for (const { antes, ahora } of cambiados) {
      if (antes.name !== ahora.name) {
        const { error } = await sb.from("oferta").update({ nombre: ahora.name }).eq("id", ahora.id);
        if (error) throw new Error(`Oferta "${ahora.name}": ${error.message}`);
      }
      if (distintaListaIds(antes.productIds, ahora.productIds)) {
        await reemplazarProductos(ahora.id, ahora.productIds);
      }
      if (distintosTramos(antes.tiers, ahora.tiers)) {
        await reemplazarTramos(ahora.id, ahora.tiers);
      }
    }

    for (const o of (opciones.sinBajas ? [] : eliminados)) {
      const { error } = await sb.from("oferta").update({ activo: false }).eq("id", o.id);
      if (error) throw new Error(`No se pudo desactivar "${o.name}": ${error.message}`);
    }
  },
};

/* =====================================================================
   price-clearance  ↔  galpon.liquidacion

   Precio rebajado puntual de UN producto (migración 0031) — sin tramos ni
   carpeta, a diferencia de "quantity-offers". Como mucho una liquidación
   activa por producto a la vez (lo impone la base). La fecha de término es
   opcional: si venció, acá se filtra igual que si estuviera desactivada,
   para que ni el POS ni la lista de administración la sigan mostrando como
   vigente sin que nadie tenga que entrar a apagarla a mano. */
export const liquidaciones = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    const filas = await traerTodo(() =>
      sb.from("liquidacion").select("*").eq("activo", true)
    );
    const hoy = new Date().toISOString().slice(0, 10);
    const vigentes = [], vencidas = [];
    for (const f of filas) ((!f.fecha_fin || f.fecha_fin >= hoy) ? vigentes : vencidas).push(f);

    // Una liquidación vencida se apaga sola acá, no solo se oculta: si se
    // dejara "activo=true" en la base, el índice único de "una liquidación
    // activa por producto" seguiría bloqueando una liquidación nueva para
    // ese mismo producto, aunque en pantalla ya no se viera ninguna — un
    // callejón sin salida bien confuso. Como esta lectura corre a cada rato
    // (carga inicial y sincronización periódica), la ventana en que eso
    // podría pasar es de segundos, no de días.
    if (vencidas.length) {
      const { error } = await sb.from("liquidacion").update({ activo: false }).in("id", vencidas.map((f) => f.id));
      if (error) console.error("[liquidaciones] no se pudieron apagar las vencidas", error);
    }

    return vigentes.map((f) => ({
      id: f.id,
      productId: f.producto_id,
      price: num(f.precio_liquidacion),
      endDate: f.fecha_fin || null,
      createdAt: f.creado_at,
    }));
  },

  async escribir(actual, anterior, opciones = {}) {
    const sb = obtenerCliente();
    const { nuevos, cambiados, eliminados } = diferencias(anterior, actual);

    for (const l of nuevos) {
      const { error } = await sb.from("liquidacion").insert({
        id: l.id, producto_id: l.productId, precio_liquidacion: num(l.price), fecha_fin: l.endDate || null,
      });
      // Un producto que ya tiene una liquidación activa choca con el índice
      // único: se avisa tal cual, para que se sepa que hay que desactivar la
      // anterior primero en vez de creer que no se guardó por otra razón.
      if (error) throw new Error(/unique|duplicat/i.test(error.message)
        ? "ese producto ya tiene una liquidación activa"
        : `Liquidación: ${error.message}`);
    }

    for (const { antes, ahora } of cambiados) {
      if (antes.price === ahora.price && antes.endDate === ahora.endDate && antes.productId === ahora.productId) continue;
      const { error } = await sb.from("liquidacion").update({
        producto_id: ahora.productId, precio_liquidacion: num(ahora.price), fecha_fin: ahora.endDate || null,
      }).eq("id", ahora.id);
      if (error) throw new Error(/unique|duplicat/i.test(error.message)
        ? "ese producto ya tiene una liquidación activa"
        : `Liquidación: ${error.message}`);
    }

    for (const l of (opciones.sinBajas ? [] : eliminados)) {
      const { error } = await sb.from("liquidacion").update({ activo: false }).eq("id", l.id);
      if (error) throw new Error(`No se pudo desactivar la liquidación: ${error.message}`);
    }
  },
};

/* =====================================================================
   suppliers  ↔  galpon.proveedor
   ===================================================================== */

const CAMPOS_PROVEEDOR = ["name", "category", "rut", "contactName", "phone", "email", "address", "notes"];

export const proveedores = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    const filas = await traerTodo(() =>
      sb.from("proveedor").select("*").eq("activo", true).order("nombre")
    );
    return filas.map((f) => ({
      id: f.id,
      name: f.nombre,
      category: f.categoria || "",
      rut: f.rut || "",
      contactName: f.contacto_nombre || "",
      phone: f.telefono || "",
      email: f.email || "",
      address: f.direccion || "",
      notes: f.notas || "",
      createdAt: f.creado_at,
    }));
  },

  async escribir(actual, anterior, opciones = {}) {
    const sb = obtenerCliente();
    const { nuevos, cambiados, eliminados } = diferencias(anterior, actual);

    // El sistema anterior guardaba los proveedores de dos formas: la del
    // formulario (contactName/notes) y la del import antiguo (linkman/remark).
    // Se leen las dos, porque en los datos reales conviven.
    const aFila = (s) => ({
      nombre: (s.name || "").trim(),
      categoria: s.category || null,
      rut: s.rut || null,
      contacto_nombre: s.contactName || s.linkman || null,
      telefono: s.phone || null,
      email: s.email || null,
      direccion: s.address || null,
      notas: s.notes || s.remark || null,
    });

    if (nuevos.length) {
      // Mismo criterio que con la nómina: si el proveedor ya está por nombre, se
      // deja el que hay. Así la restauración se puede repetir sin romperse.
      const existentes = new Set(
        (await traerTodo(() => sb.from("proveedor").select("nombre")))
          .map((x) => clave(x.nombre))
      );
      const porAgregar = nuevos.filter((x) => !existentes.has(clave(x.name)));
      await enTandas(porAgregar.map((x) => ({ id: x.id, ...aFila(x) })), async (tanda) => {
        const { data, error } = await sb.from("proveedor").insert(tanda).select();
        if (error) throw new Error(`Proveedores: ${error.message}`);
        (data || []).forEach(registrarProveedor);
      });
    }
    for (const { antes, ahora } of cambiados) {
      if (!distintos(antes, ahora, CAMPOS_PROVEEDOR)) continue;
      const { data, error } = await sb
        .from("proveedor").update(aFila(ahora)).eq("id", ahora.id).select().single();
      if (error) throw new Error(`Proveedor "${ahora.name}": ${error.message}`);
      registrarProveedor(data);
    }
    for (const s of (opciones.sinBajas ? [] : eliminados)) {
      const { error } = await sb.from("proveedor").update({ activo: false }).eq("id", s.id);
      if (error) throw new Error(`No se pudo retirar "${s.name}": ${error.message}`);
      olvidarProveedor(s.id);
    }
  },
};

/* =====================================================================
   product-categories  ↔  galpon.categoria

   Secciones de productos. Antes solo se creaban al vuelo desde el
   formulario de producto (asegurarCategoria, en catalogos.js) y nunca se
   podían renombrar ni dar de baja desde ninguna pantalla. Esta colección
   agrega esa administración explícita (CRUD), sin tocar el mecanismo de
   creación-al-vuelo: los dos conviven, porque la migración 0007 dejó
   abierto a propósito que cualquiera del equipo cree una sección nueva al
   recibir mercadería, y eso se mantiene igual. Acá solo se agrega la
   posibilidad de administrarlas a mano (crear una sin esperar una
   recepción, renombrar una mal escrita, ordenarlas, o desactivar una que
   ya no se usa) — mismo patrón que "proveedores", arriba.
   ===================================================================== */

const CAMPOS_CATEGORIA = ["name", "order"];

/* Unificar secciones repetidas.

   Se hace por identificador y no por nombre a propósito: el catálogo llegó
   con "LACTEOS" y "LÁCTEOS" como secciones distintas, y al resolver por
   nombre las dos caen en la misma clave —se ignoran tildes y mayúsculas para
   poder cruzar el sistema anterior—, así que los productos podían terminar
   justo en la que se estaba desactivando.

   Va aparte del guardado normal del catálogo por lo mismo que el conteo
   rápido: mover ciento cincuenta productos no debería obligar a comparar los
   cinco mil. */
export async function unificarCategorias(idDestino, idsOrigen) {
  const sb = obtenerCliente();
  const origenes = (idsOrigen || []).filter((id) => id && id !== idDestino);
  if (!idDestino || origenes.length === 0) return { movidos: 0, desactivadas: 0 };

  // Antes eran dos consultas desde el navegador —mover los productos y
  // desactivar la categoría—; si la segunda fallaba, quedaban los productos
  // movidos y la categoría vieja todavía en la lista. Ahora lo hace la base
  // en una sola transacción (migración 0018).
  const { data, error } = await sb.rpc("unificar_categorias", {
    p_destino: idDestino, p_origenes: origenes,
  });
  if (error) throw new Error(error.message);

  const fila = Array.isArray(data) ? data[0] : data;

  // Los catálogos en memoria guardan la equivalencia nombre ↔ identificador;
  // hay que rehacerlos o la pantalla seguiría resolviendo a las viejas.
  await cargarCatalogos({ forzar: true });
  olvidarCatalogoDeProductos();
  return {
    movidos: Number(fila?.movidos) || 0,
    desactivadas: Number(fila?.desactivadas) || origenes.length,
  };
}

/* Grupos que alguien miró y decidió dejar separados.

   Van por su propio camino y no como colección del puente: son cuatro filas
   que solo mira la pantalla Revisar, y no tienen nada que ver con el catálogo
   ni con el guardado por diferencias. */
export async function leerDuplicadosDescartados() {
  const sb = obtenerCliente();
  const { data, error } = await sb.from("duplicado_descartado").select("clave,nombre,descartado_at");
  if (error) throw new Error(error.message);
  return (data || []).map((d) => ({ clave: d.clave, nombre: d.nombre, fecha: d.descartado_at }));
}

export async function descartarDuplicado(clave, nombre, motivo, idUsuario) {
  const sb = obtenerCliente();
  const { error } = await sb.from("duplicado_descartado").insert({
    clave, nombre, motivo: motivo || null, descartado_por: idUsuario || null,
  });
  // Si ya estaba descartado no es un error: el resultado es el mismo.
  if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
  return true;
}

export async function revertirDescarte(clave) {
  const sb = obtenerCliente();
  const { error } = await sb.from("duplicado_descartado").delete().eq("clave", clave);
  if (error) throw new Error(error.message);
  return true;
}

/* Unir productos duplicados.

   Va por una función de la base y no por el guardado normal del catálogo
   —igual que unificarCategorias— pero acá el motivo es más fuerte: mover el
   stock son cuatro pasos encadenados, y basta con que uno se repita para que
   el saldo quede al doble. Del lado del servidor es una sola transacción. */
export async function unificarProductos(idDestino, idsOrigen) {
  const sb = obtenerCliente();
  const origenes = (idsOrigen || []).filter((id) => id && id !== idDestino);
  if (!idDestino || origenes.length === 0) return { movidos: 0, desactivados: 0 };

  const { data, error } = await sb.rpc("unificar_productos", {
    p_destino: idDestino, p_origenes: origenes,
  });
  if (error) throw new Error(error.message);

  const fila = Array.isArray(data) ? data[0] : data;
  olvidarCatalogoDeProductos();   // la próxima lectura trae el catálogo entero
  return { movidos: Number(fila?.movidos) || 0, desactivados: Number(fila?.desactivados) || 0 };
}

export const categorias = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    const filas = await traerTodo(() =>
      sb.from("categoria").select("*").eq("activa", true).order("orden").order("nombre")
    );
    return filas.map((f) => ({
      id: f.id,
      name: f.nombre,
      order: f.orden == null ? 0 : num(f.orden),
      createdAt: f.creado_at,
    }));
  },

  async escribir(actual, anterior, opciones = {}) {
    const sb = obtenerCliente();
    const { nuevos, cambiados, eliminados } = diferencias(anterior, actual);

    const aFila = (c) => ({
      nombre: (c.name || "").trim().toUpperCase(),
      orden: num(c.order, 0),
    });

    if (nuevos.length) {
      // Mismo resguardo que proveedores/trabajadores: si la sección ya existe
      // por nombre (por ejemplo, la creó al vuelo alguien recibiendo
      // mercadería un segundo antes), no se duplica — se deja la que hay.
      const existentes = new Set(
        (await traerTodo(() => sb.from("categoria").select("nombre")))
          .map((x) => clave(x.nombre))
      );
      const porAgregar = nuevos.filter((x) => !existentes.has(clave(x.name)));
      await enTandas(porAgregar.map((x) => ({ id: x.id, ...aFila(x) })), async (tanda) => {
        const { data, error } = await sb.from("categoria").insert(tanda).select();
        if (error) throw new Error(`Categorías: ${error.message}`);
        (data || []).forEach(registrarCategoria);
      });
    }
    for (const { antes, ahora } of cambiados) {
      if (!distintos(antes, ahora, CAMPOS_CATEGORIA)) continue;
      const { data, error } = await sb
        .from("categoria").update(aFila(ahora)).eq("id", ahora.id).select().single();
      if (error) throw new Error(`Categoría "${ahora.name}": ${error.message}`);
      registrarCategoria(data);
    }
    for (const c of (opciones.sinBajas ? [] : eliminados)) {
      const { error } = await sb.from("categoria").update({ activa: false }).eq("id", c.id);
      if (error) throw new Error(`No se pudo retirar "${c.name}": ${error.message}`);
      olvidarCategoria(c.id);
    }
  },
};

/* =====================================================================
   customers  ↔  galpon.cliente

   Clientes a los que se les puede vender fiado (migración 0012). Es el
   mismo patrón que proveedores: un catálogo chico que se lee entero y se
   compara contra la última lectura. El saldo que debe cada cliente NO
   vive acá —eso lo lleva el libro de fiado, ver clienteMovimientos en
   operacion.js—, solo sus datos de contacto y el límite de crédito.
   ===================================================================== */

const CAMPOS_CLIENTE = ["name", "phone", "address", "notes", "creditLimit"];

export const clientes = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    // Si la migración 0012 todavía no se aplicó, la tabla no existe: se
    // avisa por consola y se entrega una lista vacía, en vez de romper la
    // carga inicial completa del sistema (que pide las 15 colecciones a
    // la vez con Promise.all).
    let filas;
    try {
      filas = await traerTodo(() =>
        sb.from("cliente").select("*").eq("activo", true).order("nombre")
      );
    } catch (e) {
      console.error("[datos] cliente no disponible todavía (¿falta aplicar la migración 0012?)", e);
      return [];
    }
    return filas.map((f) => ({
      id: f.id,
      name: f.nombre,
      phone: f.telefono || "",
      address: f.direccion || "",
      notes: f.notas || "",
      creditLimit: f.limite_credito == null ? null : num(f.limite_credito),
      createdAt: f.creado_at,
    }));
  },

  async escribir(actual, anterior, opciones = {}) {
    const sb = obtenerCliente();
    const { nuevos, cambiados, eliminados } = diferencias(anterior, actual);

    const aFila = (c) => ({
      nombre: (c.name || "").trim(),
      telefono: c.phone || null,
      direccion: c.address || null,
      notas: c.notes || null,
      limite_credito: c.creditLimit == null || c.creditLimit === "" ? null : num(c.creditLimit),
    });

    if (nuevos.length) {
      const filas = nuevos.map((c) => ({ id: c.id, ...aFila(c) }));
      const { data, error } = await sb.from("cliente").insert(filas).select();
      if (error) throw new Error(`Clientes: ${error.message}`);
      (data || []).forEach(registrarCliente);
    }
    for (const { antes, ahora } of cambiados) {
      if (!distintos(antes, ahora, CAMPOS_CLIENTE)) continue;
      const { data, error } = await sb
        .from("cliente").update(aFila(ahora)).eq("id", ahora.id).select().single();
      if (error) throw new Error(`Cliente "${ahora.name}": ${error.message}`);
      registrarCliente(data);
    }
    for (const c of (opciones.sinBajas ? [] : eliminados)) {
      const { error } = await sb.from("cliente").update({ activo: false }).eq("id", c.id);
      if (error) throw new Error(`No se pudo retirar "${c.name}": ${error.message}`);
      olvidarCliente(c.id);
    }
  },
};

/* =====================================================================
   workers  ↔  galpon.trabajador
   ===================================================================== */

export const trabajadores = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    const filas = await traerTodo(() =>
      sb.from("trabajador").select("*").eq("activo", true).order("nombre")
    );
    return filas.map((f) => ({
      id: f.id, name: f.nombre, active: f.activo, createdAt: f.creado_at,
    }));
  },

  async escribir(actual, anterior, opciones = {}) {
    const sb = obtenerCliente();
    const { nuevos, cambiados, eliminados } = diferencias(anterior, actual);

    // Al restaurar un respaldo, la nómina que trae puede coincidir con la que ya
    // está cargada en la base aunque los identificadores no calcen. Se compara
    // por nombre —que es lo que identifica a una persona acá— y se agregan solo
    // los que faltan, en vez de chocar contra la unicidad y abortar todo.
    if (nuevos.length) {
      const existentes = new Set(
        (await traerTodo(() => sb.from("trabajador").select("nombre")))
          .map((t) => clave(t.nombre))
      );
      const porAgregar = nuevos.filter((t) => !existentes.has(clave(t.name)));
      if (porAgregar.length) {
        const { error } = await sb.from("trabajador")
          .insert(porAgregar.map((t) => ({ id: t.id, nombre: (t.name || "").trim() })));
        if (error) throw new Error(`Trabajadores: ${error.message}`);
      }
    }
    for (const { antes, ahora } of cambiados) {
      if (antes.name === ahora.name) continue;
      const { error } = await sb.from("trabajador")
        .update({ nombre: (ahora.name || "").trim() }).eq("id", ahora.id);
      if (error) throw new Error(`Trabajador "${ahora.name}": ${error.message}`);
    }
    // Una restauración agrega, no borra. Los identificadores del respaldo no
    // tienen por qué coincidir con los de la base —la nómina y las secciones
    // vienen sembradas por las migraciones—, así que lo que no aparece en el
    // archivo no es algo que se haya eliminado: simplemente es otra fila.
    for (const t of (opciones.sinBajas ? [] : eliminados)) {
      const { error } = await sb.from("trabajador").update({ activo: false }).eq("id", t.id);
      if (error) throw new Error(`No se pudo retirar "${t.name}": ${error.message}`);
    }
  },
};

/* =====================================================================
   users  ↔  galpon.perfil (+ Supabase Auth)

   Crear o cambiar la contraseña de una cuenta exige la clave de servicio, que
   nunca puede estar en el navegador. Por eso esas operaciones pasan por la ruta
   de servidor /api/usuarios; el resto (nombre, rol) se actualiza directo.
   ===================================================================== */

export const usuarios = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    // Lista explícita de columnas — a propósito, no "*". Este catálogo se
    // carga para toda persona que entra (vendedor o admin), y desde la
    // migración 0013 la tabla perfil tiene un pin_hash: un select("*") lo
    // mandaría al navegador de cualquiera, hash bcrypt incluido, aunque la
    // pantalla nunca lo mostrara. No pedirlo es la única defensa posible,
    // porque las políticas de la fila (RLS) no distinguen columnas.
    const filas = await traerTodo(() =>
      sb.from("perfil")
        .select("id,nombre,usuario,rol,activo,creado_at,consumo_a_casa")
        .eq("activo", true).order("nombre")
    );
    return filas.map((f) => ({
      id: f.id,
      name: f.nombre,
      username: f.usuario,
      password: "",           // nunca sale de Supabase Auth
      role: f.rol,
      createdAt: f.creado_at,
      // El PIN de vendedor nunca sale de la base (ni siquiera si existe):
      // se fija o se cambia, pero no se lee. Ver fijarPinSiCorresponde.
      pin: "",
      // Si su consumo interno va a la cuenta de la casa (migración 0024).
      houseConsumption: f.consumo_a_casa === true,
    }));
  },

  async escribir(actual, anterior, opciones = {}) {
    const { nuevos, cambiados, eliminados } = diferencias(anterior, actual);
    const sb = obtenerCliente();

    for (const u of nuevos) {
      const creado = await llamarApiUsuarios("POST", {
        nombre: u.name, usuario: u.username, contrasena: u.password, rol: u.role,
      });
      // El identificador real lo asigna Supabase Auth. Se escribe sobre el objeto
      // —que es el mismo que quedó en pantalla y en la copia de referencia— para
      // que editarlo enseguida no lo tome por una cuenta distinta.
      if (creado?.id) u.id = creado.id;
      // El PIN de vendedor es obligatorio al crear (lo exige UserModal), así
      // que siempre hay uno que fijar en cuanto existe el perfil real.
      if (u.pin) await fijarPinSiCorresponde(u.id, u.pin);
      // La marca de "consumo de la casa" no la crea la ruta de servidor, que
      // solo sabe de cuentas: se pone enseguida, cuando el perfil ya existe.
      if (u.houseConsumption && u.id) {
        const { error } = await sb.from("perfil")
          .update({ consumo_a_casa: true }).eq("id", u.id);
        if (error) throw new Error(`Usuario "${u.name}": ${error.message}`);
      }
    }

    for (const { antes, ahora } of cambiados) {
      if (ahora.password) {
        await llamarApiUsuarios("PATCH", { id: ahora.id, contrasena: ahora.password });
      }
      if (antes.name !== ahora.name || antes.role !== ahora.role || antes.username !== ahora.username
          || !!antes.houseConsumption !== !!ahora.houseConsumption) {
        const { error } = await sb.from("perfil")
          .update({
            nombre: ahora.name, usuario: ahora.username, rol: ahora.role,
            consumo_a_casa: !!ahora.houseConsumption,
          })
          .eq("id", ahora.id);
        if (error) throw new Error(`Usuario "${ahora.name}": ${error.message}`);
      }
      // Al editar, un PIN en blanco significa "no cambiarlo" — solo se llama
      // a la RPC cuando la pantalla trae un valor nuevo de verdad.
      if (ahora.pin) await fijarPinSiCorresponde(ahora.id, ahora.pin);
    }

    for (const u of eliminados) {
      await llamarApiUsuarios("DELETE", { id: u.id });
    }

    await cargarCatalogos({ forzar: true });
  },
};

/* Envuelve galpon.fijar_pin (migración 0013): la propia función ya devuelve
   mensajes pensados para mostrarse tal cual ("Ese PIN ya lo usa otra
   persona…"), así que no hace falta traducir nada más. */
async function fijarPinSiCorresponde(perfilId, pin) {
  const sb = obtenerCliente();
  const { error } = await sb.rpc("fijar_pin", { p_perfil_id: perfilId, p_pin: String(pin) });
  if (error) throw new Error(error.message);
}

async function llamarApiUsuarios(metodo, cuerpo) {
  const sb = obtenerCliente();
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch("/api/usuarios", {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token || ""}`,
    },
    body: JSON.stringify(cuerpo),
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error || "No se pudo completar la operación de usuarios");
  return datos;
}

/* Los códigos internos que ya están tomados, incluidos los de productos dados
   de baja.

   Hace falta preguntárselos a la base y no mirar el catálogo que tiene la
   pantalla: ese trae solo los productos activos, y un producto inactivo sigue
   ocupando su código —el índice único de la base no distingue—. Sin esto, el
   primer código repartido chocaba contra el de un producto retirado hace
   meses y la etiqueta no se podía guardar.

   Se piden solo los del bloque interno, que son unas decenas, no los cinco mil
   del catálogo. */
export async function codigosInternosUsados(prefijo) {
  const sb = obtenerCliente();
  const filas = await traerTodo(() =>
    sb.from("producto").select("codigo_barras").like("codigo_barras", `${prefijo}%`)
  );
  return filas.map((f) => String(f.codigo_barras || "")).filter(Boolean);
}
