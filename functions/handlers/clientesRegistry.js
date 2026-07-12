// RUTA: functions/handlers/clientesRegistry.js
//
// REGISTRO DE CLIENTES por CARNET (customer_id de Zoho) — la llave ESTABLE de
// atribución. El nombre del cliente se escribe mal, cambia y lleva la sucursal
// entre paréntesis; el carnet no cambia nunca y viene en el 100% de las facturas
// por API. Aquí vive el registro `clientes_zoho/{customerId}` y la asignación
// cliente → vendedor (o "oficina" = sin comisión, a propósito).
//
// Modelo `clientes_zoho/{customerId}`:
//   { customerId, customerName, razonSocialCanonica, companyName, email,
//     facturas, ultimaFactura, vendedorId|null, esOficina:bool, categoria,
//     updatedAt }  — vendedorId/esOficina/categoria los pone el admin y se
//   preservan al re-sincronizar (merge).

const admin = require("firebase-admin");
const { congelarTasaCohorte, procesarPagoFactura, revertirAcumulados } = require('./facturaCommissionOps');
const { periodoCohorteFromDate } = require('./commissionEngine');
const { toDate, stripSucursal } = require('./facturaSync');

// customer_id es numérico ("4600000000..."), seguro como docId; se limpia por si acaso.
function clienteIdKey(id) {
    return String(id || '').trim().replace(/\//g, '-').slice(0, 400);
}

/**
 * Reconstruye/actualiza el registro `clientes_zoho` desde la lista de facturas de
 * Zoho (barrido de la conciliación). Agrega por carnet, guarda nombre/canónica/
 * conteo, y PRESERVA (merge) lo que puso el admin (vendedorId/esOficina/categoria).
 * @returns {Promise<number>} clientes escritos.
 */
async function upsertClientesRegistry(invoices, db) {
    const agg = new Map();
    for (const inv of invoices) {
        const cid = inv.customer_id != null && inv.customer_id !== '' ? String(inv.customer_id) : null;
        if (!cid) continue;
        const g = agg.get(cid) || {
            customerId: cid, customerName: inv.customer_name || '', facturas: 0,
            ultima: null, companyName: inv.company_name || '', email: inv.email || '',
        };
        g.facturas++;
        const d = toDate(inv.date);
        if (d && (!g.ultima || d > g.ultima)) { g.ultima = d; g.customerName = inv.customer_name || g.customerName; }
        if (inv.company_name && !g.companyName) g.companyName = inv.company_name;
        if (inv.email && !g.email) g.email = inv.email;
        agg.set(cid, g);
    }
    const ids = [...agg.keys()];
    let written = 0;
    for (let i = 0; i < ids.length; i += 400) {
        const chunk = ids.slice(i, i + 400);
        const batch = db.batch();
        for (const cid of chunk) {
            const g = agg.get(cid);
            batch.set(db.doc(`clientes_zoho/${clienteIdKey(cid)}`), {
                customerId:          cid,
                customerName:        g.customerName,
                razonSocialCanonica: stripSucursal(g.customerName),
                companyName:         g.companyName || null,
                email:               g.email || null,
                facturas:            g.facturas,
                ultimaFactura:       g.ultima ? admin.firestore.Timestamp.fromDate(g.ultima) : null,
                updatedAt:           admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true }); // merge preserva vendedorId/esOficina/categoria del admin
            written++;
        }
        await batch.commit();
    }
    return written;
}

/**
 * Carga el mapa de atribución por carnet para el preload de la conciliación.
 * @returns {Promise<Map<string,{vendedorId:string|null, esOficina:boolean, categoria:string}>>}
 */
async function loadClienteMap(db) {
    const snap = await db.collection('clientes_zoho').get();
    const map = new Map();
    snap.docs.forEach(d => {
        const x = d.data();
        map.set(String(x.customerId || d.id), {
            vendedorId: x.vendedorId || null,
            esOficina:  x.esOficina === true,
            categoria:  x.categoria || 'retail',
        });
    });
    return map;
}

/**
 * Backfill de las facturas de UN carnet: re-atribuye al vendedor (o las suelta si
 * es oficina), reusando la lógica de comisiones. Consulta por `zohoCustomerId`
 * (que la conciliación guarda en cada factura).
 * @returns {Promise<number>} facturas tocadas.
 */
async function backfillFacturasPorCustomerId(customerId, vendedor, db) {
    const snap = await db.collection('facturas_vendedor')
        .where('zohoCustomerId', '==', String(customerId)).get();
    let n = 0;
    for (const docSnap of snap.docs) {
        const factura = { id: docSnap.id, ...docSnap.data() };
        if (factura.estado === 'anulada') continue;
        const destino = vendedor ? vendedor.id : null;
        if (factura.vendedorId === destino) continue; // ya está bien
        if (factura.vendedorId) await revertirAcumulados(factura); // suelta al anterior

        if (!vendedor) {
            // Oficina / sin dueño: soltar la factura (sin comisión).
            await docSnap.ref.update({
                vendedorId: null, reporterId: null,
                periodoCohorte: null, recuperada: false,
                tasaCohorte: null, tierCohorte: null, unidadesContabilizadas: false,
                comisionGenerada: 0,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            n++; continue;
        }

        const { periodKey: periodoCohorte, recuperada } =
            periodoCohorteFromDate(vendedor.data.fechaIngreso, factura.fecha?.toDate?.() || null);
        const updateData = {
            vendedorId: vendedor.id,
            reporterId: vendedor.data.reporterId || null,
            periodoCohorte, recuperada,
            tasaCohorte: null, tierCohorte: null, unidadesContabilizadas: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (factura.mesCohorte && factura.unidades > 0) {
            const tier = await congelarTasaCohorte(vendedor, factura.mesCohorte, factura.unidades, periodoCohorte);
            updateData.tasaCohorte = tier.rate * 100;
            updateData.tierCohorte = tier.label;
            updateData.unidadesContabilizadas = true;
        }
        if (factura.estado === 'pagada') {
            const facturaData = { ...factura, ...updateData };
            const fechaFactura = factura.fecha?.toDate?.() || null;
            const vencimiento  = factura.vencimiento?.toDate?.() || null;
            await procesarPagoFactura({ vendedor, facturaData, fechaFactura, vencimiento });
            updateData.comisionAnulada     = facturaData.comisionAnulada;
            updateData.comisionGenerada    = facturaData.comisionGenerada;
            updateData.pagadaDentroDePlazo = facturaData.pagadaDentroDePlazo;
            updateData.fechaPago           = facturaData.fechaPago;
            updateData.diasParaCobrar      = facturaData.diasParaCobrar;
        }
        await docSnap.ref.update(updateData);
        n++;
    }
    return n;
}

module.exports = {
    clienteIdKey,
    upsertClientesRegistry,
    loadClienteMap,
    backfillFacturasPorCustomerId,
};
