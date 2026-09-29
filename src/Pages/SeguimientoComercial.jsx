// RUTA: src/Pages/SeguimientoComercial.jsx
//
// Seguimiento comercial para MÁSTER / GERENCIA: el mismo tablero de indicadores
// accionables que ve el vendedor en "Mi Semana", pero:
//   · por VENDEDOR (su cartera), para supervisar sin tener que pedirle nada, y
//   · en modo TODA LA EMPRESA, cubriendo todos los PDV registrados en GK.
//
// Navegable por semana o por mes hacia atrás: el histórico se reconstruye desde
// los datos crudos (facturas y visitas), sin depender de fotos guardadas.

import React, { useEffect, useMemo, useState } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { Loader, Users, Building2, AlertTriangle, FileDown } from 'lucide-react';
import SeguimientoDoc from '@/Components/SeguimientoDoc.jsx';
import SeguidorSemanalView from '@/Components/SeguidorSemanalView.jsx';
import { computeSeguidor, periodoRango } from '@/utils/seguidorSemanal.js';
import { DEFAULT_COMMISSION_CONFIG } from '@/Components/CommissionConstructor.jsx';
import DesempenoVendedor, { DesempenoMini } from '@/Components/DesempenoVendedor.jsx';
import { evaluarDesempeno } from '@/utils/desempenoVendedor.js';
import { computeMetaMensual } from '@/utils/vendedorMeta.js';

const TODOS = '__todos__';

