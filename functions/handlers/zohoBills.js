// RUTA: functions/handlers/zohoBills.js
//
// CUENTAS POR PAGAR — facturas de proveedor ("bills") de Zoho Books.
//
// GK ya sabía lo que la empresa COBRA (`facturas_vendedor`) pero no lo que
// DEBE, y el gerente necesita las dos mitades para leer la caja. Esto baja los
// bills de Zoho a `cuentas_por_pagar/{numero}` con el mismo criterio que la
// cartera por cobrar: el saldo real (`balance`), el estatus de Zoho, y las que
// Zoho ya no reconoce se marcan en vez de borrarse.
//
// ⚠️ Requiere el scope `ZohoBooks.bills.READ` en el Self Client. El token que
// hay hoy solo tiene `invoices`+`settings`, así que hasta que el dueño lo
// regenere esto devuelve `autorizado:false` con el paso a seguir — NO se
// inventa un cero, que sería peor que no mostrar nada.

const admin = require("firebase-admin");
const { listAllBills, listVendorBalances, listRecurringBills } = require('./zohoApi');

// Estatus de Zoho que cuentan como deuda abierta. Lo demás (draft, void, paid…)
// no se paga.
const ESTATUS_ABIERTOS = ['open', 'overdue', 'partially_paid'];
const CATEGORIAS = ['nomina', 'destajo', 'proveedor'];

const toDate = (v) => {
    if (!v) return null;
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
};
const ts = (d) => d ? admin.firestore.Timestamp.fromDate(d) : null;

/**
 * Sincroniza las cuentas por pagar desde Zoho Books.
 * @returns {Promise<{autorizado:boolean, motivo?:string, total?:number,
 *   escritas?:number, ausentes?:number, porPagar?:number, vencidas?:number}>}
 */
