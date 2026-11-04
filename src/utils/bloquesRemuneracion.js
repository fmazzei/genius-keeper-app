// RUTA: src/utils/bloquesRemuneracion.js
//
// LA REMUNERACIÓN DEL VENDEDOR POR BLOQUES (pedido del dueño, 3-nov-2026).
//
// Un esquema de comisión es una combinación libre de bloques. Lo que ya existía
// sigue guardado igual (los esquemas de Carolina y Wilmer no se reescriben); los
// bloques nuevos son campos opcionales del mismo `commissionConfig`:
//
//   Fijo ............ salarioFijo + viaticosSemanales (por quincenas; período
//                     corto en proporción, ver periodosComision.js).
//   Comisión % ...... comisionActiva (false = sin comisión %), esquema
//                     'niveles' (tiers + bajaRate) o 'fija' (tasaFija), sobre lo
//                     COBRADO.
//   Bono por nivel .. bonoNivel = {activo, escalones:[{etiqueta, minUnidades |
//                     minPct, montoUSD}]}: USD fijos; se paga SOLO el escalón más
//                     alto logrado; por debajo del más bajo, $0. Un escalón en %
//                     se recalcula solo si cambia la meta; uno en unidades, en un
//                     período corto, se lleva en proporción (como la meta).
//   Bono Activación . el de siempre (decisión del dueño, 3-nov: "la penetración
//                     es lo mismo que la activación de cartera"): cada semana
//                     lograda = `activacionThreshold` % de la cartera facturó
//                     ≥ `activacionMinUnits`. Se paga en % de lo cobrado
//                     (`bonusActivacion` × semanas logradas ÷ semanas) y/o en
//                     USD (`bonoActivacionUSD` × semanas logradas ÷ semanas).
//   Bono crecimiento  bonoCrecimiento = {activo, pct, montoUSD}: si las unidades
//                     crecieron al menos `pct` % contra el período anterior (por
//                     día, para no comparar un período corto con uno completo).
//                     No aplica en el primer mes.
//   Bonos %  ........ bonusPuntualidad (Cobranza), bonusActivacion, bonusAnaquel:
//                     sin cambios.
//   Foodservice ..... comisionFoodservice (% flat; 0 = nada). Y, como el retail,
//                     sus propios bonos en USD medidos en KG de queso contra
//                     su meta (`metaKgFoodservice`) (pedido del dueño, 4-nov):
//                     bonoNivelFood = {activo, escalones:[{etiqueta, minKg |
//                     minPct, montoUSD}]} y bonoCrecimientoFood = {activo, pct,
//                     montoUSD}. Solo en los períodos que separan foodservice
//                     (mes calendario, desde oct-2026); antes, foodservice
//                     sumaba a las unidades del retail.
//   Recuperadas ..... comisionRecuperadas (% flat; puede ser 0).
//   Arranque ........ metas reducidas los primeros meses (arranque).
//   Base de unidades  baseUnidades = 'facturadas' | 'cobradas': con qué unidades
//                     se mide el período (meta, nivel y bonos). 'cobradas' =
//                     unidades de las facturas cobradas en el período (por
//                     fechaPago), sin las que perdieron la comisión por pasar de
//                     facturaMaxDias. Ningún bono se paga sobre lo no cobrado:
//                     los bonos % siempre van sobre lo cobrado y los bonos en USD
//                     de un esquema con base 'cobradas' se miden con lo cobrado.
//
// Puro: lo usan el motor (vendedorMeta.js, empaquetado al servidor), el
// constructor, el Home del vendedor y los comprobantes.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Escalones del bono por nivel, ordenados de menor a mayor umbral, con su umbral en unidades para un período. */
// Retail se mide en unidades enteras; foodservice en kg con un decimal.
const MEDIDAS = {
    retail: { nivel: 'bonoNivel', crec: 'bonoCrecimiento', min: 'minUnidades', dec: 0, unidad: 'uds' },
    food: { nivel: 'bonoNivelFood', crec: 'bonoCrecimientoFood', min: 'minKg', dec: 1, unidad: 'kg' },
};
const redondear = (v, dec) => { const f = 10 ** dec; return Math.round(v * f) / f; };
const techo = (v, dec) => { const f = 10 ** dec; return Math.ceil(v * f - 1e-9) / f; };

