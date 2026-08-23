import { obtenerCliente } from "@/lib/supabase/cliente";
import {
  traerTodo, nombreDePerfil, idDePerfil, nombreDeCategoria, nombreDeProveedor,
  nombreDeCliente,
} from "@/lib/datos/catalogos";
import {
  num, traducir, distintos,
  A_METODO_PAGO, DESDE_METODO_PAGO,
  A_METODO_PAGO_PROVEEDOR, DESDE_METODO_PAGO_PROVEEDOR,
  A_CATEGORIA_MOVIMIENTO, DESDE_CATEGORIA_MOVIMIENTO,
  A_MOTIVO_MERMA, DESDE_MOTIVO_MERMA,
  A_TIPO_FEEDBACK, DESDE_TIPO_FEEDBACK,
} from "@/lib/datos/traduccion";
import { diferencias, soloNuevos } from "@/lib/datos/diferencias";

/* Colecciones de operación: ventas, caja, compras, conteos y calendario.

   La mayoría son registros que solo crecen: una venta emitida o un asiento de
   caja no se editan desde las pantallas. Para esos basta con detectar lo nuevo. */

/* Cuánto historial se trae al abrir el sistema. Los paneles de análisis
   comparan contra el año anterior, así que se cargan dos años completos más el
   histórico importado del Excel, que va marcado aparte. */
const MESES_DE_HISTORIAL = 24;

/* Días que mira la sincronización periódica entre cajas. Alcanza de sobra: lo
   anterior ya está en pantalla y no cambia. */
const DIAS_RECIENTES = 3;

function desdeCuando(opciones = {}) {
  const d = new Date();
  if (opciones.reciente) d.setDate(d.getDate() - DIAS_RECIENTES);
  else d.setMonth(d.getMonth() - MESES_DE_HISTORIAL);
  return d.toISOString();
}

/* =====================================================================
   sales-log  ↔  galpon.venta + galpon.venta_detalle
   ===================================================================== */

export const ventas = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    const filas = await traerTodo(() =>
      sb.from("venta")
        .select("*, venta_detalle(*)")
        .eq("anulada", false)
        .gte("fecha", desdeCuando(opciones))
        .order("fecha", { ascending: false })
    );

    return filas.map((v) => ({
      id: v.id,
      invoiceNumber: v.numero_boleta,
      date: v.fecha,
      seller: nombreDePerfil(v.vendedor_id),
      // Solo se llena cuando la venta se fio (migración 0012): el nombre se
      // resuelve contra el catálogo de clientes, igual que el vendedor se
      // resuelve contra el de perfiles.
      customerId: v.cliente_id || null,
      customer: v.cliente_id ? nombreDeCliente(v.cliente_id) || null : null,
      total: num(v.total),
      paymentMethod: DESDE_METODO_PAGO[v.metodo_pago] || "Efectivo",
      // Nulo en las ventas anteriores a la migración 0023: de esas no se sabe
      // si llevaron boleta. Se deja como null y no como false para que el
      // resumen del SII no las cuente como no declaradas.
      boletaEmitida: v.boleta_emitida == null ? null : !!v.boleta_emitida,
      items: (v.venta_detalle || []).map((d) => ({
        productId: d.producto_id,
        name: d.nombre_producto,
        barcode: d.codigo_barras || "",
        qty: num(d.cantidad),
        price: num(d.precio_unitario),
        cost: num(d.costo_unitario),
        unitType: d.tipo_unidad,
      })),
    }));
  },

  async escribir(actual, anterior, opciones = {}) {
    const sb = obtenerCliente();
    const nuevas = soloNuevos(anterior, actual);
    if (nuevas.length === 0) return;

    const idUsuario = opciones.idUsuario || null;

    // La caja abierta de quien vende. Antes el vínculo venta↔turno era
    // implícito (mismo nombre y rango de fechas); ahora queda escrito.
    let turnoId = null;
    if (idUsuario) {
      const { data } = await sb.from("turno")
        .select("id").eq("perfil_id", idUsuario).eq("estado", "abierto").maybeSingle();
      turnoId = data?.id || null;
    }

    for (const v of nuevas) {
      // El PIN de vendedor (migración 0013) identifica a la persona real que
      // vendió y trae su id de perfil de forma directa. Antes solo existía
      // el nombre, y había que adivinar el id buscándolo por nombre —lo que
      // queda como respaldo para ventas antiguas o restauradas que no traen
      // sellerId— o, en su defecto, usar el id de quien tiene la sesión
      // abierta en el navegador de esta caja (que en una caja compartida no
      // necesariamente es quien vendió).
      const vendedorId = v.sellerId || idDePerfil(v.seller) || idUsuario;
      const filaVenta = {
        id: v.id,
        fecha: v.date,
        vendedor_id: vendedorId,
        turno_id: turnoId,
        metodo_pago: traducir(A_METODO_PAGO, v.paymentMethod, "efectivo"),
        total: num(v.total),
      };
      // Se agrega la llave solo cuando corresponde (venta fiada). Si se
      // mandara siempre, aunque fuera en null, CUALQUIER venta —no solo las
      // fiadas— fallaría en una base donde todavía no se aplicó la
      // migración 0012: PostgREST rechaza el insert entero si el objeto
      // trae una columna ("cliente_id") que la tabla todavía no tiene.
      if (v.customerId) filaVenta.cliente_id = v.customerId;
      // Solo si la pantalla lo respondió de verdad: una venta restaurada de
      // un respaldo viejo no trae el dato, y ahí corresponde el nulo.
      if (typeof v.boletaEmitida === "boolean") filaVenta.boleta_emitida = v.boletaEmitida;
      // Al restaurar un respaldo se conserva el número original de cada boleta;
      // en una venta nueva lo asigna la secuencia de Postgres.
      if (opciones.preservarNumero && v.invoiceNumber) {
        filaVenta.numero_boleta = v.invoiceNumber;
      }
      const { data: creada, error } = await sb.from("venta")
        .insert(filaVenta).select("id,numero_boleta").single();
      if (error) throw new Error(`Boleta: ${error.message}`);

      // El número de boleta lo asigna una secuencia de Postgres, así que puede
      // no coincidir con el que la pantalla mostró: se corrige en memoria.
      v.invoiceNumber = creada.numero_boleta;

      const lineas = (v.items || []).map((it) => ({
        venta_id: v.id,
        producto_id: it.productId || null,
        nombre_producto: it.name,
        codigo_barras: it.barcode || null,
        cantidad: num(it.qty),
        precio_unitario: num(it.price),
        costo_unitario: num(it.cost),
        tipo_unidad: it.unitType === "peso" ? "peso" : "unidad",
      }));
      if (lineas.length) {
        const { error: e2 } = await sb.from("venta_detalle").insert(lineas);
        if (e2) throw new Error(`Detalle de la boleta: ${e2.message}`);
      }
    }
  },
};

