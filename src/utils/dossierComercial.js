// RUTA: src/utils/dossierComercial.js
//
// EL DOSSIER COMERCIAL — las preguntas que hace quien está evaluando distribuir
// el producto, contestadas con los datos de GK en vez de de memoria.
//
// Nace de una lista concreta de 14 preguntas. Tres cosas que el dueño acotó y
// que valen como decisión de diseño, no como detalle:
//
//   · Las ventas cuentan DESDE 2026. Lo anterior es otra etapa comercial.
//   · El "mínimo de facturación mensual" NO es un dato de mercado: es la META
//     que se le fija al vendedor (hoy 1.700 uds/mes). Se lee de su
//     `commissionConfig.metaMensual`, así que el dossier no se desactualiza.
//   · El "máximo" queda FUERA: depende de la capacidad de planta (≈2.500 uds),
//     que GK no tiene cómo saber. Un número que la app no puede sostener no
//     entra en un documento que se le entrega a un tercero.
//
// Lo que este módulo NO hace es inventar. Cada bloque que no tiene datos lo
// declara — "sin datos" es una respuesta legítima en una negociación; un cero
// de relleno, no.

import { cuentaEnCartera } from './facturaEstado.js';
import { unidadesReales, buildCanalResolver } from './unidadesFactura.js';
import { DESDE_VENTAS, clavePorNombre, ciudadDePdv, pdvActivo } from './facturacionPdv.js';

export { DESDE_VENTAS };

const aFecha = (v) => {
    if (!v) return null;
    const d = v?.toDate ? v.toDate() : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
};
const mesKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const prom = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Ventas por CLIENTE desde el corte: monto, unidades y nº de facturas. */
export function ventasPorCliente(facturas = [], clientes = [], desde = DESDE_VENTAS) {
    const resolver = buildCanalResolver(clientes);
    const porCarnet = {};
    clientes.forEach(c => { if (c.customerId) porCarnet[c.customerId] = c; });

    const acum = new Map();
    facturas.forEach(f => {
        if (!cuentaEnCartera(f)) return;
        const d = aFecha(f.fecha);
        if (!d || d < desde) return;

        const cli = f.zohoCustomerId ? porCarnet[f.zohoCustomerId] : null;
        const nombre = cli?.razonSocialCanonica || cli?.customerName
            || f.clienteNombre || 'Sin cliente';
        const clave = clavePorNombre(nombre) || 'sin-cliente';
        if (!acum.has(clave)) {
            acum.set(clave, { nombre, monto: 0, unidades: 0, nFacturas: 0, canal: cli?.categoria || null });
        }
        const a = acum.get(clave);
        a.monto    += Number(f.monto) || 0;
        a.unidades += unidadesReales(f, { canal: resolver(f) });
        a.nFacturas += 1;
    });
    return [...acum.values()].sort((x, y) => y.monto - x.monto);
}

