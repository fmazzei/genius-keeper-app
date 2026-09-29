// RUTA: functions/handlers/ventasPlanta.js
//
// VENTAS QUE SALEN DE LA CAVA DE PLANTA (Barinas) ↔ facturación en Zoho (2026-09).
//
// Quien entrega en la cava registra la venta en Kroma (`kroma_ventas_planta`,
// estadoFactura 'por_facturar'). Después administración hace UNA de dos cosas:
//   · FACTURAR desde la venta — se crea la factura en Zoho con las líneas y los
//     precios que pone administración (el operario nunca ve precios), o
//   · VINCULAR una factura que ya se hizo en Zoho — se elige entre las facturas
//     de ese cliente que GK ya bajó en la conciliación.
// En los dos casos queda el número de factura en la venta y se compara lo
// entregado contra lo facturado (en unidades de venta de GK).
//
// Decisión del dueño: los clientes que compran en planta cuentan como OFICINA
// (sin comisión para los vendedores de Caracas). Si el cliente no tiene dueño
// se marca `esOficina` al facturar o vincular; si ya es de un vendedor NO se
// toca y se avisa, porque cambiarlo movería comisiones.
//
// REPOSICIONES (mismo registro, `tipo:'reposicion'`): esquema de la
// administradora — en Zoho, NOTA DE CRÉDITO por lo devuelto + FACTURA por lo
// repuesto, cruzadas (saldo del cliente intacto). Aquí se vinculan las dos y la
// factura se marca `esReposicion`: sale de ventas, meta y comisión en GK (se
// revierten sus unidades/comisión si ya se habían contado) y la conciliación no
// la vuelve a contar (`upsertFacturaFromZoho` respeta la marca).
//
// Todo pasa por esta función (Admin SDK) para no abrirle al teléfono de la
// planta `clientes_zoho`, `zoho_items` ni `facturas_vendedor`, que son datos
// comerciales. Solo aplica a Lacteoca: Zoho es de Lacteoca.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { getAccessToken, createInvoice } = require('./zohoApi');
const { upsertFacturaFromZoho, GRAMOS_POR_UNIDAD_DEFAULT } = require('./facturaSync');
const { revertirAcumulados } = require('./facturaCommissionOps');

const ROLES = ['produccion', 'kroma_admin', 'kroma_gerencial', 'kroma_operario', 'kroma_owner',
    'master', 'administrador', 'gerencia', 'sales_manager'];

const toMs = (v) => v?.toMillis ? v.toMillis() : (v ? new Date(v).getTime() : 0);
const iso = (d) => d.toISOString().slice(0, 10);
const cuenta = (f) => f.estado !== 'anulada' && f.estado !== 'borrador' && !f.ausenteEnZoho && !f.borradorEnZoho;

async function contexto(uid) {
    const db = admin.firestore();
    const [meta, cfg] = await Promise.all([
        db.doc(`users_metadata/${uid}`).get(),
        db.doc('settings/appConfig').get(),
    ]);
    const m = meta.exists ? meta.data() : {};
    if (!ROLES.includes(m.role)) throw new HttpsError("permission-denied", "Tu cuenta no puede gestionar ventas de planta.");
    if ((m.empresaId || 'lacteoca') !== 'lacteoca') {
        throw new HttpsError("failed-precondition", "La facturación con Zoho solo está conectada para Lacteoca.");
    }
    const appConfig = cfg.data() || {};
    const gramosPorUnidad = Number(appConfig.ourProductWeight_g) > 0 ? Number(appConfig.ourProductWeight_g) : GRAMOS_POR_UNIDAD_DEFAULT;
    return { db, appConfig, gramosPorUnidad };
}

async function leerVenta(db, ventaId) {
    if (!ventaId) throw new HttpsError("invalid-argument", "Falta la venta.");
    const snap = await db.doc(`kroma_ventas_planta/${ventaId}`).get();
    if (!snap.exists) throw new HttpsError("not-found", "Esa venta no existe.");
    const v = snap.data();
    if ((v.empresaId || 'lacteoca') !== 'lacteoca') throw new HttpsError("permission-denied", "Venta de otra empresa.");
    return { ref: snap.ref, venta: v };
}

/** El cliente de planta cuenta como Oficina — salvo que ya sea de un vendedor. */
async function asegurarOficina(db, customerId) {
    const ref = db.doc(`clientes_zoho/${customerId}`);
    const snap = await ref.get();
    if (!snap.exists) return { aviso: null };
    const c = snap.data();
    if (c.vendedorId) {
        const v = await db.doc(`users_metadata/${c.vendedorId}`).get();
        const nombre = v.exists ? (v.data().name || v.data().email || 'un vendedor') : 'un vendedor';
        return { aviso: `Este cliente está asignado a ${nombre}: su factura suma a la cartera y comisión de ese vendedor. Si es un cliente de planta, cámbialo a Oficina en Clientes y PDV.` };
    }
    if (!c.esOficina) await ref.set({ esOficina: true }, { merge: true });
    return { aviso: null };
}