/* =====================================================================
   customer-ledger  ↔  galpon.cliente_movimiento

   El libro de fiado (migración 0012). Solo crece: un cargo nace de una
   venta fiada en el POS, un abono nace de que un cliente pagó su deuda.
   Ninguno de los dos se edita ni se borra desde las pantallas, así que
   basta con detectar lo nuevo — igual que ventas y movements-log.

   El saldo de un cliente no vive en ninguna fila propia: se calcula en la
   pantalla sumando sus cargos y restando sus abonos (ver ClientesView en
   sistema-ventas.jsx). Guardar un saldo aparte sería un número que se
   puede desincronizar del detalle real, el mismo motivo por el que el
   stock de un producto se deriva del kárdex en vez de guardarse suelto.
   ===================================================================== */

export const clienteMovimientos = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    let filas;
    try {
      filas = await traerTodo(() =>
        sb.from("cliente_movimiento")
          .select("*")
          .gte("fecha", desdeCuando(opciones))
          .order("fecha", { ascending: false })
      );
    } catch (e) {
      console.error("[datos] cliente_movimiento no disponible todavía (¿falta aplicar la migración 0012?)", e);
      return [];
    }
    return filas.map((m) => ({
      id: m.id,
      customerId: m.cliente_id,
      type: m.tipo,               // "cargo" | "abono"
      amount: num(m.monto),
      date: m.fecha,
      saleId: m.venta_id || null,
      paymentMethod: m.metodo_pago ? (DESDE_METODO_PAGO[m.metodo_pago] || null) : null,
      note: m.nota || "",
      registeredBy: nombreDePerfil(m.registrado_por),
    }));
  },

  async escribir(actual, anterior, opciones = {}) {
    const sb = obtenerCliente();
    const nuevos = soloNuevos(anterior, actual);
    if (nuevos.length === 0) return;
    const idUsuario = opciones.idUsuario || null;

    const filas = nuevos.map((m) => ({
      id: m.id,
      cliente_id: m.customerId,
      tipo: m.type,
      monto: num(m.amount),
      fecha: m.date,
      venta_id: m.saleId || null,
      metodo_pago: m.paymentMethod ? traducir(A_METODO_PAGO, m.paymentMethod, null) : null,
      nota: m.note || null,
      registrado_por: idUsuario,
    }));
    const { error } = await sb.from("cliente_movimiento").insert(filas);
    if (error) throw new Error(`Fiado: ${error.message}`);
  },
};

/* =====================================================================
   movements-log  ↔  galpon.movimiento (+ tablas de detalle)
   ===================================================================== */

