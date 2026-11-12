// RUTA: functions/handlers/inventarioFacturas.js
//
// DESCUENTO DEL INVENTARIO CON LAS FACTURAS DE ZOHO (sección 3 del cierre
// mensual). Corre con el cierre diario de las 23:55 y con el botón de Kroma →
// Inventario valorado → Facturas. Las reglas están en inventarioFacturasReglas.js.
//
// Estado por factura en `kroma_inv_facturas/{invoiceId}` (y `cn_{id}` por nota
// de crédito): qué se descontó, qué quedó pendiente y por qué. Así una factura
// nunca se procesa dos veces y lo pendiente se vuelve a intentar cada noche.
// Los asientos van a `kroma_inv_libro` con id `fac_{invoiceId}_{ronda}_{n}`.
//
// Nada se descuenta hasta que se active (`kroma_inv_config/lacteoca.facturas.activo`).
// La simulación muestra lo que haría sin escribir.

const admin = require("firebase-admin");
const zoho = require("./zohoApi");
const R = require("./inventarioFacturasReglas");

const COL_LIBRO = "kroma_inv_libro";
const COL_FACTURAS = "kroma_inv_facturas";
const DOC_CONFIG = "kroma_inv_config/lacteoca";
const DOC_LOCK = "kroma_inv_config/facturasLock";
const EMPRESA = "lacteoca";
const db = () => admin.firestore();
const P = () => require("./inventarioPerpetuo")._internos;
const r6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;
const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

const statusDe = (e) => e?.response?.status || null;
const sinPermiso = (e) => [401, 403].includes(statusDe(e)) || Number(e?.zohoCode) === 57 || Number(e?.response?.data?.code) === 57;
const motivoZoho = (e) => `${statusDe(e) ? `${statusDe(e)} ` : ""}${e?.response?.data?.message || e?.message || e}`.slice(0, 200);

async function contextoZoho() {
    const [credsSnap, cfgSnap] = await Promise.all([db().doc("zoho_secure/creds").get(), db().doc("settings/appConfig").get()]);
    const creds = credsSnap.data() || {};
    const organizationId = (cfgSnap.data() || {}).zohoOrgIdLacteoca;
    if (!creds.refreshToken || !organizationId) throw new Error("Zoho no está conectado (faltan credenciales o el ID de organización).");
    const accessToken = await zoho.getAccessToken(creds);
    return { accessToken, organizationId, dataCenter: creds.dataCenter };
}

async function tomarCandado(quien) {
    const ref = db().doc(DOC_LOCK);
    return db().runTransaction(async (tx) => {
        const s = await tx.get(ref);
        const hasta = s.exists ? Number(s.data().hasta) || 0 : 0;
        if (hasta > Date.now()) return false;
        tx.set(ref, { hasta: Date.now() + 10 * 60 * 1000, quien: quien || "proceso", at: admin.firestore.FieldValue.serverTimestamp() });
        return true;
    });
}
const soltarCandado = () => db().doc(DOC_LOCK).set({ hasta: 0 }, { merge: true }).catch(() => {});

/** Despachos a otra ciudad con su factura. Migra el número escrito en las notas. */
async function despachosConFactura({ simular }) {
    const snap = await db().collection("kroma_despachos").where("empresaId", "==", EMPRESA).get();
    const map = new Map(), migrados = [];
    const batch = db().batch();
    snap.forEach(d => {
        const x = d.data();
        if (x.destinoCaracas === true || x.active === false) return;
        let num = x.facturaNumero || null;
        if (!num) {
            num = R.numeroFacturaDeTexto(x.notas);
            if (num) {
                migrados.push({ despachoId: d.id, facturaNumero: num, notas: x.notas || "" });
                if (!simular) batch.update(d.ref, { facturaNumero: num, facturaNumeroOrigen: "notas" });
            }
        }
        if (num) map.set(num, d.id);
    });
    if (migrados.length && !simular) await batch.commit();
    return { map, migrados };
}

