import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { useKroma } from '../../KromaContext';
import {
    FlaskConical, Plus, X, Loader, ChevronUp, ChevronDown,
    Edit2, Trash2, CheckCircle2, AlertTriangle, Workflow,
    DollarSign, RefreshCw, Package, PlusCircle,
} from 'lucide-react';
import { PillGroup } from '../admin/ProductCatalogPage';

// ─── Constants ────────────────────────────────────────────────────────────────

const LOTE_REF = 1; // dosis expresada por litro de leche

// Categorías que pertenecen a la receta de producción (excluye leche,
// empaques, consumibles, detergentes y reactivos de laboratorio)
const RECIPE_CATEGORIES = new Set(['cultivos', 'coagulantes', 'sales', 'otros']);

const CAT_LABELS = {
    leche: 'Leche', cultivos: 'Cultivos', coagulantes: 'Coagulantes',
    sales: 'Sales', empaques: 'Empaques', consumibles: 'Consumibles',
    detergentes: 'Detergentes', reactivos: 'Reactivos', otros: 'Otros',
};
const CAT_COLORS = {
    leche:       'bg-blue-500/20 text-blue-300 border-blue-500/30',
    cultivos:    'bg-violet-500/20 text-violet-300 border-violet-500/30',
    coagulantes: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    sales:       'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    empaques:    'bg-sky-500/20 text-sky-300 border-sky-500/30',
    consumibles: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    detergentes: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    reactivos:   'bg-pink-500/20 text-pink-300 border-pink-500/30',
    otros:       'bg-slate-500/20 text-slate-400 border-slate-500/30',
};
const PROD_CAT_STYLE = {
    queso_fresco:   'bg-blue-500/20 text-blue-300 border-blue-500/30',
    queso_madurado: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    yogurt:         'bg-violet-500/20 text-violet-300 border-violet-500/30',
    mantequilla:    'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    crema:          'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    otro:           'bg-slate-500/20 text-slate-400 border-slate-500/30',
};
const PROD_CAT_LABELS = {
    queso_fresco: 'Queso Fresco', queso_madurado: 'Queso Madurado',
    yogurt: 'Yogurt', mantequilla: 'Mantequilla', crema: 'Crema', otro: 'Otro',
};
const DOSE_UNITS = [
    { id: 'g',   label: 'g' },
    { id: 'kg',  label: 'Kg' },
    { id: 'ml',  label: 'ml' },
    { id: 'l',   label: 'L' },
    { id: 'und', label: 'und' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);

function fmt(n) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1)      return n.toFixed(2);
    if (n >= 0.01)   return parseFloat(n.toFixed(4)).toString();
    if (n >= 0.0001) return parseFloat(n.toFixed(6)).toString();
    return n.toExponential(3);
}

// Convert dosis in fromUnit to material's native unit for cost calculation
function calcIngredientCost(material, dosis, fromUnit) {
    const cost = parseFloat(material.costoUSD);
    const qty  = parseFloat(material.cantidadPresentacion);
    if (!cost || !qty || cost <= 0 || qty <= 0) return null;

    const pricePerMatUnit = cost / qty; // USD per material.unidad
    const to = material.unidad;
    const from = fromUnit;

    let factor = null;
    if (from === to)                          factor = 1;
    else if (from === 'g'  && to === 'kg')    factor = 0.001;
    else if (from === 'kg' && to === 'g')     factor = 1000;
    else if (from === 'ml' && to === 'l')     factor = 0.001;
    else if (from === 'l'  && to === 'ml')    factor = 1000;
    else if (from === 'g'  && to === 'l')     factor = 0.001;   // density ≈1 shortcut
    else if (from === 'ml' && to === 'g')     factor = 1;       // density ≈1 shortcut

    if (factor === null) return null;
    return pricePerMatUnit * dosis * factor; // USD for (dosis fromUnit)
}

// ─── Draft persistence ────────────────────────────────────────────────────────

const DRAFT_KEY = 'kroma_recipe_draft';