export const movimientos = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    const filas = await traerTodo(() =>
      sb.from("movimiento")
        .select("*, movimiento_merma(*), movimiento_sueldo(*), movimiento_ajuste(*)")
        .gte("fecha", desdeCuando(opciones))
        .order("fecha", { ascending: false })
    );

    // Los movimientos históricos importados del Excel son anteriores a la
    // ventana de dos años, así que se traen aparte y sin recortar. En la
    // sincronización periódica se saltan: son inmutables y ya están cargados.
    const historicos = opciones.reciente ? [] : await traerTodo(() =>
      sb.from("movimiento").select("*").eq("historico", true).order("fecha")
    );

    const vistos = new Set(filas.map((f) => f.id));
    const todos = [...filas, ...historicos.filter((h) => !vistos.has(h.id))];

    // Qué movimientos tienen boleta/factura adjunta (migración 0011, sección
    // "Pagos y gastos"). Es una tabla aparte y chica —solo crece cuando de
    // verdad se adjunta algo—, así que basta con traer los identificadores.
    // Si la migración 0011 todavía no se aplicó en esta base, la tabla no
    // existe: se ignora en vez de romper la carga de todo el libro de caja.
    let conDocumento = new Set();
    try {
      const documentos = await traerTodo(() =>
        sb.from("movimiento_documento").select("movimiento_id")
      );
      conDocumento = new Set(documentos.map((d) => d.movimiento_id));
    } catch (e) {
      console.error("[datos] movimiento_documento no disponible todavía (¿falta aplicar la migración 0011?)", e);
    }

    return todos.map((m) => {
      const base = {
        id: m.id,
        date: m.fecha,
        type: m.tipo,
        concept: m.concepto,
        amount: num(m.monto),
        category: DESDE_CATEGORIA_MOVIMIENTO[m.categoria] || "General",
        auto: m.automatico,
      };
      if (m.historico) base.historical = true;
      if (m.proveedor_id) base.supplierId = m.proveedor_id;
      if (m.factura_id) base.invoiceId = m.factura_id;
      if (conDocumento.has(m.id)) base.hasDocument = true;

      const me = primero(m.movimiento_merma);
      if (me) Object.assign(base, {
        reason: DESDE_MOTIVO_MERMA[me.motivo] || "Otro",
        productId: me.producto_id,
        productName: me.nombre_producto,
        qty: num(me.cantidad),
        unitType: me.tipo_unidad,
        reportedBy: nombreDePerfil(me.reportado_por),
        authorizedBy: me.autorizado_por_nombre || nombreDePerfil(me.autorizado_por),
      });

      const aj = primero(m.movimiento_ajuste);
      if (aj) Object.assign(base, {
        countId: aj.conteo_id, productId: aj.producto_id, diff: num(aj.diferencia),
      });

      const su = primero(m.movimiento_sueldo);
      if (su) Object.assign(base, {
        paymentDate: su.fecha_pago,
        workerId: su.trabajador_id,
        workerName: su.nombre_trabajador,
        note: su.nota || "",
        paidBy: nombreDePerfil(su.pagado_por),
      });

      return base;
    });
  },

  async escribir(actual, anterior, opciones = {}) {
    const sb = obtenerCliente();
    const nuevos = soloNuevos(anterior, actual);
    if (nuevos.length === 0) return;
    const idUsuario = opciones.idUsuario || null;

    for (const m of nuevos) {
      const categoria = traducir(A_CATEGORIA_MOVIMIENTO, m.category, "general");
      const { error } = await sb.from("movimiento").insert({
        id: m.id,
        fecha: m.date,
        tipo: m.type === "egreso" ? "egreso" : "ingreso",
        categoria,
        concepto: m.concept || "",
        monto: Math.abs(num(m.amount)),
        automatico: m.auto !== false,
        historico: !!m.historical,
        registrado_por: idUsuario,
        proveedor_id: m.supplierId || null,
        factura_id: m.invoiceId || null,
        venta_id: m.saleId || null,
      });
      if (error) throw new Error(`Movimiento de caja: ${error.message}`);

      if (categoria === "merma" && m.productId) {
        const { error: e } = await sb.from("movimiento_merma").insert({
          movimiento_id: m.id,
          producto_id: m.productId,
          nombre_producto: m.productName || "",
          cantidad: Math.abs(num(m.qty)) || 1,
          tipo_unidad: m.unitType === "peso" ? "peso" : "unidad",
          motivo: traducir(A_MOTIVO_MERMA, m.reason, "otro"),
          reportado_por: idDePerfil(m.reportedBy) || idUsuario,
          autorizado_por: idDePerfil(m.authorizedBy),
          autorizado_por_nombre: m.authorizedBy || null,
        });
        if (e) throw new Error(`Detalle de merma: ${e.message}`);
      }

      if (categoria === "ajuste_inventario" && m.countId) {
        const { error: e } = await sb.from("movimiento_ajuste").insert({
          movimiento_id: m.id,
          conteo_id: m.countId,
          producto_id: m.productId || null,
          diferencia: num(m.diff),
        });
        if (e) throw new Error(`Detalle del ajuste: ${e.message}`);
      }

      if ((categoria === "sueldo" || categoria === "sueldo_historico") && (m.workerId || m.workerName)) {
        // Al restaurar, el identificador del trabajador puede venir de la
        // versión anterior y no existir acá. En ese caso se busca por nombre,
        // que es como el negocio los distingue.
        let trabajadorId = m.workerId;
        if (trabajadorId) {
          const { data } = await sb.from("trabajador").select("id").eq("id", trabajadorId).maybeSingle();
          if (!data) trabajadorId = null;
        }
        if (!trabajadorId && m.workerName) {
          const { data } = await sb.from("trabajador")
            .select("id").ilike("nombre", m.workerName.trim()).maybeSingle();
          trabajadorId = data?.id || null;
        }
        if (!trabajadorId) {
          console.warn("[restaurar] sueldo sin trabajador reconocible:", m.workerName);
          continue;
        }
        const { error: e } = await sb.from("movimiento_sueldo").insert({
          movimiento_id: m.id,
          trabajador_id: trabajadorId,
          nombre_trabajador: m.workerName || "",
          fecha_pago: m.paymentDate || (m.date || "").slice(0, 10),
          nota: m.note || null,
          pagado_por: idDePerfil(m.paidBy) || idUsuario,
        });
        if (e) throw new Error(`Detalle de sueldo: ${e.message}`);
      }
    }
  },
};

function primero(v) {
  if (!v) return null;
  return Array.isArray(v) ? v[0] || null : v;
}

/* =====================================================================
   open-shifts / shifts-log  ↔  galpon.turno (+ turno_movimiento)

   La versión anterior tenía dos listas separadas que compartían el mismo
   identificador; aquí son la misma tabla con un estado.
   ===================================================================== */

function aTurnoLegible(t) {
  // Los retiros y refuerzos llegan anidados en la misma consulta del turno.
  // Pedirlos aparte con una lista de identificadores hacía crecer la dirección
  // de la consulta sin techo: con un par de años de cierres, deja de funcionar.
  const mios = t.turno_movimiento || [];
  const mapear = (tipo) =>
    mios.filter((m) => m.tipo === tipo).map((m) => ({
      id: m.id, amount: num(m.monto), reason: m.motivo || "",
      date: m.fecha, by: nombreDePerfil(m.registrado_por),
    }));
  return {
    id: t.id,
    openedBy: nombreDePerfil(t.perfil_id),
    openedByRole: t.rol_apertura,
    openedAt: t.abierto_at,
    openingAmount: num(t.monto_apertura),
    withdrawals: mapear("retiro"),
    reinforcements: mapear("refuerzo"),
    status: "open",
  };
}

