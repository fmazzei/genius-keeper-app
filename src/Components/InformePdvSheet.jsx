// RUTA: src/Components/InformePdvSheet.jsx
//
// Hoja para pedir el INFORME GENERAL de un punto de venta (o de todos los PDV
// de un cliente) en un intervalo de fechas, y verlo como PDF (pedido del
// dueño, 14-oct). Lee las visitas, devoluciones y facturas de cada PDV y las
// pasa por `informePdv` — el mismo historial que usa la hoja de cada reporte.

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { X, Search, FileText, Loader, Store, Building2 } from 'lucide-react';
import { informePdv, rangoPreset } from '@/utils/informePdv.js';
import { fmtDiaVE } from '@/utils/reporteVisita.js';
import { InformePdvDoc } from '@/Components/ReportesPdvDoc.jsx';

const PRESETS = [
    { id: '7', label: '7 días' },
    { id: '30', label: '30 días' },
    { id: 'mes', label: 'Este mes' },
    { id: 'mes_ant', label: 'Mes anterior' },
    { id: '90', label: '90 días' },
    { id: 'otro', label: 'Otras fechas' },
];

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function leerTodo(col, campo, valor) {
    try {
        const s = await getDocs(query(collection(db, col), where(campo, '==', valor)));
        return s.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch { return null; }
}

/** Lee todo lo que necesita el informe de cada PDV y lo calcula. */
async function armarInformes(pdvs, desde, hasta) {
    // Todos los PDV, para saber si un carnet lo comparten varios (entonces la
    // factura es de la cadena y no se le asigna a ninguno).
    let todos = [];
    try { todos = (await getDocs(collection(db, 'pos'))).docs.map(d => ({ id: d.id, ...d.data() })); } catch { /* sigue sin el chequeo */ }
    const usoCarnet = {};
    todos.filter(p => !p.eliminado && p.zohoCustomerId).forEach(p => { usoCarnet[p.zohoCustomerId] = (usoCarnet[p.zohoCustomerId] || 0) + 1; });
    const facturasPorCarnet = {};
    const carnets = [...new Set(pdvs.map(p => p.zohoCustomerId).filter(c => c && (usoCarnet[c] || 1) <= 1))];
    await Promise.all(carnets.map(async c => { facturasPorCarnet[c] = await leerTodo('facturas_vendedor', 'zohoCustomerId', c); }));

    return Promise.all(pdvs.map(async pos => {
        const [reportes, devoluciones] = await Promise.all([
            leerTodo('visit_reports', 'posId', pos.id),
            leerTodo('devoluciones', 'posId', pos.id),
        ]);
        const c = pos.zohoCustomerId;
        let facturas = [];
        let notaFacturas = null;
        if (!c) notaFacturas = 'El PDV no está vinculado a un carnet de Zoho: las facturas solo salen si el mercaderista las declaró en la visita.';
        else if ((usoCarnet[c] || 1) > 1) notaFacturas = 'El carnet de Zoho de este PDV lo comparten varios PDV: sus facturas son de la cadena y no se listan aquí.';
        else if (facturasPorCarnet[c] === null) notaFacturas = 'No se pudieron leer las facturas de Zoho de este cliente.';
        else facturas = facturasPorCarnet[c] || [];
        const inf = informePdv({ pos, reportes: reportes || [], facturas, devoluciones: devoluciones || [], desde, hasta });
        if (reportes === null) inf.notaFacturas = 'No se pudieron leer las visitas de este PDV.';
        else inf.notaFacturas = notaFacturas;
        return inf;
    }));
}

export default function InformePdvSheet({ posList = [], t, onClose }) {
    const [modo, setModo] = useState('pdv'); // 'pdv' | 'cliente'
    const [busca, setBusca] = useState('');
    const [pdvId, setPdvId] = useState('');
    const [cliente, setCliente] = useState('');
    const [preset, setPreset] = useState('30');
    const [rango, setRango] = useState(() => rangoPreset('30'));
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState('');
    const [doc, setDoc] = useState(null);

    const clientes = useMemo(() => {
        const m = {};
        posList.forEach(p => { const k = p.chain || ''; if (k) (m[k] = m[k] || []).push(p); });
        return Object.entries(m).map(([nombre, pdvs]) => ({ nombre, pdvs })).sort((a, b) => a.nombre.localeCompare(b.nombre));
    }, [posList]);
    const resultados = useMemo(() => {
        const q = norm(busca);
        const l = q ? posList.filter(p => norm(p.name).includes(q) || norm(p.chain).includes(q)) : posList;
        return l.slice(0, 30);
    }, [busca, posList]);
    const pdvSel = posList.find(p => p.id === pdvId) || null;
    const clienteSel = clientes.find(c => c.nombre === cliente) || null;

    const elegirPreset = (id) => {
        setPreset(id);
        if (id !== 'otro') setRango(rangoPreset(id));
    };
    const listo = (modo === 'pdv' ? !!pdvSel : !!clienteSel) && rango.desde && rango.hasta && rango.desde <= rango.hasta;

    const generar = async () => {
        if (!listo) return;
        setCargando(true); setError('');
        try {
            const pdvs = modo === 'pdv' ? [pdvSel] : [...clienteSel.pdvs].sort((a, b) => String(a.name).localeCompare(String(b.name)));
            const informes = await armarInformes(pdvs, rango.desde, rango.hasta);
            setDoc({ titulo: modo === 'pdv' ? pdvSel.name : clienteSel.nombre, informes });
        } catch (e) {
            setError(e?.message || 'No se pudo armar el informe.');
        } finally {
            setCargando(false);
        }
    };

    if (doc) {
        return <InformePdvDoc titulo={doc.titulo} informes={doc.informes} desde={rango.desde} hasta={rango.hasta} onClose={() => setDoc(null)} />;
    }

    const pill = (activo) => `px-3 py-1.5 rounded-lg text-sm font-semibold ${activo ? t.periodActive : t.periodInactive}`;
    return createPortal((
        <div className="fixed inset-0 z-[90] flex flex-col" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />
            <div className={`relative m-auto w-full h-full md:h-auto md:max-h-[92vh] md:max-w-xl md:rounded-2xl overflow-hidden flex flex-col shadow-2xl ${t.sheet}`}>
                <div className={`px-4 py-3 shrink-0 flex items-start gap-3 ${t.sheetHeader}`} style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
                    <div className="min-w-0 flex-1">
                        <p className={`font-black text-base ${t.cardTitle}`}>Informe por punto de venta</p>
                        <p className={`text-xs mt-0.5 ${t.cardSub}`}>Elige el cliente y el intervalo: sale un PDF con todas sus visitas, la rotación, el precio, la competencia y las facturas.</p>
                    </div>
                    <button onClick={onClose} className={`shrink-0 p-1 ${t.sheetClose}`} aria-label="Cerrar"><X size={22} /></button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">
                    <div>
                        <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${t.filterLabel}`}>1 · ¿De quién?</p>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setModo('pdv')} className={`${pill(modo === 'pdv')} flex items-center justify-center gap-1.5`}><Store size={15} /> Un punto de venta</button>
                            <button onClick={() => setModo('cliente')} className={`${pill(modo === 'cliente')} flex items-center justify-center gap-1.5`}><Building2 size={15} /> Un cliente (todos sus PDV)</button>
                        </div>

                        {modo === 'pdv' ? (
                            <div className="mt-3">
                                <div className="relative">
                                    <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${t.filterLabel}`} />
                                    <input value={busca} onChange={e => { setBusca(e.target.value); setPdvId(''); }} placeholder="Buscar PDV o cadena…"
                                        className={`w-full rounded-xl pl-9 pr-3 py-2.5 text-base focus:outline-none focus:ring-2 ${t.select}`} />
                                </div>
                                {pdvSel ? (
                                    <p className={`mt-2 text-sm font-bold ${t.fieldValue}`}>✓ {pdvSel.name}{pdvSel.chain ? <span className={`font-normal ${t.meta}`}> · {pdvSel.chain}</span> : null}</p>
                                ) : (
                                    <div className={`mt-1 rounded-xl overflow-hidden max-h-64 overflow-y-auto ${t.pdvResultsBox}`}>
                                        {resultados.length === 0 ? <p className={`p-3 text-sm text-center ${t.pdvNoResults}`}>Sin resultados</p>
                                            : resultados.map(p => (
                                                <button key={p.id} onClick={() => { setPdvId(p.id); setBusca(p.name); }} className={`w-full text-left px-3 py-2.5 text-sm ${t.pdvResultRow}`}>
                                                    <span className={`font-medium ${t.pdvResultName}`}>{p.name}</span>
                                                    {p.chain && <span className={`ml-1.5 text-xs ${t.pdvResultChain}`}>· {p.chain}</span>}
                                                </button>
                                            ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="mt-3">
                                <select value={cliente} onChange={e => setCliente(e.target.value)} className={`w-full rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 ${t.select}`}>
                                    <option value="">Selecciona un cliente…</option>
                                    {clientes.map(c => <option key={c.nombre} value={c.nombre}>{c.nombre} ({c.pdvs.length} PDV)</option>)}
                                </select>
                                {clienteSel && <p className={`mt-2 text-xs ${t.meta}`}>{clienteSel.pdvs.map(p => p.name).join(' · ')}</p>}
                            </div>
                        )}
                    </div>

                    <div>
                        <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${t.filterLabel}`}>2 · Intervalo</p>
                        <div className="flex flex-wrap gap-2">
                            {PRESETS.map(p => <button key={p.id} onClick={() => elegirPreset(p.id)} className={pill(preset === p.id)}>{p.label}</button>)}
                        </div>
                        {preset === 'otro' ? (
                            <div className="grid grid-cols-2 gap-2 mt-3">
                                <label className={`text-xs ${t.filterLabel}`}>Desde
                                    <input type="date" value={rango.desde} onChange={e => setRango(r => ({ ...r, desde: e.target.value }))}
                                        className={`mt-1 w-full min-w-0 rounded-xl px-3 py-2 text-base ${t.select}`} />
                                </label>
                                <label className={`text-xs ${t.filterLabel}`}>Hasta
                                    <input type="date" value={rango.hasta} onChange={e => setRango(r => ({ ...r, hasta: e.target.value }))}
                                        className={`mt-1 w-full min-w-0 rounded-xl px-3 py-2 text-base ${t.select}`} />
                                </label>
                            </div>
                        ) : (
                            <p className={`mt-2 text-sm font-semibold ${t.fieldValue}`}>{fmtDiaVE(rango.desde)} – {fmtDiaVE(rango.hasta)}</p>
                        )}
                        {rango.desde > rango.hasta && <p className="mt-1 text-xs text-red-500">La fecha "desde" es posterior a "hasta".</p>}
                    </div>

                    {error && <p className="text-sm text-red-500">{error}</p>}
                </div>

                <div className={`shrink-0 px-4 py-3 ${t.sheetHeader}`} style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                    <button onClick={generar} disabled={!listo || cargando}
                        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border ${t.repoChip} disabled:opacity-50`}>
                        {cargando ? <><Loader size={15} className="animate-spin" /> Armando el informe…</> : <><FileText size={15} /> Generar informe PDF</>}
                    </button>
                </div>
            </div>
        </div>
    ), document.body);
}