export function escalonesBonoNivel(cfg = {}, { meta = 0, fraccion = 1, medida = 'retail' } = {}) {
    const M = MEDIDAS[medida] || MEDIDAS.retail;
    const b = cfg[M.nivel];
    if (!b || b.activo === false || !Array.isArray(b.escalones)) return [];
    return b.escalones
        .map((e, i) => {
            const porPct = e[M.min] == null || e[M.min] === '' ? (e.minPct != null && e.minPct !== '') : false;
            const umbral = porPct
                ? techo(num(meta) * num(e.minPct) / 100, M.dec)
                : redondear(num(e[M.min]) * (fraccion < 1 ? fraccion : 1), M.dec);
            return { i, etiqueta: e.etiqueta || `Escalón ${i + 1}`, porPct, minPct: porPct ? num(e.minPct) : null, minUnidades: porPct ? null : num(e[M.min]), umbral, monto: num(e.montoUSD), unidad: M.unidad };
        })
        .filter(e => e.umbral > 0 || e.monto > 0)
        .sort((a, b2) => a.umbral - b2.umbral);
}

/**
 * Bono por nivel de un período: el escalón más alto logrado (o ninguno) y el
 * siguiente, para decirle al vendedor cuánto le falta.
 */
export function bonoNivelPara(cfg = {}, unidades = 0, { meta = 0, fraccion = 1, medida = 'retail' } = {}) {
    const dec = (MEDIDAS[medida] || MEDIDAS.retail).dec;
    const esc = escalonesBonoNivel(cfg, { meta, fraccion, medida });
    if (!esc.length) return { activo: false, monto: 0, escalon: null, siguiente: null, escalones: [] };
    let logrado = null;
    for (const e of esc) if (num(unidades) >= e.umbral) logrado = e;
    const siguiente = esc.find(e => num(unidades) < e.umbral && (!logrado || e.monto > logrado.monto)) || null;
    return {
        activo: true,
        monto: logrado ? logrado.monto : 0,
        escalon: logrado,
        siguiente: siguiente ? { ...siguiente, faltan: redondear(siguiente.umbral - num(unidades), dec) } : null,
        escalones: esc,
    };
}

/**
 * Bono de crecimiento contra el período anterior. Se compara por día (unidades ÷
 * fracción del mes) para que un período corto no infle ni hunda el crecimiento.
 * El primer período no tiene contra qué compararse; un anterior en cero, tampoco.
 */
export function bonoCrecimientoPara(cfg = {}, unidades = 0, previo = null, { medida = 'retail' } = {}) {
    const M = MEDIDAS[medida] || MEDIDAS.retail;
    const b = cfg[M.crec];
    if (!b || b.activo === false || !(num(b.montoUSD) > 0)) return { activo: false, monto: 0 };
    const base = { activo: true, pct: num(b.pct), montoUSD: num(b.montoUSD) };
    if (!previo) return { ...base, aplica: false, motivo: 'Es el primer mes: no hay un mes anterior con qué comparar.', monto: 0 };
    const fr = (x) => (num(x) > 0 && num(x) < 1 ? num(x) : 1);
    const ant = num(previo.unidades) / fr(previo.fraccion);
    const act = num(unidades) / fr(previo.fraccionActual);
    if (!(ant > 0)) return { ...base, aplica: false, motivo: `El mes anterior no tuvo ${M.dec ? 'kg' : 'unidades'}: no hay base para medir el crecimiento.`, monto: 0, anterior: 0 };
    const crec = (act - ant) / ant * 100;
    const r = Math.round(crec * 100) / 100;
    // Se compara redondeado a 2 decimales: 9,99 % no llega al 10 %, 10,00 % sí.
    const logrado = r >= base.pct - 1e-9;
    const meta = techo(ant * (1 + base.pct / 100) * fr(previo.fraccionActual), M.dec);
    return {
        ...base, aplica: true, anterior: num(previo.unidades), anteriorMes: previo.mes ?? null,
        crecimientoPct: r, logrado, monto: logrado ? base.montoUSD : 0, unidad: M.unidad,
        unidadesObjetivo: meta, faltan: Math.max(0, redondear(meta - num(unidades), M.dec)),
    };
}