export const turnosAbiertos = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    const filas = await traerTodo(() =>
      sb.from("turno").select("*, turno_movimiento(*)")
        .eq("estado", "abierto").order("abierto_at")
    );
    return filas.map((t) => aTurnoLegible(t));
  },

  async escribir(actual, anterior, opciones = {}) {
    const sb = obtenerCliente();
    const { nuevos, cambiados } = diferencias(anterior, actual);
    const idUsuario = opciones.idUsuario || null;

    for (const t of nuevos) {
      const { error } = await sb.from("turno").insert({
        id: t.id,
        perfil_id: idDePerfil(t.openedBy) || idUsuario,
        rol_apertura: t.openedByRole === "admin" ? "admin" : "vendedor",
        abierto_at: t.openedAt,
        monto_apertura: num(t.openingAmount),
      });
      if (error) throw new Error(`Apertura de caja: ${error.message}`);
    }

    // Retiros y refuerzos: solo pueden aparecer nuevos, nunca editarse.
    for (const { antes, ahora } of cambiados) {
      for (const tipo of [["withdrawals", "retiro"], ["reinforcements", "refuerzo"]]) {
        const [campo, valor] = tipo;
        const agregados = soloNuevos(antes[campo], ahora[campo]);
        for (const mov of agregados) {
          const { error } = await sb.from("turno_movimiento").insert({
            id: mov.id,
            turno_id: ahora.id,
            tipo: valor,
            monto: Math.abs(num(mov.amount)),
            motivo: mov.reason || null,
            fecha: mov.date,
            registrado_por: idDePerfil(mov.by) || idUsuario,
          });
          if (error) throw new Error(`${valor === "retiro" ? "Retiro" : "Refuerzo"} de caja: ${error.message}`);
        }
      }
    }
    // Los turnos que desaparecen de esta lista se cerraron: el cierre lo
    // escribe la colección shifts-log, que corre en la misma operación.
  },
};

export const turnosCerrados = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    const filas = await traerTodo(() =>
      sb.from("turno").select("*, turno_movimiento(*)").eq("estado", "cerrado")
        .gte("abierto_at", desdeCuando(opciones))
        .order("cerrado_at", { ascending: false })
    );
    return filas.map((t) => {
      const base = aTurnoLegible(t);
      return {
        id: t.id,
        openedBy: base.openedBy,
        openedAt: t.abierto_at,
        closedBy: nombreDePerfil(t.cerrado_por),
        closedAt: t.cerrado_at,
        openingAmount: num(t.monto_apertura),
        salesByMethod: {
          Efectivo: num(t.ventas_efectivo),
          "Débito": num(t.ventas_debito),
          "Crédito": num(t.ventas_credito),
          Transferencia: num(t.ventas_transferencia),
        },
        salesTotal: num(t.ventas_total),
        salesCount: num(t.ventas_cantidad),
        withdrawals: base.withdrawals,
        withdrawalsTotal: num(t.retiros_total),
        reinforcements: base.reinforcements,
        reinforcementsTotal: num(t.refuerzos_total),
        expectedCash: num(t.efectivo_esperado),
        countedCash: num(t.efectivo_contado),
        difference: num(t.diferencia),
      };
    });
  },

  async escribir(actual, anterior, opciones = {}) {
    const sb = obtenerCliente();
    const nuevos = soloNuevos(anterior, actual);
    const idUsuario = opciones.idUsuario || null;

    for (const c of nuevos) {
      const m = c.salesByMethod || {};
      const cierre = {
        estado: "cerrado",
        cerrado_por: idDePerfil(c.closedBy) || idUsuario,
        cerrado_at: c.closedAt,
        efectivo_contado: num(c.countedCash),
        ventas_efectivo: num(m.Efectivo),
        ventas_debito: num(m["Débito"]),
        ventas_credito: num(m["Crédito"]),
        ventas_transferencia: num(m.Transferencia),
        ventas_total: num(c.salesTotal),
        ventas_cantidad: num(c.salesCount),
        retiros_total: num(c.withdrawalsTotal),
        refuerzos_total: num(c.reinforcementsTotal),
        efectivo_esperado: num(c.expectedCash),
      };

      const { data: actualizado, error } = await sb.from("turno")
        .update(cierre).eq("id", c.id).select("id");
      if (error) throw new Error(`Cierre de caja: ${error.message}`);

      // Al restaurar un respaldo, el turno cerrado nunca pasó por la lista de
      // cajas abiertas: no hay fila que actualizar y hay que crearla entera.
      if (!actualizado || actualizado.length === 0) {
        const { error: e2 } = await sb.from("turno").insert({
          id: c.id,
          perfil_id: idDePerfil(c.openedBy) || idUsuario,
          rol_apertura: "vendedor",
          abierto_at: c.openedAt,
          monto_apertura: num(c.openingAmount),
          ...cierre,
        });
        if (e2) throw new Error(`Cierre de caja: ${e2.message}`);
      }
    }
  },
};

/* =====================================================================
   invoices-index  ↔  galpon.factura_compra
   ===================================================================== */

export const facturas = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    const filas = await traerTodo(() =>
      sb.from("factura_compra").select("*")
        .gte("fecha", desdeCuando(opciones)).order("fecha", { ascending: false })
    );
    return filas.map((f) => ({
      id: f.id,
      date: f.fecha,
      supplierId: f.proveedor_id,
      supplierName: f.nombre_proveedor,
      refNumber: f.numero_documento,
      itemCount: 0,           // se recalcula en pantalla desde las líneas
      totalNet: num(f.total_neto),
      totalGross: num(f.total_bruto),
      registeredBy: nombreDePerfil(f.registrado_por),
      noDocument: f.sin_documento,
      reason: f.motivo_sin_documento,
      // Con qué se pagó esta recepción (migración 0014). Si la migración
      // todavía no se aplicó, la columna no viene en la fila y esto queda
      // undefined — la pantalla lo trata igual que "Efectivo".
      paymentMethod: f.metodo_pago ? (DESDE_METODO_PAGO_PROVEEDOR[f.metodo_pago] || null) : null,
    }));
  },

  async escribir(actual, anterior, opciones = {}) {
    const sb = obtenerCliente();
    const nuevas = soloNuevos(anterior, actual);
    const idUsuario = opciones.idUsuario || null;

    for (const f of nuevas) {
      // El número de documento es opcional en pantalla, pero en la base es único
      // por proveedor. Inventar un "S/N" haría chocar la segunda recepción sin
      // número del mismo proveedor, así que esa se trata como entrada libre.
      const numero = (f.refNumber || "").trim();
      const sinDoc = !!f.noDocument || !numero;
      const fila = {
        id: f.id,
        fecha: f.date,
        proveedor_id: f.supplierId || null,
        nombre_proveedor: f.supplierName || "Sin proveedor",
        numero_documento: sinDoc ? null : numero,
        motivo_sin_documento: sinDoc
          ? (f.reason || "Recepción registrada sin número de documento")
          : null,
        sin_documento: sinDoc,
        total_neto: num(f.totalNet),
        registrado_por: idDePerfil(f.registeredBy) || idUsuario,
      };
      // Se agrega solo cuando viene informado (igual que cliente_id en
      // ventas): así una recepción sigue funcionando en una base donde
      // todavía no se aplicó la migración 0014, tratándose como "efectivo"
      // por el valor por defecto de la columna.
      if (f.paymentMethod) fila.metodo_pago = traducir(A_METODO_PAGO_PROVEEDOR, f.paymentMethod, "efectivo");
      const { error } = await sb.from("factura_compra").insert(fila);
      if (error) throw new Error(`Documento de compra: ${error.message}`);
    }
  },
};

