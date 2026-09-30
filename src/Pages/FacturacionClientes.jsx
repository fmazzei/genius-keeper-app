// RUTA: src/Pages/FacturacionClientes.jsx
//
// Listado de FACTURACIÓN por Punto de Venta (sucursal/contacto de Zoho) o por
// Razón Social (entidad canónica, agrupa las sucursales de una cadena). Muestra
// facturado / cobrado / por cobrar / vencido y unidades, con totales y
// exportación a PDF (FacturacionDoc). Vive en AdminPanel → Comercial →
// Facturación (máster/administrador). Se alimenta de `facturas_vendedor` (Zoho).

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { RefreshCw, FileDown, Search, Store, Building2, AlertCircle, Calendar, Users } from 'lucide-react';
import FacturacionDoc from '@/Components/FacturacionDoc.jsx';
import { cuentaEnCartera, saldoAbierto } from '@/utils/facturaEstado.js';
import { unidadesReales, buildCanalResolver } from '@/utils/unidadesFactura.js';

// Filtro de cartera: TODAS las ventas, las de un vendedor, Oficina o sin asignar.
// Se resuelve por la cartera ACTUAL (clientes_zoho por carnet), que es lo que
// el gerente quiere ver: "¿qué le vende hoy su cartera?".
const CARTERA_TODOS = '__todos__', CARTERA_OFICINA = '__oficina__', CARTERA_SIN = '__sin__';
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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
    const [clientes, setClientes] = useState([]);
    const [vendedores, setVendedores] = useState([]);
    const [carteraSel, setCarteraSel] = useState(CARTERA_TODOS);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState('');
    const [groupBy, setGroupBy]   = useState('razon'); // 'razon' | 'pdv'
    const [search, setSearch]     = useState('');
    const [showDoc, setShowDoc]   = useState(false);
    // Período: por defecto el AÑO EN CURSO. Filtros año / semestre / trimestre.
    const [year, setYear]         = useState(new Date().getFullYear());
    const [gran, setGran]         = useState('year'); // 'year' | 'sem' | 'tri' | 'mes'
    const [sub, setSub]           = useState(1);       // semestre 1-2 · trimestre 1-4 · mes 1-12

    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true); setError('');
            try {
                const [snap, cliSnap, venSnap] = await Promise.all([
                    getDocs(collection(db, 'facturas_vendedor')),
                    getDocs(collection(db, 'clientes_zoho')).catch(() => ({ docs: [] })),
                    getDocs(query(collection(db, 'users_metadata'), where('role', '==', 'vendedor'))).catch(() => ({ docs: [] })),
                ]);
                if (!alive) return;
                setFacturas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                setClientes((cliSnap.docs || []).map(d => d.data()));
                setVendedores((venSnap.docs || []).map(d => ({ id: d.id, ...d.data() })).filter(v => v.active !== false));
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

    // Años disponibles: desde el actual hasta el año de la primera factura.
    const years = useMemo(() => {
        const cur = new Date().getFullYear();
        let min = cur;
        facturas.forEach(f => { const t = toDate(f.fecha); if (t && t.getFullYear() < min) min = t.getFullYear(); });
        const arr = []; for (let y = cur; y >= min; y--) arr.push(y);
        return arr;
    }, [facturas]);

    // Ventana [inicio, fin) del período seleccionado.
    const [winStart, winEnd] = useMemo(() => {
        if (gran === 'sem') { const m = sub === 1 ? 0 : 6; return [new Date(year, m, 1), new Date(year, m + 6, 1)]; }
        if (gran === 'tri') { const m = (sub - 1) * 3; return [new Date(year, m, 1), new Date(year, m + 3, 1)]; }
        if (gran === 'mes') return [new Date(year, sub - 1, 1), new Date(year, sub, 1)];
        return [new Date(year, 0, 1), new Date(year + 1, 0, 1)];
    }, [year, gran, sub]);

    const periodoLabel = gran === 'year' ? `Año ${year}`
        : gran === 'sem' ? `${sub === 1 ? '1.er' : '2.º'} semestre ${year}`
        : gran === 'mes' ? `${MESES[sub - 1]} ${year}`
        : `${sub}.º trimestre ${year}`;

    // Dueño VIGENTE de cada factura: por carnet (clientes_zoho) y, sin carnet,
    // por el vendedor con que quedó la factura.
    const cliPorId = useMemo(() => new Map(clientes.filter(c => c.customerId).map(c => [String(c.customerId), c])), [clientes]);
    const duenoDe = (f) => {
        const c = f.zohoCustomerId ? cliPorId.get(String(f.zohoCustomerId)) : null;
        if (c) return c.esOficina ? CARTERA_OFICINA : (c.vendedorId || f.vendedorId || CARTERA_SIN);
        return f.vendedorId || CARTERA_SIN;
    };
    const canalDe = useMemo(() => buildCanalResolver(clientes), [clientes]);
    const udsDe = (f) => unidadesReales(f, { canal: canalDe(f) });
    const nombreCartera = carteraSel === CARTERA_TODOS ? 'Toda la empresa'
        : carteraSel === CARTERA_OFICINA ? 'Oficina'
        : carteraSel === CARTERA_SIN ? 'Sin asignar'
        : (vendedores.find(v => v.id === carteraSel)?.name || 'Vendedor');

    const grupos = useMemo(() => {
        const map = new Map();
        for (const f of facturas) {
            if (!cuentaEnCartera(f)) continue;
            const t = toDate(f.fecha);
            if (!t || t < winStart || t >= winEnd) continue; // ← filtro de período
            if (carteraSel !== CARTERA_TODOS && duenoDe(f) !== carteraSel) continue; // ← filtro de cartera
            const key = groupBy === 'razon'
                ? (f.razonSocialCanonica || f.clienteName || '—')
                : (f.clienteName || f.razonSocialCanonica || '—');
            if (!map.has(key)) map.set(key, { nombre: key, facturas: 0, unidades: 0, facturado: 0, cobrado: 0, porCobrar: 0, vencido: 0, categoria: f.categoria });
            const g = map.get(key);
            const monto = Number(f.monto) || 0;
            g.facturas += 1;
            g.unidades += udsDe(f);
            g.facturado += monto;
            // Por cobrar = SALDO real (abonos parciales), no el monto entero.
            const saldo = f.estado === 'pagada' ? 0 : saldoAbierto(f);
            g.cobrado += monto - saldo;
            if (saldo > 0.005) {
                g.porCobrar += saldo;
                const venc = toDate(f.vencimiento);
                if (f.estado === 'vencida' || (venc && venc < now)) g.vencido += saldo;
            }
        }
        let arr = [...map.values()].sort((a, b) => b.facturado - a.facturado);
        const term = search.trim().toLowerCase();
        if (term) arr = arr.filter(g => (g.nombre || '').toLowerCase().includes(term));
        return arr;
    }, [facturas, groupBy, search, winStart, winEnd, carteraSel, cliPorId, canalDe]); // eslint-disable-line

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
                    <h2 className="text-xl font-black text-slate-800">Ventas por cliente · <span className="text-brand-blue">{periodoLabel}</span></h2>
                    {carteraSel !== CARTERA_TODOS && <p className="text-xs font-bold text-slate-500">Cartera: {nombreCartera}</p>}
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

            {/* Filtro de período: año + semestre/trimestre */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold"><Calendar size={14} /> Período</div>
                <select value={year} onChange={e => setYear(Number(e.target.value))}
                    className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-bold text-slate-700 focus:outline-none focus:border-brand-blue">
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <div className="rounded-lg bg-slate-100 p-1 flex">
                    {[['year', 'Año'], ['sem', 'Semestre'], ['tri', 'Trimestre'], ['mes', 'Mes']].map(([v, l]) => (
                        <button key={v} onClick={() => { setGran(v); setSub(v === 'mes' ? (year === now.getFullYear() ? now.getMonth() + 1 : 1) : 1); }}
                            className={`text-xs py-1.5 px-2.5 rounded-md font-semibold ${gran === v ? 'bg-white shadow text-brand-blue' : 'text-slate-500'}`}>{l}</button>
                    ))}
                </div>
                {gran === 'sem' && (
                    <div className="rounded-lg bg-slate-100 p-1 flex">
                        {[1, 2].map(s => <button key={s} onClick={() => setSub(s)} className={`text-xs py-1.5 px-3 rounded-md font-semibold ${sub === s ? 'bg-white shadow text-brand-blue' : 'text-slate-500'}`}>S{s}</button>)}
                    </div>
                )}
                {gran === 'tri' && (
                    <div className="rounded-lg bg-slate-100 p-1 flex">
                        {[1, 2, 3, 4].map(s => <button key={s} onClick={() => setSub(s)} className={`text-xs py-1.5 px-2.5 rounded-md font-semibold ${sub === s ? 'bg-white shadow text-brand-blue' : 'text-slate-500'}`}>T{s}</button>)}
                    </div>
                )}
                {gran === 'mes' && (
                    <select value={sub} onChange={e => setSub(Number(e.target.value))}
                        className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-bold text-slate-700 focus:outline-none focus:border-brand-blue">
                        {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                )}
            </div>

            {/* Filtro de cartera: por vendedor (su cartera ACTUAL), Oficina o sin asignar */}
            <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
                <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold shrink-0"><Users size={14} /> Cartera</div>
                {[[CARTERA_TODOS, 'Toda la empresa'], ...vendedores.map(v => [v.id, v.name || v.email]), [CARTERA_OFICINA, 'Oficina'], [CARTERA_SIN, 'Sin asignar']].map(([id, lbl]) => (
                    <button key={id} onClick={() => setCarteraSel(id)}
                        className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${carteraSel === id ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-slate-600 border-slate-300'}`}>
                        {lbl}
                    </button>
                ))}
            </div>

            {/* Resumen */}
            <div className="flex flex-wrap gap-2 mb-2">
                <StatChip label="Facturado" value={money(totales.facturado)} color="text-slate-800" />
                <StatChip label="Unidades" value={num(totales.unidades)} color="text-brand-blue" />
                <StatChip label="Cobrado" value={money(totales.cobrado)} color="text-emerald-600" />
                <StatChip label="Por cobrar" value={money(totales.porCobrar)} color="text-amber-600" />
                <StatChip label="Vencido" value={money(totales.vencido)} color="text-red-600" />
            </div>
            <p className="text-[11px] text-slate-400 mb-4">
                Las <b className="text-slate-500">unidades</b> son unidades de venta de 250 g (las facturas por kilo de foodservice se convierten). El <b className="text-slate-500">precio prom.</b> refleja precios distintos por cliente o época. La cartera se filtra por el dueño <b className="text-slate-500">actual</b> de cada cliente.
            </p>

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
                <table className="w-full text-sm min-w-[820px]">
                    <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
                            <th className="py-2.5 px-3 w-8">#</th>
                            <th className="py-2.5 px-3">{etiqueta}</th>
                            <th className="py-2.5 px-3 text-right">Fact.</th>
                            <th className="py-2.5 px-3 text-right">Unid.</th>
                            <th className="py-2.5 px-3 text-right">Facturado</th>
                            <th className="py-2.5 px-3 text-right">Precio prom.</th>
                            <th className="py-2.5 px-3 text-right">Cobrado</th>
                            <th className="py-2.5 px-3 text-right">Por cobrar</th>
                            <th className="py-2.5 px-3 text-right">Vencido</th>
                        </tr>
                    </thead>
                    <tbody>
                        {grupos.length === 0 ? (
                            <tr><td colSpan={9} className="py-8 text-center text-slate-400 text-sm">Sin facturación en el filtro actual.</td></tr>
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
                                <td className="py-2 px-3 text-right text-slate-500">{g.unidades > 0 ? money(g.facturado / g.unidades) : '—'}</td>
                                <td className="py-2 px-3 text-right text-emerald-600">{money(g.cobrado)}</td>
                                <td className="py-2 px-3 text-right text-amber-600">{money(g.porCobrar)}</td>
                                <td className={`py-2 px-3 text-right ${g.vencido > 0 ? 'text-red-600 font-semibold' : 'text-slate-300'}`}>{money(g.vencido)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showDoc && (
                <FacturacionDoc modo={groupBy} grupos={grupos} totales={totales} periodoLabel={carteraSel === CARTERA_TODOS ? periodoLabel : `${periodoLabel} · ${nombreCartera}`} onClose={() => setShowDoc(false)} />
            )}
        </div>
    );
}
