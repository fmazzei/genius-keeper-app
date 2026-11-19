// RUTA: src/utils/enLaMano.js
//
// ¿CON CUÁNTO QUEDÓ EL MERCADERISTA EN LA MANO? (pedido del dueño, 19-nov)
//
// El mercaderista retira de Frimaca (ACC), le avisa a administración y se factura
// a los clientes; muchas veces no le da tiempo de entregar todo y queda para el
// día siguiente. Este cálculo cruza tres fuentes que GK ya tiene:
//
//   1. Lo RETIRADO de ACC: pickings, y los descuentos que administración anotó
//      a mano como retiro del mercaderista («picking …» / «… a mercaderista»).
//   2. Lo ENTREGADO según sus visitas: lo que entró al anaquel (`orderQuantity`)
//      más lo que repuso en el acto al retirar producto.
//   3. Lo FACTURADO en Zoho (`facturas_vendedor`), sin anuladas ni fantasmas y
//      sin las que no salen de Caracas (despachos a otra ciudad, ventas en
//      planta: `excluidas`).
//
// Da dos cifras:
//   · En la mano según sus visitas = retirado − entregado − repuesto + lo que
//     retiró de un anaquel para ponerlo en otro. Es lo que DEBERÍA tener.
//   · Sin facturar = retirado − facturado. La diferencia entre las dos son las
//     ENTREGAS POR FACTURAR, que se listan por punto de venta.
//
// Primera prueba con datos reales (19-nov): retirado 248, entregado 246,
// facturado 156 → 2 en la mano (lo que el mercaderista confirmó) y 90 entregadas
// el 18-nov sin factura.
//
// Lo retirado de un anaquel como DEVOLUCIÓN (para el camión a Barinas) no es
// vendible: va aparte, en «devoluciones por entregar al camión».

import { horaVisitaMs } from './visitaOla1.js';
import { fechaCalendario } from './vendedorMeta.js';

const TZ_MS = 4 * 3600 * 1000; // Caracas, UTC−4 sin horario de verano

/** Día de Caracas 'YYYY-MM-DD' de un instante (ms). */
export const diaCaracas = (ms) => (Number.isFinite(ms) && ms > 0 ? new Date(ms - TZ_MS).toISOString().slice(0, 10) : null);

const aMs = (v) => {
    if (!v) return NaN;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return Date.parse(v);
    if (v.toDate) return v.toDate().getTime();
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    return v instanceof Date ? v.getTime() : NaN;
};

const diaLocal = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null);

/** Suma días a un 'YYYY-MM-DD'. */
export const sumarDias = (dia, n) => {
    const [y, m, d] = dia.split('-').map(Number);
    const x = new Date(Date.UTC(y, m - 1, d + n));
    return x.toISOString().slice(0, 10);
};

/** Unidades de venta (250 g): una bolsa de 1 kg son 4; un kg a granel, 4. */
export function unidadesDeVenta(mov) {
    const n = Math.abs(Number(mov?.cantidad) || 0);
    const pres = String(mov?.presentacion || '');
    if (mov?.unit === 'kg') return n * 4;
    if (/\b1\s*kg\b/i.test(pres)) return n * 4;
    return n;
}

/** ¿Este movimiento de ACC es un retiro del mercaderista? */
export function esRetiroMercaderista(mov) {
    if (!mov || !(Number(mov.cantidad) < 0)) return false;
    if (mov.ref?.conteo) return false;              // ajustes de un conteo físico
    if (mov.tipo === 'picking') return true;
    if (mov.tipo === 'salida_ajuste' || mov.tipo === 'salida') {
        return /picking|mercaderista|retir[oó] el mercad/i.test(String(mov.nota || ''));
    }
    return false;
}

