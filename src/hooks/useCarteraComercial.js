// RUTA: src/hooks/useCarteraComercial.js
//
// Datos compartidos por Comercial → Vendedores y por "Esta semana" (máster /
// gerencia): vendedores activos, facturas y la cartera de cada vendedor.
// Antes vivía dentro de SeguimientoComercial; se extrajo para que las dos
// pantallas lean EXACTAMENTE lo mismo (si no, el desempeño de un vendedor y su
// fila en "Esta semana" podrían contar distinto).

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { computeSeguidor } from '@/utils/seguidorSemanal.js';
import { evaluarDesempeno, evaluarAnio, ventanasVendedor } from '@/utils/desempenoVendedor.js';
import { computeMetaMensual } from '@/utils/vendedorMeta.js';
import { DEFAULT_COMMISSION_CONFIG } from '@/Components/CommissionConstructor.jsx';

export const TODOS = '__todos__';

export function useCarteraComercial({ posList = [], reports = [] } = {}) {
    const [vendedores, setVendedores] = useState([]);
    const [facturas, setFacturas] = useState([]);
    const [cartera, setCartera]   = useState({});   // vendedorId → { pos:Set, chains:Set }
    // Registro de gestiones de venta y planes semanales (13-oct). `null` = no se
    // pudieron leer: el pilar lo dice en vez de marcar un cero.
    const [gestiones, setGestiones] = useState(null);
    const [planes, setPlanes]       = useState(null);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState('');

    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true); setError('');
            try {
                // Solo hace falta: a) las facturas de los últimos 12 meses (la
                // "última factura" por PDV y el histórico navegable) y b) las
                // ABIERTAS de cualquier fecha (la cobranza vencida puede ser
                // vieja). Índices de un solo campo: sin índices compuestos.
                const hace12Meses = new Date();
                hace12Meses.setMonth(hace12Meses.getMonth() - 12);

                const [uSnap, fRecientes, fAbiertas, cSnap, gSnap, pSnap] = await Promise.all([
                    getDocs(query(collection(db, 'users_metadata'), where('role', '==', 'vendedor'))),
                    getDocs(query(collection(db, 'facturas_vendedor'), where('fecha', '>=', Timestamp.fromDate(hace12Meses))))
                        .catch(() => ({ docs: [] })),
                    getDocs(query(collection(db, 'facturas_vendedor'), where('estado', 'in', ['pendiente', 'vencida'])))
                        .catch(() => ({ docs: [] })),
                    getDocs(collection(db, 'vendor_clients')).catch(() => ({ docs: [] })),
                    getDocs(query(collection(db, 'gestiones_venta'), where('fecha', '>=', Timestamp.fromDate(hace12Meses)))).catch(() => null),
                    getDocs(collection(db, 'planes_venta')).catch(() => null),
                ]);
                if (!alive) return;
                setVendedores(uSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(v => v.active !== false));
                const porId = new Map();
                [...(fRecientes.docs || []), ...(fAbiertas.docs || [])]
                    .forEach(d => porId.set(d.id, { id: d.id, ...d.data() }));
                setFacturas([...porId.values()]);
                // La cartera se asigna por PDV directo o por CADENA completa.
                const mapa = {};
                (cSnap.docs || []).forEach(d => {
                    const c = d.data();
                    if (!c.vendedorId || c.active === false || (c.estado && c.estado !== 'activo')) return;
                    if (!mapa[c.vendedorId]) mapa[c.vendedorId] = { pos: new Set(), chains: new Set() };
                    if (c.posId) mapa[c.vendedorId].pos.add(c.posId);
                    if (c.chain && c.chain !== 'Automercados Individuales') mapa[c.vendedorId].chains.add(c.chain);
                });
                setCartera(mapa);
                setGestiones(gSnap ? gSnap.docs.map(d => ({ id: d.id, ...d.data() })) : null);
                setPlanes(pSnap ? pSnap.docs.map(d => ({ id: d.id, ...d.data() })) : null);
            } catch (e) {
                if (alive) setError('No se pudo cargar la información comercial. ' + (e?.message || ''));
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    // PDV de la cartera de un vendedor: por PDV directo O por cadena completa.
    const pdvDe = (vid) => {
        const pdvTodos = (posList || []).filter(p => p.type !== 'depot');
        if (vid === TODOS) return pdvTodos;
        const c = cartera[vid];
        return pdvTodos.filter(p => c && (c.pos.has(p.id) || (p.chain && c.chains.has(p.chain))));
    };
    const pisoDe = (v) => Number(v?.commissionConfig?.anaquelMinUnits) > 0
        ? Number(v.commissionConfig.anaquelMinUnits)
        : (DEFAULT_COMMISSION_CONFIG.anaquelMinUnits || 12);

    /** Indicadores del seguidor para un alcance (vendedor o TODOS) en [desde, hasta). */
    const seguidorDe = (vid, desde, hasta) => {
        const esTodos = vid === TODOS;
        const pdv = pdvDe(vid);
        const ids = new Set(pdv.map(p => p.id));
        const v = esTodos ? null : vendedores.find(x => x.id === vid);
        // Se pasan TODAS las facturas: "¿este PDV compró?" es una pregunta sobre
        // el punto de venta, no sobre a quién se le acreditó la comisión.
        // `vendedorId` acota lo que sí es suyo: la cobranza vencida.
        return computeSeguidor({
            cartera: pdv,
            visitas: (reports || []).filter(r => r.posId && ids.has(r.posId)),
            facturas,
            opts: { pisoAnaquel: pisoDe(v), desde, hasta, ingreso: v?.fechaIngreso || null, vendedorId: esTodos ? null : vid },
        });
    };

    const datosDe = (v) => {
        const c = cartera[v.id];
        return {
            vendedor: v, facturas,
            gestiones: gestiones ? gestiones.filter(g => g.vendedorId === v.id) : null,
            planes: planes ? planes.filter(p => p.vendedorId === v.id) : null,
            carteraSize: c ? c.pos.size + c.chains.size : 0,
        };
    };

    // Desempeño de cada vendedor en su MES DE EMPLEO en curso (la vista por defecto).
    const desempeno = useMemo(() => {
        const out = {};
        vendedores.forEach(v => {
            const per = computeMetaMensual(v);
            out[v.id] = evaluarDesempeno({ ...datosDe(v), seguidor: seguidorDe(v.id, per.periodStart, per.periodEnd) });
        });
        return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vendedores, facturas, cartera, posList, reports, gestiones, planes]);

    /** Otra ventana para un vendedor: 'semana' | 'trimestre' | 'anio' (mes a mes). */
    const evaluarVentana = (vid, tipo) => {
        const v = vendedores.find(x => x.id === vid);
        if (!v) return null;
        if (tipo === 'mes') return desempeno[vid];
        if (tipo === 'anio') return evaluarAnio(datosDe(v));
        const w = ventanasVendedor(v)[tipo];
        return w ? evaluarDesempeno({ ...datosDe(v), ventana: w }) : null;
    };

    return { vendedores, facturas, cartera, gestiones, planes, loading, error, pdvDe, pisoDe, seguidorDe, desempeno, evaluarVentana, datosDe };
}
