// RUTA: src/Components/VinculacionPdvZoho.jsx
//
// Vinculación masiva PDV ↔ cliente de Zoho. Es la llave del indicador "PDV sin
// facturar" del seguidor semanal: sin razón social, un PDV no se puede cruzar con
// su facturación (y, si es foodservice, tampoco con su comisión flat).
//
// SOLO máster / administración: define la ATRIBUCIÓN de facturas y comisiones.
// El mercaderista y el vendedor crean PDV sin este campo y se vincula aquí.
//
// Guardar escribe `pos.razonSocialZoho` y llama a `emparejarRazonSocialPDV`
// (misma callable que usa la ficha del PDV) para atribuir el histórico.

import React, { useEffect, useMemo, useState } from 'react';
import { db, functions } from '@/Firebase/config.js';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Link2, Link2Off, Search, Loader, Check, Store, AlertTriangle } from 'lucide-react';

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

export default function VinculacionPdvZoho() {
    const [pos, setPos]           = useState([]);
    const [clientes, setClientes] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState('');
    const [filtro, setFiltro]     = useState('');
    const [soloPendientes, setSoloPendientes] = useState(true);
    const [savingId, setSavingId] = useState(null);
    const [okId, setOkId]         = useState(null);

    const load = async () => {
        setLoading(true); setError('');
        try {
            const [posSnap, cliSnap] = await Promise.all([
                getDocs(collection(db, 'pos')),
                getDocs(collection(db, 'clientes_zoho')).catch(() => ({ docs: [] })),
            ]);
            setPos(posSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.active !== false));
            const cl = (cliSnap.docs || []).map(d => ({ id: d.id, ...d.data() }));
            // Un cliente por nombre (Zoho obliga nombres únicos por organización).
            const vistos = new Set();
            setClientes(cl.filter(c => {
                const k = norm(c.customerName);
                if (!k || vistos.has(k)) return false;
                vistos.add(k); return true;
            }).sort((a, b) => (a.customerName || '').localeCompare(b.customerName || '')));
        } catch (e) {
            setError('No se pudo cargar. ' + (e?.message || ''));
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const vincular = async (posId, razonSocialZoho) => {
        setSavingId(posId);
        try {
            await updateDoc(doc(db, 'pos', posId), { razonSocialZoho: razonSocialZoho || '' });
            setPos(prev => prev.map(p => p.id === posId ? { ...p, razonSocialZoho } : p));
            if (razonSocialZoho) {
                // Atribuye el histórico de esa razón social al vendedor del PDV.
                try { await httpsCallable(functions, 'emparejarRazonSocialPDV')({ posId, razonSocialZoho }); }
                catch { /* el vínculo ya quedó guardado; el backfill no bloquea */ }
            }
            setOkId(posId);
            setTimeout(() => setOkId(null), 1500);
        } catch (e) {
            setError('No se pudo vincular. ' + (e?.message || ''));
        } finally { setSavingId(null); }
    };

    const { lista, vinculados, pendientes } = useMemo(() => {
        const q = norm(filtro);
        const conVinculo = pos.filter(p => (p.razonSocialZoho || '').trim());
        const sinVinculo = pos.filter(p => !(p.razonSocialZoho || '').trim());
        let base = soloPendientes ? sinVinculo : pos;
        if (q) base = base.filter(p => norm(p.name).includes(q) || norm(p.chain).includes(q) || norm(p.zone).includes(q));
        base = [...base].sort((a, b) => (a.chain || '').localeCompare(b.chain || '') || (a.name || '').localeCompare(b.name || ''));
        return { lista: base, vinculados: conVinculo.length, pendientes: sinVinculo.length };
    }, [pos, filtro, soloPendientes]);

    if (loading) {
        return <div className="flex justify-center py-16"><Loader size={26} className="animate-spin text-brand-blue" /></div>;
    }

    return (
        <div className="bg-white rounded-lg shadow p-5 max-w-full overflow-x-hidden">
            <div className="mb-4">
                <h3 className="text-xl font-semibold text-slate-700 flex items-center gap-2">
                    <Link2 size={20} className="text-brand-blue" /> PDV ↔ Cliente de Zoho
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                    Vincula cada punto de venta con la razón social exacta con que factura en Zoho.
                    Es lo que permite medir <strong>"días sin facturar" por PDV</strong> y activar la cartera.
                    En cadenas usa el nombre <strong>con su sucursal</strong>.
                </p>
            </div>

            {error && (
                <p className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}
                </p>
            )}

            {clientes.length === 0 && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                    No hay clientes de Zoho cargados todavía. Corre una <strong>conciliación</strong> en
                    Integraciones para traer el registro de clientes y luego vuelve aquí.
                </p>
            )}

            {/* Resumen + filtros */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 mb-4">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                    {vinculados} vinculados
                </span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${pendientes > 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {pendientes} por vincular
                </span>
                <button onClick={() => setSoloPendientes(s => !s)}
                    className="ml-auto text-xs font-semibold text-brand-blue hover:underline">
                    {soloPendientes ? 'Ver todos' : 'Ver solo pendientes'}
                </button>
            </div>

            <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={filtro} onChange={e => setFiltro(e.target.value)}
                    placeholder="Buscar PDV por nombre, cadena o zona…"
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
            </div>

            {lista.length === 0 ? (
                <p className="text-sm text-center text-slate-400 py-10">
                    {soloPendientes ? '¡Todos los PDV están vinculados! 🎉' : 'Sin resultados.'}
                </p>
            ) : (
                <div className="space-y-2">
                    {lista.map(p => {
                        const actual = (p.razonSocialZoho || '').trim();
                        return (
                            <div key={p.id} className={`rounded-xl border p-3 ${actual ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50/40'}`}>
                                <div className="flex items-start gap-2 mb-2">
                                    <Store size={15} className="text-slate-400 shrink-0 mt-0.5" />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold text-slate-800 text-sm leading-snug break-words">{p.name}</p>
                                        <p className="text-xs text-slate-400 break-words">
                                            {[p.chain, p.zone, p.canal === 'foodservice' ? 'Foodservice' : null].filter(Boolean).join(' · ')}
                                        </p>
                                    </div>
                                    {actual
                                        ? <Link2 size={15} className="text-emerald-500 shrink-0" />
                                        : <Link2Off size={15} className="text-amber-500 shrink-0" />}
                                </div>
                                <div className="flex items-center gap-2 min-w-0">
                                    {/* El <select> se dimensiona según su opción más
                                        larga (iOS/Safari): sin este envoltorio con
                                        min-w-0 + w-full/max-w-full desborda la
                                        tarjeta y la pantalla "baila" de lado. */}
                                    <div className="flex-1 min-w-0">
                                    <select
                                        value={actual}
                                        onChange={e => vincular(p.id, e.target.value)}
                                        disabled={savingId === p.id}
                                        className="block w-full min-w-0 max-w-full px-2.5 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue disabled:opacity-50"
                                    >
                                        <option value="">— Sin vincular —</option>
                                        {/* Si el PDV ya tiene un nombre que no está en el registro, no se pierde */}
                                        {actual && !clientes.some(c => norm(c.customerName) === norm(actual)) && (
                                            <option value={actual}>{actual} (fuera del registro)</option>
                                        )}
                                        {clientes.map(c => (
                                            <option key={c.id} value={c.customerName}>{c.customerName}</option>
                                        ))}
                                    </select>
                                    </div>
                                    {savingId === p.id && <Loader size={16} className="animate-spin text-brand-blue shrink-0" />}
                                    {okId === p.id && <Check size={16} className="text-emerald-500 shrink-0" />}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
                Al vincular se atribuye también el <strong>histórico de facturas</strong> de esa razón social al
                vendedor dueño del PDV. Si un cliente no aparece en la lista, corre una conciliación con Zoho.
            </p>
        </div>
    );
}