/** El día en que se retiró: el declarado en la nota del picking o el de la anotación. */
export function diaRetiro(mov) {
    const m = String(mov?.nota || '').match(/Picking (\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    return diaCaracas(aMs(mov?.createdAt));
}

/** Día de una factura de Zoho, tal como se emitió. */
const diaFactura = (f) => diaLocal(fechaCalendario(f?.fecha));

const facturaCuenta = (f, excluidas) =>
    !!f && f.estado !== 'anulada' && f.ausenteEnZoho !== true && f.borradorEnZoho !== true
    && !(excluidas && excluidas.has(f.numero));

/**
 * El cruce completo.
 *
 * @param movimientos  inventario_movimientos de ACC
 * @param facturas     facturas_vendedor
 * @param visitas      visit_reports
 * @param posList      pos (para el carnet de Zoho de cada punto de venta)
 * @param desde        primer día del cruce ('YYYY-MM-DD'); antes, se parte de `inicial`
 * @param hasta        último día (por defecto, hoy en Caracas)
 * @param inicial      unidades en la mano al empezar `desde`
 * @param excluidas    números de factura que no salen de la ruta de Caracas
 * @param diasFactura  días después de la entrega en que todavía se espera su factura
 */
export function calcularEnLaMano({
    movimientos = [], facturas = [], visitas = [], posList = [],
    desde, hasta = diaCaracas(Date.now()), inicial = 0,
    excluidas = new Set(), diasFactura = 7,
} = {}) {
    const enRango = (dia) => !!dia && dia >= desde && dia <= hasta;
    const carnetDe = new Map(posList.map(p => [p.id, p.zohoCustomerId || null]));
    const nombreDe = new Map(posList.map(p => [p.id, p.name || p.nombre || p.id]));
    const dias = new Map();
    const dia = (d) => {
        if (!dias.has(d)) dias.set(d, { dia: d, retirado: 0, entregado: 0, repuesto: 0, reubicado: 0, devolucion: 0, facturado: 0, retiros: [], entregas: [], facturas: [] });
        return dias.get(d);
    };

    // 1. Retiros de ACC.
    for (const m of movimientos) {
        if (!esRetiroMercaderista(m)) continue;
        const d = diaRetiro(m);
        if (!enRango(d)) continue;
        const uds = unidadesDeVenta(m);
        const fila = dia(d);
        fila.retirado += uds;
        fila.retiros.push({ unidades: uds, lote: m.lote || '', nota: m.nota || '', quien: m.actorNombre || '', registradoComo: m.tipo === 'picking' ? 'picking' : 'descuento' });
    }

    // 2. Entregas según las visitas.
    const entregas = [];
    for (const v of visitas) {
        if ((Number(v.formVersion) || 1) < 2) continue; // antes de la v2, la cifra no era «lo que entró hoy»
        const d = diaCaracas(horaVisitaMs(v));
        if (!enRango(d)) continue;
        const fila = dia(d);
        const entro = Number(v.orderQuantity) || 0;
        const r = v.retiroVisita || null;
        const repuesto = Number(r?.repuestas) || 0;
        const retirado = Number(r?.unidades) || 0;
        const reubica = r && r.destino === 'otro_pdv';
        fila.entregado += entro;
        fila.repuesto += repuesto;
        if (retirado > 0) {
            if (reubica) fila.reubicado += retirado;
            else fila.devolucion += retirado;
        }
        if (entro > 0) {
            const conFactura = (v.entregas || [])
                .filter(e => (Number(e.unidadesEntregadas) || 0) > 0)
                .map(e => ({ numero: e.numero, unidades: Number(e.unidadesEntregadas) || 0 }));
            const e = {
                dia: d, hora: horaVisitaMs(v), posId: v.posId, posName: v.posName || nombreDe.get(v.posId) || '',
                carnet: carnetDe.get(v.posId) || null, unidades: entro, conFactura,
                sinFactura: Math.max(0, entro - conFactura.reduce((s, x) => s + x.unidades, 0)),
                quien: v.userName || '', reportId: v.reportId || v.id || null,
            };
            entregas.push(e);
            fila.entregas.push(e);
        }
    }

    // 3. Facturas.
    const facts = facturas
        .filter(f => facturaCuenta(f, excluidas))
        .map(f => ({ numero: f.numero, dia: diaFactura(f), carnet: f.zohoCustomerId || null, cliente: f.clienteName || '', unidades: Number(f.unidades) || 0, resto: Number(f.unidades) || 0 }))
        .filter(f => f.dia && f.dia >= desde && f.unidades > 0);
    for (const f of facts) {
        if (f.dia <= hasta) {
            const fila = dia(f.dia);
            fila.facturado += f.unidades;
            fila.facturas.push(f);
        }
    }

    // 4. Cada entrega con su factura. Primero las que el teléfono ya vinculó por
    //    número; después lo entregado «sin factura» contra las facturas del MISMO
    //    carnet emitidas entre 2 días antes y `diasFactura` después, la más vieja
    //    primero.
    const porNumero = new Map(facts.map(f => [f.numero, f]));
    const porFacturar = [];
    const ordenadas = [...entregas].sort((a, b) => a.hora - b.hora);
    for (const e of ordenadas) {
        for (const c of e.conFactura) {
            const f = porNumero.get(c.numero);
            if (f) f.resto = Math.max(0, f.resto - c.unidades);
        }
    }
    for (const e of ordenadas) {
        let falta = e.sinFactura;
        e.facturadaCon = e.conFactura.map(c => c.numero);
        if (falta > 0 && e.carnet) {
            const cand = facts
                .filter(f => f.carnet === e.carnet && f.resto > 0 && f.dia >= sumarDias(e.dia, -2) && f.dia <= sumarDias(e.dia, diasFactura))
                .sort((a, b) => a.dia.localeCompare(b.dia));
            for (const f of cand) {
                if (falta <= 0) break;
                const toma = Math.min(falta, f.resto);
                f.resto -= toma;
                falta -= toma;
                e.facturadaCon.push(f.numero);
            }
        }
        if (falta > 0) {
            porFacturar.push({
                dia: e.dia, posId: e.posId, posName: e.posName, unidades: falta, quien: e.quien,
                motivo: e.carnet ? null : 'El punto de venta no está vinculado a un cliente de Zoho: no se puede buscar su factura.',
            });
        }
    }
    const sinEntrega = facts.filter(f => f.resto > 0 && f.dia <= hasta)
        .map(f => ({ numero: f.numero, dia: f.dia, cliente: f.cliente, unidades: f.resto }));

    // 5. Día por día.
    const lista = [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia));
    let manoVisitas = inicial, sinFacturar = inicial, devoluciones = 0;
    for (const f of lista) {
        manoVisitas += f.retirado - f.entregado - f.repuesto + f.reubicado;
        sinFacturar += f.retirado - f.facturado;
        devoluciones += f.devolucion;
        f.manoVisitas = manoVisitas;
        f.sinFacturar = sinFacturar;
    }

    const total = (k) => lista.reduce((s, f) => s + f[k], 0);
    return {
        desde, hasta, inicial,
        dias: lista,
        retirado: total('retirado'), entregado: total('entregado'), repuesto: total('repuesto'),
        reubicado: total('reubicado'), facturado: total('facturado'),
        enLaMano: manoVisitas,             // según sus visitas
        sinFacturar,                       // retirado − facturado
        devoluciones,                      // retiradas de anaquel para el camión
        porFacturar: porFacturar.sort((a, b) => a.dia.localeCompare(b.dia) || a.posName.localeCompare(b.posName)),
        sinEntrega,
    };
}
