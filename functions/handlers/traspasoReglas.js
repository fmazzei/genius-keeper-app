// RUTA: functions/handlers/traspasoReglas.js
//
// DE QUIÉN ES UNA FACTURA cuando el cliente cambió de vendedor con FECHA DE CORTE
// ("Traspasar cartera", pedido del dueño, 3-nov-2026). Puro: lo usan la
// conciliación con Zoho (facturaSync), el webhook, la reasignación manual
// (backfillFacturasPorCustomerId), el traspaso y el vigilante.
//
// Cada traspaso deja en el carnet (`clientes_zoho`) un registro:
//   traspasos: [{ id, desde:'YYYY-MM-DD', deVendedorId, aVendedorId, facturasAlNuevo:[números] }]
// y el carnet pasa a `vendedorId = aVendedorId`. Regla:
//   · una factura con fecha ANTERIOR al corte sigue siendo del vendedor de antes
//     (con sus comisiones y sus cierres): el historial no se mueve;
//   · desde el corte, es del nuevo;
//   · `facturasAlNuevo`: facturas anteriores al corte que seguían abiertas y que,
//     por decisión del dueño, cobra el nuevo como cuentas recuperadas.
// Varios traspasos se encadenan: se recorren del más nuevo al más viejo.

const DIA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Día de calendario ('YYYY-MM-DD') de una fecha de factura. Zoho manda solo el
 * día y GK lo guarda a las 00:00 UTC: ese instante se lee como ese DÍA. Un
 * instante con hora real se lee en hora de Caracas (UTC−4).
 */
function diaCalendario(v) {
    if (!v) return null;
    if (typeof v === 'string') {
        const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) return m[1];
    }
    const d = v?.toDate ? v.toDate() : new Date(v);
    if (!d || isNaN(d.getTime())) return null;
    const utcMedianoche = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
    const x = utcMedianoche ? d : new Date(d.getTime() - 4 * 3600000);
    return x.toISOString().slice(0, 10);
}

const traspasosDe = (cliente) => (Array.isArray(cliente?.traspasos) ? cliente.traspasos : [])
    .filter(t => t && DIA_RE.test(String(t.desde || '')))
    .sort((a, b) => (a.desde < b.desde ? 1 : a.desde > b.desde ? -1 : 0));   // más nuevo primero

/**
 * Vendedor dueño de una factura de este carnet, según su fecha.
 * @param {object} cliente — doc de `clientes_zoho` ({vendedorId, esOficina, traspasos})
 * @param {*} fecha — fecha de la factura (Timestamp, Date o 'YYYY-MM-DD')
 * @param {string} [numero] — número de la factura (para `facturasAlNuevo`)
 * @returns {{vendedorId: string|null, porTraspaso: boolean, traspasoId: string|null}}
 */
function vendedorDelCarnetEnFecha(cliente, fecha, numero) {
    let dueno = cliente?.esOficina ? null : (cliente?.vendedorId || null);
    const ts = traspasosDe(cliente);
    const dia = diaCalendario(fecha);
    if (!ts.length || !dia) return { vendedorId: dueno, porTraspaso: false, traspasoId: null };
    let porTraspaso = false, traspasoId = null;
    for (const t of ts) {
        if (dia >= t.desde) break;
        // Anterior a este corte: abierta que el dueño decidió pasarle al nuevo → se queda donde va.
        if (numero && Array.isArray(t.facturasAlNuevo) && t.facturasAlNuevo.includes(String(numero))) break;
        dueno = t.deVendedorId || null;
        porTraspaso = true; traspasoId = t.id || null;
    }
    return { vendedorId: dueno, porTraspaso, traspasoId };
}

/** ¿El carnet tiene traspasos con fecha? */
const tieneTraspasos = (cliente) => traspasosDe(cliente).length > 0;