async function contexto({ simular }) {
    const [vp, desp, gkRep] = await Promise.all([
        db().collection("kroma_ventas_planta").where("empresaId", "==", EMPRESA).get(),
        despachosConFactura({ simular }),
        db().collection("facturas_vendedor").where("esReposicion", "==", true).get(),
    ]);
    const ventasPlanta = new Set();
    vp.forEach(d => { const n = d.data().facturaNumero; if (n) ventasPlanta.add(n); });
    const reposiciones = new Set();
    gkRep.forEach(d => reposiciones.add(d.data().numero || d.id));
    return { ventasPlanta, despachos: desp.map, migrados: desp.migrados, reposiciones };
}

async function leerLibroConId(hasta) {
    const snap = await db().collection(COL_LIBRO).where("fecha", "<=", hasta).get();
    return snap.docs.map(d => ({ ...d.data(), _id: d.id }));
}

const lineasMin = (det) => (det?.line_items || []).map(l => ({ item_id: l.item_id || null, name: l.name || "", quantity: Number(l.quantity) || 0 }));
const etiquetaCat = (catalogId) => catalogId === R.CAT_1KG ? "1 kg" : (catalogId === R.CAT_250 ? "250 g" : catalogId);
const textoFaltantes = (f) => Object.entries(f || {}).map(([c, q]) => `${r2(q)} ud de ${etiquetaCat(c)}`).join(", ");

/**
 * Procesa las facturas (y notas de crédito) de Zoho desde `facturas.desde`.
 *   simular=true: no escribe nada; devuelve lo que haría.
 * → { resumen, facturas: [...], notas: [...], migrados, asientos }
 */
async function procesarFacturas({ simular = false, quien = null, zohoCtx = null } = {}) {
    const cfgSnap = await db().doc(DOC_CONFIG).get();
    const cfg = cfgSnap.exists ? cfgSnap.data() : {};
    const fcfg = cfg.facturas || {};
    if (!cfg.abierto) return { inactivo: true, motivo: "El inventario perpetuo no está abierto." };
    if (!simular && !fcfg.activo) return { inactivo: true, motivo: "El descuento con facturas no está activado." };
    if (!simular && !(await tomarCandado(quien))) return { ocupado: true, motivo: "Ya hay un proceso de facturas en curso." };
    try {
        return await procesar({ simular, cfg, fcfg, zohoCtx });
    } finally {
        if (!simular) await soltarCandado();
    }
}

