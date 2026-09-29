// RUTA: src/Components/VendedorVentasCartera.jsx
//
// Modal página completa (oscuro, estética del vendedor): "Ventas de tu cartera"
// — qué clientes/PDV le están comprando, EN UNIDADES.
//
// Decisión del dueño (2026-09): mostraba TODO el histórico de facturas atribuidas
// al vendedor, incluidas las de antes de que entrara y las de clientes que ya no
// son suyos: "no vale de nada meter toda una cantidad de puntos y clientes". Ahora
// cuenta SOLO:
//   · lo facturado desde su ingreso (`ingreso`), y
//   · de los clientes que HOY son suyos (`clientes_zoho.vendedorId == uid`, por
//     carnet; si una factura vieja no trae carnet, por su nombre).
// Y solo en unidades: se retiró la vista "por facturación" (montos).

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Building2, Store, FileDown, TrendingUp, Loader } from 'lucide-react';
import { db } from '@/Firebase/config.js';
import { collection, getDocs, query, where } from 'firebase/firestore';
import FacturacionDoc from '@/Components/FacturacionDoc.jsx';
import { cuentaEnCartera } from '@/utils/facturaEstado.js';

const num = (n) => (Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 });
const toDate = (t) => t?.toDate?.() || (t ? new Date(t) : null);
const norm = (s) => String(s || '').trim().toLowerCase();
const fmtCorta = (d) => d ? d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';

/** Facturas que cuentan: desde el ingreso y de un cliente que hoy es de su cartera. */
export function ventasDeSuCartera(facturas = [], { desde = null, carnets = null, nombres = null } = {}) {
    return (facturas || []).filter(f => {
        if (!cuentaEnCartera(f)) return false;
        if (f.recuperada) return false;                  // heredada: antes de su ingreso
        const t = toDate(f.fecha);
        if (desde && (!t || t < desde)) return false;
        if (carnets) {                                   // null = no se pudo leer la cartera: no se filtra
            const cid = String(f.zohoCustomerId || '');
            if (cid) return carnets.has(cid);
            return nombres?.has(norm(f.clienteName)) || false;
        }
        return true;
    });
}

function aggregate(facturas, modo) {
    const map = new Map();
    for (const f of facturas) {
        const key = modo === 'cliente'
            ? (f.razonSocialCanonica || f.clienteName || '—')
            : (f.clienteName || f.razonSocialCanonica || '—');
        const g = map.get(key) || { nombre: key, unidades: 0, facturas: 0, categoria: f.categoria, facturado: 0, cobrado: 0, porCobrar: 0, vencido: 0 };
        g.unidades += Number(f.unidades) || 0;
        g.facturas += 1;
        map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.unidades - a.unidades);
}