export default function SeguimientoComercial({ posList = [], reports = [] }) {
    const [vendedores, setVendedores] = useState([]);
    const [sel, setSel]         = useState(TODOS);
    const [facturas, setFacturas] = useState([]);
    const [cartera, setCartera]   = useState({});   // vendedorId → Set(posId)
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState('');

    const [showDoc, setShowDoc] = useState(false);
    const [gran, setGran]     = useState('semana');
    const [offset, setOffset] = useState(0);
    const rango = useMemo(() => periodoRango(gran, offset), [gran, offset]);

    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true); setError('');
            try {
                // Traer TODAS las facturas históricas (miles) dejaba la pantalla en
                // spinner mucho tiempo. Solo hace falta:
                //   a) las de los últimos 12 meses — dan la "última factura" por PDV
                //      y permiten navegar el histórico de un año, y
                //   b) las ABIERTAS de cualquier fecha — la cobranza vencida puede
                //      ser vieja y no puede quedar fuera.
                // Se unen por id. Índices de un solo campo: sin índices compuestos.
                const hace12Meses = new Date();
                hace12Meses.setMonth(hace12Meses.getMonth() - 12);

                const [uSnap, fRecientes, fAbiertas, cSnap] = await Promise.all([
                    getDocs(query(collection(db, 'users_metadata'), where('role', '==', 'vendedor'))),
                    getDocs(query(collection(db, 'facturas_vendedor'), where('fecha', '>=', Timestamp.fromDate(hace12Meses))))
                        .catch(() => ({ docs: [] })),
                    getDocs(query(collection(db, 'facturas_vendedor'), where('estado', 'in', ['pendiente', 'vencida'])))
                        .catch(() => ({ docs: [] })),
                    getDocs(collection(db, 'vendor_clients')).catch(() => ({ docs: [] })),
                ]);
                if (!alive) return;
                setVendedores(uSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(v => v.active !== false));
                const porId = new Map();
                [...(fRecientes.docs || []), ...(fAbiertas.docs || [])]
                    .forEach(d => porId.set(d.id, { id: d.id, ...d.data() }));
                setFacturas([...porId.values()]);
                // La cartera se asigna por PDV directo o por CADENA completa
                // (tipoDespacho 'centralizado'): hay que contemplar las dos vías.
                const mapa = {};
                (cSnap.docs || []).forEach(d => {
                    const c = d.data();
                    if (!c.vendedorId || c.active === false || (c.estado && c.estado !== 'activo')) return;
                    if (!mapa[c.vendedorId]) mapa[c.vendedorId] = { pos: new Set(), chains: new Set() };
                    if (c.posId) mapa[c.vendedorId].pos.add(c.posId);
                    if (c.chain && c.chain !== 'Automercados Individuales') mapa[c.vendedorId].chains.add(c.chain);
                });
                setCartera(mapa);
            } catch (e) {
                if (alive) setError('No se pudo cargar el seguimiento. ' + (e?.message || ''));
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

    // DESEMPEÑO de cada vendedor en su período de empleo EN CURSO (el mismo con
    // el que se le paga): no depende del navegador Semana/Mes de abajo, que es
    // para revisar el histórico de indicadores.
    const desempeno = useMemo(() => {
        const out = {};
        vendedores.forEach(v => {
            const per = computeMetaMensual(v);
            const pdv = pdvDe(v.id);
            const ids = new Set(pdv.map(p => p.id));
            const seguidor = computeSeguidor({
                cartera: pdv,
                visitas: (reports || []).filter(r => r.posId && ids.has(r.posId)),
                facturas,
                opts: { pisoAnaquel: pisoDe(v), desde: per.periodStart, hasta: per.periodEnd, ingreso: v.fechaIngreso || null, vendedorId: v.id },
            });
            const c = cartera[v.id];
            out[v.id] = evaluarDesempeno({
                vendedor: v, facturas, seguidor,
                carteraSize: c ? c.pos.size + c.chains.size : 0,
            });
        });
        return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vendedores, facturas, cartera, posList, reports]);

    // Universo según la selección: toda la empresa o la cartera del vendedor.
    const data = useMemo(() => {
        const esTodos = sel === TODOS;
        const pdv = pdvDe(sel);
        const idsPdv = new Set(pdv.map(p => p.id));
        const visitas = (reports || []).filter(r => !r.posId || idsPdv.has(r.posId));

        // Fecha de ingreso del vendedor: separa lo HEREDADO (venía frío o vencido
        // antes de que entrara) de lo ocurrido bajo su gestión. En modo "toda la
        // empresa" no aplica: no hay un único responsable.
        const v = esTodos ? null : vendedores.find(x => x.id === sel);
        // Se pasan TODAS las facturas, no solo las del vendedor: "¿este PDV
        // compró?" es una pregunta sobre el punto de venta, no sobre a quién se
        // le acreditó la comisión. Recortarlas por `vendedorId` hacía que un PDV
        // de su cartera cuyo cliente de Zoho todavía no está asignado a él
        // apareciera como "Nunca ha facturado" aunque estuviera comprando.
        // `opts.vendedorId` acota lo que sí es suyo: la cobranza vencida.
        return computeSeguidor({
            cartera: pdv, visitas, facturas,
            opts: {
                // El piso sale de la config del PROPIO vendedor, igual que en su
                // "Mi Semana": con el default fijo, el máster clasificaba
                // sin_oc/con_inventario con un umbral distinto al que ve el
                // vendedor, y los dos tableros no coincidían.
                pisoAnaquel: pisoDe(v),
                desde: rango.desde, hasta: rango.hasta,
                ingreso: v?.fechaIngreso || null,
                vendedorId: esTodos ? null : sel,
            },
        });
    }, [sel, posList, reports, facturas, cartera, rango, vendedores]);

    const nombreSel = sel === TODOS
        ? 'Toda la empresa'
        : (vendedores.find(v => v.id === sel)?.name || 'Vendedor');

    return (
        <div className="w-full max-w-5xl mx-auto space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-xl font-semibold text-slate-700">Seguimiento comercial</h3>
                    <p className="text-sm text-slate-500 mt-1">
                        Los mismos indicadores que ve el vendedor en "Mi Semana". Elige un vendedor para
                        supervisar su cartera, o mira toda la actividad de la empresa.
                    </p>
                </div>
                <button onClick={() => setShowDoc(true)}
                    className="flex items-center gap-2 bg-brand-blue text-white font-bold text-sm px-4 py-2.5 rounded-xl shrink-0 hover:bg-opacity-90">
                    <FileDown size={16} /> Informe PDF
                </button>
            </div>

            {error && (
                <p className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}
                </p>
            )}

            {/* Selector de alcance */}
            <div className="flex flex-wrap gap-2">
                <button onClick={() => setSel(TODOS)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border transition-colors ${
                        sel === TODOS ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-slate-600 border-slate-300'
                    }`}>
                    <Building2 size={15} /> Toda la empresa
                </button>
                {vendedores.map(v => (
                    <button key={v.id} onClick={() => setSel(v.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border transition-colors ${
                            sel === v.id ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-slate-600 border-slate-300'
                        }`}>
                        <Users size={15} /> {v.name || v.email}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="bg-white border border-slate-200 rounded-2xl py-16 flex flex-col items-center gap-3">
                    <Loader size={26} className="animate-spin text-brand-blue" />
                    <p className="text-sm text-slate-400">Cargando facturación y visitas…</p>
                </div>
            ) : (
            <>
            {/* Un vistazo: ¿está cumpliendo? */}
            {sel === TODOS ? (
                vendedores.length > 0 && (
                    <section>
                        <p className="text-sm font-bold text-slate-700 mb-2">Desempeño del equipo <span className="font-normal text-slate-400">· toca un vendedor para ver el detalle</span></p>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {[...vendedores]
                                .sort((a, b) => (desempeno[a.id]?.global ?? -1) - (desempeno[b.id]?.global ?? -1))
                                .map(v => (
                                    <DesempenoMini key={v.id} ev={desempeno[v.id]} nombre={v.name || v.email} onClick={() => setSel(v.id)} />
                                ))}
                        </div>
                    </section>
                )
            ) : (
                <DesempenoVendedor ev={desempeno[sel]} nombre={nombreSel} />
            )}

            <p className="text-sm font-bold text-slate-700 pt-2">Indicadores de la semana o del mes</p>
            <SeguidorSemanalView
                data={data}
                theme="light"
                titulo={nombreSel}
                periodoCtl={{ gran, setGran, offset, setOffset, label: rango.label, actual: rango.actual }}
            />
            </>
            )}

            {showDoc && (
                <SeguimientoDoc
                    data={data}
                    alcance={nombreSel}
                    periodoLabel={rango.label}
                    onClose={() => setShowDoc(false)}
                />
            )}
        </div>
    );
}
