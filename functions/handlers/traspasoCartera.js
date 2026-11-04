// RUTA: functions/handlers/traspasoCartera.js
//
// TRASPASOS DE CARTERA, DUPLICADOS Y CESE DEL VENDEDOR (pedido del dueño, 3-nov-2026).
// Callables solo del máster (nunca con la llave maestra). Las reglas puras viven
// en traspasoReglas.js.
//
//   traspasarCartera({ accion:'simular'|'ejecutar', deId, aId, corte, seleccion, decisiones })
//     Pasa TODA la cartera de A a B (seleccion:'todo') o solo algunos clientes
//     (seleccion: ids de `vendor_clients` de A), desde la fecha de corte.
//     · Los carnets pasan a B y guardan el traspaso: lo facturado antes del corte
//       sigue siendo de A (sus comisiones y cierres no se mueven).
//     · Si A ya cesó (`fechaCese`), sus facturas abiertas ese día pasan a B.
//     · No se permiten duplicados: si un cliente elegido ya está en otra cartera,
//       el plan lo muestra y NO se ejecuta hasta decidir con quién se queda.
//     · Constancia en `traspasos_cartera/{id}`; idempotente.
//   traspasarCartera({ accion:'duplicados' }) → los duplicados de todas las carteras.
//   traspasarCartera({ accion:'resolverDuplicado', llave, quedaCon }) → deja el
//     cliente en UNA cartera (solo con el dueño del carnet: darlo a otro es un traspaso).
//   registrarCese({ accion:'simular'|'ejecutar'|'anular', vendedorId, fechaCese })
//     Fecha en que el vendedor dejó la empresa. Lo deja inactivo; sus comisiones
//     se calculan hasta esa fecha (y se congelan solas al cerrar); sus facturas
//     abiertas ese día pasan a quien heredó sus clientes.

const admin = require('firebase-admin');
const crypto = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { planTraspaso, vendedorDelCarnetEnFecha, duplicadosCartera, carteraActiva } = require('./traspasoReglas');

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
const enTrozos = (xs, n) => { const out = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out; };

async function soloMaster(request) {
    if (!request.auth) throw new HttpsError('unauthenticated', 'No autorizado');
    if (request.auth.token?.impersonatedBy) throw new HttpsError('permission-denied', 'No se hace con la llave maestra.');
    const yo = await admin.firestore().doc(`users_metadata/${request.auth.uid}`).get();
    if (yo.data()?.role !== 'master') throw new HttpsError('permission-denied', 'Solo el máster.');
}

async function vendedoresPorId(db) {
    const s = await db.collection('users_metadata').where('role', '==', 'vendedor').get();
    return new Map(s.docs.map(d => [d.id, d.data()]));
}

async function huerfanosDe(db, vendorClients, conPerfil) {
    const ids = [...new Set(vendorClients.filter(carteraActiva).map(v => v.vendedorId).filter(Boolean))];
    const out = [];
    for (const id of ids) {
        if (conPerfil.has(id)) continue;
        const s = await db.doc(`users_metadata/${id}`).get();
        if (!s.exists) out.push(id);
    }
    return out;
}

async function facturasDeCarnets(db, ids) {
    const out = [];
    for (const t of enTrozos(ids, 30)) {
        const s = await db.collection('facturas_vendedor').where('zohoCustomerId', 'in', t).get();
        s.docs.forEach(d => out.push({ id: d.id, ...d.data() }));
    }
    return out;
}

/** Re-atribuye las facturas de unos carnets según su fecha y comprueba que cada una quedó con su dueño. */
async function realinearFacturas(db, clientesIds, vendPorId) {
    const { backfillFacturasPorCustomerId, clienteIdKey } = require('./clientesRegistry');
    let movidas = 0;
    const descuadres = [];
    for (const cid of clientesIds) {
        const cli = (await db.doc(`clientes_zoho/${clienteIdKey(cid)}`).get()).data() || {};
        const dueno = cli.vendedorId && vendPorId.get(cli.vendedorId) ? { id: cli.vendedorId, data: vendPorId.get(cli.vendedorId) } : null;
        if (!dueno) continue;
        movidas += await backfillFacturasPorCustomerId(cid, dueno, db, { vendedoresPorId: vendPorId });
        const snap = await db.collection('facturas_vendedor').where('zohoCustomerId', '==', String(cid)).get();
        snap.docs.forEach(d => {
            const f = d.data();
            if (f.estado === 'anulada') return;
            const quien = vendedorDelCarnetEnFecha(cli, f.fecha, f.numero, f.estado === 'pagada' ? f.fechaPago : null).vendedorId;
            if ((f.vendedorId || null) !== quien) descuadres.push(f.numero);
        });
    }
    return { movidas, descuadres };
}