function saveDraft(product, process, ingredientes) {
    if (!product) { localStorage.removeItem(DRAFT_KEY); return; }
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ product, process, ingredientes }));
}
function loadDraft() {
    try { const r = localStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : null; }
    catch { return null; }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SecLabel = ({ children }) => (
    <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-3">{children}</p>
);

// Stepper with selectable step size
function PrecisionStepper({ label, value, unit, onChange }) {
    const [step, setStep] = useState(0.1);
    const STEPS = [0.001, 0.01, 0.1, 1];
    return (
        <div>
            {label && <SecLabel>{label}</SecLabel>}
            <div className="flex items-center gap-3 mb-3">
                <button type="button" onClick={() => onChange(Math.max(0, parseFloat((value - step).toFixed(6))))}
                    className="w-11 h-11 bg-slate-600 hover:bg-slate-500 text-white rounded-xl flex items-center justify-center text-2xl font-bold transition-colors select-none">
                    −
                </button>
                <div className="flex-1 text-center">
                    <span className="text-white font-bold text-2xl tabular-nums">{fmt(value)}</span>
                    <span className="text-slate-400 text-sm ml-1.5">{unit}</span>
                </div>
                <button type="button" onClick={() => onChange(parseFloat((value + step).toFixed(6)))}
                    className="w-11 h-11 bg-slate-600 hover:bg-slate-500 text-white rounded-xl flex items-center justify-center text-2xl font-bold transition-colors select-none">
                    +
                </button>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-slate-600 text-xs">Paso:</span>
                <div className="flex gap-1.5">
                    {STEPS.map(s => (
                        <button key={s} type="button" onClick={() => setStep(s)}
                            className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${
                                step === s
                                    ? 'bg-emerald-600 border-emerald-500 text-white'
                                    : 'bg-slate-700 border-slate-600 text-slate-400 hover:border-slate-500'
                            }`}>
                            ×{s}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RecipeBuilderPage() {
    const { kromaUser } = useKroma();
    const [products,   setProducts]   = useState([]);
    const [processes,  setProcesses]  = useState([]);
    const [materials,  setMaterials]  = useState([]);
    const [recipes,    setRecipes]    = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [loadError,  setLoadError]  = useState(null);
    const [mode,       setMode]       = useState('list'); // 'list' | 'builder'
    const [hasDraft,   setHasDraft]   = useState(() => !!loadDraft());

    // Builder state
    const [step,            setStep]            = useState(1); // 1=product 2=process 3=ingredients
    const [selProduct,      setSelProduct]      = useState(null);
    const [selProcess,      setSelProcess]      = useState(null); // null = allowed
    const [ingredientes,    setIngredientes]    = useState([]);
    const [saving,          setSaving]          = useState(false);
    const [saveError,       setSaveError]       = useState(null);

    // Ingredient modal
    const [ingModal,    setIngModal]    = useState(null); // null | { mode:'add'|'edit', index? }
    const [ingMaterial, setIngMaterial] = useState(null);
    const [ingDosis,    setIngDosis]    = useState(0);
    const [ingUnidad,   setIngUnidad]   = useState('g');
    const [matFilter,   setMatFilter]   = useState('');

    // Create new ingredient mini-form
    const [showCreateMat, setShowCreateMat] = useState(false);
    const [newMatNombre,  setNewMatNombre]  = useState('');
    const [newMatCat,     setNewMatCat]     = useState('otros');
    const [creatingMat,   setCreatingMat]   = useState(false);

    // ── Data loading ──────────────────────────────────────────────────────────
    const loadAll = useCallback(async () => {
        setLoadError(null);
        try {
            const [prodSnap, procSnap, matSnap, recSnap] = await Promise.all([
                getDocs(collection(db, 'kroma_products')),
                getDocs(collection(db, 'kroma_processes')),
                getDocs(collection(db, 'kroma_materials')),
                getDocs(collection(db, 'kroma_recipes')),
            ]);
            setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.active !== false).sort((a, b) => a.nombre.localeCompare(b.nombre)));
            setProcesses(procSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.active !== false));
            setMaterials(matSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.active !== false).sort((a, b) => a.nombre.localeCompare(b.nombre)));
            setRecipes(recSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.active !== false).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        } catch (err) {
            console.error(err);
            setLoadError(err?.code || err?.message || 'Error desconocido');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    // Persist draft
    useEffect(() => {
        if (mode === 'builder') saveDraft(selProduct, selProcess, ingredientes);
    }, [mode, selProduct, selProcess, ingredientes]);

    // ── Draft ─────────────────────────────────────────────────────────────────
    const restoreDraft = () => {
        const d = loadDraft();
        if (!d) return;
        setSelProduct(d.product);
        setSelProcess(d.process);
        setIngredientes(d.ingredientes || []);
        setStep(d.ingredientes?.length > 0 ? 3 : d.process !== undefined ? 3 : d.product ? 2 : 1);
        setMode('builder');
        setHasDraft(false);
    };
    const discardDraft = () => { localStorage.removeItem(DRAFT_KEY); setHasDraft(false); };
    const clearBuilder = () => {
        localStorage.removeItem(DRAFT_KEY);
        setHasDraft(false);
        setMode('list');
        setStep(1);
        setSelProduct(null);
        setSelProcess(null);
        setIngredientes([]);
        setSaveError(null);
    };

    // ── Ingredient modal ──────────────────────────────────────────────────────
    const openAddIng = () => {
        setIngMaterial(null); setIngDosis(0); setIngUnidad('g'); setMatFilter('');
        setIngModal({ mode: 'add' });
    };
    const openEditIng = (idx) => {
        const ing = ingredientes[idx];
        const mat = materials.find(m => m.id === ing.materialId) || { id: ing.materialId, nombre: ing.materialNombre };
        setIngMaterial(mat); setIngDosis(ing.dosis); setIngUnidad(ing.unidadDosis); setMatFilter('');
        setIngModal({ mode: 'edit', index: idx });
    };
    const confirmIng = () => {
        if (!ingMaterial || ingDosis <= 0) return;
        const entry = {
            id: uid(),
            materialId:       ingMaterial.id,
            materialNombre:   ingMaterial.nombre,
            categoria:        ingMaterial.categoria || 'otros',
            dosis:            ingDosis,
            unidadDosis:      ingUnidad,
            costoUsdUnidad:   ingMaterial.costoUSD && ingMaterial.cantidadPresentacion
                                ? parseFloat(ingMaterial.costoUSD) / parseFloat(ingMaterial.cantidadPresentacion)
                                : null,
            unidadMaterial:   ingMaterial.unidad || null,
        };
        if (ingModal.mode === 'add') {
            setIngredientes(prev => [...prev, entry]);
        } else {
            setIngredientes(prev => prev.map((ing, i) => i === ingModal.index ? { ...entry, id: ing.id } : ing));
        }
        setIngModal(null);
    };
    const removeIng = (idx) => setIngredientes(prev => prev.filter((_, i) => i !== idx));

    const createMaterial = async () => {
        if (!newMatNombre.trim()) return;
        setCreatingMat(true);
        try {
            const ref = await addDoc(collection(db, 'kroma_materials'), {
                nombre: newMatNombre.trim(),
                categoria: newMatCat,
                active: true,
                costoUSD: null,
                cantidadPresentacion: null,
                unidad: 'g',
                createdAt: serverTimestamp(),
            });
            const newMat = { id: ref.id, nombre: newMatNombre.trim(), categoria: newMatCat, unidad: 'g' };
            setMaterials(prev => [...prev, newMat].sort((a, b) => a.nombre.localeCompare(b.nombre)));
            setIngMaterial(newMat);
            setIngUnidad('g');
            setShowCreateMat(false);
            setNewMatNombre('');
            setNewMatCat('otros');
        } catch (err) {
            console.error(err);
        } finally {
            setCreatingMat(false);
        }
    };

    const moveIng = (idx, dir) => {
        const arr = [...ingredientes];
        const ni = idx + dir;
        if (ni < 0 || ni >= arr.length) return;
        [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
        setIngredientes(arr);
    };

    // ── Save ──────────────────────────────────────────────────────────────────
    const saveRecipe = async () => {
        if (!selProduct || ingredientes.length === 0) return;
        setSaving(true); setSaveError(null);
        try {
            await addDoc(collection(db, 'kroma_recipes'), {
                productoId:       selProduct.id,
                productoNombre:   selProduct.nombre,
                procesoId:        selProcess?.id || null,
                procesoNombre:    selProcess?.productoNombre || null,
                loteReferencia:   LOTE_REF,
                ingredientes,
                estado:           'borrador',
                creadoPor:        kromaUser?.id || null,
                creadoPorNombre:  kromaUser?.name || null,
                active:           true,
                createdAt:        serverTimestamp(),
            });
            localStorage.removeItem(DRAFT_KEY);
            setHasDraft(false);
            await loadAll();
            clearBuilder();
        } catch (err) {
            console.error(err);
            setSaveError(err?.code || err?.message || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    // ── Cost calculations ─────────────────────────────────────────────────────
    const totalCost = ingredientes.reduce((sum, ing) => {
        const mat = materials.find(m => m.id === ing.materialId);
        if (!mat) return sum;
        const c = calcIngredientCost(mat, ing.dosis, ing.unidadDosis);
        return c != null ? sum + c : sum;
    }, 0);

    const hasCostData = ingredientes.some(ing => {
        const mat = materials.find(m => m.id === ing.materialId);
        return mat && calcIngredientCost(mat, ing.dosis, ing.unidadDosis) != null;
    });

    // ── Filtered materials for modal ──────────────────────────────────────────
    // Only recipe-relevant categories (no leche, empaques, consumibles, detergentes, reactivos)
    const recipeMats = materials.filter(m => RECIPE_CATEGORIES.has(m.categoria));
    const filteredMats = matFilter.trim()
        ? recipeMats.filter(m => m.nombre.toLowerCase().includes(matFilter.toLowerCase()) ||
                                 (m.categoria || '').toLowerCase().includes(matFilter.toLowerCase()))
        : recipeMats;

    // ── Process list for selected product ─────────────────────────────────────
    const productProcesses = selProduct
        ? processes.filter(p => p.productoId === selProduct.id)
        : [];

    // ══════════════════════════════════════════════════════════════════════════
    // LIST VIEW
    // ══════════════════════════════════════════════════════════════════════════
    if (mode === 'list') {
        return (
            <div className="p-6 md:p-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-6 gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <FlaskConical size={20} className="text-emerald-400" />
                            <h2 className="text-xl font-bold text-white">Constructor de Recetas</h2>
                        </div>
                        <p className="text-slate-400 text-sm">
                            {recipes.length} receta{recipes.length !== 1 ? 's' : ''} definida{recipes.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                    {products.length > 0 && (
                        <button
                            onClick={() => setMode('builder')}
                            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl transition-colors text-sm shrink-0"
                        >
                            <Plus size={16} />
                            Nueva Receta
                        </button>
                    )}
                </div>

                {/* Draft recovery */}
                {hasDraft && !loading && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-5 flex items-start gap-3">
                        <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <p className="text-amber-300 font-semibold text-sm">Tienes una receta sin guardar</p>
                            <p className="text-amber-400/70 text-xs mt-0.5">{loadDraft()?.product?.nombre || 'Receta'}</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <button onClick={discardDraft}
                                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded border border-slate-600 hover:border-slate-500 transition-colors">
                                Descartar
                            </button>
                            <button onClick={restoreDraft}
                                className="bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold px-3 py-1 rounded transition-colors">
                                Continuar
                            </button>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center py-16">
                        <Loader size={28} className="animate-spin text-emerald-400" />
                    </div>
                ) : loadError ? (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 max-w-md">
                        <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle size={16} className="text-red-400 shrink-0" />
                            <p className="text-red-300 font-semibold text-sm">Error al cargar datos</p>
                        </div>
                        <p className="text-red-400/80 text-xs mb-4 font-mono">{loadError}</p>
                        <button onClick={() => { setLoading(true); loadAll(); }}
                            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                            <RefreshCw size={14} /> Reintentar
                        </button>
                    </div>
                ) : products.length === 0 ? (
                    <div className="text-center py-16">
                        <FlaskConical size={36} className="text-slate-700 mx-auto mb-3" />
                        <p className="text-slate-500 text-sm">El Catálogo de Productos aún está vacío.</p>
                        <p className="text-slate-600 text-xs mt-1">Pide al Administrador que lo complete primero.</p>
                    </div>
                ) : recipes.length === 0 ? (
                    <div className="text-center py-16">
                        <FlaskConical size={36} className="text-slate-700 mx-auto mb-3" />
                        <p className="text-slate-500 text-sm">Sin recetas. Crea la primera.</p>
                        <button onClick={() => setMode('builder')} className="mt-4 text-emerald-400 hover:text-emerald-300 text-sm font-medium">
                            + Nueva receta
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4 max-w-2xl">
                        {recipes.map(rec => {
                            // Total cost per lote ref
                            const tCost = (rec.ingredientes || []).reduce((sum, ing) => {
                                const mat = materials.find(m => m.id === ing.materialId);
                                if (!mat) return sum;
                                const c = calcIngredientCost(mat, ing.dosis, ing.unidadDosis);
                                return c != null ? sum + c : sum;
                            }, 0);
                            return (
                                <div key={rec.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                                    <div className="flex items-start justify-between gap-2 mb-3">
                                        <div>
                                            <p className="text-white font-semibold text-sm">{rec.productoNombre}</p>
                                            <p className="text-slate-500 text-xs mt-0.5">
                                                {rec.ingredientes?.length || 0} ingrediente{rec.ingredientes?.length !== 1 ? 's' : ''}
                                                {rec.procesoNombre ? ` · Proceso: ${rec.productoNombre}` : ''}
                                                {' · '}{rec.creadoPorNombre || 'Sistema'}
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${
                                                rec.estado === 'activo'
                                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                                    : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                                            }`}>
                                                {rec.estado === 'activo' ? 'Activa' : 'Borrador'}
                                            </span>
                                            {tCost > 0 && (
                                                <p className="text-emerald-400 text-xs font-bold mt-1">
                                                    ${fmt(tCost)} / L leche
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    {/* Ingredient pills */}
                                    <div className="flex flex-wrap gap-1.5">
                                        {(rec.ingredientes || []).map((ing, i) => (
                                            <span key={i} className={`text-xs px-2 py-0.5 rounded-full border ${CAT_COLORS[ing.categoria] || CAT_COLORS.otros}`}>
                                                {ing.materialNombre}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // BUILDER VIEW
    // ══════════════════════════════════════════════════════════════════════════
    return (
        <div className="flex flex-col h-full">

            {/* ── Header ── */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800 shrink-0">
                <button onClick={clearBuilder} className="text-slate-400 hover:text-white p-1 rounded transition-colors">
                    <X size={18} />
                </button>
                <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm truncate">
                        {selProduct ? selProduct.nombre : 'Nueva Receta'}
                    </p>
                    {step === 3 && (
                        <p className="text-slate-500 text-xs">
                            {ingredientes.length} ingrediente{ingredientes.length !== 1 ? 's' : ''}
                            {hasCostData ? ` · $${fmt(totalCost)} / L leche` : ''}
                        </p>
                    )}
                </div>
                {/* Step indicator */}
                <div className="flex items-center gap-1 shrink-0">
                    {[1, 2, 3].map(s => (
                        <div key={s} className={`w-2 h-2 rounded-full transition-colors ${
                            s === step ? 'bg-emerald-400' : s < step ? 'bg-emerald-700' : 'bg-slate-700'
                        }`} />
                    ))}
                </div>
                {step === 3 && ingredientes.length > 0 && (
                    <button
                        onClick={saveRecipe}
                        disabled={saving}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-60 flex items-center gap-2 shrink-0"
                    >
                        {saving ? <Loader size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                )}
            </div>

            {/* Save error */}
            {saveError && (
                <div className="flex items-center gap-2 bg-red-500/10 border-b border-red-500/30 px-5 py-3 shrink-0">
                    <AlertTriangle size={14} className="text-red-400 shrink-0" />
                    <p className="text-red-300 text-xs flex-1"><span className="font-semibold">Error:</span> {saveError}</p>
                    <button onClick={() => setSaveError(null)} className="text-red-400 hover:text-white p-0.5"><X size={13} /></button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-5">

                {/* ── STEP 1: Select product ── */}
                {step === 1 && (
                    <div>
                        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-4">
                            Paso 1 de 3 — Seleccionar Producto
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {products.map(p => (
                                <button key={p.id}
                                    onClick={() => { setSelProduct(p); setStep(2); }}
                                    className="bg-slate-800 border border-slate-700 hover:border-emerald-500/50 rounded-xl p-4 text-left transition-all hover:shadow-lg hover:shadow-emerald-500/10"
                                >
                                    <p className="text-white font-semibold text-sm mb-2">{p.nombre}</p>
                                    <span className={`text-xs px-2 py-0.5 rounded-full border ${PROD_CAT_STYLE[p.categoria] || PROD_CAT_STYLE.otro}`}>
                                        {PROD_CAT_LABELS[p.categoria] || p.categoria}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── STEP 2: Select process ── */}
                {step === 2 && (
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <button onClick={() => setStep(1)} className="text-slate-500 hover:text-white text-xs font-medium transition-colors">
                                ← Cambiar producto
                            </button>
                        </div>
                        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-4">
                            Paso 2 de 3 — Vincular Proceso
                        </p>

                        {productProcesses.length === 0 ? (
                            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Workflow size={16} className="text-amber-400" />
                                    <p className="text-amber-300 text-sm font-semibold">Sin proceso para este producto</p>
                                </div>
                                <p className="text-slate-400 text-xs mb-4">
                                    Puedes vincular un proceso después o continuar directamente a los ingredientes.
                                </p>
                                <button
                                    onClick={() => { setSelProcess(null); setStep(3); }}
                                    className="text-emerald-400 hover:text-emerald-300 text-sm font-medium transition-colors"
                                >
                                    Continuar sin proceso →
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3 mb-4">
                                {productProcesses.map(proc => (
                                    <button key={proc.id}
                                        onClick={() => { setSelProcess(proc); setStep(3); }}
                                        className={`w-full bg-slate-800 border rounded-xl p-4 text-left transition-all hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/10 ${
                                            selProcess?.id === proc.id ? 'border-emerald-500/50' : 'border-slate-700'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <div>
                                                <p className="text-white font-semibold text-sm">{proc.productoNombre}</p>
                                                <p className="text-slate-500 text-xs mt-0.5">
                                                    {proc.bloques?.length || 0} bloques · {proc.creadoPorNombre || 'Sistema'}
                                                </p>
                                            </div>
                                            <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold shrink-0 ${
                                                proc.estado === 'activo'
                                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                                    : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                                            }`}>
                                                {proc.estado === 'activo' ? 'Activo' : 'Borrador'}
                                            </span>
                                        </div>
                                        {/* Block tags */}
                                        <div className="flex flex-wrap gap-1.5">
                                            {(proc.bloques || []).slice(0, 6).map((b, i) => (
                                                <span key={i} className="text-xs px-2 py-0.5 bg-slate-700 text-slate-400 rounded-full border border-slate-600">
                                                    {b.tipo.replace(/_/g, ' ')}
                                                </span>
                                            ))}
                                            {(proc.bloques?.length || 0) > 6 && (
                                                <span className="text-xs text-slate-600">+{proc.bloques.length - 6} más</span>
                                            )}
                                        </div>
                                    </button>
                                ))}
                                <button
                                    onClick={() => { setSelProcess(null); setStep(3); }}
                                    className="w-full py-3 text-slate-500 hover:text-slate-300 text-sm border border-dashed border-slate-700 rounded-xl transition-colors"
                                >
                                    Continuar sin vincular proceso
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ── STEP 3: Ingredients ── */}
                {step === 3 && (
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <button onClick={() => setStep(2)} className="text-slate-500 hover:text-white text-xs font-medium transition-colors">
                                ← Cambiar proceso
                            </button>
                        </div>
                        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">
                            Paso 3 de 3 — Ingredientes por litro de leche
                        </p>
                        <p className="text-slate-600 text-xs mb-5">
                            Define la dosis de cada ingrediente por cada litro de leche.
                            Kroma multiplicará por los litros reales al momento de la producción.
                        </p>

                        {/* Ingredient list */}
                        {ingredientes.length > 0 && (
                            <div className="space-y-2 mb-4">
                                {ingredientes.map((ing, idx) => {
                                    const mat = materials.find(m => m.id === ing.materialId);
                                    const cost = mat ? calcIngredientCost(mat, ing.dosis, ing.unidadDosis) : null;
                                    return (
                                        <div key={ing.id} className={`bg-slate-800 border rounded-xl p-3.5 ${CAT_COLORS[ing.categoria] ? 'border-slate-700' : 'border-slate-700'}`}>
                                            <div className="flex items-center gap-3">
                                                {/* Category dot */}
                                                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                                    ing.categoria === 'cultivos'    ? 'bg-violet-400' :
                                                    ing.categoria === 'coagulantes' ? 'bg-amber-400' :
                                                    ing.categoria === 'sales'       ? 'bg-emerald-400' :
                                                    ing.categoria === 'empaques'    ? 'bg-sky-400' :
                                                    ing.categoria === 'leche'       ? 'bg-blue-400' :
                                                    'bg-slate-500'
                                                }`} />
                                                {/* Info */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white font-semibold text-sm truncate">{ing.materialNombre}</p>
                                                    <p className="text-slate-400 text-xs">
                                                        <span className="text-emerald-300 font-bold">{fmt(ing.dosis)} {ing.unidadDosis}</span>
                                                        <span className="text-slate-600"> / L leche</span>
                                                        {cost != null && (
                                                            <span className="text-slate-500 ml-2">· ${fmt(cost)}</span>
                                                        )}
                                                    </p>
                                                </div>
                                                {/* Move */}
                                                <div className="flex flex-col gap-0.5 shrink-0">
                                                    <button onClick={() => moveIng(idx, -1)} disabled={idx === 0}
                                                        className="p-1 text-slate-600 hover:text-slate-300 disabled:opacity-25 transition-colors">
                                                        <ChevronUp size={14} />
                                                    </button>
                                                    <button onClick={() => moveIng(idx, 1)} disabled={idx === ingredientes.length - 1}
                                                        className="p-1 text-slate-600 hover:text-slate-300 disabled:opacity-25 transition-colors">
                                                        <ChevronDown size={14} />
                                                    </button>
                                                </div>
                                                {/* Edit / Remove */}
                                                <div className="flex flex-col gap-0.5 shrink-0">
                                                    <button onClick={() => openEditIng(idx)}
                                                        className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-slate-700 rounded-lg transition-colors">
                                                        <Edit2 size={13} />
                                                    </button>
                                                    <button onClick={() => removeIng(idx)}
                                                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors">
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Cost summary */}
                        {hasCostData && (
                            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 mb-4 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <DollarSign size={15} className="text-emerald-400" />
                                    <span className="text-emerald-300 text-sm font-semibold">Costo estimado por litro de leche</span>
                                </div>
                                <span className="text-white font-bold text-lg font-mono">${fmt(totalCost)}</span>
                            </div>
                        )}

                        <button
                            onClick={openAddIng}
                            className="w-full flex items-center justify-center gap-2 border border-dashed border-slate-600 hover:border-emerald-500 text-slate-500 hover:text-emerald-400 rounded-xl py-3.5 transition-colors text-sm font-medium"
                        >
                            <Plus size={16} />
                            Agregar Ingrediente
                        </button>
                    </div>
                )}
            </div>

            {/* ══════════════════════════════════════════════════════════════════
                INGREDIENT MODAL — bottom sheet mobile / centered desktop
                ══════════════════════════════════════════════════════════════ */}
            {ingModal && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-slate-900 border-t border-slate-700 sm:border sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] flex flex-col shadow-2xl">

                        {/* Modal header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
                            <h3 className="text-white font-bold">
                                {ingModal.mode === 'add' ? 'Agregar Ingrediente' : 'Editar Ingrediente'}
                            </h3>
                            <button onClick={() => setIngModal(null)} className="text-slate-400 hover:text-white p-1 rounded transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

                            {/* Material selector */}
                            <div>
                                <SecLabel>Material / Insumo</SecLabel>
                                {/* Search filter */}
                                <div className="relative mb-2">
                                    <input
                                        type="text"
                                        value={matFilter}
                                        onChange={e => setMatFilter(e.target.value)}
                                        placeholder="Buscar por nombre o categoría…"
                                        className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                                    />
                                    {matFilter && (
                                        <button onClick={() => setMatFilter('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                                <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-700 bg-slate-800 p-1.5 space-y-0.5">
                                    {filteredMats.length === 0 ? (
                                        <p className="text-slate-500 text-sm text-center py-4">
                                            {recipeMats.length === 0
                                                ? 'No hay cultivos, coagulantes ni sales cargados aún.'
                                                : 'Sin resultados para esa búsqueda.'}
                                        </p>
                                    ) : filteredMats.map(m => (
                                        <button key={m.id} type="button"
                                            onClick={() => { setIngMaterial(m); if (!ingUnidad) setIngUnidad(m.unidad || 'g'); }}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                                ingMaterial?.id === m.id
                                                    ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                                                    : 'text-slate-300 hover:bg-slate-700 border border-transparent'
                                            }`}
                                        >
                                            <span className="font-medium">{m.nombre}</span>
                                            {m.categoria && (
                                                <span className={`text-xs ml-2 px-1.5 py-0.5 rounded-full ${CAT_COLORS[m.categoria] || CAT_COLORS.otros}`}>
                                                    {CAT_LABELS[m.categoria] || m.categoria}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>

                                {/* Create new material (no price) */}
                                {!showCreateMat ? (
                                    <button
                                        type="button"
                                        onClick={() => setShowCreateMat(true)}
                                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-emerald-400 transition-colors mt-1"
                                    >
                                        <PlusCircle size={13} />
                                        Crear insumo nuevo (sin precio)
                                    </button>
                                ) : (
                                    <div className="bg-slate-800 border border-slate-600 rounded-xl p-3 space-y-3 mt-1">
                                        <p className="text-slate-400 text-xs font-semibold">Nuevo insumo — solo nombre y categoría</p>
                                        <input
                                            type="text"
                                            value={newMatNombre}
                                            onChange={e => setNewMatNombre(e.target.value)}
                                            placeholder="Nombre del insumo"
                                            maxLength={80}
                                            autoFocus
                                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                        />
                                        <select
                                            value={newMatCat}
                                            onChange={e => setNewMatCat(e.target.value)}
                                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                                        >
                                            {['cultivos', 'coagulantes', 'sales', 'otros'].map(c => (
                                                <option key={c} value={c}>{CAT_LABELS[c]}</option>
                                            ))}
                                        </select>
                                        <p className="text-slate-600 text-xs">El precio lo cargará el Administrador después.</p>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => setShowCreateMat(false)}
                                                className="flex-1 border border-slate-600 text-slate-400 rounded-lg py-1.5 text-xs font-medium transition-colors hover:text-white">
                                                Cancelar
                                            </button>
                                            <button type="button" onClick={createMaterial} disabled={!newMatNombre.trim() || creatingMat}
                                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg py-1.5 text-xs font-bold transition-colors disabled:opacity-40 flex items-center justify-center gap-1">
                                                {creatingMat ? <Loader size={12} className="animate-spin" /> : null}
                                                {creatingMat ? 'Creando…' : 'Crear'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Dose controls — shown only when material is selected */}
                            {ingMaterial && (
                                <>
                                    <div>
                                        <SecLabel>Unidad de dosis</SecLabel>
                                        <PillGroup
                                            options={DOSE_UNITS}
                                            value={ingUnidad}
                                            onChange={v => v && setIngUnidad(v)}
                                        />
                                    </div>

                                    <PrecisionStepper
                                        label="Cantidad por litro de leche"
                                        value={ingDosis}
                                        unit={ingUnidad}
                                        onChange={setIngDosis}
                                    />

                                    {/* Cost preview */}
                                    {(() => {
                                        const c = calcIngredientCost(ingMaterial, ingDosis, ingUnidad);
                                        return c != null && ingDosis > 0 ? (
                                            <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 flex items-center justify-between">
                                                <span className="text-slate-400 text-xs">Costo estimado por litro de leche</span>
                                                <span className="text-emerald-400 font-bold text-sm font-mono">${fmt(c)}</span>
                                            </div>
                                        ) : ingDosis > 0 ? (
                                            <p className="text-slate-600 text-xs">Sin datos de precio para este insumo.</p>
                                        ) : null;
                                    })()}
                                </>
                            )}
                        </div>

                        {/* Modal footer */}
                        <div className="flex gap-3 px-5 py-4 border-t border-slate-800 shrink-0">
                            <button onClick={() => setIngModal(null)}
                                className="flex-1 border border-slate-600 text-slate-300 hover:text-white rounded-xl py-3 text-sm font-medium transition-colors">
                                Cancelar
                            </button>
                            <button
                                onClick={confirmIng}
                                disabled={!ingMaterial || ingDosis <= 0}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-40 text-sm"
                            >
                                {ingModal.mode === 'add' ? 'Agregar' : 'Confirmar cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
