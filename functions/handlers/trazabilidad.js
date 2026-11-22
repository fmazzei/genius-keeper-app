// RUTA: functions/handlers/trazabilidad.js
//
// Buscador de trazabilidad (pedido del dueño, 22-nov-2026): con la fecha de
// vencimiento o el lote, devuelve la pista completa del producto. La arma
// `trazabilidadReglas.js` (puro); aquí solo se lee Firestore.
//
// Lo usan el máster y administración de GK, y el máster y administración de
// Kroma. Va por el servidor (Admin SDK) porque cruza las dos apps: la cuenta de
// planta no puede leer reportes de visita ni facturas, y la de administración
// no lee todo Kroma. Solo Lacteoca.
//
// Kroma entra con la cuenta compartida de producción: el perfil (máster o
// administración) lo manda la app y se verifica contra `kroma_users`.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const R = require('./trazabilidadReglas');

const ROLES_GK = ['master', 'administrador'];
const ROLES_CUENTA_KROMA = ['produccion', 'kroma_admin', 'kroma_gerencial', 'kroma_operario', 'kroma_owner'];
const PERFILES_KROMA = ['master', 'kroma_admin'];
const EMPRESA = 'lacteoca';
const MAX_LOTES = 6;

/** Timestamps → ISO, para que el módulo puro reciba datos planos. */
function plano(v) {
    if (v == null) return v;
    if (Array.isArray(v)) return v.map(plano);
    if (typeof v === 'object') {
        if (typeof v.toDate === 'function') return v.toDate().toISOString();
        if (v instanceof Date) return v.toISOString();
        const o = {};
        for (const [k, x] of Object.entries(v)) o[k] = plano(x);
        return o;
    }
    return v;
}
const docs = (snap) => snap.docs.map(d => ({ id: d.id, ...plano(d.data()) }));
const deEmpresa = (x) => (x.empresaId || EMPRESA) === EMPRESA;
const hoyCaracas = () => new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
const trozos = (arr, n = 30) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

async function verificarAcceso(db, auth, perfilId) {
    if (!auth?.uid) throw new HttpsError('unauthenticated', 'Inicia sesión.');
    const meta = await db.doc(`users_metadata/${auth.uid}`).get();
    const m = meta.exists ? meta.data() : {};
    if (ROLES_GK.includes(m.role)) return { quien: m.name || m.email || m.role, app: 'gk' };
    if (ROLES_CUENTA_KROMA.includes(m.role) && (m.empresaId || EMPRESA) === EMPRESA) {
        if (!perfilId) throw new HttpsError('permission-denied', 'La trazabilidad es solo para el máster y administración.');
        const perfil = await db.doc(`kroma_users/${perfilId}`).get();
        const p = perfil.exists ? perfil.data() : null;
        if (!p || p.active === false || !PERFILES_KROMA.includes(p.role) || (p.empresaId || EMPRESA) !== EMPRESA) {
            throw new HttpsError('permission-denied', 'La trazabilidad es solo para el máster y administración.');
        }
        return { quien: p.name || p.nombre || 'Kroma', app: 'kroma' };
    }
    throw new HttpsError('permission-denied', 'La trazabilidad es solo para el máster y administración.');
}

async function porLotes(db, coleccion, campo, lotes, select) {
    const out = [];
    for (const t of trozos(lotes)) {
        let q = db.collection(coleccion).where(campo, 'in', t);
        if (select) q = q.select(...select);
        out.push(...docs(await q.get()));
    }
    return out.filter(deEmpresa);
}

async function buscar(db, consulta) {
    // Para resolver la consulta: producciones, partidas y despachos completos
    // (son pocos), y lo de Caracas y el libro por la fecha.
    const [logsS, despS] = await Promise.all([
        db.collection('kroma_production_logs').where('empresaId', '==', EMPRESA).get(),
        db.collection('kroma_despachos').where('empresaId', '==', EMPRESA).get(),
    ]);
    const logs = docs(logsS), despachos = docs(despS);
    let partidas = [], comercial = [], libro = [];
    if (consulta.tipo === 'vencimiento') {
        const f = consulta.fecha;
        [partidas, comercial, libro] = await Promise.all([
            db.collection('kroma_inventory_pt').where('fechaVencimiento', '==', f).get().then(docs),
            db.collection('inventario_comercial').where('fechaVencimiento', '==', f).get().then(docs),
            db.collection('kroma_inv_libro').where('fechaVencimiento', '==', f).select('lote', 'logId', 'fechaVencimiento', 'empresaId').get().then(docs),
        ]);
    } else {
        // Un lote escrito completo puede no tener producción (ajustes de Caracas).
        [partidas, comercial] = await Promise.all([
            db.collection('kroma_inventory_pt').where('lote', '==', consulta.texto).get().then(docs),
            db.collection('inventario_comercial').where('lote', '==', consulta.texto).get().then(docs),
        ]);
    }
    const lotes = R.lotesDeConsulta(consulta, {
        logs: logs.filter(deEmpresa), partidas: partidas.filter(deEmpresa), comercial: comercial.filter(deEmpresa), despachos, libro: libro.filter(deEmpresa),
    });
    return { lotes, logs, despachos };
}

