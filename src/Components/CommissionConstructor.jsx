// RUTA: src/Components/CommissionConstructor.jsx

import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { Plus, Trash2, AlertCircle, FileText } from 'lucide-react';
import { DEFAULT_COMMISSION_CONFIG } from '@/utils/commissionDefaults.js';
import { esquemasComision, fechaLocal } from '@/utils/periodosComision.js';
import LoadingSpinner from '@/Components/LoadingSpinner';
import CommissionProposalDoc from '@/Components/CommissionProposalDoc.jsx';

export { DEFAULT_COMMISSION_CONFIG } from '@/utils/commissionDefaults.js';

// ─── Inline number row ────────────────────────────────────────────────────────
const InlineRow = ({ label, hint, value, onChange, step = 1, min = 0, suffix }) => (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-b-0">
        <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-700 leading-snug">{label}</p>
            {hint && <p className="text-xs text-slate-400 mt-0.5 leading-tight">{hint}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
            <input
                type="number"
                min={min}
                step={step}
                value={value === 0 ? '' : value}
                onChange={e => onChange(Number(e.target.value) || 0)}
                className="w-20 text-center p-2 border border-slate-200 rounded-lg text-sm font-mono bg-white"
            />
            {suffix && <span className="text-sm text-slate-400 shrink-0">{suffix}</span>}
        </div>
    </div>
);

// ─── Section header ───────────────────────────────────────────────────────────
const SectionHeader = ({ label, action }) => (
    <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{label}</p>
        {action}
    </div>
);

const fmtUnits = (n) => Math.round(n).toLocaleString('es-VE');

// ─── Desglose por unidades: % según meta + % total (con bonos) ────────────────
// Espejo de buildTiers/getTierFromConfig (functions/handlers/commissionEngine.js):
// "Baja" = por debajo del tier más bajo configurado, paga la misma tasa base de ese tier.
// Devuelve un mapa { [tier.label]: row, __baja__: row } con el rango de unidades
// y el % total (tasa + bonos) para una meta dada — usado para que la "Estructura
// de Comisión" refleje automáticamente las unidades de cada nivel, tanto en la
// meta plena como en cada mes del período de arranque.
const buildBreakdown = (config, meta) => {
    const sorted = [...config.tiers].sort((a, b) => a.minPct - b.minPct); // asc: Básica, Óptima, Plus
    const lowest = sorted[0];
    const bonusTotal = (config.bonusPuntualidad || 0) + (config.bonusActivacion || 0);

    const rows = {};
    rows.__baja__ = {
        label: config.bajaLabel || 'Baja',
        pctLabel: lowest ? `< ${lowest.minPct}%` : '—',
        minUnits: 0,
        maxUnits: lowest ? Math.round(meta * lowest.minPct / 100) - 1 : null,
        rate: config.bajaRate ?? 0,
        total: config.bajaRate ?? 0,
    };
    sorted.forEach((tier, i) => {
        const next = sorted[i + 1];
        rows[tier.label] = {
            label: tier.label,
            pctLabel: next ? `${tier.minPct}%` : `+${tier.minPct}%`,
            minUnits: Math.round(meta * tier.minPct / 100),
            maxUnits: next ? Math.round(meta * next.minPct / 100) - 1 : null,
            rate: tier.rate,
            total: tier.rate + bonusTotal,
        };
    });
    return rows;
};

const unitsLabel = (row) => {
    if (!row) return '—';
    if (row.maxUnits === null) return `≥ ${fmtUnits(row.minUnits)} uds`;
    if (row.minUnits === 0)    return `< ${fmtUnits(row.maxUnits + 1)} uds`;
    return `${fmtUnits(row.minUnits)} – ${fmtUnits(row.maxUnits)} uds`;
};

// Escenarios de meta a mostrar: la meta plena + un escenario por cada mes de
// arranque (con su meta reducida) — así los rangos de unidades de cada nivel
// se ven correctos sin desfase durante el período de arranque.
const getScenarios = (config) => [
    {
        title: config.arranque.length > 0 ? `Meta plena (desde mes ${config.arranque.length + 1})` : 'Meta mensual',
        meta: config.metaMensual,
    },
    ...config.arranque.map((a, i) => ({
        title: `Mes ${i + 1} de arranque`,
        meta: a.meta || config.metaMensual,
    })),
];

// ─── Main component ───────────────────────────────────────────────────────────
// "YYYY-MM-DD" → "01/11/2026".
const ddmmaaaa = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const hoyClave = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const primeroDelMesSiguiente = () => { const d = new Date(); const n = new Date(d.getFullYear(), d.getMonth() + 1, 1); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`; };

// Un esquema guardado → el formulario (valores por defecto + arranque normalizado).
const aFormulario = (raw = {}) => {
    const merged = { ...DEFAULT_COMMISSION_CONFIG, ...raw };
    Object.keys(DEFAULT_COMMISSION_CONFIG).forEach(k => { if (merged[k] === undefined || merged[k] === null) merged[k] = DEFAULT_COMMISSION_CONFIG[k]; });
    if (!merged.esquema) merged.esquema = 'niveles';
    if (merged.tasaFija === undefined) merged.tasaFija = 0;
    const topMeta = merged.metaMensual;
    // Normaliza arranque a { mes, pct, meta }: si solo había `meta`
    // (formato anterior), deriva el % equivalente sobre la meta plena.
    merged.arranque = (merged.arranque || []).map((a, i) => {
        const pct = a.pct ?? (topMeta > 0 ? Math.round(((a.meta || 0) / topMeta) * 100) : 0);
        return { mes: a.mes ?? (i + 1), pct, meta: a.meta ?? Math.round(topMeta * pct / 100) };
    });
    return merged;
};

const CommissionConstructor = forwardRef(({ vendedor, onClose }, ref) => {
    // Esquemas del vendedor: el primero rige desde su ingreso; cada cambio, desde
    // su fecha (ver periodosComision.js). Se edita uno a la vez.
    const [esquemas, setEsquemas]   = useState([{ desde: null, config: aFormulario() }]);
    const [slot, setSlot]           = useState(0);
    const [nuevoDesde, setNuevoDesde] = useState(null);   // fecha del cambio que se está creando
    const config = esquemas[slot]?.config || esquemas[0].config;
    const setConfig = (fn) => setEsquemas(es => es.map((e, i) => i === slot
        ? { ...e, config: typeof fn === 'function' ? fn(e.config) : fn } : e));
    const [loading, setLoading]     = useState(true);
    const [saving, setSaving]       = useState(false);
    const [error, setError]         = useState('');
    const [simAmount, setSimAmount] = useState(10000);
    const [showProposal, setShowProposal] = useState(false);
    const [vendedorName, setVendedorName] = useState(vendedor.name || vendedor.nombre || 'Vendedor');

    useEffect(() => {
        (async () => {
            try {
                const snap = await getDoc(doc(db, 'users_metadata', vendedor.id));
                if (snap.exists()) {
                    const userData = snap.data();
                    if (userData.name) setVendedorName(userData.name);
                    // metaMensual del primer esquema vive arriba del documento.
                    const lista = esquemasComision(userData).map(e => ({ desde: e.desde, config: aFormulario(e.config) }));
                    setEsquemas(lista);
                    // Abre el esquema vigente hoy.
                    const hoy = fechaLocal(hoyClave());
                    let vigente = 0;
                    lista.forEach((e, i) => { if (i > 0 && fechaLocal(e.desde) <= hoy) vigente = i; });
                    setSlot(vigente);
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
            const [primero, ...cambios] = esquemas;
            await updateDoc(doc(db, 'users_metadata', vendedor.id), {
                commissionConfig: primero.config,
                metaMensual: primero.config.metaMensual,   // keep top-level field in sync
                commissionConfigCambios: cambios.map(e => ({ desde: e.desde, config: e.config })),
            });
            onClose();
        } catch (e) {
            setError('No se pudo guardar: ' + e.message);
            setSaving(false);
        }
    };

    useImperativeHandle(ref, () => ({ save: handleSave, saving }), [saving, esquemas]);

    // Esquema vigente hoy (para marcarlo).
    const idxVigente = (() => {
        const hoy = fechaLocal(hoyClave());
        let v = 0;
        esquemas.forEach((e, i) => { if (i > 0 && fechaLocal(e.desde) <= hoy) v = i; });
        return v;
    })();
    const etiquetaEsquema = (i) => {
        const e = esquemas[i];
        const sig = esquemas[i + 1];
        if (i === 0) {
            if (!sig) return 'Desde el ingreso';
            const d = fechaLocal(sig.desde); const a = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
            return `Hasta el ${String(a.getDate()).padStart(2, '0')}/${String(a.getMonth() + 1).padStart(2, '0')}/${a.getFullYear()}`;
        }
        return `Desde el ${ddmmaaaa(e.desde)}`;
    };
    const crearCambio = () => {
        if (!nuevoDesde || !fechaLocal(nuevoDesde)) { setError('Elige la fecha desde la que rige el nuevo esquema.'); return; }
        if (esquemas.some(e => e.desde === nuevoDesde)) { setError('Ya hay un esquema que empieza ese día.'); return; }
        // El nuevo esquema arranca como copia del que estaba vigente en esa fecha.
        const d = fechaLocal(nuevoDesde);
        let base = 0;
        esquemas.forEach((e, i) => { if (i > 0 && fechaLocal(e.desde) <= d) base = i; });
        const lista = [...esquemas, { desde: nuevoDesde, config: { ...esquemas[base].config, arranque: [] } }]
            .sort((a, b) => (a.desde === null ? -1 : b.desde === null ? 1 : fechaLocal(a.desde) - fechaLocal(b.desde)));
        setEsquemas(lista);
        setSlot(lista.findIndex(e => e.desde === nuevoDesde));
        setNuevoDesde(null);
        setError('');
    };
    const quitarCambio = (i) => {
        if (i === 0) return;
        if (!window.confirm(`¿Quitar el esquema que rige ${etiquetaEsquema(i).toLowerCase()}? Los meses desde esa fecha volverán al esquema anterior (salvo los ya congelados).`)) return;
        setEsquemas(es => es.filter((_, j) => j !== i));
        setSlot(s => (s >= i ? Math.max(0, s - 1) : s));
    };
    const fija = config.esquema === 'fija';

    const updateTier    = (i, field, val) =>
        setConfig(p => ({ ...p, tiers: p.tiers.map((t, j) => j === i ? { ...t, [field]: val } : t) }));
    const addTier       = () =>
        setConfig(p => ({ ...p, tiers: [...p.tiers, { label: 'Nuevo', minPct: 0, rate: 0 }] }));
    const removeTier    = (i) =>
        setConfig(p => ({ ...p, tiers: p.tiers.filter((_, j) => j !== i) }));

    // Las metas de arranque se definen como % de la meta mensual; las unidades
    // (`meta`) se derivan automáticamente y se recalculan si cambia la meta mensual.
    const updateArranquePct = (i, pct) =>
        setConfig(p => ({
            ...p,
            arranque: p.arranque.map((a, j) => j === i ? { ...a, pct, meta: Math.round(p.metaMensual * pct / 100) } : a),
        }));
    const addArranque   = () =>
        setConfig(p => ({ ...p, arranque: [...p.arranque, { mes: p.arranque.length + 1, pct: 0, meta: 0 }] }));
    const removeArranque = (i) =>
        setConfig(p => ({ ...p, arranque: p.arranque.filter((_, j) => j !== i) }));
    const setMetaMensual = (v) =>
        setConfig(p => ({
            ...p,
            metaMensual: v,
            arranque: p.arranque.map(a => ({ ...a, meta: Math.round(v * (a.pct || 0) / 100) })),
        }));

    const project = (rate) => {
        const commission = simAmount * (rate / 100);
        const bonuses    = simAmount * (((config.bonusPuntualidad || 0) + (config.bonusActivacion || 0)) / 100);
        const fijo       = config.salarioFijo;
        const viaticos   = config.viaticosSemanales * 4;
        return { commission, bonuses, fijo, viaticos, total: commission + bonuses + fijo + viaticos };
    };

    if (loading) return (
        <div className="flex items-center justify-center py-16"><LoadingSpinner /></div>
    );

    const lowestMinPct = config.tiers.length > 0 ? Math.min(...config.tiers.map(t => t.minPct)) : 90;
    const scenarios = getScenarios(config);

    return (
        <div className="w-full" style={{ overflowX: 'hidden', touchAction: 'pan-y' }}>
            <div className="px-4 pt-4 pb-6 space-y-6">

                {error && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* ── Esquemas por fecha ── */}
                <section>
                    <SectionHeader label="Esquema de comisión" />
                    <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                        <div className="flex flex-wrap gap-2">
                            {esquemas.map((e, i) => (
                                <button key={e.desde || 'inicio'} type="button" onClick={() => setSlot(i)}
                                    className={`text-left px-3 py-2 rounded-lg border text-xs font-semibold ${i === slot ? 'bg-[#0D2B4C] text-white border-[#0D2B4C]' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                                    {etiquetaEsquema(i)}
                                    <span className={`block text-[10px] font-normal ${i === slot ? 'text-white/70' : 'text-slate-400'}`}>
                                        {e.config.esquema === 'fija' ? `Tasa fija ${e.config.tasaFija || 0}%` : 'Por niveles'}{i === idxVigente ? ' · vigente hoy' : fechaLocal(e.desde) > new Date() ? ' · programado' : ''}
                                    </span>
                                </button>
                            ))}
                        </div>
                        {nuevoDesde === null ? (
                            <button type="button" onClick={() => setNuevoDesde(primeroDelMesSiguiente())}
                                className="flex items-center gap-1 text-xs font-semibold text-blue-600 active:opacity-60">
                                <Plus size={13} /> Cambiar el esquema desde una fecha
                            </button>
                        ) : (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 space-y-2">
                                <p className="text-xs text-slate-600">El nuevo esquema rige para los meses que <b>empiezan</b> desde esta fecha. Lo anterior no se toca. Lo facturado antes se sigue pagando con su esquema aunque se cobre después.</p>
                                <div className="flex items-center gap-2">
                                    <input type="date" value={nuevoDesde} onChange={e => setNuevoDesde(e.target.value)}
                                        className="min-w-0 flex-1 p-2 border border-slate-200 rounded-lg text-sm bg-white" />
                                    <button type="button" onClick={crearCambio} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold">Crear</button>
                                    <button type="button" onClick={() => setNuevoDesde(null)} className="px-2 py-2 text-xs text-slate-500">Cancelar</button>
                                </div>
                            </div>
                        )}
                        <p className="text-[11px] text-slate-500 leading-snug">
                            Estás editando: <b>{etiquetaEsquema(slot).toLowerCase()}</b>.
                            {slot === 0 && esquemas.length > 1 ? ' Corregir este esquema recalcula los meses anteriores al cambio que no estén congelados.' : ''}
                            {slot === 0 && esquemas.length === 1 ? ' Corregir este esquema recalcula los meses que no estén congelados. Para que un cambio rija solo desde una fecha, usa "Cambiar el esquema desde una fecha".' : ''}
                        </p>
                        {slot > 0 && (
                            <button type="button" onClick={() => quitarCambio(slot)} className="flex items-center gap-1 text-xs font-semibold text-red-600">
                                <Trash2 size={13} /> Quitar este cambio
                            </button>
                        )}
                    </div>
                </section>

                {/* ── 0. Descargar propuesta ── */}
                <button
                    type="button"
                    onClick={() => setShowProposal(true)}
                    className="w-full flex items-center justify-center gap-2 bg-[#0D2B4C] hover:bg-[#123a63] text-white font-bold text-sm py-3 rounded-xl active:opacity-80 transition-colors"
                >
                    <FileText size={16} /> Ver / Descargar propuesta (PDF)
                </button>

                {/* ── 1. Meta Mensual ── */}
                <section>
                    <SectionHeader label="Meta de Facturación" />
                    <div className="bg-white border border-slate-200 rounded-xl px-4">
                        <InlineRow
                            label="Meta mensual"
                            hint="Unidades a facturar/colocar por mes para cumplimiento 100%"
                            suffix="uds"
                            value={config.metaMensual}
                            step={50}
                            onChange={setMetaMensual}
                        />
                        <InlineRow
                            label="Precio por unidad"
                            hint="Convierte metas de unidades a dólares (y alimenta la propuesta)"
                            suffix="USD"
                            value={config.precioUnidad}
                            step={0.1}
                            onChange={v => setConfig(p => ({ ...p, precioUnidad: v }))}
                        />
                    </div>
                </section>

                {/* ── 2. Período de Arranque ── */}
                <section>
                    <SectionHeader
                        label="Período de Arranque"
                        action={
                            <button type="button" onClick={addArranque} className="flex items-center gap-1 text-xs font-semibold text-blue-600 active:opacity-60">
                                <Plus size={13} /> Mes
                            </button>
                        }
                    />
                    {config.arranque.length === 0 ? (
                        <p className="text-sm text-slate-400 italic py-2 px-1">Sin período de arranque — meta plena desde el inicio.</p>
                    ) : (
                        <div className="bg-white border border-slate-200 rounded-xl px-4">
                            {config.arranque.map((item, i) => (
                                <div key={i} className="flex items-center gap-2 py-3 border-b border-slate-100 last:border-b-0">
                                    <p className="text-sm font-semibold text-slate-600 w-12 shrink-0">Mes {i + 1}</p>
                                    <div className="flex items-center gap-1 flex-1 min-w-0">
                                        <input
                                            type="number" min="0" max="100" step="5"
                                            value={item.pct === 0 ? '' : item.pct}
                                            onChange={e => updateArranquePct(i, Number(e.target.value) || 0)}
                                            className="w-16 shrink-0 p-2 border border-slate-200 rounded-xl text-sm font-mono text-center"
                                        />
                                        <span className="text-sm text-slate-400 shrink-0">% =</span>
                                        <span className="flex-1 min-w-0 text-sm font-mono text-slate-600 text-right truncate">{fmtUnits(item.meta)} uds</span>
                                    </div>
                                    <button type="button" onClick={() => removeArranque(i)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors shrink-0">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="text-xs text-slate-400 mt-1.5 px-1">
                        % de la meta mensual para cada mes — las unidades se calculan automáticamente y se actualizan si cambia la meta.
                    </p>
                </section>

                {/* ── 3. Tipo de comisión ── */}
                <section>
                    <SectionHeader label="Tipo de comisión" />
                    <div className="grid grid-cols-2 gap-2">
                        {[['niveles', 'Por niveles', 'La tasa sube con el % de la meta'], ['fija', 'Tasa fija', 'Una sola tasa sobre todo lo cobrado']].map(([k, t, h]) => (
                            <button key={k} type="button" onClick={() => setConfig(p => ({ ...p, esquema: k }))}
                                className={`text-left p-3 rounded-xl border ${config.esquema === k ? 'bg-emerald-50 border-emerald-400' : 'bg-white border-slate-200'}`}>
                                <p className={`text-sm font-bold ${config.esquema === k ? 'text-emerald-800' : 'text-slate-700'}`}>{t}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{h}</p>
                            </button>
                        ))}
                    </div>
                    {fija && (
                        <div className="bg-white border border-slate-200 rounded-xl px-4 mt-2">
                            <InlineRow
                                label="Comisión fija"
                                hint="Sobre lo cobrado de retail, sin importar el % de la meta. La meta sigue contando para los indicadores."
                                suffix="%"
                                value={config.tasaFija}
                                step={0.5}
                                onChange={v => setConfig(p => ({ ...p, tasaFija: v }))}
                            />
                        </div>
                    )}
                </section>

                {/* ── 3b. Estructura de Comisión (por niveles) ── */}
                {!fija && <section>
                    <SectionHeader
                        label="Estructura de Comisión — Tu % Según Meta"
                        action={
                            <button type="button" onClick={addTier} className="flex items-center gap-1 text-xs font-semibold text-blue-600 active:opacity-60">
                                <Plus size={13} /> Nivel
                            </button>
                        }
                    />
                    <div className="space-y-2">
                        {config.tiers.map((tier, i) => {
                            const rowsByScenario = scenarios.map(s => ({ ...s, row: buildBreakdown(config, s.meta)[tier.label] }));
                            return (
                                <div key={i} className="bg-white border border-slate-200 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <input
                                            type="text"
                                            value={tier.label}
                                            onChange={e => updateTier(i, 'label', e.target.value)}
                                            className="flex-1 min-w-0 text-base font-bold text-slate-800 border border-transparent focus:border-blue-400 focus:outline-none rounded-lg px-2 py-1 bg-slate-50"
                                            placeholder="Nombre del nivel"
                                        />
                                        <span className="text-xs font-black text-emerald-700 shrink-0 whitespace-nowrap">
                                            {rowsByScenario[0].row.total.toFixed(1)}% total
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => removeTier(i)}
                                            disabled={config.tiers.length <= 1}
                                            className="p-1.5 text-slate-300 hover:text-red-500 disabled:opacity-20 transition-colors shrink-0"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                    <div className="flex gap-3 mb-3">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-slate-400 mb-1">Cumplimiento mín.</p>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number" min="0" step="5"
                                                    value={tier.minPct === 0 ? '' : tier.minPct}
                                                    onChange={e => updateTier(i, 'minPct', Number(e.target.value) || 0)}
                                                    className="min-w-0 w-full text-center p-2 border border-slate-200 rounded-xl text-sm font-mono"
                                                />
                                                <span className="text-slate-400 text-sm shrink-0">%</span>
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-slate-400 mb-1">Comisión</p>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number" min="0" step="0.5"
                                                    value={tier.rate === 0 ? '' : tier.rate}
                                                    onChange={e => updateTier(i, 'rate', Number(e.target.value) || 0)}
                                                    className="min-w-0 w-full text-center p-2 border border-slate-200 rounded-xl text-sm font-mono"
                                                />
                                                <span className="text-slate-400 text-sm shrink-0">%</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-1 border-t border-slate-100 pt-2">
                                        {rowsByScenario.map((s, j) => (
                                            <div key={j} className="flex items-center justify-between text-xs gap-2">
                                                <span className="text-slate-400 truncate">{s.title}</span>
                                                <span className="font-mono text-slate-600 shrink-0">{unitsLabel(s.row)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Nivel "Baja" — nivel más bajo, editable y eliminable */}
                        {config.bajaActiva === false ? (
                            <button
                                type="button"
                                onClick={() => setConfig(p => ({ ...p, bajaActiva: true, bajaRate: p.bajaRate || 3 }))}
                                className="w-full flex items-center justify-center gap-1.5 py-3 border border-dashed border-slate-300 rounded-xl text-xs font-semibold text-blue-600 active:opacity-60"
                            >
                                <Plus size={13} /> Agregar nivel más bajo (sin él, por debajo del mínimo no hay comisión)
                            </button>
                        ) : (() => {
                            const rowsByScenario = scenarios.map(s => ({ ...s, row: buildBreakdown(config, s.meta).__baja__ }));
                            return (
                                <div className="bg-white border border-slate-200 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <input
                                            type="text"
                                            value={config.bajaLabel || ''}
                                            onChange={e => setConfig(p => ({ ...p, bajaLabel: e.target.value }))}
                                            className="flex-1 min-w-0 text-base font-bold text-slate-800 border border-transparent focus:border-blue-400 focus:outline-none rounded-lg px-2 py-1 bg-slate-50"
                                            placeholder="Nombre del nivel"
                                        />
                                        <span className="text-xs font-black text-slate-500 shrink-0 whitespace-nowrap">{rowsByScenario[0].row.total.toFixed(1)}% total</span>
                                        <button
                                            type="button"
                                            onClick={() => setConfig(p => ({ ...p, bajaActiva: false, bajaRate: 0 }))}
                                            className="p-1.5 text-slate-300 hover:text-red-500 transition-colors shrink-0"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                    <div className="flex gap-3 mb-3">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-slate-400 mb-1">Cumplimiento mín.</p>
                                            <div className="flex items-center gap-1 p-2 bg-slate-50 rounded-xl">
                                                <span className="w-full text-center text-sm font-mono text-slate-400">{rowsByScenario[0].row.pctLabel}</span>
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-slate-400 mb-1">Comisión</p>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number" min="0" step="0.5"
                                                    value={config.bajaRate === 0 ? '' : config.bajaRate}
                                                    onChange={e => setConfig(p => ({ ...p, bajaRate: Number(e.target.value) || 0 }))}
                                                    className="min-w-0 w-full text-center p-2 border border-slate-200 rounded-xl text-sm font-mono"
                                                />
                                                <span className="text-slate-400 text-sm shrink-0">%</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-1 border-t border-slate-100 pt-2">
                                        {rowsByScenario.map((s, j) => (
                                            <div key={j} className="flex items-center justify-between text-xs gap-2">
                                                <span className="text-slate-400 truncate">{s.title}</span>
                                                <span className="font-mono text-slate-600 shrink-0">{unitsLabel(s.row)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 px-1">
                        Evalúa de arriba a abajo — ordénalos de mayor a menor. El nivel más bajo (editable y eliminable) aplica por debajo del mínimo configurado; si lo eliminas, por debajo del mínimo no hay comisión. El % total suma Bono Cobranza (+{config.bonusPuntualidad}%) y Bono Activación (+{config.bonusActivacion}%). El Bono Anaquel <b>sustituye</b> al de Activación en cuentas de régimen anaquel (no se suman), por eso no aparece aparte en el total. En el nivel más bajo no aplican bonos por meta.
                    </p>
                </section>}

                {/* ── 4. Bonos ── */}
                <section>
                    <SectionHeader label="Bonos" />
                    <p className="text-xs text-slate-400 mb-1.5 px-1">Un bono en 0 % queda apagado.</p>
                    <div className="bg-white border border-slate-200 rounded-xl px-4">
                        <InlineRow
                            label="Bono Cobranza"
                            hint="Se gana sobre CADA factura cobrada a tiempo (dentro de vencimiento + días de gracia)"
                            suffix="%"
                            value={config.bonusPuntualidad}
                            step={0.5}
                            onChange={v => setConfig(p => ({ ...p, bonusPuntualidad: v }))}
                        />
                        <InlineRow
                            label="Días de gracia (Bono Cobranza)"
                            hint="Cobrar dentro de vencimiento + estos días cuenta como 'a tiempo'"
                            suffix="días"
                            value={config.cobranzaGraciaDias}
                            step={1}
                            onChange={v => setConfig(p => ({ ...p, cobranzaGraciaDias: v }))}
                        />
                        <InlineRow
                            label="Bono Activación"
                            suffix="%"
                            value={config.bonusActivacion}
                            step={0.5}
                            onChange={v => setConfig(p => ({ ...p, bonusActivacion: v }))}
                        />
                        <InlineRow
                            label="Umbral de activación"
                            hint="% de PDVs de la cartera que debe cubrirse"
                            suffix="%"
                            value={config.activacionThreshold}
                            step={5}
                            onChange={v => setConfig(p => ({ ...p, activacionThreshold: v }))}
                        />
                        <InlineRow
                            label="Mín. unidades por PDV"
                            hint="Unidades mínimas por punto para que cuente"
                            suffix="uds"
                            value={config.activacionMinUnits}
                            step={1}
                            onChange={v => setConfig(p => ({ ...p, activacionMinUnits: v }))}
                        />
                        <InlineRow
                            label="Bono Disponibilidad en Anaquel"
                            hint="Sustituye al Bono Activación en cuentas con régimen 'Anaquel' (despacho centralizado/consignación)"
                            suffix="%"
                            value={config.bonusAnaquel}
                            step={0.5}
                            onChange={v => setConfig(p => ({ ...p, bonusAnaquel: v }))}
                        />
                        <InlineRow
                            label="Umbral de anaquel"
                            hint="% de sucursales activas que deben cumplir el mínimo"
                            suffix="%"
                            value={config.anaquelThreshold}
                            step={5}
                            onChange={v => setConfig(p => ({ ...p, anaquelThreshold: v }))}
                        />
                        <InlineRow
                            label="Mín. unidades en anaquel"
                            hint="Promedio mín. en visitas de martes/viernes para que cuente"
                            suffix="uds"
                            value={config.anaquelMinUnits}
                            step={1}
                            onChange={v => setConfig(p => ({ ...p, anaquelMinUnits: v }))}
                        />
                    </div>
                </section>

                {/* ── 5. Ingresos Base ── */}
                <section>
                    <SectionHeader label="Ingresos Base" />
                    <div className="bg-white border border-slate-200 rounded-xl px-4">
                        <InlineRow
                            label="Salario fijo mensual"
                            suffix="USD"
                            value={config.salarioFijo}
                            step={10}
                            onChange={v => setConfig(p => ({ ...p, salarioFijo: v }))}
                        />
                        <InlineRow
                            label="Viáticos por semana"
                            suffix="USD"
                            value={config.viaticosSemanales}
                            step={5}
                            onChange={v => setConfig(p => ({ ...p, viaticosSemanales: v }))}
                        />
                    </div>
                </section>

                {/* ── 6. Política de Cobro ── */}
                <section>
                    <SectionHeader label="Política de Cobro" />
                    <div className="bg-white border border-slate-200 rounded-xl px-4">
                        <InlineRow
                            label="Días máx. sin cobrar"
                            hint="Pasado este plazo la comisión de la factura se anula"
                            suffix="días"
                            value={config.facturaMaxDias}
                            step={5}
                            onChange={v => setConfig(p => ({ ...p, facturaMaxDias: v }))}
                        />
                        <InlineRow
                            label="Comisión Cuentas Recuperadas"
                            hint="Tasa flat por cobrar facturas heredadas de la cartera (previas o sin dueño)"
                            suffix="%"
                            value={config.comisionRecuperadas}
                            step={0.5}
                            onChange={v => setConfig(p => ({ ...p, comisionRecuperadas: v }))}
                        />
                        <InlineRow
                            label="Precio por unidad Foodservice"
                            hint="Precio de la unidad de 250 g en foodservice (las bolsas de 1–3 kg se convierten a unidades para el precio)."
                            suffix="$"
                            value={config.precioUnidadFoodservice}
                            step={0.1}
                            onChange={v => setConfig(p => ({ ...p, precioUnidadFoodservice: v }))}
                        />
                        <InlineRow
                            label="Comisión Foodservice"
                            hint="Tasa flat sobre lo cobrado de clientes del canal Foodservice (no aplica la tasa del nivel)"
                            suffix="%"
                            value={config.comisionFoodservice}
                            step={0.5}
                            onChange={v => setConfig(p => ({ ...p, comisionFoodservice: v }))}
                        />
                        <InlineRow
                            label="Meta Foodservice"
                            hint="Kg de queso al mes a clientes foodservice. Desde octubre de 2026 foodservice se mide aparte en kg y no suma a la meta de unidades. 0 = sin meta."
                            suffix="kg"
                            value={config.metaKgFoodservice}
                            step={5}
                            onChange={v => setConfig(p => ({ ...p, metaKgFoodservice: v }))}
                        />
                    </div>
                </section>

                {/* ── 7. Simulador de Ingresos ── */}
                <section>
                    <SectionHeader label="Simulador de Ingresos" />
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-600 shrink-0">Monto cobrado:</span>
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <span className="text-slate-400 shrink-0 text-sm">$</span>
                                <input
                                    type="number" min="0" step="1000"
                                    value={simAmount}
                                    onChange={e => setSimAmount(Number(e.target.value) || 0)}
                                    className="flex-1 min-w-0 p-2.5 border border-slate-200 rounded-xl text-sm font-mono text-right bg-white"
                                />
                                <span className="text-xs text-slate-400 shrink-0">USD</span>
                            </div>
                        </div>

                        {fija ? (() => {
                            const p = project(config.tasaFija || 0);
                            return (
                                <div className="bg-white rounded-xl p-3.5 border border-slate-200">
                                    <div className="flex items-baseline justify-between mb-1.5">
                                        <span className="font-bold text-slate-800">Tasa fija {config.tasaFija || 0}%</span>
                                        <span className="font-black text-emerald-700 text-xl">${p.total.toFixed(0)}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
                                        <span>Fijo <b className="text-slate-600 font-semibold">${p.fijo}</b></span>
                                        <span>Viáticos <b className="text-slate-600 font-semibold">${p.viaticos}</b></span>
                                        <span>Comisión <b className="text-slate-600 font-semibold">${p.commission.toFixed(0)}</b></span>
                                        <span>Bonos <b className="text-slate-600 font-semibold">${p.bonuses.toFixed(0)}</b></span>
                                    </div>
                                </div>
                            );
                        })() : (
                        <div className="space-y-2">
                            {[...config.tiers]
                                .sort((a, b) => b.minPct - a.minPct)
                                .map((tier, i) => {
                                    const p = project(tier.rate);
                                    return (
                                        <div key={i} className="bg-white rounded-xl p-3.5 border border-slate-200">
                                            <div className="flex items-baseline justify-between mb-1.5">
                                                <span className="font-bold text-slate-800">{tier.label}</span>
                                                <span className="font-black text-emerald-700 text-xl">${p.total.toFixed(0)}</span>
                                            </div>
                                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
                                                <span>Fijo <b className="text-slate-600 font-semibold">${p.fijo}</b></span>
                                                <span>Viáticos <b className="text-slate-600 font-semibold">${p.viaticos}</b></span>
                                                <span>Comisión <b className="text-slate-600 font-semibold">${p.commission.toFixed(0)}</b></span>
                                                <span>Bonos <b className="text-slate-600 font-semibold">${p.bonuses.toFixed(0)}</b></span>
                                            </div>
                                        </div>
                                    );
                                })}

                            {(() => {
                                const p = project(config.bajaRate || 0);
                                return (
                                    <div className="bg-slate-100 rounded-xl p-3.5 border border-slate-200">
                                        <div className="flex items-baseline justify-between mb-1.5">
                                            <span className="font-bold text-slate-500">Baja <span className="text-xs font-normal">(&lt;{lowestMinPct}%)</span></span>
                                            <span className="font-black text-slate-600 text-xl">${p.total.toFixed(0)}</span>
                                        </div>
                                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
                                            <span>Fijo <b className="text-slate-600 font-semibold">${p.fijo}</b></span>
                                            <span>Viáticos <b className="text-slate-600 font-semibold">${p.viaticos}</b></span>
                                            <span>Comisión <b className="text-slate-600 font-semibold">${p.commission.toFixed(0)}</b></span>
                                            <span className="italic">Sin bonos por meta</span>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                        )}

                        <p className="text-[11px] text-slate-400">
                            * Con los bonos activos (los que no están en 0 %). Tasas sobre el monto efectivamente cobrado.
                        </p>
                    </div>
                </section>

            </div>

            {showProposal && (
                <CommissionProposalDoc
                    config={config}
                    vendedorName={vendedorName}
                    onClose={() => setShowProposal(false)}
                />
            )}
        </div>
    );
});

CommissionConstructor.displayName = 'CommissionConstructor';
export default CommissionConstructor;
