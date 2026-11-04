// RUTA: src/utils/verificarLiquidacion.js
//
// CRUCES DE VERIFICACIÓN ANTES DE PAGAR (pedido del dueño, 4-nov-2026): *"un
// error en esto puede costar un problema laboral… el cálculo de las comisiones y
// de los bonos, los comprobantes y todo lo relacionado deben tener cruces de
// verificación que permitan al administrador saber lo que está pagando, y el
// comprobante de pago lo demuestre"*.
//
// Cada cifra del período se vuelve a sumar por otro camino y se compara:
//   - lo que ve el vendedor (estado de cuenta) contra el comprobante (desglose);
//   - el total contra la suma de sus partes (bonos y comisiones);
//   - cada comisión % contra sus facturas cobradas, una por una;
//   - el escalón pagado contra las unidades contadas y la tabla de escalones;
//   - la Activación contra sus semanas;
//   - lo pagado contra los pagos registrados.
// Un ERROR impide pagar esa cuenta (comisiones o fijo); un AVISO pide que el
// administrador lo revise y lo confirme. La FIRMA resume el cálculo: si mañana
// algo cambia, la firma cambia, y el comprobante dice si el cálculo de hoy es el
// mismo que se pagó.
//
// Puro: no lee Firestore. Lo usan Liquidaciones, el comprobante de pago y el
// comprobante detallado.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round(num(v) * 100) / 100;
const usd = (v) => `$${r2(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const uds = (v) => Math.round(num(v)).toLocaleString('es-VE');
const kg1 = (v) => `${String(Math.round(num(v) * 10) / 10).replace('.', ',')} kg`;
const pct = (v) => `${String(r2(v)).replace('.', ',')} %`;

/** Tolerancia de una suma de N montos redondeados a centavos. */
const TOL = (n = 1) => 0.01 + 0.005 * Math.max(0, n);

// Id de la cuenta que afecta cada cruce: un error en comisiones no impide pagar
// el sueldo, y al revés.
const C = 'comision', F = 'fijo', A = 'ambas';

/**
 * Huella corta y estable del cálculo (FNV-1a de 32 bits, dos pasadas):
 * "7F3A-12C0". Mismo cálculo ⇒ misma firma.
 */
export function firmaCalculo(obj) {
    const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
    const h = (seed) => {
        let x = seed >>> 0;
        for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; }
        return x >>> 0;
    };
    const a = h(0x811c9dc5).toString(16).toUpperCase().padStart(8, '0');
    const b = h(0x01000193 ^ 0x9e3779b9).toString(16).toUpperCase().padStart(8, '0');
    return `${a.slice(0, 4)}-${b.slice(0, 4)}`;
}

/** Lo que se firma: las cifras que se pagan y las facturas de donde salen. */
export function contenidoFirma(d = {}, vendedorId = '') {
    const fac = (lista) => (lista || []).map(c => `${c.numero}:${r2(c.monto)}`).sort();
    return {
        v: vendedorId, p: d.periodKey,
        dev: r2(d.devengadoComision), base: r2(d.base),
        bloques: (d.bloques || []).map(b => `${b.id}:${r2(b.monto)}`),
        uds: r2(d.unidades), kg: r2(d.kgFood), baseUds: d.baseUnidades || 'facturadas',
        cob: fac(d.cobradas), rec: fac(d.recuperadas),
        lin: (d.lineasUnidades || []).map(f => `${f.numero}:${r2(f.unidades)}`).sort(),
        sem: (d.semanas || []).map(s => (s.lograda ? 1 : 0)).join(''),
    };
}

/**
 * Los cruces de un período.
 * @param {object} p
 *   desglose  computeDesglosePeriodo(...) del período (lo del comprobante)
 *   estado    fila de computeEstadosDeCuenta(...) del mismo período (lo que ve el vendedor)
 *   facturas  facturas_vendedor del vendedor (crudas), para revisar sus datos
 *   precioUnidad  precio de lista retail (para unidades sospechosas)
 *   zohoSyncAt    Date del último barrido con Zoho
 *   ahora     Date
 *   vendedorId
 * @returns {{cruces, errores:{comision,fijo}, avisos, firma, resumen}}
 */
export function verificarLiquidacion({ desglose: d, estado: e, facturas = [], precioUnidad = 0, zohoSyncAt = null, ahora = new Date(), vendedorId = '' } = {}) {
    const cruces = [];
    const add = (id, cuenta, titulo, nivel, detalle, cifras = null) => cruces.push({ id, cuenta, titulo, nivel, detalle, cifras });
    if (!d) {
        add('sin_calculo', A, 'Cálculo del período', 'error', 'No se pudo calcular el período: no hay con qué verificar el pago.');
        return resultado(cruces, null, vendedorId);
    }

    const bloques = d.bloques || [];
    const bloquesVar = bloques.filter(b => b.cuenta !== 'fijo');
    const cobradas = d.cobradas || [];
    const regulares = cobradas.filter(c => !c.esFood);
    const food = cobradas.filter(c => c.esFood);

    // ── 1. Lo que ve el vendedor = lo que dice el comprobante ──────────────
    if (e) {
        const dif = Math.abs(r2(e.devengadoComision) - r2(d.devengadoComision));
        add('vendedor_igual', C, 'Lo que ve el vendedor = lo que dice el comprobante', dif <= 0.01 ? 'ok' : 'error',
            dif <= 0.01 ? `El vendedor ve ${usd(e.devengadoComision)} ganados este mes: lo mismo que el comprobante.`
                : `El vendedor ve ${usd(e.devengadoComision)} y el comprobante dice ${usd(d.devengadoComision)}. No pagues hasta aclararlo.`,
            [['Vendedor', usd(e.devengadoComision)], ['Comprobante', usd(d.devengadoComision)]]);
        if (num(e.base) > 0 || num(d.base) > 0) {
            const difB = Math.abs(r2(e.base) - r2(d.base));
            add('vendedor_igual_fijo', F, 'Sueldo: lo que ve el vendedor = el comprobante', difB <= 0.01 ? 'ok' : 'error',
                difB <= 0.01 ? `${usd(d.base)} de sueldo en los dos.` : `El vendedor ve ${usd(e.base)} de sueldo y el comprobante ${usd(d.base)}.`);
        }
    }

    // ── 2. El total = la suma de sus partes ────────────────────────────────
    const sumaVar = bloquesVar.reduce((s, b) => s + num(b.monto), 0);
    const okSuma = Math.abs(r2(sumaVar) - r2(d.devengadoComision)) <= TOL(bloquesVar.length);
    add('suma_bloques', C, 'El total es la suma de sus bonos y comisiones', okSuma ? 'ok' : 'error',
        okSuma ? `${bloquesVar.filter(b => num(b.monto)).map(b => `${b.nombre} ${usd(b.monto)}`).join(' + ') || 'Sin montos'} = ${usd(d.devengadoComision)}.`
            : `Las partes suman ${usd(sumaVar)} y el total dice ${usd(d.devengadoComision)}.`,
        [['Suma de las partes', usd(sumaVar)], ['Total', usd(d.devengadoComision)]]);
    const bFijo = bloques.find(b => b.id === 'fijo');
    if (num(d.base) > 0 || bFijo) {
        const okF = Math.abs(r2(bFijo ? bFijo.monto : 0) - r2(d.base)) <= 0.01;
        add('fijo_bloque', F, 'Sueldo fijo del período', okF ? 'ok' : 'error',
            okF ? `${usd(d.base)}${d.transicion ? ' (una quincena: período de transición)' : d.corto && !d.transicion ? ' (en proporción a los días del período)' : ''}.`
                : `El bloque de sueldo dice ${usd(bFijo?.monto)} y el período ${usd(d.base)}.`);
    }

    // Los cruces 3–9 rehacen el cálculo de HOY. Si el mes está congelado, lo que
    // se paga es lo congelado: se comparan aparte (cruce 10).
    const vivo = !d.congelado;

    // ── 3. Comisión % factura por factura ──────────────────────────────────
    const conPct = d.cfg ? d.cfg.comisionActiva !== false : true;
    if ((conPct && regulares.length) || num(d.comisionNivelMonto) > 0) {
        const suma = regulares.reduce((s, c) => s + c.monto * num(c.origenTasa) / 100, 0);
        const ok = Math.abs(suma - num(d.comisionNivelMonto)) <= TOL(regulares.length);
        add('comision_facturas', C, 'Comisión %: factura por factura', ok ? 'ok' : (vivo ? 'error' : 'aviso'),
            ok ? `${regulares.length} factura${regulares.length === 1 ? '' : 's'} cobrada${regulares.length === 1 ? '' : 's'} por ${usd(regulares.reduce((s, c) => s + c.monto, 0))}: cada una × la tasa del mes en que se facturó = ${usd(suma)}.`
                : `Factura por factura da ${usd(suma)} y el cálculo dice ${usd(d.comisionNivelMonto)}.`);
    }

    // ── 4. Bono por cobrar a tiempo ────────────────────────────────────────
    if (num(d.bonoCobranzaMonto) > 0 || (num(d.cfg?.bonusPuntualidad ?? d.bonoCobRate) > 0 && (d.facturasATiempo || []).length)) {
        const at = regulares.filter(c => c.aTiempo);
        const suma = at.reduce((s, c) => s + c.monto * num(c.origenBonoCobranza) / 100, 0);
        const ok = Math.abs(suma - num(d.bonoCobranzaMonto)) <= TOL(at.length);
        add('cobranza', C, 'Bono por cobrar a tiempo', ok ? 'ok' : (vivo ? 'error' : 'aviso'),
            ok ? `${at.length} factura${at.length === 1 ? '' : 's'} cobrada${at.length === 1 ? '' : 's'} a tiempo por ${usd(at.reduce((s, c) => s + c.monto, 0))} = ${usd(suma)}.`
                : `Las facturas a tiempo dan ${usd(suma)} y el cálculo dice ${usd(d.bonoCobranzaMonto)}.`);
    }

    // ── 5. Comisión foodservice y cuentas recuperadas ──────────────────────
    if ((num(d.cfg?.comisionFoodservice ?? d.tasaFood) > 0 && food.length) || num(d.comisionFoodMonto) > 0) {
        const suma = food.reduce((s, c) => s + c.monto * num(c.origenTasaFood) / 100, 0);
        const ok = Math.abs(suma - num(d.comisionFoodMonto)) <= TOL(food.length);
        add('food_pct', C, 'Comisión foodservice', ok ? 'ok' : (vivo ? 'error' : 'aviso'),
            ok ? `${food.length} factura${food.length === 1 ? '' : 's'} de foodservice por ${usd(food.reduce((s, c) => s + c.monto, 0))} = ${usd(suma)}.`
                : `Las facturas dan ${usd(suma)} y el cálculo dice ${usd(d.comisionFoodMonto)}.`);
    }
    const recup = d.recuperadas || [];
    if ((num(d.tasaRecup) > 0 && recup.length) || num(d.bonoRecupMonto) > 0) {
        const cob = recup.reduce((s, c) => s + c.monto, 0);
        const suma = cob * num(d.tasaRecup) / 100;
        const ok = Math.abs(suma - num(d.bonoRecupMonto)) <= TOL(1);
        add('recuperadas', C, 'Comisión por cuentas recuperadas', ok ? 'ok' : (vivo ? 'error' : 'aviso'),
            ok ? `${recup.length} factura${recup.length === 1 ? '' : 's'} heredada${recup.length === 1 ? '' : 's'} cobrada${recup.length === 1 ? '' : 's'} por ${usd(cob)} × ${pct(d.tasaRecup)} = ${usd(suma)}.`
                : `Da ${usd(suma)} y el cálculo dice ${usd(d.bonoRecupMonto)}.`);
    }

    // ── 6. Unidades contadas y escalón pagado ──────────────────────────────
    const lin = d.lineasUnidades || [];
    const usaUnidades = (d.bonoNivel && d.bonoNivel.activo) || d.cfg?.comisionActiva !== false;
    if (usaUnidades && (lin.length || num(d.unidades) > 0)) {
        const suma = lin.filter(f => !(d.separaFood && f.esFood)).reduce((s, f) => s + num(f.unidades), 0);
        const ok = Math.abs(suma - num(d.unidades)) < 0.5;
        const cobr = d.baseUnidades === 'cobradas';
        add('unidades', C, `Unidades ${cobr ? 'cobradas' : 'facturadas'} del mes`, ok ? 'ok' : (vivo ? 'error' : 'aviso'),
            ok ? `${lin.length} factura${lin.length === 1 ? '' : 's'} suman ${uds(suma)} uds${d.separaFood ? ' de retail (foodservice va aparte, en kg)' : ''}.`
                : `Las facturas suman ${uds(suma)} uds y el cálculo usa ${uds(d.unidades)}.`);
    }
    const escalon = (b, cant, medida) => {
        const esc = [...(b?.escalones || [])].sort((x, y) => x.umbral - y.umbral);
        if (!esc.length) return null;
        let logrado = null;
        esc.forEach(x => { if (num(cant) >= x.umbral) logrado = x; });
        const sig = esc.find(x => num(cant) < x.umbral && (!logrado || x.monto > logrado.monto));
        const f = medida === 'kg' ? kg1 : (v) => `${uds(v)} uds`;
        return {
            monto: logrado ? logrado.monto : 0,
            txt: logrado ? `${f(cant)} ≥ ${f(logrado.umbral)} (${logrado.etiqueta}) → ${usd(logrado.monto)}${sig ? `. El siguiente pide ${f(sig.umbral)}` : '. Es el escalón más alto'}.`
                : `${f(cant)} no llega al primer escalón (${f(esc[0].umbral)}) → $0.`,
        };
    };
    if (d.bonoNivel && d.bonoNivel.activo) {
        const x = escalon(d.bonoNivel, d.unidades, 'uds');
        if (x) {
            const ok = Math.abs(x.monto - num(d.bonoNivelMonto)) <= 0.01;
            add('escalon', C, 'Bono por escalones', ok ? 'ok' : (vivo ? 'error' : 'aviso'),
                ok ? x.txt : `La tabla de escalones da ${usd(x.monto)} y el cálculo dice ${usd(d.bonoNivelMonto)}.`);
        }
    }
    if (d.bonoNivelFood && d.bonoNivelFood.activo) {
        const x = escalon(d.bonoNivelFood, d.kgFood, 'kg');
        if (x) {
            const ok = Math.abs(x.monto - num(d.bonoNivelFoodMonto)) <= 0.01;
            add('escalon_food', C, 'Bono foodservice por escalones', ok ? 'ok' : (vivo ? 'error' : 'aviso'),
                ok ? x.txt : `La tabla da ${usd(x.monto)} y el cálculo dice ${usd(d.bonoNivelFoodMonto)}.`);
        }
    }

    // ── 7. Activación: semanas logradas ────────────────────────────────────
    const usdAct = num(d.bonoActivacionUSD);
    if (usdAct > 0 || num(d.bonoActRate) > 0) {
        const sem = d.semanas || [];
        if (!(num(d.carteraSize) > 0)) {
            add('activacion', C, 'Bono de activación de cartera', 'aviso',
                'El vendedor no tiene PDV activos a su nombre: la activación no se puede medir y paga $0. Si debía tener cartera, asígnala antes de pagar.');
        } else {
            const log = sem.filter(s => s.lograda).length;
            const okSem = log === num(d.semanasLogradas) && sem.length === num(d.semanasTotales);
            const esperadoUsd = num(d.semanasTotales) > 0 ? usdAct * log / num(d.semanasTotales) : 0;
            const okUsd = Math.abs(esperadoUsd - num(d.bonoActivacionUSDMonto)) <= 0.01;
            // La parte en % de lo cobrado: cada factura × su % × las semanas logradas del mes en que se facturó.
            const esperadoPct = regulares.reduce((s, c) => s + c.monto * (num(c.origenBonoAct) / 100) * num(c.origenFactor), 0);
            const okPct = Math.abs(esperadoPct - num(d.bonoActivacionMonto)) <= TOL(regulares.length);
            const ok = okSem && okUsd && okPct;
            add('activacion', C, 'Bono de activación de cartera', ok ? 'ok' : (vivo ? 'error' : 'aviso'),
                ok ? `${log} de ${sem.length} semanas con ${num(d.objetivo)} PDV o más activados (meta ${num(d.actThreshold)} % de ${num(d.carteraSize)})${usdAct > 0 ? `: ${usd(usdAct)} × ${log}/${sem.length} = ${usd(esperadoUsd)}` : ''}${num(d.bonoActRate) > 0 ? `${usdAct > 0 ? ' y' : ':'} ${usd(esperadoPct)} en % de lo cobrado` : ''}.`
                    : `Las semanas dan ${log} de ${sem.length} (${usd(esperadoUsd)}${num(d.bonoActRate) > 0 ? ` + ${usd(esperadoPct)} en %` : ''}); el cálculo usa ${num(d.semanasLogradas)} de ${num(d.semanasTotales)} (${usd(num(d.bonoActivacionUSDMonto) + num(d.bonoActivacionMonto))}).`);
        }
    }

    // ── 8. Crecimiento ─────────────────────────────────────────────────────
    const crec = (c, monto, titulo, unidad) => {
        if (!c || !c.activo) return;
        if (!c.aplica) { add(`crec_${unidad}`, C, titulo, 'ok', `${c.motivo || 'No aplica este mes.'} Paga $0.`); return; }
        const esperado = c.logrado ? num(c.montoUSD) : 0;
        const ok = Math.abs(esperado - num(monto)) <= 0.01;
        add(`crec_${unidad}`, C, titulo, ok ? 'ok' : (vivo ? 'error' : 'aviso'),
            ok ? `${pct(c.crecimientoPct)} contra el mes anterior (pide ${pct(c.pct)}) → ${usd(esperado)}.`
                : `Con ${pct(c.crecimientoPct)} corresponde ${usd(esperado)} y el cálculo dice ${usd(monto)}.`);
    };
    crec(d.crecimiento, d.bonoCrecimientoMonto, 'Bono de crecimiento', 'uds');
    crec(d.crecimientoFood, d.bonoCrecimientoFoodMonto, 'Bono de crecimiento foodservice', 'kg');

    // ── 9. Lo pagado = los pagos registrados ───────────────────────────────
    const pagos = d.pagos || [];
    const sumaPagos = pagos.reduce((s, l) => s + num(l.monto), 0);
    const okPag = Math.abs(sumaPagos - (num(d.pagadoComision) + num(d.pagadoFijo))) <= TOL(pagos.length);
    add('pagos', A, 'Los pagos registrados', okPag ? 'ok' : 'error',
        okPag ? `${pagos.length} pago${pagos.length === 1 ? '' : 's'} registrado${pagos.length === 1 ? '' : 's'} en este período por ${usd(sumaPagos)}.`
            : `Los pagos suman ${usd(sumaPagos)} y el estado de cuenta tiene ${usd(num(d.pagadoComision) + num(d.pagadoFijo))} pagados. Revisa el histórico de pagos.`);
    const okSalC = Math.abs((num(d.devengadoComision) - num(d.pagadoComision)) - num(d.saldoComision)) <= 0.01;
    add('saldo_variable', C, 'Lo que falta pagar de bonos y comisiones', okSalC ? 'ok' : 'error',
        `${usd(d.devengadoComision)} ganado − ${usd(d.pagadoComision)} pagado = ${usd(num(d.devengadoComision) - num(d.pagadoComision))}${okSalC ? '.' : `, pero el estado de cuenta dice ${usd(d.saldoComision)}.`}`);
    if (num(d.base) > 0 || num(d.pagadoFijo) > 0) {
        const okSalF = Math.abs((num(d.base) - num(d.pagadoFijo)) - num(d.saldoFijo)) <= 0.01;
        add('saldo_fijo', F, 'Lo que falta pagar de sueldo', okSalF ? 'ok' : 'error',
            `Fijo: ${usd(d.base)} − ${usd(d.pagadoFijo)} = ${usd(num(d.base) - num(d.pagadoFijo))}${okSalF ? '.' : `, pero el estado de cuenta dice ${usd(d.saldoFijo)}.`}`);
    }
    if (num(d.pagadoSinConcepto) > 0.005) {
        add('sin_concepto', A, 'Pagos sin concepto', 'aviso',
            `${usd(d.pagadoSinConcepto)} se registraron sin decir si eran fijo o comisiones: se aplicaron primero al fijo. Si no fue así, corrígelos en el histórico antes de pagar.`);
    }

    // ── 10. Estado del mes ─────────────────────────────────────────────────
    if (!d.cerrado) {
        add('en_curso', C, 'El mes todavía no cierra', 'aviso',
            'Lo que pagues ahora de bonos o comisiones es un adelanto: hasta el último día del mes el cálculo puede subir o bajar (cobros, facturas, semanas de activación).');
    } else if (d.congelado) {
        add('congelado', A, 'Mes cerrado y congelado', 'ok', 'Las cifras de este mes quedaron fijas al cerrarlo: lo que se paga no cambia aunque llegue un cobro tarde.');
    } else {
        add('sin_congelar', A, 'Mes cerrado sin congelar', 'aviso',
            'El mes ya cerró pero sus cifras no están congeladas: un cobro o una corrección en Zoho todavía las puede mover. Congélalo antes de pagar.');
    }

    // ── 11. Datos de las facturas ──────────────────────────────────────────
    const numerosPeriodo = new Set([...cobradas, ...recup, ...lin].map(f => String(f.numero)));
    const delPeriodo = facturas.filter(f => numerosPeriodo.has(String(f.numero)) && f.estado !== 'anulada');
    const conteo = {};
    facturas.filter(f => f.estado !== 'anulada').forEach(f => { const k = String(f.numero || ''); if (k) conteo[k] = (conteo[k] || 0) + 1; });
    const duplicadas = [...numerosPeriodo].filter(n => conteo[n] > 1);
    if (duplicadas.length) {
        add('duplicadas', C, 'Facturas repetidas', 'error',
            `${duplicadas.join(', ')} aparece${duplicadas.length === 1 ? '' : 'n'} dos veces: se contaría${duplicadas.length === 1 ? '' : 'n'} doble. Corrígelo en Conciliación antes de pagar.`);
    }
    const toD = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);
    const sinFechaPago = delPeriodo.filter(f => f.estado === 'pagada' && !f.fechaPago).map(f => f.numero);
    if (sinFechaPago.length) {
        add('sin_fecha_pago', C, 'Facturas cobradas sin fecha de cobro', 'aviso',
            `${sinFechaPago.join(', ')}: sin fecha de cobro se cuentan en el mes de la factura. Confírmalo en Zoho.`);
    }
    const pagoAntes = delPeriodo.filter(f => { const a = toD(f.fecha), b = toD(f.fechaPago); return a && b && b.getTime() < a.getTime() - 86400000; }).map(f => f.numero);
    if (pagoAntes.length) {
        add('pago_antes', C, 'Cobro con fecha anterior a la factura', 'aviso', `${pagoAntes.join(', ')}: revisa las fechas en Zoho.`);
    }
    if (num(precioUnidad) > 0) {
        const sosp = delPeriodo.filter(f => !f.unidadesNormalizadas && num(f.unidades) > 0 && num(f.monto) / num(f.unidades) > 1.5 * num(precioUnidad)).map(f => f.numero);
        if (sosp.length) {
            add('unidades_sospechosas', C, 'Unidades que parecen kilos', 'aviso',
                `${sosp.join(', ')}: el monto por unidad pasa de 1,5 veces el precio de lista. Pueden ser kilos contados como unidades. Usa «Recalcular unidades» en Conciliación.`);
        }
    }

    // ── 12. Datos al día con Zoho ──────────────────────────────────────────
    if (zohoSyncAt) {
        const h = (ahora.getTime() - new Date(zohoSyncAt).getTime()) / 3600000;
        add('zoho', C, 'Datos al día con Zoho', h > 5 ? 'aviso' : 'ok',
            h > 5 ? `La última actualización con Zoho fue hace ${Math.round(h)} h: puede haber cobros que GK todavía no ve. Actualiza antes de pagar.`
                : `Última actualización con Zoho hace ${h < 1 ? 'menos de 1 h' : `${Math.round(h)} h`}.`);
    }

    return resultado(cruces, d, vendedorId);
}

function resultado(cruces, d, vendedorId) {
    const errDe = (cuenta) => cruces.filter(c => c.nivel === 'error' && (c.cuenta === cuenta || c.cuenta === A));
    const avisos = cruces.filter(c => c.nivel === 'aviso');
    return {
        cruces,
        errores: { comision: errDe(C), fijo: errDe(F) },
        avisos,
        ok: cruces.filter(c => c.nivel === 'ok').length,
        firma: d ? firmaCalculo(contenidoFirma(d, vendedorId)) : null,
    };
}

/** ¿Se puede pagar esta cuenta? Un error de esa cuenta lo impide. */
export const puedePagar = (v, concepto) => !!v && (concepto === 'fijo' ? v.errores.fijo : v.errores.comision).length === 0;

/** Los avisos que tocan lo que se va a pagar (los del fijo no frenan un pago de comisiones, y al revés). */
export const avisosDe = (v, concepto) => (v?.avisos || []).filter(a => a.cuenta === A || a.cuenta === (concepto === 'fijo' ? F : C));

/**
 * La foto del cálculo que se guarda CON el pago (liquidaciones.calculo): lo que
 * se pagó, de dónde salió y qué cruces pasó. Con ella el comprobante demuestra
 * el pago aunque después el cálculo cambie.
 */
export function fotoDelCalculo(d, v, { concepto, monto, avisosRevisados = [] } = {}) {
    if (!d) return null;
    const fac = (lista, f) => (lista || []).slice(0, 200).map(f);
    return {
        firma: v?.firma || null,
        calculadoEn: new Date().toISOString(),
        mes: d.mes, rango: d.rango, cerrado: !!d.cerrado, congelado: !!d.congelado,
        devengadoComision: r2(d.devengadoComision), base: r2(d.base),
        pagadoComisionAntes: r2(d.pagadoComision), pagadoFijoAntes: r2(d.pagadoFijo),
        saldoComisionAntes: r2(d.saldoComision), saldoFijoAntes: r2(d.saldoFijo),
        saldoDespues: r2((concepto === 'fijo' ? d.saldoFijo : d.saldoComision) - num(monto)),
        bloques: (d.bloques || []).map(b => ({ id: b.id, nombre: b.nombre, monto: r2(b.monto), detalle: b.detalle || '', cuenta: b.cuenta })),
        unidades: r2(d.unidades), baseUnidades: d.baseUnidades || 'facturadas', kgFood: r2(d.kgFood),
        cobradoRegular: r2(d.cobradoRegular), cobradoFood: r2(d.cobradoFood), cobradoRecup: r2(d.cobradoRecup),
        facturas: fac(d.cobradas, c => ({ n: String(c.numero), m: r2(c.monto), food: !!c.esFood, t: num(c.origenTasa) })),
        recuperadas: fac(d.recuperadas, c => ({ n: String(c.numero), m: r2(c.monto) })),
        lineas: fac(d.lineasUnidades, f => ({ n: String(f.numero), u: r2(f.unidades) })),
        semanas: (d.semanas || []).map(s => ({ n: s.n, a: s.activados, o: s.objetivo, ok: !!s.lograda })),
        cruces: (v?.cruces || []).map(c => ({ id: c.id, cuenta: c.cuenta, titulo: c.titulo, nivel: c.nivel, detalle: c.detalle })),
        avisosRevisados,
    };
}

/** Compara la foto guardada al pagar con el cálculo de hoy. */
export function compararConHoy(foto, firmaHoy, desgloseHoy) {
    if (!foto || !foto.firma) return { estado: 'sin_foto' };
    if (firmaHoy && foto.firma === firmaHoy) return { estado: 'igual' };
    const hoy = desgloseHoy ? r2(desgloseHoy.devengadoComision) : null;
    return { estado: 'distinto', antes: foto.devengadoComision, hoy, baseAntes: foto.base, baseHoy: desgloseHoy ? r2(desgloseHoy.base) : null };
}
