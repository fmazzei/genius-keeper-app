// RUTA: src/Components/VendorKpiConfig.jsx
//
// Configurador (máster) de los KPIs que ve el VENDEDOR en la 2ª vista de su Home.
// Config por ROL (todos los vendedores), guardada en settings/vendorKpiConfig.
// AdminPanel → Comercial → "KPIs del Vendedor".

import React, { useState, useEffect } from 'react';
import { Save, Eye, EyeOff } from 'lucide-react';
import { useVendorKpiConfig } from '@/hooks/useVendorKpiConfig.js';
import { VENDOR_KPI_REGISTRY, VENDOR_KPI_CATS } from '@/config/vendorKpiRegistry.js';

export default function VendorKpiConfig() {
    const { config, loading, save } = useVendorKpiConfig();
    const [state, setState] = useState([]);      // [{ id, enabled, order }]
    const [saving, setSaving] = useState(false);
    const [saved, setSaved]   = useState(false);

    useEffect(() => {
        if (loading) return;
        const savedMap = Object.fromEntries((config?.widgets || []).map(w => [w.id, w]));
        setState(VENDOR_KPI_REGISTRY.map((w, i) => ({
            id: w.id,
            enabled: savedMap[w.id]?.enabled ?? true,   // por defecto: todos visibles
            order: savedMap[w.id]?.order ?? i,
        })));
    }, [config, loading]);

    const enabledOf = (id) => state.find(w => w.id === id)?.enabled ?? true;
    const toggle = (id) => setState(s => s.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w));
    const setAll = (val) => setState(s => s.map(w => ({ ...w, enabled: val })));

    const handleSave = async () => {
        setSaving(true);
        try { await save(state); setSaved(true); setTimeout(() => setSaved(false), 3000); }
        catch (e) { alert('No se pudo guardar. Intenta de nuevo.'); }
        finally { setSaving(false); }
    };

    if (loading || !state.length) {
        return <div className="h-40 rounded-xl bg-white border border-slate-200 animate-pulse" />;
    }

    const enabledCount = state.filter(w => w.enabled).length;

    return (
        <div className="bg-white rounded-lg shadow p-5">
            <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                    <h3 className="text-xl font-semibold text-slate-700">KPIs del Vendedor</h3>
                    <p className="text-sm text-slate-500 mt-1">
                        Elige qué indicadores ve el vendedor en la 2ª vista de su Home (desliza →). Aplica a <strong>todos los vendedores</strong>.
                    </p>
                </div>
                <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-2 bg-brand-blue text-white font-bold py-2 px-5 rounded-lg hover:bg-opacity-90 disabled:opacity-60 shrink-0">
                    <Save size={16} /> {saving ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar'}
                </button>
            </div>

            <div className="flex items-center gap-2 border-b border-slate-200 pb-3 mb-5">
                <span className="text-sm text-slate-500">{enabledCount} de {state.length} activos</span>
                <div className="ml-auto flex gap-2">
                    <button onClick={() => setAll(true)} className="text-xs text-brand-blue hover:underline font-medium">Activar todos</button>
                    <span className="text-slate-300">·</span>
                    <button onClick={() => setAll(false)} className="text-xs text-slate-500 hover:underline font-medium">Desactivar todos</button>
                </div>
            </div>

            <div className="space-y-6">
                {VENDOR_KPI_CATS.map(cat => (
                    <div key={cat}>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{cat}</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {VENDOR_KPI_REGISTRY.filter(w => w.cat === cat).map(w => {
                                const on = enabledOf(w.id);
                                return (
                                    <button key={w.id} onClick={() => toggle(w.id)}
                                        className={`flex items-start gap-3 text-left p-3 rounded-xl border transition-colors ${on ? 'bg-blue-50/60 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
                                        <span className={`mt-0.5 w-9 h-5 rounded-full flex items-center px-0.5 shrink-0 transition-colors ${on ? 'bg-brand-blue justify-end' : 'bg-slate-300 justify-start'}`}>
                                            <span className="w-4 h-4 rounded-full bg-white" />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="flex items-center gap-1.5 font-semibold text-slate-800 text-sm">
                                                {on ? <Eye size={13} className="text-brand-blue" /> : <EyeOff size={13} className="text-slate-400" />}
                                                {w.label}
                                            </span>
                                            <span className="block text-xs text-slate-500 mt-0.5">{w.desc}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
