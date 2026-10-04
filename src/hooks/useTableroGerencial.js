// RUTA: src/hooks/useTableroGerencial.js
//
// Datos del TABLERO GERENCIAL — las 8 preguntas que el dueño quiere ver de un
// vistazo: qué nos deben, qué debemos, a quién le vendemos, a quién le
// compramos, cuánto vendimos, cuánto nos devolvieron, cuánto compramos y cuánto
// produjimos.
//
// Cruza las DOS bases del negocio:
//   · GK  — `facturas_vendedor`, `clientes_zoho`, `devoluciones`, `cuentas_por_pagar`
//   · Kroma — `kroma_suppliers`, `kroma_compras`, `kroma_production_logs`,
//             `kroma_inventory_materials`
//
// Sobre `empresaId`: las colecciones `kroma_*` son multi-empresa y sus reglas
// exigen que la consulta traiga el `where` EXPLÍCITO (una query de lista sin él
// devuelve documentos de otras empresas — ver CLAUDE.md). GK, en cambio, es la
// app comercial de UNA empresa: Lacteoca. Por eso la constante, que además es
// el mismo default que usan las reglas cuando el campo falta.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { collection, getDocs, getDoc, doc, query, where } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { cuentaEnCartera, saldoAbierto } from '@/utils/facturaEstado.js';
import { kgProducidos, fechaProduccion, esProduccionAbierta, faltaEmpacar } from '@/Kroma/estadoPlanta.js';
import { indexById, indexPackagingAssignments, buildMilkPriceLookup } from '@/Kroma/costeoLote.js';
import { costeoLote, listaDeCompras, capitalEnInsumos, relacionProveedores } from '@/utils/tableroPlanta.js';
import { facturacionPorPdv, pdvActivo, ciudadDePdv, agruparPdvPorCliente, DESDE_VENTAS } from '@/utils/facturacionPdv.js';

const EMPRESA_GK = 'lacteoca';

// Categorías de cuentas por pagar, en el orden en que se muestran. Salen del
// campo "Categoría CxP" de la ficha del proveedor en Zoho (vacío = proveedor).
export const CATEGORIAS_CXP = [
    { id: 'nomina',    nombre: 'Personal – nómina' },
    { id: 'destajo',   nombre: 'Personal – destajo' },
    { id: 'proveedor', nombre: 'Proveedores' },
];

const toDate = (t) => t?.toDate?.() || (t ? new Date(t) : null);
const mesKey = (d) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : null;

/** Últimos N meses como claves "YYYY-MM", del más viejo al más nuevo. */
/**
 * Los últimos `n` meses, pero NUNCA antes de `DESDE_VENTAS`. Una serie que
 * arranca en meses vacíos por ser anteriores al corte se lee como una caída de
 * ventas que nunca ocurrió.
 */
export { DESDE_VENTAS };

export function ultimosMeses(n = 12, hasta = new Date()) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(hasta.getFullYear(), hasta.getMonth() - i, 1);
        if (d < DESDE_VENTAS) continue;
        out.push({ key: mesKey(d), label: d.toLocaleDateString('es-VE', { month: 'short', year: '2-digit' }), fecha: d });
    }
    return out;
}

