// RUTA: src/utils/planVendedor.js
//
// EL PLAN DE COMISIONES DEL VENDEDOR, EN TARJETAS (pedido del dueño, 4-nov-2026):
// "que la página del vendedor exprese su plan de comisiones y cómo afecta su
// rendimiento… cada vendedor puede tener un sistema distinto".
//
// Una sola traducción de (esquema + lo que lleva en el mes) a lo que se ve:
//   - el esquema dice QUÉ piezas tiene (piezasComision.js, las mismas del
//     constructor);
//   - la fila del estado de cuenta del período (computeEstadosDeCuenta, el mismo
//     motor que paga) dice CUÁNTO lleva de cada una.
// No calcula comisiones: solo las presenta. Por eso lo que ve el vendedor, lo
// que ve el máster y lo que se le paga son la misma cifra.
//
// Puro: lo usan el inicio del vendedor, sus indicadores y Comercial → Vendedores.

import { piezasActivas, pieza, simularEsquema, completo, nombresPlan, clasePieza } from './piezasComision.js';
import { escalonesBonoNivel } from './bloquesRemuneracion.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round(num(v) * 100) / 100;
export const fmtUsd = (v) => `$${r2(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtUds = (v) => Math.round(num(v)).toLocaleString('es-VE');
export const fmtKgP = (v) => `${String(Math.round(num(v) * 10) / 10).replace('.', ',')} kg`;
const fmtPct = (v) => `${String(r2(v)).replace('.', ',')} %`;

/**
 * La fila del desglose de un período (computeDesglosePeriodo) con los mismos
 * nombres que la del estado de cuenta, para poder usar las dos aquí.
 */
export function filaDeDesglose(d) {
    if (!d) return null;
    return {
        ...d,
        unidades: d.unidades, metaMensual: d.metaMensual,
        bonoNivelEscalon: d.bonoNivel?.escalon?.etiqueta || null,
        bonoNivelSiguiente: d.bonoNivel?.siguiente || null,
        bonoNivelFoodEscalon: d.bonoNivelFood?.escalon?.etiqueta || null,
        bonoNivelFoodSiguiente: d.bonoNivelFood?.siguiente || null,
        crecimiento: d.crecimiento, crecimientoFood: d.crecimientoFood,
        actSemanasLogradas: d.semanasLogradas, actSemanasTotales: d.semanasTotales,
        bonoActivacionMonto: d.bonoActivacionMonto,
        bonoCobranzaMonto: d.bonoCobranzaMonto,
    };
}

/** Marcas de la barra de la meta: los escalones del bono o los niveles de la comisión. */
function marcas(cfg, meta, medida = 'retail') {
    if (medida === 'retail' && piezasActivas(cfg).includes('comisionNiveles')) {
        return [...(cfg.tiers || [])].map(t => ({ umbral: Math.round(meta * num(t.minPct) / 100), etiqueta: t.label, texto: fmtPct(t.rate) }))
            .filter(m => m.umbral > 0).sort((a, b) => a.umbral - b.umbral);
    }
    return escalonesBonoNivel(cfg, { meta, medida }).map(e => ({ umbral: e.umbral, etiqueta: e.etiqueta, texto: fmtUsd(e.monto).replace(',00', '') }));
}

/**
 * El tablero del plan para un período.
 * @param {object} cfgRaw  esquema vigente del período (commissionConfig o configEnFecha)
 * @param {object} fila    fila del estado de cuenta del período (o filaDeDesglose)
 * @param {object} extra   { anaquel: {hasAnaquel, ok, cubiertos, total}, ritmo: {diasPasados, diasRestantes} }
 */
export function tableroPlan(cfgRaw = {}, fila = null, extra = {}) {
    const cfg = completo(cfgRaw);
    const f = fila || {};
    const activas = piezasActivas(cfg);
    const porCobradas = cfg.baseUnidades === 'cobradas';
    const udsTxt = porCobradas ? 'uds cobradas' : 'uds';
    const kgTxtBase = porCobradas ? 'cobrados' : '';
    const meta = num(f.metaMensual) || num(cfg.metaMensual);
    const unidades = num(f.unidades);
    const metaKg = num(f.metaKgFood) || num(cfg.metaKgFoodservice);
    const kg = num(f.kgFood);
    const tarjetas = [];
    const T = (id, datos) => {
        const p = pieza(id);
        tarjetas.push({ id, nombre: p.nombre, grupo: p.grupo, clase: clasePieza(id), regla: p.resumen(cfg), para: p.para, ganado: 0, maximo: null, pct: null, progreso: '', siguiente: '', estado: 'en_camino', cuenta: 'comision', barra: null, faltan: 0, ...datos });
    };

    for (const id of activas) {
        switch (id) {
            case 'fijo': {
                const base = f.base != null ? num(f.base) : num(cfg.salarioFijo) + num(cfg.viaticosSemanales) * 4;
                T(id, { ganado: base, estado: 'siempre', cuenta: 'fijo', progreso: 'Seguro, pase lo que pase', siguiente: 'Se paga por quincenas.' });
                break;
            }
            case 'comisionFija': {
                const tasa = num(cfg.tasaFija);
                T(id, {
                    ganado: num(f.comisionNivelMonto), estado: 'siempre',
                    progreso: `${fmtPct(tasa)} de ${fmtUsd(f.cobradoRegular)} cobrados`,
                    siguiente: `Cada $100 que cobres te suman ${fmtUsd(tasa)}.`,
                });
                break;
            }
            case 'comisionNiveles': {
                const tiers = [...(cfg.tiers || [])].sort((a, b) => num(a.minPct) - num(b.minPct));
                const sig = tiers.find(t => meta > 0 && unidades < meta * num(t.minPct) / 100);
                const tope = tiers.length ? meta * num(tiers[tiers.length - 1].minPct) / 100 : 0;
                T(id, {
                    ganado: num(f.comisionNivelMonto),
                    pct: tope > 0 ? Math.min(1, unidades / tope) : null,
                    estado: sig ? 'en_camino' : 'logrado',
                    progreso: `Nivel ${f.nivel || '—'}${f.tasa != null ? ` · ${fmtPct(f.tasa)}` : ''} sobre ${fmtUsd(f.cobradoRegular)} cobrados`,
                    siguiente: sig ? `Te faltan ${fmtUds(Math.ceil(meta * num(sig.minPct) / 100 - unidades))} ${udsTxt} para el nivel ${sig.label} (${fmtPct(sig.rate)}).` : 'Estás en el nivel más alto.',
                    barra: 'retail', faltan: sig ? Math.ceil(meta * num(sig.minPct) / 100 - unidades) : 0,
                });
                break;
            }
            case 'bonoNivel': {
                const esc = escalonesBonoNivel(cfg, { meta });
                const max = esc.length ? Math.max(...esc.map(e => e.monto)) : 0;
                const sig = f.bonoNivelSiguiente;
                const tope = esc.length ? esc[esc.length - 1].umbral : 0;
                T(id, {
                    ganado: num(f.bonoNivelMonto), maximo: max,
                    pct: tope > 0 ? Math.min(1, unidades / tope) : null,
                    estado: !sig && num(f.bonoNivelMonto) > 0 ? 'logrado' : num(f.bonoNivelMonto) > 0 ? 'en_camino' : 'pendiente',
                    progreso: `${fmtUds(unidades)} ${udsTxt}${f.bonoNivelEscalon ? ` · escalón «${f.bonoNivelEscalon}»` : ''}`,
                    siguiente: sig ? `Te faltan ${fmtUds(sig.faltan)} ${udsTxt} para ${fmtUsd(sig.monto)}.` : (num(f.bonoNivelMonto) > 0 ? '¡Lograste el escalón más alto!' : ''),
                    barra: 'retail', faltan: sig ? num(sig.faltan) : 0,
                });
                break;
            }
            case 'activacionUSD':
            case 'activacionPct': {
                // Una sola tarjeta de activación aunque el esquema la pague en % y en USD.
                if (tarjetas.some(t => t.id === 'activacionUSD' || t.id === 'activacionPct')) break;
                const semT = num(f.actSemanasTotales), semL = num(f.actSemanasLogradas);
                const cartera = num(f.carteraSize);
                const usd = num(cfg.bonoActivacionUSD);
                const ganado = num(f.bonoActivacionUSDMonto) + num(f.bonoActivacionMonto);
                const regla = [usd > 0 ? fmtUsd(usd).replace(',00', '') : null, num(cfg.bonusActivacion) > 0 ? `${fmtPct(cfg.bonusActivacion)} de lo cobrado` : null].filter(Boolean).join(' + ');
                if (fila && !(cartera > 0)) {
                    T(id, {
                        ganado: 0, maximo: usd || null, estado: 'no_aplica',
                        regla: `${regla} al mes si cada semana el ${num(cfg.activacionThreshold)} % de tus PDV compra ${num(cfg.activacionMinUnits)} uds o más`,
                        progreso: 'Todavía no tienes PDV activos a tu nombre.',
                        siguiente: 'Pídele a administración que te asigne tu cartera: sin ella no se puede medir.',
                    });
                    break;
                }
                const objetivo = num(f.actSemObjetivo), activados = num(f.actSemActivados);
                T(id, {
                    ganado, maximo: usd || null,
                    regla: `${regla} al mes si cada semana el ${num(cfg.activacionThreshold)} % de tus PDV compra ${num(cfg.activacionMinUnits)} uds o más`,
                    pct: semT > 0 ? semL / semT : null,
                    estado: semT > 0 && semL === semT ? 'logrado' : semL > 0 ? 'en_camino' : 'pendiente',
                    progreso: semT > 0 ? `${semL} de ${semT} semanas logradas` : '',
                    siguiente: objetivo > 0
                        ? (f.actSemLograda ? `Esta semana ya lograste ${activados} de ${objetivo} PDV. ✓` : `Esta semana llevas ${activados} de ${objetivo} PDV: te faltan ${Math.max(0, objetivo - activados)}.`)
                        : '',
                });
                break;
            }
            case 'crecimiento':
            case 'foodCrec': {
                const c = id === 'crecimiento' ? f.crecimiento : f.crecimientoFood;
                const monto = num(id === 'crecimiento' ? cfg.bonoCrecimiento?.montoUSD : cfg.bonoCrecimientoFood?.montoUSD);
                const u = id === 'crecimiento' ? udsTxt : `kg ${kgTxtBase}`.trim();
                const fmt = id === 'crecimiento' ? fmtUds : (v) => String(Math.round(num(v) * 10) / 10).replace('.', ',');
                if (!c || !c.aplica) {
                    T(id, { ganado: 0, maximo: monto, estado: 'no_aplica', progreso: c?.motivo || 'Se mide contra el mes anterior.', siguiente: '' });
                    break;
                }
                T(id, {
                    ganado: num(c.monto), maximo: monto,
                    pct: c.unidadesObjetivo > 0 ? Math.min(1, (id === 'crecimiento' ? unidades : kg) / c.unidadesObjetivo) : null,
                    estado: c.logrado ? 'logrado' : 'en_camino',
                    progreso: `${fmtPct(c.crecimientoPct)} contra el mes anterior`,
                    siguiente: c.logrado ? '¡Logrado!' : `Te faltan ${fmt(c.faltan)} ${u} para ${fmtUsd(monto)}.`,
                });
                break;
            }
            case 'cobranza': {
                const cobr = num(f.cobradoRegular), aT = num(f.cobradoRegularATiempo);
                T(id, {
                    ganado: num(f.bonoCobranzaMonto), estado: 'siempre',
                    pct: cobr > 0 ? aT / cobr : null,
                    progreso: cobr > 0 ? `${fmtUsd(aT)} de ${fmtUsd(cobr)} cobrados a tiempo` : 'Aún no has cobrado este mes',
                    siguiente: `Cobra dentro del vencimiento + ${num(cfg.cobranzaGraciaDias)} días: cada factura a tiempo suma ${fmtPct(cfg.bonusPuntualidad)}.`,
                });
                break;
            }
            case 'anaquel': {
                const a = extra.anaquel || {};
                if (!a.hasAnaquel) { T(id, { estado: 'no_aplica', progreso: 'No tienes cuentas en consignación.', siguiente: '' }); break; }
                T(id, {
                    ganado: num(f.bonoAnaquelMonto), pct: a.total > 0 ? a.cubiertos / a.total : null,
                    estado: a.ok ? 'logrado' : 'en_camino',
                    progreso: `${num(a.cubiertos)} de ${num(a.total)} sucursales cumplen`,
                    siguiente: a.ok ? '¡Logrado este mes!' : `Necesitas ${num(cfg.anaquelThreshold)} % de las sucursales con ${num(cfg.anaquelMinUnits)} uds o más.`,
                });
                break;
            }
            case 'foodPct':
                T(id, { ganado: num(f.comisionFoodMonto), estado: 'siempre', progreso: `${fmtPct(cfg.comisionFoodservice)} de ${fmtUsd(f.cobradoFood)} cobrados en foodservice`, siguiente: '' });
                break;
            case 'foodNivel': {
                const esc = escalonesBonoNivel(cfg, { meta: metaKg, medida: 'food' });
                const max = esc.length ? Math.max(...esc.map(e => e.monto)) : 0;
                const sig = f.bonoNivelFoodSiguiente;
                const tope = esc.length ? esc[esc.length - 1].umbral : 0;
                T(id, {
                    ganado: num(f.bonoNivelFoodMonto), maximo: max,
                    pct: tope > 0 ? Math.min(1, kg / tope) : null,
                    estado: !sig && num(f.bonoNivelFoodMonto) > 0 ? 'logrado' : num(f.bonoNivelFoodMonto) > 0 ? 'en_camino' : 'pendiente',
                    progreso: `${fmtKgP(kg)}${kgTxtBase ? ` ${kgTxtBase}` : ''}${f.bonoNivelFoodEscalon ? ` · escalón «${f.bonoNivelFoodEscalon}»` : ''}`,
                    siguiente: sig ? `Te faltan ${fmtKgP(sig.faltan)}${kgTxtBase ? ` ${kgTxtBase}` : ''} para ${fmtUsd(sig.monto)}.` : (num(f.bonoNivelFoodMonto) > 0 ? '¡Lograste el escalón más alto!' : ''),
                    barra: 'food', faltan: sig ? num(sig.faltan) : 0,
                });
                break;
            }
            case 'recuperadas':
                T(id, { ganado: num(f.bonoRecupMonto), estado: 'siempre', progreso: `${fmtPct(cfg.comisionRecuperadas)} de ${fmtUsd(f.cobradoRecup)} heredados cobrados`, siguiente: 'Cobra las facturas viejas de tu cartera.' });
                break;
            default: break; // 'arranque' no paga: se ve en la meta
        }
    }

    // El ritmo para el siguiente escalón o nivel (solo en el mes en curso): lo
    // que le falta, repartido en los días que quedan, contra lo que lleva por día.
    const rit = extra.ritmo || {};
    const dR = num(rit.diasRestantes), dP = num(rit.diasPasados);
    if (fila && !f.cerrado && dR > 0) {
        for (const t of tarjetas) {
            if (!t.barra || !(t.faltan > 0)) continue;
            const kgs = t.barra === 'food';
            const u = kgs ? (porCobradas ? 'kg cobrados' : 'kg') : udsTxt;
            const fmt = kgs ? (v) => String(Math.round(num(v) * 10) / 10).replace('.', ',') : (v) => fmtUds(Math.ceil(num(v)));
            const lleva = kgs ? kg : unidades;
            t.ritmo = `Necesitas ${fmt(t.faltan / dR)} ${u} por día los próximos ${dR} día${dR === 1 ? '' : 's'}${dP > 0 ? ` · hoy vas a ${fmt(lleva / dP)} por día` : ''}.`;
        }
    }

    // Lo que ganaría al cumplir su meta y lo más que puede ganar (mismo simulador del constructor).
    const sim = simularEsquema(cfg);
    const techo = simularEsquema(cfg, { pctMeta: 150, pctKg: 150 });
    const fijo = tarjetas.find(t => t.id === 'fijo');
    const variables = tarjetas.filter(t => t.id !== 'fijo');
    const ganado = fila ? num(f.devengadoComision) : 0;
    const alMeta = sim.variable;
    return {
        tarjetas: variables, fijo: fijo || null,
        ganado, alMeta, techo: techo.variable,
        pctAlMeta: alMeta > 0 ? Math.min(1, ganado / alMeta) : null,
        // Cómo se llama lo que gana: bonos, comisiones o las dos cosas.
        nombres: nombresPlan(cfg),
        porCobradas, soloFijo: variables.length === 0,
        metas: {
            retail: meta > 0 ? { actual: unidades, meta, unidad: udsTxt, pct: unidades / meta, marcas: marcas(cfg, meta) } : null,
            food: metaKg > 0 && (activas.some(x => x.startsWith('food')) || kg > 0)
                ? { actual: kg, meta: metaKg, unidad: porCobradas ? 'kg cobrados' : 'kg', pct: kg / metaKg, marcas: marcas(cfg, metaKg, 'food') } : null,
        },
        // Para el chip de la meta: cómo le paga lo que vende.
        chipMeta: activas.includes('comisionFija') ? `Comisión ${fmtPct(cfg.tasaFija)}`
            : activas.includes('comisionNiveles') ? `Nivel ${f.nivel || '—'}`
            : activas.includes('bonoNivel') ? (f.bonoNivelEscalon ? (/^escal/i.test(f.bonoNivelEscalon) ? f.bonoNivelEscalon : `Escalón ${f.bonoNivelEscalon}`) : 'Sin escalón aún')
            : null,
    };
}
