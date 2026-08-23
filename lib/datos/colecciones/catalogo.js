import { obtenerCliente, obtenerClienteArchivos, BUCKET_PUBLICO } from "@/lib/supabase/cliente";
import {
  cargarCatalogos, traerTodo, nombreDeCategoria, nombreDePerfil,
  asegurarCategoria, registrarProveedor, olvidarProveedor,
  registrarCliente, olvidarCliente, registrarCategoria, olvidarCategoria,
} from "@/lib/datos/catalogos";
import { num, distintos, clave } from "@/lib/datos/traduccion";
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

export const productos = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    await cargarCatalogos();

    const [filas, historial, aprobaciones] = await Promise.all([
      traerTodo(() => sb.from("producto").select("*").eq("activo", true).order("nombre")),
      traerTodo(() =>
        sb.from("producto_precio_historial")
          .select("producto_id,fecha,costo,precio")
          .order("producto_id").order("fecha", { ascending: true })
      ),
      traerTodo(() =>
        sb.from("aprobacion_precio")
          .select("*")
          .eq("estado", "pendiente")
      ),
    ]);

    const porProducto = new Map();
    for (const h of historial) {
      const lista = porProducto.get(h.producto_id) || [];
      lista.push({ date: h.fecha, cost: num(h.costo), price: num(h.precio) });
      porProducto.set(h.producto_id, lista);
    }

    const pendientes = new Map(aprobaciones.map((a) => [a.producto_id, a]));

    return filas.map((f) => {
      const ap = pendientes.get(f.id);
      return {
        id: f.id,
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
        .select("id,nombre,usuario,rol,activo,creado_at")
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
    }

    for (const { antes, ahora } of cambiados) {
      if (ahora.password) {
        await llamarApiUsuarios("PATCH", { id: ahora.id, contrasena: ahora.password });
      }
      if (antes.name !== ahora.name || antes.role !== ahora.role || antes.username !== ahora.username) {
        const { error } = await sb.from("perfil")
          .update({ nombre: ahora.name, usuario: ahora.username, rol: ahora.role })
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
