import { obtenerCliente, obtenerClienteArchivos, BUCKET_PUBLICO } from "@/lib/supabase/cliente";
import {
  cargarCatalogos, traerTodo, nombreDeCategoria, nombreDePerfil,
  asegurarCategoria, registrarProveedor, olvidarProveedor,
} from "@/lib/datos/catalogos";
import { num, distintos } from "@/lib/datos/traduccion";
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
      ivaIncluido: data.iva_incluido,
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
      iva_incluido: valor.ivaIncluido !== false,
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
        // La aplicación conserva las últimas 15 entradas; la base guarda todas.
        priceHistory: (porProducto.get(f.id) || []).slice(-15),
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
    for (const p of nuevos) {
      const categoria_id = await asegurarCategoria(p.category);
      const fila = {
        id: p.id,
        codigo_barras: p.barcode || "",
        nombre: p.name,
        categoria_id,
        precio: num(p.price),
        costo: num(p.cost),
        stock_minimo: num(p.minStock, 5),
        proveedor_id: p.supplierId || null,
        tipo_unidad: p.unitType === "peso" ? "peso" : "unidad",
        unidades_por_kg: p.unitType === "peso" ? null : (p.unitsPerKg ?? null),
        acceso_rapido: !!p.quickAccess,
        // El stock NO se escribe directo: entra por el kárdex, que es quien
        // lleva el saldo y deja el rastro de dónde salió cada unidad.
      };
      const { error } = await sb.from("producto").insert(fila);
      if (error) throw new Error(`Producto "${p.name}": ${error.message}`);

      if (num(p.stock) !== 0) {
        await moverKardex(sb, p.id, num(p.stock), origenStock, p.cost, idUsuario);
      }
      if (p.priceApproval) await crearAprobacion(sb, p, idUsuario);
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
    for (const p of eliminados) {
      const { error } = await sb.from("producto").update({ activo: false }).eq("id", p.id);
      if (error) throw new Error(`No se pudo retirar "${p.name}": ${error.message}`);
    }
  },
};

async function moverKardex(sb, productoId, cantidad, origen, costo, idUsuario) {
  const { error } = await sb.from("kardex").insert({
    producto_id: productoId,
    origen,
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

  async escribir(actual, anterior) {
    const sb = obtenerCliente();
    const { nuevos, cambiados, eliminados } = diferencias(anterior, actual);

    const aFila = (s) => ({
      nombre: (s.name || "").trim(),
      categoria: s.category || null,
      rut: s.rut || null,
      contacto_nombre: s.contactName || null,
      telefono: s.phone || null,
      email: s.email || null,
      direccion: s.address || null,
      notas: s.notes || null,
    });

    for (const s of nuevos) {
      const { data, error } = await sb
        .from("proveedor").insert({ id: s.id, ...aFila(s) }).select().single();
      if (error) throw new Error(`Proveedor "${s.name}": ${error.message}`);
      registrarProveedor(data);
    }
    for (const { antes, ahora } of cambiados) {
      if (!distintos(antes, ahora, CAMPOS_PROVEEDOR)) continue;
      const { data, error } = await sb
        .from("proveedor").update(aFila(ahora)).eq("id", ahora.id).select().single();
      if (error) throw new Error(`Proveedor "${ahora.name}": ${error.message}`);
      registrarProveedor(data);
    }
    for (const s of eliminados) {
      const { error } = await sb.from("proveedor").update({ activo: false }).eq("id", s.id);
      if (error) throw new Error(`No se pudo retirar "${s.name}": ${error.message}`);
      olvidarProveedor(s.id);
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

  async escribir(actual, anterior) {
    const sb = obtenerCliente();
    const { nuevos, cambiados, eliminados } = diferencias(anterior, actual);

    for (const t of nuevos) {
      const { error } = await sb.from("trabajador").insert({ id: t.id, nombre: (t.name || "").trim() });
      if (error) throw new Error(`Trabajador "${t.name}": ${error.message}`);
    }
    for (const { antes, ahora } of cambiados) {
      if (antes.name === ahora.name) continue;
      const { error } = await sb.from("trabajador")
        .update({ nombre: (ahora.name || "").trim() }).eq("id", ahora.id);
      if (error) throw new Error(`Trabajador "${ahora.name}": ${error.message}`);
    }
    // Se desactivan en vez de borrarse: sus pagos de sueldo siguen en el libro.
    for (const t of eliminados) {
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
    const filas = await traerTodo(() =>
      sb.from("perfil").select("*").eq("activo", true).order("nombre")
    );
    return filas.map((f) => ({
      id: f.id,
      name: f.nombre,
      username: f.usuario,
      password: "",           // nunca sale de Supabase Auth
      role: f.rol,
      createdAt: f.creado_at,
    }));
  },

  async escribir(actual, anterior) {
    const { nuevos, cambiados, eliminados } = diferencias(anterior, actual);
    const sb = obtenerCliente();

    for (const u of nuevos) {
      await llamarApiUsuarios("POST", {
        nombre: u.name, usuario: u.username, contrasena: u.password, rol: u.role,
      });
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
    }

    for (const u of eliminados) {
      await llamarApiUsuarios("DELETE", { id: u.id });
    }

    await cargarCatalogos({ forzar: true });
  },
};

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
