// RUTA: functions/handlers/traspasoCartera.js
//
// TRASPASAR CARTERA de un vendedor a otro con FECHA DE CORTE (pedido del dueño,
// 3-nov-2026; caso Carolina → Erick, corte 3-nov). Callable solo del máster:
//   traspasarCartera({ deId, aId, corte:'YYYY-MM-DD', abiertasAlNuevo, accion:'simular'|'ejecutar' })
//
// Qué hace (las reglas puras viven en traspasoReglas.js):
//   · Los carnets de Zoho (`clientes_zoho`) de A pasan a B desde el corte; cada
//     uno guarda el traspaso en `traspasos`, así la conciliación, el webhook y la
//     reasignación manual siguen dándole a A las facturas de antes del corte.
//   · Las facturas desde el corte se re-atribuyen a B (con su tasa y comisión);
//     las de antes se quedan con A, con sus comisiones y sus cierres.
//   · `abiertasAlNuevo`: las de A anteriores al corte que siguen abiertas las
//     cobra B como cuentas recuperadas (a la tasa de recuperadas de B).
//   · La cartera (`vendor_clients`) de A se desactiva; lo que B no tenía se le
//     agrega. También se apagan las carteras activas de vendedores sin perfil
//     (duplicados viejos de Wilmer).
//   · El nombre de razón social (`zoho_customer_map`) que apuntaba a A pasa a B
//     (solo afecta facturas nuevas que lleguen sin carnet).
//   · Constancia en `traspasos_cartera/{id}`: quién, cuándo, el plan y el
//     resultado. Es idempotente: el mismo traspaso no se aplica dos veces.

const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { planTraspaso, vendedorDelCarnetEnFecha } = require('./traspasoReglas');

const enTrozos = (xs, n) => { const out = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out; };

async function leerDatos(db, deId, aId) {
    const [aSnap, bSnap, cliSnap, vcSnap, vendSnap] = await Promise.all([
        db.doc(`users_metadata/${deId}`).get(),
        db.doc(`users_metadata/${aId}`).get(),
        db.collection('clientes_zoho').where('vendedorId', '==', deId).get(),
        db.collection('vendor_clients').get(),
        db.collection('users_metadata').where('role', '==', 'vendedor').get(),
    ]);
    if (!aSnap.exists) throw new HttpsError('not-found', 'No existe el vendedor que entrega la cartera.');
    if (!bSnap.exists) throw new HttpsError('not-found', 'No existe el vendedor que recibe la cartera.');
    const clientes = cliSnap.docs.map(d => ({ id: d.id, customerId: d.data().customerId || d.id, ...d.data() }));
    const vendorClients = vcSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Vendedores de carteras activas sin perfil en GK: duplicados huérfanos.
    const conPerfil = new Set(vendSnap.docs.map(d => d.id));
    const idsCartera = [...new Set(vendorClients.filter(v => v.active !== false && v.vendedorId).map(v => v.vendedorId))];
    const huerfanos = [];
    for (const id of idsCartera) {
        if (conPerfil.has(id) || id === deId || id === aId) continue;
        const s = await db.doc(`users_metadata/${id}`).get();
        if (!s.exists) huerfanos.push(id);
    }
    const ids = clientes.map(c => String(c.customerId));
    const facturas = [];
    for (const t of enTrozos(ids, 30)) {
        const s = await db.collection('facturas_vendedor').where('zohoCustomerId', 'in', t).get();
        s.docs.forEach(d => facturas.push({ id: d.id, ...d.data() }));
    }
    return { A: { id: deId, data: aSnap.data() }, B: { id: aId, data: bSnap.data() }, clientes, vendorClients, facturas, huerfanos, vendedoresPorId: new Map(vendSnap.docs.map(d => [d.id, d.data()])) };
}