/** ¿El esquema tiene comisión %? */
export const tieneComisionPct = (cfg = {}) => cfg.comisionActiva !== false;

/** Unidades con que se mide el período. */
export const baseDeUnidades = (cfg = {}) => (cfg.baseUnidades === 'cobradas' ? 'cobradas' : 'facturadas');

const pct = (v) => `${String(Math.round(num(v) * 100) / 100).replace('.', ',')} %`;
const usd = (v) => `$${Math.round(num(v) * 100) / 100}`;

/**
 * Los bloques de un esquema, para mostrarlos (constructor, propuesta, Home). Un
 * esquema viejo se describe igual: sus campos de siempre son sus bloques.
 * @returns {Array<{id, nombre, resumen}>}
 */
export function bloquesDeEsquema(cfg = {}) {
    const out = [];
    const fijoMes = num(cfg.salarioFijo) + num(cfg.viaticosSemanales) * 4;
    if (fijoMes > 0) {
        out.push({ id: 'fijo', nombre: 'Sueldo fijo', resumen: `${usd(cfg.salarioFijo)} al mes${num(cfg.viaticosSemanales) > 0 ? ` + ${usd(cfg.viaticosSemanales)} de viáticos por semana` : ''} (por quincenas)` });
    }
    if (tieneComisionPct(cfg)) {
        if (cfg.esquema === 'fija') out.push({ id: 'comision', nombre: 'Comisión', resumen: `${pct(cfg.tasaFija)} fijo sobre lo cobrado` });
        else {
            const t = [...(cfg.tiers || [])].sort((a, b) => num(a.minPct) - num(b.minPct));
            const partes = t.map(x => `${x.label} ${pct(x.rate)} desde ${num(x.minPct)} %`);
            if (cfg.bajaActiva !== false && num(cfg.bajaRate) > 0) partes.unshift(`${cfg.bajaLabel || 'Baja'} ${pct(cfg.bajaRate)}`);
            out.push({ id: 'comision', nombre: 'Comisión por niveles', resumen: `${partes.join(' · ')} (sobre lo cobrado)` });
        }
    }
    const esc = escalonesBonoNivel(cfg, { meta: num(cfg.metaMensual) });
    if (esc.length) out.push({ id: 'bonoNivel', nombre: 'Bono por nivel', resumen: esc.map(e => `${e.porPct ? `${e.minPct} %` : `${e.umbral} uds`} → ${usd(e.monto)}`).join(' · ') + ' (solo el más alto)' });
    if (cfg.bonoCrecimiento && cfg.bonoCrecimiento.activo !== false && num(cfg.bonoCrecimiento.montoUSD) > 0) {
        const b = cfg.bonoCrecimiento;
        out.push({ id: 'bonoCrecimiento', nombre: 'Bono de crecimiento', resumen: `${usd(b.montoUSD)} si crece ${num(b.pct)} % o más contra el mes anterior` });
    }
    if (num(cfg.bonusPuntualidad) > 0) out.push({ id: 'bonoCobranza', nombre: 'Bono Cobranza', resumen: `${pct(cfg.bonusPuntualidad)} sobre cada factura cobrada a tiempo` });
    if (num(cfg.bonusActivacion) > 0 || num(cfg.bonoActivacionUSD) > 0) {
        const pago = [num(cfg.bonusActivacion) > 0 ? `${pct(cfg.bonusActivacion)} de lo cobrado` : null, num(cfg.bonoActivacionUSD) > 0 ? usd(cfg.bonoActivacionUSD) : null].filter(Boolean).join(' + ');
        out.push({ id: 'bonoActivacion', nombre: 'Bono Activación', resumen: `${pago} × semanas logradas (cada semana, ${num(cfg.activacionThreshold)} % de la cartera con ≥${num(cfg.activacionMinUnits)} uds)` });
    }
    if (num(cfg.bonusAnaquel) > 0) out.push({ id: 'bonoAnaquel', nombre: 'Bono Anaquel', resumen: `${pct(cfg.bonusAnaquel)} en cuentas de régimen anaquel` });
    if (num(cfg.comisionFoodservice) > 0) out.push({ id: 'foodservice', nombre: 'Comisión foodservice', resumen: `${pct(cfg.comisionFoodservice)} flat sobre lo cobrado` });
    const escF = escalonesBonoNivel(cfg, { meta: num(cfg.metaKgFoodservice), medida: 'food' });
    if (escF.length) out.push({ id: 'bonoNivelFood', nombre: 'Bono foodservice por nivel', resumen: escF.map(e => `${e.porPct ? `${e.minPct} %` : `${String(e.umbral).replace('.', ',')} kg`} → ${usd(e.monto)}`).join(' · ') + ' (solo el más alto)' });
    if (cfg.bonoCrecimientoFood && cfg.bonoCrecimientoFood.activo !== false && num(cfg.bonoCrecimientoFood.montoUSD) > 0) {
        const b = cfg.bonoCrecimientoFood;
        out.push({ id: 'bonoCrecimientoFood', nombre: 'Bono de crecimiento foodservice', resumen: `${usd(b.montoUSD)} si los kg crecen ${num(b.pct)} % o más contra el mes anterior` });
    }
    if (num(cfg.comisionRecuperadas) > 0) out.push({ id: 'recuperadas', nombre: 'Comisión por cuentas recuperadas', resumen: `${pct(cfg.comisionRecuperadas)} flat sobre lo cobrado de facturas heredadas` });
    if (Array.isArray(cfg.arranque) && cfg.arranque.length) out.push({ id: 'arranque', nombre: 'Arranque', resumen: cfg.arranque.map((a, i) => `Mes ${i + 1}: ${num(a.meta)} uds`).join(' · ') });
    out.push({ id: 'base', nombre: 'Unidades que cuentan', resumen: baseDeUnidades(cfg) === 'cobradas' ? 'Las de facturas COBRADAS en el mes' : 'Las FACTURADAS en el mes' });
    return out;
}