/** Facturación mes a mes desde el corte: $, unidades y nº de facturas. */
export function ventasPorMes(facturas = [], clientes = [], desde = DESDE_VENTAS) {
    const resolver = buildCanalResolver(clientes);
    const meses = new Map();
    facturas.forEach(f => {
        if (!cuentaEnCartera(f)) return;
        const d = aFecha(f.fecha);
        if (!d || d < desde) return;
        const k = mesKey(d);
        if (!meses.has(k)) meses.set(k, { mes: k, monto: 0, unidades: 0, nFacturas: 0 });
        const m = meses.get(k);
        m.monto    += Number(f.monto) || 0;
        m.unidades += unidadesReales(f, { canal: resolver(f) });
        m.nFacturas += 1;
    });
    return [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

/**
 * Cómo se comporta el crédito EN LA PRÁCTICA.
 * La política es una decisión; esto es lo que de verdad pasa: cuántos días se
 * otorgan y cuántos tardan en pagar. La diferencia entre ambos es el dato que
 * de verdad le interesa a quien evalúa.
 */
export function comportamientoCredito(facturas = [], desde = DESDE_VENTAS) {
    const otorgados = [];
    const reales = [];
    let pagadas = 0, abiertas = 0;
    facturas.forEach(f => {
        if (!cuentaEnCartera(f)) return;
        const d = aFecha(f.fecha);
        if (!d || d < desde) return;
        if (Number(f.diasCredito) > 0) otorgados.push(Number(f.diasCredito));
        const pago = aFecha(f.fechaPago);
        if (f.estado === 'pagada' && pago) {
            pagadas += 1;
            reales.push(Math.max(0, Math.round((pago - d) / 86400000)));
        } else if (f.estado !== 'pagada') {
            abiertas += 1;
        }
    });
    return {
        diasOtorgadosProm: prom(otorgados),
        diasRealesProm:    prom(reales),
        diasRealesMax:     reales.length ? Math.max(...reales) : null,
        pagadas, abiertas,
    };
}

/** Precios REALMENTE cobrados por unidad, por canal. */
export function preciosReales(facturas = [], clientes = [], desde = DESDE_VENTAS) {
    const resolver = buildCanalResolver(clientes);
    const porCanal = { retail: [], foodservice: [] };
    facturas.forEach(f => {
        if (!cuentaEnCartera(f)) return;
        const d = aFecha(f.fecha);
        if (!d || d < desde) return;
        const canal = resolver(f);
        const u = unidadesReales(f, { canal });
        const monto = Number(f.monto) || 0;
        if (u <= 0 || monto <= 0) return;
        porCanal[canal].push(monto / u);
    });
    const resumen = (xs) => xs.length
        ? { n: xs.length, prom: prom(xs), min: Math.min(...xs), max: Math.max(...xs) }
        : null;
    return { retail: resumen(porCanal.retail), foodservice: resumen(porCanal.foodservice) };
}

/**
 * El store check: la ÚLTIMA visita de cada PDV. No el promedio del histórico —
 * quien evalúa quiere saber cómo está el anaquel hoy, no cómo estuvo.
 */
export function storeCheck(pos = [], visitas = []) {
    const ultima = new Map();
    visitas.forEach(v => {
        const id = v.posId || v.posName;
        if (!id) return;
        const d = aFecha(v.createdAt || v.fecha);
        const prev = ultima.get(id);
        if (!prev || (d && prev.fecha && d > prev.fecha) || (d && !prev.fecha)) {
            ultima.set(id, { ...v, fecha: d });
        }
    });

    const filas = pos.filter(pdvActivo).map(p => {
        const v = ultima.get(p.id);
        return {
            pdv: p.name || p.nombre || '—',
            ciudad: ciudadDePdv(p),
            visitado: !!v,
            fecha: v?.fecha || null,
            anaquel: v ? (Number(v.inventoryLevel) || 0) : null,
            quiebre: v ? (Number(v.inventoryLevel) || 0) <= 0 : null,
            pvp: v ? (Number(v.price) || null) : null,
            competidores: v ? (v.competition || []).length : null,
        };
    }).sort((a, b) => Number(b.visitado) - Number(a.visitado) || a.pdv.localeCompare(b.pdv));

    const visitados = filas.filter(f => f.visitado);
    return {
        filas,
        nPdv: filas.length,
        nVisitados: visitados.length,
        nQuiebres: visitados.filter(f => f.quiebre).length,
        anaquelProm: prom(visitados.map(f => f.anaquel).filter(n => n > 0)),
        pvpProm: prom(visitados.map(f => f.pvp).filter(Boolean)),
    };
}

/** Devoluciones desde el corte: unidades, motivo y cómo se resolvieron. */
export function resumenDevoluciones(devoluciones = [], desde = DESDE_VENTAS) {
    let unidades = 0, notaCredito = 0, repuestas = 0, n = 0;
    const porMotivo = new Map();
    devoluciones.forEach(dv => {
        const d = aFecha(dv.fecha);
        if (!d || d < desde) return;
        n += 1;
        unidades   += Number(dv.unidades) || 0;
        notaCredito += Number(dv.montoNotaCredito) || 0;
        repuestas  += Number(dv.unidadesRepuestas) || 0;
        (dv.lotes || []).forEach(l => {
            const k = l.motivo || 'sin motivo';
            porMotivo.set(k, (porMotivo.get(k) || 0) + (Number(l.unidades) || 0));
        });
    });
    return {
        n, unidades, notaCredito, repuestas,
        porMotivo: [...porMotivo.entries()].map(([motivo, uds]) => ({ motivo, uds }))
            .sort((a, b) => b.uds - a.uds),
    };
}

/**
 * Vida útil OBSERVADA: días entre la producción de un lote y su vencimiento.
 * El catálogo de productos no tiene un campo de vida útil declarada, así que
 * esto es lo que los lotes reales muestran — y el dossier lo dice con esas
 * palabras en vez de presentarlo como una especificación.
 */
export function vidaUtilObservada(lotesPT = []) {
    const dias = [];
    lotesPT.forEach(i => {
        const venc = aFecha(i.fechaVencimiento);
        const creado = aFecha(i.createdAt);
        if (!venc || !creado) return;
        const d = Math.round((venc - creado) / 86400000);
        if (d > 0 && d < 400) dias.push(d);   // fuera de ese rango es dato malo
    });
    return dias.length
        ? { n: dias.length, prom: Math.round(prom(dias)), min: Math.min(...dias), max: Math.max(...dias) }
        : null;
}

/** Despachos desde el corte: de dónde salen, a dónde y con qué frecuencia. */
export function resumenDespachos(despachos = [], desde = DESDE_VENTAS) {
    const fechas = [];
    const destinos = new Map();
    despachos.forEach(dp => {
        const d = aFecha(dp.fecha || dp.createdAt);
        if (!d || d < desde) return;
        fechas.push(d);
        (dp.lineas || []).forEach(l => {
            const k = l.destino || dp.destino || 'Sin destino';
            destinos.set(k, (destinos.get(k) || 0) + (Number(l.cantidad) || 0));
        });
        if (!(dp.lineas || []).length && dp.destino) {
            destinos.set(dp.destino, destinos.get(dp.destino) || 0);
        }
    });
    fechas.sort((a, b) => a - b);
    // Frecuencia = promedio de días entre despachos consecutivos.
    const huecos = [];
    for (let i = 1; i < fechas.length; i++) {
        huecos.push(Math.round((fechas[i] - fechas[i - 1]) / 86400000));
    }
    return {
        n: fechas.length,
        primero: fechas[0] || null,
        ultimo: fechas[fechas.length - 1] || null,
        cadaDias: huecos.length ? Math.round(prom(huecos)) : null,
        destinos: [...destinos.entries()].map(([destino, uds]) => ({ destino, uds }))
            .sort((a, b) => b.uds - a.uds),
    };
}

/**
 * Arma el dossier completo, agrupado por tema como lo pidió el dueño.
 * `topN` = cuántos clientes entran en el ranking (la pregunta original pedía 10).
 */
export function construirDossier({
    facturas = [], clientes = [], pos = [], visitas = [], devoluciones = [],
    despachos = [], lotesPT = [], productos = [], metaMensual = null,
    precioUnidad = null, precioFoodservice = null, comision = null,
    desde = DESDE_VENTAS, topN = 10,
} = {}) {
    const porCliente = ventasPorCliente(facturas, clientes, desde);
    const porMes     = ventasPorMes(facturas, clientes, desde);
    const totalMonto = porCliente.reduce((s, c) => s + c.monto, 0);
    const totalUds   = porCliente.reduce((s, c) => s + c.unidades, 0);

    return {
        desde,
        // ── Mercado y clientes ──
        mercado: {
            storeCheck: storeCheck(pos, visitas),
            clientesConVenta: porCliente.length,
            top: porCliente.slice(0, topN),
            todos: porCliente,
            totalMonto, totalUds,
            pdvActivos: pos.filter(pdvActivo).length,
            pdvInactivos: pos.filter(p => !pdvActivo(p)).length,
            ciudades: [...new Set(pos.map(ciudadDePdv))].sort((a, b) => a.localeCompare(b)),
        },
        // ── Condiciones comerciales ──
        condiciones: {
            precios: preciosReales(facturas, clientes, desde),
            precioLista: { retail: precioUnidad, foodservice: precioFoodservice },
            credito: comportamientoCredito(facturas, desde),
            // El "mínimo" es la meta del vendedor, no un dato de mercado.
            metaMensualUds: metaMensual,
            metaMensualUsd: metaMensual && precioUnidad ? metaMensual * precioUnidad : null,
            comision,
            porMes,
        },
        // ── Producto y operación ──
        operacion: {
            presentaciones: productos.flatMap(p =>
                (p.presentaciones || []).map(s => ({
                    producto: p.nombre || p.name || '—',
                    nombre: s.nombre || '—',
                    peso: s.pesoNeto || null,
                    unidad: s.unidad || '',
                }))),
            vidaUtil: vidaUtilObservada(lotesPT),
            devoluciones: resumenDevoluciones(devoluciones, desde),
            despachos: resumenDespachos(despachos, desde),
        },
    };
}
