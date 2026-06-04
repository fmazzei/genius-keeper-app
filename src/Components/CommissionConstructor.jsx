// RUTA: src/Components/CommissionConstructor.jsx

import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { Save, Plus, Trash2, AlertCircle } from 'lucide-react';
import LoadingSpinner from '@/Components/LoadingSpinner';

export const DEFAULT_COMMISSION_CONFIG = {
    salarioFijo: 300,
    viaticosSemanales: 25,
    tiers: [
        { label: 'Plus',   minPct: 120, rate: 4.5 },
        { label: 'Óptima', minPct: 100, rate: 4.0 },
        { label: 'Básica', minPct: 90,  rate: 3.5 },
    ],
    bonusPuntualidad: 1.0,
    bonusActivacion: 1.0,
    activacionThreshold: 80,
    activacionMinUnits: 24,
    arranque: [
        { mes: 1, meta: 1429 },
        { mes: 2, meta: 1786 },
    ],
    facturaMaxDias: 60,
};

// ─── NumberField ──────────────────────────────────────────────────────────────

const NumberField = ({ label, value, onChange, min = 0, step = 1, suffix = '', hint }) => (
    <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">{label}</label>
        <div className="flex items-center gap-2">
            <input
                type="number"
                min={min}
                step={step}
                value={value}
                onChange={e => onChange(Number(e.target.value) || 0)}
                className="flex-1 p-2.5 border border-slate-300 rounded-lg text-sm"
            />
            {suffix && <span className="text-sm text-slate-500 shrink-0">{suffix}</span>}
        </div>
        {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

const CommissionConstructor = ({ vendedor, onClose }) => {
    const [config, setConfig] = useState(DEFAULT_COMMISSION_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving]   = useState(false);
    const [error, setError]     = useState('');
    const [simAmount, setSimAmount] = useState(10000);

    useEffect(() => {
        (async () => {
            try {
                const snap = await getDoc(doc(db, 'users_metadata', vendedor.id));
                if (snap.exists() && snap.data().commissionConfig) {
                    setConfig({ ...DEFAULT_COMMISSION_CONFIG, ...snap.data().commissionConfig });
                }
            } catch (e) {
                console.warn('CommissionConstructor load error:', e);
            } finally {
                setLoading(false);
            }
        })();
    }, [vendedor.id]);

    const handleSave = async () => {
        setSaving(true);
        setError('');
        try {
            await updateDoc(doc(db, 'users_metadata', vendedor.id), { commissionConfig: config });
            onClose();
        } catch (e) {
            setError('No se pudo guardar: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const updateTier = (i, field, value) => {
        const updated = config.tiers.map((t, j) => j === i ? { ...t, [field]: value } : t);
        setConfig(p => ({ ...p, tiers: updated }));
    };

    const addTier = () => setConfig(p => ({
        ...p,
        tiers: [...p.tiers, { label: 'Nuevo', minPct: 0, rate: 0 }],
    }));

    const removeTier = (i) => setConfig(p => ({ ...p, tiers: p.tiers.filter((_, j) => j !== i) }));

    const updateArranque = (i, field, value) => {
        const updated = config.arranque.map((a, j) => j === i ? { ...a, [field]: value } : a);
        setConfig(p => ({ ...p, arranque: updated }));
    };

    const addArranque = () => setConfig(p => ({
        ...p,
        arranque: [...p.arranque, { mes: p.arranque.length + 1, meta: 0 }],
    }));

    const removeArranque = (i) => setConfig(p => ({ ...p, arranque: p.arranque.filter((_, j) => j !== i) }));

    // ── Projection ────────────────────────────────────────────────────────────
    const project = (rate) => {
        const commission = simAmount * (rate / 100);
        const bonuses    = simAmount * ((config.bonusPuntualidad + config.bonusActivacion) / 100);
        const fijo       = config.salarioFijo;
        const viaticos   = config.viaticosSemanales * 4;
        return { commission, bonuses, fijo, viaticos, total: commission + bonuses + fijo + viaticos };
    };

    if (loading) return (
        <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
        </div>
    );

    const lowestTierMinPct = config.tiers.length > 0 ? Math.min(...config.tiers.map(t => t.minPct)) : 90;

    return (
        <div className="space-y-6 max-h-[78vh] overflow-y-auto px-0.5 pb-2">

            {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                    <AlertCircle size={16} className="shrink-0" />
                    {error}
                </div>
            )}

            {/* ── 1. Ingresos Base ── */}
            <section>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-3">Ingresos Base</p>
                <div className="grid grid-cols-2 gap-3">
                    <NumberField
                        label="Fijo mensual (USD)"
                        value={config.salarioFijo}
                        step={10}
                        onChange={v => setConfig(p => ({ ...p, salarioFijo: v }))}
                    />
                    <NumberField
                        label="Viáticos/semana (USD)"
                        value={config.viaticosSemanales}
                        step={5}
                        onChange={v => setConfig(p => ({ ...p, viaticosSemanales: v }))}
                    />
                </div>
            </section>

            {/* ── 2. Estructura de Comisión ── */}
            <section>
                <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Estructura de Comisión</p>
                    <button
                        type="button"
                        onClick={addTier}
                        className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                    >
                        <Plus size={13} /> Nivel
                    </button>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[1fr_110px_110px_32px] text-[10px] font-bold text-slate-400 uppercase bg-slate-50 px-3 py-2 border-b border-slate-200 gap-2">
                        <span>Nivel</span>
                        <span className="text-center">Cumpl. mín.</span>
                        <span className="text-center">Comisión</span>
                        <span />
                    </div>
                    {config.tiers.map((tier, i) => (
                        <div key={i} className="grid grid-cols-[1fr_110px_110px_32px] items-center px-3 py-2.5 border-b border-slate-100 last:border-b-0 gap-2">
                            <input
                                type="text"
                                value={tier.label}
                                onChange={e => updateTier(i, 'label', e.target.value)}
                                className="text-sm font-semibold text-slate-800 border border-transparent hover:border-slate-300 focus:border-blue-400 focus:outline-none rounded px-1 py-1 w-full bg-transparent"
                            />
                            <div className="flex items-center gap-1">
                                <input
                                    type="number" min="0" step="5"
                                    value={tier.minPct}
                                    onChange={e => updateTier(i, 'minPct', Number(e.target.value) || 0)}
                                    className="w-full text-center p-1.5 border border-slate-200 rounded-lg text-sm"
                                />
                                <span className="text-slate-400 text-xs shrink-0">%</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <input
                                    type="number" min="0" step="0.5"
                                    value={tier.rate}
                                    onChange={e => updateTier(i, 'rate', Number(e.target.value) || 0)}
                                    className="w-full text-center p-1.5 border border-slate-200 rounded-lg text-sm"
                                />
                                <span className="text-slate-400 text-xs shrink-0">%</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => removeTier(i)}
                                disabled={config.tiers.length <= 1}
                                className="p-1 text-slate-300 hover:text-red-500 disabled:opacity-20 transition-colors"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">Evalúa de arriba a abajo — ordénalos de mayor a menor cumplimiento.</p>
            </section>

            {/* ── 3. Bonos ── */}
            <section>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-3">Bonos</p>
                <div className="grid grid-cols-2 gap-3">
                    <NumberField
                        label="Bono Puntualidad (%)"
                        value={config.bonusPuntualidad}
                        step={0.5}
                        suffix="%"
                        onChange={v => setConfig(p => ({ ...p, bonusPuntualidad: v }))}
                    />
                    <NumberField
                        label="Bono Activación (%)"
                        value={config.bonusActivacion}
                        step={0.5}
                        suffix="%"
                        onChange={v => setConfig(p => ({ ...p, bonusActivacion: v }))}
                    />
                    <NumberField
                        label="Umbral activación (% cartera)"
                        value={config.activacionThreshold}
                        step={5}
                        max={100}
                        suffix="%"
                        hint="% de PDVs a cubrir para ganar el bono"
                        onChange={v => setConfig(p => ({ ...p, activacionThreshold: v }))}
                    />
                    <NumberField
                        label="Mín. unidades por punto"
                        value={config.activacionMinUnits}
                        step={1}
                        suffix="uds"
                        hint="Mínimo de unidades por PDV para que cuente"
                        onChange={v => setConfig(p => ({ ...p, activacionMinUnits: v }))}
                    />
                </div>
            </section>

            {/* ── 4. Período de Arranque ── */}
            <section>
                <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Período de Arranque</p>
                    <button
                        type="button"
                        onClick={addArranque}
                        className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                    >
                        <Plus size={13} /> Mes
                    </button>
                </div>
                {config.arranque.length === 0 ? (
                    <p className="text-sm text-slate-400 italic py-2">Sin período de arranque — meta plena desde el inicio.</p>
                ) : (
                    <div className="space-y-2">
                        {config.arranque.map((item, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-slate-600 w-12 shrink-0">Mes {i + 1}</span>
                                <input
                                    type="number"
                                    min="0"
                                    value={item.meta}
                                    onChange={e => updateArranque(i, 'meta', Number(e.target.value) || 0)}
                                    className="flex-1 p-2.5 border border-slate-300 rounded-lg text-sm"
                                    placeholder="Unidades meta"
                                />
                                <span className="text-sm text-slate-500 shrink-0">uds</span>
                                <button
                                    type="button"
                                    onClick={() => removeArranque(i)}
                                    className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* ── 5. Política de Cobro ── */}
            <section>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-3">Política de Cobro</p>
                <NumberField
                    label="Días máx. sin cobrar para generar comisión"
                    value={config.facturaMaxDias}
                    step={5}
                    suffix="días"
                    hint="Las facturas más antiguas no computan hasta cobrarse. No es penalización."
                    onChange={v => setConfig(p => ({ ...p, facturaMaxDias: v }))}
                />
            </section>

            {/* ── 6. Proyección de Ingresos ── */}
            <section className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-3">Simulador de Ingresos</p>
                <div className="flex items-center gap-3 mb-4">
                    <span className="text-sm font-semibold text-slate-700 shrink-0">Monto cobrado estimado:</span>
                    <div className="flex items-center gap-1 flex-1">
                        <span className="text-slate-500 text-sm">$</span>
                        <input
                            type="number"
                            min="0"
                            step="1000"
                            value={simAmount}
                            onChange={e => setSimAmount(Number(e.target.value) || 0)}
                            className="flex-1 p-2.5 border border-slate-300 rounded-lg text-sm font-mono text-right"
                        />
                        <span className="text-slate-500 text-xs shrink-0">USD/mes</span>
                    </div>
                </div>

                <div className="space-y-2">
                    {[...config.tiers]
                        .sort((a, b) => a.minPct - b.minPct)
                        .reverse()
                        .map((tier, i) => {
                            const proj = project(tier.rate);
                            return (
                                <div key={i} className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div>
                                            <span className="font-bold text-slate-800 text-sm">{tier.label}</span>
                                            <span className="text-xs text-slate-400 ml-1.5">({tier.minPct}%+ de meta)</span>
                                        </div>
                                        <span className="font-black text-emerald-700 text-lg">${proj.total.toFixed(0)}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
                                        <span>Fijo <span className="font-semibold text-slate-600">${proj.fijo}</span></span>
                                        <span>Viáticos <span className="font-semibold text-slate-600">${proj.viaticos}</span></span>
                                        <span>Comisión <span className="font-semibold text-slate-600">${proj.commission.toFixed(0)}</span></span>
                                        <span>Bonos <span className="font-semibold text-slate-600">${proj.bonuses.toFixed(0)}</span></span>
                                    </div>
                                </div>
                            );
                        })}

                    {/* Baja (below all tiers) */}
                    <div className="bg-slate-100 rounded-xl p-3 border border-slate-200">
                        <div className="flex items-center justify-between mb-1.5">
                            <div>
                                <span className="font-bold text-slate-500 text-sm">Baja</span>
                                <span className="text-xs text-slate-400 ml-1.5">(&lt;{lowestTierMinPct}% de meta)</span>
                            </div>
                            <span className="font-black text-slate-500 text-lg">
                                ${(config.salarioFijo + config.viaticosSemanales * 4).toFixed(0)}
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 text-xs text-slate-400">
                            <span>Fijo <span className="font-semibold">${config.salarioFijo}</span></span>
                            <span>Viáticos <span className="font-semibold">${config.viaticosSemanales * 4}</span></span>
                            <span className="italic">Sin comisión por meta</span>
                        </div>
                    </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-2.5">
                    * Con ambos bonos activos (puntualidad + activación). Las tasas aplican sobre el monto efectivamente cobrado.
                </p>
            </section>

            {/* ── Footer ── */}
            <div className="flex gap-3 pt-2 border-t border-slate-200 sticky bottom-0 bg-white pb-1">
                <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-3 px-4 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-brand-blue text-white rounded-lg font-semibold disabled:opacity-50 hover:bg-opacity-90 transition-colors"
                >
                    {saving ? <LoadingSpinner size="sm" /> : <Save size={18} />}
                    {saving ? 'Guardando…' : 'Guardar'}
                </button>
            </div>
        </div>
    );
};

export default CommissionConstructor;
