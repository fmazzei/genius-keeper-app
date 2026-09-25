import React, { useState, useEffect } from 'react';
import {
    collection, getDocs, doc, setDoc, serverTimestamp,
    query, where, onSnapshot, addDoc, updateDoc, runTransaction, writeBatch, getDoc,
} from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { useKroma } from '../../KromaContext';
import { isGranel, totalDisplay, totalBase, stockStatus, tieneMinimo } from '@/Kroma/stockInsumos.js';
import { usePasoSostenido, SIN_SELECCION } from '@/Kroma/pasoSostenido.js';
import CampoFecha, { hoyInput, fechaDesdeInput, esHoyInput } from '@/Kroma/Components/CampoFecha.jsx';
import { Package, Plus, AlertTriangle, X, Check, TrendingDown, Bell, Settings, Trash2 } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const PRES_TIPOS = ['sobre', 'saco', 'envase', 'bolsa', 'bulto', 'granel'];

const UNIDADES_BASE = ['g', 'kg', 'ml', 'l', 'm', 'und', 'par'];

// Unidades que se cuentan DE A UNO (no se fraccionan): mismo trato en steppers y
// mínimos. Los guantes van en PARES —vienen y se cuentan así—, y contarlos en
// "und" obligaba a llevar el doble en la cabeza al reponer.
const esConteo = (u) => u === 'und' || u === 'par';

const SECTION_GROUPS = [
    { id: 'produccion', label: 'Producción', cats: ['cultivos', 'coagulantes', 'sales'] },
    { id: 'empaque',    label: 'Empaque',    cats: ['empaques'] },
    { id: 'higiene',    label: 'Higiene',    cats: ['detergentes', 'reactivos'] },
    { id: 'general',    label: 'General',    cats: ['consumibles', 'otros'] },
];

const BAR_COLOR  = { ok: 'bg-emerald-500', low: 'bg-amber-400', critical: 'bg-red-500', empty: 'bg-slate-600', none: 'bg-slate-700' };
const TEXT_COLOR = { ok: 'text-emerald-400', low: 'text-amber-400', critical: 'text-red-400', empty: 'text-slate-500', none: 'text-slate-600' };

// ─── Domain helpers ───────────────────────────────────────────────────────────

// ─── Costeo promedio ponderado ────────────────────────────────────────────────
//
// Regla de negocio: "Valoración: Costo Promedio Ponderado. Recalcular precio
// promedio ante cada nueva compra." Todo se hace en UNIDADES BASE (g/ml/…) para
// que discreto y a granel compartan la misma matemática:
//   precioPorBase = (stockBaseAntes·precioAntes + entradaBase·precioEntrada)
//                    / (stockBaseAntes + entradaBase)
// y luego se vuelve a expresar como costoUSD de UNA presentación completa
// (mat.cantidadPresentacion — el mismo denominador que usa MaterialsMasterPage
// para `pricePerUnit`), que es el campo que vive en `kroma_materials`.
// Si no hay stock previo (primera entrada, o se agotó), el promedio pondera a 0
// y el resultado es sencillamente el precio de esta entrada — sin caso especial.
function costoPonderado({ invDocAntes, mat, entradaBaseUnits, costoEntradaTotal }) {
    const cantidadPresentacion = Number(mat?.cantidadPresentacion) || 0;
    if (!(cantidadPresentacion > 0) || !(entradaBaseUnits > 0) || !(costoEntradaTotal > 0)) return null;

    const stockBaseAntes = totalBase(invDocAntes);
    const costoUSDAntes  = Number(mat?.costoUSD) || 0;
    const precioAntes    = stockBaseAntes > 0 && costoUSDAntes > 0 ? costoUSDAntes / cantidadPresentacion : 0;
    const precioEntrada  = costoEntradaTotal / entradaBaseUnits;

    const pesoAntes   = stockBaseAntes > 0 && precioAntes > 0 ? stockBaseAntes : 0;
    const precioPonderado = (pesoAntes * precioAntes + entradaBaseUnits * precioEntrada) / (pesoAntes + entradaBaseUnits);

    return Math.round(precioPonderado * cantidadPresentacion * 10000) / 10000;
}

function fmtBase(n, unit) {
    if (n == null || n === 0) return `0 ${unit || ''}`;
    n = +n;
    if (unit === 'g'  && n >= 1000) return `${(n / 1000).toFixed(2)} kg`;
    if (unit === 'ml' && n >= 1000) return `${(n / 1000).toFixed(2)} L`;
    if (unit === 'par') return `${n % 1 === 0 ? n : n.toFixed(2)} ${n === 1 ? 'par' : 'pares'}`;
    return `${n % 1 === 0 ? n : n.toFixed(2)} ${unit || ''}`;
}

function fmtInv(inv) {
    if (!inv) return '—';
    const unit = inv.unidadBase || 'g';
    if (isGranel(inv)) return fmtBase(inv.stockEnUso ?? 0, unit);
    const cerrado = inv.stockCerrado ?? 0;
    const enUso   = inv.stockEnUso   ?? 0;
    const pres    = inv.presentacionTipo || '';
    if (enUso > 0) return `${cerrado} ${pres} + ${fmtBase(enUso, unit)}`;
    return `${cerrado} ${pres}`;
}

function fmtMinLabel(inv) {
    if (!inv || (inv.stockMinimo ?? 0) <= 0) return null;
    if (isGranel(inv) || inv.stockMinimoEsBase)
        return `mín ${fmtBase(inv.stockMinimo, inv.unidadBase || 'g')}`;
    return `mín ${inv.stockMinimo} ${inv.presentacionTipo || ''}`;
}

function barPct(inv) {
    const minimo = inv?.stockMinimo ?? 0;
    if (minimo <= 0) return inv ? 100 : 0;
    const total = (isGranel(inv) || inv?.stockMinimoEsBase) ? totalBase(inv) : totalDisplay(inv);
    return Math.min(100, Math.round((total / minimo) * 100));
}

// ─── Reusable UI ──────────────────────────────────────────────────────────────

function SecLabel({ children }) {
    return <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-2">{children}</p>;
}