async function procesar({ simular, cfg, fcfg, zohoCtx }) {
    const hoy = P().fechaCaracas();
    const desde = fcfg.desde || R.DESDE_INICIAL;
    const inicio = cfg.inicio || desde;
    const mapeo = R.mapeoEfectivo(fcfg);
    const zctx = zohoCtx || await contextoZoho();
    const [ctx, libro, estadosSnap, lista, notasLeidas, devSnap] = await Promise.all([
        contexto({ simular }),
        leerLibroConId(hoy),
        db().collection(COL_FACTURAS).where("empresaId", "==", EMPRESA).get(),
        zoho.listInvoicesDesde({ ...zctx, dateStart: desde }).catch(e => { throw new Error(`Zoho al leer las facturas: ${motivoZoho(e)}`); }),
        // Sin permiso para las notas de crédito, las facturas se procesan igual
        // y se avisa: lo que dependa de una nota (devolución o reposición
        // cruzada) se ajusta en cuanto el permiso exista.
        zoho.listCreditNotesDesde({ ...zctx, dateStart: desde })
            .then(lista => ({ ok: true, lista }))
            .catch(e => {
                if (sinPermiso(e)) return { ok: false, lista: [], motivo: `Zoho no da permiso para leer las notas de crédito (${motivoZoho(e)}). Renueva el permiso con el scope ZohoBooks.creditnotes.READ.` };
                throw new Error(`Zoho al leer las notas de crédito: ${motivoZoho(e)}`);
            }),
        db().collection("devoluciones").where("fecha", ">=", desde).get(),
    ]);
    const notas = notasLeidas.lista;
    const notasEstado = { autorizado: notasLeidas.ok, motivo: notasLeidas.motivo || null, leidas: notas.length };
    const estados = new Map(estadosSnap.docs.map(d => [d.id, d.data()]));
    const porId = new Map(libro.map(a => [a._id, a]));
    const nuevosLibro = [];      // asientos de esta corrida (también entran al cálculo de lotes)
    const escrituras = [];       // { prefijo, asientos, estadoId, estado, alerta }
    const salida = [];
    const verLibro = () => [...libro, ...nuevosLibro];

    // ── Notas de crédito: detalle de las nuevas o cambiadas ──
    const notasDet = [];
    for (const cn of notas) {
        const st = estados.get(`cn_${cn.creditnote_id}`);
        const det = (st && st.lastModified === cn.last_modified_time && st.detalle) || null;
        const d = det || await zoho.getCreditNoteDetail({ ...zctx, creditnoteId: cn.creditnote_id })
            .then(x => ({ reference_number: x?.reference_number || "", notes: x?.notes || "", status: x?.status || cn.status,
                date: x?.date || cn.date, invoices: (x?.invoices || []).map(i => i.invoice_number).filter(Boolean),
                line_items: lineasMin(x) }));
        notasDet.push({ cn, det: d, st });
        if (R.esNotaReposicion(d) && !["void", "draft"].includes(String(d.status).toLowerCase())) {
            d.invoices.forEach(n => ctx.reposiciones.add(n));
        }
    }

    // ── Facturas, por fecha ──
    const ordenadas = [...lista].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.invoice_number).localeCompare(String(b.invoice_number)));
    for (const f of ordenadas) {
        const id = String(f.invoice_id);
        const st = estados.get(id) || null;
        const previos = (st?.asientoIds || []).map(x => porId.get(x)).filter(Boolean);
        const neto = previos.reduce((s, a) => s + Math.abs(a.cantidad || 0), 0) > 0
            && Object.values(R.sumaPorCatalogo(previos)).some(v => Math.abs(v) > 1e-9);
        const factura = { id, numero: f.invoice_number, cliente: f.customer_name || "", clienteId: f.customer_id || null };
        const c = R.clasificarFactura(f, ctx);
        const ronda = (st?.rondas || 0) + 1;
        const base = { empresaId: EMPRESA, zohoInvoiceId: id, numero: f.invoice_number, fecha: f.date, cliente: factura.cliente,
            total: Number(f.total) || 0, estadoZoho: f.status, lastModified: f.last_modified_time || null };
        let asientos = [], estado, motivo = c.motivo, faltantes = {}, sinMapear = [], lineas = st?.lineas || null, firma = st?.firma || null;
        let categoria = c.categoria || st?.categoria || null;

        if (c.accion !== "procesar") {
            estado = { ignorar: "ignorada", anular: "anulada", excluir: "excluida" }[c.accion];
            if (neto) {
                asientos = R.asientosReversa(previos, { fecha: hoy, tipo: c.accion === "anular" ? "factura_anulada" : "factura_excluida",
                    motivo: `${c.motivo}: se devuelve lo que había descontado la factura ${f.invoice_number}` });
            }
        } else {
            const cambio = !st || st.lastModified !== f.last_modified_time || !lineas;
            if (cambio) {
                const det = await zoho.getInvoiceDetail({ ...zctx, invoiceId: id });
                lineas = lineasMin(det);
                base.direccion = { envio: det?.shipping_address?.city || "", factura: det?.billing_address?.city || "" };
                base.caracas = R.esDeCaracas(det);
            } else {
                base.direccion = st.direccion || null; base.caracas = st.caracas ?? null;
            }
            const L = R.lineasDeFactura({ line_items: lineas }, mapeo);
            sinMapear = L.sinMapear;
            const nuevaFirma = R.firmaFactura({ categoria, porCatalogo: L.porCatalogo, sinMapear });
            if (base.caracas === false) {
                // Factura a otra ciudad sin despacho enlazado: no sale de Caracas.
                estado = "revisar";
                motivo = `Va a ${base.direccion?.envio || base.direccion?.factura || "otra ciudad"} y no tiene un despacho enlazado. Escribe el número de la factura en el despacho.`;
                if (neto) asientos = R.asientosReversa(previos, { fecha: hoy, tipo: "factura_excluida", motivo });
                faltantes = {};
            } else if (st && st.firma === nuevaFirma && neto) {
                // Ya descontada: solo se intenta lo pendiente.
                faltantes = { ...(st.faltantes || {}) };
                if (Object.keys(faltantes).length) {
                    const lotes = R.lotesDisponibles(verLibro(), hoy, hoy);
                    const plan = R.planDescuento(faltantes, lotes);
                    asientos = R.asientosDeAsignacion({ factura, categoria, asignado: plan.asignado, fecha: hoy,
                        motivo: `Factura ${f.invoice_number} del ${f.date} (pendiente, ya hay existencia)${factura.cliente ? ` · ${factura.cliente}` : ""}` });
                    faltantes = plan.faltantes;
                }
            } else {
                // Nueva, o cambió (líneas, artículos o categoría): se rehace.
                const fecha = st ? hoy : (f.date < inicio ? inicio : f.date);
                const rev = neto ? R.asientosReversa(previos, { fecha: hoy, tipo: "factura_cambiada",
                    motivo: `La factura ${f.invoice_number} cambió en Zoho: se rehace el descuento` }) : [];
                const lotes = R.lotesDisponibles([...verLibro(), ...rev], fecha, hoy);
                const plan = R.planDescuento(L.porCatalogo, lotes);
                asientos = [...rev, ...R.asientosDeAsignacion({ factura, categoria, asignado: plan.asignado, fecha })];
                faltantes = plan.faltantes;
            }
            firma = nuevaFirma;
            if (estado !== "revisar") {
                estado = Object.keys(faltantes).length ? "pendiente" : (sinMapear.length ? "sin_mapear" : "descontada");
                motivo = estado === "pendiente" ? `Falta existencia en la bodega Caracas: ${textoFaltantes(faltantes)}.`
                    : estado === "sin_mapear" ? `Artículos sin presentación en la tabla: ${sinMapear.map(s => `${s.nombre} (${s.cantidad})`).join(", ")}.`
                    : (categoria === "reposicion" ? "Reposición descontada" : "Descontada");
                if (estado === "pendiente" && sinMapear.length) motivo += ` Además, artículos sin presentación: ${sinMapear.map(s => s.nombre).join(", ")}.`;
            }
        }

        const prefijo = `fac_${id}_${ronda}`;
        const ids = asientos.map((_, i) => `${prefijo}_${i}`);
        asientos.forEach((a, i) => { nuevosLibro.push({ ...a, _id: ids[i] }); porId.set(ids[i], { ...a, _id: ids[i] }); });
        const asientoIds = [...(st?.asientoIds || []), ...ids];
        const nuevo = { ...base, categoria, estado, motivo, lineas, firma, faltantes, sinMapear,
            rondas: asientos.length ? ronda : (st?.rondas || 0), asientoIds };
        const conAlerta = ["pendiente", "sin_mapear", "revisar"].includes(estado);
        const hayCambio = asientos.length || !st || st.estado !== estado || st.motivo !== motivo || st.lastModified !== base.lastModified
            || JSON.stringify(st.faltantes || {}) !== JSON.stringify(faltantes);
        if (hayCambio) escrituras.push({ prefijo, asientos, estadoId: id, estado: nuevo, alerta: { id: `fac_${id}`, activa: conAlerta,
            mensaje: `Factura ${f.invoice_number} (${factura.cliente}, ${f.date}): ${motivo}` } });
        salida.push({ id, numero: f.invoice_number, fecha: f.date, cliente: factura.cliente, total: base.total, categoria, estado, motivo,
            faltantes, sinMapear, movimientos: asientos.map(a => ({ lote: a.lote, presentacion: a.presentacion, cantidad: a.cantidad,
                costoUnitario: a.costoUnitario, valorCosto: r2(a.valorCosto), fecha: a.fecha, tipo: a.tipo, categoria: a.categoria })) });
    }

    // ── Notas de crédito por devolución (no de reposición) ──
    const salidaNotas = [];
    for (const { cn, det, st } of notasDet) {
        const id = `cn_${cn.creditnote_id}`;
        const anulada = ["void", "draft"].includes(String(det.status).toLowerCase());
        const rep = R.esNotaReposicion(det);
        const previos = (st?.asientoIds || []).map(x => porId.get(x)).filter(Boolean);
        const neto = Object.values(R.sumaPorCatalogo(previos)).some(v => Math.abs(v) > 1e-9);
        let asientos = [], estado, motivo, sinPareja = {};
        if (rep) { estado = "reposicion"; motivo = `Nota de reposición: la factura ${det.invoices.join(", ") || "—"} sale como reposición, no como venta.`; }
        else if (anulada) {
            estado = "anulada"; motivo = "Nota de crédito anulada o en borrador";
            if (neto) asientos = R.asientosReversa(previos, { fecha: hoy, tipo: "nota_credito_anulada", motivo: `Nota ${cn.creditnote_number} anulada` });
        } else if (neto) { estado = st.estado; motivo = st.motivo; }
        else {
            const L = R.lineasDeFactura({ line_items: det.line_items }, mapeo);
            if (!Object.keys(L.porCatalogo).length) { estado = "sin_producto"; motivo = "No devuelve producto (ajuste de precio o monto)."; }
            else {
                const facIds = ordenadas.filter(f => det.invoices.includes(f.invoice_number)).map(f => String(f.invoice_id));
                const prevFac = facIds.flatMap(fid => {
                    const s = escrituras.find(e => e.estadoId === fid)?.estado || estados.get(fid);
                    return (s?.asientoIds || []).map(x => porId.get(x)).filter(a => a && a.cantidad < 0);
                });
                const dev = R.asignadoDeDevolucion(prevFac, L.porCatalogo);
                const catFac = prevFac[0]?.categoria || "venta";
                const fecha = (det.date || hoy) < inicio ? inicio : (det.date || hoy);
                asientos = R.asientosDeAsignacion({ factura: { id: cn.creditnote_id, numero: cn.creditnote_number, cliente: cn.customer_name },
                    categoria: catFac, asignado: dev.asignado, fecha, tipo: "nota_credito", signo: +1,
                    motivo: `Nota de crédito ${cn.creditnote_number} (devolución de ${det.invoices.join(", ")})` });
                asientos.forEach(a => { a.ref = { ...a.ref, notaCredito: cn.creditnote_number, facturas: det.invoices }; });
                sinPareja = dev.sinPareja;
                estado = Object.keys(sinPareja).length ? "revisar" : "devuelta";
                motivo = estado === "revisar" ? `La nota devuelve más de lo que descontó su factura (${textoFaltantes(sinPareja)}).` : "Devolución a la bodega Caracas";
            }
        }
        const ronda = (st?.rondas || 0) + 1;
        const prefijo = `fac_${id}_${ronda}`;
        const ids = asientos.map((_, i) => `${prefijo}_${i}`);
        asientos.forEach((a, i) => nuevosLibro.push({ ...a, _id: ids[i] }));
        const nuevo = { empresaId: EMPRESA, tipo: "nota_credito", numero: cn.creditnote_number, fecha: det.date, cliente: cn.customer_name || "",
            lastModified: cn.last_modified_time || null, detalle: det, estado, motivo, sinPareja,
            rondas: asientos.length ? ronda : (st?.rondas || 0), asientoIds: [...(st?.asientoIds || []), ...ids] };
        if (asientos.length || !st || st.estado !== estado || st.lastModified !== nuevo.lastModified) {
            escrituras.push({ prefijo, asientos, estadoId: id, estado: nuevo, alerta: { id: `fac_${id}`, activa: estado === "revisar",
                mensaje: `Nota de crédito ${cn.creditnote_number}: ${motivo}` } });
        }
        salidaNotas.push({ numero: cn.creditnote_number, fecha: det.date, cliente: cn.customer_name, estado, motivo,
            movimientos: asientos.map(a => ({ lote: a.lote, cantidad: a.cantidad, valorCosto: r2(a.valorCosto) })) });
    }

    // ── Reposiciones declaradas en GK (sección 4) ──
    const salidaDev = [];
    const devs = [...devSnap.docs].sort((a, b) => String(a.data().fecha).localeCompare(String(b.data().fecha)) || a.id.localeCompare(b.id));
    for (const ds of devs) {
        const d = ds.data();
        const id = `dev_${ds.id}`;
        const st = estados.get(id) || null;
        const r = R.reposicionDeDevolucion(d, desde);
        if (!r.aplica && !st) continue;
        const previos = (st?.asientoIds || []).map(x => porId.get(x)).filter(Boolean);
        const neto = Object.values(R.sumaPorCatalogo(previos)).some(v => Math.abs(v) > 1e-9);
        const numero = `Reposición ${d.posName || ds.id}`;
        const quien = { id: ds.id, numero, cliente: d.posName || "" };
        const ref = { devolucionId: ds.id, posId: d.posId || null, posName: d.posName || null, visitaReportId: d.visitaReportId || null };
        let asientos = [], estado, motivo = r.motivo, faltantes = {};
        if (!r.aplica) {
            estado = "no_aplica";
            if (neto) asientos = R.asientosReversa(previos, { fecha: hoy, tipo: "reposicion_anulada", motivo: `${r.motivo}: se devuelve lo que había salido por la reposición` });
        } else if (st && st.firma === r.firma && neto) {
            faltantes = { ...(st.faltantes || {}) };
            if (Object.keys(faltantes).length) {
                const plan = R.planDescuento(faltantes, R.lotesDisponibles(verLibro(), hoy, hoy));
                asientos = R.asientosDeAsignacion({ factura: quien, categoria: "reposicion", asignado: plan.asignado, fecha: hoy, tipo: "reposicion_gk",
                    motivo: `${r.motivo} del ${d.fecha} (pendiente, ya hay existencia)` });
                faltantes = plan.faltantes;
            }
        } else {
            const fecha = st ? hoy : (d.fecha < inicio ? inicio : d.fecha);
            const rev = neto ? R.asientosReversa(previos, { fecha: hoy, tipo: "reposicion_cambiada", motivo: `La reposición de ${d.posName || ""} cambió en GK: se rehace` }) : [];
            const plan = R.planDescuento({ [R.CAT_250]: r.unidades }, R.lotesDisponibles([...verLibro(), ...rev], fecha, hoy));
            asientos = [...rev, ...R.asientosDeAsignacion({ factura: quien, categoria: "reposicion", asignado: plan.asignado, fecha, tipo: "reposicion_gk", motivo: r.motivo })];
            faltantes = plan.faltantes;
        }
        asientos.forEach(a => { if (a.tipo === "reposicion_gk") a.ref = ref; });
        if (r.aplica) {
            estado = Object.keys(faltantes).length ? "pendiente" : "descontada";
            if (estado === "pendiente") motivo = `${r.motivo}: falta existencia en la bodega Caracas (${textoFaltantes(faltantes)}).`;
        }
        const ronda = (st?.rondas || 0) + 1;
        const prefijo = `fac_${id}_${ronda}`;
        const ids = asientos.map((_, i) => `${prefijo}_${i}`);
        asientos.forEach((a, i) => { nuevosLibro.push({ ...a, _id: ids[i] }); porId.set(ids[i], { ...a, _id: ids[i] }); });
        const nuevo = { empresaId: EMPRESA, tipo: "reposicion_gk", numero, fecha: d.fecha || null, cliente: d.posName || "", categoria: "reposicion",
            estado, motivo, firma: r.firma || null, faltantes, devolucionId: ds.id,
            rondas: asientos.length ? ronda : (st?.rondas || 0), asientoIds: [...(st?.asientoIds || []), ...ids] };
        if (asientos.length || !st || st.estado !== estado || st.motivo !== motivo || JSON.stringify(st.faltantes || {}) !== JSON.stringify(faltantes)) {
            escrituras.push({ prefijo, asientos, estadoId: id, estado: nuevo, alerta: { id: `fac_${id}`, activa: estado === "pendiente",
                mensaje: `${numero} (${d.fecha}): ${motivo}` } });
        }
        salidaDev.push({ id, numero, fecha: d.fecha, cliente: d.posName || "", categoria: "reposicion", estado, motivo, faltantes,
            movimientos: asientos.map(a => ({ lote: a.lote, presentacion: a.presentacion, cantidad: a.cantidad, costoUnitario: a.costoUnitario,
                valorCosto: r2(a.valorCosto), fecha: a.fecha, tipo: a.tipo, categoria: a.categoria })) });
    }

    // ── Escritura ──
    if (!simular) {
        const E = P();
        for (const e of escrituras) {
            if (e.asientos.length) await E.escribirAsientos(e.asientos, e.prefijo);
            await db().doc(`${COL_FACTURAS}/${e.estadoId}`).set({ ...e.estado, actualizadoAt: admin.firestore.FieldValue.serverTimestamp() });
            const aRef = db().doc(`kroma_alerts/${e.alerta.id}`);
            if (e.alerta.activa) {
                const s = await aRef.get();
                await aRef.set({ tipo: "factura_inventario", empresaId: EMPRESA, mensaje: e.alerta.mensaje, active: true,
                    facturaId: e.estadoId, ...(s.exists ? {} : { leidaPor: [], createdAt: admin.firestore.FieldValue.serverTimestamp() }),
                    actualizadoAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            } else {
                const s = await aRef.get();
                if (s.exists && s.data().active) await aRef.set({ active: false, resueltaAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            }
        }
        await db().doc(DOC_CONFIG).set({ facturas: { ultimaCorrida: new Date().toISOString(), notasEstado,
            ultimoResultado: resumir(salida, salidaNotas, ctx.migrados, salidaDev) } }, { merge: true });
    }

    const todos = escrituras.flatMap(e => e.asientos);
    return JSON.parse(JSON.stringify({
        simulacion: simular, desde, hoy, notasEstado,
        resumen: resumir(salida, salidaNotas, ctx.migrados, salidaDev),
        facturas: salida, notas: salidaNotas, reposiciones: salidaDev, migrados: ctx.migrados,
        asientos: todos.map(a => ({ fecha: a.fecha, categoria: a.categoria, tipo: a.tipo, lote: a.lote, presentacion: a.presentacion,
            cantidad: a.cantidad, valorCosto: r2(a.valorCosto), ref: a.ref })),
    }));
}

function resumir(facturas, notas, migrados, devs = []) {
    const cuenta = (e) => facturas.filter(f => f.estado === e).length;
    const mov = facturas.flatMap(f => f.movimientos);
    const suma = (cat) => r2(mov.filter(m => m.categoria === cat).reduce((s, m) => s + m.valorCosto, 0));
    const uds = (cat) => r6(mov.filter(m => m.categoria === cat).reduce((s, m) => s + m.cantidad, 0));
    return {
        facturas: facturas.length, descontadas: cuenta("descontada"), pendientes: cuenta("pendiente"), sinMapear: cuenta("sin_mapear"),
        revisar: cuenta("revisar"), excluidas: cuenta("excluida"), anuladas: cuenta("anulada"), ignoradas: cuenta("ignorada"),
        ventasUnidades: uds("venta"), ventasCosto: suma("venta"), reposicionUnidades: uds("reposicion"), reposicionCosto: suma("reposicion"),
        notasCredito: notas.length, despachosEnlazados: (migrados || []).length,
        reposicionesGK: devs.filter(d => d.estado === "descontada" || d.estado === "pendiente").length,
        reposicionesGKUnidades: r6(devs.flatMap(d => d.movimientos).filter(m => m.categoria === "reposicion").reduce((s, m) => s + m.cantidad, 0)),
        reposicionesGKCosto: r2(devs.flatMap(d => d.movimientos).filter(m => m.categoria === "reposicion").reduce((s, m) => s + m.valorCosto, 0)),
        reposicionesGKPendientes: devs.filter(d => d.estado === "pendiente").length,
    };
}

/** Facturas con algo pendiente hasta `fecha` (para el control del reporte diario). */
async function pendientesHasta(fecha) {
    const snap = await db().collection(COL_FACTURAS).where("empresaId", "==", EMPRESA)
        .where("estado", "in", ["pendiente", "sin_mapear", "revisar"]).get();
    return snap.docs.map(d => d.data()).filter(x => !x.fecha || x.fecha <= fecha)
        .map(x => ({ numero: x.numero, fecha: x.fecha, cliente: x.cliente, estado: x.estado, motivo: x.motivo,
            faltantes: x.faltantes || {}, sinMapear: x.sinMapear || [] }));
}

module.exports = { procesarFacturas, pendientesHasta, contextoZoho };
