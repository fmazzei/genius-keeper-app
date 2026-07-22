// RUTA: src/Components/VendedorAnaquelMap.jsx
//
// Mapa de Calor del Anaquel para el VENDEDOR — versión oscura, coherente con la
// estética de su app. Heatmap de rotación por posición en el estante × categoría
// adyacente (la "ubicación dorada"), acotado a los visit_reports de su cartera.

import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Crown, Info, MapPin } from 'lucide-react';

const LOCS = { ojos: 'Nivel Ojos', manos: 'Nivel Manos', superior: 'Nivel Superior', inferior: 'Nivel Inferior' };
const CATS = { 'Quesos crema': 'Q. Crema', 'Quesos de Cabra': 'Q. Cabra', 'Delicatessen': 'Delicatessen', 'Nevera Charcutería': 'Charcutería' };

const lerp = (a, b, t) => Math.round(a + (b - a) * t);
// Escala de calor sobre fondo oscuro: frío (slate) → tibio (ámbar) → caliente (naranja).
const heatColor = (t) => {
    const cold = [23, 32, 50];    // ~slate-850
    const warm = [245, 158, 11];  // amber-500
    const hot  = [234, 88, 12];   // orange-600
    let r, g, b;
    if (t <= 0) return 'rgb(17,24,39)';
    if (t < 0.5) { const k = t / 0.5; r = lerp(cold[0], warm[0], k); g = lerp(cold[1], warm[1], k); b = lerp(cold[2], warm[2], k); }
    else { const k = (t - 0.5) / 0.5; r = lerp(warm[0], hot[0], k); g = lerp(warm[1], hot[1], k); b = lerp(warm[2], hot[2], k); }
    return `rgb(${r},${g},${b})`;
};