/* =====================================================================
   supplier-ledger  ↔  galpon.proveedor_movimiento

   El libro de crédito con proveedores (migración 0014) — espejo de
   customer-ledger, en sentido contrario: acá quien debe es EL GALPÓN.
   Un cargo nace de una recepción pagada "a crédito" en Recepción; un
   abono nace de que se le pagó al proveedor. Ninguno de los dos se edita
   ni se borra desde las pantallas, así que basta con detectar lo nuevo.

   El saldo que se le debe a un proveedor no vive en ninguna fila propia:
   se deriva sumando cargos y restando abonos (ver SuppliersView en
   sistema-ventas.jsx), igual que el saldo de un cliente fiado.
   ===================================================================== */

export const proveedorMovimientos = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    let filas;
    try {
      filas = await traerTodo(() =>
        sb.from("proveedor_movimiento")
          .select("*")
          .gte("fecha", desdeCuando(opciones))
          .order("fecha", { ascending: false })
      );
    } catch (e) {
      console.error("[datos] proveedor_movimiento no disponible todavía (¿falta aplicar la migración 0014?)", e);
      return [];
    }
    return filas.map((m) => ({
      id: m.id,
      supplierId: m.proveedor_id,
      type: m.tipo,               // "cargo" | "abono"
      amount: num(m.monto),
      date: m.fecha,
      invoiceId: m.factura_id || null,
      paymentMethod: m.metodo_pago ? (DESDE_METODO_PAGO_PROVEEDOR[m.metodo_pago] || null) : null,
      note: m.nota || "",
      registeredBy: nombreDePerfil(m.registrado_por),
    }));
  },

  async escribir(actual, anterior, opciones = {}) {
    const sb = obtenerCliente();
    const nuevos = soloNuevos(anterior, actual);
    if (nuevos.length === 0) return;
    const idUsuario = opciones.idUsuario || null;

    const filas = nuevos.map((m) => ({
      id: m.id,
      proveedor_id: m.supplierId,
      tipo: m.type,
      monto: num(m.amount),
      fecha: m.date,
      factura_id: m.invoiceId || null,
      metodo_pago: m.paymentMethod ? traducir(A_METODO_PAGO_PROVEEDOR, m.paymentMethod, null) : null,
      nota: m.note || null,
      registrado_por: idUsuario,
    }));
    const { error } = await sb.from("proveedor_movimiento").insert(filas);
    if (error) throw new Error(`Crédito con proveedor: ${error.message}`);
  },
};

/* =====================================================================
   purchase-items-log  ↔  galpon.compra_detalle
   ===================================================================== */

export const lineasDeCompra = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    const filas = await traerTodo(() =>
      sb.from("compra_detalle").select("*")
        .gte("fecha", desdeCuando(opciones)).order("fecha", { ascending: false })
    );
    return filas.map((f) => ({
      id: f.id,
      date: f.fecha,
      invoiceId: f.factura_id,
      supplierId: f.proveedor_id,
      supplierName: f.nombre_proveedor || nombreDeProveedor(f.proveedor_id),
      productId: f.producto_id,
      productName: f.nombre_producto,
      qty: num(f.cantidad),
      netCost: num(f.costo_neto_unitario),
    }));
  },

  async escribir(actual, anterior, opciones = {}) {
    const sb = obtenerCliente();
    const nuevas = soloNuevos(anterior, actual);
    if (nuevas.length === 0) return;
    const idUsuario = opciones.idUsuario || null;

    const filas = nuevas.map((l) => ({
      id: l.id,
      fecha: l.date,
      factura_id: l.invoiceId || null,
      proveedor_id: l.supplierId || null,
      nombre_proveedor: l.supplierName || null,
      producto_id: l.productId || null,
      nombre_producto: l.productName || "",
      cantidad: Math.abs(num(l.qty)) || 1,
      costo_neto_unitario: num(l.netCost),
      origen: l.invoiceId ? "recepcion" : "reposicion_directa",
      registrado_por: idUsuario,
    }));
    const { error } = await sb.from("compra_detalle").insert(filas);
    if (error) throw new Error(`Líneas de compra: ${error.message}`);
  },
};

/* =====================================================================
   inventory-counts  ↔  galpon.conteo (+ detalle y excepciones)
   ===================================================================== */

