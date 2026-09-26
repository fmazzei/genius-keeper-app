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

import { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { cuentaEnCartera, saldoAbierto } from '@/utils/facturaEstado.js';
import { facturacionPorPdv, pdvActivo, ciudadDePdv, agruparPdvPorCliente, DESDE_VENTAS } from '@/utils/facturacionPdv.js';

const EMPRESA_GK = 'lacteoca';

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

export function useTableroGerencial() {
    const [data, setData]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');
    const [nonce, setNonce]     = useState(0);
    const refetch = useCallback(() => setNonce(n => n + 1), []);

    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true); setError('');
            try {
                // Una sola tanda: 8 lecturas en paralelo, no en cascada. Cada
                // una cae a vacío por su cuenta — que Kroma no responda (reglas,
                // datos sin migrar) NO debe dejar en blanco el lado comercial.
                const vacio = { docs: [] };
                const kq = (col) => getDocs(query(collection(db, col), where('empresaId', '==', EMPRESA_GK))).catch(() => vacio);
                const [fact, cli, dev, pagar, prov, compras, prod, invMat, posSnap] = await Promise.all([
                    getDocs(collection(db, 'facturas_vendedor')).catch(() => vacio),
                    getDocs(collection(db, 'clientes_zoho')).catch(() => vacio),
                    getDocs(collection(db, 'devoluciones')).catch(() => vacio),
                    getDocs(collection(db, 'cuentas_por_pagar')).catch(() => vacio),
                    kq('kroma_suppliers'),
                    kq('kroma_compras'),
                    kq('kroma_production_logs'),
                    kq('kroma_inventory_materials'),
                    // TODOS los PDV, activos e inactivos: "inactivo" en GK
                    // significa frecuencia de visita 0, no borrado, y el tablero
                    // los muestra por separado.
                    getDocs(collection(db, 'pos')).catch(() => vacio),
                ]);
                if (!alive) return;
                const m = (s) => (s.docs || []).map(d => ({ id: d.id, ...d.data() }));
                setData({
                    facturas:   m(fact),
                    clientes:   m(cli),
                    devoluciones: m(dev),
                    porPagar:   m(pagar),
                    proveedores: m(prov).filter(p => p.active !== false),
                    compras:    m(compras),
                    produccion: m(prod).filter(p => p.active !== false),
                    invMateriales: m(invMat).filter(i => i.active !== false),
                    pos: m(posSnap).filter(p => p.type !== 'deposito'),
                });
            } catch (e) {
                console.error(e);
                if (alive) setError('No se pudo cargar el tablero.');
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [nonce]);

    const kpis = useMemo(() => {
        if (!data) return null;
        const now = new Date();
        const mEste = mesKey(now);

        // ── 1. Cuentas por COBRAR (misma definición que la banda ¿Cobramos?)
        const abiertas = data.facturas.filter(f => cuentaEnCartera(f) && f.estado !== 'pagada' && saldoAbierto(f) > 0.005);
        const porCobrar = abiertas.reduce((s, f) => s + saldoAbierto(f), 0);
        const cobrarVencido = abiertas
            .filter(f => { const v = toDate(f.vencimiento); return v && v < now; })
            .reduce((s, f) => s + saldoAbierto(f), 0);

        // ── 2. Cuentas por PAGAR (bills de Zoho)
        const pagarAbiertas = data.porPagar.filter(b =>
            b.ausenteEnZoho !== true && !['pagada', 'anulada', 'borrador'].includes(b.estado) && Number(b.balance) > 0.005);
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
        data.produccion.forEach(p => {
            const k = mesKey(toDate(p.fechaInicio) || toDate(p.createdAt)); if (!k) return;
            if (!prodPorMes[k]) prodPorMes[k] = { lotes: 0, litros: 0, kg: 0 };
            prodPorMes[k].lotes += 1;
            prodPorMes[k].litros += Number(p.litrosNetos) || 0;
            prodPorMes[k].kg     += Number(p.rendimientoKg) || 0;
        });

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
            porPagar, pagarVencido, nPorPagar: pagarAbiertas.length, pagarAbiertas,
            nClientes: data.clientes.length, conVendedor, oficina,
            nProveedores: data.proveedores.length,
            ventasMes: ventasPorMes[mEste]?.monto || 0, ventasMesN: ventasPorMes[mEste]?.n || 0, ventasPorMes,
            devMes: devPorMes[mEste]?.unidades || 0, devMesMonto: devPorMes[mEste]?.monto || 0, devPorMes,
            comprasMes: comprasPorMes[mEste]?.monto || 0, comprasPorMes,
            capitalInsumos: 0,   // se calcula abajo (necesita el costo del material)
            prodMes: prodPorMes[mEste] || { lotes: 0, litros: 0, kg: 0 }, prodPorMes,
            mesActual: mEste,
        };
    }, [data]);

    return { ...data, kpis, loading, error, refetch };
}
