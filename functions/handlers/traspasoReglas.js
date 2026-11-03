// RUTA: functions/handlers/traspasoReglas.js
//
// DE QUIÉN ES UNA FACTURA cuando el cliente cambió de vendedor con FECHA DE CORTE
// ("Traspasar cartera", pedido del dueño, 3-nov-2026). Puro: lo usan la
// conciliación con Zoho (facturaSync), el webhook, la reasignación manual
// (backfillFacturasPorCustomerId), el traspaso y el vigilante.
//
// Cada traspaso deja en el carnet (`clientes_zoho`) un registro:
//   traspasos: [{ id, desde:'YYYY-MM-DD', deVendedorId, aVendedorId, ceseDe:'YYYY-MM-DD'|null }]
// y el carnet pasa a `vendedorId = aVendedorId`. Regla (decisión del dueño, 3-nov):
//   · una factura con fecha ANTERIOR al corte sigue siendo del vendedor de antes
//     (con sus comisiones y sus cierres): el historial no se mueve;
//   · desde el corte, es del nuevo;
//   · CESE: cuando el vendedor de antes deja la empresa (`users_metadata.fechaCese`,
//     copiada al traspaso como `ceseDe`), sus comisiones quedan congeladas hasta
//     esa fecha y TODAS sus facturas que seguían abiertas ese día pasan al nuevo
//     (las cobra como cuentas recuperadas, a su tasa de recuperadas). Las que se
//     cobraron antes del cese siguen siendo suyas.
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
 * Vendedor dueño de una factura de este carnet, según su fecha (y, si el vendedor
 * de antes cesó, según si ya estaba cobrada el día del cese).
 * @param {object} cliente — doc de `clientes_zoho` ({vendedorId, esOficina, traspasos})
 * @param {*} fecha — fecha de la factura (Timestamp, Date o 'YYYY-MM-DD')
 * @param {string} [numero] — número de la factura (no se usa; se conserva la firma)
 * @param {*} [fechaPago] — fecha de cobro SI la factura está pagada (si no, null)
 * @returns {{vendedorId: string|null, porTraspaso: boolean, traspasoId: string|null, heredada: boolean}}
 */
function vendedorDelCarnetEnFecha(cliente, fecha, numero, fechaPago = null) {
    let dueno = cliente?.esOficina ? null : (cliente?.vendedorId || null);
    const ts = traspasosDe(cliente);
    const dia = diaCalendario(fecha);
    if (!ts.length || !dia) return { vendedorId: dueno, porTraspaso: false, traspasoId: null, heredada: false };
    const diaPago = diaCalendario(fechaPago);
    let porTraspaso = false, traspasoId = null, heredada = false;
    for (const t of ts) {
        if (dia >= t.desde) break;
        // El vendedor de antes cesó y la factura seguía abierta ese día: la hereda el nuevo.
        if (DIA_RE.test(String(t.ceseDe || '')) && !(diaPago && diaPago < t.ceseDe)) { heredada = true; traspasoId = t.id || null; break; }
        dueno = t.deVendedorId || null;
        porTraspaso = true; traspasoId = t.id || null;
    }
    return { vendedorId: dueno, porTraspaso, traspasoId, heredada };
}

/** ¿El carnet tiene traspasos con fecha? */
const tieneTraspasos = (cliente) => traspasosDe(cliente).length > 0;

/** Clave de un registro de cartera: el PDV o la cadena. */
const llaveCartera = (vc) => (vc?.posId ? `pos:${vc.posId}` : vc?.chain ? `chain:${vc.chain}` : null);
const carteraActiva = (vc) => !!vc && vc.active !== false && (!vc.estado || vc.estado === 'activo');

/**
 * Duplicados en las carteras: el mismo PDV (o cadena) activo en dos o más
 * carteras. El sistema no los permite: se muestran y se pide resolverlos.
 * @returns {Array<{llave, nombre, registros:[{id, vendedorId}]}>}
 */
function duplicadosCartera(vendorClients = []) {
    const por = new Map();
    vendorClients.filter(carteraActiva).forEach(vc => {
        const k = llaveCartera(vc);
        if (!k) return;
        if (!por.has(k)) por.set(k, []);
        por.get(k).push(vc);
    });
    const out = [];
    por.forEach((regs, k) => {
        const vendedores = new Set(regs.map(r => r.vendedorId));
        if (vendedores.size < 2) return;
        out.push({ llave: k, nombre: regs[0].clientName || regs[0].chain || regs[0].posId || k, registros: regs.map(r => ({ id: r.id, vendedorId: r.vendedorId })) });
    });
    return out.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
}