/** Lo máximo que pueden sumar los bonos en USD de un esquema (para la propuesta). */
export function maximoBonosUSD(cfg = {}) {
    const esc = escalonesBonoNivel(cfg, { meta: num(cfg.metaMensual) });
    const nivel = esc.length ? Math.max(...esc.map(e => e.monto)) : 0;
    const pen = num(cfg.bonoActivacionUSD);
    const cre = cfg.bonoCrecimiento && cfg.bonoCrecimiento.activo !== false ? num(cfg.bonoCrecimiento.montoUSD) : 0;
    const escF = escalonesBonoNivel(cfg, { meta: num(cfg.metaKgFoodservice), medida: 'food' });
    const nivelF = escF.length ? Math.max(...escF.map(e => e.monto)) : 0;
    const creF = cfg.bonoCrecimientoFood && cfg.bonoCrecimientoFood.activo !== false ? num(cfg.bonoCrecimientoFood.montoUSD) : 0;
    return nivel + pen + cre + nivelF + creF;
}

/**
 * Vista previa de un esquema a un % de la meta (constructor): un mes completo,
 * todo cobrado a tiempo y al precio de lista. La Activación en USD y el
 * crecimiento dependen de la cartera y del mes anterior: se muestran como "hasta".
 */
export function previaEsquema(cfg = {}, pctMeta = 100) {
    const meta = num(cfg.metaMensual);
    const unidades = Math.round(meta * num(pctMeta) / 100);
    const cobrado = unidades * num(cfg.precioUnidad || 0);
    const fijo = num(cfg.salarioFijo) + num(cfg.viaticosSemanales) * 4;
    let tasa = 0, nivel = '';
    if (tieneComisionPct(cfg)) {
        if (cfg.esquema === 'fija') { tasa = num(cfg.tasaFija); nivel = 'Tasa fija'; }
        else {
            const t = [...(cfg.tiers || [])].sort((a, b) => num(b.minPct) - num(a.minPct)).find(x => num(pctMeta) >= num(x.minPct));
            if (t) { tasa = num(t.rate); nivel = t.label; }
            else if (cfg.bajaActiva !== false) { tasa = num(cfg.bajaRate); nivel = cfg.bajaLabel || 'Baja'; }
        }
    }
    const comision = cobrado * tasa / 100;
    const bonosPct = cobrado * (num(cfg.bonusPuntualidad) + num(cfg.bonusActivacion)) / 100;
    const bn = bonoNivelPara(cfg, unidades, { meta });
    // Foodservice, al mismo % de su meta en kg.
    const metaKg = num(cfg.metaKgFoodservice);
    const kg = Math.round(metaKg * num(pctMeta) / 10) / 10;
    const bnF = bonoNivelPara(cfg, kg, { meta: metaKg, medida: 'food' });
    const hasta = num(cfg.bonoActivacionUSD)
        + (cfg.bonoCrecimiento && cfg.bonoCrecimiento.activo !== false ? num(cfg.bonoCrecimiento.montoUSD) : 0)
        + (cfg.bonoCrecimientoFood && cfg.bonoCrecimientoFood.activo !== false ? num(cfg.bonoCrecimientoFood.montoUSD) : 0);
    const variable = comision + bonosPct + bn.monto + bnF.monto;
    return { pctMeta: num(pctMeta), unidades, cobrado, fijo, tasa, nivel, comision, bonosPct, bonoNivel: bn.monto, escalon: bn.escalon?.etiqueta || null, kg, bonoNivelFood: bnF.monto, escalonFood: bnF.escalon?.etiqueta || null, hasta, variable, total: fijo + variable };
}