/**
 * Núcleo puro del traspaso: qué se mueve y qué se queda, para mostrarlo ANTES de
 * hacerlo y para aplicarlo.
 * @param {object} p
 * @param {string} p.deId, p.aId — vendedores A (sale) y B (entra)
 * @param {string} p.corte — 'YYYY-MM-DD': desde este día las facturas son de B
 * @param {boolean} p.abiertasAlNuevo — las facturas de A anteriores al corte que siguen abiertas las cobra B (recuperadas)
 * @param {Array} p.clientes — `clientes_zoho` ({customerId, customerName, vendedorId, esOficina, traspasos})
 * @param {Array} p.vendorClients — `vendor_clients` ({id, vendedorId, posId, chain, active, estado})
 * @param {Array} p.facturas — `facturas_vendedor` de los carnets de A ({id, numero, fecha, estado, vendedorId, zohoCustomerId, monto})
 * @param {string[]} [p.huerfanos] — vendedores sin perfil cuyas carteras activas se apagan (duplicados viejos)
 */
function planTraspaso({ deId, aId, corte, abiertasAlNuevo = false, clientes = [], vendorClients = [], facturas = [], huerfanos = [] }) {
    if (!deId || !aId || deId === aId) throw new Error('Elige dos vendedores distintos.');
    if (!DIA_RE.test(String(corte || ''))) throw new Error('La fecha de corte debe ser AAAA-MM-DD.');
    const carnets = clientes.filter(c => c.vendedorId === deId && c.esOficina !== true);
    const ids = new Set(carnets.map(c => String(c.customerId || c.id)));
    const activa = (vc) => vc && vc.active !== false && (!vc.estado || vc.estado === 'activo');
    const carteraA = vendorClients.filter(vc => vc.vendedorId === deId && activa(vc));
    const carteraB = vendorClients.filter(vc => vc.vendedorId === aId && activa(vc));
    const llave = (vc) => (vc.posId ? `pos:${vc.posId}` : vc.chain ? `chain:${vc.chain}` : null);
    const yaDeB = new Set(carteraB.map(llave).filter(Boolean));
    const carteraNueva = carteraA.filter(vc => llave(vc) && !yaDeB.has(llave(vc)));
    const duplicadosHuerfanos = vendorClients.filter(vc => huerfanos.includes(vc.vendedorId) && activa(vc));

    const delCarnet = facturas.filter(f => ids.has(String(f.zohoCustomerId)) && f.estado !== 'anulada');
    const antes = delCarnet.filter(f => { const d = diaCalendario(f.fecha); return d && d < corte; });
    const desde = delCarnet.filter(f => { const d = diaCalendario(f.fecha); return d && d >= corte; });
    const abiertasAntes = antes.filter(f => f.estado !== 'pagada');
    const alNuevo = abiertasAlNuevo ? abiertasAntes : [];
    const suma = (xs) => Math.round(xs.reduce((s, f) => s + (Number(f.monto) || 0), 0) * 100) / 100;
    return {
        deId, aId, corte, abiertasAlNuevo: !!abiertasAlNuevo,
        carnets: carnets.map(c => ({ customerId: String(c.customerId || c.id), nombre: c.customerName || String(c.customerId || c.id) })),
        carteraA: carteraA.map(vc => ({ id: vc.id, posId: vc.posId || null, chain: vc.chain || null, nombre: vc.posName || vc.chain || vc.posId || vc.id })),
        carteraNueva: carteraNueva.map(vc => ({ id: vc.id, posId: vc.posId || null, chain: vc.chain || null, nombre: vc.posName || vc.chain || vc.posId || vc.id })),
        duplicadosHuerfanos: duplicadosHuerfanos.map(vc => ({ id: vc.id, vendedorId: vc.vendedorId, nombre: vc.posName || vc.chain || vc.posId || vc.id })),
        facturasAntes: { n: antes.length, monto: suma(antes), quedanCon: deId },
        abiertasAntes: { n: abiertasAntes.length, monto: suma(abiertasAntes), numeros: abiertasAntes.map(f => f.numero) },
        facturasAlNuevo: alNuevo.map(f => String(f.numero)),
        facturasDesde: { n: desde.length, monto: suma(desde), numeros: desde.map(f => f.numero), deA: desde.filter(f => f.vendedorId !== aId).map(f => f.numero) },
    };
}

module.exports = { diaCalendario, vendedorDelCarnetEnFecha, tieneTraspasos, planTraspaso, traspasosDe };