async function sincronizarCuentasPorPagar({ accessToken, organizationId, dataCenter }) {
    let bills, complete;
    const diag = { intentos: [] };
    try {
        ({ bills, complete } = await listAllBills({ accessToken, organizationId, dataCenter }));
        diag.intentos.push({ filtro: 'ninguno', listadas: bills.length });
        // Si el listado sin filtro llega vacío, se reintenta pidiendo
        // explícitamente todos los estatus. Un fallo aquí no tumba nada.
        if (bills.length === 0) {
            try {
                const r = await listAllBills({ accessToken, organizationId, dataCenter, filterBy: 'Status.All' });
                diag.intentos.push({ filtro: 'Status.All', listadas: r.bills.length });
                if (r.bills.length > 0) ({ bills, complete } = r);
            } catch (e2) {
                diag.intentos.push({ filtro: 'Status.All', error: String(e2?.response?.data?.message || e2.message).slice(0, 160) });
            }
        }
    } catch (e) {
        const status = e?.response?.status;
        const msg = e?.response?.data?.message || e.message;
        // 401 = el token no tiene el scope de bills. Es lo esperado hasta que se
        // regenere el Self Client; se declara, no se trata como fallo genérico.
        if (status === 401 || e?.zohoCode === 57 || /scope|unauthor|not authorized/i.test(String(msg))) {
            return {
                autorizado: false,
                motivo: `Zoho no deja leer las facturas de proveedor (${String(msg).slice(0, 160)}). `
                      + 'Revisa que el código se haya generado con ZohoBooks.bills.READ y que el usuario de Zoho que lo generó tenga acceso a Compras.',
            };
        }
        return { autorizado: false, motivo: `Zoho: ${msg}` };
    }

    const db = admin.firestore();
    const hoy = new Date();
    diag.porEstado = {};
    bills.forEach(b => { const k = String(b.status || 'sin_estatus'); diag.porEstado[k] = (diag.porEstado[k] || 0) + 1; });
    diag.muestra = bills.slice(0, 5).map(b => ({
        numero: b.bill_number || b.bill_id || null, estatus: b.status || null,
        saldo: b.balance != null ? Number(b.balance) : null, proveedor: b.vendor_name || null,
    }));
    // Control cruzado: lo que cada ficha de proveedor de Zoho dice que se le debe.
    let proveedores = null;
    try { proveedores = await listVendorBalances({ accessToken, organizationId, dataCenter }); }
    catch (e) { diag.proveedoresError = String(e?.response?.data?.message || e.message).slice(0, 160); }
    // Categoría de cada factura: la de la ficha de su proveedor (por vendor_id).
    const catPorVendor = new Map();
    (proveedores || []).forEach(v => { if (v.vendorId) catPorVendor.set(v.vendorId, v.categoria); });
    const categoriaDe = (b) => catPorVendor.get(b.vendor_id != null ? String(b.vendor_id) : '') || 'proveedor';
    const porCategoria = Object.fromEntries(CATEGORIAS.map(c => [c, { total: 0, facturas: 0, vencido: 0 }]));

    // Control: lo que Zoho devuelve con su propio filtro de "sin pagar" tiene
    // que coincidir con lo que GK considera abierto. Solo diagnóstico.
    try {
        const r = await listAllBills({ accessToken, organizationId, dataCenter, filterBy: 'Status.Unpaid' });
        diag.unpaid = { listadas: r.bills.length, saldo: Math.round(r.bills.reduce((s2, b) => s2 + (Number(b.balance) || 0), 0) * 100) / 100 };
    } catch (e) {
        diag.unpaid = { error: String(e?.response?.data?.message || e.message).slice(0, 160) };
    }

    const seen = new Set();
    let escritas = 0, porPagar = 0, vencidas = 0, nAbiertas = 0;

    for (let i = 0; i < bills.length; i += 400) {
        const chunk = bills.slice(i, i + 400);
        const batch = db.batch();
        for (const b of chunk) {
            const numero = String(b.bill_number || b.reference_number || b.bill_id || '').trim();
            if (!numero) continue;
            seen.add(numero);

            const estado = b.status === 'paid' ? 'pagada'
                : b.status === 'void' ? 'anulada'
                : b.status === 'draft' ? 'borrador'
                : b.status === 'overdue' ? 'vencida'
                : 'pendiente';
            const venc  = toDate(b.due_date);
            const saldo = b.balance != null ? Number(b.balance) : (Number(b.total) || 0);
            const abierta = ESTATUS_ABIERTOS.includes(String(b.status || '')) && saldo > 0.005;
            const categoria = categoriaDe(b);
            if (abierta) {
                nAbiertas++;
                porPagar += saldo;
                const pc = porCategoria[categoria];
                pc.total += saldo; pc.facturas++;
                if (venc && venc < hoy) { vencidas += saldo; pc.vencido += saldo; }
            }

            batch.set(db.doc(`cuentas_por_pagar/${numero.replace(/\//g, '-')}`), {
                numero,
                zohoBillId:   b.bill_id != null ? String(b.bill_id) : null,
                proveedor:    b.vendor_name || '—',
                zohoVendorId: b.vendor_id != null ? String(b.vendor_id) : null,
                monto:   Number(b.total) || 0,
                balance: saldo,
                fecha:       ts(toDate(b.date)),
                vencimiento: ts(venc),
                estado,
                estatusZoho: b.status || null,
                abierta,
                categoria,
                ausenteEnZoho: false,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            escritas++;
        }
        await batch.commit();
    }

    // Las que ya no están en Zoho: se MARCAN, nunca se borran (mismo criterio
    // que la cartera por cobrar). Solo si el barrido fue completo.
    let ausentes = 0;
    if (complete) {
        const snap = await db.collection('cuentas_por_pagar').get();
        const updates = [];
        snap.docs.forEach(d => {
            const f = d.data();
            const num = String(f.numero || '').trim();
            if (!num) return;
            const falta = !seen.has(num);
            if (falta && f.ausenteEnZoho !== true) { updates.push({ ref: d.ref, data: { ausenteEnZoho: true } }); ausentes++; }
            else if (!falta && f.ausenteEnZoho === true) updates.push({ ref: d.ref, data: { ausenteEnZoho: false } });
        });
        for (let i = 0; i < updates.length; i += 400) {
            const batch = db.batch();
            updates.slice(i, i + 400).forEach(u => batch.update(u.ref, u.data));
            await batch.commit();
        }
    }

    const saldoProveedores = proveedores ? proveedores.reduce((s, v) => s + v.porPagar, 0) : null;
    const r2c = (n) => Math.round(n * 100) / 100;
    CATEGORIAS.forEach(c => { porCategoria[c].total = r2c(porCategoria[c].total); porCategoria[c].vencido = r2c(porCategoria[c].vencido); });

    // PRÓXIMA NÓMINA: perfiles de facturas recurrentes ACTIVOS. La próxima
    // quincena = los perfiles con la fecha siguiente más cercana, sumados.
    // Si el token no alcanza para leerlos, se dice; no se inventa una fecha.
    let proximaNomina;
    try {
        const perfiles = await listRecurringBills({ accessToken, organizationId, dataCenter });
        const activos = perfiles.filter(p => String(p.status || '').toLowerCase() === 'active');
        const proxDe = (p) => toDate(p.next_bill_date || p.next_invoice_date || p.next_date || null);
        const conFecha = activos.map(p => ({ p, f: proxDe(p) })).filter(x => x.f);
        const minMs = conFecha.length ? Math.min(...conFecha.map(x => x.f.getTime())) : null;
        const siguientes = minMs == null ? [] : conFecha.filter(x => x.f.getTime() === minMs);
        proximaNomina = {
            autorizado: true,
            perfilesActivos: activos.length,
            fecha: minMs != null ? ts(new Date(minMs)) : null,
            monto: r2c(siguientes.reduce((s2, x) => s2 + (Number(x.p.total) || 0), 0)),
            perfiles: siguientes.map(x => ({ proveedor: x.p.vendor_name || '—', monto: Number(x.p.total) || 0 })),
            // Para verificar los nombres de campo contra la respuesta real.
            clavesMuestra: perfiles[0] ? Object.keys(perfiles[0]).slice(0, 40) : [],
        };
    } catch (e) {
        proximaNomina = {
            autorizado: false,
            motivo: String(e?.response?.data?.message || e.message).slice(0, 200),
            status: e?.response?.status || null,
        };
    }

    // CONTROL CRUZADO: lo abierto en facturas de proveedor, por proveedor,
    // contra el neto de su ficha (por pagar − créditos sin aplicar). Si no
    // cuadran, alguien registró deuda por un asiento manual en vez de factura.
    let cruce = null;
    if (proveedores) {
        const porVendor = new Map();
        const llave = (id, nombre) => id || `n:${String(nombre || '').trim().toLowerCase()}`;
        bills.forEach(b => {
            if (!ESTATUS_ABIERTOS.includes(String(b.status || ''))) return;
            const saldo = b.balance != null ? Number(b.balance) : 0;
            if (!(saldo > 0.005)) return;
            const k = llave(b.vendor_id != null ? String(b.vendor_id) : null, b.vendor_name);
            const e = porVendor.get(k) || { nombre: b.vendor_name || '—', facturas: 0, ficha: 0 };
            e.facturas += saldo; porVendor.set(k, e);
        });
        proveedores.forEach(v => {
            const k = llave(v.vendorId, v.nombre);
            const e = porVendor.get(k) || { nombre: v.nombre, facturas: 0, ficha: 0 };
            if (!(v.porPagar > 0.005 || v.creditos > 0.005)) return;
            e.ficha += Math.max(0, v.porPagar - v.creditos); porVendor.set(k, e);
        });
        const filas = [...porVendor.values()];
        const r2 = (n) => Math.round(n * 100) / 100;
        const totalFacturas = r2(filas.reduce((s, f) => s + f.facturas, 0));
        const totalFichas = r2(filas.reduce((s, f) => s + f.ficha, 0));
        cruce = {
            totalFacturas, totalFichas, diferencia: r2(totalFichas - totalFacturas),
            porProveedor: filas
                .map(f => ({ nombre: f.nombre, facturas: r2(f.facturas), ficha: r2(f.ficha), dif: r2(f.ficha - f.facturas) }))
                .filter(f => Math.abs(f.dif) > 0.005)
                .slice(0, 40),
        };
    }
    await db.doc('settings/appConfig').set({
        zohoPorPagar: {
            total: porPagar, facturas: nAbiertas, vencido: vencidas, porCategoria,
            actualizado: admin.firestore.FieldValue.serverTimestamp(),
        },
        zohoCrucePorPagar: cruce ? { ...cruce, at: admin.firestore.FieldValue.serverTimestamp() } : null,
        zohoProximaNomina: { ...proximaNomina, at: admin.firestore.FieldValue.serverTimestamp() },
        zohoSaldoProveedores: proveedores ? {
            total: saldoProveedores,
            creditos: proveedores.reduce((s, v) => s + v.creditos, 0),
            proveedores: proveedores.filter(v => v.porPagar > 0.005 || v.creditos > 0.005)
                .sort((a, b) => b.porPagar - a.porPagar).slice(0, 60),
            at: admin.firestore.FieldValue.serverTimestamp(),
        } : null,
    }, { merge: true });

    return { autorizado: true, total: bills.length, escritas, ausentes, porPagar, vencidas, nAbiertas, porCategoria, saldoProveedores, proximaNomina, diag };
}

module.exports = { sincronizarCuentasPorPagar };
