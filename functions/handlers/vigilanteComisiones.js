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

const lista = (xs, n = 4) => xs.slice(0, n).join(', ') + (xs.length > n ? ` y ${xs.length - n} más` : '');

/**
 * @param {object} d
 *   vendedores  users_metadata (role vendedor, activos) con {uid, nombre, fechaIngreso, commissionConfig}
 *   facturas    TODAS las facturas_vendedor ({id, ...})
 *   clientes    clientes_zoho
 *   carteras    vendor_clients
 *   liquidaciones, cerradas (comisiones_cerradas)
 *   appConfig   settings/appConfig (zohoCarteraCarnets)
 *   masters     uids
 *   ahoraMs, config
 */
function evaluarComisiones(d, cfg) {
    const ahora = d.ahoraMs;
    const hoy = diaCaracas(ahora);
    const masters = d.masters || [];
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
        });
    }

    // ── 2. Por vendedor: fechas, unidades, cuentas recuperadas y meses cerrados ──
    const precioMax = (v) => {
        const c = v.commissionConfig || {};
        return Math.max(num(c.precioUnidad) || 5.6, num(c.precioUnidadFoodservice) || 4.8);
    };
    const factorKg = num(cfg.factorUnidadesSospechosas) || 1.5;
    const carteraDe = {};
    (d.carteras || []).filter(c => c.active === true).forEach(c => { (carteraDe[c.vendedorId] = carteraDe[c.vendedorId] || []).push(c); });

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
        });

        // 2e. Meses: lo mismo que ve administración, con el motor de la app.
        const cerrados = {};
        (d.cerradas || []).filter(c => c.vendedorId === v.uid && c.periodKey).forEach(c => { cerrados[c.periodKey] = relojCierre(c); });
        const liqs = (d.liquidaciones || []).filter(l => l.vendedorId === v.uid);
        const opts = { carteraSize: M.tamanoCartera(carteraDe[v.uid] || []), cerrados, ahora: new Date(ahora - TZ) };
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
            });
        });

        // Mes congelado (modelo actual) que ya no coincide con sus propias facturas:
        // se anuló o cambió una factura incluida después del cierre.
        cerradosRows.filter(e => e.congelado && cerrados[e.periodKey]?.modelo === 'cobro').forEach(e => {
            const fr = cerrados[e.periodKey];
            const vivo = { ...cerrados, [e.periodKey]: { modelo: 'cobro', cobrosIncluidos: fr.cobrosIncluidos || [], congeladoEn: fr.congeladoEn, periodKey: e.periodKey } };
            let fila;
            try { fila = M.computeEstadosDeCuenta(meta, insumo, liqs, { ...opts, cerrados: vivo }).find(x => x.periodKey === e.periodKey); } catch { fila = null; }
            if (!fila) return;
            const delta = num(fila.devengadoComision) - num(fr.devengadoComision);
            if (Math.abs(delta) <= tol) return;
            add({
                clave: `comision_congelado_difiere:${v.uid}:${e.periodKey}`, tipo: 'comision_congelado_difiere',
                titulo: `${nombre}: el Mes ${e.mes} congelado ya no cuadra (${delta > 0 ? '+' : ''}${usd(delta)})`,
                cuerpo: `Se congeló en ${usd(fr.devengadoComision)} de comisión y con las facturas de hoy daría ${usd(fila.devengadoComision)}.`,
                causa: 'Después del cierre se anuló, editó o reasignó una factura de ese mes.',
                accion: 'Revisar el comprobante; si la corrección es buena, reabrir y volver a congelar.',
                datos: { vendedorId: v.uid, periodKey: e.periodKey, congelado: num(fr.devengadoComision), hoy: num(fila.devengadoComision) },
            });
        });
    });

    problemas.forEach(p => { p.grupo = 'pesado'; });
    return problemas;
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

module.exports = { evaluarComisiones, TIPOS_COMISION, diaCal, finDePeriodo };
