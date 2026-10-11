// RUTA: functions/handlers/carteraCarnet.js
//
// La CARTERA del vendedor manda (pedido del dueño, 11-oct): "así no se le asigne
// nombre de vendedor a la factura, si este cliente está asignado a su cartera
// debería entrar dentro de sus comisiones".
//
// Había DOS sistemas que no se hablaban:
//   - la cartera: `vendor_clients` (PDV directo o cadena completa) → vendedor;
//   - la atribución de facturas: el carnet de Zoho (`clientes_zoho.vendedorId`).
// Un cliente cuyo PDV está en la cartera de Carolina, pero cuyo carnet nadie
// asignó, generaba facturas "sin vendedor": sin comisión y en el aviso de
// "pagadas pendientes de asignar".
//
// Regla: el carnet de un PDV de la cartera hereda el vendedor de esa cartera.
//   - Una decisión EXPLÍCITA manda: un carnet asignado a mano a otro vendedor, o
//     marcado Oficina, no se toca; se reporta como conflicto para revisarlo.
//   - Si el carnet aparece en las carteras de DOS vendedores, no se adivina.
//   - Lo heredado queda marcado `vendedorPorCartera:true`; si la cartera cambia
//     de vendedor, se mueve con ella. Si el PDV sale de toda cartera NO se suelta
//     solo (soltarlo le quitaría comisiones ya ganadas): se reporta.

const CADENA_GENERICA = 'Automercados Individuales';

// Misma normalización que `normalizeCustomerKey` (facturaCommissionOps), copiada
// para que este módulo sea puro y se pueda probar sin Firebase.
const claveNombre = (s) => String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Núcleo puro. Deduce, por carnet, el vendedor que le corresponde por cartera.
 * @param {object} p
 * @param {Array} p.vendorClients  docs de `vendor_clients` ({vendedorId, posId?, chain?, active, estado})
 * @param {Array} p.pos            docs de `pos` ({id, chain, zohoCustomerId, razonSocialZoho, eliminado, type})
 * @param {Array} p.clientes       docs de `clientes_zoho` ({customerId, customerName, vendedorId, esOficina, vendedorPorCartera})
 * @returns {{asignar: Array<{customerId, vendedorId, pdvs:string[]}>, conflictos: Array, sueltos: Array}}
 */