function gramosVenta(v) {
    if (Number(v.gramos) > 0) return Number(v.gramos);
    return (v.lineas || []).reduce((s, l) => s + (l.tipo === 'sin_envasar'
        ? (Number(l.cantidad) || 0) * 1000
        : (Number(l.cantidad) || 0) * (Number(l.pesoPorUnidad) || 0) * 1000), 0);
}

function datosFactura(f) {
    return {
        numero: f.numero || null,
        fecha: toMs(f.fecha) || null,
        total: Number(f.total) || 0,
        unidades: Number(f.unidades) || 0,
        estado: f.estado || '',
    };
}

/** La factura de una reposición NO es venta: fuera de meta, comisión y ventas. */
async function marcarFacturaReposicion(db, numero, ventaId, notaCreditoNumero) {
    const ref = db.doc(`facturas_vendedor/${numero}`);
    const snap = await ref.get();
    if (!snap.exists) return;
    const f = { id: snap.id, ...snap.data() };
    if (!f.esReposicion) {
        try { await revertirAcumulados(f); }
        catch (e) { functions.logger.error(`ventasPlanta: no se pudo revertir la comisión de ${numero}`, e); }
    }
    await ref.set({
        esReposicion: true,
        reposicionId: ventaId,
        notaCreditoReposicion: notaCreditoNumero || null,
        unidadesContabilizadas: false,
        comisionGenerada: 0,
        reposicionMarcadaAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}

async function guardarVinculo(db, ref, venta, factura, gramosPorUnidad, via, uid) {
    const entregadas = +(gramosVenta(venta) / gramosPorUnidad).toFixed(2);
    const facturadas = Number(factura.unidades) || 0;
    const diferencia = +(facturadas - entregadas).toFixed(2);
    await ref.update({
        estadoFactura: 'facturada',
        facturaNumero: factura.numero,
        facturaFecha: factura.fecha ? admin.firestore.Timestamp.fromMillis(factura.fecha) : null,
        facturaTotal: Number(factura.total) || 0,
        facturaUnidades: facturadas,
        unidadesEntregadas: entregadas,
        diferenciaUnidades: diferencia,
        cuadra: Math.abs(diferencia) < 0.5,
        facturaVia: via,
        vinculadaPor: uid,
        vinculadaAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { entregadas, facturadas, diferencia, cuadra: Math.abs(diferencia) < 0.5 };
}

exports.ventasPlanta = onCall({ region: "us-central1", timeoutSeconds: 240, memory: "512MiB" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "No autorizado");
    const uid = request.auth.uid;
    const { accion } = request.data || {};
    const { db, appConfig, gramosPorUnidad } = await contexto(uid);

    // ── Clientes y artículos de Zoho para los formularios ──────────────────
    if (accion === 'catalogo') {
        const [cSnap, iSnap] = await Promise.all([
            db.collection('clientes_zoho').get(),
            request.data.conArticulos ? db.collection('zoho_items').get() : Promise.resolve({ docs: [] }),
        ]);
        const clientes = cSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(c => c.activoEnZoho !== false)
            .map(c => ({
                customerId: String(c.customerId || c.id),
                customerName: c.customerName || '',
                razonSocial: c.razonSocialCanonica || c.customerName || '',
                esOficina: !!c.esOficina,
                conVendedor: !!c.vendedorId,
            }))
            .sort((a, b) => a.customerName.localeCompare(b.customerName, 'es'));
        const articulos = iSnap.docs.map(d => d.data())
            .filter(i => i.activo !== false)
            .map(i => ({ itemId: String(i.itemId), nombre: i.nombre || '', unidad: i.unidad || '', precioZoho: Number(i.precioZoho) || 0, sku: i.sku || '' }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        return { clientes, articulos, gramosPorUnidad };
    }

    // ── Pendientes: ventas por facturar + facturas de clientes de planta sin salida ──
    if (accion === 'pendientes') {
        const vSnap = await db.collection('kroma_ventas_planta').where('empresaId', '==', 'lacteoca').get();
        const ventas = vSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(v => v.active !== false);
        const vinculadas = new Set(ventas.map(v => v.facturaNumero).filter(Boolean));
        // Primer día que cada cliente compró en planta: antes de eso sus
        // facturas no tienen por qué tener salida de cava.
        const desde = new Map();
        ventas.forEach(v => {
            const t = new Date(`${v.fecha}T00:00:00`).getTime() - 3 * 86400000;
            if (!desde.has(v.clienteZohoId) || t < desde.get(v.clienteZohoId)) desde.set(v.clienteZohoId, t);
        });
        const ids = [...desde.keys()];
        const sinSalida = [];
        for (let i = 0; i < ids.length; i += 30) {
            const snap = await db.collection('facturas_vendedor').where('zohoCustomerId', 'in', ids.slice(i, i + 30)).get();
            snap.docs.forEach(d => {
                const f = d.data();
                if (!cuenta(f) || vinculadas.has(f.numero)) return;
                if (toMs(f.fecha) < desde.get(String(f.zohoCustomerId))) return;
                sinSalida.push({ ...datosFactura(f), clienteNombre: f.clienteName || '', clienteZohoId: String(f.zohoCustomerId) });
            });
        }
        sinSalida.sort((a, b) => (b.fecha || 0) - (a.fecha || 0));
        return { sinSalida, gramosPorUnidad };
    }

    // ── Facturas del cliente que se pueden vincular a esta venta ───────────
    if (accion === 'candidatas') {
        const { venta } = await leerVenta(db, request.data.ventaId);
        const [fSnap, vSnap] = await Promise.all([
            db.collection('facturas_vendedor').where('zohoCustomerId', '==', venta.clienteZohoId).get(),
            db.collection('kroma_ventas_planta').where('clienteZohoId', '==', venta.clienteZohoId).get(),
        ]);
        const usadas = new Set(vSnap.docs.map(d => d.data().facturaNumero).filter(Boolean));
        const tVenta = new Date(`${venta.fecha}T12:00:00`).getTime();
        const facturas = fSnap.docs.map(d => d.data())
            .filter(f => cuenta(f) && !usadas.has(f.numero))
            .map(datosFactura)
            // Las más cercanas a la fecha de la venta, primero.
            .sort((a, b) => Math.abs((a.fecha || 0) - tVenta) - Math.abs((b.fecha || 0) - tVenta))
            .slice(0, 25);
        return { facturas, unidadesEntregadas: +(gramosVenta(venta) / gramosPorUnidad).toFixed(2) };
    }

    if (accion === 'vincular') {
        const { ref, venta } = await leerVenta(db, request.data.ventaId);
        const numero = String(request.data.numero || '').trim();
        if (!numero) throw new HttpsError("invalid-argument", "Elige la factura.");
        const esRepo = venta.tipo === 'reposicion';
        const nc = String(request.data.notaCreditoNumero || '').trim();
        if (esRepo && !nc) throw new HttpsError("invalid-argument", "Escribe el número de la nota de crédito por lo devuelto.");
        const fSnap = await db.doc(`facturas_vendedor/${numero}`).get();
        if (!fSnap.exists) throw new HttpsError("not-found", `La factura ${numero} no está en GK. Espera la próxima conciliación con Zoho.`);
        const f = fSnap.data();
        if (String(f.zohoCustomerId || '') !== String(venta.clienteZohoId)) {
            throw new HttpsError("failed-precondition", `La factura ${numero} es de otro cliente (${f.clienteName || '—'}).`);
        }
        const otra = await db.collection('kroma_ventas_planta').where('facturaNumero', '==', numero).get();
        if (otra.docs.some(d => d.id !== ref.id)) throw new HttpsError("already-exists", `La factura ${numero} ya está vinculada a otra venta.`);
        const { aviso } = await asegurarOficina(db, venta.clienteZohoId);
        const cuadre = await guardarVinculo(db, ref, venta, datosFactura(f), gramosPorUnidad, 'vinculada', uid);
        if (esRepo) {
            await ref.update({ notaCreditoNumero: nc });
            await marcarFacturaReposicion(db, numero, ref.id, nc);
        }
        return { ok: true, numero, cuadre, aviso, reposicion: esRepo };
    }

    if (accion === 'desvincular') {
        const { ref, venta } = await leerVenta(db, request.data.ventaId);
        if (venta.facturaVia === 'creada') {
            throw new HttpsError("failed-precondition", "Esta factura se creó desde Kroma: si está mal, anúlala en Zoho y la venta se puede volver a facturar.");
        }
        if (venta.tipo === 'reposicion' && venta.facturaNumero) {
            // Vuelve a ser una factura normal: la próxima conciliación la cuenta.
            await db.doc(`facturas_vendedor/${venta.facturaNumero}`).set({
                esReposicion: false, reposicionId: null, notaCreditoReposicion: null,
            }, { merge: true }).catch(() => {});
        }
        await ref.update({
            estadoFactura: 'por_facturar', facturaNumero: null, facturaFecha: null, facturaTotal: null,
            facturaUnidades: null, diferenciaUnidades: null, cuadra: null, facturaVia: null,
            ...(venta.tipo === 'reposicion' ? { notaCreditoNumero: null } : {}),
        });
        return { ok: true };
    }

    // ── Facturar en Zoho desde la venta ────────────────────────────────────
    if (accion === 'facturar') {
        const { ref, venta } = await leerVenta(db, request.data.ventaId);
        if (venta.estadoFactura === 'facturada') throw new HttpsError("already-exists", `Esta venta ya tiene la factura ${venta.facturaNumero}.`);
        if (venta.tipo === 'reposicion') {
            throw new HttpsError("failed-precondition", "Una reposición se documenta en Zoho con nota de crédito + factura, cruzadas. Hazlas allá y usa \"Vincular\".");
        }
        const { lineas = [], emitir = false, diasCredito = 0, notas = '' } = request.data;
        const lineItems = [];
        for (const l of lineas) {
            const cantidad = Number(l.cantidad), rate = Number(l.rate);
            if (!l.itemId || !(cantidad > 0)) continue;
            if (!(rate > 0)) throw new HttpsError("invalid-argument", "Cada línea necesita su precio.");
            const it = await db.doc(`zoho_items/${l.itemId}`).get();
            if (!it.exists) throw new HttpsError("not-found", `Artículo no encontrado en el catálogo de Zoho: ${l.itemId}`);
            lineItems.push({ item_id: String(l.itemId), quantity: cantidad, rate: Math.round(rate * 100) / 100 });
        }
        if (lineItems.length === 0) throw new HttpsError("invalid-argument", "La factura no tiene productos.");

        const credsSnap = await db.doc('zoho_secure/creds').get();
        const creds = credsSnap.data() || {};
        const organizationId = appConfig.zohoOrgIdLacteoca;
        if (!organizationId) throw new HttpsError("failed-precondition", "Falta el ID de organización de Zoho (AdminPanel → Integraciones).");

        // Oficina ANTES de sincronizar: así la factura entra a GK sin vendedor.
        const { aviso } = await asegurarOficina(db, venta.clienteZohoId);

        const fechaFactura = new Date(`${venta.fecha}T12:00:00`);
        const venc = new Date(fechaFactura.getTime() + (Number(diasCredito) || 0) * 86400000);
        let creada;
        try {
            const accessToken = await getAccessToken(creds);
            creada = await createInvoice({
                accessToken, organizationId, dataCenter: creds.dataCenter,
                enviar: !!emitir,
                invoice: {
                    customer_id: String(venta.clienteZohoId),
                    date: iso(fechaFactura),
                    due_date: iso(venc),
                    payment_terms: Number(diasCredito) || 0,
                    line_items: lineItems,
                    notes: notas || '',
                },
            });
        } catch (e) {
            const msg = e.response?.data?.message || e.message || 'Error de Zoho';
            if (e.response?.status === 401 || /not authorized|invalid oauth|scope/i.test(msg)) {
                throw new HttpsError("permission-denied", "El token de Zoho no tiene permiso para crear facturas. Regenera el Self Client con ZohoBooks.invoices.CREATE. Mientras tanto, factura en Zoho y usa \"Vincular factura\".");
            }
            throw new HttpsError("internal", `Zoho: ${msg}`);
        }

        let unidadesFactura = null;
        try {
            await upsertFacturaFromZoho(creada, appConfig, {});
            const fs = await db.doc(`facturas_vendedor/${creada.invoice_number}`).get();
            if (fs.exists) unidadesFactura = Number(fs.data().unidades) || 0;
        } catch (e) {
            functions.logger.error('ventasPlanta: factura creada en Zoho pero no sincronizada en GK', e);
        }
        const cuadre = await guardarVinculo(db, ref, venta, {
            numero: creada.invoice_number || '',
            fecha: fechaFactura.getTime(),
            total: Number(creada.total) || 0,
            unidades: unidadesFactura ?? 0,
        }, gramosPorUnidad, 'creada', uid);

        await db.collection('facturas_emitidas_gk').add({
            invoiceId: String(creada.invoice_id || ''),
            numero: creada.invoice_number || '',
            customerId: String(venta.clienteZohoId),
            clienteNombre: venta.clienteNombre || '',
            total: Number(creada.total) || 0,
            emitida: !!emitir,
            lineas: lineItems,
            creadoPor: uid, creadoPorRol: 'kroma',
            origen: 'venta_planta', ventaPlantaId: ref.id,
            vendedorId: null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { ok: true, numero: creada.invoice_number || null, total: Number(creada.total) || 0, cuadre, aviso,
            sincronizada: unidadesFactura != null };
    }

    throw new HttpsError("invalid-argument", "Acción desconocida.");
});