// Las 12 fuentes del tablero. Cada una llega POR SU CUENTA y la tarjeta que la
// necesita se pinta en cuanto llega: antes el tablero esperaba a TODAS (una
// sola tanda con Promise.all) y bastaba una lenta —en el arranque en frío
// compiten con las visitas y los PDV que el resto de la app abre al entrar—
// para dejar los 8 recuadros vacíos con "Cargando el tablero…".
const m = (s) => (s?.docs || []).map(d => ({ id: d.id, ...d.data() }));
const activos = (arr) => arr.filter(x => x.active !== false);
const colGK = (nombre) => () => getDocs(collection(db, nombre));
// Las kroma_* llevan el `where` explícito que exigen las reglas multi-empresa.
const colKroma = (nombre) => () => getDocs(query(collection(db, nombre), where('empresaId', '==', EMPRESA_GK)));
const FUENTES = [
    { clave: 'facturas',        nombre: 'facturas',            leer: colGK('facturas_vendedor'),           tx: m },
    { clave: 'clientes',        nombre: 'clientes',            leer: colGK('clientes_zoho'),               tx: m },
    { clave: 'devoluciones',    nombre: 'devoluciones',        leer: colGK('devoluciones'),                tx: m },
    { clave: 'porPagar',        nombre: 'cuentas por pagar',   leer: colGK('cuentas_por_pagar'),           tx: m },
    { clave: 'proveedores',     nombre: 'proveedores',         leer: colKroma('kroma_suppliers'),          tx: s => activos(m(s)) },
    { clave: 'compras',         nombre: 'compras',             leer: colKroma('kroma_compras'),            tx: m },
    { clave: 'produccion',      nombre: 'producción',          leer: colKroma('kroma_production_logs'),    tx: s => activos(m(s)) },
    { clave: 'invMateriales',   nombre: 'inventario de insumos', leer: colKroma('kroma_inventory_materials'), tx: s => activos(m(s)) },
    // TODOS los PDV, activos e inactivos: "inactivo" en GK significa frecuencia
    // de visita 0, no borrado, y el tablero los muestra por separado.
    { clave: 'pos',             nombre: 'puntos de venta',     leer: colGK('pos'),                         tx: s => m(s).filter(p => p.type !== 'deposito') },
    // Maestro de materiales: precios para el costo de cada lote, la lista de
    // compras y el capital en insumos.
    { clave: 'materiales',      nombre: 'materiales',          leer: colKroma('kroma_materials'),          tx: s => activos(m(s)) },
    // Recepciones de leche: la "compra" de los proveedores de leche.
    { clave: 'recepcionesLeche', nombre: 'recepciones de leche', leer: colKroma('kroma_milk_reception'),   tx: m },
    // Estado de la última lectura de Zoho (cuentas por pagar, nómina, cruce).
    { clave: 'appConfig',       nombre: 'configuración',       leer: () => getDoc(doc(db, 'settings', 'appConfig')), tx: s => (s?.exists?.() ? s.data() : {}) },
];
const DATA_VACIA = Object.fromEntries(FUENTES.map(f => [f.clave, f.clave === 'appConfig' ? {} : []]));

// Lo último que se cargó, en memoria: si el tablero se vuelve a montar (tirar
// para actualizar, volver de otra sección) arranca con los números de antes en
// pantalla y los refresca por detrás, en vez de volver a los recuadros vacíos.
let memoria = null;   // { data, recibidas: [claves] }

const ESPERA_REPETIR = 15000;   // si no llegó, se pide otra vez (una sola)
const ESPERA_RENDIR  = 45000;   // si tampoco, se declara y se deja lo que había

