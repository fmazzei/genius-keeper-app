// RUTA: functions/handlers/vigilanteComisiones.js
//
// REVISIÓN DIARIA DE LAS COMISIONES (pedido del dueño, 11-oct: "que el agente
// revise constantemente toda esta parte de las comisiones y que todo se esté
// calculando adecuadamente"). Núcleo puro: recibe los datos ya leídos y devuelve
// problemas en el mismo formato que `vigilanteReglas.evaluar`.
//
// Usa el MISMO motor que calcula lo que se le paga al vendedor
// (`generado/vendedorMeta.cjs`, empaquetado de `src/utils/vendedorMeta.js` por
// `tools/generarMotorFunciones.mjs`): si hubiera una copia propia, el vigilante
// podría decir "todo bien" con una cuenta distinta a la de la pantalla.
//
// Qué revisa: que los DATOS que entran al cálculo estén bien (vendedor, fechas,
// unidades, cuenta recuperada, duplicados) y que los meses cerrados cuadren
// (congelados que ya no coinciden, pagos de más sin compensar, pagos que no caen
// en ningún mes, meses sin congelar). Los avisos van SOLO al máster: son datos de
// dinero (nunca al vendedor).

const M = require('./generado/vendedorMeta.cjs');
const { fila, seccion, diaTxt } = require('./avisoDetalle');

