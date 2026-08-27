import { obtenerCliente } from "@/lib/supabase/cliente";
import {
  traerTodo, nombreDePerfil, idDePerfil, nombreDeCategoria, nombreDeProveedor,
  nombreDeCliente, perfilVaALaCasa,
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
import { valorDelConsumo } from "@/lib/consumo";

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
      // "combinado" (migración 0032): el cliente pagó parte con un medio y
      // el resto con otro. El desglose real vive en paymentBreakdown; este
      // campo queda como la etiqueta genérica que usan las pantallas que
      // todavía no distinguen el detalle (listas, boletas antiguas, etc.).
      paymentMethod: v.metodo_pago === "combinado" ? "Pago combinado" : (DESDE_METODO_PAGO[v.metodo_pago] || "Efectivo"),
      paymentBreakdown: Array.isArray(v.desglose_pago)
        ? v.desglose_pago.map((d) => ({ method: DESDE_METODO_PAGO[d.metodo] || d.metodo, amount: num(d.monto) }))
        : [],
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
        // Pesos descontados en esta línea por una oferta de cantidad (ver
        // migración 0029). Lo cobrado de verdad es price*qty - discount.
        discount: num(d.descuento_cantidad),
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
      // Pago combinado (migración 0032): en vez de traducir paymentMethod
      // tal cual (que acá vendría como "Pago combinado", no un medio real),
      // se guarda "combinado" y el detalle de cuánto fue con cada uno.
      const combinado = Array.isArray(v.paymentBreakdown) && v.paymentBreakdown.length > 0;
      const filaVenta = {
        id: v.id,
        fecha: v.date,
        vendedor_id: vendedorId,
        turno_id: turnoId,
        metodo_pago: combinado ? "combinado" : traducir(A_METODO_PAGO, v.paymentMethod, "efectivo"),
        total: num(v.total),
      };
      if (combinado) {
        filaVenta.desglose_pago = v.paymentBreakdown.map((d) => ({
          metodo: traducir(A_METODO_PAGO, d.method, "efectivo"), monto: num(d.amount),
        }));
      }
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
        // Pesos descontados en la línea por una oferta de cantidad (ver
        // tramosAplicables en sistema-ventas.jsx). 0 si no aplicó ninguna.
        descuento_cantidad: num(it.discount),
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
      // Con qué se pagó este egreso (migración 0032). Nulo/undefined en los
      // movimientos automáticos e históricos donde nunca se registró.
      if (m.metodo_pago) {
        base.paymentMethod = m.metodo_pago === "combinado" ? "Pago combinado" : (DESDE_METODO_PAGO_PROVEEDOR[m.metodo_pago] || null);
      }
      if (Array.isArray(m.desglose_pago)) {
        base.paymentBreakdown = m.desglose_pago.map((d) => ({
          method: DESDE_METODO_PAGO_PROVEEDOR[d.metodo] || d.metodo, amount: num(d.monto),
        }));
      }

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
    // Antes esto solo miraba "soloNuevos": los pagos se insertaban bien, pero
    // editar o borrar uno desde Egresos no llegaba nunca a la base — el
    // cambio se veía en pantalla porque el estado local sí cambiaba, y
    // desaparecía apenas otro dispositivo (o la sincronización cada 15s)
    // releía el movimiento tal como seguía en Supabase. Ahora también se
    // detectan los editados y los borrados.
    const { nuevos, cambiados, eliminados } = diferencias(anterior, actual);
    if (nuevos.length === 0 && cambiados.length === 0 && eliminados.length === 0) return;
    const idUsuario = opciones.idUsuario || null;

    for (const m of nuevos) {
      const categoria = traducir(A_CATEGORIA_MOVIMIENTO, m.category, "general");
      const filaMovimiento = {
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
      };
      // Con qué se pagó (migración 0032) — se manda solo cuando viene
      // informado, así los movimientos automáticos (mermas, sueldos,
      // ajustes) siguen insertándose igual que siempre, sin este dato.
      const combinadoM = Array.isArray(m.paymentBreakdown) && m.paymentBreakdown.length > 0;
      if (combinadoM) {
        filaMovimiento.metodo_pago = "combinado";
        filaMovimiento.desglose_pago = m.paymentBreakdown.map((d) => ({
          metodo: traducir(A_METODO_PAGO_PROVEEDOR, d.method, "efectivo"),
          monto: num(d.amount),
        }));
      } else if (m.paymentMethod) {
        filaMovimiento.metodo_pago = traducir(A_METODO_PAGO_PROVEEDOR, m.paymentMethod, "efectivo");
      }
      const { error } = await sb.from("movimiento").insert(filaMovimiento);
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

    // --- Movimientos editados ---
    // Desde Egresos solo se corrigen concepto, monto, categoría y forma de
    // pago (ver ExpensesView/MovementModal) — nunca la fecha, el tipo, ni el
    // vínculo a proveedor/factura/venta, así que esos campos ni se tocan acá.
    const CAMPOS_MOVIMIENTO_EDITABLES = ["concept", "amount", "category", "paymentMethod"];
    for (const { antes, ahora } of cambiados) {
      const cambioDesglose = JSON.stringify(antes.paymentBreakdown || null) !== JSON.stringify(ahora.paymentBreakdown || null);
      if (!distintos(antes, ahora, CAMPOS_MOVIMIENTO_EDITABLES) && !cambioDesglose) continue;

      const categoria = traducir(A_CATEGORIA_MOVIMIENTO, ahora.category, "general");
      const fila = {
        concepto: ahora.concept || "",
        monto: Math.abs(num(ahora.amount)),
        categoria,
      };
      const combinadoM = Array.isArray(ahora.paymentBreakdown) && ahora.paymentBreakdown.length > 0;
      if (combinadoM) {
        fila.metodo_pago = "combinado";
        fila.desglose_pago = ahora.paymentBreakdown.map((d) => ({
          metodo: traducir(A_METODO_PAGO_PROVEEDOR, d.method, "efectivo"),
          monto: num(d.amount),
        }));
      } else if (ahora.paymentMethod) {
        fila.metodo_pago = traducir(A_METODO_PAGO_PROVEEDOR, ahora.paymentMethod, "efectivo");
        fila.desglose_pago = null;
      } else {
        fila.metodo_pago = null;
        fila.desglose_pago = null;
      }
      const { error } = await sb.from("movimiento").update(fila).eq("id", ahora.id);
      if (error) throw new Error(`No se pudo corregir el movimiento: ${error.message}`);
    }

    // --- Movimientos borrados ---
    // Se borra de verdad, no se marca inactivo: a diferencia de un producto,
    // un pago mal ingresado no tiene por qué dejar rastro en el libro de
    // caja. Esto NO deshace la recepción, el abono o la merma que lo haya
    // originado — solo saca el asiento de Egresos (ver el comentario en
    // ExpensesView.deleteMovement, en la pantalla). El detalle asociado
    // (movimiento_merma/ajuste/sueldo/documento) tiene "on delete cascade"
    // en la base, así que basta con borrar el movimiento en sí.
    for (const m of eliminados) {
      const { error } = await sb.from("movimiento").delete().eq("id", m.id);
      if (error) throw new Error(`No se pudo eliminar el movimiento: ${error.message}`);
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
      paymentMethod: f.metodo_pago === "combinado" ? "Pago combinado" : (f.metodo_pago ? (DESDE_METODO_PAGO_PROVEEDOR[f.metodo_pago] || null) : null),
      // Detalle del pago combinado (migración 0032) — solo viene informado
      // cuando metodo_pago = 'combinado'; en cualquier otro caso es null/undefined.
      paymentBreakdown: Array.isArray(f.desglose_pago)
        ? f.desglose_pago.map((d) => ({ method: DESDE_METODO_PAGO_PROVEEDOR[d.metodo] || d.metodo, amount: num(d.monto) }))
        : [],
      // Los tres de la migración 0026 (Recepción simplificada): si esa
      // migración todavía no se aplicó, las columnas no vienen y quedan
      // undefined — la pantalla las trata como "sin dato", igual que arriba.
      documentType: f.tipo_documento || null,
      statedTotal: f.monto_informado == null ? null : num(f.monto_informado),
      duePaymentDate: f.fecha_pago_prevista || null,
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
      const combinado = Array.isArray(f.paymentBreakdown) && f.paymentBreakdown.length > 0;
      if (combinado) {
        fila.metodo_pago = "combinado";
        fila.desglose_pago = f.paymentBreakdown.map((d) => ({
          metodo: traducir(A_METODO_PAGO_PROVEEDOR, d.method, "efectivo"),
          monto: num(d.amount),
        }));
      } else if (f.paymentMethod) {
        fila.metodo_pago = traducir(A_METODO_PAGO_PROVEEDOR, f.paymentMethod, "efectivo");
      }
      // Los tres de la migración 0026: mismo criterio, solo se mandan si
      // vienen informados, para que una base sin esa migración no rechace
      // el insert entero por una columna que todavía no existe.
      if (f.documentType) fila.tipo_documento = f.documentType;
      if (f.statedTotal != null && f.statedTotal !== "") fila.monto_informado = num(f.statedTotal);
      if (f.duePaymentDate) fila.fecha_pago_prevista = f.duePaymentDate;
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
    // Igual que en movimientos: antes solo se insertaba lo nuevo, así que
    // corregir o borrar un cargo/abono desde Proveedores nunca llegaba a la
    // base — se veía arreglado en pantalla y volvía tal cual apenas se
    // releía desde Supabase. Ahora también se detectan editados y borrados.
    const { nuevos, cambiados, eliminados } = diferencias(anterior, actual);
    if (nuevos.length === 0 && cambiados.length === 0 && eliminados.length === 0) return;
    const idUsuario = opciones.idUsuario || null;

    if (nuevos.length > 0) {
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
    }

    // --- Cargos/abonos editados ---
    // Desde Proveedores se corrige el monto, la fecha, la nota y —si es un
    // abono— la forma de pago (ver EditableLedgerRow); nunca a qué proveedor
    // ni a qué factura pertenece.
    const CAMPOS_LEDGER_EDITABLES = ["amount", "date", "note", "paymentMethod"];
    for (const { antes, ahora } of cambiados) {
      if (!distintos(antes, ahora, CAMPOS_LEDGER_EDITABLES)) continue;
      const { error } = await sb.from("proveedor_movimiento").update({
        monto: num(ahora.amount),
        fecha: ahora.date,
        nota: ahora.note || null,
        metodo_pago: ahora.paymentMethod ? traducir(A_METODO_PAGO_PROVEEDOR, ahora.paymentMethod, null) : null,
      }).eq("id", ahora.id);
      if (error) throw new Error(`No se pudo corregir el movimiento de proveedor: ${error.message}`);
    }

    // --- Cargos/abonos borrados ---
    // Borrado real: es un asiento contable mal ingresado, no algo que deba
    // dejar rastro como un producto retirado. No toca ni el stock ni la
    // recepción/abono que lo haya originado (eso lo maneja quien llama).
    for (const m of eliminados) {
      const { error } = await sb.from("proveedor_movimiento").delete().eq("id", m.id);
      if (error) throw new Error(`No se pudo eliminar el movimiento de proveedor: ${error.message}`);
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
export async function registrarConsumoInterno({ id, perfilId, motivo, items }) {
  const sb = obtenerCliente();
  const { data, error } = await sb.rpc("registrar_consumo_interno", {
    p_id: id || null,
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
  return filas.map((c) => {
    /* El consumo de los dueños se junta bajo "CASA" (migración 0024). Se
       agrupa acá y no en la base a propósito: el consumo sigue guardado a
       nombre de quien puso el PIN —eso es un hecho, y el kárdex lo
       referencia— y lo que cambia es solo cómo se lee en el panel. Si mañana
       alguien deja de ser de la casa, se destilda en Usuarios y sus consumos
       nuevos vuelven a su cuenta, sin tocar el historial. */
    // También los del sistema anterior que quedaron anotados a mano como
    // "CASA": no tienen perfil que marcar, pero son exactamente lo mismo.
    const aLaCasa = perfilVaALaCasa(c.responsable_id)
      || String(c.responsable || "").trim().toUpperCase() === "CASA";
    // El nombre del perfil manda sobre el texto guardado: los consumos que
    // vienen del sistema anterior lo tienen escrito a mano ("Marcela",
    // "FRAN") y, sin esto, la misma persona aparecería como dos filas
    // distintas en el panel según de qué época sea el consumo.
    const suyo = (c.responsable_id && nombreDePerfil(c.responsable_id)) || c.responsable || "Sin identificar";
    const items = (c.consumo_interno_detalle || []).map((d) => ({
      productId: d.producto_id,
      name: d.nombre_producto,
      qty: num(d.cantidad),
      cost: num(d.costo_unitario),
      price: num(d.precio_unitario),
      unitType: d.tipo_unidad === "peso" ? "peso" : "unidad",
    }));
    return {
      id: c.id,
      date: c.fecha,
      personId: aLaCasa ? "CASA" : c.responsable_id,
      person: aLaCasa ? "CASA" : suyo,
      esCasa: aLaCasa,
      // Quién lo registró de verdad. El detalle lo muestra: la casa junta los
      // totales, pero no borra quién se llevó qué.
      registeredBy: suyo,
      reason: c.motivo || "",
      costTotal: num(c.costo_total),
      settledAt: c.descontado_at || null,
      settledBy: c.descontado_por ? nombreDePerfil(c.descontado_por) : null,
      items,
      /* Lo que se le carga a la persona. La base guarda el costo —eso es un
         hecho de la mercadería y no cambia—, pero lo que un vendedor debe es
         el precio de venta: se llevó lo mismo que se habría llevado un
         cliente. La cuenta se hace acá, al leer, y no se guarda un total
         aparte: así el día que cambie un precio, lo ya consumido sigue
         valorizado con el precio que tenía ese día, que es el que quedó
         escrito en su línea de detalle. */
      ...valorDelConsumo(items, { esCasa: aLaCasa, costoGuardado: num(c.costo_total) }),
    };
  });
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

/* =====================================================================
   Subir una venta completa, de una vez

   El camino normal de una venta pasa por cuatro guardados que comparan
   contra la copia local: catálogo, boleta, caja y —si fue fiada— el libro
   del cliente. Eso funciona mientras haya internet, porque la copia local
   está fresca.

   Sin internet no sirve: la venta se guarda en la cola y se sube más tarde,
   cuando la copia contra la que se armaron esas comparaciones ya quedó vieja.
   Por eso una venta encolada se sube con esta función, que no compara contra
   nada: escribe exactamente lo que hay que escribir, tal como quedó al
   momento del cobro.

   Es reintentable a propósito. Si la conexión se cortó justo después de
   insertar la boleta, el reintento choca con la llave repetida —el id de la
   venta lo puso el navegador— y eso se lee como "ya estaba", no como error.
   ===================================================================== */

function yaExistia(error) {
  // 23505 es la violación de llave única de Postgres.
  return error && (error.code === "23505" || /duplicate key|ya existe/i.test(error.message || ""));
}

export async function subirVentaCompleta({ venta, idUsuario }) {
  const sb = obtenerCliente();
  const v = venta;

  // El turno abierto de quien vendió, igual que en el camino normal.
  let turnoId = null;
  const vendedorId = v.sellerId || idDePerfil(v.seller) || idUsuario;
  if (vendedorId) {
    const { data } = await sb.from("turno")
      .select("id").eq("perfil_id", vendedorId).eq("estado", "abierto").maybeSingle();
    turnoId = data?.id || null;
  }

  // Pago combinado (migración 0032): ver mismo criterio en ventas.escribir().
  const combinadoV = Array.isArray(v.paymentBreakdown) && v.paymentBreakdown.length > 0;
  const filaVenta = {
    id: v.id,
    fecha: v.date,
    vendedor_id: vendedorId,
    turno_id: turnoId,
    metodo_pago: combinadoV ? "combinado" : traducir(A_METODO_PAGO, v.paymentMethod, "efectivo"),
    total: num(v.total),
  };
  if (combinadoV) {
    filaVenta.desglose_pago = v.paymentBreakdown.map((d) => ({
      metodo: traducir(A_METODO_PAGO, d.method, "efectivo"), monto: num(d.amount),
    }));
  }
  if (v.customerId) filaVenta.cliente_id = v.customerId;
  if (typeof v.boletaEmitida === "boolean") filaVenta.boleta_emitida = v.boletaEmitida;

  let numeroReal = v.invoiceNumber;

  // Antes de insertar se revisa si esta venta YA está guardada. Reintentar
  // una venta que ya subió es normal y esperado —por ejemplo, si la
  // confirmación no llegó a tiempo (ver PLAZO_VENTA, en index.js) la venta
  // quedó igual encolada y se reintenta después— pero insertar de nuevo,
  // aunque termine chocando con la llave repetida, ya le pidió un número
  // nuevo a la secuencia de boletas. Ese número no se puede devolver: las
  // secuencias de Postgres no se revierten aunque el insert falle —están
  // hechas así para que dos cajas vendiendo a la vez no se bloqueen
  // esperándose—, así que cada reintento quemaba un número de boleta que
  // nunca llegaba a usarse. Revisando antes de insertar, un reintento que
  // encuentra la venta ya guardada no gasta ningún número de más.
  const { data: existente } = await sb.from("venta")
    .select("id,numero_boleta").eq("id", v.id).maybeSingle();

  let error = null;
  if (existente) {
    numeroReal = existente.numero_boleta;
  } else {
    const { data: creada, error: errorInsert } = await sb.from("venta")
      .insert(filaVenta).select("id,numero_boleta").single();
    // Por si dos intentos se cruzan justo en el mismo instante —dos
    // pestañas, o un reintento que llega a la vez que este mismo llamado—:
    // la revisión de arriba no alcanzó a verla, pero la llave repetida sí.
    if (errorInsert && !yaExistia(errorInsert)) throw new Error(`Boleta: ${errorInsert.message}`);
    if (creada?.numero_boleta) numeroReal = creada.numero_boleta;
    error = errorInsert;
  }

  // El detalle y el kárdex solo se escriben si la boleta se creó recién (acá
  // arriba o en el insert de recién). Si ya existía, esta venta se subió
  // antes y repetir el kárdex descontaría el stock dos veces — que es
  // exactamente lo que dejó doce productos con el stock al doble durante la
  // unificación.
  if (!existente && !error) {
    const lineas = (v.items || []).map((it) => ({
      venta_id: v.id,
      producto_id: it.productId || null,
      nombre_producto: it.name,
      codigo_barras: it.barcode || null,
      cantidad: num(it.qty),
      precio_unitario: num(it.price),
      costo_unitario: num(it.cost),
      tipo_unidad: it.unitType === "peso" ? "peso" : "unidad",
      descuento_cantidad: num(it.discount),
    }));
    if (lineas.length) {
      const { error: e2 } = await sb.from("venta_detalle").insert(lineas);
      if (e2 && !yaExistia(e2)) throw new Error(`Detalle de la boleta: ${e2.message}`);
    }

    /* El stock baja por el kárdex y no escribiendo producto.stock: el disparador
       de la base hace `stock = stock + cantidad`, así que es una resta y no un
       valor absoluto. Eso es lo que hace que dos cajas puedan vender sin
       conexión y, al subir las dos, el stock quede bien sin importar el orden
       en que lleguen ni lo que cada una creía tener. */
    const movimientos = (v.items || [])
      .filter((it) => it.productId && num(it.qty) > 0)
      .map((it) => ({
        producto_id: it.productId,
        origen: "venta",
        cantidad: -num(it.qty),
        costo_unitario: it.cost == null ? null : num(it.cost),
        referencia_id: v.id,
        registrado_por: vendedorId,
      }));
    if (movimientos.length) {
      const { error: e3 } = await sb.from("kardex").insert(movimientos);
      if (e3 && !yaExistia(e3)) throw new Error(`Movimiento de stock: ${e3.message}`);
    }
  }

  /* El asiento de caja y el cargo del fiado van con su propio id, puesto
     también en el navegador, así que se reintentan igual de bien. Una venta
     fiada no entra a caja: queda como deuda del cliente. */
  if (v.paymentMethod === "Fiado" && v.customerId) {
    const cargo = {
      cliente_id: v.customerId,
      tipo: "cargo",
      monto: num(v.total),
      fecha: v.date,
      venta_id: v.id,
      metodo_pago: null,
      registrado_por: vendedorId,
    };
    if (v.ledgerId) cargo.id = v.ledgerId;
    const { error: e4 } = await sb.from("cliente_movimiento").insert(cargo);
    if (e4 && !yaExistia(e4)) throw new Error(`Fiado: ${e4.message}`);
  } else if (v.movementId) {
    const { error: e5 } = await sb.from("movimiento").insert({
      id: v.movementId,
      fecha: v.date,
      tipo: "ingreso",
      concepto: `Venta #${numeroReal}`,
      monto: num(v.total),
      categoria: traducir(A_CATEGORIA_MOVIMIENTO, "Venta", "general"),
      automatico: true,
      historico: false,
      venta_id: v.id,
      registrado_por: vendedorId,
    });
    if (e5 && !yaExistia(e5)) throw new Error(`Asiento de caja: ${e5.message}`);
  }

  return { numeroBoleta: numeroReal, yaEstaba: !!existente || !!error };
}

/* Un asiento de caja suelto —un egreso, un ingreso a mano— escrito directo y
   con su id puesto por el navegador, para poder reintentarlo sin duplicar.
   Es lo que permite anotarlo sin conexión y subirlo después. */
export async function subirMovimientoSuelto({ movimiento, idUsuario }) {
  const sb = obtenerCliente();
  const m = movimiento;
  const { error } = await sb.from("movimiento").insert({
    id: m.id,
    fecha: m.date,
    tipo: m.type === "egreso" ? "egreso" : "ingreso",
    categoria: traducir(A_CATEGORIA_MOVIMIENTO, m.category, "general"),
    concepto: m.concept || "",
    monto: Math.abs(num(m.amount)),
    automatico: m.auto === true,
    historico: !!m.historical,
    registrado_por: m.registeredById || idUsuario,
    proveedor_id: m.supplierId || null,
    venta_id: m.saleId || null,
  });
  if (error && !yaExistia(error)) throw new Error(`Movimiento de caja: ${error.message}`);
  return { yaEstaba: !!error };
}
