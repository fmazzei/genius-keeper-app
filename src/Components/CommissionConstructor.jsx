// RUTA: src/Components/CommissionConstructor.jsx
//
// CONSTRUCTOR DE COMISIONES POR PIEZAS (pedido del dueño, 4-nov-2026):
// "un conjunto de opciones clasificadas que el usuario va agregando y simulando
// hasta dar con la fórmula más adecuada… que el sistema lo guíe".
//
// Tres pasos en una sola pantalla:
//   ① La meta del mes (unidades, precio, kg de foodservice, qué unidades cuentan).
//   ② Cómo gana: las PIEZAS puestas (tocar para ajustar, ✕ para quitar) y el
//      catálogo para agregar más (tocar, o arrastrar en la computadora). Para
//      empezar, tres preguntas o un modelo.
//   ③ Pruébalo: deslizadores de escenario y cuánto ganaría, pieza por pieza.
// Los avisos (avisosEsquema) atajan los errores antes de guardar; un error no
// deja guardar y trae su arreglo de un toque.
//
// Las piezas escriben los mismos campos de commissionConfig que lee el motor
// (piezasComision.js). Los esquemas por fecha (commissionConfigCambios) siguen.

import React, { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import {
    Plus, X, Trash2, AlertCircle, AlertTriangle, Lightbulb, FileText, ChevronDown, ChevronRight,
    Wand2, Check, Wallet, Percent, Gift, UtensilsCrossed, Layers, Target,
} from 'lucide-react';
import { esquemasComision, fechaLocal } from '@/utils/periodosComision.js';
import LoadingSpinner from '@/Components/LoadingSpinner';
import CommissionProposalDoc from '@/Components/CommissionProposalDoc.jsx';
import {
    PIEZAS, GRUPOS, pieza, piezasActivas, agregarPieza, quitarPieza, aplicarModelo, MODELOS,
    simularEsquema, curvaEsquema, avisosEsquema, limpiarEsquema, piezasDeRespuestas, leerCampo, ponerCampo, completo,
} from '@/utils/piezasComision.js';

export { DEFAULT_COMMISSION_CONFIG } from '@/utils/commissionDefaults.js';

// ─── Utilidades ───────────────────────────────────────────────────────────────
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const money = (v) => `$${Math.round(n(v)).toLocaleString('es-VE')}`;
const money2 = (v) => `$${(Math.round(n(v) * 100) / 100).toLocaleString('es-VE')}`;
const uds = (v) => Math.round(n(v)).toLocaleString('es-VE');
const leerNumero = (s) => { const t = String(s ?? '').replace(/\s/g, '').replace(',', '.'); const v = Number(t); return t === '' || !Number.isFinite(v) ? 0 : v; };
const ddmmaaaa = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const hoyClave = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const primeroDelMesSiguiente = () => { const d = new Date(); const x = new Date(d.getFullYear(), d.getMonth() + 1, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-01`; };

// Colores por grupo (clases completas para que Tailwind las vea).
const TONO = {
    blue:    { card: 'bg-blue-50 border-blue-200', titulo: 'text-blue-900', chip: 'bg-blue-100 text-blue-800', barra: 'bg-blue-500', icono: 'text-blue-600' },
    emerald: { card: 'bg-emerald-50 border-emerald-200', titulo: 'text-emerald-900', chip: 'bg-emerald-100 text-emerald-800', barra: 'bg-emerald-500', icono: 'text-emerald-600' },
    amber:   { card: 'bg-amber-50 border-amber-200', titulo: 'text-amber-900', chip: 'bg-amber-100 text-amber-800', barra: 'bg-amber-500', icono: 'text-amber-600' },
    violet:  { card: 'bg-violet-50 border-violet-200', titulo: 'text-violet-900', chip: 'bg-violet-100 text-violet-800', barra: 'bg-violet-500', icono: 'text-violet-600' },
    orange:  { card: 'bg-orange-50 border-orange-200', titulo: 'text-orange-900', chip: 'bg-orange-100 text-orange-800', barra: 'bg-orange-500', icono: 'text-orange-600' },
    slate:   { card: 'bg-slate-50 border-slate-200', titulo: 'text-slate-800', chip: 'bg-slate-200 text-slate-700', barra: 'bg-slate-500', icono: 'text-slate-500' },
};
const ICONO_GRUPO = { base: Wallet, comision: Percent, usd: Gift, pct: Target, food: UtensilsCrossed, extra: Layers };
const grupoDe = (id) => GRUPOS.find(g => g.id === id);
// Un color distinto por línea en la barra del simulador (dos piezas del mismo grupo no se confunden).
const COLOR_LINEA = ['bg-amber-500', 'bg-emerald-500', 'bg-blue-500', 'bg-violet-500', 'bg-orange-500', 'bg-rose-500', 'bg-cyan-500', 'bg-lime-500', 'bg-fuchsia-500', 'bg-slate-500'];
const tonoDePieza = (id) => TONO[grupoDe(pieza(id).grupo).color];

// Un esquema guardado → el formulario (valores por defecto + arranque normalizado).
const aFormulario = (raw = {}) => {
    const merged = completo(raw);
    if (!merged.esquema) merged.esquema = 'niveles';
    if (merged.tasaFija === undefined) merged.tasaFija = 0;
    const topMeta = merged.metaMensual;
    merged.arranque = (merged.arranque || []).map((a, i) => {
        const pct = a.pct ?? (topMeta > 0 ? Math.round(((a.meta || 0) / topMeta) * 100) : 0);
        return { mes: a.mes ?? (i + 1), pct, meta: a.meta ?? Math.round(topMeta * pct / 100) };
    });
    return merged;
};

// ─── Campo numérico (acepta coma decimal; nunca type="number") ───────────────
const Numero = ({ value, onChange, sufijo, ancho = 'w-20', grande = false }) => {
    const [txt, setTxt] = useState(n(value) === 0 ? '' : String(value).replace('.', ','));
    useEffect(() => {
        if (leerNumero(txt) !== n(value)) setTxt(n(value) === 0 ? '' : String(value).replace('.', ','));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);
    return (
        <span className="inline-flex items-center gap-1 shrink-0">
            <input type="text" inputMode="decimal" value={txt} placeholder="0"
                onChange={e => { setTxt(e.target.value); onChange(leerNumero(e.target.value)); }}
                className={`${ancho} text-center ${grande ? 'p-2.5 text-base' : 'p-2 text-sm'} border border-slate-200 rounded-lg font-mono bg-white`} />
            {sufijo && <span className="text-sm text-slate-400">{sufijo}</span>}
        </span>
    );
};

const Fila = ({ label, ayuda, children }) => (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-b-0">
        <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-700 leading-snug">{label}</p>
            {ayuda && <p className="text-xs text-slate-400 leading-tight mt-0.5">{ayuda}</p>}
        </div>
        {children}
    </div>
);

const Paso = ({ n: num, titulo, ayuda, children, derecha }) => (
    <section>
        <div className="flex items-start gap-2.5 mb-2.5">
            <span className="w-7 h-7 rounded-full bg-[#0D2B4C] text-white text-sm font-black flex items-center justify-center shrink-0">{num}</span>
            <div className="flex-1 min-w-0">
                <p className="text-base font-black text-slate-800 leading-tight">{titulo}</p>
                {ayuda && <p className="text-xs text-slate-500 leading-snug">{ayuda}</p>}
            </div>
            {derecha}
        </div>
        {children}
    </section>
);

// ─── Aviso con sus arreglos ──────────────────────────────────────────────────
const Aviso = ({ a, onArreglo }) => {
    const estilo = a.nivel === 'error' ? 'bg-red-50 border-red-200 text-red-800'
        : a.nivel === 'aviso' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-sky-50 border-sky-200 text-sky-800';
    const Icono = a.nivel === 'error' ? AlertCircle : a.nivel === 'aviso' ? AlertTriangle : Lightbulb;
    return (
        <div className={`rounded-xl border px-3 py-2 ${estilo}`}>
            <div className="flex items-start gap-2 text-xs leading-snug">
                <Icono size={15} className="shrink-0 mt-0.5" />
                <span className="flex-1">{a.texto}</span>
            </div>
            {a.arreglos.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5 pl-6">
                    {a.arreglos.map((x, i) => (
                        <button key={i} type="button" onClick={() => onArreglo(x)}
                            className="px-2.5 py-1 rounded-lg bg-white/80 border border-current text-[11px] font-bold active:opacity-60">{x.texto}</button>
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── Editores especiales ─────────────────────────────────────────────────────
function EditorNiveles({ config, setConfig }) {
    const tiers = [...(config.tiers || [])];
    const upd = (i, k, v) => setConfig(p => ({ ...p, tiers: p.tiers.map((t, j) => j === i ? { ...t, [k]: v } : t) }));
    const meta = n(config.metaMensual);
    return (
        <div className="space-y-2">
            {tiers.map((t, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-2.5">
                    <div className="flex items-center gap-2">
                        <input type="text" value={t.label || ''} onChange={e => upd(i, 'label', e.target.value)} placeholder="Nombre"
                            className="flex-1 min-w-0 text-sm font-bold text-slate-800 bg-slate-50 rounded-lg px-2 py-1.5" />
                        <button type="button" onClick={() => setConfig(p => ({ ...p, tiers: p.tiers.filter((_, j) => j !== i) }))}
                            className="p-1.5 text-slate-300 hover:text-red-500" aria-label="Quitar nivel"><Trash2 size={15} /></button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs text-slate-500">
                        <span>Desde el</span><Numero value={t.minPct} onChange={v => upd(i, 'minPct', v)} ancho="w-16" sufijo="%" />
                        <span>de la meta ({uds(meta * n(t.minPct) / 100)} uds) paga</span><Numero value={t.rate} onChange={v => upd(i, 'rate', v)} ancho="w-16" sufijo="%" />
                    </div>
                </div>
            ))}
            <button type="button" onClick={() => setConfig(p => ({ ...p, tiers: [...(p.tiers || []), { label: `Nivel ${(p.tiers || []).length + 1}`, minPct: 100, rate: 4 }] }))}
                className="w-full flex items-center justify-center gap-1 py-2 border border-dashed border-emerald-300 rounded-xl text-xs font-bold text-emerald-700"><Plus size={13} /> Agregar nivel</button>
            <div className="bg-white rounded-xl border border-slate-200 p-2.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <button type="button" onClick={() => setConfig(p => ({ ...p, bajaActiva: p.bajaActiva === false, bajaRate: p.bajaActiva === false ? (n(p.bajaRate) || 3) : 0 }))}
                    className={`w-9 h-5 rounded-full relative shrink-0 ${config.bajaActiva !== false ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-label="Pagar por debajo del primer nivel">
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${config.bajaActiva !== false ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
                <span className="flex-1 min-w-[140px]">Por debajo del primer nivel {config.bajaActiva !== false ? 'paga' : 'no paga nada'}</span>
                {config.bajaActiva !== false && <Numero value={config.bajaRate} onChange={v => setConfig(p => ({ ...p, bajaRate: v }))} ancho="w-16" sufijo="%" />}
            </div>
            <p className="text-[11px] text-slate-400">El % que toca según cuánto de la meta logró, sobre todo lo que cobra.</p>
        </div>
    );
}

function EditorEscalones({ config, setConfig, medida }) {
    const food = medida === 'food';
    const campo = food ? 'bonoNivelFood' : 'bonoNivel';
    const min = food ? 'minKg' : 'minUnidades';
    const unidad = food ? 'kg' : 'uds';
    const meta = n(food ? config.metaKgFoodservice : config.metaMensual);
    const fmt = (v) => (food ? String(Math.round(n(v) * 10) / 10).replace('.', ',') : uds(v));
    const lista = config[campo]?.escalones || [];
    const setLista = (fn) => setConfig(p => ({ ...p, [campo]: { activo: true, ...(p[campo] || {}), escalones: fn([...(p[campo]?.escalones || [])]) } }));
    const upd = (i, k, v) => setLista(l => l.map((e, j) => j === i ? { ...e, [k]: v } : e));
    const cambiarModo = (i, porPct) => setLista(l => l.map((e, j) => {
        if (j !== i) return e;
        if (porPct) return { ...e, minPct: meta > 0 ? Math.round(n(e[min]) / meta * 1000) / 10 : 0, [min]: null };
        return { ...e, [min]: Math.round(meta * n(e.minPct) / 100 * (food ? 10 : 1)) / (food ? 10 : 1), minPct: null };
    }));
    return (
        <div className="space-y-2">
            {lista.map((e, i) => {
                const porPct = (e[min] == null || e[min] === '') && e.minPct != null;
                const umbral = porPct ? meta * n(e.minPct) / 100 : n(e[min]);
                return (
                    <div key={i} className="bg-white rounded-xl border border-slate-200 p-2.5">
                        <div className="flex items-center gap-2">
                            <input type="text" value={e.etiqueta || ''} onChange={ev => upd(i, 'etiqueta', ev.target.value)} placeholder="Nombre"
                                className="flex-1 min-w-0 text-sm font-bold text-slate-800 bg-slate-50 rounded-lg px-2 py-1.5" />
                            <button type="button" onClick={() => setLista(l => l.filter((_, j) => j !== i))} className="p-1.5 text-slate-300 hover:text-red-500" aria-label="Quitar escalón"><Trash2 size={15} /></button>
                        </div>
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
                            <span>Desde</span>
                            <Numero value={porPct ? e.minPct : e[min]} onChange={v => upd(i, porPct ? 'minPct' : min, v)} ancho="w-[4.5rem]" />
                            <button type="button" onClick={() => cambiarModo(i, !porPct)} className="px-2 py-1.5 rounded-lg bg-slate-100 font-bold text-slate-600 shrink-0" title="Cambiar entre cantidad y % de la meta">{porPct ? '%' : unidad}</button>
                            <span className="font-bold">→</span>
                            <Numero value={e.montoUSD} onChange={v => upd(i, 'montoUSD', v)} ancho="w-[4.5rem]" sufijo="$" />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">{porPct ? `= ${fmt(umbral)} ${unidad} con la meta de ${fmt(meta)}` : `= ${meta > 0 ? String(Math.round(umbral / meta * 1000) / 10).replace('.', ',') : 0} % de la meta`}</p>
                    </div>
                );
            })}
            <button type="button" onClick={() => setLista(l => [...l, { etiqueta: `Escalón ${l.length + 1}`, [min]: Math.round(meta * (food ? 10 : 1)) / (food ? 10 : 1) || 0, montoUSD: 0 }])}
                className="w-full flex items-center justify-center gap-1 py-2 border border-dashed border-amber-300 rounded-xl text-xs font-bold text-amber-700"><Plus size={13} /> Agregar escalón</button>
            <p className="text-[11px] text-slate-400">Se paga solo el escalón más alto que alcance. Por debajo del primero, nada.</p>
        </div>
    );
}

function EditorArranque({ config, setConfig }) {
    const meta = n(config.metaMensual);
    const lista = config.arranque || [];
    const upd = (i, pct) => setConfig(p => ({ ...p, arranque: p.arranque.map((a, j) => j === i ? { ...a, pct, meta: Math.round(meta * pct / 100) } : a) }));
    return (
        <div className="space-y-1.5">
            {lista.map((a, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 px-2.5 py-2 flex items-center gap-2 text-xs text-slate-600">
                    <span className="font-bold w-12 shrink-0">Mes {i + 1}</span>
                    <Numero value={a.pct} onChange={v => upd(i, v)} ancho="w-16" sufijo="%" />
                    <span className="flex-1 text-right font-mono">{uds(a.meta)} uds</span>
                    <button type="button" onClick={() => setConfig(p => ({ ...p, arranque: p.arranque.filter((_, j) => j !== i) }))} className="p-1 text-slate-300 hover:text-red-500" aria-label="Quitar mes"><Trash2 size={14} /></button>
                </div>
            ))}
            <button type="button" onClick={() => setConfig(p => ({ ...p, arranque: [...(p.arranque || []), { mes: (p.arranque || []).length + 1, pct: 90, meta: Math.round(meta * 0.9) }] }))}
                className="w-full flex items-center justify-center gap-1 py-2 border border-dashed border-slate-300 rounded-xl text-xs font-bold text-slate-600"><Plus size={13} /> Agregar mes</button>
        </div>
    );
}

// ─── La guía: tres preguntas ─────────────────────────────────────────────────
function Guia({ onArmar, onCerrar }) {
    const [r, setR] = useState({});
    const Opcion = ({ activo, onClick, titulo, ayuda }) => (
        <button type="button" onClick={onClick}
            className={`text-left p-2.5 rounded-xl border ${activo ? 'bg-[#0D2B4C] border-[#0D2B4C] text-white' : 'bg-white border-slate-200 text-slate-700'}`}>
            <p className="text-sm font-bold leading-tight">{titulo}</p>
            {ayuda && <p className={`text-[11px] leading-snug mt-0.5 ${activo ? 'text-white/70' : 'text-slate-400'}`}>{ayuda}</p>}
        </button>
    );
    const conPct = r.premio === 'pct' || r.premio === 'ambos';
    const listo = r.fijo != null && r.premio && (!conPct || r.sube != null);
    return (
        <div className="rounded-2xl border-2 border-[#0D2B4C]/20 bg-gradient-to-b from-[#0D2B4C]/5 to-white p-3 space-y-3">
            <div className="flex items-center gap-2">
                <Wand2 size={18} className="text-[#0D2B4C]" />
                <p className="flex-1 text-sm font-black text-[#0D2B4C]">Te lo armo con tres preguntas</p>
                {onCerrar && <button type="button" onClick={onCerrar} className="p-1 text-slate-400" aria-label="Cerrar"><X size={16} /></button>}
            </div>
            <div>
                <p className="text-xs font-bold text-slate-600 mb-1.5">1. ¿Tiene sueldo fijo?</p>
                <div className="grid grid-cols-2 gap-2">
                    <Opcion activo={r.fijo === true} onClick={() => setR(x => ({ ...x, fijo: true }))} titulo="Sí" ayuda="Cobra algo seguro cada quincena" />
                    <Opcion activo={r.fijo === false} onClick={() => setR(x => ({ ...x, fijo: false }))} titulo="No" ayuda="Gana solo por lo que logra" />
                </div>
            </div>
            {r.fijo != null && (
                <div>
                    <p className="text-xs font-bold text-slate-600 mb-1.5">2. ¿Cómo quieres premiar lo que vende?</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Opcion activo={r.premio === 'pct'} onClick={() => setR(x => ({ ...x, premio: 'pct' }))} titulo="Un % de lo que cobra" ayuda="Gana más mientras más cobra" />
                        <Opcion activo={r.premio === 'usd'} onClick={() => setR(x => ({ ...x, premio: 'usd', sube: undefined }))} titulo="Dólares al llegar a metas" ayuda="Montos fijos por escalones" />
                        <Opcion activo={r.premio === 'ambos'} onClick={() => setR(x => ({ ...x, premio: 'ambos' }))} titulo="Las dos cosas" ayuda="Un % y además premios en dólares" />
                    </div>
                </div>
            )}
            {conPct && (
                <div>
                    <p className="text-xs font-bold text-slate-600 mb-1.5">3. ¿El % sube si vende más?</p>
                    <div className="grid grid-cols-2 gap-2">
                        <Opcion activo={r.sube === false} onClick={() => setR(x => ({ ...x, sube: false }))} titulo="No, siempre igual" ayuda="Comisión fija: fácil de explicar" />
                        <Opcion activo={r.sube === true} onClick={() => setR(x => ({ ...x, sube: true }))} titulo="Sí, por niveles" ayuda="Más % al pasar la meta" />
                    </div>
                </div>
            )}
            {listo && (
                <button type="button" onClick={() => onArmar(r)}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-bold text-sm py-2.5 rounded-xl active:opacity-80">
                    <Check size={16} /> Armar el esquema
                </button>
            )}
        </div>
    );
}

// ─── Una pieza puesta ────────────────────────────────────────────────────────
function PiezaPuesta({ id, config, setConfig, abierta, onToggle, onQuitar, monto, avisos, onArreglo }) {
    const p = pieza(id);
    const t = tonoDePieza(id);
    const Icono = ICONO_GRUPO[p.grupo];
    const hayError = avisos.some(a => a.nivel === 'error');
    return (
        <div className={`rounded-2xl border ${hayError ? 'border-red-300 bg-red-50/40' : t.card}`}>
            <div className="flex items-center gap-2 p-2.5">
                <button type="button" onClick={onToggle} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                    <Icono size={18} className={`${t.icono} shrink-0`} />
                    <div className="min-w-0 flex-1">
                        <p className={`text-sm font-black leading-tight ${t.titulo}`}>{p.nombre}</p>
                        <p className="text-[11px] text-slate-500 leading-snug truncate">{p.resumen(config) || p.para}</p>
                    </div>
                    {monto != null && <span className={`text-xs font-black px-2 py-0.5 rounded-full shrink-0 ${t.chip}`}>{money(monto)}</span>}
                    {abierta ? <ChevronDown size={16} className="text-slate-400 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
                </button>
                <button type="button" onClick={onQuitar} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-white shrink-0" aria-label={`Quitar ${p.nombre}`}><X size={16} /></button>
            </div>
            {avisos.length > 0 && <div className="px-2.5 pb-2 space-y-1.5">{avisos.map((a, i) => <Aviso key={i} a={a} onArreglo={onArreglo} />)}</div>}
            {abierta && (
                <div className="px-2.5 pb-3 space-y-2">
                    <p className="text-xs text-slate-500 leading-snug">{p.para}</p>
                    {p.campos && (
                        <div className="bg-white rounded-xl border border-slate-200 px-3">
                            {p.campos.map(f => (
                                <Fila key={f.k} label={f.label} ayuda={f.ayuda}>
                                    <Numero value={leerCampo(config, f.k)} onChange={v => setConfig(c => ponerCampo(c, f.k, v))} sufijo={f.sufijo} />
                                </Fila>
                            ))}
                        </div>
                    )}
                    {p.editor === 'niveles' && <EditorNiveles config={config} setConfig={setConfig} />}
                    {p.editor === 'escalones-retail' && <EditorEscalones config={config} setConfig={setConfig} medida="retail" />}
                    {p.editor === 'escalones-food' && <EditorEscalones config={config} setConfig={setConfig} medida="food" />}
                    {p.editor === 'arranque' && <EditorArranque config={config} setConfig={setConfig} />}
                </div>
            )}
        </div>
    );
}

// Fuera del simulador: si se definiera adentro, React lo volvería a montar en cada
// cambio y el deslizador se soltaría a mitad del arrastre.
function Deslizar({ label, k, esc, setEsc, max = 150, paso = 5, sufijo = '%', detalle }) {
    const valor = esc[k];
    return (
        <div>
            <div className="flex items-baseline justify-between text-xs">
                <span className="font-bold text-slate-600">{label}</span>
                <span className="font-black text-slate-800">{valor}{sufijo} {detalle && <span className="font-normal text-slate-400">{detalle}</span>}</span>
            </div>
            <input type="range" min={0} max={max} step={paso} value={valor} onChange={e => setEsc(x => ({ ...x, [k]: Number(e.target.value) }))}
                className="w-full accent-[#0D2B4C]" />
        </div>
    );
}

// ─── Simulador ───────────────────────────────────────────────────────────────
function Simulador({ config, activas }) {
    const [esc, setEsc] = useState({ pctMeta: 100, pctKg: 100, semanas: 4, crecio: true, aTiempoPct: 100, heredadoUSD: 0 });
    const s = useMemo(() => simularEsquema(config, esc), [config, esc]);
    const curva = useMemo(() => curvaEsquema(config, [0, 50, 80, 90, 100, 110, 120, 150], esc), [config, esc]);
    const maxCurva = Math.max(1, ...curva.map(c => c.total));
    const tiene = (id) => activas.includes(id);
    const conFood = tiene('foodPct') || tiene('foodNivel') || tiene('foodCrec');
    const conAct = tiene('activacionUSD') || tiene('activacionPct');
    const conCrec = tiene('crecimiento') || tiene('foodCrec');
    return (
        <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-3">
                <Deslizar label="Cuánto de la meta logra" k="pctMeta" detalle={`(${uds(s.unidades)} uds)`} esc={esc} setEsc={setEsc} />
                {conFood && <Deslizar label="Foodservice: cuánto de su meta en kg" k="pctKg" detalle={`(${String(s.kg).replace('.', ',')} kg)`} esc={esc} setEsc={setEsc} />}
                {conAct && (
                    <div>
                        <p className="text-xs font-bold text-slate-600 mb-1">Semanas en que activó su cartera</p>
                        <div className="grid grid-cols-5 gap-1.5">
                            {[0, 1, 2, 3, 4].map(w => (
                                <button key={w} type="button" onClick={() => setEsc(x => ({ ...x, semanas: w }))}
                                    className={`py-1.5 rounded-lg text-sm font-bold ${esc.semanas === w ? 'bg-[#0D2B4C] text-white' : 'bg-slate-100 text-slate-600'}`}>{w}/4</button>
                            ))}
                        </div>
                    </div>
                )}
                {conCrec && (
                    <div className="flex items-center gap-2">
                        <span className="flex-1 text-xs font-bold text-slate-600">¿Vendió más que el mes anterior?</span>
                        {[[true, 'Sí'], [false, 'No']].map(([v, t]) => (
                            <button key={t} type="button" onClick={() => setEsc(x => ({ ...x, crecio: v }))}
                                className={`px-3 py-1.5 rounded-lg text-sm font-bold ${esc.crecio === v ? 'bg-[#0D2B4C] text-white' : 'bg-slate-100 text-slate-600'}`}>{t}</button>
                        ))}
                    </div>
                )}
                {tiene('cobranza') && <Deslizar label="Lo que cobra a tiempo" k="aTiempoPct" max={100} esc={esc} setEsc={setEsc} />}
                {tiene('recuperadas') && (
                    <div className="flex items-center gap-2">
                        <span className="flex-1 text-xs font-bold text-slate-600">Cobrado de facturas heredadas</span>
                        <Numero value={esc.heredadoUSD} onChange={v => setEsc(x => ({ ...x, heredadoUSD: v }))} sufijo="USD" />
                    </div>
                )}
            </div>

            {/* Resultado */}
            <div className="bg-[#0D2B4C] rounded-2xl p-4 text-white">
                <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold">En este escenario gana</p>
                <p className="text-4xl font-black leading-none my-1">{money2(s.total)}</p>
                <p className="text-xs text-white/70">
                    {s.fijo > 0 && <>{money(s.fijo)} fijo + {money(s.variable)} variable · </>}
                    {s.ventas > 0 ? <>vende {money(s.ventas)}; le cuesta a la empresa el <b className="text-white">{String(s.costoPct).replace('.', ',')} %</b></> : 'sin ventas'}
                </p>
                {s.total > 0 && (
                    <div className="flex h-2.5 rounded-full overflow-hidden mt-3 bg-white/10">
                        {s.lineas.map((l, i) => l.monto > 0 && (
                            <div key={l.id} className={COLOR_LINEA[i % COLOR_LINEA.length]} style={{ width: `${l.monto / s.total * 100}%` }} title={l.nombre} />
                        ))}
                    </div>
                )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
                {s.lineas.length === 0 && <p className="p-3 text-sm text-slate-400">Agrega piezas para ver cuánto ganaría.</p>}
                {s.lineas.map((l, i) => (
                    <div key={l.id} className="flex items-center gap-2.5 px-3 py-2">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${COLOR_LINEA[i % COLOR_LINEA.length]}`} />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-700 leading-tight">{l.nombre}</p>
                            <p className="text-[11px] text-slate-400 leading-snug">{l.detalle}</p>
                        </div>
                        <span className={`text-sm font-black ${l.monto > 0 ? 'text-slate-800' : 'text-slate-300'}`}>{money2(l.monto)}</span>
                    </div>
                ))}
            </div>

            {/* Curva: cuánto gana según lo que logre */}
            <div className="bg-white rounded-2xl border border-slate-200 p-3">
                <p className="text-xs font-bold text-slate-600 mb-2">Cuánto gana según lo que logre de la meta <span className="font-normal text-slate-400">(toca una barra)</span></p>
                <div className="flex items-end gap-1.5 h-28">
                    {curva.map(c => (
                        <button key={c.pctMeta} type="button" onClick={() => setEsc(x => ({ ...x, pctMeta: c.pctMeta, pctKg: c.pctMeta }))}
                            className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                            <span className="text-[10px] font-bold text-slate-600">{money(c.total)}</span>
                            <span className={`w-full rounded-t-md ${c.pctMeta === esc.pctMeta ? 'bg-[#0D2B4C]' : c.pctMeta === 100 ? 'bg-emerald-400' : 'bg-slate-300'}`}
                                style={{ height: `${Math.max(3, c.total / maxCurva * 75)}%` }} />
                            <span className={`text-[10px] ${c.pctMeta === 100 ? 'font-black text-emerald-700' : 'text-slate-400'}`}>{c.pctMeta}%</span>
                        </button>
                    ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">Con lo demás como lo pusiste arriba (semanas, crecimiento, cobranza). Un mes completo, al precio por unidad.</p>
            </div>
        </div>
    );
}

// ─── Componente principal ────────────────────────────────────────────────────
const CommissionConstructor = forwardRef(({ vendedor, onClose }, ref) => {
    const [esquemas, setEsquemas]     = useState([{ desde: null, config: aFormulario() }]);
    const [slot, setSlot]             = useState(0);
    const [nuevoDesde, setNuevoDesde] = useState(null);
    const config = esquemas[slot]?.config || esquemas[0].config;
    const setConfig = (fn) => setEsquemas(es => es.map((e, i) => i === slot
        ? { ...e, config: typeof fn === 'function' ? fn(e.config) : fn } : e));
    const [loading, setLoading]   = useState(true);
    const [saving, setSaving]     = useState(false);
    const [error, setError]       = useState('');
    const [aviso, setAviso]       = useState('');
    const [showProposal, setShowProposal] = useState(false);
    const [vendedorName, setVendedorName] = useState(vendedor.name || vendedor.nombre || 'Vendedor');
    const [abierta, setAbierta]   = useState(null);
    const [verGuia, setVerGuia]   = useState(false);
    const [verModelos, setVerModelos] = useState(false);
    const [verReglas, setVerReglas] = useState(false);
    const [arrastrando, setArrastrando] = useState(false);
    const [verCatalogo, setVerCatalogo] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const snap = await getDoc(doc(db, 'users_metadata', vendedor.id));
                if (snap.exists()) {
                    const userData = snap.data();
                    if (userData.name) setVendedorName(userData.name);
                    const lista = esquemasComision(userData).map(e => ({ desde: e.desde, config: aFormulario(e.config) }));
                    setEsquemas(lista);
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

    const activas = useMemo(() => piezasActivas(config), [config]);
    const avisos = useMemo(() => avisosEsquema(config), [config]);
    const sim100 = useMemo(() => simularEsquema(config), [config]);
    const montoDe = (id) => sim100.lineas.find(l => l.id === id)?.monto ?? null;

    const handleSave = async () => {
        // Un error en cualquier esquema no deja guardar.
        const malo = esquemas.findIndex(e => avisosEsquema(e.config).some(a => a.nivel === 'error'));
        if (malo >= 0) {
            setSlot(malo);
            setError('Hay algo que corregir antes de guardar (en rojo). Cada aviso trae su arreglo.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const [primero, ...cambios] = esquemas.map(e => ({ ...e, config: limpiarEsquema(e.config) }));
            await updateDoc(doc(db, 'users_metadata', vendedor.id), {
                commissionConfig: primero.config,
                metaMensual: primero.config.metaMensual,
                commissionConfigCambios: cambios.map(e => ({ desde: e.desde, config: e.config })),
            });
            onClose();
        } catch (e) {
            setError('No se pudo guardar: ' + e.message);
            setSaving(false);
        }
    };
    useImperativeHandle(ref, () => ({ save: handleSave, saving }), [saving, esquemas]);

    // Esquemas por fecha.
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

    // Piezas.
    const poner = (id) => {
        if (activas.includes(id)) { setAbierta(id); return; }
        const otra = (pieza(id).excluye || []).find(x => activas.includes(x));
        setConfig(c => agregarPieza(c, id));
        setAbierta(id);
        setVerCatalogo(false);
        setAviso(otra ? `Puse «${pieza(id).nombre}» y quité «${pieza(otra).nombre}»: solo puede haber una comisión %.` : `Puse «${pieza(id).nombre}» con valores de ejemplo: ajústalos y míralo en el paso 3.`);
    };
    const quitar = (id) => {
        setConfig(c => quitarPieza(c, id));
        if (abierta === id) setAbierta(null);
        setAviso(`Quité «${pieza(id).nombre}».`);
    };
    const armar = (r) => {
        const ids = piezasDeRespuestas(r);
        setConfig(c => aplicarModelo(c, { piezas: ids, cambios: r.premio !== 'pct' ? { baseUnidades: 'cobradas' } : {} }));
        setVerGuia(false);
        setAbierta(ids.find(x => x !== 'fijo') || ids[0]);
        setAviso('Listo. Revisa los montos de cada pieza (tócala para abrirla) y pruébalo en el paso 3.');
    };
    const usarModelo = (m) => {
        if (activas.length && !window.confirm(`¿Cambiar las piezas por el modelo «${m.nombre}»? La meta y los precios se quedan. Nada se guarda hasta tocar Guardar.`)) return;
        setConfig(c => aplicarModelo(c, m));
        setVerModelos(false);
        setAbierta(null);
        setAviso(`Modelo «${m.nombre}» puesto. Ajusta los montos y pruébalo.`);
    };
    const arreglar = (x) => { setConfig(c => x.aplicar(c)); setAviso('Arreglado.'); };

    useEffect(() => { if (!aviso) return undefined; const t = setTimeout(() => setAviso(''), 5000); return () => clearTimeout(t); }, [aviso]);

    if (loading) return <div className="flex items-center justify-center py-16"><LoadingSpinner /></div>;

    const avisosDePieza = (id) => avisos.filter(a => a.pieza === id);
    const avisosGenerales = avisos.filter(a => !a.pieza || !activas.includes(a.pieza));
    const errores = avisos.filter(a => a.nivel === 'error').length;
    const sinPiezas = activas.length === 0;
    const metaSet = (v) => setConfig(p => ({ ...p, metaMensual: v, arranque: (p.arranque || []).map(a => ({ ...a, meta: Math.round(v * n(a.pct) / 100) })) }));

    return (
        <div className="w-full" style={{ overflowX: 'hidden', touchAction: 'pan-y' }}>
            <div className="px-4 pt-4 pb-6 space-y-6">

                {/* Resumen fijo arriba: lo que gana al 100 % y si falta corregir algo. */}
                <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-white/95 backdrop-blur border-b border-slate-100 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Al 100 % de la meta gana</p>
                        <p className="text-xl font-black text-slate-800 leading-none">{money(sim100.total)} <span className="text-xs font-semibold text-slate-400">al mes{sim100.costoPct != null && sim100.ventas > 0 ? ` · ${String(sim100.costoPct).replace('.', ',')} % de lo vendido` : ''}</span></p>
                    </div>
                    {errores > 0
                        ? <span className="text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-1 shrink-0">{errores} por corregir</span>
                        : <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 shrink-0 flex items-center gap-1"><Check size={12} /> Listo</span>}
                </div>

                {error && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span>
                    </div>
                )}
                {aviso && (
                    <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-2.5 text-xs">
                        <Check size={14} className="mt-0.5 shrink-0" /><span>{aviso}</span>
                    </div>
                )}

                {/* Esquemas por fecha */}
                <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Esquema que estás editando</p>
                    <div className="flex flex-wrap gap-2">
                        {esquemas.map((e, i) => (
                            <button key={e.desde || 'inicio'} type="button" onClick={() => { setSlot(i); setAbierta(null); }}
                                className={`text-left px-3 py-2 rounded-lg border text-xs font-semibold ${i === slot ? 'bg-[#0D2B4C] text-white border-[#0D2B4C]' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                                {etiquetaEsquema(i)}
                                <span className={`block text-[10px] font-normal ${i === slot ? 'text-white/70' : 'text-slate-400'}`}>
                                    {piezasActivas(e.config).length} piezas{i === idxVigente ? ' · vigente hoy' : fechaLocal(e.desde) > new Date() ? ' · programado' : ''}
                                </span>
                            </button>
                        ))}
                    </div>
                    {nuevoDesde === null ? (
                        <button type="button" onClick={() => setNuevoDesde(primeroDelMesSiguiente())} className="flex items-center gap-1 text-xs font-semibold text-blue-600">
                            <Plus size={13} /> Cambiar el esquema desde una fecha
                        </button>
                    ) : (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 space-y-2">
                            <p className="text-xs text-slate-600">El nuevo esquema rige para los meses que <b>empiezan</b> desde esta fecha. Lo anterior no se toca, y lo facturado antes se paga con su esquema aunque se cobre después.</p>
                            <div className="flex items-center gap-2">
                                <input type="date" value={nuevoDesde} onChange={e => setNuevoDesde(e.target.value)} className="min-w-0 flex-1 p-2 border border-slate-200 rounded-lg text-sm bg-white" />
                                <button type="button" onClick={crearCambio} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold">Crear</button>
                                <button type="button" onClick={() => setNuevoDesde(null)} className="px-2 py-2 text-xs text-slate-500">Cancelar</button>
                            </div>
                        </div>
                    )}
                    {slot === 0 && <p className="text-[11px] text-slate-500 leading-snug">Corregir este esquema recalcula los meses que no estén congelados. Para que un cambio rija solo desde una fecha, usa «Cambiar el esquema desde una fecha».</p>}
                    {slot > 0 && (
                        <button type="button" onClick={() => quitarCambio(slot)} className="flex items-center gap-1 text-xs font-semibold text-red-600"><Trash2 size={13} /> Quitar este cambio</button>
                    )}
                </div>

                {/* ① La meta */}
                <Paso n={1} titulo="La meta del mes" ayuda="Con esto se miden los escalones, los niveles y el simulador.">
                    <div className="bg-white border border-slate-200 rounded-xl px-3">
                        <Fila label="Meta de retail" ayuda="Unidades de 250 g al mes"><Numero value={config.metaMensual} onChange={metaSet} sufijo="uds" grande ancho="w-24" /></Fila>
                        <Fila label="Precio por unidad" ayuda="Para pasar unidades a dólares cobrados"><Numero value={config.precioUnidad} onChange={v => setConfig(p => ({ ...p, precioUnidad: v }))} sufijo="USD" /></Fila>
                        <Fila label="Meta de foodservice" ayuda="Kg de queso al mes. 0 si no vende foodservice."><Numero value={config.metaKgFoodservice} onChange={v => setConfig(p => ({ ...p, metaKgFoodservice: v }))} sufijo="kg" /></Fila>
                    </div>
                    <p className="text-xs font-bold text-slate-600 mt-3 mb-1.5">¿Qué unidades cuentan para la meta y los premios?</p>
                    <div className="grid grid-cols-2 gap-2">
                        {[['cobradas', 'Las cobradas', 'Solo cuando el cliente paga. Lo más seguro.'], ['facturadas', 'Las facturadas', 'Al facturar, aunque no se haya cobrado.']].map(([k, t, h]) => {
                            const on = (config.baseUnidades || 'facturadas') === k;
                            return (
                                <button key={k} type="button" onClick={() => setConfig(p => ({ ...p, baseUnidades: k }))}
                                    className={`text-left p-2.5 rounded-xl border ${on ? 'bg-emerald-50 border-emerald-400' : 'bg-white border-slate-200'}`}>
                                    <p className={`text-sm font-bold ${on ? 'text-emerald-800' : 'text-slate-700'}`}>{on && '✓ '}{t}</p>
                                    <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{h}</p>
                                </button>
                            );
                        })}
                    </div>
                    <button type="button" onClick={() => setVerReglas(v => !v)} className="flex items-center gap-1 text-xs font-semibold text-slate-500 mt-2">
                        {verReglas ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Más reglas
                    </button>
                    {verReglas && (
                        <div className="bg-white border border-slate-200 rounded-xl px-3 mt-1.5">
                            <Fila label="Días máximos para cobrar" ayuda="Si el cliente tarda más, esa factura no paga comisión."><Numero value={config.facturaMaxDias} onChange={v => setConfig(p => ({ ...p, facturaMaxDias: v }))} sufijo="días" /></Fila>
                            <Fila label="Precio por unidad en foodservice" ayuda="Unidad de 250 g; para el simulador."><Numero value={config.precioUnidadFoodservice} onChange={v => setConfig(p => ({ ...p, precioUnidadFoodservice: v }))} sufijo="USD" /></Fila>
                        </div>
                    )}
                </Paso>

                {/* ② Las piezas */}
                <Paso n={2} titulo="Cómo gana" ayuda="Agrega las piezas que quieras. Tócalas para ajustar, ✕ para quitar."
                    derecha={!sinPiezas && !verGuia && (
                        <button type="button" onClick={() => setVerGuia(true)} className="flex items-center gap-1 text-xs font-bold text-[#0D2B4C] bg-[#0D2B4C]/5 px-2.5 py-1.5 rounded-lg shrink-0"><Wand2 size={13} /> Guíame</button>
                    )}>
                    {(sinPiezas || verGuia) && <div className="mb-3"><Guia onArmar={armar} onCerrar={sinPiezas ? null : () => setVerGuia(false)} /></div>}

                    {avisosGenerales.length > 0 && <div className="space-y-1.5 mb-3">{avisosGenerales.map((a, i) => <Aviso key={i} a={a} onArreglo={arreglar} />)}</div>}

                    {/* El esquema: zona donde caen las piezas */}
                    <div
                        onDragOver={e => { e.preventDefault(); setArrastrando(true); }}
                        onDragLeave={() => setArrastrando(false)}
                        onDrop={e => { e.preventDefault(); setArrastrando(false); const id = e.dataTransfer.getData('text/plain'); if (pieza(id)) poner(id); }}
                        className={`rounded-2xl border-2 border-dashed p-2 space-y-2 transition-colors ${arrastrando ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50/60'}`}>
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 px-1 pt-1">Su esquema{!sinPiezas && <span className="normal-case tracking-normal font-normal"> · lo que gana al 100 % de la meta</span>}</p>
                        {sinPiezas && <p className="text-sm text-slate-400 text-center py-4">Todavía no tiene piezas. Responde las tres preguntas o agrega piezas de abajo.</p>}
                        {activas.map(id => (
                            <PiezaPuesta key={id} id={id} config={config} setConfig={setConfig}
                                abierta={abierta === id} onToggle={() => setAbierta(a => (a === id ? null : id))}
                                onQuitar={() => quitar(id)} monto={montoDe(id)} avisos={avisosDePieza(id)} onArreglo={arreglar} />
                        ))}
                    </div>

                    {/* Catálogo */}
                    {!sinPiezas && !verCatalogo && (
                        <button type="button" onClick={() => setVerCatalogo(true)}
                            className="w-full mt-3 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-[#0D2B4C]/30 text-[#0D2B4C] font-bold text-sm active:bg-slate-50">
                            <Plus size={16} /> Agregar una pieza
                        </button>
                    )}
                    {(sinPiezas || verCatalogo) && <>
                    <div className="flex items-center mt-4 mb-2">
                    <p className="flex-1 text-xs font-black text-slate-700">Piezas para agregar <span className="font-normal text-slate-400">(tócalas{typeof window !== 'undefined' && window.matchMedia?.('(pointer:fine)').matches ? ' o arrástralas' : ''})</span></p>
                    {!sinPiezas && <button type="button" onClick={() => setVerCatalogo(false)} className="text-xs font-bold text-slate-500 px-2 py-1">Cerrar</button>}
                    </div>
                    <div className="space-y-3">
                        {GRUPOS.map(g => {
                            const libres = PIEZAS.filter(p => p.grupo === g.id && !activas.includes(p.id));
                            if (!libres.length) return null;
                            const t = TONO[g.color];
                            const Icono = ICONO_GRUPO[g.id];
                            return (
                                <div key={g.id}>
                                    <p className={`text-[11px] font-black flex items-center gap-1 ${t.icono}`}><Icono size={13} /> {g.nombre}</p>
                                    <p className="text-[11px] text-slate-400 mb-1.5">{g.ayuda}</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {libres.map(p => (
                                            <button key={p.id} type="button" draggable onDragStart={e => e.dataTransfer.setData('text/plain', p.id)} onClick={() => poner(p.id)}
                                                className="text-left flex items-start gap-2 p-2.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 active:bg-slate-50 cursor-grab">
                                                <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${t.chip}`}><Plus size={14} /></span>
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-bold text-slate-700 leading-tight">{p.nombre}</span>
                                                    <span className="block text-[11px] text-slate-400 leading-snug mt-0.5">{p.para}</span>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    </>}

                    <button type="button" onClick={() => setVerModelos(v => !v)} className="flex items-center gap-1 text-xs font-semibold text-slate-500 mt-4">
                        {verModelos ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Empezar desde un modelo
                    </button>
                    {verModelos && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
                            {MODELOS.map(m => (
                                <button key={m.id} type="button" onClick={() => usarModelo(m)} className="text-left p-2.5 rounded-xl border border-slate-200 bg-white active:bg-slate-50">
                                    <p className="text-sm font-bold text-slate-700">{m.nombre}</p>
                                    <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{m.descripcion}</p>
                                    <p className="text-[10px] text-slate-500 mt-1">{m.piezas.map(id => pieza(id).nombre).join(' + ')}</p>
                                </button>
                            ))}
                        </div>
                    )}
                </Paso>

                {/* ③ Pruébalo */}
                <Paso n={3} titulo="Pruébalo" ayuda="Mueve el escenario y mira cuánto ganaría y de dónde sale cada dólar.">
                    <Simulador config={config} activas={activas} />
                </Paso>

                <button type="button" onClick={() => setShowProposal(true)}
                    className="w-full flex items-center justify-center gap-2 bg-[#0D2B4C] hover:bg-[#123a63] text-white font-bold text-sm py-3 rounded-xl active:opacity-80">
                    <FileText size={16} /> Ver / Descargar propuesta para el vendedor (PDF)
                </button>
            </div>

            {showProposal && <CommissionProposalDoc config={config} vendedorName={vendedorName} onClose={() => setShowProposal(false)} />}
        </div>
    );
});

CommissionConstructor.displayName = 'CommissionConstructor';
export default CommissionConstructor;