export const conteos = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    const filas = await traerTodo(() => {
      const q = sb.from("conteo")
        .select("*, conteo_detalle(*), conteo_excepcion(*)")
        .order("fecha_limite", { ascending: false });
      // El inventario general dejó más de mil conteos, cada uno con su detalle.
      // Traerlos todos cada 15 segundos costaba más que cualquier otra consulta
      // del sistema salvo el catálogo. En la sincronización basta con los de los
      // últimos días y con los que siguen pendientes —un conteo completado hace
      // una semana ya no cambia—; el resto ya está en pantalla.
      return opciones.reciente
        ? q.or(`creado_at.gte.${desdeCuando(opciones)},estado.eq.pendiente`)
        : q;
    });
    return filas.map((c) => {
      const exc = (c.conteo_excepcion || []).slice().sort(
        (a, b) => new Date(b.solicitado_at) - new Date(a.solicitado_at)
      )[0];
      return {
        id: c.id,
        dueDate: c.fecha_limite,
        category: nombreDeCategoria(c.categoria_id),
        assignedToId: c.asignado_a,
        assignedToName: nombreDePerfil(c.asignado_a),
        assignedBy: nombreDePerfil(c.asignado_por),
        status: c.estado,
        createdAt: c.creado_at,
        completedAt: c.completado_at,
        completedBy: nombreDePerfil(c.completado_por),
        items: (c.conteo_detalle || []).map((d) => ({
          productId: d.producto_id,
          name: d.nombre_producto,
          unitType: d.tipo_unidad,
          expected: num(d.esperado),
          counted: num(d.contado),
          diff: num(d.diferencia),
        })),
        exception: exc
          ? {
              reason: exc.motivo,
              requestedBy: nombreDePerfil(exc.solicitado_por),
              requestedAt: exc.solicitado_at,
              approvedBy: nombreDePerfil(exc.aprobado_por),
              approvedAt: exc.aprobado_at,
              previousDueDate: exc.fecha_limite_anterior,
              __id: exc.id,
            }
          : null,
      };
    });
  },

  async escribir(actual, anterior, opciones = {}) {
    const sb = obtenerCliente();
    const { nuevos, cambiados } = diferencias(anterior, actual);
    const idUsuario = opciones.idUsuario || null;
    const { asegurarCategoria } = await import("@/lib/datos/catalogos");

    for (const c of nuevos) {
      const { error } = await sb.from("conteo").insert({
        id: c.id,
        fecha_limite: c.dueDate,
        categoria_id: await asegurarCategoria(c.category),
        // Al restaurar, el identificador viene del sistema anterior y no
        // corresponde a ninguna cuenta de acá: se cae al nombre.
        asignado_a: c.assignedToId || idDePerfil(c.assignedToName) || idUsuario,
        asignado_por: idDePerfil(c.assignedBy) || idUsuario,
        estado: c.status || "pendiente",
        creado_at: c.createdAt,
      });
      if (error) throw new Error(`Conteo de inventario: ${error.message}`);
    }

    for (const { antes, ahora } of cambiados) {
      // Líneas contadas: se escriben una sola vez, al completar el conteo.
      const lineasNuevas = (ahora.items || []).length > 0 && (antes.items || []).length === 0;
      if (lineasNuevas) {
        const filas = ahora.items.map((it) => ({
          conteo_id: ahora.id,
          producto_id: it.productId,
          nombre_producto: it.name,
          tipo_unidad: it.unitType === "peso" ? "peso" : "unidad",
          esperado: num(it.expected),
          contado: num(it.counted),
        }));
        const { error } = await sb.from("conteo_detalle").insert(filas);
        if (error) throw new Error(`Líneas del conteo: ${error.message}`);
      }

      // Solicitud de excepción nueva. Ojo: puede haber una anterior ya aprobada
      // —la lectura la sigue devolviendo—, así que "nueva" no es solo "antes no
      // había": también lo es pedir otra después de que la primera se resolvió.
      const excepcionNueva = ahora.exception &&
        (!antes.exception || (antes.exception.approvedAt && !ahora.exception.approvedAt));
      if (excepcionNueva) {
        const { error } = await sb.from("conteo_excepcion").insert({
          conteo_id: ahora.id,
          motivo: ahora.exception.reason,
          solicitado_por: idDePerfil(ahora.exception.requestedBy) || idUsuario,
          solicitado_at: ahora.exception.requestedAt,
          fecha_limite_anterior: ahora.exception.previousDueDate || antes.dueDate,
        });
        if (error) throw new Error(`Solicitud de excepción: ${error.message}`);
      }
      // Excepción aprobada
      else if (antes.exception && ahora.exception &&
               !antes.exception.approvedAt && ahora.exception.approvedAt) {
        const { error } = await sb.from("conteo_excepcion").update({
          aprobado_por: idDePerfil(ahora.exception.approvedBy) || idUsuario,
          aprobado_at: ahora.exception.approvedAt,
          fecha_limite_nueva: ahora.dueDate,
        }).eq("id", antes.exception.__id || "");
        if (error) throw new Error(`Aprobación de excepción: ${error.message}`);
      }

      if (distintos(antes, ahora, ["dueDate", "status", "completedAt"])) {
        const { error } = await sb.from("conteo").update({
          fecha_limite: ahora.dueDate,
          estado: ahora.status,
          completado_at: ahora.completedAt || null,
          completado_por: ahora.completedAt
            ? (idDePerfil(ahora.completedBy) || idUsuario)
            : null,
        }).eq("id", ahora.id);
        if (error) throw new Error(`Conteo de inventario: ${error.message}`);
      }
    }
  },
};

/* Conteo rápido — Inventario General (agosto 2026).
   El flujo normal de "conteos" programa un conteo por categoría completa,
   asignado a una sola persona, para completarse días después: dos pasos
   separados en el tiempo (programar, y luego ejecutar). El Inventario
   General es lo opuesto — 3 personas contando productos sueltos, uno por
   uno, en tiempo real, cualquiera cualquier producto — así que acá los dos
   pasos (crear el conteo Y completarlo) pasan en la misma llamada, ya
   completo desde que nace. Reutiliza las mismas tablas (conteo +
   conteo_detalle): cada producto contado es su propio conteo de un solo
   ítem, así que no hay ningún arreglo compartido donde dos celulares
   puedan pisarse el uno al otro — cada fila es independiente. */
