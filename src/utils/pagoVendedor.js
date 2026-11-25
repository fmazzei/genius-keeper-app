// RUTA: src/utils/pagoVendedor.js — UN monto, el sistema lo reparte (25-nov-2026).
//
// Pedido del dueño: «si la administradora introduce el monto correcto, el
// sistema tiene que hacer todo solo». La administradora escribe lo que
// transfirió; aquí se reconoce qué es ese monto y se reparte entre los meses:
//
//   · las comisiones que se deben, descontando lo pagado de más en meses
//     anteriores (neto) o sin descontarlo (bruto);
//   · el fijo de los meses cerrados que falta;
//   · las dos cosas juntas.
//
// Si el monto no coincide con ninguna de esas cuentas, es un abono: se aplica
// primero a las comisiones más viejas. Si pasa de todo lo que se debe, no se
// registra. Nada se pregunta.

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const TOL = 0.011;

/** Lo que se le debe a un vendedor, con el detalle por mes. */
export function deudaPorMes(estados = []) {
    const ord = [...estados].sort((a, b) => (a.mes || 0) - (b.mes || 0));
    const com = ord.filter(e => (e.saldoComision || 0) > 0.005)
        .map(e => ({ periodKey: e.periodKey, mes: e.mes, rango: e.rango, saldo: r2(e.saldoComision) }));
    const aFavor = r2(ord.filter(e => e.cerrado && (e.saldoComision || 0) < -0.005)
        .reduce((s, e) => s - e.saldoComision, 0));
    const fijo = ord.filter(e => e.cerrado && (e.saldoFijo || 0) > 0.005)
        .map(e => ({ periodKey: e.periodKey, mes: e.mes, rango: e.rango, saldo: r2(e.saldoFijo), base: r2(e.base) }));
    const comBruto = r2(com.reduce((s, x) => s + x.saldo, 0));
    const comNeto = r2(Math.max(0, comBruto - aFavor));
    const fijoTotal = r2(fijo.reduce((s, x) => s + x.saldo, 0));
    return { com, aFavor, fijo, comBruto, comNeto, fijoTotal, total: r2(comNeto + fijoTotal) };
}

// Reparte `monto` entre los meses de la lista, el más viejo primero.
function aplicar(lista, monto) {
    let resta = r2(monto);
    const out = [];
    for (const x of lista) {
        if (resta <= 0.005) break;
        const m = r2(Math.min(x.saldo, resta));
        if (m > 0.005) out.push({ ...x, monto: m });
        resta = r2(resta - m);
    }
    return { lineas: out, sobra: resta };
}

// Las comisiones con lo pagado de más ya descontado (de los meses más viejos).
function comisionesNetas(d) {
    let credito = d.aFavor;
    return d.com.map(x => {
        const usa = Math.min(credito, x.saldo);
        credito = r2(credito - usa);
        return { ...x, saldo: r2(x.saldo - usa) };
    }).filter(x => x.saldo > 0.005);
}

/**
 * @param {Array} estados  filas de computeEstadosDeCuenta del vendedor
 * @param {number} monto   lo que se transfirió
 * @param {{baseMes?: number}} opts  fijo mensual (para decir quincena o mes)
 * @returns {{ok, tipo, titulo, explicacion, lineas, total, deuda, error?}}
 */
export function repartirPago(estados = [], monto, { baseMes = 0 } = {}) {
    const d = deudaPorMes(estados);
    const m = r2(monto);
    const fail = (error) => ({ ok: false, error, deuda: d, lineas: [], total: 0 });
    if (!(m > 0)) return fail('Escribe el monto que se transfirió.');
    if (d.comBruto <= 0.005 && d.fijoTotal <= 0.005) return fail('No se le debe nada: no hay comisiones ni fijo pendientes.');

    const fijoTipo = (x) => (baseMes > 0 && x.monto <= baseMes / 2 + 0.005) ? 'quincena' : 'mes';
    const lineasCom = (lista) => lista.map(x => ({ periodKey: x.periodKey, mes: x.mes, rango: x.rango, concepto: 'comision', monto: x.monto ?? x.saldo }));
    const lineasFijo = (lista) => lista.map(x => {
        const l = { periodKey: x.periodKey, mes: x.mes, rango: x.rango, concepto: 'fijo', monto: x.monto ?? x.saldo };
        return { ...l, fijoTipo: fijoTipo(l) };
    });
    const neto = comisionesNetas(d);
    const desc = d.aFavor > 0.005 ? ` (se descuentan ${d.aFavor.toFixed(2).replace('.', ',')} pagados de más antes)` : '';

    const casos = [
        { tipo: 'comisiones', total: d.comNeto, lineas: () => lineasCom(neto), titulo: 'Todas las comisiones que se le deben', explicacion: `Comisiones de todos los meses${desc}.` },
        { tipo: 'todo', total: r2(d.comNeto + d.fijoTotal), lineas: () => [...lineasFijo(d.fijo), ...lineasCom(neto)], titulo: 'Todo lo que se le debe', explicacion: `Fijo pendiente y comisiones de todos los meses${desc}.` },
        { tipo: 'fijo', total: d.fijoTotal, lineas: () => lineasFijo(d.fijo), titulo: 'El fijo que se le debe', explicacion: 'El fijo pendiente de los meses cerrados.' },
        { tipo: 'comisiones_bruto', total: d.comBruto, lineas: () => lineasCom(d.com), titulo: 'Todas las comisiones, sin descontar lo pagado de más', explicacion: `Quedan ${d.aFavor.toFixed(2).replace('.', ',')} pagados de más sin descontar.` },
        { tipo: 'todo_bruto', total: r2(d.comBruto + d.fijoTotal), lineas: () => [...lineasFijo(d.fijo), ...lineasCom(d.com)], titulo: 'Todo, sin descontar lo pagado de más', explicacion: `Quedan ${d.aFavor.toFixed(2).replace('.', ',')} pagados de más sin descontar.` },
    ].filter(c => c.total > 0.005 && (c.tipo.endsWith('bruto') ? d.aFavor > 0.005 : true));

    const exacto = casos.find(c => Math.abs(c.total - m) <= TOL);
    if (exacto) {
        return { ok: true, tipo: exacto.tipo, titulo: exacto.titulo, explicacion: exacto.explicacion, lineas: exacto.lineas(), total: m, deuda: d };
    }

    const maximo = Math.max(d.comBruto + d.fijoTotal, d.total);
    if (m > maximo + TOL) {
        return fail(`Es más de lo que se le debe: el total es ${d.total.toFixed(2).replace('.', ',')} (comisiones ${d.comNeto.toFixed(2).replace('.', ',')} + fijo ${d.fijoTotal.toFixed(2).replace('.', ',')}). Revisa el monto.`);
    }

    // Abono: primero comisiones (las más viejas), después el fijo.
    const a = aplicar(neto, m);
    const b = aplicar(d.fijo, a.sobra);
    if (b.sobra > TOL) {
        return fail(`No cuadra con lo que se le debe: sobran ${b.sobra.toFixed(2).replace('.', ',')}. Revisa el monto.`);
    }
    const lineas = [...lineasCom(a.lineas), ...lineasFijo(b.lineas)];
    const queda = r2(d.total - m);
    return {
        ok: true, tipo: 'abono', titulo: 'Abono',
        explicacion: `Se aplica a lo más viejo primero. Después de este pago quedan ${queda.toFixed(2).replace('.', ',')} por pagar.`,
        lineas, total: m, deuda: d,
    };
}