export default function VendedorAnaquelMap({ reports = [], onClose }) {
    const a = useMemo(() => {
        const valid = (reports || []).filter(r => r.shelfLocation);
        const matrix = valid.filter(r => r.adjacentCategory);
        const locKeys = Object.keys(LOCS);
        const catKeys = Object.keys(CATS);
        const byPos = {};
        matrix.forEach(r => {
            if (!LOCS[r.shelfLocation] || !CATS[r.adjacentCategory]) return;
            const key = `${r.shelfLocation}|${r.adjacentCategory}`;
            (byPos[key] ||= []).push(Number(r.orderQuantity) || 0);
        });
        let max = 0, golden = null;
        const grid = {};
        locKeys.forEach(loc => {
            grid[loc] = {};
            catKeys.forEach(cat => {
                const arr = byPos[`${loc}|${cat}`] || [];
                const avg = arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0;
                grid[loc][cat] = avg;
                if (avg > max) { max = avg; golden = { loc, cat }; }
            });
        });
        return { hasData: valid.length > 0, hasMatrix: matrix.length > 0, grid, max, golden, locKeys, catKeys, nValid: valid.length };
    }, [reports]);

    return createPortal((
        <div className="fixed inset-0 z-[95] bg-slate-950 flex flex-col">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-4 h-14 border-b border-slate-800 bg-slate-900">
                <div className="flex items-center gap-2">
                    <Crown size={18} className="text-amber-400" />
                    <span className="text-white font-black text-sm">Mapa de Calor del Anaquel</span>
                </div>
                <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300 hover:text-white">
                    <X size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Explicación */}
                <div className="flex items-start gap-2.5 rounded-2xl bg-slate-900 border border-slate-800 p-4">
                    <Info size={16} className="text-slate-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-300 leading-relaxed">
                        Dónde rota más tu producto según su <b className="text-white">ubicación en el estante</b> y la <b className="text-white">categoría de al lado</b>. La celda más <span className="text-amber-400 font-bold">caliente</span> es tu <b className="text-amber-400">Ubicación Dorada</b> 👑.
                    </p>
                </div>

                {!a.hasData ? (
                    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-10 text-center">
                        <MapPin size={36} className="mx-auto text-slate-700 mb-3" />
                        <p className="text-white font-bold">Aún sin datos de anaquel</p>
                        <p className="text-slate-400 text-sm mt-1">Cuando tus PDV tengan reportes con ubicación en el estante, verás aquí tu ubicación dorada.</p>
                    </div>
                ) : (
                    <>
                        {/* Ubicación dorada */}
                        {a.golden && a.max > 0 && (
                            <div className="rounded-2xl p-4 bg-gradient-to-br from-amber-500/20 to-orange-500/5 border border-amber-500/30 flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 grid place-items-center text-2xl shrink-0">👑</div>
                                <div className="min-w-0">
                                    <p className="text-[11px] font-black uppercase tracking-wider text-amber-400/80">Tu ubicación dorada</p>
                                    <p className="text-white font-black text-lg leading-tight">{LOCS[a.golden.loc]} · {CATS[a.golden.cat]}</p>
                                    <p className="text-amber-200/70 text-xs">Rota {a.grid[a.golden.loc][a.golden.cat].toFixed(1)} uds — pide ubicarte aquí.</p>
                                </div>
                            </div>
                        )}

                        {/* Heatmap */}
                        {a.hasMatrix ? (
                            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3">
                                <div className="overflow-x-auto">
                                    <div className="min-w-[440px]">
                                        {/* Header de categorías */}
                                        <div className="grid" style={{ gridTemplateColumns: `96px repeat(${a.catKeys.length}, 1fr)`, gap: '4px' }}>
                                            <div />
                                            {a.catKeys.map(cat => (
                                                <div key={cat} className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-wide py-1">{CATS[cat]}</div>
                                            ))}
                                        </div>
                                        {/* Filas por nivel */}
                                        {a.locKeys.map(loc => (
                                            <div key={loc} className="grid mt-1" style={{ gridTemplateColumns: `96px repeat(${a.catKeys.length}, 1fr)`, gap: '4px' }}>
                                                <div className="flex items-center text-[11px] font-bold text-slate-300 pr-1">{LOCS[loc]}</div>
                                                {a.catKeys.map(cat => {
                                                    const v = a.grid[loc][cat];
                                                    const t = a.max > 0 ? v / a.max : 0;
                                                    const isGolden = a.golden && a.golden.loc === loc && a.golden.cat === cat && v > 0;
                                                    const light = t > 0.45;
                                                    return (
                                                        <div key={cat}
                                                            className={`rounded-lg h-14 flex flex-col items-center justify-center transition-transform ${isGolden ? 'ring-2 ring-amber-300 scale-[1.03]' : ''}`}
                                                            style={{ background: heatColor(t) }}>
                                                            <span className={`font-black text-sm ${light ? 'text-slate-900' : 'text-slate-200'}`}>{v.toFixed(1)}</span>
                                                            <span className={`text-[9px] ${light ? 'text-slate-800/70' : 'text-slate-500'}`}>uds</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {/* Leyenda */}
                                <div className="flex items-center justify-center gap-2 mt-3">
                                    <span className="text-[10px] text-slate-500">Frío</span>
                                    <div className="h-2 w-32 rounded-full" style={{ background: 'linear-gradient(90deg, rgb(17,24,39), rgb(245,158,11), rgb(234,88,12))' }} />
                                    <span className="text-[10px] text-slate-500">Caliente</span>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-2xl bg-slate-900 border border-amber-500/20 p-4 text-sm text-amber-300/80">
                                Tus reportes tienen ubicación en anaquel, pero falta la <b>categoría adyacente</b> para armar el mapa completo. Pídele al mercaderista que la registre en el reporte.
                            </div>
                        )}

                        <p className="text-center text-[11px] text-slate-600">Basado en {a.nValid} reporte{a.nValid === 1 ? '' : 's'} de anaquel de tu cartera.</p>
                    </>
                )}
            </div>
        </div>
    ), document.body);
}