const DIA = 86400000;
const TZ = 4 * 3600000;   // Venezuela, UTC−4

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const usd = (n) => `$${num(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toMs = (v) => {
    if (!v) return 0;
    if (typeof v === 'number') return v > 1e11 ? v : v * 1000;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (v.seconds != null) return v.seconds * 1000;
    const t = Date.parse(v);
    return Number.isNaN(t) ? 0 : t;
};
const diaCaracas = (ms) => new Date(ms - TZ).toISOString().slice(0, 10);

/**
 * Día de CALENDARIO de un campo de factura, como lo ve la app en Venezuela.
 * Zoho guarda el día a las 00:00 UTC (ese es el día); un instante con hora real
 * (pago registrado por el webhook) se lee en hora de Caracas.
 */
function diaCal(v) {
    if (!v) return null;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const ms = toMs(v);
    if (!ms) return null;
    return ms % DIA === 0 ? new Date(ms).toISOString().slice(0, 10) : diaCaracas(ms);
}

// El servidor corre en UTC y la app en Caracas. El motor trabaja con fechas
// "locales": se le entregan los días como texto (los lee como día local) y el
// "ahora" y los cierres en la hora de reloj de Caracas, para que los límites de
// cada mes caigan EXACTAMENTE donde caen en la pantalla del vendedor.
const relojFactura = (f) => ({ ...f, fecha: diaCal(f.fecha), fechaPago: diaCal(f.fechaPago), vencimiento: diaCal(f.vencimiento) });
const relojCierre = (c) => {
    const ms = toMs(c.congeladoEn);
    return { ...c, congeladoEn: ms ? new Date(ms - TZ) : c.congeladoEn };
};

const cuentaEnCartera = (f) => !!f && f.estado !== 'anulada' && f.ausenteEnZoho !== true && f.estado !== 'borrador' && f.esReposicion !== true;

// Una factura como fila del detalle: quién, número y fechas, y su monto.
const cliente = (f) => f.clienteName || f.customerName || f.zohoCustomerId || 'Cliente sin nombre';
const filaFactura = (f, extra, tono) => fila(`${f.numero || 's/n'} · ${cliente(f)}`,
    [`factura ${diaTxt(diaCal(f.fecha))}`, f.estado === 'pagada' ? `cobrada ${diaTxt(diaCal(f.fechaPago))}` : f.estado, extra].filter(Boolean).join(' · '),
    usd(f.monto), tono);
const MOTIVO_CONFLICTO = {
    asignado_a_otro: 'asignado a mano a otro vendedor',
    marcado_oficina: 'marcado Oficina',
    varias_carteras: 'está en la cartera de dos vendedores',
};

// Resumen de un mes de empleo, con las MISMAS cifras del estado de cuenta.
const filasMes = (e) => [
    fila('Período', null, `Mes ${e.mes} · ${e.rango}`),
    fila('Facturado (define el nivel)', `meta ${num(e.metaMensual).toLocaleString('es-VE')} uds`, `${num(e.unidades).toLocaleString('es-VE')} uds · ${e.nivel} ${num(e.tasa)} %`),
    fila('Cobrado en el mes', null, usd(e.cobrado)),
    e.comisionNivelMonto != null ? fila('Comisión por nivel', null, usd(e.comisionNivelMonto)) : null,
    num(e.bonoCobranzaMonto) ? fila('Bono cobranza', null, usd(e.bonoCobranzaMonto)) : null,
    num(e.bonoActivacionMonto) ? fila('Bono activación', `${num(e.actSemanasLogradas)} de ${num(e.actSemanasTotales)} semanas`, usd(e.bonoActivacionMonto)) : null,
    num(e.cobradoRecup) ? fila('Cuentas recuperadas', `cobrado ${usd(e.cobradoRecup)} al ${num(e.tasaRecup)} %`, usd(num(e.cobradoRecup) * num(e.tasaRecup) / 100)) : null,
    num(e.comisionFoodMonto) ? fila('Foodservice', `cobrado ${usd(e.cobradoFood)}`, usd(e.comisionFoodMonto)) : null,
    num(e.base) ? fila('Base (sueldo + viáticos)', null, usd(e.base)) : null,
    fila('Devengado', e.congelado ? 'congelado' : 'calculado hoy', usd(e.devengadoTotal)),
    fila('Pagado', null, usd(e.pagado)),
    fila('Saldo', num(e.saldo) < 0 ? 'pagado de más' : null, usd(e.saldo), num(e.saldo) < -0.5 ? 'rojo' : null),
];

const lista = (xs, n = 4) => xs.slice(0, n).join(', ') + (xs.length > n ? ` y ${xs.length - n} más` : '');

/**
 * @param {object} d
 *   vendedores  users_metadata (role vendedor, activos) con {uid, nombre, fechaIngreso, commissionConfig}
 *   facturas    TODAS las facturas_vendedor ({id, ...})
 *   clientes    clientes_zoho
 *   carteras    vendor_clients
 *   liquidaciones, cerradas (comisiones_cerradas)
 *   appConfig   settings/appConfig (zohoCarteraCarnets)
 *   masters, administradores   uids (los dos reciben; el vendedor nunca)
 *   ahoraMs, config
 */
function evaluarComisiones(d, cfg) {
    const ahora = d.ahoraMs;
    const hoy = diaCaracas(ahora);
    // Máster + administración (quien concilia y paga las comisiones). Nunca el vendedor.
    const masters = [...new Set([...(d.masters || []), ...(d.administradores || [])])];
    const problemas = [];
    const tol = num(cfg.toleranciaComisionUsd) || 1;
    const facturas = d.facturas || [];
    const vendedores = d.vendedores || [];
    const nombreV = Object.fromEntries(vendedores.map(v => [v.uid, v.nombre || v.name || v.email || v.uid]));
    const add = (p) => problemas.push({
        severidad: 'importante', para: 'master', uids: masters, entrega: 'resumen', grupo: 'pesado',
        desde: p.desde || ahora, ...p,
    });

    // ── 1. Datos de entrada de las facturas ──
    const clientes = Object.fromEntries((d.clientes || []).map(c => [String(c.customerId || c.id), c]));
    const activas = facturas.filter(cuentaEnCartera);

    // 1a. Número repetido en dos documentos: la cuenta podría sumar la misma factura dos veces.
    const porNumero = {};
    activas.forEach(f => { if (f.numero) (porNumero[f.numero] = porNumero[f.numero] || []).push(f); });
    const dup = Object.entries(porNumero).filter(([, l]) => l.length > 1);
    if (dup.length) add({
        clave: 'comision_duplicadas', tipo: 'comision_duplicadas',
        titulo: `Comisiones: ${dup.length} factura${dup.length !== 1 ? 's' : ''} repetida${dup.length !== 1 ? 's' : ''} en GK`,
        cuerpo: `El mismo número está en dos documentos: ${lista(dup.map(([n]) => n))}. El estado de cuenta toma una sola, pero otras pantallas pueden sumar las dos.`,
        causa: 'Entró por dos vías (webhook y barrido) con documentos distintos.',
        accion: 'Abrir Gestión de facturas Zoho y eliminar la copia.',
        datos: { numeros: dup.slice(0, 30).map(([n, l]) => ({ numero: n, ids: l.map(x => x.id) })) },
        detalle: [seccion('Facturas repetidas', dup.flatMap(([n, l]) => l.map((f, i) => fila(`${n} · ${cliente(f)}`,
            `documento ${f.id}${i === 0 ? '' : ' (copia)'} · ${f.estado || '—'} · ${nombreV[f.vendedorId] || 'sin vendedor'}`, usd(f.monto), i ? 'ambar' : null))))],
    });

    // 1b. Cobrada sin vendedor: nadie cobra esa comisión. Solo las cobradas desde que
    //     entró el vendedor más antiguo (lo anterior es historia sin dueño).
    const ingresos = vendedores.map(v => diaCal(v.fechaIngreso)).filter(Boolean).sort();
    const desdeSinVend = ingresos[0] || hoy;
    const sinVend = activas.filter(f => f.estado === 'pagada' && !f.vendedorId
        && !(f.zohoCustomerId && clientes[String(f.zohoCustomerId)]?.esOficina === true)
        && (diaCal(f.fechaPago) || diaCal(f.fecha) || '') >= desdeSinVend);
    if (sinVend.length) {
        const monto = sinVend.reduce((s, f) => s + num(f.monto), 0);
        const clientesSin = [...new Set(sinVend.map(f => f.clienteName || f.customerName || f.zohoCustomerId || '?'))];
        add({
            clave: 'comision_sin_vendedor', tipo: 'comision_sin_vendedor',
            titulo: `Comisiones: ${sinVend.length} factura${sinVend.length !== 1 ? 's' : ''} cobrada${sinVend.length !== 1 ? 's' : ''} sin vendedor (${usd(monto)})`,
            cuerpo: `De ${clientesSin.length} cliente${clientesSin.length !== 1 ? 's' : ''} (${lista(clientesSin, 3)}) que no están ni en la cartera de un vendedor ni marcados Oficina. Esa comisión no la cobra nadie.`,
            causa: 'Cliente de Zoho sin asignar y sin PDV en ninguna cartera.',
            accion: 'En Clientes y PDV, asignar el cliente a su vendedor o marcarlo Oficina.',
            datos: { facturas: sinVend.length, monto: Math.round(monto * 100) / 100, clientes: clientesSin.slice(0, 20) },
            detalle: [
                seccion('Por cliente', clientesSin.map(c => {
                    const l = sinVend.filter(f => cliente(f) === c);
                    return fila(c, `${l.length} factura${l.length !== 1 ? 's' : ''} cobrada${l.length !== 1 ? 's' : ''}${l[0]?.zohoCustomerId ? ` · carnet ${l[0].zohoCustomerId}` : ''}`, usd(l.reduce((x, f) => x + num(f.monto), 0)));
                })),
                seccion('Facturas', [...sinVend].sort((a, b) => cliente(a).localeCompare(cliente(b))).map(f => filaFactura(f)),
                    `Cuentan las cobradas desde el ${diaTxt(desdeSinVend)}, ingreso del primer vendedor.`),
            ],
        });
    }

    // 1c. Factura de un vendedor distinto al dueño actual de su carnet: la reasignación no se completó.
    const desalineadas = activas.filter(f => {
        if (!f.zohoCustomerId) return false;
        const c = clientes[String(f.zohoCustomerId)];
        if (!c) return false;
        if (c.esOficina === true) return !!f.vendedorId;
        return !!c.vendedorId && f.vendedorId !== c.vendedorId;
    });
    if (desalineadas.length) add({
        clave: 'comision_atribucion', tipo: 'comision_atribucion',
        titulo: `Comisiones: ${desalineadas.length} factura${desalineadas.length !== 1 ? 's' : ''} atribuida${desalineadas.length !== 1 ? 's' : ''} a quien no es el dueño del cliente`,
        cuerpo: `Ejemplos: ${lista(desalineadas.map(f => `${f.numero} (${nombreV[f.vendedorId] || 'sin vendedor'} → debería ser ${clientes[String(f.zohoCustomerId)].esOficina ? 'Oficina' : (nombreV[clientes[String(f.zohoCustomerId)].vendedorId] || 'otro vendedor')})`), 3)}.`,
        causa: 'Se cambió el dueño del cliente y sus facturas no se movieron.',
        accion: 'En Clientes y PDV, volver a guardar el vendedor de ese cliente (mueve sus facturas).',
        datos: { numeros: desalineadas.slice(0, 30).map(f => f.numero) },
        detalle: [seccion('Facturas', desalineadas.map(f => {
            const c = clientes[String(f.zohoCustomerId)];
            return filaFactura(f, `hoy: ${nombreV[f.vendedorId] || 'sin vendedor'} → dueño: ${c.esOficina ? 'Oficina' : (nombreV[c.vendedorId] || c.vendedorName || 'otro vendedor')}`, 'ambar');
        }))],
    });

    // 1d. Conflictos que el barrido NO resolvió solo (la cartera dice una cosa y el carnet otra).
    const cc = (d.appConfig || {}).zohoCarteraCarnets || {};
    const conflictos = Array.isArray(cc.conflictos) ? cc.conflictos : [];
    const sueltos = Array.isArray(cc.sueltos) ? cc.sueltos : [];
    if (conflictos.length || sueltos.length) {
        const ej = [...conflictos.map(c => c.nombre), ...sueltos.map(s => s.nombre)].filter(Boolean);
        add({
            clave: 'comision_cartera_conflicto', tipo: 'comision_cartera_conflicto',
            titulo: `Comisiones: ${conflictos.length + sueltos.length} cliente${conflictos.length + sueltos.length !== 1 ? 's' : ''} con cartera y carnet en desacuerdo`,
            cuerpo: `${lista(ej, 3)}. El sistema no decide solo cuando hay una asignación hecha a mano, Oficina o dos carteras.`,
            causa: 'La cartera del vendedor y la asignación del cliente en Zoho no coinciden.',
            accion: 'Revisar el desplegable ámbar de Clientes y PDV.',
            datos: { conflictos: conflictos.length, sueltos: sueltos.length },
            detalle: [
                seccion('En desacuerdo', conflictos.map(c => fila(c.nombre || c.customerId,
                    [MOTIVO_CONFLICTO[c.motivo] || c.motivo,
                        c.vendedorCartera ? `su cartera es de ${nombreV[c.vendedorCartera] || c.vendedorCartera}` : null,
                        c.vendedorCarnet ? `el carnet dice ${nombreV[c.vendedorCarnet] || c.vendedorCarnet}` : null,
                        Array.isArray(c.vendedores) ? `carteras: ${c.vendedores.map(x => nombreV[x] || x).join(' y ')}` : null,
                        Array.isArray(c.pdvs) && c.pdvs.length ? `PDV: ${c.pdvs.slice(0, 3).join(', ')}` : null].filter(Boolean).join(' · '),
                    null, 'ambar'))),
                ...(sueltos.length ? [seccion('Heredados por cartera que ya no están en ninguna', sueltos.map(x => fila(x.nombre || x.customerId,
                    `sigue a nombre de ${nombreV[x.vendedorId] || x.vendedorId}`)), 'No se sueltan solos: soltarlos le quitaría comisiones ya ganadas.')] : []),
            ],
        });
    }

    // ── 2. Por vendedor: fechas, unidades, cuentas recuperadas y meses cerrados ──
    const precioMax = (v) => {
        const c = v.commissionConfig || {};
        return Math.max(num(c.precioUnidad) || 5.6, num(c.precioUnidadFoodservice) || 4.8);
    };
    const factorKg = num(cfg.factorUnidadesSospechosas) || 1.5;
    // Activación: la cartera son las SUCURSALES (carnets de Zoho) del vendedor con
    // un PDV activo, la misma regla de la app (carteraActivacion).
    const carteraDe = {};
    (d.clientes || []).filter(c => c.vendedorId).forEach(c => { (carteraDe[c.vendedorId] = carteraDe[c.vendedorId] || []).push(c); });

    vendedores.forEach(v => {
        const nombre = nombreV[v.uid];
        const suyas = facturas.filter(f => f.vendedorId === v.uid);
        const suyasActivas = suyas.filter(cuentaEnCartera);
        const ingreso = diaCal(v.fechaIngreso);

        // 2a. Sin fecha de ingreso: no hay períodos, no hay estado de cuenta.
        if (!ingreso) {
            if (suyasActivas.length) add({
                clave: `comision_sin_ingreso:${v.uid}`, tipo: 'comision_sin_ingreso',
                titulo: `${nombre}: sin fecha de ingreso`,
                cuerpo: `Tiene ${suyasActivas.length} facturas, pero sin fecha de ingreso no se puede calcular su mes de empleo ni su estado de cuenta.`,
                causa: 'Falta el dato en su ficha.', accion: 'Editar el vendedor y poner su fecha de ingreso.',
                datos: { vendedorId: v.uid },
                detalle: [seccion('Sus facturas', suyasActivas.map(f => filaFactura(f)))],
            });
            return;
        }

        // 2b. Fechas que mueven el cobro de mes: pagada sin fecha de pago, o pagada antes de facturarse.
        const sinFechaPago = suyasActivas.filter(f => f.estado === 'pagada' && !diaCal(f.fechaPago));
        const pagoAntes = suyasActivas.filter(f => f.estado === 'pagada' && diaCal(f.fechaPago) && diaCal(f.fecha) && diaCal(f.fechaPago) < diaCal(f.fecha));
        if (sinFechaPago.length || pagoAntes.length) add({
            clave: `comision_fechas:${v.uid}`, tipo: 'comision_fechas',
            titulo: `${nombre}: ${sinFechaPago.length + pagoAntes.length} cobro${sinFechaPago.length + pagoAntes.length !== 1 ? 's' : ''} con fecha que no sirve`,
            cuerpo: [
                sinFechaPago.length ? `${sinFechaPago.length} pagada${sinFechaPago.length !== 1 ? 's' : ''} sin fecha de pago (${lista(sinFechaPago.map(f => f.numero), 3)}): su comisión se cuenta en el mes de la factura, no en el del cobro.` : '',
                pagoAntes.length ? `${pagoAntes.length} con pago anterior a la factura (${lista(pagoAntes.map(f => f.numero), 3)}).` : '',
            ].filter(Boolean).join(' '),
            causa: 'Zoho no entregó la fecha del pago o se cargó mal.',
            accion: 'Conciliar con Zoho; si sigue, corregir la fecha en Gestión de facturas.',
            datos: { vendedorId: v.uid, sinFechaPago: sinFechaPago.map(f => f.numero).slice(0, 20), pagoAntes: pagoAntes.map(f => f.numero).slice(0, 20) },
            detalle: [
                ...(sinFechaPago.length ? [seccion('Pagadas sin fecha de pago', sinFechaPago.map(f => filaFactura(f, null, 'ambar')))] : []),
                ...(pagoAntes.length ? [seccion('Pago anterior a la factura', pagoAntes.map(f => filaFactura(f, null, 'rojo')))] : []),
            ],
        });

        // 2c. Cuenta recuperada mal marcada (p. ej. se corrigió la fecha de ingreso):
        //     cambia la tasa (5 % flat) y si cuenta o no a la meta.
        const malRecup = suyasActivas.filter(f => {
            const dia = diaCal(f.fecha);
            if (!dia) return false;
            return (dia < ingreso) !== (f.recuperada === true);
        });
        if (malRecup.length) add({
            clave: `comision_recuperada:${v.uid}`, tipo: 'comision_recuperada',
            titulo: `${nombre}: ${malRecup.length} factura${malRecup.length !== 1 ? 's' : ''} con "cuenta recuperada" mal marcada`,
            cuerpo: `Según su ingreso (${ingreso}), ${lista(malRecup.map(f => `${f.numero} ${f.recuperada ? 'no es' : 'sí es'} recuperada`), 3)}. Eso cambia su tasa y si cuenta a la meta.`,
            causa: 'Se cambió la fecha de ingreso después de que llegaron las facturas.',
            accion: 'En Clientes y PDV, volver a guardar el vendedor de esos clientes (recalcula sus facturas).',
            datos: { vendedorId: v.uid, numeros: malRecup.map(f => f.numero).slice(0, 30) },
            detalle: [seccion('Facturas', malRecup.map(f => filaFactura(f,
                f.recuperada ? 'marcada recuperada, es posterior al ingreso' : 'marcada normal, es previa al ingreso', 'ambar')),
                `Ingreso del vendedor: ${diaTxt(ingreso)}. Recuperada = factura anterior a esa fecha (5 % flat, no cuenta a la meta).`)],
        });

        // 2d. Kilos contados como unidades: el importe por unidad no puede ser el de un kilo.
        const tope = precioMax(v) * factorKg;
        const kg = suyasActivas.filter(f => f.unidadesNormalizadas !== true && num(f.unidades) > 0
            && num(f.monto) / num(f.unidades) > tope);
        if (kg.length) add({
            clave: `comision_unidades:${v.uid}`, tipo: 'comision_unidades',
            titulo: `${nombre}: ${kg.length} factura${kg.length !== 1 ? 's' : ''} con kilos contados como unidades`,
            cuerpo: `${lista(kg.map(f => `${f.numero} (${num(f.unidades)} uds a ${usd(num(f.monto) / num(f.unidades))} c/u)`), 3)}. Sus unidades salen bajas y pueden bajarle el nivel.`,
            causa: 'Factura en kg que no se convirtió a unidades de venta.',
            accion: 'Gestión de facturas Zoho → "Recalcular unidades".',
            datos: { vendedorId: v.uid, numeros: kg.map(f => f.numero).slice(0, 30) },
            detalle: [seccion('Facturas', kg.map(f => filaFactura(f,
                `${num(f.unidades)} uds → ${usd(num(f.monto) / num(f.unidades))} por unidad`, 'ambar')),
                `Precio de lista más alto: ${usd(precioMax(v))}; se sospecha por encima de ${usd(tope)} por unidad.`)],
        });

        // 2e. Meses: lo mismo que ve administración, con el motor de la app.
        const cerrados = {};
        (d.cerradas || []).filter(c => c.vendedorId === v.uid && c.periodKey).forEach(c => { cerrados[c.periodKey] = relojCierre(c); });
        const liqs = (d.liquidaciones || []).filter(l => l.vendedorId === v.uid);
        const carteraV = M.carteraActivacion(carteraDe[v.uid] || [], d.pos || null);
        const opts = { carteraSize: carteraV.length, cartera: carteraV, cerrados, ahora: new Date(ahora - TZ) };
        const meta = { ...v, fechaIngreso: ingreso };
        const insumo = suyas.map(relojFactura);
        let estados;
        try { estados = M.computeEstadosDeCuenta(meta, insumo, liqs, opts); } catch (e) { estados = null; }
        if (!estados) return;
        const porKey = Object.fromEntries(estados.map(e => [e.periodKey, e]));

        // Pago registrado contra un mes que no existe: no se descuenta de ningún lado.
        const huerfanas = liqs.filter(l => !l.periodKey || !porKey[l.periodKey]);
        if (huerfanas.length) add({
            clave: `comision_liquidacion_huerfana:${v.uid}`, tipo: 'comision_liquidacion_huerfana',
            titulo: `${nombre}: ${huerfanas.length} pago${huerfanas.length !== 1 ? 's' : ''} que no cae${huerfanas.length !== 1 ? 'n' : ''} en ningún mes`,
            cuerpo: `${lista(huerfanas.map(l => `${usd(l.monto)} del ${l.fecha || '—'} (mes ${l.periodKey || 'sin mes'})`), 3)}. No se está descontando de su saldo.`,
            causa: 'Se cambió la fecha de ingreso después de registrar el pago.',
            accion: 'En Liquidaciones, borrar ese pago y registrarlo contra el mes correcto.',
            datos: { vendedorId: v.uid, ids: huerfanas.map(l => l.id).slice(0, 20) },
            detalle: [
                seccion('Pagos', huerfanas.map(l => fila(usd(l.monto), [`registrado el ${l.fecha || '—'}`, `contra el mes que empieza ${l.periodKey ? diaTxt(l.periodKey) : '(sin mes)'}`, l.nota].filter(Boolean).join(' · '), null, 'rojo'))),
                seccion('Meses que sí existen', estados.slice().reverse().map(e => fila(`Mes ${e.mes}`, e.rango, `empieza ${diaTxt(e.periodKey)}`))),
            ],
        });

        const cerradosRows = estados.filter(e => e.cerrado);
        // Pagado de más sin compensar: el neto de los meses cerrados es negativo.
        const neto = cerradosRows.reduce((s, e) => s + num(e.saldo), 0);
        if (neto < -tol) add({
            clave: `comision_pagado_de_mas:${v.uid}`, tipo: 'comision_pagado_de_mas',
            titulo: `${nombre}: se le pagó ${usd(-neto)} de más`,
            cuerpo: `Sumando sus meses cerrados, lo pagado supera lo devengado en ${usd(-neto)} (${lista(cerradosRows.filter(e => e.saldo < -tol).map(e => `Mes ${e.mes} ${usd(e.saldo)}`), 3)}).`,
            causa: 'Un cobro que pertenece a un mes posterior se pagó con un mes anterior.',
            accion: 'Al pagar el mes en curso, usar "Pagar descontando lo adelantado".',
            datos: { vendedorId: v.uid, neto: Math.round(neto * 100) / 100 },
            detalle: [
                seccion('Meses cerrados', cerradosRows.slice().reverse().map(e => fila(`Mes ${e.mes} · ${e.rango}`,
                    `devengado ${usd(e.devengadoTotal)} · pagado ${usd(e.pagado)}${e.congelado ? ' · congelado' : ''}`, usd(e.saldo), num(e.saldo) < -tol ? 'rojo' : num(e.saldo) > tol ? 'ambar' : null))),
                seccion('Neto', [fila('Lo pagado de más', 'se descuenta al pagar el mes en curso', usd(-neto), 'rojo')]),
            ],
        });

        // Mes cerrado hace días y sin congelar: su cifra todavía se puede mover.
        const diasCongelar = num(cfg.diasCongelarPeriodo) || 10;
        cerradosRows.filter(e => !e.congelado).forEach(e => {
            const fin = finDePeriodo(ingreso, e.mes);
            const dias = Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${fin}T00:00:00Z`)) / DIA);
            if (dias < diasCongelar) return;
            add({
                clave: `comision_sin_congelar:${v.uid}:${e.periodKey}`, tipo: 'comision_sin_congelar',
                titulo: `${nombre}: Mes ${e.mes} cerró hace ${dias} días y no está congelado`,
                cuerpo: `Devengado hoy ${usd(e.devengadoTotal)}, pagado ${usd(e.pagado)}. Mientras no se congele, una corrección de facturas de ese mes cambia la cifra.`,
                causa: 'Falta el paso "Cerrar y congelar".', accion: 'Liquidaciones → revisar el comprobante → "Cerrar y congelar".',
                datos: { vendedorId: v.uid, periodKey: e.periodKey, dias },
                detalle: [seccion(`Mes ${e.mes} hoy`, filasMes(e), `Cerró el ${diaTxt(fin)}.`)],
            });
        });

        // Mes congelado (modelo actual) que ya no coincide con sus propias facturas:
        // se anuló o cambió una factura incluida después del cierre.
        cerradosRows.filter(e => e.congelado && cerrados[e.periodKey]?.modelo === 'cobro').forEach(e => {
            const fr = cerrados[e.periodKey];
            const vivo = { ...cerrados, [e.periodKey]: { modelo: 'cobro', cobrosIncluidos: fr.cobrosIncluidos || [], congeladoEn: fr.congeladoEn, periodKey: e.periodKey } };
            let hoyMes;
            try { hoyMes = M.computeEstadosDeCuenta(meta, insumo, liqs, { ...opts, cerrados: vivo }).find(x => x.periodKey === e.periodKey); } catch { hoyMes = null; }
            if (!hoyMes) return;
            const delta = num(hoyMes.devengadoComision) - num(fr.devengadoComision);
            // Las facturas que entraron en el cierre y hoy ya no están igual.
            const porNum = {};
            suyas.concat(facturas.filter(f => f.vendedorId !== v.uid)).forEach(f => { if (f.numero && !porNum[f.numero]) porNum[f.numero] = f; });
            const cambiadas = (fr.cobrosIncluidos || []).map(n => {
                const f = porNum[n];
                if (!f) return fila(n, 'ya no existe en GK', null, 'rojo');
                if (!cuentaEnCartera(f)) return filaFactura(f, 'hoy fuera de la cartera (anulada, borrador o ausente en Zoho)', 'rojo');
                if (f.estado !== 'pagada') return filaFactura(f, 'ya no figura como cobrada', 'rojo');
                if (f.vendedorId !== v.uid) return filaFactura(f, `hoy es de ${nombreV[f.vendedorId] || 'otro vendedor o de nadie'}`, 'rojo');
                return null;
            }).filter(Boolean);
            if (Math.abs(delta) <= tol) return;
            add({
                clave: `comision_congelado_difiere:${v.uid}:${e.periodKey}`, tipo: 'comision_congelado_difiere',
                titulo: `${nombre}: el Mes ${e.mes} congelado ya no cuadra (${delta > 0 ? '+' : ''}${usd(delta)})`,
                cuerpo: `Se congeló en ${usd(fr.devengadoComision)} de comisión y con las facturas de hoy daría ${usd(hoyMes.devengadoComision)}.`,
                causa: 'Después del cierre se anuló, editó o reasignó una factura de ese mes.',
                accion: 'Revisar el comprobante; si la corrección es buena, reabrir y volver a congelar.',
                datos: { vendedorId: v.uid, periodKey: e.periodKey, congelado: num(fr.devengadoComision), hoy: num(hoyMes.devengadoComision) },
                detalle: [
                    seccion('Comisión del mes', [
                        fila('Congelada', `el ${fr.congeladoEn instanceof Date ? fr.congeladoEn.toISOString().slice(0, 10).split('-').reverse().join('/') : '—'}`, usd(fr.devengadoComision)),
                        fila('Con las facturas de hoy', null, usd(hoyMes.devengadoComision)),
                        fila('Diferencia', null, `${delta > 0 ? '+' : ''}${usd(delta)}`, 'rojo'),
                    ]),
                    seccion('Facturas del cierre que cambiaron', cambiadas,
                        cambiadas.length ? null : 'Ninguna factura cobrada del cierre cambió: la diferencia viene de la facturación del mes (una factura del mes anulada o editada cambió el nivel).'),
                ],
            });
        });
    });

    problemas.forEach(p => { p.grupo = 'pesado'; });
    return problemas;
}