/**
 * Núcleo puro del traspaso: qué se mueve y qué se queda, para mostrarlo ANTES de
 * hacerlo y para aplicarlo.
 * @param {object} p
 * @param {string} p.deId, p.aId — vendedores A (entrega) y B (recibe)
 * @param {string} p.corte — 'YYYY-MM-DD': desde este día las facturas son de B
 * @param {string|null} p.ceseDe — fecha de cese de A (si ya cesó): sus abiertas ese día pasan a B
 * @param {'todo'|string[]} p.seleccion — toda la cartera, o los ids de `vendor_clients` de A a pasar
 * @param {Object<string,string>} p.decisiones — duplicados: llave → vendedorId que se queda con ese cliente
 * @param {Array} p.clientes — `clientes_zoho` de A ({customerId, customerName, vendedorId, esOficina})
 * @param {Array} p.vendorClients — TODA `vendor_clients`
 * @param {Array} p.pos — `pos` ({id, chain, zohoCustomerId}) para saber el carnet de cada PDV
 * @param {Array} p.facturas — facturas de los carnets de A
 * @param {string[]} [p.huerfanos] — vendedores sin perfil (sus carteras activas se apagan)
 */
function planTraspaso({ deId, aId, corte, ceseDe = null, seleccion = 'todo', decisiones = {}, clientes = [], vendorClients = [], pos = [], facturas = [], huerfanos = [] }) {
    if (!deId || !aId || deId === aId) throw new Error('Elige dos vendedores distintos.');
    if (!DIA_RE.test(String(corte || ''))) throw new Error('La fecha de corte debe ser AAAA-MM-DD.');
    const todo = seleccion === 'todo' || !Array.isArray(seleccion);
    const carteraA = vendorClients.filter(vc => vc.vendedorId === deId && carteraActiva(vc));
    const elegidos = todo ? carteraA : carteraA.filter(vc => seleccion.includes(vc.id));

    // Duplicados: un cliente elegido que ya está activo en OTRA cartera (de B o de
    // un tercero). Cada uno necesita una decisión: con quién se queda.
    const otrosPorLlave = new Map();
    vendorClients.filter(vc => carteraActiva(vc) && vc.vendedorId !== deId && !huerfanos.includes(vc.vendedorId)).forEach(vc => {
        const k = llaveCartera(vc); if (!k) return;
        if (!otrosPorLlave.has(k)) otrosPorLlave.set(k, []);
        otrosPorLlave.get(k).push(vc);
    });
    const duplicados = [];
    elegidos.forEach(vc => {
        const k = llaveCartera(vc);
        const otros = k ? (otrosPorLlave.get(k) || []) : [];
        if (!otros.length) return;
        const opciones = [...new Set([aId, deId, ...otros.map(o => o.vendedorId)])];
        duplicados.push({ llave: k, nombre: vc.clientName || vc.chain || vc.posId, registroA: vc.id, otros: otros.map(o => ({ id: o.id, vendedorId: o.vendedorId })), opciones, decision: decisiones[k] || null });
    });
    const sinDecidir = duplicados.filter(d => !d.decision || !d.opciones.includes(d.decision));

    // Lo que pasa a B: los elegidos (salvo los duplicados que se quedan con otro).
    const quedaCon = (vc) => { const d = duplicados.find(x => x.registroA === vc.id); return d ? d.decision : aId; };
    const pasan = elegidos.filter(vc => quedaCon(vc) === aId);
    const llavesB = new Set(vendorClients.filter(vc => vc.vendedorId === aId && carteraActiva(vc)).map(llaveCartera).filter(Boolean));
    const carteraNueva = pasan.filter(vc => llaveCartera(vc) && !llavesB.has(llaveCartera(vc)));
    // Registros a apagar: los de A que pasan o que se quedan con un tercero, y las
    // copias de otros vendedores en los duplicados que se quedan con B o con A.
    const apagarA = elegidos.filter(vc => quedaCon(vc) !== deId);
    const apagarOtros = [];
    duplicados.forEach(d => d.otros.forEach(o => { if (o.vendedorId !== d.decision) apagarOtros.push(o.id); }));

    // Carnets: toda la cartera = todos los de A; algunos clientes = los de los PDV
    // que pasan (por su carnet, o por las sucursales de la cadena).
    const carnetsA = clientes.filter(c => c.vendedorId === deId && c.esOficina !== true);
    const carnetsDe = (lista) => {
        const ids = new Set();
        lista.forEach(vc => {
            pos.forEach(p => {
                if (!p.zohoCustomerId) return;
                if ((vc.posId && p.id === vc.posId) || (vc.chain && vc.tipoDespacho === 'centralizado' && p.chain === vc.chain)) ids.add(String(p.zohoCustomerId));
            });
        });
        return ids;
    };
    // Toda la cartera: todos los carnets de A, menos los de los clientes que por
    // decisión se quedan con otro. Algunos clientes: solo los de los que pasan.
    const noPasan = carnetsDe(elegidos.filter(vc => quedaCon(vc) !== aId));
    const siPasan = carnetsDe(pasan);
    const carnets = todo
        ? carnetsA.filter(c => !noPasan.has(String(c.customerId || c.id)) || siPasan.has(String(c.customerId || c.id)))
        : carnetsA.filter(c => siPasan.has(String(c.customerId || c.id)));
    const ids = new Set(carnets.map(c => String(c.customerId || c.id)));
    const duplicadosHuerfanos = vendorClients.filter(vc => huerfanos.includes(vc.vendedorId) && carteraActiva(vc));

    const delCarnet = facturas.filter(f => ids.has(String(f.zohoCustomerId)) && f.estado !== 'anulada');
    const antes = delCarnet.filter(f => { const d = diaCalendario(f.fecha); return d && d < corte; });
    const desde = delCarnet.filter(f => { const d = diaCalendario(f.fecha); return d && d >= corte; });
    const cesado = DIA_RE.test(String(ceseDe || ''));
    // Abiertas el día del cese (o hoy, si A no ha cesado): las hereda B si A cesó.
    const abiertasAlCese = antes.filter(f => {
        if (f.estado !== 'pagada') return true;
        const dp = diaCalendario(f.fechaPago);
        return cesado ? !(dp && dp < ceseDe) : false;
    });
    const suma = (xs) => Math.round(xs.reduce((s, f) => s + (Number(f.balance ?? f.monto) || 0), 0) * 100) / 100;
    const sumaMonto = (xs) => Math.round(xs.reduce((s, f) => s + (Number(f.monto) || 0), 0) * 100) / 100;
    const nombreVc = (vc) => vc.clientName || vc.chain || vc.posId || vc.id;
    return {
        deId, aId, corte, ceseDe: cesado ? ceseDe : null, todo,
        carnets: carnets.map(c => ({ customerId: String(c.customerId || c.id), nombre: c.customerName || String(c.customerId || c.id) })),
        carteraA: carteraA.map(vc => ({ id: vc.id, nombre: nombreVc(vc), posId: vc.posId || null, chain: vc.chain || null })),
        pasan: pasan.map(vc => ({ id: vc.id, nombre: nombreVc(vc) })),
        carteraNueva: carteraNueva.map(vc => ({ id: vc.id, nombre: nombreVc(vc) })),
        apagarA: apagarA.map(vc => vc.id), apagarOtros,
        duplicados, sinDecidir: sinDecidir.map(d => d.llave),
        duplicadosHuerfanos: duplicadosHuerfanos.map(vc => ({ id: vc.id, vendedorId: vc.vendedorId, nombre: nombreVc(vc) })),
        facturasAntes: { n: antes.length, monto: sumaMonto(antes) },
        abiertas: { n: abiertasAlCese.length, saldo: suma(abiertasAlCese), numeros: abiertasAlCese.map(f => f.numero), pasanAlNuevo: cesado },
        facturasDesde: { n: desde.length, monto: sumaMonto(desde), numeros: desde.map(f => f.numero) },
    };
}

module.exports = { diaCalendario, vendedorDelCarnetEnFecha, tieneTraspasos, planTraspaso, traspasosDe, duplicadosCartera, llaveCartera, carteraActiva };