export async function registrarConteoRapido({ productId, productName, unitType, expected, counted, categoryName, idUsuario }) {
  const sb = obtenerCliente();
  const { asegurarCategoria } = await import("@/lib/datos/catalogos");
  const categoriaId = categoryName ? await asegurarCategoria(categoryName) : null;
  const ahora = new Date().toISOString();

  const { data: conteo, error } = await sb.from("conteo").insert({
    fecha_limite: ahora.slice(0, 10),
    categoria_id: categoriaId,
    asignado_a: idUsuario,
    asignado_por: idUsuario,
    estado: "completado",
    completado_at: ahora,
    completado_por: idUsuario,
  }).select("id").single();
  if (error) throw new Error(`Conteo rápido: ${error.message}`);

  const { error: e2 } = await sb.from("conteo_detalle").insert({
    conteo_id: conteo.id,
    producto_id: productId,
    nombre_producto: productName,
    tipo_unidad: unitType === "peso" ? "peso" : "unidad",
    esperado: num(expected),
    contado: num(counted),
  });
  if (e2) throw new Error(`Detalle de conteo rápido: ${e2.message}`);

  return conteo.id;
}

/* Ajusta el stock de UN producto directo por el kárdex, sin pasar por el
   catálogo completo. El conteo general puede tocar cientos de productos en
   una noche desde el teléfono: releer y comparar los ~5.000 productos del
   catálogo en cada conteo (el camino que usa products-catalog normalmente)
   sería lento en el teléfono y por datos móviles. Este atajo hace un solo
   insert al kárdex — el trigger de la base ya deja stock_resultante y
   actualiza producto.stock — y devuelve el saldo resultante para que la
   pantalla lo muestre al toque sin tener que releer todo el catálogo. */
export async function ajustarStockRapido({ productId, delta, idUsuario, nota }) {
  if (!delta) return null; // sin cambio real: la base no acepta cantidad = 0
  const sb = obtenerCliente();
  const { data, error } = await sb.from("kardex").insert({
    producto_id: productId,
    origen: "conteo",
    cantidad: delta,
    registrado_por: idUsuario,
    nota: nota || null,
  }).select("stock_resultante").single();
  if (error) throw new Error(`Ajuste de stock: ${error.message}`);
  return num(data.stock_resultante);
}

/* =====================================================================
   transformations-log  ↔  galpon.transformacion (+ insumos)
   ===================================================================== */

export const transformaciones = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    const filas = await traerTodo(() =>
      sb.from("transformacion")
        .select("*, transformacion_insumo(*)")
        .order("fecha", { ascending: false })
    );
    return filas.map((t) => ({
      id: t.id,
      date: t.fecha,
      inputs: (t.transformacion_insumo || []).map((i) => ({
        productId: i.producto_id, name: i.nombre_producto,
        qty: num(i.cantidad), priceEach: num(i.valor_unitario),
      })),
      outputProductId: t.producto_salida_id,
      outputName: t.nombre_salida,
      qtyOutput: num(t.cantidad_salida),
      materialsCostPerUnit: num(t.costo_materiales_unitario),
      fixedCost: num(t.costo_fijo),
      totalCost: num(t.costo_total),
      costPerUnit: num(t.costo_unitario),
      recommendedPrice: num(t.precio_recomendado),
      appliedPrice: num(t.precio_aplicado),
      performedBy: nombreDePerfil(t.realizado_por),
    }));
  },

  async escribir(actual, anterior, opciones = {}) {
    const sb = obtenerCliente();
    const nuevas = soloNuevos(anterior, actual);
    const idUsuario = opciones.idUsuario || null;

    for (const t of nuevas) {
      const { error } = await sb.from("transformacion").insert({
        id: t.id,
        fecha: t.date,
        producto_salida_id: t.outputProductId,
        nombre_salida: t.outputName,
        cantidad_salida: num(t.qtyOutput),
        costo_materiales_unitario: num(t.materialsCostPerUnit),
        costo_fijo: num(t.fixedCost),
        costo_total: num(t.totalCost),
        costo_unitario: num(t.costPerUnit),
        precio_recomendado: num(t.recommendedPrice),
        precio_aplicado: num(t.appliedPrice),
        realizado_por: idDePerfil(t.performedBy) || idUsuario,
      });
      if (error) throw new Error(`Transformación: ${error.message}`);

      const insumos = (t.inputs || []).map((i) => ({
        transformacion_id: t.id,
        producto_id: i.productId,
        nombre_producto: i.name,
        cantidad: num(i.qty),
        valor_unitario: num(i.priceEach),
      }));
      if (insumos.length) {
        const { error: e } = await sb.from("transformacion_insumo").insert(insumos);
        if (e) throw new Error(`Insumos de la transformación: ${e.message}`);
      }
    }
  },
};

/* =====================================================================
   marcelita-feedback  ↔  galpon.feedback
   ===================================================================== */

export const comentarios = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    const filas = await traerTodo(() =>
      sb.from("feedback").select("*").order("fecha", { ascending: false })
    );
    return filas.map((f) => ({
      id: f.id,
      date: f.fecha,
      author: nombreDePerfil(f.autor_id),
      role: f.rol,
      type: DESDE_TIPO_FEEDBACK[f.tipo] || "Comentario",
      message: f.mensaje,
      status: f.estado,
      adminNote: f.nota_admin,
      resolvedBy: nombreDePerfil(f.resuelto_por),
      resolvedAt: f.resuelto_at,
    }));
  },

  async escribir(actual, anterior, opciones = {}) {
    const sb = obtenerCliente();
    const { nuevos, cambiados } = diferencias(anterior, actual);
    const idUsuario = opciones.idUsuario || null;

    for (const f of nuevos) {
      const { error } = await sb.from("feedback").insert({
        id: f.id,
        fecha: f.date,
        autor_id: idDePerfil(f.author) || idUsuario,
        rol: f.role === "admin" ? "admin" : "vendedor",
        tipo: traducir(A_TIPO_FEEDBACK, f.type, "comentario"),
        mensaje: f.message,
        estado: f.status || "pendiente",
      });
      if (error) throw new Error(`Comentario: ${error.message}`);
    }

    for (const { antes, ahora } of cambiados) {
      if (antes.status === ahora.status && antes.adminNote === ahora.adminNote) continue;
      const resuelto = ahora.status === "resuelto";
      const { error } = await sb.from("feedback").update({
        estado: ahora.status,
        nota_admin: ahora.adminNote || null,
        resuelto_por: resuelto ? (idDePerfil(ahora.resolvedBy) || idUsuario) : null,
        resuelto_at: resuelto ? (ahora.resolvedAt || new Date().toISOString()) : null,
      }).eq("id", ahora.id);
      if (error) throw new Error(`Comentario: ${error.message}`);
    }
  },
};