exports.traspasarCartera = onCall({ region: 'us-central1', timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
    await soloMaster(request);
    const db = admin.firestore();
    const { accion = 'simular' } = request.data || {};

    const vcSnap = await db.collection('vendor_clients').get();
    const vendorClients = vcSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const vendPorId = await vendedoresPorId(db);

    // ── Duplicados de todas las carteras ────────────────────────────────────
    if (accion === 'duplicados' || accion === 'resolverDuplicado') {
        const huerfanos = await huerfanosDe(db, vendorClients, new Set(vendPorId.keys()));
        const dups = duplicadosCartera(vendorClients.filter(v => !huerfanos.includes(v.vendedorId)));
        const posSnap = await db.collection('pos').get();
        const pos = new Map(posSnap.docs.map(d => [d.id, d.data()]));
        const cliSnap = await db.collection('clientes_zoho').get();
        const duenoCarnet = new Map(cliSnap.docs.map(d => [String(d.data().customerId || d.id), d.data().vendedorId || null]));
        const conDueno = dups.map(d => {
            const posId = d.llave.startsWith('pos:') ? d.llave.slice(4) : null;
            const carnet = posId ? pos.get(posId)?.zohoCustomerId : null;
            return {
                ...d, carnet: carnet || null, duenoCarnet: carnet ? duenoCarnet.get(String(carnet)) || null : null,
                registros: d.registros.map(r => ({ ...r, nombre: vendPorId.get(r.vendedorId)?.name || r.vendedorId, activo: vendPorId.get(r.vendedorId)?.active !== false })),
            };
        });
        if (accion === 'duplicados') return { duplicados: conDueno, huerfanos };

        const { llave, quedaCon } = request.data || {};
        const d = conDueno.find(x => x.llave === llave);
        if (!d) throw new HttpsError('not-found', 'Ese duplicado ya no existe.');
        if (!d.registros.some(r => r.vendedorId === quedaCon)) throw new HttpsError('invalid-argument', 'Elige uno de los vendedores que lo tienen.');
        if (d.duenoCarnet && d.duenoCarnet !== quedaCon) {
            throw new HttpsError('failed-precondition', `Ese cliente es de ${vendPorId.get(d.duenoCarnet)?.name || 'otro vendedor'} en Zoho. Para dárselo a otro vendedor usa "Traspasar cartera" (con fecha de corte).`);
        }
        const b = db.batch();
        d.registros.filter(r => r.vendedorId !== quedaCon).forEach(r => b.set(db.doc(`vendor_clients/${r.id}`), {
            active: false, estado: 'duplicado_resuelto', resueltoA: quedaCon, resueltoPor: request.auth.uid, resueltoAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true }));
        await b.commit();
        return { ok: true, apagados: d.registros.filter(r => r.vendedorId !== quedaCon).length };
    }

    // ── Traspaso ────────────────────────────────────────────────────────────
    const { deId, aId, corte, seleccion = 'todo', decisiones = {} } = request.data || {};
    // Identidad del traspaso (sale de lo pedido, no del plan): repetirlo no hace nada.
    const todoPedido = seleccion === 'todo' || !Array.isArray(seleccion);
    const firma = todoPedido ? 'todo' : crypto.createHash('sha256').update(JSON.stringify([...seleccion].map(String).sort())).digest('hex').slice(0, 8);
    const id = `${corte}_${deId}_${aId}_${firma}`;
    const ref = db.doc(`traspasos_cartera/${id}`);
    if (accion === 'ejecutar') {
        const previo = await ref.get();
        if (previo.exists && previo.data().estado === 'hecho') return { yaHecho: true, id, resumen: previo.data().resumen, resultado: previo.data().resultado };
    }
    const [aSnap, bSnap, cliSnap, posSnap] = await Promise.all([
        db.doc(`users_metadata/${deId || '_'}`).get(),
        db.doc(`users_metadata/${aId || '_'}`).get(),
        db.collection('clientes_zoho').where('vendedorId', '==', deId || '_').get(),
        db.collection('pos').get(),
    ]);
    if (!aSnap.exists) throw new HttpsError('not-found', 'No existe el vendedor que entrega la cartera.');
    if (!bSnap.exists) throw new HttpsError('not-found', 'No existe el vendedor que recibe la cartera.');
    const A = aSnap.data(), B = bSnap.data();
    const clientes = cliSnap.docs.map(d => ({ id: d.id, customerId: d.data().customerId || d.id, ...d.data() }));
    const pos = posSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const huerfanos = await huerfanosDe(db, vendorClients, new Set(vendPorId.keys()));
    const facturas = await facturasDeCarnets(db, clientes.map(c => String(c.customerId)));
    const ceseDe = DIA_RE.test(String(A.fechaCese || '')) ? A.fechaCese : null;

    let plan;
    try {
        plan = planTraspaso({ deId, aId, corte, ceseDe, seleccion, decisiones, clientes, vendorClients, pos, facturas, huerfanos });
    } catch (e) { throw new HttpsError('invalid-argument', e.message); }
    const nombreDe = (id) => vendPorId.get(id)?.name || (id === deId ? A.name : id === aId ? B.name : id);
    const resumen = {
        ...plan,
        de: { id: deId, nombre: A.name || deId, activo: A.active !== false, fechaCese: ceseDe },
        a: { id: aId, nombre: B.name || aId, fechaIngreso: B.fechaIngreso || null, recuperadasPct: B.commissionConfig?.comisionRecuperadas ?? null },
        duplicados: plan.duplicados.map(d => ({ ...d, opciones: d.opciones.map(id => ({ id, nombre: nombreDe(id) })), otros: d.otros.map(o => ({ ...o, nombre: nombreDe(o.vendedorId) })) })),
        huerfanos,
    };
    if (accion !== 'ejecutar') return { simulado: true, resumen };
    if (plan.sinDecidir.length) throw new HttpsError('failed-precondition', `Hay ${plan.sinDecidir.length} cliente(s) duplicado(s) sin decidir con quién se quedan.`);
    if (!plan.carnets.length && !plan.pasan.length) throw new HttpsError('failed-precondition', 'No hay nada que traspasar con esa selección.');

    await ref.set({
        estado: 'en_curso', deId, aId, corte, seleccion: plan.todo ? 'todo' : plan.pasan.map(x => x.id), decisiones, resumen,
        por: request.auth.uid, porEmail: request.auth.token?.email || null,
        at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const ahora = admin.firestore.Timestamp.now();
    const carnetIds = new Set(plan.carnets.map(c => c.customerId));

    // 1) Carnets: pasan a B con el registro del traspaso (y el cese de A, si ya cesó).
    for (const t of enTrozos(clientes.filter(c => carnetIds.has(String(c.customerId))), 300)) {
        const b = db.batch();
        t.forEach(c => {
            const registro = { id, desde: corte, deVendedorId: deId, aVendedorId: aId, ceseDe, at: ahora };
            const yaEsta = (c.traspasos || []).some(x => x.id === id);
            b.set(db.doc(`clientes_zoho/${c.id}`), {
                vendedorId: aId, vendedorName: B.name || null,
                ...(yaEsta ? {} : { traspasos: admin.firestore.FieldValue.arrayUnion(registro) }),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        });
        await b.commit();
    }

    // 2) Cartera sin duplicados.
    const nuevos = new Set(plan.carteraNueva.map(x => x.id));
    const vcPorId = new Map(vendorClients.map(v => [v.id, v]));
    const ops = [];
    plan.apagarA.forEach(vid => {
        ops.push(b => b.set(db.doc(`vendor_clients/${vid}`), { active: false, estado: 'traspasado', traspasoId: id, traspasadoA: aId, traspasadoAt: ahora }, { merge: true }));
        if (nuevos.has(vid)) {
            const { id: _i, ...resto } = vcPorId.get(vid) || {};
            ops.push(b => b.set(db.doc(`vendor_clients/${id}__${vid}`), {
                ...resto, vendedorId: aId, vendedorName: B.name || null,
                estado: 'activo', active: true, traspasoId: id, traspasadoDe: deId,
                addedBy: 'traspaso', approvedAt: new Date().toISOString(),
            }));
        }
    });
    plan.apagarOtros.forEach(vid => ops.push(b => b.set(db.doc(`vendor_clients/${vid}`), { active: false, estado: 'duplicado_resuelto', traspasoId: id, resueltoAt: ahora }, { merge: true })));
    plan.duplicadosHuerfanos.forEach(x => ops.push(b => b.set(db.doc(`vendor_clients/${x.id}`), { active: false, estado: 'huerfano_desactivado', traspasoId: id }, { merge: true })));
    for (const t of enTrozos(ops, 400)) { const b = db.batch(); t.forEach(fn => fn(b)); await b.commit(); }

    // 3) Nombre de razón social → vendedor (respaldo para facturas sin carnet).
    let nombres = 0;
    if (plan.todo) {
        const mapSnap = await db.collection('zoho_customer_map').where('vendedorId', '==', deId).get();
        for (const t of enTrozos(mapSnap.docs, 400)) { const b = db.batch(); t.forEach(d => b.set(d.ref, { vendedorId: aId, traspasoId: id }, { merge: true })); await b.commit(); }
        nombres = mapSnap.size;
    }

    // 4) Facturas: cada una con su dueño por fecha (y cese).
    const { movidas, descuadres } = await realinearFacturas(db, [...carnetIds], vendPorId);
    const resultado = { carnets: carnetIds.size, carteraApagada: plan.apagarA.length, carteraAgregada: plan.carteraNueva.length, duplicadosResueltos: plan.apagarOtros.length, huerfanosApagados: plan.duplicadosHuerfanos.length, nombres, facturasMovidas: movidas, descuadres };
    await ref.set({ estado: 'hecho', resultado, terminadoAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { hecho: true, id, resumen, resultado };
});

exports.registrarCese = onCall({ region: 'us-central1', timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
    await soloMaster(request);
    const db = admin.firestore();
    const { accion = 'simular', vendedorId, fechaCese } = request.data || {};
    const vSnap = await db.doc(`users_metadata/${vendedorId || '_'}`).get();
    if (!vSnap.exists) throw new HttpsError('not-found', 'No existe ese vendedor.');
    const V = vSnap.data();
    if (accion !== 'anular' && !DIA_RE.test(String(fechaCese || ''))) throw new HttpsError('invalid-argument', 'La fecha de cese debe ser AAAA-MM-DD.');
    if (accion !== 'anular' && V.fechaIngreso && fechaCese < V.fechaIngreso) throw new HttpsError('invalid-argument', 'La fecha de cese no puede ser anterior a su ingreso.');
    const nuevaCese = accion === 'anular' ? null : fechaCese;

    // Carnets que ya pasaron a otro vendedor desde este (traspasos) y carnets que
    // siguen a su nombre (sin heredero todavía).
    const traspSnap = await db.collection('clientes_zoho').get();
    const heredados = traspSnap.docs.filter(d => (d.data().traspasos || []).some(t => t.deVendedorId === vendedorId));
    const propios = traspSnap.docs.filter(d => d.data().vendedorId === vendedorId);
    const vendPorId = await vendedoresPorId(db);

    // Simulación: qué facturas abiertas ese día pasan al heredero.
    const facturas = await facturasDeCarnets(db, heredados.map(d => String(d.data().customerId || d.id)));
    const pasan = [];
    heredados.forEach(d => {
        const cli = d.data();
        const simulado = { ...cli, traspasos: (cli.traspasos || []).map(t => (t.deVendedorId === vendedorId ? { ...t, ceseDe: nuevaCese } : t)) };
        facturas.filter(f => String(f.zohoCustomerId) === String(cli.customerId || d.id) && f.estado !== 'anulada' && f.vendedorId === vendedorId).forEach(f => {
            const quien = vendedorDelCarnetEnFecha(simulado, f.fecha, f.numero, f.estado === 'pagada' ? f.fechaPago : null).vendedorId;
            if (quien !== vendedorId) pasan.push({ numero: f.numero, saldo: Number(f.balance ?? f.monto) || 0, a: vendPorId.get(quien)?.name || quien });
        });
    });
    const resumen = {
        vendedor: { id: vendedorId, nombre: V.name || vendedorId, fechaIngreso: V.fechaIngreso || null, fechaCeseActual: V.fechaCese || null },
        fechaCese: nuevaCese,
        carnetsHeredados: heredados.length, carnetsSinHeredero: propios.length,
        facturasQuePasan: pasan.length, saldoQuePasa: Math.round(pasan.reduce((s, x) => s + x.saldo, 0) * 100) / 100,
        detalle: pasan.slice(0, 60),
    };
    if (accion === 'simular') return { simulado: true, resumen };

    // Aplicar: el perfil y el cese en cada traspaso.
    await db.doc(`users_metadata/${vendedorId}`).set(accion === 'anular'
        ? { fechaCese: admin.firestore.FieldValue.delete(), ceseRegistradoPor: request.auth.uid, ceseRegistradoAt: admin.firestore.FieldValue.serverTimestamp() }
        : { fechaCese: nuevaCese, active: false, ceseRegistradoPor: request.auth.uid, ceseRegistradoAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    for (const t of enTrozos(heredados, 300)) {
        const b = db.batch();
        t.forEach(d => b.set(d.ref, { traspasos: (d.data().traspasos || []).map(x => (x.deVendedorId === vendedorId ? { ...x, ceseDe: nuevaCese } : x)) }, { merge: true }));
        await b.commit();
    }
    const { movidas, descuadres } = await realinearFacturas(db, heredados.map(d => String(d.data().customerId || d.id)), await vendedoresPorId(db));
    await db.collection('traspasos_cartera').add({
        tipo: 'cese', vendedorId, fechaCese: nuevaCese, accion, resumen, resultado: { facturasMovidas: movidas, descuadres },
        por: request.auth.uid, porEmail: request.auth.token?.email || null, at: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { hecho: true, resumen, resultado: { facturasMovidas: movidas, descuadres } };
});

