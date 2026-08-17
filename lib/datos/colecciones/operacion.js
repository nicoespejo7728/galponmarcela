import { obtenerCliente } from "@/lib/supabase/cliente";
import {
  traerTodo, nombreDePerfil, idDePerfil, nombreDeCategoria, nombreDeProveedor,
} from "@/lib/datos/catalogos";
import {
  num, traducir, distintos,
  A_METODO_PAGO, DESDE_METODO_PAGO,
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
      customer: null,
      total: num(v.total),
      paymentMethod: DESDE_METODO_PAGO[v.metodo_pago] || "Efectivo",
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
      const vendedorId = idDePerfil(v.seller) || idUsuario;
      const { data: creada, error } = await sb.from("venta").insert({
        id: v.id,
        fecha: v.date,
        vendedor_id: vendedorId,
        turno_id: turnoId,
        metodo_pago: traducir(A_METODO_PAGO, v.paymentMethod, "efectivo"),
        total: num(v.total),
      }).select("id,numero_boleta").single();
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

      if ((categoria === "sueldo" || categoria === "sueldo_historico") && m.workerId) {
        const { error: e } = await sb.from("movimiento_sueldo").insert({
          movimiento_id: m.id,
          trabajador_id: m.workerId,
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

function aTurnoLegible(t, movs) {
  const mios = movs.filter((m) => m.turno_id === t.id);
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
      sb.from("turno").select("*").eq("estado", "abierto").order("abierto_at")
    );
    if (filas.length === 0) return [];
    const movs = await traerTodo(() =>
      sb.from("turno_movimiento").select("*")
        .in("turno_id", filas.map((f) => f.id)).order("fecha")
    );
    return filas.map((t) => aTurnoLegible(t, movs));
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
      sb.from("turno").select("*").eq("estado", "cerrado")
        .gte("abierto_at", desdeCuando(opciones))
        .order("cerrado_at", { ascending: false })
    );
    if (filas.length === 0) return [];
    const movs = await traerTodo(() =>
      sb.from("turno_movimiento").select("*")
        .in("turno_id", filas.map((f) => f.id)).order("fecha")
    );
    return filas.map((t) => {
      const base = aTurnoLegible(t, movs);
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
      const { error } = await sb.from("turno").update({
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
      }).eq("id", c.id);
      if (error) throw new Error(`Cierre de caja: ${error.message}`);
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
    }));
  },

  async escribir(actual, anterior, opciones = {}) {
    const sb = obtenerCliente();
    const nuevas = soloNuevos(anterior, actual);
    const idUsuario = opciones.idUsuario || null;

    for (const f of nuevas) {
      const sinDoc = !!f.noDocument;
      const { error } = await sb.from("factura_compra").insert({
        id: f.id,
        fecha: f.date,
        proveedor_id: f.supplierId || null,
        nombre_proveedor: f.supplierName || "Sin proveedor",
        // La base exige coherencia: con documento va el número, sin documento
        // va el motivo. Se completa lo que falte para no perder la recepción.
        numero_documento: sinDoc ? null : (f.refNumber || "S/N"),
        motivo_sin_documento: sinDoc ? (f.reason || "Sin motivo indicado") : null,
        sin_documento: sinDoc,
        total_neto: num(f.totalNet),
        registrado_por: idDePerfil(f.registeredBy) || idUsuario,
      });
      if (error) throw new Error(`Documento de compra: ${error.message}`);
    }
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
    const filas = await traerTodo(() =>
      sb.from("conteo")
        .select("*, conteo_detalle(*), conteo_excepcion(*)")
        .order("fecha_limite", { ascending: false })
    );
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
        asignado_a: c.assignedToId,
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

      // Solicitud de excepción nueva
      if (!antes.exception && ahora.exception) {
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