export function useTableroGerencial() {
    const [data, setData]             = useState(() => memoria?.data || DATA_VACIA);
    const [recibidas, setRecibidas]   = useState(() => new Set(memoria?.recibidas || []));
    const [pendientes, setPendientes] = useState(() => new Set(FUENTES.map(f => f.clave)));
    const [incompleto, setIncompleto] = useState([]);   // nombres de lo que no respondió
    const [nonce, setNonce]           = useState(0);
    const refetch = useCallback(() => setNonce(n => n + 1), []);

    useEffect(() => {
        let alive = true;
        const timers = [];
        const faltantes = [];
        let quedan = FUENTES.length;
        setPendientes(new Set(FUENTES.map(f => f.clave)));
        setIncompleto([]);

        const terminar = (f, resultado, falto) => {
            if (!alive) return;
            if (resultado !== undefined) {
                const valor = f.tx(resultado);
                setData(prev => {
                    const next = { ...prev, [f.clave]: valor };
                    memoria = { data: next, recibidas: [...new Set([...(memoria?.recibidas || []), f.clave])] };
                    return next;
                });
                setRecibidas(prev => { const n = new Set(prev); n.add(f.clave); return n; });
            }
            if (falto) faltantes.push(f.nombre);
            setPendientes(prev => { const n = new Set(prev); n.delete(f.clave); return n; });
            quedan--;
            if (quedan === 0) setIncompleto([...faltantes]);
        };

        FUENTES.forEach(f => {
            let hecho = false;
            const fin = (r, falto) => { if (hecho) return; hecho = true; terminar(f, r, falto); };
            const lanzar = () => f.leer().then(
                r => fin(r, false),
                // Un error (reglas, colección inexistente) no se arregla
                // reintentando: esa tarjeta queda vacía y las demás siguen.
                (e) => { console.warn('Tablero:', f.nombre, e?.code || e); fin(undefined, false); },
            );
            lanzar();
            timers.push(setTimeout(() => { if (!hecho) lanzar(); }, ESPERA_REPETIR));
            timers.push(setTimeout(() => fin(undefined, true), ESPERA_RENDIR));
        });

        return () => { alive = false; timers.forEach(clearTimeout); };
    }, [nonce]);

    const loading = pendientes.size > 0;

    // Si algo no llegó, se vuelve a pedir solo: a los 20 s (máx. 3 veces
    // seguidas) y cada vez que la persona regresa a la app.
    const autoReintentos = useRef(0);
    useEffect(() => {
        if (!incompleto.length) { if (!loading) autoReintentos.current = 0; return undefined; }
        if (loading) return undefined;
        const t = autoReintentos.current < 3 ? setTimeout(() => { autoReintentos.current++; refetch(); }, 20000) : null;
        const alVolver = () => { if (document.visibilityState === 'visible') refetch(); };
        try { document.addEventListener('visibilitychange', alVolver); } catch (_) { /* nada */ }
        return () => {
            if (t) clearTimeout(t);
            try { document.removeEventListener('visibilitychange', alVolver); } catch (_) { /* nada */ }
        };
    }, [incompleto, loading, refetch]);

    // ¿Esta tarjeta todavía no tiene NINGÚN dato para mostrar? (primera carga)
    const esperando = useCallback((...claves) => claves.some(c => !recibidas.has(c) && pendientes.has(c)), [recibidas, pendientes]);
    // Nombres de lo que sigue en camino — para decirlo en pantalla.
    const enCamino = FUENTES.filter(f => pendientes.has(f.clave)).map(f => f.nombre);
    const error = '';

    const kpis = useMemo(() => {
        const now = new Date();
        const mEste = mesKey(now);

        // ── 1. Cuentas por COBRAR (misma definición que la banda ¿Cobramos?)
        const abiertas = data.facturas.filter(f => cuentaEnCartera(f) && f.estado !== 'pagada' && saldoAbierto(f) > 0.005);
        const porCobrar = abiertas.reduce((s, f) => s + saldoAbierto(f), 0);
        const cobrarVencido = abiertas
            .filter(f => { const v = toDate(f.vencimiento); return v && v < now; })
            .reduce((s, f) => s + saldoAbierto(f), 0);

        // ── 2. Cuentas por PAGAR (bills de Zoho)
        // Abierta = lo que el servidor marcó (`abierta`: estatus open / overdue /
        // partially_paid con saldo). Los documentos anteriores a ese campo caen
        // al criterio viejo hasta la siguiente conciliación.
        const pagarAbiertas = data.porPagar.filter(b =>
            b.ausenteEnZoho !== true && Number(b.balance) > 0.005
            && (typeof b.abierta === 'boolean' ? b.abierta : !['pagada', 'anulada', 'borrador'].includes(b.estado)))
            .map(b => ({ ...b, categoria: CATEGORIAS_CXP.some(c => c.id === b.categoria) ? b.categoria : 'proveedor' }));
        // Tres bloques: el personal primero, porque son los pagos más urgentes.
        const pagarPorCategoria = CATEGORIAS_CXP.map(c => {
            const items = pagarAbiertas.filter(b => b.categoria === c.id);
            return {
                ...c, items,
                total: items.reduce((s, b) => s + (Number(b.balance) || 0), 0),
                vencido: items.filter(b => { const v = toDate(b.vencimiento); return v && v < now; })
                    .reduce((s, b) => s + (Number(b.balance) || 0), 0),
            };
        });
        const porPagar = pagarAbiertas.reduce((s, b) => s + (Number(b.balance) || 0), 0);
        const pagarVencido = pagarAbiertas
            .filter(b => { const v = toDate(b.vencimiento); return v && v < now; })
            .reduce((s, b) => s + (Number(b.balance) || 0), 0);

        // ── 3. Clientes (registro de Zoho por carnet)
        const conVendedor = data.clientes.filter(c => c.vendedorId).length;
        const oficina     = data.clientes.filter(c => c.esOficina === true).length;

        // ── 5. Ventas: mes en curso + histórico mensual
        const enCartera = data.facturas.filter(cuentaEnCartera);
        const ventasPorMes = {};
        enCartera.forEach(f => {
            const k = mesKey(toDate(f.fecha)); if (!k) return;
            if (!ventasPorMes[k]) ventasPorMes[k] = { monto: 0, n: 0 };
            ventasPorMes[k].monto += Number(f.monto) || 0;
            ventasPorMes[k].n += 1;
        });

        // ── 6. Devoluciones: unidades y $ por mes
        const devPorMes = {};
        data.devoluciones.forEach(d => {
            const k = mesKey(toDate(d.fecha)); if (!k) return;
            if (!devPorMes[k]) devPorMes[k] = { unidades: 0, monto: 0, n: 0 };
            devPorMes[k].unidades += Number(d.unidades) || 0;
            devPorMes[k].monto    += Number(d.montoNotaCredito) || 0;
            devPorMes[k].n += 1;
        });

        // ── 7. Compras: libro nuevo (arranca vacío) + capital inmovilizado
        const comprasPorMes = {};
        data.compras.forEach(c => {
            const k = mesKey(toDate(c.fecha)); if (!k) return;
            if (!comprasPorMes[k]) comprasPorMes[k] = { monto: 0, n: 0 };
            comprasPorMes[k].monto += Number(c.costoTotal) || 0;
            comprasPorMes[k].n += 1;
        });

        // ── 8. Producción: lotes, litros y kg por mes
        const prodPorMes = {};
        // Solo lotes CERRADOS, fechados por cuándo se produjeron, y con los
        // KILOS reales: antes sumaba `rendimientoKg`, que es la razón L/kg
        // (~7 por lote), como si fueran kilos.
        data.produccion.filter(p => p.estado === 'completada').forEach(p => {
            const k = mesKey(fechaProduccion(p)); if (!k) return;
            if (!prodPorMes[k]) prodPorMes[k] = { lotes: 0, litros: 0, kg: 0 };
            prodPorMes[k].lotes += 1;
            prodPorMes[k].litros += Number(p.litrosNetos) || 0;
            prodPorMes[k].kg     += kgProducidos(p) || 0;
        });

        // ── Planta: lotes activos con su costo, compras y proveedores ──
        const materialsById = indexById(data.materiales || []);
        const ctxCosto = {
            materialsById,
            packagingByKey: indexPackagingAssignments(data.materiales || []),
            milkLookup: buildMilkPriceLookup(data.materiales || []),
        };
        const lotesActivos = data.produccion.filter(esProduccionAbierta)
            .sort((a, b) => (fechaProduccion(b) || 0) - (fechaProduccion(a) || 0));
        const lotesCerrados = data.produccion.filter(p => p.estado === 'completada')
            .sort((a, b) => (fechaProduccion(b) || 0) - (fechaProduccion(a) || 0))
            .map(p => ({ log: p, costo: costeoLote(p, ctxCosto) }));
        const compra = listaDeCompras(data.materiales, data.invMateriales);
        // Sin facturas de proveedor en Zoho (hoy la deuda vive en saldos iniciales
        // y asientos), la cifra fiel es el NETO de cada ficha de proveedor:
        // por pagar − créditos sin aplicar = saldo de Cuentas por pagar en la
        // balanza. Cuando existan bills, mandan ellas.
        const saldoProvZ = data.appConfig?.zohoSaldoProveedores || null;
        const fichasNeto = pagarAbiertas.length === 0 && saldoProvZ
            ? (saldoProvZ.proveedores || [])
                .map(v => ({ proveedor: v.nombre, balance: Math.max(0, (Number(v.porPagar) || 0) - (Number(v.creditos) || 0)), deFicha: true }))
                .filter(v => v.balance > 0.005)
            : [];
        const fuentePorPagar = pagarAbiertas.length > 0 ? 'bills' : (fichasNeto.length > 0 ? 'fichas' : null);
        const porPagarFichas = fichasNeto.reduce((s, v) => s + v.balance, 0);
        // La deuda con el PERSONAL (nómina y destajo) no es de proveedores de la
        // planta: no se cruza contra la lista de proveedores de Kroma.
        const relProv = relacionProveedores(data.proveedores, data.compras, data.recepcionesLeche,
            fuentePorPagar === 'fichas' ? fichasNeto : pagarAbiertas.filter(b => b.categoria === 'proveedor'));
        const estadoPorPagar = data.appConfig?.zohoPorPagarEstado || null;
        const planta = {
            lotesActivos,
            litrosEnCurso: lotesActivos.reduce((s, p) => s + (Number(p.litrosNetos) || Number(p.litrosIngresados) || 0), 0),
            lotesSinEnvasar: data.produccion.filter(faltaEmpacar).length,
            lotesCerrados,
            compra,
            capitalInsumos: capitalEnInsumos(materialsById, data.invMateriales),
            proveedoresRel: relProv.filas,
            facturasSinProveedor: relProv.facturasSinProveedor,
            provConCompras: relProv.filas.filter(f => f.nMovimientos > 0).length,
            provConDeuda: relProv.filas.filter(f => f.deuda > 0.005).length,
            estadoPorPagar,
            fuentePorPagar, porPagarFichas, nPorPagarFichas: fichasNeto.length,
            // Control cruzado: saldo que cada ficha de proveedor de Zoho dice que
            // se le debe. Se muestra cuando el listado de bills no cuadra.
            saldoProveedores: data.appConfig?.zohoSaldoProveedores || null,
            crucePorPagar: data.appConfig?.zohoCrucePorPagar || null,
            proximaNomina: data.appConfig?.zohoProximaNomina || null,
        };

        // ── Puntos de venta, por PESO de facturación ──
        // Desde 2026: es el corte que pidió el socio para las ventas, y la lista
        // se ordena por lo que cada PDV facturó en ese período.
        const pos = data.pos || [];
        const facturado = facturacionPorPdv(pos, data.facturas, { desde: DESDE_VENTAS });
        const conPeso = pos.map(p => ({
            ...p,
            activo:    pdvActivo(p),
            ciudad:    ciudadDePdv(p),
            facturado: facturado.get(p.id)?.monto || 0,
            nFacturas: facturado.get(p.id)?.nFacturas || 0,
        })).sort((a, b) => b.facturado - a.facturado);   // el peso manda
        const pdvActivos   = conPeso.filter(p => p.activo);
        const pdvInactivos = conPeso.filter(p => !p.activo);
        const ciudades = [...new Set(conPeso.map(p => p.ciudad))].sort((a, b) => a.localeCompare(b));
        // El acordeón: cada razón social con sus puntos de venta adentro.
        const porCarnet = {};
        (data.clientes || []).forEach(c => { if (c.customerId) porCarnet[c.customerId] = c; });
        const clientesConPdv = agruparPdvPorCliente(conPeso, porCarnet);

        return {
            pdv: conPeso, pdvActivos, pdvInactivos, ciudades, clientesConPdv,
            nPdvActivos: pdvActivos.length, nPdvInactivos: pdvInactivos.length,
            porCobrar, cobrarVencido, nPorCobrar: abiertas.length, abiertas,
            porPagar, pagarVencido, nPorPagar: pagarAbiertas.length, pagarAbiertas, pagarPorCategoria,
            nClientes: data.clientes.length, conVendedor, oficina,
            nProveedores: data.proveedores.length,
            ventasMes: ventasPorMes[mEste]?.monto || 0, ventasMesN: ventasPorMes[mEste]?.n || 0, ventasPorMes,
            devMes: devPorMes[mEste]?.unidades || 0, devMesMonto: devPorMes[mEste]?.monto || 0, devPorMes,
            comprasMes: comprasPorMes[mEste]?.monto || 0, comprasPorMes,
            prodMes: prodPorMes[mEste] || { lotes: 0, litros: 0, kg: 0 }, prodPorMes,
            mesActual: mEste,
            ...planta,
        };
    }, [data]);

    return { ...data, kpis, loading, error, refetch, incompleto, esperando, enCamino };
}
