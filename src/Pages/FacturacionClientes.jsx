// RUTA: src/Pages/FacturacionClientes.jsx
//
// Listado de FACTURACIÓN por Punto de Venta (sucursal/contacto de Zoho) o por
// Razón Social (entidad canónica, agrupa las sucursales de una cadena). Muestra
// facturado / cobrado / por cobrar / vencido y unidades, con totales y
// exportación a PDF (FacturacionDoc). Vive en AdminPanel → Comercial →
// Facturación (máster/administrador). Se alimenta de `facturas_vendedor` (Zoho).

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, getDocs } from 'firebase/firestore';
import { RefreshCw, FileDown, Search, Store, Building2, AlertCircle } from 'lucide-react';
import FacturacionDoc from '@/Components/FacturacionDoc.jsx';

const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n) => (Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 });
const toDate = (t) => t?.toDate?.() || (t ? new Date(t) : null);

const StatChip = ({ label, value, color }) => (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex-1 min-w-[130px]">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className={`text-xl font-black ${color || 'text-slate-800'}`}>{value}</p>
    </div>
);

export default function FacturacionClientes() {
    const [facturas, setFacturas] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState('');
    const [groupBy, setGroupBy]   = useState('razon'); // 'razon' | 'pdv'
    const [search, setSearch]     = useState('');
    const [showDoc, setShowDoc]   = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true); setError('');
            try {
                const snap = await getDocs(collection(db, 'facturas_vendedor'));
                if (alive) setFacturas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (e) {
                console.error(e);
                if (alive) setError('No se pudieron cargar las facturas.');
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    const now = new Date();
    const grupos = useMemo(() => {
        const map = new Map();
        for (const f of facturas) {
            if (f.estado === 'anulada') continue;
            const key = groupBy === 'razon'
                ? (f.razonSocialCanonica || f.clienteName || '—')
                : (f.clienteName || f.razonSocialCanonica || '—');
            if (!map.has(key)) map.set(key, { nombre: key, facturas: 0, unidades: 0, facturado: 0, cobrado: 0, porCobrar: 0, vencido: 0, categoria: f.categoria });
            const g = map.get(key);
            const monto = Number(f.monto) || 0;
            g.facturas += 1;
            g.unidades += Number(f.unidades) || 0;
            g.facturado += monto;
            if (f.estado === 'pagada') {
                g.cobrado += monto;
            } else {
                g.porCobrar += monto;
                const venc = toDate(f.vencimiento);
                if (f.estado === 'vencida' || (venc && venc < now)) g.vencido += monto;
            }
        }
        let arr = [...map.values()].sort((a, b) => b.facturado - a.facturado);
        const term = search.trim().toLowerCase();
        if (term) arr = arr.filter(g => (g.nombre || '').toLowerCase().includes(term));
        return arr;
    }, [facturas, groupBy, search]); // eslint-disable-line

    const totales = useMemo(() => grupos.reduce((t, g) => ({
        facturas: t.facturas + g.facturas, unidades: t.unidades + g.unidades, facturado: t.facturado + g.facturado,
        cobrado: t.cobrado + g.cobrado, porCobrar: t.porCobrar + g.porCobrar, vencido: t.vencido + g.vencido,
    }), { facturas: 0, unidades: 0, facturado: 0, cobrado: 0, porCobrar: 0, vencido: 0 }), [grupos]);

    const etiqueta = groupBy === 'razon' ? 'Razón social' : 'Punto de venta';

    if (loading) {
        return <div className="flex items-center justify-center py-24"><RefreshCw className="animate-spin text-slate-400" size={24} /></div>;
    }
    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <AlertCircle size={36} className="text-red-400" />
                <p className="text-slate-500 text-sm">{error}</p>
            </div>
        );
    }

    return (
        <div className="p-1">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                    <h2 className="text-xl font-black text-slate-800">Facturación</h2>
                    <p className="text-slate-400 text-xs">Colocación y cobranza por cliente, desde Zoho Books (excluye anuladas).</p>
                </div>
                <button
                    onClick={() => setShowDoc(true)}
                    disabled={grupos.length === 0}
                    className="flex items-center gap-2 bg-brand-blue text-white font-bold text-sm px-4 py-2 rounded-lg disabled:opacity-40"
                >
                    <FileDown size={16} /> PDF
                </button>
            </div>

            {/* Resumen */}
            <div className="flex flex-wrap gap-2 mb-4">
                <StatChip label="Facturado" value={money(totales.facturado)} color="text-slate-800" />
                <StatChip label="Cobrado" value={money(totales.cobrado)} color="text-emerald-600" />
                <StatChip label="Por cobrar" value={money(totales.porCobrar)} color="text-amber-600" />
                <StatChip label="Vencido" value={money(totales.vencido)} color="text-red-600" />
            </div>

            {/* Controles: agrupar + buscar */}
            <div className="flex flex-wrap items-center gap-3 mb-3">
                <div className="rounded-lg bg-slate-100 p-1 flex">
                    <button onClick={() => setGroupBy('razon')} className={`flex items-center gap-1.5 text-sm py-1.5 px-3 rounded-md font-semibold ${groupBy === 'razon' ? 'bg-white shadow text-brand-blue' : 'text-slate-500'}`}><Building2 size={15} /> Razón social</button>
                    <button onClick={() => setGroupBy('pdv')} className={`flex items-center gap-1.5 text-sm py-1.5 px-3 rounded-md font-semibold ${groupBy === 'pdv' ? 'bg-white shadow text-brand-blue' : 'text-slate-500'}`}><Store size={15} /> Punto de venta</button>
                </div>
                <div className="relative flex-1 min-w-[180px]">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={`Buscar ${etiqueta.toLowerCase()}...`}
                        className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-brand-blue"
                    />
                </div>
            </div>

            {/* Tabla */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                    <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
                            <th className="py-2.5 px-3 w-8">#</th>
                            <th className="py-2.5 px-3">{etiqueta}</th>
                            <th className="py-2.5 px-3 text-right">Fact.</th>
                            <th className="py-2.5 px-3 text-right">Unid.</th>
                            <th className="py-2.5 px-3 text-right">Facturado</th>
                            <th className="py-2.5 px-3 text-right">Cobrado</th>
                            <th className="py-2.5 px-3 text-right">Por cobrar</th>
                            <th className="py-2.5 px-3 text-right">Vencido</th>
                        </tr>
                    </thead>
                    <tbody>
                        {grupos.length === 0 ? (
                            <tr><td colSpan={8} className="py-8 text-center text-slate-400 text-sm">Sin facturación en el filtro actual.</td></tr>
                        ) : grupos.map((g, i) => (
                            <tr key={i} className="border-b border-slate-100 last:border-0">
                                <td className="py-2 px-3 text-slate-400">{i + 1}</td>
                                <td className="py-2 px-3 font-semibold text-slate-800">
                                    {g.nombre}
                                    {g.categoria === 'foodservice' && <span className="ml-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">FS</span>}
                                </td>
                                <td className="py-2 px-3 text-right text-slate-500">{num(g.facturas)}</td>
                                <td className="py-2 px-3 text-right text-slate-500">{num(g.unidades)}</td>
                                <td className="py-2 px-3 text-right font-semibold text-slate-800">{money(g.facturado)}</td>
                                <td className="py-2 px-3 text-right text-emerald-600">{money(g.cobrado)}</td>
                                <td className="py-2 px-3 text-right text-amber-600">{money(g.porCobrar)}</td>
                                <td className={`py-2 px-3 text-right ${g.vencido > 0 ? 'text-red-600 font-semibold' : 'text-slate-300'}`}>{money(g.vencido)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showDoc && (
                <FacturacionDoc modo={groupBy} grupos={grupos} totales={totales} onClose={() => setShowDoc(false)} />
            )}
        </div>
    );
}