export default function VendedorVentasCartera({ facturas = [], ingreso = null, vendedorId = null, onClose }) {
    const [modo, setModo] = useState('cliente');   // cliente | pdv
    const [showDoc, setShowDoc] = useState(false);
    const [cartera, setCartera] = useState(undefined);   // undefined = cargando · null = no se pudo

    // Su cartera ACTUAL, por carnet de Zoho. Las reglas le dejan listar sus
    // propios clientes (`clientes_zoho` con su vendedorId).
    useEffect(() => {
        if (!vendedorId) { setCartera(null); return; }
        let vivo = true;
        getDocs(query(collection(db, 'clientes_zoho'), where('vendedorId', '==', vendedorId)))
            .then(snap => {
                if (!vivo) return;
                const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.esOficina);
                setCartera({
                    carnets: new Set(docs.map(c => String(c.customerId || c.id))),
                    nombres: new Set(docs.map(c => norm(c.customerName))),
                });
            })
            .catch(() => { if (vivo) setCartera(null); });
        return () => { vivo = false; };
    }, [vendedorId]);

    const validas = useMemo(() => ventasDeSuCartera(facturas, {
        desde: ingreso, carnets: cartera?.carnets || null, nombres: cartera?.nombres || null,
    }), [facturas, ingreso, cartera]);

    const grupos = useMemo(() => aggregate(validas, modo), [validas, modo]);
    const totales = useMemo(() => grupos.reduce((t, g) => ({
        unidades: t.unidades + g.unidades, facturas: t.facturas + g.facturas,
        facturado: 0, cobrado: 0, porCobrar: 0, vencido: 0,
    }), { unidades: 0, facturas: 0, facturado: 0, cobrado: 0, porCobrar: 0, vencido: 0 }), [grupos]);

    const maxV = Math.max(1, ...grupos.map(g => g.unidades));
    const cargando = cartera === undefined;

    return createPortal((
        <div className="fixed inset-0 z-[95] bg-slate-950 flex flex-col">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-4 h-14 border-b border-slate-800 bg-slate-900">
                <div className="flex items-center gap-2">
                    <TrendingUp size={18} className="text-emerald-400" />
                    <span className="text-white font-black text-sm">Ventas de tu cartera</span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowDoc(true)} disabled={grupos.length === 0}
                        className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white font-bold text-xs px-3 py-1.5 rounded-lg">
                        <FileDown size={14} /> PDF
                    </button>
                    <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300 hover:text-white"><X size={18} /></button>
                </div>
            </div>

            {/* Qué se está contando */}
            <p className="shrink-0 px-4 pt-3 text-xs text-slate-400">
                Unidades vendidas {ingreso ? <>desde tu ingreso (<b className="text-slate-200">{fmtCorta(ingreso)}</b>)</> : 'desde tu ingreso'} a los clientes que hoy son de tu cartera.
                {cartera === null && !cargando && <span className="text-amber-400"> No se pudo leer tu cartera actual: se muestran todas tus facturas desde el ingreso.</span>}
            </p>

            {/* Controles */}
            <div className="shrink-0 px-4 py-3">
                <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1">
                    {[['cliente', 'Cliente', Building2], ['pdv', 'Punto de venta', Store]].map(([v, l, Ic]) => (
                        <button key={v} onClick={() => setModo(v)}
                            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg transition-colors ${modo === v ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>
                            <Ic size={13} /> {l}
                        </button>
                    ))}
                </div>
            </div>

            {/* Resumen */}
            <div className="shrink-0 grid grid-cols-3 gap-2 px-4 pb-3">
                {[
                    { l: modo === 'cliente' ? 'Clientes' : 'Puntos de venta', v: num(grupos.length), c: 'text-white' },
                    { l: 'Unidades', v: num(totales.unidades), c: 'text-emerald-400' },
                    { l: 'Facturas', v: num(totales.facturas), c: 'text-white' },
                ].map((k, i) => (
                    <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{k.l}</p>
                        <p className={`font-black text-lg tabular-nums ${k.c}`}>{k.v}</p>
                    </div>
                ))}
            </div>

            {/* Lista con barras */}
            <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2">
                {cargando ? (
                    <div className="flex justify-center py-16"><Loader size={24} className="animate-spin text-emerald-400" /></div>
                ) : grupos.length === 0 ? (
                    <p className="text-slate-500 text-sm text-center py-16">Todavía no hay ventas a tu cartera actual desde tu ingreso.</p>
                ) : grupos.map((g, i) => (
                    <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                        <div className="flex items-baseline justify-between gap-2 mb-1.5">
                            <span className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                                <span className="text-slate-600 text-xs w-5 shrink-0">{i + 1}</span>
                                {g.nombre}{g.categoria === 'foodservice' && <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">FS</span>}
                            </span>
                            <span className="text-sm font-black text-white tabular-nums shrink-0">{num(g.unidades)} u</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${(g.unidades / maxV) * 100}%` }} />
                        </div>
                        <p className="mt-1.5 text-[11px] text-slate-500 tabular-nums">
                            {num(g.facturas)} factura{g.facturas === 1 ? '' : 's'}
                            {totales.unidades > 0 && <> · {Math.round(g.unidades / totales.unidades * 100)}% de tus unidades</>}
                        </p>
                    </div>
                ))}
            </div>

            {showDoc && (
                <FacturacionDoc modo={modo === 'cliente' ? 'razon' : 'pdv'} grupos={grupos} totales={totales} soloUnidades
                    periodoLabel={ingreso ? `desde ${fmtCorta(ingreso)}` : ''} onClose={() => setShowDoc(false)} />
            )}
        </div>
    ), document.body);
}