/**
 * CIERRE AUTOMÁTICO de los meses (pedido del dueño, 23-oct: "arréglalo de una vez
 * por todas"). Antes congelar dependía de que alguien pulsara "Cerrar y congelar"
 * en Liquidaciones; nadie lo hizo y los meses ya pagados se seguían moviendo con
 * cada corrección de datos (p. ej. marcar un cliente como foodservice).
 *
 * Devuelve, por vendedor, el snapshot de cada mes CERRADO que todavía no tiene
 * cierre: exactamente la fila del estado de cuenta (el MISMO motor y los mismos
 * insumos que ven el vendedor y administración), sin pagado ni saldo, que siguen
 * en vivo. Con el modelo de cobro (`cobrosIncluidos`) congelar al cerrar es
 * seguro: un pago que Zoho registre después con fecha de ese mes pasa al mes
 * siguiente, no se pierde.
 * @returns {Array<{id, data}>} documentos para `comisiones_cerradas`.
 */
function cierresAutomaticos(d) {
    const ahora = d.ahoraMs;
    const facturas = d.facturas || [];
    const carteraDe = {};
    (d.clientes || []).filter(c => c.vendedorId).forEach(c => { (carteraDe[c.vendedorId] = carteraDe[c.vendedorId] || []).push(c); });
    const out = [];
    (d.vendedores || []).forEach(v => {
        const ingreso = diaCal(v.fechaIngreso);
        if (!ingreso) return;
        const cerrados = {};
        (d.cerradas || []).filter(c => c.vendedorId === v.uid && c.periodKey).forEach(c => { cerrados[c.periodKey] = relojCierre(c); });
        const liqs = (d.liquidaciones || []).filter(l => l.vendedorId === v.uid);
        const carteraV = M.carteraActivacion(carteraDe[v.uid] || [], d.pos || null);
        const opts = { carteraSize: carteraV.length, cartera: carteraV, cerrados, ahora: new Date(ahora - TZ) };
        let estados;
        try { estados = M.computeEstadosDeCuenta({ ...v, fechaIngreso: ingreso }, facturas.filter(f => f.vendedorId === v.uid).map(relojFactura), liqs, opts); } catch { estados = null; }
        (estados || []).filter(e => e.cerrado && !e.congelado && !cerrados[e.periodKey]).forEach(e => {
            const { pagado, saldo, congelado, ...snap } = e;
            out.push({
                id: `${v.uid}_${e.periodKey}`,
                // Sin undefined (Firestore los rechaza) ni tipos raros: la fila es JSON.
                data: { ...JSON.parse(JSON.stringify(snap)), vendedorId: v.uid, congeladoPor: 'automatico', congeladoPorEmail: null },
            });
        });
    });
    return out;
}

/** Último día ('YYYY-MM-DD') del Mes `mes` de empleo (misma regla de aniversario que el motor). */
function finDePeriodo(ingreso, mes) {
    const [y, m, d] = ingreso.split('-').map(Number);
    const fin = new Date(Date.UTC(y, m - 1 + mes, d));     // inicio del mes siguiente
    return new Date(fin.getTime() - DIA).toISOString().slice(0, 10);
}

const TIPOS_COMISION = [
    'comision_duplicadas', 'comision_sin_vendedor', 'comision_atribucion', 'comision_cartera_conflicto',
    'comision_sin_ingreso', 'comision_fechas', 'comision_recuperada', 'comision_unidades',
    'comision_liquidacion_huerfana', 'comision_pagado_de_mas', 'comision_sin_congelar', 'comision_congelado_difiere',
];

module.exports = { evaluarComisiones, cierresAutomaticos, TIPOS_COMISION, diaCal, finDePeriodo };