function derivarCarnetsDeCartera({ vendorClients = [], pos = [], clientes = [] }) {
    // 1) Cartera de cada vendedor: PDV directos y cadenas completas.
    const cartera = new Map(); // vendedorId → {pos:Set, chains:Set}
    vendorClients.forEach(c => {
        if (!c || !c.vendedorId || c.active === false || (c.estado && c.estado !== 'activo')) return;
        if (!cartera.has(c.vendedorId)) cartera.set(c.vendedorId, { pos: new Set(), chains: new Set() });
        const k = cartera.get(c.vendedorId);
        if (c.posId) k.pos.add(c.posId);
        if (c.chain && c.chain !== CADENA_GENERICA) k.chains.add(c.chain);
    });

    // 2) Carnet de cada PDV: el vinculado por carnet, o —si solo está vinculado
    //    por nombre— el carnet de ese nombre cuando es UNO solo.
    const carnetsPorNombre = new Map(); // clave → Set(customerId)
    clientes.forEach(c => {
        const k = claveNombre(c.customerName);
        if (!k) return;
        if (!carnetsPorNombre.has(k)) carnetsPorNombre.set(k, new Set());
        carnetsPorNombre.get(k).add(String(c.customerId));
    });
    const carnetDe = (p) => {
        if (p.zohoCustomerId) return String(p.zohoCustomerId);
        const set = carnetsPorNombre.get(claveNombre(p.razonSocialZoho));
        return set && set.size === 1 ? [...set][0] : null;
    };

    // 3) Carnet → vendedores (y qué PDV lo justifican).
    const porCarnet = new Map(); // customerId → Map(vendedorId → [pdvNombre])
    pos.forEach(p => {
        if (!p || p.eliminado === true || p.type === 'depot') return;
        const cid = carnetDe(p);
        if (!cid) return;
        cartera.forEach((k, vid) => {
            if (!(k.pos.has(p.id) || (p.chain && k.chains.has(p.chain)))) return;
            if (!porCarnet.has(cid)) porCarnet.set(cid, new Map());
            const m = porCarnet.get(cid);
            if (!m.has(vid)) m.set(vid, []);
            m.get(vid).push(p.name || p.id);
        });
    });

    const clienteDe = new Map(clientes.map(c => [String(c.customerId), c]));
    const asignar = [], conflictos = [], sueltos = [];
    porCarnet.forEach((m, cid) => {
        const c = clienteDe.get(cid) || { customerId: cid };
        const nombre = c.customerName || cid;
        if (m.size > 1) {
            conflictos.push({ customerId: cid, nombre, motivo: 'varias_carteras', vendedores: [...m.keys()] });
            return;
        }
        const [vid, pdvs] = [...m.entries()][0];
        if (c.esOficina) { conflictos.push({ customerId: cid, nombre, motivo: 'marcado_oficina', vendedorCartera: vid, pdvs }); return; }
        if (c.vendedorId === vid) return; // ya está bien
        if (c.vendedorId && c.vendedorPorCartera !== true) {
            conflictos.push({ customerId: cid, nombre, motivo: 'asignado_a_otro', vendedorCarnet: c.vendedorId, vendedorCartera: vid, pdvs });
            return;
        }
        asignar.push({ customerId: cid, vendedorId: vid, nombre, pdvs });
    });
    // Heredados por cartera que ya no están en ninguna: se reportan, no se sueltan.
    clientes.forEach(c => {
        if (c.vendedorPorCartera === true && c.vendedorId && !porCarnet.has(String(c.customerId))) {
            sueltos.push({ customerId: String(c.customerId), nombre: c.customerName || c.customerId, vendedorId: c.vendedorId });
        }
    });
    return { asignar, conflictos, sueltos };
}

/**
 * Aplica la regla en Firestore: escribe el vendedor en `clientes_zoho` y re-atribuye
 * las facturas de ese carnet por la MISMA vía que una asignación manual
 * (`backfillFacturasPorCustomerId`: revierte, congela tasa y calcula comisión).
 * @returns {Promise<{asignados:number, facturas:number, conflictos:Array, sueltos:Array}>}
 */
async function alinearCarnetsConCartera(db) {
    const admin = require('firebase-admin');
    const { backfillFacturasPorCustomerId, clienteIdKey } = require('./clientesRegistry');
    const [vcSnap, posSnap, cliSnap, vendSnap] = await Promise.all([
        db.collection('vendor_clients').get(),
        db.collection('pos').get(),
        db.collection('clientes_zoho').get(),
        db.collection('users_metadata').where('role', '==', 'vendedor').get(),
    ]);
    const vendedores = new Map(vendSnap.docs.map(d => [d.id, d.data()]));
    const r = derivarCarnetsDeCartera({
        vendorClients: vcSnap.docs.map(d => d.data()),
        pos: posSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        clientes: cliSnap.docs.map(d => ({ customerId: d.data().customerId || d.id, ...d.data() })),
    });
    let asignados = 0, facturas = 0;
    for (const a of r.asignar) {
        const data = vendedores.get(a.vendedorId);
        if (!data) continue; // la cartera apunta a un vendedor que ya no existe
        await db.doc(`clientes_zoho/${clienteIdKey(a.customerId)}`).set({
            vendedorId: a.vendedorId,
            vendedorName: data.name || null,
            vendedorPorCartera: true,
            carteraPdvs: a.pdvs.slice(0, 10),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        facturas += await backfillFacturasPorCustomerId(a.customerId, { id: a.vendedorId, data }, db);
        asignados++;
    }
    return { asignados, facturas, asignadosDetalle: r.asignar.slice(0, 30), conflictos: r.conflictos, sueltos: r.sueltos };
}

module.exports = { derivarCarnetsDeCartera, alinearCarnetsConCartera, claveNombre };