async function trazar(db, consulta) {
    const hoy = hoyCaracas();
    const { lotes, logs, despachos } = await buscar(db, consulta);
    const elegidos = lotes.slice(0, MAX_LOTES);
    const nombres = elegidos.map(l => l.lote);
    const logIds = elegidos.map(l => l.logId).filter(Boolean);

    // Lo de estos lotes, en una tanda.
    const recepcionIds = [...new Set(logs.filter(l => logIds.includes(l.id))
        .flatMap(l => [...(l.recepcionIds || []), ...(l.recepciones || []).map(r => r.recepcionId)]).filter(Boolean))];
    const despIds = despachos.filter(d => (d.lineas || []).some(x => nombres.includes(x.lote))).map(d => d.id);

    const vacio = Promise.resolve([]);
    const [partidas, libro, recepciones, actas, ventasS, visitasS, devS, posS] = await Promise.all([
        nombres.length ? porLotes(db, 'kroma_inventory_pt', 'lote', nombres) : vacio,
        nombres.length ? porLotes(db, 'kroma_inv_libro', 'lote', nombres) : vacio,
        Promise.all(recepcionIds.map(id => db.doc(`kroma_milk_reception/${id}`).get()))
            .then(ss => ss.filter(s => s.exists).map(s => ({ id: s.id, ...plano(s.data()) }))),
        Promise.all(despIds.map(id => db.doc(`recepciones_frimaca/${id}`).get()))
            .then(ss => ss.filter(s => s.exists).map(s => { const d = plano(s.data()); return { id: s.id, recibidoAt: d.recibidoAt, createdAt: d.createdAt, recibidoPor: d.recibidoPor, conNovedad: d.conNovedad }; })),
        nombres.length ? db.collection('kroma_ventas_planta').where('empresaId', '==', EMPRESA).get().then(docs) : vacio,
        nombres.length
            ? db.collection('visit_reports').select('posId', 'posName', 'batches', 'startTime', 'createdAt', 'userName').get().then(docs)
            : vacio,
        nombres.length ? db.collection('devoluciones').select('posId', 'posName', 'lotes', 'fecha', 'createdAt', 'resolucion', 'unidadesRepuestas', 'active', 'anulada').get().then(docs) : vacio,
        nombres.length ? db.collection('pos').select('name', 'zohoCustomerId').get().then(docs) : vacio,
    ]);

    const resultados = elegidos.map(l => R.trazarLote({
        lote: l.lote, logId: l.logId, consulta, logs, recepciones, partidas, despachos, actas, ventas: ventasS, libro,
        visitas: visitasS, devoluciones: devS, posList: posS, hoy,
    }));

    // Visto en anaquel con esa fecha, aunque no se encuentre el lote.
    let soloAnaquel = null;
    if (consulta.tipo === 'vencimiento' && !elegidos.length) {
        const visitas = await db.collection('visit_reports').select('posId', 'posName', 'batches', 'startTime', 'createdAt', 'userName').get().then(docs);
        const pos = await db.collection('pos').select('name').get().then(docs);
        soloAnaquel = R.enLaCalle([consulta.fecha], visitas, new Map(pos.map(p => [p.id, p])), hoy);
    }
    return { consulta, hoy, encontrados: lotes.length, lotes: lotes.map(l => l.lote), resultados, soloAnaquel, recortado: lotes.length > MAX_LOTES };
}

const trazabilidad = onCall({ region: 'us-central1', memory: '512MiB', timeoutSeconds: 120 }, async (req) => {
    const db = admin.firestore();
    const { q, perfilId } = req.data || {};
    await verificarAcceso(db, req.auth, perfilId);
    const consulta = R.resolverConsulta(q);
    if (!consulta) throw new HttpsError('invalid-argument', 'Escribe una fecha de vencimiento (23/11/26) o un lote (LCO20260715-H).');
    try {
        return await trazar(db, consulta);
    } catch (e) {
        if (e instanceof HttpsError) throw e;
        console.error('trazabilidad', e);
        throw new HttpsError('internal', `No se pudo armar la pista: ${e.message}`);
    }
});

module.exports = { trazabilidad, _internos: { trazar, verificarAcceso, plano } };