function PillGroup({ options, value, onChange }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {options.map(opt => {
                const id  = typeof opt === 'string' ? opt : opt.id;
                const lbl = typeof opt === 'string' ? opt : opt.label;
                return (
                    <button key={id} type="button" onClick={() => onChange(id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                            value === id ? 'bg-teal-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}>
                        {lbl}
                    </button>
                );
            })}
        </div>
    );
}

function WholeStepper({ label, value, onChange, unit, min = 0, steps = [1] }) {
    const [stepIdx, setStepIdx] = useState(0);
    const step = steps[stepIdx];
    const menos = usePasoSostenido(() => onChange(Math.max(min, value - step)));
    const mas   = usePasoSostenido(() => onChange(value + step));
    return (
        <div>
            {label && <SecLabel>{label}</SecLabel>}
            {steps.length > 1 && (
                <div className="flex gap-1 mb-2">
                    {steps.map((s, i) => (
                        <button key={s} type="button" onClick={() => setStepIdx(i)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold ${
                                stepIdx === i ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                            }`}>±{s.toLocaleString()}</button>
                    ))}
                </div>
            )}
            <div className="flex items-center gap-3">
                <button type="button" {...menos}
                    className={`w-14 h-14 shrink-0 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 flex items-center justify-center text-white text-2xl font-bold ${SIN_SELECCION}`}>−</button>
                <div className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5 text-center">
                    <span className="text-white text-xl font-mono font-semibold">{value.toLocaleString()}</span>
                    {unit && <span className="text-slate-400 text-sm ml-1.5">{unit}</span>}
                </div>
                <button type="button" {...mas}
                    className={`w-14 h-14 shrink-0 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 flex items-center justify-center text-white text-2xl font-bold ${SIN_SELECCION}`}>+</button>
            </div>
        </div>
    );
}

function PrecisionStepper({ label, value, onChange, unit }) {
    const STEPS = [0.001, 0.01, 0.1, 1];
    const [stepIdx, setStepIdx] = useState(2);
    const step = STEPS[stepIdx];
    const menos = usePasoSostenido(() => onChange(Math.max(0, +(value - step).toFixed(6))));
    const mas   = usePasoSostenido(() => onChange(+(value + step).toFixed(6)));
    return (
        <div>
            {label && <SecLabel>{label}</SecLabel>}
            <div className="flex gap-1 mb-2">
                {STEPS.map((s, i) => (
                    <button key={s} type="button" onClick={() => setStepIdx(i)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold ${
                            stepIdx === i ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}>±{s}</button>
                ))}
            </div>
            <div className="flex items-center gap-3">
                <button type="button" {...menos}
                    className={`w-14 h-14 shrink-0 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 flex items-center justify-center text-white text-2xl font-bold ${SIN_SELECCION}`}>−</button>
                <div className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5 text-center">
                    <span className="text-white text-xl font-mono font-semibold">
                        {value % 1 === 0 ? value : value.toFixed(3)}
                    </span>
                    {unit && <span className="text-slate-400 text-sm ml-1.5">{unit}</span>}
                </div>
                <button type="button" {...mas}
                    className={`w-14 h-14 shrink-0 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 flex items-center justify-center text-white text-2xl font-bold ${SIN_SELECCION}`}>+</button>
            </div>
        </div>
    );
}

// ─── Presentation Config Panel ───────────────────────────────────────────────

function PresConfigPanel({ config, onChange }) {
    const { presentacionTipo = 'granel', unidadBase = 'g', cantidadPorUnidad = 0 } = config;
    const granel = presentacionTipo === 'granel';
    return (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-4">
            <div>
                <SecLabel>Tipo de presentación</SecLabel>
                <PillGroup options={PRES_TIPOS} value={presentacionTipo}
                    onChange={v => onChange({ ...config, presentacionTipo: v, cantidadPorUnidad: v === 'granel' ? 0 : cantidadPorUnidad })} />
            </div>
            <div>
                <SecLabel>Unidad de medida</SecLabel>
                <PillGroup options={UNIDADES_BASE} value={unidadBase}
                    onChange={v => onChange({ ...config, unidadBase: v })} />
            </div>
            {!granel && (
                <PrecisionStepper
                    label={`Cantidad por ${presentacionTipo} (${unidadBase})`}
                    value={cantidadPorUnidad}
                    onChange={v => onChange({ ...config, cantidadPorUnidad: v })}
                    unit={unidadBase}
                />
            )}
        </div>
    );
}

// ─── Material Card ───────────────────────────────────────────────────────────

function MaterialCard({ mat, invDoc, onEntrada, onEnUso, onSetMinimo, isMaster, onDelete, canEditar }) {
    const status = stockStatus(invDoc);
    const pct    = barPct(invDoc);
    const hasInv = invDoc != null;
    // ¿A este material ya se le cargó existencia alguna vez? Decide qué se
    // ofrece: el inventario INICIAL se carga una sola vez en la vida del
    // material; después lo que pasa es que llega una compra, o que el conteo
    // físico no cuadra. Son actos distintos y no se mezclan en un mismo botón.
    const yaTieneStock = hasInv && (invDoc.stockCerrado != null || invDoc.stockEnUso != null);
    const [confirmDel, setConfirmDel] = useState(false);

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm leading-snug">{mat.nombre}</p>
                    <p className="text-slate-500 text-xs mt-0.5 capitalize">{mat.categoria || 'otros'}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {hasInv && status !== 'ok' && status !== 'none' && (
                        <AlertTriangle size={14} className={`${TEXT_COLOR[status]} mt-0.5`} />
                    )}
                    {isMaster && (
                        <button onClick={() => setConfirmDel(true)}
                            className="text-slate-600 hover:text-rose-400 p-0.5 rounded transition-colors"
                            title="Eliminar registro de inventario">
                            <Trash2 size={13} />
                        </button>
                    )}
                </div>
            </div>
            {confirmDel && (
                <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-3">
                    <p className="text-rose-300 text-xs font-semibold mb-2">¿Eliminar este registro de inventario?</p>
                    <div className="flex gap-2">
                        <button onClick={() => setConfirmDel(false)}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-semibold py-2 rounded-lg">
                            Cancelar
                        </button>
                        <button onClick={() => { setConfirmDel(false); onDelete(mat, invDoc); }}
                            className="flex-1 bg-rose-700 hover:bg-rose-600 text-white text-xs font-semibold py-2 rounded-lg">
                            Eliminar
                        </button>
                    </div>
                </div>
            )}

            <div>
                <div className="flex items-end justify-between mb-1">
                    <span className={`text-base font-bold font-mono ${hasInv ? 'text-white' : 'text-slate-600'}`}>
                        {fmtInv(invDoc)}
                    </span>
                    {fmtMinLabel(invDoc) && (
                        <span className="text-slate-500 text-xs">{fmtMinLabel(invDoc)}</span>
                    )}
                </div>
                {/* Sub-line: cerrado/abierto detail for discrete */}
                {hasInv && !isGranel(invDoc) && (invDoc.stockEnUso ?? 0) > 0 && (
                    <p className="text-slate-600 text-xs mb-1.5">
                        {invDoc.stockCerrado ?? 0} cerrado · {fmtBase(invDoc.stockEnUso, invDoc.unidadBase || 'g')} abierto
                    </p>
                )}
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${BAR_COLOR[status]}`} style={{ width: `${pct}%` }} />
                </div>
            </div>

            {/* Cargar existencias es del ADMINISTRADOR: las compras las registra
                él. El operario ve el stock —necesita saber si le queda cuajo
                antes de arrancar— pero no lo carga; se descuenta solo con el
                consumo de cada proceso. */}
            {canEditar && (
                <div className="mt-auto space-y-1.5">
                    {/* Carga de existencias: una u otra, nunca las dos.
                        · Sin stock cargado  → solo "Inventario inicial".
                        · Con stock cargado  → "Compra" (suma, con costo y fecha;
                          es lo que mantiene el promedio ponderado y el libro de
                          compras) o "Corregir" (reemplaza el conteo, sin costo).
                        El inicial desaparece en cuanto hay stock: cargarlo dos
                        veces era la forma de pisar el inventario sin querer. */}
                    {!yaTieneStock ? (
                        <button onClick={() => onEntrada(mat, invDoc, 'inicial')}
                            className="w-full flex items-center justify-center gap-1 bg-teal-600 hover:bg-teal-500 active:scale-95 text-white text-xs font-semibold py-2.5 rounded-xl">
                            <Plus size={12} /> Inventario inicial
                        </button>
                    ) : (
                        <div className="flex gap-1.5">
                            <button onClick={() => onEntrada(mat, invDoc, 'compra')}
                                className="flex-1 flex items-center justify-center gap-1 bg-teal-600 hover:bg-teal-500 active:scale-95 text-white text-xs font-semibold py-2.5 rounded-xl">
                                <Plus size={12} /> Compra
                            </button>
                            <button onClick={() => onEntrada(mat, invDoc, 'correccion')}
                                className="flex-1 flex items-center justify-center gap-1 bg-amber-700 hover:bg-amber-600 active:scale-95 text-white text-xs font-semibold py-2.5 rounded-xl">
                                <Settings size={12} /> Corregir
                            </button>
                        </div>
                    )}
                    <div className="flex gap-1.5">
                    {hasInv && !isGranel(invDoc) && (
                        <button onClick={() => onEnUso(mat, invDoc)}
                            className="flex-1 flex items-center justify-center gap-1 bg-slate-700 hover:bg-slate-600 active:scale-95 text-slate-300 text-xs font-semibold py-2.5 px-3 rounded-xl"
                            title="Ajustar cantidad en uso">
                            <Package size={12} /> En uso
                        </button>
                    )}
                    <button onClick={() => onSetMinimo(mat, invDoc)} title="Stock mínimo"
                        className="flex items-center justify-center gap-1 bg-slate-700 hover:bg-slate-600 active:scale-95 text-slate-300 text-xs font-semibold py-2.5 px-3 rounded-xl">
                        <TrendingDown size={12} />
                    </button>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Precio con DECIMALES. `<input type="number">` no los acepta con coma: en un
 * teléfono con teclado en español, escribir "9,99" deja el input en estado
 * inválido y el navegador devuelve `value === ''` — el precio se perdía y había
 * que redondear a 9 o a 10. Se usa texto con teclado decimal y se normaliza la
 * coma, que es lo que la gente escribe.
 */
const aNumero = (v) => {
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};

// ─── Entrada Bottom Sheet ─────────────────────────────────────────────────────

/**
 * Hoja de carga de existencias. El MODO llega decidido desde la tarjeta y no se
 * cambia acá: antes la hoja mostraba "+ Entrada" y "Corregir stock" como dos
 * pestañas encendidas a la vez, y son dos actos que no se parecen —sumar una
 * compra o reemplazar un conteo—. Elegir mal pisaba el inventario.
 *
 *   · 'inicial'    — primera carga del material. Suma desde cero. Pide costo.
 *   · 'compra'     — llegó mercancía. Suma. Pide costo y fecha de la compra:
 *                    es lo que alimenta el promedio ponderado y `kroma_compras`.
 *   · 'correccion' — el conteo físico no cuadra. REEMPLAZA el total. Sin costo,
 *                    porque no se compró nada.
 */
function EntradaSheet({ mat, invDoc, modo = 'inicial', onClose, onSave, verCostos }) {
    const initialPres = invDoc?.presentacionTipo
        || (mat.presentacion && mat.presentacion !== 'a granel' ? mat.presentacion : 'granel');
    const [config, setConfig] = useState({
        presentacionTipo: initialPres,
        unidadBase:       invDoc?.unidadBase || mat.unidad || 'g',
        cantidadPorUnidad: initialPres === 'granel' ? 0 : (invDoc?.cantidadPorUnidad ?? mat.cantidadPresentacion ?? 0),
    });
    const [showConfig, setShowConfig] = useState(!invDoc);
    // El modo viene de la tarjeta y NO se cambia desde acá: 'correccion'
    // reemplaza el total, las otras dos suman.
    const modoAjuste = modo === 'correccion';
    const esCompra   = modo === 'compra';
    const granel = config.presentacionTipo === 'granel';

    const [addCerrado, setAddCerrado] = useState(0);
    const [initEnUso,  setInitEnUso]  = useState(invDoc?.stockEnUso ?? 0);
    const [notas, setNotas]           = useState('');
    const [saving, setSaving]         = useState(false);
    // Costo TOTAL pagado por esta entrada (no por unidad): de ahí se deriva el
    // precio por unidad base y se pondera contra lo que ya había en stock.
    // No aplica en "Corregir stock": ese es un conteo, no una compra.
    const [costoEntrada, setCostoEntrada] = useState('');
    const [omitirCosto, setOmitirCosto]   = useState(false);
    // Fecha de la COMPRA. Por defecto hoy; se mueve para cargar compras
    // anteriores — el libro `kroma_compras` arrancaba "hoy" en parte porque no
    // había dónde escribir la fecha de una compra vieja.
    const [fechaCompra, setFechaCompra]   = useState(hoyInput);
    // Regla de negocio transversal: el maestro quesero NUNCA ve costos. No es un
    // permiso que se pueda conceder, así que el bloque de costo no se oculta
    // "por ahora": directamente no existe para quien no puede verlos, y con él
    // desaparece también la exigencia de llenarlo para poder guardar.
    const puedeCostear = verCostos && Number(mat.cantidadPresentacion) > 0;

    const cpu = config.cantidadPorUnidad || 0;
    // modoAjuste=true → replace current stock; false → add to current stock
    const newCerrado = granel ? 0
        : modoAjuste ? addCerrado
        : (invDoc?.stockCerrado ?? 0) + addCerrado;
    const newEnUso = granel
        ? (modoAjuste ? addCerrado : (invDoc?.stockEnUso ?? 0) + addCerrado)
        : initEnUso;

    // Whole-number materials use large step options instead of precision stepper
    const isUnd    = esConteo(config.unidadBase);
    const isMetros = config.unidadBase === 'm';
    const undSteps   = [1, 100, 1000];
    const metroSteps = [1, 10, 100];

    // El costo es obligatorio al cargar existencias (así se mantiene el promedio
    // ponderado al día); "Corregir stock" no lo pide porque no es una compra.
    // "Omitir costo por ahora" es la única salida — deja el costoUSD como está.
    const costoFaltante = !modoAjuste && puedeCostear && !omitirCosto && !(aNumero(costoEntrada) > 0);

    async function handleSave() {
        if (addCerrado <= 0 || saving || costoFaltante) return;
        setSaving(true);
        const costoTotal = !modoAjuste && !omitirCosto ? aNumero(costoEntrada) : 0;
        await onSave(mat, config, addCerrado, initEnUso, notas.trim(), modoAjuste, costoTotal, fechaCompra);
        setSaving(false);
        onClose();
    }

    const configLabel = granel
        ? `A granel · ${config.unidadBase}`
        : cpu > 0 ? `${config.presentacionTipo} de ${fmtBase(cpu, config.unidadBase)}` : config.presentacionTipo;

    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-30" onClick={onClose} />
            <div className="fixed inset-x-0 bottom-0 z-40 bg-slate-900 border-t border-slate-700 rounded-t-2xl" style={{ maxHeight: '92vh' }}>
                <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-700" /></div>
                <div className="overflow-y-auto px-5 pb-10" style={{ maxHeight: 'calc(92vh - 20px)' }}>
                    <div className="flex items-start justify-between py-3 mb-4">
                        <div>
                            <p className="text-white font-bold text-base">{mat.nombre}</p>
                            <p className={`text-sm mt-0.5 ${modoAjuste ? 'text-amber-400' : 'text-slate-400'}`}>
                                {modoAjuste ? 'Corregir stock' : esCompra ? 'Registrar compra' : 'Inventario inicial'}
                            </p>
                        </div>
                        <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
                    </div>

                    {/* Ya NO hay pestañas de modo: la tarjeta decidió si esto es
                        inventario inicial, una compra o una corrección de conteo.
                        Acá solo se explica qué va a pasar con el stock. */}
                    <div className={`rounded-xl px-4 py-3 mb-4 border ${
                        modoAjuste ? 'bg-amber-900/20 border-amber-700/40' : 'bg-teal-900/20 border-teal-700/40'
                    }`}>
                        <p className={`text-xs leading-snug ${modoAjuste ? 'text-amber-200' : 'text-teal-200'}`}>
                            {modoAjuste
                                ? 'Corrige el conteo: lo que declares REEMPLAZA el stock actual. No es una compra, así que no pide costo.'
                                : esCompra
                                    ? 'Llegó mercancía: se SUMA al stock que ya hay, y su costo entra al promedio ponderado del material.'
                                    : 'Primera carga de este material: es la existencia con la que arranca.'}
                        </p>
                    </div>

                    {/* Presentation config toggle */}
                    <button type="button" onClick={() => setShowConfig(v => !v)}
                        className="w-full flex items-center justify-between mb-3 px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs">
                        <span className="text-slate-300 font-semibold">{configLabel}</span>
                        <span className="flex items-center gap-1 text-slate-500">
                            <Settings size={11} /> {showConfig ? 'Ocultar' : 'Editar'}
                        </span>
                    </button>

                    {showConfig && <div className="mb-5"><PresConfigPanel config={config} onChange={setConfig} /></div>}

                    {/* Quantity entry */}
                    <div className="mb-4">
                        {granel && !isUnd && !isMetros ? (
                            <PrecisionStepper
                                label={modoAjuste
                                    ? `Stock total actual (${config.unidadBase})`
                                    : `${esCompra ? 'Cantidad que llegó' : 'Cantidad a ingresar'} (${config.unidadBase})`}
                                value={addCerrado} onChange={setAddCerrado} unit={config.unidadBase} />
                        ) : (
                            <WholeStepper
                                label={modoAjuste
                                    ? (granel ? `Stock total actual (${config.unidadBase})` : `${config.presentacionTipo}s en stock total`)
                                    : (granel
                                        ? `${esCompra ? 'Cantidad que llegó' : 'Cantidad a ingresar'} (${config.unidadBase})`
                                        : `${config.presentacionTipo}s cerrados que ${esCompra ? 'llegaron' : 'ingresan'}`)}
                                value={addCerrado} onChange={setAddCerrado}
                                unit={config.presentacionTipo === 'granel' ? config.unidadBase : config.presentacionTipo}
                                steps={isUnd ? undSteps : isMetros ? metroSteps : [1]}
                            />
                        )}
                        {!granel && cpu > 0 && addCerrado > 0 && (
                            <p className="text-slate-500 text-xs text-center mt-2">
                                {addCerrado.toLocaleString()} × {fmtBase(cpu, config.unidadBase)} = {fmtBase(addCerrado * cpu, config.unidadBase)}
                            </p>
                        )}
                    </div>

                    {/* Cuánto hay ABIERTO. No se pregunta al registrar una compra:
                        ahí entran envases cerrados, y lo que ya estaba abierto no
                        cambió — para eso está el botón "En uso" de la tarjeta.
                        Preguntarlo acá era una invitación a pisarlo sin querer. */}
                    {!granel && !esCompra && (
                        <div className="mb-4">
                            {(isUnd || isMetros) ? (
                                <WholeStepper label={`Ya tengo en uso / abierto (${config.unidadBase})`}
                                    value={initEnUso} onChange={setInitEnUso} unit={config.unidadBase}
                                    steps={isUnd ? undSteps : metroSteps} />
                            ) : (
                                <PrecisionStepper label={`Ya tengo en uso / abierto (${config.unidadBase})`}
                                    value={initEnUso} onChange={setInitEnUso} unit={config.unidadBase} />
                            )}
                            {!isUnd && !isMetros && cpu > 0 && initEnUso > 0 && (
                                <p className="text-slate-500 text-xs text-center mt-1.5">
                                    {(initEnUso / cpu * 100).toFixed(0)}% de 1 {config.presentacionTipo}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Preview */}
                    {addCerrado > 0 && (
                        <div className={`flex items-center gap-3 rounded-xl px-4 py-3 mb-4 ${
                            modoAjuste ? 'bg-amber-900/25 border border-amber-700/40' : 'bg-teal-900/30 border border-teal-700/40'
                        }`}>
                            <Check size={15} className={`${modoAjuste ? 'text-amber-400' : 'text-teal-400'} shrink-0`} />
                            <div>
                                <p className={`text-sm font-semibold ${modoAjuste ? 'text-amber-300' : 'text-teal-300'}`}>
                                    {granel
                                        ? `${modoAjuste ? 'Ajustar a:' : 'Total:'} ${isUnd ? newEnUso.toLocaleString() + ' ' + config.unidadBase : fmtBase(newEnUso, config.unidadBase)}`
                                        : `${modoAjuste ? 'Ajustar a: ' : ''}${newCerrado.toLocaleString()} ${config.presentacionTipo} cerrado${newCerrado !== 1 ? 's' : ''}`
                                    }
                                </p>
                                {!granel && initEnUso > 0 && (
                                    <p className="text-teal-600 text-xs">{fmtBase(initEnUso, config.unidadBase)} en uso</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Fecha de la compra — solo en "+ Entrada": corregir el conteo
                        es un ajuste de hoy, no una compra con fecha propia. */}
                    {!modoAjuste && (
                        <div className="mb-4">
                            <CampoFecha
                                label="Fecha de la compra"
                                value={fechaCompra}
                                onChange={setFechaCompra}
                                max={hoyInput()}
                                ayuda="Déjala como está si la compra es de hoy. Cámbiala para cargar compras anteriores."
                            />
                        </div>
                    )}

                    {/* Costo de esta entrada — alimenta el costo promedio ponderado del
                        material. Solo aplica al registrar una entrada real (no al
                        corregir el conteo de stock). */}
                    {!modoAjuste && puedeCostear && (
                        <div className="mb-4">
                            <SecLabel>Costo total de esta entrada (USD)</SecLabel>
                            {/* Texto, NO `type="number"`: con el teclado en español
                                "9,99" dejaba el input inválido y el valor llegaba
                                vacío, así que había que redondear. */}
                            <input
                                type="text" inputMode="decimal"
                                value={costoEntrada}
                                onChange={e => {
                                    const v = e.target.value.replace(/[^0-9.,]/g, '');
                                    setCostoEntrada(v);
                                    if (v) setOmitirCosto(false);
                                }}
                                placeholder="Ej: 9,99"
                                disabled={omitirCosto}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-teal-500 disabled:opacity-40"
                            />
                            <p className="text-slate-500 text-xs mt-1.5">
                                Lo que pagaste por {addCerrado > 0 ? `${addCerrado.toLocaleString()} ${config.presentacionTipo === 'granel' ? config.unidadBase : `${config.presentacionTipo}(s)`}` : 'esta entrada'} — se pondera contra el costo actual del material.
                            </p>
                            <button type="button" onClick={() => setOmitirCosto(v => !v)}
                                className={`mt-2 text-xs font-semibold ${omitirCosto ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}>
                                {omitirCosto ? '✓ Omitiendo costo — el precio del material no cambiará' : 'No tengo el precio ahora, omitir costo'}
                            </button>
                        </div>
                    )}

                    <div className="mb-6">
                        <SecLabel>Lote / Notas (opcional)</SecLabel>
                        <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                            placeholder="Ej: Lote #A241, vence 12/2026..."
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 resize-none focus:outline-none focus:border-slate-500" />
                    </div>

                    <button onClick={handleSave} disabled={addCerrado <= 0 || saving || costoFaltante}
                        className={`w-full disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-4 rounded-xl ${
                            modoAjuste ? 'bg-amber-600 hover:bg-amber-500' : 'bg-teal-600 hover:bg-teal-500'
                        }`}>
                        {saving ? 'Guardando...' : modoAjuste ? 'Corregir stock' : esCompra ? 'Registrar compra' : 'Guardar inventario inicial'}
                    </button>
                    {costoFaltante && (
                        <p className="text-amber-400 text-xs text-center mt-2">Indica el costo de esta entrada, u omítelo explícitamente.</p>
                    )}
                </div>
            </div>
        </>
    );
}

// ─── En Uso Bottom Sheet ──────────────────────────────────────────────────────

function EnUsoSheet({ mat, invDoc, onClose, onSave }) {
    const [enUso, setEnUso]       = useState(invDoc?.stockEnUso ?? 0);
    const [openPkg, setOpenPkg]   = useState(false);
    const [saving, setSaving]     = useState(false);
    const unit  = invDoc?.unidadBase || 'g';
    const cpu   = invDoc?.cantidadPorUnidad || 0;
    const pres  = invDoc?.presentacionTipo || '';
    const cerrado = invDoc?.stockCerrado ?? 0;

    async function handleSave() {
        if (saving) return;
        setSaving(true);
        const newCerrado = openPkg && cerrado > 0 ? cerrado - 1 : cerrado;
        await onSave(mat, newCerrado, enUso);
        setSaving(false);
        onClose();
    }

    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-30" onClick={onClose} />
            <div className="fixed inset-x-0 bottom-0 z-40 bg-slate-900 border-t border-slate-700 rounded-t-2xl">
                <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-700" /></div>
                <div className="overflow-y-auto px-5 pb-10" style={{ maxHeight: 'calc(85vh - 20px)' }}>
                    <div className="flex items-start justify-between py-3 mb-3">
                        <div>
                            <p className="text-white font-bold text-base">{mat.nombre}</p>
                            <p className="text-slate-400 text-sm mt-0.5">
                                Cerrado: <span className="font-mono text-slate-300">{cerrado} {pres}</span>
                            </p>
                        </div>
                        <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
                    </div>

                    <p className="text-slate-400 text-sm mb-4">
                        Ajusta cuánto queda en el {pres} actualmente abierto.
                    </p>

                    <div className="mb-4">
                        {esConteo(unit) || unit === 'm' ? (
                            <WholeStepper label={`Cantidad en uso (${unit})`}
                                value={enUso} onChange={setEnUso} unit={unit}
                                steps={esConteo(unit) ? [1, 100, 1000] : [1, 10, 100]} />
                        ) : (
                            <PrecisionStepper label={`Cantidad en uso (${unit})`}
                                value={enUso} onChange={setEnUso} unit={unit} />
                        )}
                        {cpu > 0 && enUso > 0 && (
                            <p className="text-slate-500 text-xs text-center mt-1.5">
                                {(enUso / cpu * 100).toFixed(0)}% de 1 {pres}
                            </p>
                        )}
                    </div>

                    {cerrado > 0 && (
                        <button type="button" onClick={() => setOpenPkg(v => !v)}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm mb-5 ${
                                openPkg ? 'border-teal-600/60 bg-teal-900/20 text-teal-300' : 'border-slate-700 bg-slate-800 text-slate-400'
                            }`}>
                            <span>Abrir un {pres} del almacén</span>
                            <div className={`w-4 h-4 rounded border ${openPkg ? 'bg-teal-500 border-teal-500' : 'border-slate-600'} flex items-center justify-center`}>
                                {openPkg && <Check size={10} className="text-white" />}
                            </div>
                        </button>
                    )}
                    {openPkg && (
                        <p className="text-slate-500 text-xs mb-4 -mt-3">
                            Almacén: {cerrado} → {cerrado - 1} {pres}
                        </p>
                    )}

                    <button onClick={handleSave} disabled={saving}
                        className="w-full bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 text-white font-bold py-4 rounded-xl">
                        {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            </div>
        </>
    );
}

// ─── Mínimo Bottom Sheet ──────────────────────────────────────────────────────

function MinimoSheet({ mat, invDoc, onClose, onSave }) {
    const granel = isGranel(invDoc);
    const pres   = invDoc?.presentacionTipo || '';
    const unit   = invDoc?.unidadBase || 'g';
    const cpu    = invDoc?.cantidadPorUnidad || 0;

    // For discrete materials: choose between envases (packages) or base units (g/ml)
    const [useBase, setUseBase] = useState(invDoc?.stockMinimoEsBase ?? false);
    const [minimo, setMinimo]   = useState(invDoc?.stockMinimo ?? 0);
    const [saving, setSaving]   = useState(false);

    // When switching unit, convert the current value
    function toggleUnit(toBase) {
        if (toBase === useBase) return;
        if (cpu > 0) {
            setMinimo(prev => toBase ? +(prev * cpu).toFixed(3) : Math.round(prev / cpu));
        }
        setUseBase(toBase);
    }

    async function handleSave() {
        if (saving) return;
        setSaving(true);
        await onSave(mat, minimo, granel ? false : useBase);
        setSaving(false);
        onClose();
    }

    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-30" onClick={onClose} />
            <div className="fixed inset-x-0 bottom-0 z-40 bg-slate-900 border-t border-slate-700 rounded-t-2xl">
                <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-700" /></div>
                <div className="px-5 pb-10">
                    <div className="flex items-start justify-between py-3 mb-3">
                        <div>
                            <p className="text-white font-bold text-base">Stock Mínimo</p>
                            <p className="text-slate-400 text-sm mt-0.5">{mat.nombre}</p>
                        </div>
                        <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
                    </div>

                    {/* Unit toggle — only for discrete materials */}
                    {!granel && invDoc && (
                        <div className="flex gap-2 mb-5">
                            <button type="button" onClick={() => toggleUnit(false)}
                                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                                    !useBase ? 'bg-teal-700 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}>
                                Por {pres}
                            </button>
                            <button type="button" onClick={() => toggleUnit(true)}
                                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                                    useBase ? 'bg-teal-700 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}>
                                Por {unit}
                            </button>
                        </div>
                    )}

                    <p className="text-slate-400 text-sm mb-5">
                        Alerta cuando el stock total baje de este valor
                        {' '}({!granel && !useBase ? `en ${pres}` : `en ${unit}`}).
                        {!granel && cpu > 0 && (
                            <span className="text-slate-500">
                                {' '}1 {pres} = {fmtBase(cpu, unit)}
                            </span>
                        )}
                    </p>

                    <div className="mb-6">
                        {(!invDoc || granel || useBase) ? (
                            esConteo(unit) ? (
                                <WholeStepper label={`Umbral mínimo (${unit})`}
                                    value={minimo} onChange={setMinimo} unit={unit} steps={[1, 100, 1000]} />
                            ) : (
                                <PrecisionStepper label={`Umbral mínimo (${unit})`}
                                    value={minimo} onChange={setMinimo} unit={unit} />
                            )
                        ) : (
                            <WholeStepper label={`Umbral mínimo (${pres})`}
                                value={minimo} onChange={setMinimo} unit={pres}
                                steps={esConteo(unit) ? [1, 100, 1000] : [1]} />
                        )}
                        {/* Conversion hint */}
                        {!granel && cpu > 0 && minimo > 0 && (
                            <p className="text-slate-600 text-xs text-center mt-2">
                                {useBase
                                    ? `≈ ${(minimo / cpu).toFixed(1)} ${pres}`
                                    : `≈ ${fmtBase(minimo * cpu, unit)}`
                                }
                            </p>
                        )}
                    </div>

                    <div className="flex gap-3">
                        <button onClick={() => setMinimo(0)}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 font-semibold py-3.5 rounded-xl">
                            Sin mínimo
                        </button>
                        <button onClick={handleSave} disabled={saving}
                            className="flex-1 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 text-white font-bold py-3.5 rounded-xl">
                            {saving ? 'Guardando...' : 'Guardar'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

// ─── Alerts Banner ────────────────────────────────────────────────────────────

function AlertsBanner({ alerts, onDismiss }) {
    if (alerts.length === 0) return null;
    return (
        <div className="mx-5 mb-3 shrink-0 space-y-2">
            {alerts.map(a => (
                <div key={a.id} className="flex items-start gap-3 bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3">
                    <Bell size={14} className="text-red-400 shrink-0 mt-0.5" />
                    <p className="text-red-300 text-sm flex-1">{a.mensaje}</p>
                    <button onClick={() => onDismiss(a.id)} className="text-red-500 hover:text-red-300 shrink-0 mt-0.5">
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MaterialsInventoryPage({ params = null }) {
    const { kromaUser, kromaRole, canEdit, verCostos } = useKroma();
    const isMaster = kromaRole === 'master';
    // Cargar existencias es del administrador; el operario solo mira.
    const canEditar = canEdit('inventarioMateriales');
    const [materials, setMaterials] = useState([]);
    const [inventory, setInventory] = useState({});
    const [alerts, setAlerts]       = useState([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState(null);
    const [catFilter, setCatFilter]     = useState('all');
    // El inicio del administrador señala "2 materiales sin existencias" y manda
    // acá: se llega con ese filtro puesto, no a la lista completa.
    const [statusFilter, setStatusFilter] = useState(params?.filtro || 'all');
    const [entradaTarget, setEntradaTarget] = useState(null);
    const [enUsoTarget, setEnUsoTarget]     = useState(null);
    const [minimoTarget, setMinimoTarget]   = useState(null);

    const empresaId = kromaUser?.empresaId || 'lacteoca';

    useEffect(() => {
        loadData();
        const unsub = onSnapshot(
            query(collection(db, 'kroma_alerts'), where('active', '==', true), where('empresaId', '==', empresaId)),
            snap => {
                const myId = kromaUser?.id || '';
                setAlerts(
                    snap.docs
                        .map(d => ({ id: d.id, ...d.data() }))
                        .filter(a => !(a.leidaPor || []).includes(myId))
                );
            }
        );
        return () => unsub();
    }, [empresaId]);

    async function loadData() {
        setLoading(true); setError(null);
        try {
            const [matsSnap, invSnap] = await Promise.all([
                getDocs(query(collection(db, 'kroma_materials'), where('active', '==', true), where('empresaId', '==', empresaId))),
                getDocs(query(collection(db, 'kroma_inventory_materials'), where('empresaId', '==', empresaId))),
            ]);
            const mats = matsSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(m => m.categoria !== 'leche')
                .sort((a, b) => a.nombre.localeCompare(b.nombre));
            const inv = {};
            // Se indexa por `materialId` O por el id del documento: el id ES el
            // id del material por construcción, y había registros creados sin
            // ese campo que quedaban colgados en `inv[undefined]`.
            invSnap.docs.forEach(d => {
                const data = d.data();
                // Un registro dado de baja NO cuenta como inventario: esta
                // pantalla lo ignoraba y por eso mostraba stock de materiales
                // que el tablero contaba como "sin existencias cargadas".
                if (data.active === false) return;
                inv[data.materialId || d.id] = { id: d.id, ...data };
            });

            // ── Reparación de registros invisibles ──
            //
            // "En uso" y "Stock mínimo" creaban el registro de inventario SIN
            // `empresaId` (ya corregido arriba). Como toda lista filtra por ese
            // campo, esos registros no los devolvía nadie: el material se veía
            // como "sin existencias cargadas" aunque tuviera stock, y su mínimo
            // no podía disparar la alerta de reposición. No se arreglan con un
            // botón que alguien tiene que acordarse de pulsar.
            const faltantes = mats.filter(m => !inv[m.id]);
            if (faltantes.length > 0) {
                try {
                    // Se piden UNO POR UNO por su id (el id del registro ES el
                    // id del material). Un `get` puntual sí puede leer un
                    // documento al que le falta la etiqueta de empresa; una
                    // lista sin ese filtro la rechazan las reglas. Y son pocos:
                    // solo los que aparentan no tener inventario.
                    const encontrados = await Promise.all(faltantes.map(m =>
                        getDoc(doc(db, 'kroma_inventory_materials', m.id))
                            .then(snap => (snap.exists() ? { id: snap.id, ...snap.data() } : null))
                            .catch(() => null)
                    ));
                    const batch = writeBatch(db);
                    let n = 0;
                    encontrados.forEach(data => {
                        if (!data) return;
                        // Existe pero estaba invisible: se le pone la etiqueta
                        // que le falta para que vuelva a aparecer en las listas.
                        if (data.active === false) return;   // dado de baja: no se revive
                        if (!data.empresaId || !data.materialId) {
                            batch.update(doc(db, 'kroma_inventory_materials', data.id),
                                { empresaId, materialId: data.id });
                            n += 1;
                        }
                        inv[data.id] = { ...data, empresaId, materialId: data.id };
                    });
                    if (n > 0) await batch.commit();
                } catch { /* si no se puede reparar, la pantalla igual abre */ }
            }

            setMaterials(mats);
            setInventory(inv);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    }

    async function dismissAlert(alertId) {
        const myId = kromaUser?.id || '';
        await updateDoc(doc(db, 'kroma_alerts', alertId), {
            leidaPor: [...((alerts.find(a => a.id === alertId)?.leidaPor) || []), myId],
        });
        setAlerts(prev => prev.filter(a => a.id !== alertId));
    }

    async function handleEntrada(mat, config, addCerrado, initEnUso, notas, esAjuste = false, costoTotal = 0, fechaCompraInput = null) {
        const invRef = doc(db, 'kroma_inventory_materials', mat.id);
        const matRef = doc(db, 'kroma_materials', mat.id);
        const granel = config.presentacionTipo === 'granel';

        // Unidades BASE que entran en esta operación — solo tiene sentido costear
        // una entrada real (no un ajuste de conteo, que no es una compra).
        const entradaBaseUnits = !esAjuste
            ? (granel ? addCerrado : addCerrado * (config.cantidadPorUnidad || 0))
            : 0;

        // Todo en UNA transacción: el stock (kroma_inventory_materials) y el costo
        // promedio ponderado (kroma_materials.costoUSD) se leen y escriben juntos,
        // para que una compra concurrente no pise el promedio de otra.
        const { invData, matUpdate } = await runTransaction(db, async (tx) => {
            const [invSnap, matSnap] = await Promise.all([tx.get(invRef), tx.get(matRef)]);
            const invDocAntes = invSnap.exists() ? invSnap.data() : null;
            const matAntes    = matSnap.exists() ? matSnap.data() : mat;

            const newCerrado = granel ? 0
                : esAjuste ? addCerrado
                : (invDocAntes?.stockCerrado ?? 0) + addCerrado;
            const newEnUso = granel
                ? (esAjuste ? addCerrado : (invDocAntes?.stockEnUso ?? 0) + addCerrado)
                : initEnUso;

            const invData = {
                empresaId:         kromaUser?.empresaId || 'lacteoca',
                materialId:        mat.id,
                materialNombre:    mat.nombre,
                categoria:         mat.categoria || 'otros',
                presentacionTipo:  config.presentacionTipo,
                unidadBase:        config.unidadBase,
                cantidadPorUnidad: granel ? 0 : (config.cantidadPorUnidad || 0),
                stockCerrado:      newCerrado,
                stockEnUso:        newEnUso,
                stockMinimo:       invDocAntes?.stockMinimo ?? 0,
                ultimaEntrada:     serverTimestamp(),
                updatedAt:         serverTimestamp(),
                active:            true,
                ...(notas && { ultimaNotaEntrada: notas }),
            };
            tx.set(invRef, invData, { merge: true });

            let matUpdate = null;
            if (entradaBaseUnits > 0 && costoTotal > 0) {
                const nuevoCosto = costoPonderado({
                    invDocAntes, mat: matAntes, entradaBaseUnits, costoEntradaTotal: costoTotal,
                });
                if (nuevoCosto != null) {
                    matUpdate = { costoUSD: nuevoCosto, updatedAt: serverTimestamp() };
                    tx.update(matRef, matUpdate);
                }
            }
            return { invData, matUpdate };
        });

        setInventory(prev => ({ ...prev, [mat.id]: { id: invRef.id, ...prev[mat.id], ...invData } }));
        if (matUpdate) {
            setMaterials(prev => prev.map(m => m.id === mat.id ? { ...m, costoUSD: matUpdate.costoUSD } : m));
        }

        // El campo es una FECHA sola ("YYYY-MM-DD"), así que "es hoy" se decide
        // comparando el día, no con una holgura de minutos. Si es hoy manda el
        // reloj del servidor; si la movió, es una compra anterior.
        const fechaCompraEsHoy   = esHoyInput(fechaCompraInput);
        const fechaCompraElegida = fechaCompraEsHoy ? null : fechaDesdeInput(fechaCompraInput);

        // LIBRO DE COMPRAS. Hasta ahora una entrada actualizaba el stock y el
        // costo promedio y no dejaba NINGÚN rastro de la compra en sí: no había
        // forma de responder "cuánto compramos este mes, a quién". Se escribe
        // fuera de la transacción a propósito — si esto falla, el inventario y
        // el costeo (que es lo crítico) ya quedaron bien.
        if (!esAjuste && entradaBaseUnits > 0 && costoTotal > 0) {
            try {
                await addDoc(collection(db, 'kroma_compras'), {
                    empresaId:      kromaUser?.empresaId || 'lacteoca',
                    materialId:     mat.id,
                    materialNombre: mat.nombre,
                    categoria:      mat.categoria || 'otros',
                    proveedorId:     mat.proveedorId || '',
                    proveedorNombre: mat.proveedorNombre || '',
                    cantidad:       addCerrado,
                    unidad:         config.presentacionTipo === 'granel' ? config.unidadBase : config.presentacionTipo,
                    cantidadBase:   entradaBaseUnits,
                    unidadBase:     config.unidadBase,
                    costoTotal:     Number(costoTotal) || 0,
                    costoUnitarioBase: entradaBaseUnits > 0 ? (Number(costoTotal) || 0) / entradaBaseUnits : 0,
                    notas:          notas || '',
                    registradoPor:       kromaUser?.id || '',
                    registradoPorNombre: kromaUser?.name || '',
                    // Igual que en producción: si la dejó en ahora se usa la
                    // hora del servidor; si la movió, manda la suya.
                    fecha:     (fechaCompraEsHoy || !fechaCompraElegida) ? serverTimestamp() : fechaCompraElegida,
                    cargadaEnDiferido: !fechaCompraEsHoy && !!fechaCompraElegida,
                    createdAt: serverTimestamp(),
                });
            } catch (e) {
                console.error('No se pudo registrar la compra en el libro:', e);
            }
        }
    }

    // ⚠️ `empresaId` y `materialId` en TODAS las escrituras, no solo en la
    // entrada. Estas dos usan `setDoc(..., {merge:true})`, que CREA el documento
    // si no existía — y lo creaban sin `empresaId`. Como cada lista filtra por
    // `where('empresaId','==',…)`, ese registro quedaba invisible para toda la
    // app: el material aparecía como "sin existencias cargadas" aunque tuviera
    // stock, y su mínimo nunca podía disparar la alerta de reposición.
    async function handleSetEnUso(mat, newCerrado, newEnUso) {
        const docRef = doc(db, 'kroma_inventory_materials', mat.id);
        const update = {
            empresaId: kromaUser?.empresaId || 'lacteoca',
            materialId: mat.id,
            stockCerrado: newCerrado, stockEnUso: newEnUso, updatedAt: serverTimestamp(),
            // Declarar stock sobre un registro dado de baja lo reactiva: se está
            // volviendo a usar. Sin esto quedaría escrito pero invisible.
            active: true,
        };
        await setDoc(docRef, update, { merge: true });
        setInventory(prev => ({ ...prev, [mat.id]: { ...prev[mat.id], ...update } }));
    }

    async function handleSetMinimo(mat, minimo, esBase) {
        const docRef = doc(db, 'kroma_inventory_materials', mat.id);
        const update = {
            empresaId: kromaUser?.empresaId || 'lacteoca',
            materialId: mat.id,
            stockMinimo: minimo, stockMinimoEsBase: !!esBase, updatedAt: serverTimestamp(),
            active: true,
        };
        await setDoc(docRef, update, { merge: true });
        setInventory(prev => ({ ...prev, [mat.id]: { ...prev[mat.id], ...update } }));
    }

    async function handleDeleteMaterial(mat, invDoc) {
        if (invDoc) {
            await updateDoc(doc(db, 'kroma_inventory_materials', mat.id), { active: false });
        }
        setMaterials(prev => prev.filter(m => m.id !== mat.id));
        setInventory(prev => { const n = { ...prev }; delete n[mat.id]; return n; });
    }

    // ── Derived ───────────────────────────────────────────────────────────────

    const lowCount = materials.filter(m => {
        const st = stockStatus(inventory[m.id]);
        return (st === 'low' || st === 'critical') && (inventory[m.id]?.stockMinimo ?? 0) > 0;
    }).length;

    const noStockCount = materials.filter(m => !inventory[m.id]).length;

    const filtered = materials.filter(m => {
        if (catFilter !== 'all') {
            const section = SECTION_GROUPS.find(s => s.id === catFilter);
            if (section && !section.cats.includes(m.categoria || 'otros')) return false;
        }
        if (statusFilter === 'low') {
            const st = stockStatus(inventory[m.id]);
            return st === 'low' || st === 'critical' || st === 'empty';
        }
        if (statusFilter === 'none') return !inventory[m.id];
        // Cargado pero sin mínimo: nunca va a avisar que falta.
        if (statusFilter === 'sin_minimo') return !!inventory[m.id] && !tieneMinimo(inventory[m.id]);
        return true;
    });

    // ── Loading / error ───────────────────────────────────────────────────────

    if (loading) return (
        <div className="p-6 flex items-center gap-3 text-slate-400 text-sm">
            <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-teal-400 animate-spin" />
            Cargando inventario...
        </div>
    );

    if (error) return (
        <div className="p-6">
            <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-4">
                <p className="text-red-400 font-semibold text-sm">Error al cargar inventario</p>
                <p className="text-red-300 text-xs mt-1 font-mono">{error}</p>
            </div>
            <button onClick={loadData} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg">Reintentar</button>
        </div>
    );

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="px-5 pt-5 pb-3 shrink-0">
                <h2 className="text-xl font-bold text-white mb-0.5">Inventario de Insumos</h2>
                <p className="text-slate-400 text-sm">
                    {materials.length} materiales · {Object.keys(inventory).length} con stock registrado
                </p>
                {/* Sin esta línea la pantalla queda muda: el operario ve el stock,
                    no ve botones, y no tiene cómo saber si es un permiso, un error
                    o algo que él debería estar haciendo. */}
                {!canEditar && (
                    <p className="text-slate-500 text-xs mt-2 leading-snug">
                        Consulta: acá ves cuánto queda de cada insumo. Las compras y las
                        correcciones de stock las registra el administrador; el consumo de
                        cada producción se descuenta solo.
                    </p>
                )}
            </div>

            <AlertsBanner alerts={alerts} onDismiss={dismissAlert} />

            {lowCount > 0 && (
                <div className="mx-5 mb-3 flex items-center gap-3 bg-amber-900/30 border border-amber-700/50 rounded-xl px-4 py-3 shrink-0">
                    <AlertTriangle size={15} className="text-amber-400 shrink-0" />
                    <p className="text-amber-300 text-sm flex-1">
                        <span className="font-bold">{lowCount}</span> {lowCount === 1 ? 'material bajo' : 'materiales bajo'} el mínimo
                    </p>
                    <button onClick={() => setStatusFilter('low')} className="text-amber-400 text-xs font-semibold hover:text-amber-300 shrink-0">Ver →</button>
                </div>
            )}

            <div className="px-5 mb-3 shrink-0 space-y-2">
                <div className="flex gap-2">
                    {[
                        { id: 'all',  label: 'Todos' },
                        { id: 'low',  label: `⚠ Bajos (${lowCount})` },
                        { id: 'none', label: `Sin stock (${noStockCount})` },
                    ].map(f => (
                        <button key={f.id} onClick={() => setStatusFilter(f.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                statusFilter === f.id ? 'bg-teal-700 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                            }`}>{f.label}</button>
                    ))}
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                    <button onClick={() => setCatFilter('all')}
                        className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold ${catFilter === 'all' ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-500 hover:text-white'}`}>
                        Todas
                    </button>
                    {SECTION_GROUPS.map(s => (
                        <button key={s.id} onClick={() => setCatFilter(s.id)}
                            className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold ${catFilter === s.id ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-500 hover:text-white'}`}>
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-8">
                {filtered.length === 0 ? (
                    <div className="text-center py-16">
                        <Package size={36} className="text-slate-700 mx-auto mb-3" />
                        <p className="text-slate-500 text-sm">Sin materiales en esta vista</p>
                        {(statusFilter !== 'all' || catFilter !== 'all') && (
                            <button onClick={() => { setStatusFilter('all'); setCatFilter('all'); }}
                                className="mt-3 text-slate-400 hover:text-white text-xs underline">Ver todos</button>
                        )}
                    </div>
                ) : catFilter === 'all' ? (
                    SECTION_GROUPS.map(section => {
                        const mats = filtered.filter(m => section.cats.includes(m.categoria || 'otros'));
                        if (mats.length === 0) return null;
                        return (
                            <div key={section.id} className="mb-6">
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-slate-500 text-xs font-semibold uppercase tracking-widest">{section.label}</span>
                                    <div className="flex-1 h-px bg-slate-800" />
                                    <span className="text-slate-700 text-xs">{mats.length}</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {mats.map(mat => (
                                        <MaterialCard key={mat.id} mat={mat} invDoc={inventory[mat.id] ?? null}
                                            onEntrada={(m, inv, modo) => setEntradaTarget({ mat: m, invDoc: inv, modo })}
                                            onEnUso={(m, inv) => setEnUsoTarget({ mat: m, invDoc: inv })}
                                            onSetMinimo={(m, inv) => setMinimoTarget({ mat: m, invDoc: inv })}
                                            isMaster={isMaster} onDelete={handleDeleteMaterial} canEditar={canEditar}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {filtered.map(mat => (
                            <MaterialCard key={mat.id} mat={mat} invDoc={inventory[mat.id] ?? null}
                                onEntrada={(m, inv, modo) => setEntradaTarget({ mat: m, invDoc: inv, modo })}
                                onEnUso={(m, inv) => setEnUsoTarget({ mat: m, invDoc: inv })}
                                onSetMinimo={(m, inv) => setMinimoTarget({ mat: m, invDoc: inv })}
                                isMaster={isMaster} onDelete={handleDeleteMaterial} canEditar={canEditar}
                            />
                        ))}
                    </div>
                )}
            </div>

            {entradaTarget && (
                <EntradaSheet mat={entradaTarget.mat} invDoc={entradaTarget.invDoc} modo={entradaTarget.modo}
                    onClose={() => setEntradaTarget(null)} onSave={handleEntrada} verCostos={verCostos} />
            )}
            {enUsoTarget && (
                <EnUsoSheet mat={enUsoTarget.mat} invDoc={enUsoTarget.invDoc}
                    onClose={() => setEnUsoTarget(null)} onSave={handleSetEnUso} />
            )}
            {minimoTarget && (
                <MinimoSheet mat={minimoTarget.mat} invDoc={minimoTarget.invDoc}
                    onClose={() => setMinimoTarget(null)} onSave={handleSetMinimo} />
            )}
        </div>
    );
}