exports.traspasarCartera = onCall({ region: 'us-central1', timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'No autorizado');
    const db = admin.firestore();
    const yo = await db.doc(`users_metadata/${request.auth.uid}`).get();
    if (yo.data()?.role !== 'master') throw new HttpsError('permission-denied', 'Solo el máster traspasa carteras.');
    if (request.auth.token?.impersonatedBy) throw new HttpsError('permission-denied', 'No se traspasa una cartera entrando con la llave maestra.');

    const { deId, aId, corte, abiertasAlNuevo = false, accion = 'simular' } = request.data || {};
    const datos = await leerDatos(db, deId, aId);
    let plan;
    try {
        plan = planTraspaso({ deId, aId, corte, abiertasAlNuevo, clientes: datos.clientes, vendorClients: datos.vendorClients, facturas: datos.facturas, huerfanos: datos.huerfanos });
    } catch (e) { throw new HttpsError('invalid-argument', e.message); }
    const resumen = {
        ...plan,
        de: { id: deId, nombre: datos.A.data.name || deId, activo: datos.A.data.active !== false },
        a: { id: aId, nombre: datos.B.data.name || aId, fechaIngreso: datos.B.data.fechaIngreso || null, recuperadasPct: datos.B.data.commissionConfig?.comisionRecuperadas ?? null },
        huerfanos: datos.huerfanos,
    };
    if (accion !== 'ejecutar') return { simulado: true, resumen };

    const id = `${corte}_${deId}_${aId}`;
    const ref = db.doc(`traspasos_cartera/${id}`);
    const previo = await ref.get();
    if (previo.exists && previo.data().estado === 'hecho') return { yaHecho: true, resumen: previo.data().resumen, resultado: previo.data().resultado };
    await ref.set({
        estado: 'en_curso', deId, aId, corte, abiertasAlNuevo: !!abiertasAlNuevo, resumen,
        por: request.auth.uid, porEmail: request.auth.token?.email || null,
        at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const ahora = admin.firestore.Timestamp.now();
    const alNuevo = new Set(plan.facturasAlNuevo);
    const facturasPorCarnet = {};
    datos.facturas.forEach(f => { (facturasPorCarnet[String(f.zohoCustomerId)] = facturasPorCarnet[String(f.zohoCustomerId)] || []).push(f); });

    // 1) Carnets: pasan a B con el registro del traspaso.
    for (const t of enTrozos(datos.clientes, 300)) {
        const b = db.batch();
        t.forEach(c => {
            const cid = String(c.customerId);
            const registro = {
                id, desde: corte, deVendedorId: deId, aVendedorId: aId, at: ahora,
                facturasAlNuevo: (facturasPorCarnet[cid] || []).filter(f => alNuevo.has(String(f.numero))).map(f => String(f.numero)),
            };
            const yaEsta = (c.traspasos || []).some(x => x.id === id);
            b.set(db.doc(`clientes_zoho/${c.id}`), {
                vendedorId: aId, vendedorName: datos.B.data.name || null,
                ...(yaEsta ? {} : { traspasos: admin.firestore.FieldValue.arrayUnion(registro) }),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        });
        await b.commit();
    }

    // 2) Cartera: A se apaga; lo que B no tenía se le agrega; huérfanos se apagan.
    const nuevos = new Set(plan.carteraNueva.map(x => x.id));
    const vcPorId = new Map(datos.vendorClients.map(v => [v.id, v]));
    const ops = [];
    plan.carteraA.forEach(x => {
        ops.push(b => b.set(db.doc(`vendor_clients/${x.id}`), { active: false, estado: 'traspasado', traspasoId: id, traspasadoA: aId, traspasadoAt: ahora }, { merge: true }));
        if (nuevos.has(x.id)) {
            const orig = vcPorId.get(x.id) || {};
            const { id: _i, ...resto } = orig;
            ops.push(b => b.set(db.doc(`vendor_clients/${id}__${x.id}`), {
                ...resto, vendedorId: aId, vendedorName: datos.B.data.name || null,
                estado: 'activo', active: true, traspasoId: id, traspasadoDe: deId,
                addedBy: 'traspaso', approvedAt: new Date().toISOString(),
            }));
        }
    });
    plan.duplicadosHuerfanos.forEach(x => ops.push(b => b.set(db.doc(`vendor_clients/${x.id}`), { active: false, estado: 'huerfano_desactivado', traspasoId: id }, { merge: true })));
    for (const t of enTrozos(ops, 400)) { const b = db.batch(); t.forEach(fn => fn(b)); await b.commit(); }

    // 3) Nombre de razón social → vendedor (respaldo para facturas sin carnet).
    const mapSnap = await db.collection('zoho_customer_map').where('vendedorId', '==', deId).get();
    for (const t of enTrozos(mapSnap.docs, 400)) {
        const b = db.batch();
        t.forEach(d => b.set(d.ref, { vendedorId: aId, traspasoId: id }, { merge: true }));
        await b.commit();
    }

    // 4) Facturas: cada una al dueño que le toca por su fecha (la misma vía que
    //    una asignación manual: revierte, congela la tasa y calcula la comisión).
    const { backfillFacturasPorCustomerId } = require('./clientesRegistry');
    let movidas = 0;
    const B = { id: aId, data: datos.B.data };
    for (const c of datos.clientes) {
        movidas += await backfillFacturasPorCustomerId(String(c.customerId), B, db, { vendedoresPorId: datos.vendedoresPorId });
    }

    // Comprobación: cada factura con el dueño que le toca.
    const descuadres = [];
    for (const c of datos.clientes) {
        const snap = await db.collection('facturas_vendedor').where('zohoCustomerId', '==', String(c.customerId)).get();
        const cli = (await db.doc(`clientes_zoho/${c.id}`).get()).data();
        snap.docs.forEach(d => {
            const f = d.data();
            if (f.estado === 'anulada') return;
            const dueno = vendedorDelCarnetEnFecha(cli, f.fecha, f.numero).vendedorId;
            if ((f.vendedorId || null) !== dueno) descuadres.push(f.numero);
        });
    }
    const resultado = { carnets: datos.clientes.length, carteraApagada: plan.carteraA.length, carteraAgregada: plan.carteraNueva.length, huerfanosApagados: plan.duplicadosHuerfanos.length, nombres: mapSnap.size, facturasMovidas: movidas, descuadres };
    await ref.set({ estado: 'hecho', resultado, terminadoAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { hecho: true, resumen, resultado };
});