/* =====================================================================
   bread-holidays / bread-shortages  ↔  galpon.feriado / galpon.falta_pan

   Son tablas chicas con la fecha como clave: se reescriben completas.
   ===================================================================== */

export const feriados = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    const filas = await traerTodo(() => sb.from("feriado").select("*").order("fecha"));
    return filas.map((f) => ({
      date: f.fecha, label: f.etiqueta, irrenunciable: f.irrenunciable,
    }));
  },
  async escribir(actual, anterior) {
    const sb = obtenerCliente();
    const ahora = new Set((actual || []).map((h) => h.date));
    const quitados = (anterior || []).filter((h) => !ahora.has(h.date)).map((h) => h.date);
    if (quitados.length) {
      const { error } = await sb.from("feriado").delete().in("fecha", quitados);
      if (error) throw new Error(`Feriados: ${error.message}`);
    }
    if ((actual || []).length) {
      const { error } = await sb.from("feriado").upsert(
        actual.map((h) => ({
          fecha: h.date, etiqueta: h.label, irrenunciable: !!h.irrenunciable,
        })),
        { onConflict: "fecha" }
      );
      if (error) throw new Error(`Feriados: ${error.message}`);
    }
  },
};

export const faltasDePan = {
  async leer(opciones = {}) {
    const sb = obtenerCliente();
    const filas = await traerTodo(() => sb.from("falta_pan").select("*").order("fecha"));
    return filas.map((f) => ({ date: f.fecha, morning: f.manana, afternoon: f.tarde }));
  },
  async escribir(actual, anterior) {
    const sb = obtenerCliente();
    const ahora = new Set((actual || []).map((f) => f.date));
    const quitados = (anterior || []).filter((f) => !ahora.has(f.date)).map((f) => f.date);
    if (quitados.length) {
      const { error } = await sb.from("falta_pan").delete().in("fecha", quitados);
      if (error) throw new Error(`Días sin pan: ${error.message}`);
    }
    if ((actual || []).length) {
      const { error } = await sb.from("falta_pan").upsert(
        actual.map((f) => ({
          fecha: f.date, manana: !!f.morning, tarde: !!f.afternoon,
        })),
        { onConflict: "fecha" }
      );
      if (error) throw new Error(`Días sin pan: ${error.message}`);
    }
  },
};

/* =====================================================================
   Consumo interno  ↔  galpon.consumo_interno (+ detalle)   (migración 0020)

   No pasa por el puente cargarJSON/guardarJSON: no es una lista que una
   pantalla edite entera, sino un libro que solo crece y que dos pantallas
   distintas miran de maneras distintas —el mesón escribe, el panel de
   administración lee lo pendiente—. Meterlo en COLECCIONES obligaría a
   releer todo el historial en cada sincronización para nada.
   ===================================================================== */

/* El vendedor se identificó con su PIN y la pantalla trae su id; acá solo se
   traduce el carrito al formato que espera la función y se deja que la base
   haga el resto en una transacción. */
export async function registrarConsumoInterno({ perfilId, motivo, items }) {
  const sb = obtenerCliente();
  const { data, error } = await sb.rpc("registrar_consumo_interno", {
    p_perfil: perfilId,
    p_motivo: motivo || null,
    p_items: (items || []).map((i) => ({
      producto_id: i.productId,
      nombre: i.name,
      cantidad: num(i.qty),
      costo: num(i.cost),
      precio: num(i.price),
      tipo_unidad: i.unitType === "peso" ? "peso" : "unidad",
    })),
  });
  if (error) throw new Error(error.message);
  return data;
}

/* Lo que ve el panel de administración. Se traen los últimos meses —lo de
   antes ya se descontó y no aporta— con el detalle de cada uno, porque la
   revisión es justamente mirar qué se llevó cada persona. */
export async function leerConsumosInternos(opciones = {}) {
  const sb = obtenerCliente();
  const filas = await traerTodo(() =>
    sb.from("consumo_interno")
      .select("*, consumo_interno_detalle(*)")
      .gte("fecha", desdeCuando(opciones))
      .order("fecha", { ascending: false })
  );
  return filas.map((c) => ({
    id: c.id,
    date: c.fecha,
    personId: c.responsable_id,
    // El nombre del perfil manda sobre el texto guardado: los consumos que
    // vienen del sistema anterior lo tienen escrito a mano ("Marcela",
    // "FRAN") y, sin esto, la misma persona aparecería como dos filas
    // distintas en el panel según de qué época sea el consumo.
    person: (c.responsable_id && nombreDePerfil(c.responsable_id)) || c.responsable || "Sin identificar",
    reason: c.motivo || "",
    costTotal: num(c.costo_total),
    settledAt: c.descontado_at || null,
    settledBy: c.descontado_por ? nombreDePerfil(c.descontado_por) : null,
    items: (c.consumo_interno_detalle || []).map((d) => ({
      productId: d.producto_id,
      name: d.nombre_producto,
      qty: num(d.cantidad),
      cost: num(d.costo_unitario),
      price: num(d.precio_unitario),
      unitType: d.tipo_unidad === "peso" ? "peso" : "unidad",
    })),
  }));
}

/* Anota que ya se descontó del sueldo. Devuelve cuántos cambió de verdad: si
   otro administrador marcó los mismos hace un minuto, el número es menor y la
   pantalla puede decirlo en vez de mentir. */
export async function marcarConsumosDescontados(ids) {
  const lista = (ids || []).filter(Boolean);
  if (!lista.length) return 0;
  const sb = obtenerCliente();
  const { data, error } = await sb.rpc("marcar_consumos_descontados", { p_ids: lista });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}