/** Plantillas rápidas del constructor (se aplican encima del esquema que se edita). */
export const PLANTILLAS = [
    {
        id: 'solo_fijo', nombre: 'Solo sueldo fijo',
        descripcion: 'Sueldo y viáticos; sin comisión ni bonos.',
        cambios: { comisionActiva: false, bonusPuntualidad: 0, bonusActivacion: 0, bonusAnaquel: 0, comisionFoodservice: 0, comisionRecuperadas: 0, bonoNivel: null, bonoActivacionUSD: 0, bonoCrecimiento: null, bonoNivelFood: null, bonoCrecimientoFood: null },
    },
    {
        id: 'fijo_niveles', nombre: 'Fijo + comisión por niveles',
        descripcion: 'El esquema de siempre: % según el nivel de la meta, con Bono Cobranza y Activación.',
        cambios: { comisionActiva: true, esquema: 'niveles', bonoNivel: null, bonoActivacionUSD: 0, bonoCrecimiento: null, baseUnidades: 'facturadas' },
    },
    {
        id: 'fijo_tasa', nombre: 'Fijo + tasa fija',
        descripcion: 'Una sola tasa sobre lo cobrado, sin niveles.',
        cambios: { comisionActiva: true, esquema: 'fija', bonoNivel: null, bonoActivacionUSD: 0, bonoCrecimiento: null },
    },
    {
        id: 'variable', nombre: '100 % variable',
        descripcion: 'Sin sueldo fijo: solo comisión y bonos.',
        cambios: { salarioFijo: 0, viaticosSemanales: 0, comisionActiva: true },
    },
    {
        id: 'fijo_bonos_usd', nombre: 'Fijo + bonos en USD',
        descripcion: 'Sin comisión %: un bono en dólares por nivel de unidades cobradas, más Activación de cartera y crecimiento en dólares.',
        cambios: {
            comisionActiva: false, bonusPuntualidad: 0, bonusActivacion: 0, bonusAnaquel: 0, comisionRecuperadas: 0,
            baseUnidades: 'cobradas',
            bonoNivel: { activo: true, escalones: [
                { etiqueta: 'Básico', minPct: 80, montoUSD: 160 },
                { etiqueta: 'Bueno', minPct: 87.5, montoUSD: 180 },
                { etiqueta: 'Meta', minPct: 100, montoUSD: 200 },
                { etiqueta: 'Sobre meta', minPct: 118.75, montoUSD: 250 },
            ] },
            activacionThreshold: 80, activacionMinUnits: 12, bonoActivacionUSD: 200,
            bonoCrecimiento: { activo: true, pct: 10, montoUSD: 100 },
        },
    },
];
