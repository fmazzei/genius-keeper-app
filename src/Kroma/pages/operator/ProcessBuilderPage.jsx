import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useKroma } from '../../KromaContext';
import {
    Workflow, Plus, X, ChevronUp, ChevronDown, Edit2, Trash2, Loader,
    Thermometer, Snowflake, FlaskConical, Clock, Scissors, RotateCcw,
    Droplets, ArrowDown, Waves, CalendarDays, Package, CheckCircle2,
    TestTube, Timer, Repeat, Pencil,
    Scale, Box, Lock, Layers, AlertTriangle, RefreshCw,
    Disc, ChevronsDown,
} from 'lucide-react';
import { PillGroup } from '../admin/ProductCatalogPage';

// ─── Constants ────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);

const BLOCK_TYPES = [
    // ── Temperatura ──
    { id: 'pasteurizacion',  label: 'Pasteurización',    Icon: Thermometer,  color: 'text-orange-400',  bg: 'bg-orange-500/20',  border: 'border-orange-500/30' },
    { id: 'enfriamiento',    label: 'Enfriamiento',      Icon: Snowflake,    color: 'text-cyan-400',    bg: 'bg-cyan-500/20',    border: 'border-cyan-500/30' },
    // ── Ingredientes ──
    { id: 'agregar_insumo',  label: 'Agregar Insumo',   Icon: TestTube,     color: 'text-teal-400',    bg: 'bg-teal-500/20',    border: 'border-teal-500/30' },
    { id: 'inoculacion',     label: 'Inoculación',       Icon: FlaskConical, color: 'text-violet-400',  bg: 'bg-violet-500/20',  border: 'border-violet-500/30' },
    { id: 'cuajado',         label: 'Cuajado',           Icon: Clock,        color: 'text-amber-400',   bg: 'bg-amber-500/20',   border: 'border-amber-500/30' },
    // ── Agitación y reposo ──
    { id: 'agitacion_simple',label: 'Agitación',         Icon: Repeat,       color: 'text-lime-400',    bg: 'bg-lime-500/20',    border: 'border-lime-500/30' },
    { id: 'reposo',          label: 'Reposo / Espera',   Icon: Timer,        color: 'text-slate-300',   bg: 'bg-slate-600/40',   border: 'border-slate-500/40' },
    // ── Proceso físico ──
    { id: 'corte',           label: 'Corte de Cuajada',  Icon: Scissors,     color: 'text-red-400',     bg: 'bg-red-500/20',     border: 'border-red-500/30' },
    { id: 'agitacion',       label: 'Agitación/Cocción', Icon: RotateCcw,    color: 'text-orange-400',  bg: 'bg-orange-500/20',  border: 'border-orange-500/30' },
    { id: 'desuerado',       label: 'Desuerado',         Icon: Droplets,     color: 'text-blue-400',    bg: 'bg-blue-500/20',    border: 'border-blue-500/30' },
    { id: 'moldeado',        label: 'Moldeado',          Icon: Disc,         color: 'text-purple-400',  bg: 'bg-purple-500/20',  border: 'border-purple-500/30' },
    { id: 'pre_prensa',      label: 'Pre-Prensa',        Icon: ChevronsDown, color: 'text-slate-300',   bg: 'bg-slate-600/30',   border: 'border-slate-500/30' },
    { id: 'prensado',        label: 'Prensado',          Icon: ArrowDown,    color: 'text-slate-400',   bg: 'bg-slate-600/30',   border: 'border-slate-500/30' },
    { id: 'salado',          label: 'Salado',            Icon: Waves,        color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/30' },
    { id: 'maduracion',      label: 'Maduración/Curado', Icon: CalendarDays, color: 'text-amber-400',   bg: 'bg-amber-500/20',   border: 'border-amber-500/30' },
    // ── Finalización ──
    { id: 'empaque', label: 'Empaque', Icon: Package, color: 'text-blue-400', bg: 'bg-blue-500/20', border: 'border-blue-500/30' },
    // Legacy sub-blocks — kept for display backward compat, hidden from Add modal
    { id: 'pesaje',             label: 'Pesaje',             Icon: Scale,   color: 'text-yellow-400',  bg: 'bg-yellow-500/20',   border: 'border-yellow-500/30',  deprecated: true },
    { id: 'envasado',           label: 'Envasado',           Icon: Box,     color: 'text-sky-400',     bg: 'bg-sky-500/20',      border: 'border-sky-500/30',     deprecated: true },
    { id: 'precintado',         label: 'Precintado',         Icon: Lock,    color: 'text-rose-400',    bg: 'bg-rose-500/20',     border: 'border-rose-500/30',    deprecated: true },
    { id: 'empaque_secundario', label: 'Empaque Secundario', Icon: Layers,  color: 'text-indigo-400',  bg: 'bg-indigo-500/20',   border: 'border-indigo-500/30',  deprecated: true },
    // ── Personalizado ──
    { id: 'personalizado',   label: 'Personalizado',     Icon: Pencil,       color: 'text-slate-400',   bg: 'bg-slate-700/50',   border: 'border-slate-600/50' },
];

const BLOCK_DEFAULTS = {
    pasteurizacion:  { metodo: 'htlv', tempMax: 72, tempSalidaMin: 4, tempSalidaMax: 8, tiempoSostenimiento: 15, unidadTiempo: 'seg' },
    enfriamiento:    { temperaturaObjetivo: 22 },
    agregar_insumo:  { materialId: '', materialNombre: '', metodoAplicacion: 'mezclado', agitar: 'si', tiempoAgitacion: 5, unidadAgitacion: 'min', reposar: 'no', tiempoReposo: 30, unidadReposo: 'min', tempReposo: 0 },
    inoculacion:     { tipoCultivo: 'mesofilico', temperatura: 22, tiempoIncubacion: 12, unidadTiempo: 'h' },
    cuajado: {
        tempPreCuajado: 22, phPreCuajado: 6.6, tipoCoagulacion: 'enzimatica',
        calcio: 'si', calcioAgitar: 5, calcioAgitarUnidad: 'min',
        conservante: 'no', conservanteNombre: '', conservanteAgitar: 5, conservanteAgitarUnidad: 'min',
        cuajoTipo: 'microbiano', cuajoAgitar: 3, cuajoAgitarUnidad: 'min',
        fermento: 'si', tipoFermento: 'mesofilico', tempInoculacion: 22, fermentoAgitar: 5, fermentoAgitarUnidad: 'min',
        tiempoCoagulacion: 14, unidadTiempoCoagulacion: 'h', tempCoagulacion: 22,
    },
    agitacion_simple:{ intensidad: 'suave', duracion: 5, unidadTiempo: 'min' },
    reposo:          { duracion: 30, unidadTiempo: 'min', tipoTemp: 'ambiente', temperatura: 22 },
    corte:           { tamanoGrano: 'maiz', tipoCorte: 'manual', agitarPostCorte: 'si', tiempoAgitacion: 10, unidadAgitacion: 'min', temperatura: 38, phAcidificacion: 6.2 },
    agitacion:       { tipo: 'agitacion', temperaturaObjetivo: 38, tiempo: 30, unidadTiempo: 'min' },
    desuerado:       { metodo: 'gravedad', conMoldes: 'si', tiempo: 12, unidadTiempo: 'h', temperaturaAmbiente: 18, phPost: 5.8 },
    moldeado:        { tipoMolde: 'cilindrico', numVueltas: 2, phPost: 5.8, temperaturaAmbiente: 18,
        vuelta1Tiempo: 30, vuelta1Unidad: 'min', vuelta2Tiempo: 30, vuelta2Unidad: 'min',
        vuelta3Tiempo: 30, vuelta3Unidad: 'min', vuelta4Tiempo: 30, vuelta4Unidad: 'min',
        vuelta5Tiempo: 30, vuelta5Unidad: 'min', comentarios: '' },
    pre_prensa:      { unidadPresion: 'kg_cm2', valorPresion: 5, tiempo: 15, unidadTiempo: 'min' },
    prensado:        { unidadPresion: 'kg_cm2', numVueltas: 2, vuelta1Presion: 10, vuelta1Tiempo: 30, vuelta1UnidadTiempo: 'min', vuelta2Presion: 20, vuelta2Tiempo: 60, vuelta2UnidadTiempo: 'min', vuelta3Presion: 30, vuelta3Tiempo: 120, vuelta3UnidadTiempo: 'min', vuelta4Presion: 40, vuelta4Tiempo: 240, vuelta4UnidadTiempo: 'min' },
    salado:          { metodo: 'superficie', concentracion: '20', temperatura: 12, tiempo: 12, unidadTiempo: 'h',
        cantidadSal: 20, unidadSal: 'g_por_kg',
        vuelta1Tiempo: 4, vuelta1Unidad: 'h', vuelta2Tiempo: 4, vuelta2Unidad: 'h',
        vuelta3Tiempo: 4, vuelta3Unidad: 'h', vuelta4Tiempo: 4, vuelta4Unidad: 'h' },
    maduracion:      { temperatura: 12, humedadRelativa: 90, duracion: 21, unidadDuracion: 'dias', virajes: 'cada2dias', cepillado: 'no', frecuenciaCepillado: 'semanal', phEntrada: 5.8, phSalida: 5.4 },
    empaque:            { tiposEmpaque: [], presentacionesPesos: ['250g'], aspersionConservante: false, aspersionMaterialId: '', aspersionMaterialNombre: '', aspersionGramos: 1.5, aspersionMlAgua: 500, aspersionMlPorEnvase: 1, precintado: false, envalado: false },
    // Legacy defaults — kept for backward compat with old saved processes
    pesaje:             { unidadPeso: 'kg', registrarRendimiento: 'si', rendimientoEsperado: 10 },
    envasado:           { tipoEnvase: 'tina_plastica', pesoNeto: 250, unidadPeso: 'g', temperatura: 'frio' },
    precintado:         { tipoPrecinto: 'termoencogible_cristal', aplicaEtiqueta: 'si' },
    empaque_secundario: { unidadesPorPack: 12, materialEmpaque: 'film_termoencogible' },
    personalizado:      { nombre: '', duracion: 5, unidadTiempo: 'min' },
};

const CAT_LABELS = {
    queso_fresco: 'Queso Fresco', queso_madurado: 'Queso Madurado',
    yogurt: 'Yogurt', mantequilla: 'Mantequilla', crema: 'Crema', otro: 'Otro',
};
const MILK_LABELS = { cabra: 'Cabra', vaca: 'Vaca', mixta: 'Mixta', oveja: 'Oveja' };
const CAT_STYLE = {
    queso_fresco: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    queso_madurado: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    yogurt: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    mantequilla: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    crema: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    otro: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};
const MILK_STYLE = {
    cabra: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    vaca: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    mixta: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    oveja: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

// ─── Block summary (human-readable) ──────────────────────────────────────────

function blockSummary(tipo, params) {
    if (!params) return '';
    switch (tipo) {
        case 'pasteurizacion': {
            const tMax = params.tempMax ?? params.temperatura ?? '?';
            const tMin = params.tempSalidaMin ?? '?';
            const tMax2 = params.tempSalidaMax ?? '?';
            const t = params.tiempoSostenimiento ?? params.tiempo ?? '?';
            return `${tMax}°C → ${tMin}–${tMax2}°C · ${t} ${params.unidadTiempo}`;
        }
        case 'enfriamiento':
            return `→ ${params.temperaturaObjetivo}°C`;
        case 'agregar_insumo': {
            const base = params.materialNombre || 'Insumo';
            const ml = { mezclado: '', superficie: 'superficie', aspersion: 'aspersión', inmersion: 'inmersión' };
            const metodo = params.metodoAplicacion && params.metodoAplicacion !== 'mezclado' ? ml[params.metodoAplicacion] : '';
            const parts = [base];
            if (metodo) parts.push(metodo);
            if (params.agitar === 'si' && (!params.metodoAplicacion || params.metodoAplicacion === 'mezclado')) {
                parts.push(`agitar ${params.tiempoAgitacion} ${params.unidadAgitacion || 'min'}`);
            }
            if (params.reposar === 'si') parts.push(`reposar ${params.tiempoReposo} ${params.unidadReposo}`);
            return parts.join(' · ');
        }
        case 'inoculacion': {
            const cl = { mesofilico: 'Mesófilo', termofilico: 'Termófilo', blend: 'Blend T/M' };
            return `${cl[params.tipoCultivo] || params.tipoCultivo} · ${params.temperatura}°C · ${params.tiempoIncubacion} ${params.unidadTiempo}`;
        }
        case 'cuajado': {
            // New unified format
            if (params.tipoCoagulacion !== undefined) {
                const tc = { lactica: 'Láctica', enzimatica: 'Enzimática' };
                const parts = [`${tc[params.tipoCoagulacion] || params.tipoCoagulacion} · ${params.tempPreCuajado}°C`];
                if (params.cuajoTipo) parts.push(params.cuajoTipo);
                if (params.tiempoCoagulacion) parts.push(`${params.tiempoCoagulacion} ${params.unidadTiempoCoagulacion}`);
                return parts.join(' · ');
            }
            // Legacy format
            const tl = { acido: 'Ácido', enzimatico: 'Enzimático', mixto: 'Mixto' };
            const ph = params.phObjetivo ? ` · pH ${Number(params.phObjetivo).toFixed(1)}` : '';
            return `${tl[params.tipo] || params.tipo} · ${params.temperatura}°C · ${params.tiempo} ${params.unidadTiempo}${ph}`;
        }
        case 'agitacion_simple': {
            const il = { suave: 'Suave', moderada: 'Moderada', vigorosa: 'Vigorosa' };
            return `${il[params.intensidad] || 'Suave'} · ${params.duracion} ${params.unidadTiempo}`;
        }
        case 'reposo': {
            const base = `${params.duracion} ${params.unidadTiempo}`;
            if (params.tipoTemp === 'controlada') return `${base} · ${params.temperatura}°C`;
            return `${base} · Ambiente`;
        }
        case 'corte': {
            const gl = { arroz: 'Arroz ~3mm', maiz: 'Maíz ~6mm', frijol_rojo: 'Frijol ~12mm', dado: 'Dado ~20mm' };
            const tc = { manual: 'Lira manual', mecanico: 'Mecánico' };
            const ph = params.phAcidificacion ? ` · pH ${Number(params.phAcidificacion).toFixed(1)}` : '';
            return `${gl[params.tamanoGrano] || params.tamanoGrano} · ${tc[params.tipoCorte] || params.tipoCorte}${ph}`;
        }
        case 'agitacion': {
            const tl = { agitacion: 'Agitación', coccion: 'Cocción' };
            return `${tl[params.tipo] || params.tipo} · → ${params.temperaturaObjetivo}°C · ${params.tiempo} ${params.unidadTiempo}`;
        }
        case 'moldeado': {
            const ml = { cilindrico: 'Cilíndrico', rectangular: 'Rectangular', corazon: 'Corazón', otro: 'Otro' };
            const ph = params.phPost ? ` · pH ${Number(params.phPost).toFixed(1)}` : '';
            const n = params.numVueltas || 1;
            return `${ml[params.tipoMolde] || params.tipoMolde} · ${n} vuelta${n !== 1 ? 's' : ''}${ph}`;
        }
        case 'desuerado': {
            const ml = { gravedad: 'Gravedad', prensado_suave: 'Prensado suave', prensado_fuerte: 'Prensado fuerte' };
            const ph = params.phPost ? ` · pH post ${Number(params.phPost).toFixed(1)}` : '';
            return `${ml[params.metodo] || params.metodo} · ${params.tiempo} ${params.unidadTiempo}${ph}`;
        }
        case 'pre_prensa': {
            const u = params.unidadPresion === 'psi' ? 'PSI' : 'kg/cm²';
            return `${params.valorPresion ?? '?'} ${u} · ${params.tiempo} ${params.unidadTiempo}`;
        }
        case 'prensado': {
            const n = params.numVueltas || 1;
            const u = params.unidadPresion === 'psi' ? 'PSI' : 'kg/cm²';
            const maxP = params[`vuelta${n}Presion`] ?? '?';
            return `${n} vuelta${n !== 1 ? 's' : ''} · hasta ${maxP} ${u}`;
        }
        case 'salado': {
            const sl = { superficie: 'Superficie', salmuera: 'En salmuera', masa: 'En masa' };
            let s = sl[params.metodo] || params.metodo;
            if (params.metodo === 'salmuera' && params.concentracion) s += ` ${params.concentracion}%`;
            return s;
        }
        case 'maduracion': {
            const cep = params.cepillado === 'si' ? ` · Cepillado ${params.frecuenciaCepillado || ''}` : '';
            const phS = params.phSalida ? ` · pH salida ${Number(params.phSalida).toFixed(1)}` : '';
            return `${params.temperatura}°C · HR ${params.humedadRelativa}% · ${params.duracion} ${params.unidadDuracion}${cep}${phS}`;
        }
        case 'pesaje': {
            const r = params.registrarRendimiento === 'si' ? ` · Rdto ~${params.rendimientoEsperado}%` : '';
            return `Pesaje en ${params.unidadPeso}${r}`;
        }
        case 'envasado': {
            const el = { tina_plastica: 'Tina plástica', frasco: 'Frasco', bolsa: 'Bolsa', molde: 'Molde', otro: 'Otro' };
            return `${el[params.tipoEnvase] || params.tipoEnvase} · ${params.pesoNeto} ${params.unidadPeso}`;
        }
        case 'precintado': {
            const pl = {
                termoencogible_cristal: 'Termoencogible cristal',
                termoencogible_opaco:   'Termoencogible opaco',
                termosellado:           'Termosellado',
                cinta_adhesiva:         'Cinta adhesiva',
            };
            const etq = params.aplicaEtiqueta === 'si' ? ' · con etiqueta' : '';
            return `${pl[params.tipoPrecinto] || params.tipoPrecinto}${etq}`;
        }
        case 'empaque': {
            // New unified format
            if (params.tiposEmpaque !== undefined) {
                const pesos = (params.presentacionesPesos || []).join(', ');
                const extras = [
                    params.aspersionConservante && 'conservante',
                    params.precintado && 'precintado',
                    params.envalado && 'envalado',
                ].filter(Boolean).join('/');
                return [pesos || 'Sin presentaciones', extras].filter(Boolean).join(' · ');
            }
            // Legacy format
            const el = {
                al_vacio: 'Al vacío', film_stretch: 'Film stretch',
                papel_encerado: 'Papel encerado', bandeja_sellada: 'Bandeja sellada',
                atm_modificada: 'Atm. modificada',
            };
            return el[params.tipo] || params.tipo;
        }
        case 'empaque_secundario': {
            const ml = {
                film_termoencogible: 'Film termoencogible',
                caja_carton: 'Caja cartón',
                bolsa: 'Bolsa',
                bandeja: 'Bandeja',
            };
            return `${params.unidadesPorPack} und · ${ml[params.materialEmpaque] || params.materialEmpaque}`;
        }
        case 'personalizado':
            return params.nombre || 'Paso personalizado';
        default: return '';
    }
}

// ─── Param controls ───────────────────────────────────────────────────────────

const SecLabel = ({ children }) => (
    <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-3">{children}</p>
);

const SliderField = ({ label, value, min, max, step = 1, unit = '', decimals = 0, onChange }) => (
    <div>
        <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">{label}</span>
            <span className="text-emerald-400 font-bold text-sm tabular-nums">
                {decimals > 0 ? Number(value).toFixed(decimals) : value}{unit}
            </span>
        </div>
        <input
            type="range" min={min} max={max} step={step} value={value}
            onChange={e => {
                const v = Number(e.target.value);
                onChange(decimals > 0 ? parseFloat(v.toFixed(decimals)) : v);
            }}
            className="w-full h-3 rounded-full appearance-none cursor-pointer bg-slate-600"
            style={{ accentColor: '#10b981' }}
        />
        <div className="flex justify-between text-xs text-slate-600 mt-1">
            <span>{min}{unit}</span><span>{max}{unit}</span>
        </div>
    </div>
);

const StepperField = ({ label, value, min, max, step = 1, onChange }) => (
    <div>
        {label && <span className="block text-xs font-medium text-slate-400 mb-2">{label}</span>}
        <div className="flex items-center gap-3">
            <button type="button" onClick={() => onChange(Math.max(min, value - step))}
                className="w-11 h-11 bg-slate-600 hover:bg-slate-500 text-white rounded-xl flex items-center justify-center text-2xl font-bold transition-colors select-none">
                −
            </button>
            <span className="text-white font-bold text-2xl w-16 text-center tabular-nums">{value}</span>
            <button type="button" onClick={() => onChange(Math.min(max, value + step))}
                className="w-11 h-11 bg-slate-600 hover:bg-slate-500 text-white rounded-xl flex items-center justify-center text-2xl font-bold transition-colors select-none">
                +
            </button>
        </div>
    </div>
);

const TiempoRow = ({ value, unidad, onValueChange, onUnidadChange, min = 1, max = 120, units }) => {
    const UNITS = units || [{ id: 'min', label: 'min' }, { id: 'h', label: 'h' }];
    return (
        <div className="flex items-center gap-4 flex-wrap">
            <StepperField label="" value={value} min={min} max={max} onChange={onValueChange} />
            <PillGroup options={UNITS} value={unidad} onChange={v => v && onUnidadChange(v)} />
        </div>
    );
};

// ─── Block param editor (per tipo) ────────────────────────────────────────────

function BlockParamEditor({ tipo, params, setParams, materials = [], materialsLoading = false }) {
    const set = key => val => setParams(p => ({ ...p, [key]: val }));

    switch (tipo) {

        case 'pasteurizacion':
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Preajuste rápido</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'htlv',   label: 'HTLV (72°C / 15 seg)' },
                                { id: 'ltlt',   label: 'LTLT (63°C / 30 min)' },
                                { id: 'manual', label: 'Personalizado' },
                            ]}
                            value={params.metodo}
                            onChange={v => {
                                if (v === 'htlv') setParams({ metodo: 'htlv', tempMax: 72, tempSalidaMin: 4, tempSalidaMax: 8, tiempoSostenimiento: 15, unidadTiempo: 'seg' });
                                else if (v === 'ltlt') setParams({ metodo: 'ltlt', tempMax: 63, tempSalidaMin: 4, tempSalidaMax: 8, tiempoSostenimiento: 30, unidadTiempo: 'min' });
                                else setParams(p => ({ ...p, metodo: 'manual' }));
                            }}
                        />
                    </div>
                    <SliderField
                        label="Temperatura máxima (calentamiento)"
                        value={params.tempMax ?? 72} min={60} max={95} unit="°C"
                        onChange={v => setParams(p => ({ ...p, tempMax: v, metodo: 'manual' }))}
                    />
                    <div>
                        <SecLabel>Temperatura de salida — choque térmico</SecLabel>
                        <div className="grid grid-cols-2 gap-4">
                            <SliderField
                                label="Mínima"
                                value={params.tempSalidaMin ?? 22} min={2} max={45} unit="°C"
                                onChange={v => setParams(p => ({ ...p, tempSalidaMin: v, metodo: 'manual' }))}
                            />
                            <SliderField
                                label="Máxima"
                                value={params.tempSalidaMax ?? 27} min={2} max={45} unit="°C"
                                onChange={v => setParams(p => ({ ...p, tempSalidaMax: v, metodo: 'manual' }))}
                            />
                        </div>
                    </div>
                    <div>
                        <SecLabel>Tiempo de sostenimiento a temp. máx.</SecLabel>
                        <TiempoRow
                            value={params.tiempoSostenimiento ?? 15}
                            unidad={params.unidadTiempo}
                            onValueChange={v => setParams(p => ({ ...p, tiempoSostenimiento: v, metodo: 'manual' }))}
                            onUnidadChange={v => setParams(p => ({ ...p, unidadTiempo: v, metodo: 'manual' }))}
                            min={1} max={120}
                            units={[{ id: 'seg', label: 'seg' }, { id: 'min', label: 'min' }]}
                        />
                    </div>
                </div>
            );

        case 'enfriamiento': {
            const TEMPS = [4, 12, 18, 22, 30, 35, 42].map(t => ({ id: t, label: `${t}°C` }));
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Temperatura Objetivo</SecLabel>
                        <div className="flex flex-wrap gap-2">
                            {TEMPS.map(o => (
                                <button key={o.id} type="button" onClick={() => setParams(p => ({ ...p, temperaturaObjetivo: o.id }))}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                                        params.temperaturaObjetivo === o.id
                                            ? 'bg-emerald-600 border-emerald-500 text-white'
                                            : 'bg-slate-700 border-slate-600 text-slate-400 hover:border-slate-500'
                                    }`}>
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <SliderField label="Ajuste fino" value={params.temperaturaObjetivo} min={2} max={90} unit="°C" onChange={set('temperaturaObjetivo')} />
                </div>
            );
        }

        case 'agregar_insumo':
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Insumo a Agregar</SecLabel>
                        {materialsLoading ? (
                            <div className="flex items-center gap-2 text-slate-500 text-sm py-3">
                                <Loader size={14} className="animate-spin" /> Cargando materiales…
                            </div>
                        ) : (
                            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-700 bg-slate-800 p-1.5 space-y-0.5">
                                {materials.length === 0 ? (
                                    <p className="text-slate-500 text-sm text-center py-4">
                                        Sin materiales en el Maestro todavía.
                                    </p>
                                ) : materials.map(m => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => setParams(p => ({ ...p, materialId: m.id, materialNombre: m.nombre }))}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                            params.materialId === m.id
                                                ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                                                : 'text-slate-300 hover:bg-slate-700 border border-transparent'
                                        }`}
                                    >
                                        <span className="font-medium">{m.nombre}</span>
                                        {m.categoria && (
                                            <span className="text-slate-500 text-xs ml-2 capitalize">{m.categoria}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <SecLabel>Método de aplicación</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'mezclado',   label: 'Mezclado / agitado' },
                                { id: 'superficie', label: 'Superficie (espolvorear)' },
                                { id: 'aspersion',  label: 'Aspersión (spray)' },
                                { id: 'inmersion',  label: 'Inmersión' },
                            ]}
                            value={params.metodoAplicacion || 'mezclado'}
                            onChange={v => setParams(p => ({ ...p, metodoAplicacion: v }))}
                        />
                    </div>

                    {(params.metodoAplicacion === 'mezclado' || !params.metodoAplicacion) && (
                    <div>
                        <SecLabel>Agitar después de agregar</SecLabel>
                        <PillGroup
                            options={[{ id: 'si', label: 'Sí' }, { id: 'no', label: 'No' }]}
                            value={params.agitar}
                            onChange={v => setParams(p => ({ ...p, agitar: v }))}
                        />
                    </div>
                    )}

                    {params.agitar === 'si' && (params.metodoAplicacion === 'mezclado' || !params.metodoAplicacion) && (
                        <div>
                            <SecLabel>Tiempo de agitación</SecLabel>
                            <TiempoRow
                                value={params.tiempoAgitacion} unidad={params.unidadAgitacion || 'min'}
                                onValueChange={v => setParams(p => ({ ...p, tiempoAgitacion: v }))}
                                onUnidadChange={v => setParams(p => ({ ...p, unidadAgitacion: v }))}
                                min={1} max={60}
                                units={[{ id: 'min', label: 'min' }, { id: 'h', label: 'h' }]}
                            />
                        </div>
                    )}

                    <div>
                        <SecLabel>Reposar después</SecLabel>
                        <PillGroup
                            options={[{ id: 'si', label: 'Sí' }, { id: 'no', label: 'No' }]}
                            value={params.reposar}
                            onChange={v => setParams(p => ({ ...p, reposar: v }))}
                        />
                    </div>

                    {params.reposar === 'si' && (
                        <>
                            <div>
                                <SecLabel>Tiempo de reposo</SecLabel>
                                <TiempoRow
                                    value={params.tiempoReposo} unidad={params.unidadReposo}
                                    onValueChange={v => setParams(p => ({ ...p, tiempoReposo: v }))}
                                    onUnidadChange={v => setParams(p => ({ ...p, unidadReposo: v }))}
                                    min={1} max={72}
                                    units={[{ id: 'min', label: 'min' }, { id: 'h', label: 'h' }]}
                                />
                            </div>
                            <SliderField
                                label="Temperatura de reposo (0 = ambiente)"
                                value={params.tempReposo ?? 0} min={0} max={45} unit="°C"
                                onChange={v => setParams(p => ({ ...p, tempReposo: v }))}
                            />
                        </>
                    )}
                </div>
            );

        case 'inoculacion':
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Tipo de Cultivo</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'mesofilico',  label: 'Mesófilo' },
                                { id: 'termofilico', label: 'Termófilo' },
                                { id: 'blend',       label: 'Blend Termo-Mesófilo' },
                            ]}
                            value={params.tipoCultivo}
                            onChange={set('tipoCultivo')}
                        />
                    </div>
                    <SliderField label="Temperatura de inoculación" value={params.temperatura} min={18} max={45} unit="°C" onChange={set('temperatura')} />
                    <div>
                        <SecLabel>Tiempo de agitación tras inoculación</SecLabel>
                        <TiempoRow
                            value={params.tiempoAgitacion ?? 5} unidad={params.unidadAgitacion ?? 'min'}
                            onValueChange={v => setParams(p => ({ ...p, tiempoAgitacion: v }))}
                            onUnidadChange={v => setParams(p => ({ ...p, unidadAgitacion: v }))}
                            min={1} max={30}
                            units={[{ id: 'min', label: 'min' }]}
                        />
                    </div>
                    <div>
                        <SecLabel>Tiempo de incubación / fermentación</SecLabel>
                        <TiempoRow
                            value={params.tiempoIncubacion} unidad={params.unidadTiempo}
                            onValueChange={set('tiempoIncubacion')} onUnidadChange={set('unidadTiempo')}
                            min={1} max={48}
                        />
                    </div>
                </div>
            );

        case 'cuajado':
            return (
                <div className="space-y-5">
                    {/* Section 1 — Pre-Cuajado */}
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
                        <SecLabel>Pre-Cuajado</SecLabel>
                        <SliderField label="Temperatura pre-cuajado" value={params.tempPreCuajado ?? 22} min={18} max={42} unit="°C" onChange={set('tempPreCuajado')} />
                        <SliderField label="pH pre-cuajado" value={params.phPreCuajado ?? 6.6} min={5.5} max={7.0} step={0.1} decimals={1} onChange={set('phPreCuajado')} />
                        <div>
                            <span className="block text-xs font-medium text-slate-400 mb-2">Tipo de coagulación</span>
                            <PillGroup
                                options={[{ id: 'lactica', label: 'Láctica' }, { id: 'enzimatica', label: 'Enzimática' }]}
                                value={params.tipoCoagulacion ?? 'enzimatica'}
                                onChange={set('tipoCoagulacion')}
                            />
                        </div>
                    </div>

                    {/* Section 2 — Adición de Insumos */}
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-5">
                        <SecLabel>Adición de Insumos</SecLabel>

                        {/* CaCl₂ */}
                        <div className="border border-slate-600 rounded-lg p-3 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-300">Cloruro de Calcio (CaCl₂)</span>
                                <PillGroup
                                    options={[{ id: 'si', label: 'Sí' }, { id: 'no', label: 'No' }]}
                                    value={params.calcio ?? 'si'}
                                    onChange={set('calcio')}
                                />
                            </div>
                            {(params.calcio ?? 'si') === 'si' && (
                                <div>
                                    <span className="block text-xs text-slate-500 mb-2">Agitar</span>
                                    <TiempoRow
                                        value={params.calcioAgitar ?? 5} unidad={params.calcioAgitarUnidad ?? 'min'}
                                        onValueChange={v => setParams(p => ({ ...p, calcioAgitar: v }))}
                                        onUnidadChange={v => setParams(p => ({ ...p, calcioAgitarUnidad: v }))}
                                        min={1} max={30} units={[{ id: 'min', label: 'min' }]}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Conservante */}
                        <div className="border border-slate-600 rounded-lg p-3 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-300">Conservante</span>
                                <PillGroup
                                    options={[{ id: 'si', label: 'Sí' }, { id: 'no', label: 'No' }]}
                                    value={params.conservante ?? 'no'}
                                    onChange={set('conservante')}
                                />
                            </div>
                            {(params.conservante ?? 'no') === 'si' && (
                                <>
                                    <input
                                        type="text"
                                        value={params.conservanteNombre || ''}
                                        onChange={e => set('conservanteNombre')(e.target.value)}
                                        placeholder="Ej. Natamicina"
                                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                                    />
                                    <div>
                                        <span className="block text-xs text-slate-500 mb-2">Agitar</span>
                                        <TiempoRow
                                            value={params.conservanteAgitar ?? 5} unidad={params.conservanteAgitarUnidad ?? 'min'}
                                            onValueChange={v => setParams(p => ({ ...p, conservanteAgitar: v }))}
                                            onUnidadChange={v => setParams(p => ({ ...p, conservanteAgitarUnidad: v }))}
                                            min={1} max={30} units={[{ id: 'min', label: 'min' }]}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Cuajo */}
                        <div className="border border-slate-600 rounded-lg p-3 space-y-3">
                            <span className="block text-xs font-semibold text-slate-300">Cuajo</span>
                            <PillGroup
                                options={[
                                    { id: 'microbiano', label: 'Microbiano' },
                                    { id: 'vegetal',    label: 'Vegetal' },
                                    { id: 'animal',     label: 'Animal' },
                                    { id: 'genetico',   label: 'Genético' },
                                ]}
                                value={params.cuajoTipo ?? 'microbiano'}
                                onChange={set('cuajoTipo')}
                            />
                            <div>
                                <span className="block text-xs text-slate-500 mb-2">Agitar</span>
                                <TiempoRow
                                    value={params.cuajoAgitar ?? 3} unidad={params.cuajoAgitarUnidad ?? 'min'}
                                    onValueChange={v => setParams(p => ({ ...p, cuajoAgitar: v }))}
                                    onUnidadChange={v => setParams(p => ({ ...p, cuajoAgitarUnidad: v }))}
                                    min={1} max={30} units={[{ id: 'min', label: 'min' }]}
                                />
                            </div>
                        </div>

                        {/* Fermento */}
                        <div className="border border-slate-600 rounded-lg p-3 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-300">Fermento</span>
                                <PillGroup
                                    options={[{ id: 'si', label: 'Sí' }, { id: 'no', label: 'No' }]}
                                    value={params.fermento ?? 'si'}
                                    onChange={set('fermento')}
                                />
                            </div>
                            {(params.fermento ?? 'si') === 'si' && (
                                <>
                                    <PillGroup
                                        options={[
                                            { id: 'mesofilico',  label: 'Mesófilo' },
                                            { id: 'termofilico', label: 'Termófilo' },
                                            { id: 'blend',       label: 'Blend T/M' },
                                        ]}
                                        value={params.tipoFermento ?? 'mesofilico'}
                                        onChange={set('tipoFermento')}
                                    />
                                    <SliderField label="Temp. inoculación" value={params.tempInoculacion ?? 22} min={18} max={45} unit="°C" onChange={set('tempInoculacion')} />
                                    <div>
                                        <span className="block text-xs text-slate-500 mb-2">Agitar</span>
                                        <TiempoRow
                                            value={params.fermentoAgitar ?? 5} unidad={params.fermentoAgitarUnidad ?? 'min'}
                                            onValueChange={v => setParams(p => ({ ...p, fermentoAgitar: v }))}
                                            onUnidadChange={v => setParams(p => ({ ...p, fermentoAgitarUnidad: v }))}
                                            min={1} max={30} units={[{ id: 'min', label: 'min' }]}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Section 3 — Cierre de Coagulación */}
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
                        <SecLabel>Cierre de Coagulación</SecLabel>
                        <div>
                            <span className="block text-xs font-medium text-slate-400 mb-2">Tiempo de coagulación</span>
                            <TiempoRow
                                value={params.tiempoCoagulacion ?? 14} unidad={params.unidadTiempoCoagulacion ?? 'h'}
                                onValueChange={set('tiempoCoagulacion')} onUnidadChange={set('unidadTiempoCoagulacion')}
                                min={1} max={72}
                            />
                        </div>
                        <SliderField label="Temperatura de coagulación" value={params.tempCoagulacion ?? 22} min={18} max={42} unit="°C" onChange={set('tempCoagulacion')} />
                    </div>
                </div>
            );

        case 'agitacion_simple':
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Intensidad</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'suave',    label: 'Suave' },
                                { id: 'moderada', label: 'Moderada' },
                                { id: 'vigorosa', label: 'Vigorosa' },
                            ]}
                            value={params.intensidad}
                            onChange={set('intensidad')}
                        />
                    </div>
                    <div>
                        <SecLabel>Duración</SecLabel>
                        <TiempoRow
                            value={params.duracion} unidad={params.unidadTiempo}
                            onValueChange={set('duracion')} onUnidadChange={set('unidadTiempo')}
                            min={1} max={60}
                            units={[{ id: 'min', label: 'min' }, { id: 'h', label: 'h' }]}
                        />
                    </div>
                </div>
            );

        case 'reposo':
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Duración del reposo</SecLabel>
                        <TiempoRow
                            value={params.duracion} unidad={params.unidadTiempo}
                            onValueChange={set('duracion')} onUnidadChange={set('unidadTiempo')}
                            min={1} max={72}
                            units={[{ id: 'min', label: 'min' }, { id: 'h', label: 'h' }, { id: 'dias', label: 'días' }]}
                        />
                    </div>
                    <div>
                        <SecLabel>Temperatura durante el reposo</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'ambiente',   label: 'Temperatura ambiente' },
                                { id: 'controlada', label: 'Temperatura controlada' },
                            ]}
                            value={params.tipoTemp}
                            onChange={set('tipoTemp')}
                        />
                    </div>
                    {params.tipoTemp === 'controlada' && (
                        <SliderField label="Temperatura" value={params.temperatura} min={0} max={45} unit="°C" onChange={set('temperatura')} />
                    )}
                </div>
            );

        case 'corte':
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Tamaño de Grano</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'arroz',       label: 'Arroz (~3 mm)' },
                                { id: 'maiz',        label: 'Maíz (~6 mm)' },
                                { id: 'frijol_rojo', label: 'Frijol rojo (~12 mm)' },
                                { id: 'dado',        label: 'Dado (~20 mm)' },
                            ]}
                            value={params.tamanoGrano}
                            onChange={set('tamanoGrano')}
                        />
                    </div>
                    <div>
                        <SecLabel>Método de Corte</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'manual',   label: 'Manual (lira)' },
                                { id: 'mecanico', label: 'Mecánico' },
                            ]}
                            value={params.tipoCorte}
                            onChange={set('tipoCorte')}
                        />
                    </div>
                    <div>
                        <SecLabel>Agitar post-corte</SecLabel>
                        <PillGroup
                            options={[{ id: 'si', label: 'Sí' }, { id: 'no', label: 'No' }]}
                            value={params.agitarPostCorte ?? 'si'}
                            onChange={set('agitarPostCorte')}
                        />
                    </div>
                    {(params.agitarPostCorte ?? 'si') === 'si' && (
                        <div>
                            <SecLabel>Tiempo de agitación post-corte</SecLabel>
                            <TiempoRow
                                value={params.tiempoAgitacion ?? 10} unidad={params.unidadAgitacion ?? 'min'}
                                onValueChange={set('tiempoAgitacion')} onUnidadChange={set('unidadAgitacion')}
                                min={1} max={60} units={[{ id: 'min', label: 'min' }, { id: 'h', label: 'h' }]}
                            />
                        </div>
                    )}
                    <SliderField label="Temperatura en corte" value={params.temperatura ?? 38} min={20} max={60} unit="°C" onChange={set('temperatura')} />
                    <SliderField label="pH de acidificación" value={params.phAcidificacion ?? 6.2} min={4.0} max={7.0} step={0.1} decimals={1} onChange={set('phAcidificacion')} />
                </div>
            );

        case 'agitacion':
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Tipo</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'agitacion', label: 'Agitación suave' },
                                { id: 'coccion',   label: 'Cocción gradual' },
                            ]}
                            value={params.tipo}
                            onChange={set('tipo')}
                        />
                    </div>
                    <SliderField label="Temperatura objetivo" value={params.temperaturaObjetivo} min={28} max={65} unit="°C" onChange={set('temperaturaObjetivo')} />
                    <div>
                        <SecLabel>Tiempo</SecLabel>
                        <TiempoRow
                            value={params.tiempo} unidad={params.unidadTiempo}
                            onValueChange={set('tiempo')} onUnidadChange={set('unidadTiempo')}
                            min={5} max={120} units={[{ id: 'min', label: 'min' }, { id: 'h', label: 'h' }]}
                        />
                    </div>
                </div>
            );

        case 'desuerado':
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Método</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'gravedad',        label: 'Gravedad' },
                                { id: 'prensado_suave',  label: 'Prensado suave' },
                                { id: 'prensado_fuerte', label: 'Prensado fuerte' },
                            ]}
                            value={params.metodo}
                            onChange={set('metodo')}
                        />
                    </div>
                    <div>
                        <SecLabel>Con Moldes</SecLabel>
                        <PillGroup
                            options={[{ id: 'si', label: 'Sí' }, { id: 'no', label: 'No' }]}
                            value={params.conMoldes}
                            onChange={set('conMoldes')}
                        />
                    </div>
                    <div>
                        <SecLabel>Tiempo de desuerado</SecLabel>
                        <TiempoRow
                            value={params.tiempo} unidad={params.unidadTiempo}
                            onValueChange={set('tiempo')} onUnidadChange={set('unidadTiempo')}
                            min={1} max={72} units={[{ id: 'h', label: 'h' }, { id: 'dias', label: 'días' }]}
                        />
                    </div>
                    <SliderField label="Temperatura ambiente" value={params.temperaturaAmbiente} min={4} max={28} unit="°C" onChange={set('temperaturaAmbiente')} />
                    <SliderField label="pH post-desuerado" value={params.phPost ?? 5.8} min={4.0} max={6.8} step={0.1} decimals={1} onChange={set('phPost')} />
                </div>
            );

        case 'moldeado': {
            const numV = params.numVueltas ?? 2;
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Tipo de Molde</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'cilindrico',  label: 'Cilíndrico' },
                                { id: 'rectangular', label: 'Rectangular' },
                                { id: 'corazon',     label: 'Corazón' },
                                { id: 'otro',        label: 'Otro' },
                            ]}
                            value={params.tipoMolde}
                            onChange={set('tipoMolde')}
                        />
                    </div>
                    <div>
                        <SecLabel>Número de vueltas en molde (1–5)</SecLabel>
                        <StepperField label="" value={numV} min={1} max={5} onChange={set('numVueltas')} />
                    </div>
                    {[1,2,3,4,5].filter(i => i <= numV).map(i => (
                        <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl p-3 space-y-3">
                            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Vuelta {i}</p>
                            <TiempoRow
                                value={params[`vuelta${i}Tiempo`] ?? 30}
                                unidad={params[`vuelta${i}Unidad`] ?? 'min'}
                                onValueChange={v => setParams(p => ({ ...p, [`vuelta${i}Tiempo`]: v }))}
                                onUnidadChange={v => setParams(p => ({ ...p, [`vuelta${i}Unidad`]: v }))}
                                min={1} max={480}
                                units={[{ id: 'min', label: 'min' }, { id: 'h', label: 'h' }]}
                            />
                        </div>
                    ))}
                    <SliderField
                        label="pH post-moldeado objetivo"
                        value={params.phPost ?? 5.8} min={4.0} max={6.8} step={0.1} decimals={1}
                        onChange={set('phPost')}
                    />
                    <SliderField
                        label="Temperatura ambiente durante moldeado"
                        value={params.temperaturaAmbiente ?? 18} min={10} max={28} unit="°C"
                        onChange={set('temperaturaAmbiente')}
                    />
                    <div>
                        <SecLabel>Observaciones</SecLabel>
                        <textarea
                            value={params.comentarios || ''}
                            onChange={e => set('comentarios')(e.target.value)}
                            placeholder="Textura, firmeza, acidez, notas del quesero…"
                            rows={3}
                            className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors resize-none"
                        />
                    </div>
                </div>
            );
        }

        case 'pre_prensa':
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Unidad de presión</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'kg_cm2', label: 'kg/cm²' },
                                { id: 'psi',    label: 'PSI' },
                            ]}
                            value={params.unidadPresion || 'kg_cm2'}
                            onChange={set('unidadPresion')}
                        />
                    </div>
                    <div>
                        <SecLabel>Valor de presión</SecLabel>
                        <div className="flex items-center gap-3">
                            <button type="button"
                                onClick={() => setParams(p => ({ ...p, valorPresion: Math.max(1, (p.valorPresion ?? 5) - 1) }))}
                                className="w-11 h-11 bg-slate-600 hover:bg-slate-500 text-white rounded-xl flex items-center justify-center text-2xl font-bold transition-colors select-none">
                                −
                            </button>
                            <div className="flex-1 text-center">
                                <span className="text-white font-bold text-2xl tabular-nums">{params.valorPresion ?? 5}</span>
                                <span className="text-slate-400 text-sm ml-1.5">{params.unidadPresion === 'psi' ? 'PSI' : 'kg/cm²'}</span>
                            </div>
                            <button type="button"
                                onClick={() => setParams(p => ({ ...p, valorPresion: Math.min(200, (p.valorPresion ?? 5) + 1) }))}
                                className="w-11 h-11 bg-slate-600 hover:bg-slate-500 text-white rounded-xl flex items-center justify-center text-2xl font-bold transition-colors select-none">
                                +
                            </button>
                        </div>
                    </div>
                    <div>
                        <SecLabel>Tiempo</SecLabel>
                        <TiempoRow
                            value={params.tiempo ?? 15} unidad={params.unidadTiempo ?? 'min'}
                            onValueChange={set('tiempo')} onUnidadChange={set('unidadTiempo')}
                            min={5} max={120}
                            units={[{ id: 'min', label: 'min' }, { id: 'h', label: 'h' }]}
                        />
                    </div>
                </div>
            );

        case 'prensado': {
            const numV = params.numVueltas || 2;
            const u = params.unidadPresion === 'psi' ? 'PSI' : 'kg/cm²';
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Unidad de presión</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'kg_cm2', label: 'kg/cm²' },
                                { id: 'psi',    label: 'PSI' },
                            ]}
                            value={params.unidadPresion || 'kg_cm2'}
                            onChange={set('unidadPresion')}
                        />
                    </div>
                    <div>
                        <SecLabel>Número de vueltas de prensado</SecLabel>
                        <StepperField label="" value={numV} min={1} max={4} onChange={set('numVueltas')} />
                    </div>
                    {[1, 2, 3, 4].filter(i => i <= numV).map(i => (
                        <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
                            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Vuelta {i}</p>
                            <div>
                                <span className="block text-xs font-medium text-slate-400 mb-2">Presión ({u})</span>
                                <div className="flex items-center gap-3">
                                    <button type="button"
                                        onClick={() => setParams(p => ({ ...p, [`vuelta${i}Presion`]: Math.max(1, (p[`vuelta${i}Presion`] ?? 10) - 1) }))}
                                        className="w-11 h-11 bg-slate-600 hover:bg-slate-500 text-white rounded-xl flex items-center justify-center text-2xl font-bold transition-colors select-none">
                                        −
                                    </button>
                                    <span className="text-white font-bold text-2xl w-20 text-center tabular-nums">
                                        {params[`vuelta${i}Presion`] ?? 10}
                                    </span>
                                    <button type="button"
                                        onClick={() => setParams(p => ({ ...p, [`vuelta${i}Presion`]: Math.min(500, (p[`vuelta${i}Presion`] ?? 10) + 1) }))}
                                        className="w-11 h-11 bg-slate-600 hover:bg-slate-500 text-white rounded-xl flex items-center justify-center text-2xl font-bold transition-colors select-none">
                                        +
                                    </button>
                                </div>
                            </div>
                            <div>
                                <SecLabel>Tiempo</SecLabel>
                                <TiempoRow
                                    value={params[`vuelta${i}Tiempo`] ?? 30}
                                    unidad={params[`vuelta${i}UnidadTiempo`] ?? 'min'}
                                    onValueChange={v => setParams(p => ({ ...p, [`vuelta${i}Tiempo`]: v }))}
                                    onUnidadChange={v => setParams(p => ({ ...p, [`vuelta${i}UnidadTiempo`]: v }))}
                                    min={5} max={480}
                                    units={[{ id: 'min', label: 'min' }, { id: 'h', label: 'h' }]}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            );
        }

        case 'salado':
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Método de Salado</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'superficie', label: 'Superficie' },
                                { id: 'salmuera',   label: 'En salmuera' },
                                { id: 'masa',       label: 'En masa (cuajada)' },
                            ]}
                            value={params.metodo}
                            onChange={set('metodo')}
                        />
                    </div>
                    {params.metodo === 'masa' && (
                        <div>
                            <SecLabel>Cantidad de sal por kg de masa</SecLabel>
                            <div className="flex items-center gap-4 flex-wrap">
                                <StepperField label="" value={params.cantidadSal ?? 20} min={1} max={100} onChange={set('cantidadSal')} />
                                <PillGroup
                                    options={[{ id: 'g_por_kg', label: 'g/kg' }, { id: 'kg_por_kg', label: 'kg/kg' }]}
                                    value={params.unidadSal ?? 'g_por_kg'}
                                    onChange={set('unidadSal')}
                                />
                            </div>
                        </div>
                    )}
                    {params.metodo === 'salmuera' && (
                        <>
                            <div>
                                <SecLabel>Concentración de Salmuera</SecLabel>
                                <PillGroup
                                    options={[
                                        { id: '16',      label: '16%' },
                                        { id: '18',      label: '18%' },
                                        { id: '20',      label: '20%' },
                                        { id: '22',      label: '22%' },
                                        { id: 'saturada',label: 'Saturada' },
                                    ]}
                                    value={params.concentracion}
                                    onChange={set('concentracion')}
                                />
                            </div>
                            <SliderField label="Temperatura de salmuera" value={params.temperatura ?? 12} min={4} max={20} unit="°C" onChange={set('temperatura')} />
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                                <p className="text-amber-300 text-xs">
                                    La puerta de calidad (°D + °Bé) se verifica en la planilla de producción antes de habilitar la salmuera.
                                </p>
                            </div>
                            <div>
                                <SecLabel>Vueltas en salmuera (número)</SecLabel>
                                <StepperField label="" value={params.numVueltas ?? 2} min={1} max={4} onChange={set('numVueltas')} />
                            </div>
                            {[1,2,3,4].filter(i => i <= (params.numVueltas ?? 2)).map(i => (
                                <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl p-3 space-y-2">
                                    <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Vuelta {i}</p>
                                    <TiempoRow
                                        value={params[`vuelta${i}Tiempo`] ?? 4}
                                        unidad={params[`vuelta${i}Unidad`] ?? 'h'}
                                        onValueChange={v => setParams(p => ({ ...p, [`vuelta${i}Tiempo`]: v }))}
                                        onUnidadChange={v => setParams(p => ({ ...p, [`vuelta${i}Unidad`]: v }))}
                                        min={1} max={72}
                                        units={[{ id: 'h', label: 'h' }, { id: 'dias', label: 'días' }]}
                                    />
                                </div>
                            ))}
                        </>
                    )}
                </div>
            );

        case 'maduracion':
            return (
                <div className="space-y-6">
                    <SliderField label="Temperatura de cava" value={params.temperatura} min={2} max={18} unit="°C" onChange={set('temperatura')} />
                    <SliderField label="Humedad relativa" value={params.humedadRelativa} min={70} max={98} unit="%" onChange={set('humedadRelativa')} />
                    <div>
                        <SecLabel>Duración mínima</SecLabel>
                        <TiempoRow
                            value={params.duracion} unidad={params.unidadDuracion}
                            onValueChange={set('duracion')} onUnidadChange={set('unidadDuracion')}
                            min={1} max={365}
                            units={[{ id: 'dias', label: 'días' }, { id: 'semanas', label: 'semanas' }, { id: 'meses', label: 'meses' }]}
                        />
                    </div>
                    <div>
                        <SecLabel>Frecuencia de Virajes</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'ninguno',   label: 'Ninguno' },
                                { id: 'diario',    label: 'Diario' },
                                { id: 'cada2dias', label: 'Cada 2 días' },
                                { id: 'semanal',   label: 'Semanal' },
                            ]}
                            value={params.virajes}
                            onChange={set('virajes')}
                        />
                    </div>
                    <div>
                        <SecLabel>Cepillado de corteza</SecLabel>
                        <PillGroup
                            options={[{ id: 'no', label: 'No' }, { id: 'si', label: 'Sí' }]}
                            value={params.cepillado || 'no'}
                            onChange={set('cepillado')}
                        />
                    </div>
                    {params.cepillado === 'si' && (
                        <div>
                            <SecLabel>Frecuencia de cepillado</SecLabel>
                            <PillGroup
                                options={[
                                    { id: 'diario',    label: 'Diario' },
                                    { id: 'cada2dias', label: 'Cada 2 días' },
                                    { id: 'semanal',   label: 'Semanal' },
                                ]}
                                value={params.frecuenciaCepillado || 'semanal'}
                                onChange={set('frecuenciaCepillado')}
                            />
                        </div>
                    )}
                    <SliderField label="pH de entrada a cava" value={params.phEntrada ?? 5.8} min={4.0} max={6.8} step={0.1} decimals={1} onChange={set('phEntrada')} />
                    <SliderField label="pH de salida objetivo" value={params.phSalida ?? 5.4} min={3.8} max={6.8} step={0.1} decimals={1} onChange={set('phSalida')} />
                </div>
            );

        case 'pesaje':
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Unidad de peso</SecLabel>
                        <PillGroup
                            options={[{ id: 'kg', label: 'Kilogramos (Kg)' }, { id: 'g', label: 'Gramos (g)' }]}
                            value={params.unidadPeso}
                            onChange={set('unidadPeso')}
                        />
                    </div>
                    <div>
                        <SecLabel>Registrar rendimiento</SecLabel>
                        <PillGroup
                            options={[{ id: 'si', label: 'Sí — calcular kg / L leche' }, { id: 'no', label: 'No' }]}
                            value={params.registrarRendimiento}
                            onChange={set('registrarRendimiento')}
                        />
                    </div>
                    {params.registrarRendimiento === 'si' && (
                        <SliderField
                            label="Rendimiento esperado"
                            value={params.rendimientoEsperado}
                            min={4} max={30} unit="%"
                            onChange={set('rendimientoEsperado')}
                        />
                    )}
                </div>
            );

        case 'envasado':
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Tipo de envase</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'tina_plastica', label: 'Tina plástica' },
                                { id: 'frasco',        label: 'Frasco' },
                                { id: 'bolsa',         label: 'Bolsa' },
                                { id: 'molde',         label: 'Molde / bandeja' },
                                { id: 'otro',          label: 'Otro' },
                            ]}
                            value={params.tipoEnvase}
                            onChange={set('tipoEnvase')}
                        />
                    </div>
                    <div>
                        <SecLabel>Peso / volumen neto por unidad</SecLabel>
                        <div className="flex items-center gap-4 flex-wrap">
                            <StepperField
                                label="" value={params.pesoNeto} min={10} max={2000} step={10}
                                onChange={set('pesoNeto')}
                            />
                            <PillGroup
                                options={[
                                    { id: 'g',  label: 'g' },
                                    { id: 'kg', label: 'Kg' },
                                    { id: 'ml', label: 'ml' },
                                    { id: 'L',  label: 'L' },
                                ]}
                                value={params.unidadPeso}
                                onChange={v => v && set('unidadPeso')(v)}
                            />
                        </div>
                    </div>
                    <div>
                        <SecLabel>Temperatura del producto al envasar</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'frio',     label: 'Frío (refrigerado)' },
                                { id: 'ambiente', label: 'Temperatura ambiente' },
                            ]}
                            value={params.temperatura}
                            onChange={set('temperatura')}
                        />
                    </div>
                </div>
            );

        case 'precintado':
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Tipo de precinto</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'termoencogible_cristal', label: 'Termoencogible cristal' },
                                { id: 'termoencogible_opaco',   label: 'Termoencogible opaco' },
                                { id: 'termosellado',           label: 'Termosellado directo' },
                                { id: 'cinta_adhesiva',         label: 'Cinta adhesiva' },
                            ]}
                            value={params.tipoPrecinto}
                            onChange={set('tipoPrecinto')}
                        />
                    </div>
                    <div>
                        <SecLabel>¿Aplica etiqueta en este paso?</SecLabel>
                        <PillGroup
                            options={[{ id: 'si', label: 'Sí' }, { id: 'no', label: 'No' }]}
                            value={params.aplicaEtiqueta}
                            onChange={set('aplicaEtiqueta')}
                        />
                    </div>
                </div>
            );

        case 'empaque_secundario':
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Unidades por paquete</SecLabel>
                        <StepperField
                            label="" value={params.unidadesPorPack} min={2} max={48}
                            onChange={set('unidadesPorPack')}
                        />
                    </div>
                    <div>
                        <SecLabel>Material de empaque secundario</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'film_termoencogible', label: 'Film termoencogible' },
                                { id: 'caja_carton',         label: 'Caja cartón' },
                                { id: 'bolsa',               label: 'Bolsa' },
                                { id: 'bandeja',             label: 'Bandeja' },
                            ]}
                            value={params.materialEmpaque}
                            onChange={set('materialEmpaque')}
                        />
                    </div>
                </div>
            );

        case 'empaque': {
            // Unified empaque block
            if (params.tiposEmpaque !== undefined) {
                const TIPOS_EMPAQUE = [
                    'Envase plástico', 'Bolsa al vacío', 'Encerado', 'Termoencogible',
                    'Bolsa precintada', 'Bandeja sellada', 'Film stretch',
                ];
                const PRESENTACIONES = ['50g','100g','200g','250g','500g','1kg','2kg','4kg'];
                const tiposEmpaque = params.tiposEmpaque || [];
                const presentaciones = params.presentacionesPesos || [];
                return (
                    <div className="space-y-6">
                        <div>
                            <SecLabel>Tipo de Empaque (selección múltiple)</SecLabel>
                            <div className="flex flex-wrap gap-2">
                                {TIPOS_EMPAQUE.map(t => (
                                    <button key={t} type="button"
                                        onClick={() => {
                                            const next = tiposEmpaque.includes(t)
                                                ? tiposEmpaque.filter(x => x !== t)
                                                : [...tiposEmpaque, t];
                                            set('tiposEmpaque')(next);
                                        }}
                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                                            tiposEmpaque.includes(t)
                                                ? 'bg-blue-600 border-blue-500 text-white'
                                                : 'bg-slate-700 border-slate-600 text-slate-400 hover:border-slate-500'
                                        }`}>
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <SecLabel>Presentaciones de Venta (selección múltiple)</SecLabel>
                            <div className="flex flex-wrap gap-2">
                                {PRESENTACIONES.map(p => (
                                    <button key={p} type="button"
                                        onClick={() => {
                                            const next = presentaciones.includes(p)
                                                ? presentaciones.filter(x => x !== p)
                                                : [...presentaciones, p];
                                            set('presentacionesPesos')(next);
                                        }}
                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                                            presentaciones.includes(p)
                                                ? 'bg-emerald-600 border-emerald-500 text-white'
                                                : 'bg-slate-700 border-slate-600 text-slate-400 hover:border-slate-500'
                                        }`}>
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <SecLabel>Operaciones adicionales</SecLabel>
                            <div className="space-y-2">
                                {[
                                    { key: 'aspersionConservante', label: 'Aspersión de conservante' },
                                    { key: 'precintado',           label: 'Precintado (foil / sello)' },
                                    { key: 'envalado',             label: 'Envalado (paquetes / bultos)' },
                                ].map(({ key, label }) => (
                                    <label key={key} className="flex items-center gap-3 cursor-pointer group">
                                        <div
                                            onClick={() => set(key)(!params[key])}
                                            className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                                                params[key]
                                                    ? 'bg-emerald-600 border-emerald-500'
                                                    : 'bg-slate-700 border-slate-600 group-hover:border-slate-500'
                                            }`}>
                                            {params[key] && <span className="text-white text-xs font-bold">✓</span>}
                                        </div>
                                        <span className="text-slate-300 text-sm">{label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Aspersión detail — only when checkbox is on */}
                        {params.aspersionConservante && (
                            <div className="bg-teal-950/30 border border-teal-800/40 rounded-xl p-4 space-y-4">
                                <SecLabel>Configuración — Aspersión de conservante</SecLabel>

                                <div>
                                    <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-2">Material conservante</p>
                                    <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-700 bg-slate-800 p-1.5 space-y-0.5">
                                        {(materials || [])
                                            .filter(m => ['reactivos', 'otros', 'consumibles'].includes(m.categoria))
                                            .map(m => (
                                                <button key={m.id} type="button"
                                                    onClick={() => setParams(p => ({ ...p, aspersionMaterialId: m.id, aspersionMaterialNombre: m.nombre }))}
                                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                                        params.aspersionMaterialId === m.id
                                                            ? 'bg-teal-600/30 text-teal-300 border border-teal-500/40'
                                                            : 'text-slate-300 hover:bg-slate-700 border border-transparent'
                                                    }`}>
                                                    <span className="font-medium">{m.nombre}</span>
                                                    {m.categoria && <span className="text-slate-500 text-xs ml-2">{m.categoria}</span>}
                                                </button>
                                            ))
                                        }
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <SecLabel>Conservante (g)</SecLabel>
                                        <StepperField value={params.aspersionGramos ?? 1.5} min={0.1} max={20} step={0.1}
                                            onChange={v => setParams(p => ({ ...p, aspersionGramos: +v.toFixed(1) }))} />
                                    </div>
                                    <div>
                                        <SecLabel>Agua destilada (ml)</SecLabel>
                                        <StepperField value={params.aspersionMlAgua ?? 500} min={50} max={2000} step={50}
                                            onChange={v => setParams(p => ({ ...p, aspersionMlAgua: v }))} />
                                    </div>
                                </div>

                                <div>
                                    <SecLabel>ml de solución por envase</SecLabel>
                                    <StepperField value={params.aspersionMlPorEnvase ?? 1} min={0.1} max={10} step={0.1}
                                        onChange={v => setParams(p => ({ ...p, aspersionMlPorEnvase: +v.toFixed(1) }))} />
                                </div>

                                {params.aspersionMaterialId && (
                                    <div className="bg-slate-800/60 rounded-xl px-4 py-3 space-y-1">
                                        <p className="text-slate-500 text-xs">
                                            Solución: <span className="text-white font-mono">{params.aspersionGramos ?? 1.5}g de {params.aspersionMaterialNombre} / {params.aspersionMlAgua ?? 500}ml agua destilada</span>
                                        </p>
                                        <p className="text-slate-500 text-xs">
                                            Por envase: <span className="text-teal-300 font-mono">
                                                {params.aspersionMlPorEnvase ?? 1} ml → {(((params.aspersionGramos ?? 1.5) / (params.aspersionMlAgua ?? 500)) * (params.aspersionMlPorEnvase ?? 1)).toFixed(4)} g de conservante
                                            </span>
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            }
            // Legacy format (old individual empaque block)
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Tipo de Empaque</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'al_vacio',        label: 'Al vacío' },
                                { id: 'film_stretch',    label: 'Film stretch' },
                                { id: 'papel_encerado',  label: 'Papel encerado' },
                                { id: 'bandeja_sellada', label: 'Bandeja sellada' },
                                { id: 'atm_modificada',  label: 'Atm. modificada' },
                            ]}
                            value={params.tipo}
                            onChange={set('tipo')}
                        />
                    </div>
                </div>
            );
        }

        case 'personalizado':
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Nombre del paso</SecLabel>
                        <input
                            type="text"
                            value={params.nombre || ''}
                            onChange={e => set('nombre')(e.target.value)}
                            placeholder="ej. Acidificación, Lavado de cuajada, Ahumado…"
                            maxLength={60}
                            className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>
                    <div>
                        <SecLabel>Duración estimada</SecLabel>
                        <TiempoRow
                            value={params.duracion ?? 5} unidad={params.unidadTiempo ?? 'min'}
                            onValueChange={set('duracion')} onUnidadChange={set('unidadTiempo')}
                            min={1} max={120}
                            units={[{ id: 'min', label: 'min' }, { id: 'h', label: 'h' }, { id: 'dias', label: 'días' }]}
                        />
                    </div>
                </div>
            );

        default:
            return null;
    }
}

// ─── Draft persistence ────────────────────────────────────────────────────────

const DRAFT_KEY = 'kroma_process_draft';

function saveDraft(product, bloques) {
    if (!product) { localStorage.removeItem(DRAFT_KEY); return; }
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ product, bloques }));
}

function loadDraft() {
    try {
        const raw = localStorage.getItem(DRAFT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProcessBuilderPage() {
    const { kromaUser } = useKroma();
    const [products, setProducts] = useState([]);
    const [materials, setMaterials] = useState([]);
    const [processes, setProcesses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [materialsLoading, setMaterialsLoading] = useState(false);
    const [mode, setMode] = useState('list'); // 'list' | 'builder'
    const [hasDraft, setHasDraft] = useState(() => !!loadDraft());

    // Builder state
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [bloques, setBloques] = useState([]);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const [editingProcess, setEditingProcess] = useState(null); // null | process doc

    // Deactivate modal
    const [deactivateTarget, setDeactivateTarget] = useState(null); // null | process doc
    const [deactivating, setDeactivating] = useState(false);
    const [deactivateError, setDeactivateError] = useState(null);

    // Block editor modal
    const [blockModal, setBlockModal] = useState(null); // null | { mode: 'add' | 'edit', index? }
    const [modalTipo, setModalTipo] = useState('');
    const [modalParams, setModalParams] = useState({});

    const loadAll = useCallback(async () => {
        setLoadError(null);
        try {
            const [prodSnap, procSnap] = await Promise.all([
                getDocs(collection(db, 'kroma_products')),
                getDocs(collection(db, 'kroma_processes')),
            ]);
            setProducts(
                prodSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                    .filter(p => p.active !== false)
                    .sort((a, b) => a.nombre.localeCompare(b.nombre))
            );
            setProcesses(
                procSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                    .filter(p => p.active !== false)
                    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
            );
        } catch (err) {
            console.error(err);
            setLoadError(err?.code || err?.message || 'Error desconocido');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadMaterials = useCallback(async () => {
        if (materials.length > 0) return;
        setMaterialsLoading(true);
        try {
            const snap = await getDocs(collection(db, 'kroma_materials'));
            setMaterials(
                snap.docs.map(d => ({ id: d.id, ...d.data() }))
                    .filter(m => m.active !== false)
                    .sort((a, b) => a.nombre.localeCompare(b.nombre))
            );
        } catch (err) {
            console.error(err);
        } finally {
            setMaterialsLoading(false);
        }
    }, [materials.length]);

    useEffect(() => { loadAll(); }, [loadAll]);

    // Persist draft whenever builder state changes
    useEffect(() => {
        if (mode === 'builder') saveDraft(selectedProduct, bloques);
    }, [mode, selectedProduct, bloques]);

    // Block modal actions
    const openAddBlock = () => {
        setModalTipo('');
        setModalParams({});
        setBlockModal({ mode: 'add' });
        loadMaterials();
    };
    const openEditBlock = (idx) => {
        const b = bloques[idx];
        setModalTipo(b.tipo);
        setModalParams({ ...b.params });
        setBlockModal({ mode: 'edit', index: idx });
        if (b.tipo === 'agregar_insumo') loadMaterials();
    };
    const selectTipo = (tipo) => {
        setModalTipo(tipo);
        setModalParams({ ...BLOCK_DEFAULTS[tipo] });
        if (tipo === 'agregar_insumo') loadMaterials();
    };
    const confirmBlock = () => {
        if (!modalTipo) return;
        const bloque = { id: uid(), tipo: modalTipo, params: modalParams };
        if (blockModal.mode === 'add') {
            setBloques(prev => [...prev, bloque]);
        } else {
            setBloques(prev => prev.map((b, i) => i === blockModal.index ? bloque : b));
        }
        setBlockModal(null);
    };
    const removeBlock = (idx) => setBloques(prev => prev.filter((_, i) => i !== idx));
    const moveBlock = (idx, dir) => {
        const arr = [...bloques];
        const ni = idx + dir;
        if (ni < 0 || ni >= arr.length) return;
        [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
        setBloques(arr);
    };

    const restoreDraft = () => {
        const d = loadDraft();
        if (!d) return;
        setSelectedProduct(d.product);
        setBloques(d.bloques || []);
        setMode('builder');
        setHasDraft(false);
    };

    const discardDraft = () => {
        localStorage.removeItem(DRAFT_KEY);
        setHasDraft(false);
    };

    const openEditProcess = (proc) => {
        setEditingProcess(proc);
        setSelectedProduct({ id: proc.productoId, nombre: proc.productoNombre });
        setBloques(proc.bloques || []);
        setMode('builder');
        loadMaterials();
    };

    const saveProcess = async () => {
        if (!selectedProduct || bloques.length === 0) return;
        setSaving(true);
        setSaveError(null);
        try {
            if (editingProcess) {
                await updateDoc(doc(db, 'kroma_processes', editingProcess.id), {
                    bloques,
                    updatedAt: serverTimestamp(),
                    updatedPor: kromaUser?.id || null,
                    updatedPorNombre: kromaUser?.name || null,
                });
            } else {
                await addDoc(collection(db, 'kroma_processes'), {
                    productoId: selectedProduct.id,
                    productoNombre: selectedProduct.nombre,
                    bloques,
                    estado: 'borrador',
                    creadoPor: kromaUser?.id || null,
                    creadoPorNombre: kromaUser?.name || null,
                    active: true,
                    createdAt: serverTimestamp(),
                });
            }
            localStorage.removeItem(DRAFT_KEY);
            setHasDraft(false);
            await loadAll();
            setMode('list');
            setSelectedProduct(null);
            setBloques([]);
            setEditingProcess(null);
        } catch (err) {
            console.error(err);
            setSaveError(err?.code || err?.message || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    const deactivateProcess = async () => {
        if (!deactivateTarget) return;
        setDeactivating(true);
        setDeactivateError(null);
        try {
            await updateDoc(doc(db, 'kroma_processes', deactivateTarget.id), { active: false });
            setDeactivateTarget(null);
            await loadAll();
        } catch (err) {
            console.error(err);
            setDeactivateError(err?.code || err?.message || 'Error al desactivar');
        } finally {
            setDeactivating(false);
        }
    };

    // ── List view ──────────────────────────────────────────────────────────────
    if (mode === 'list') {
        return (
            <>
            <div className="p-6 md:p-8">
                <div className="flex items-center justify-between mb-6 gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Workflow size={20} className="text-emerald-400" />
                            <h2 className="text-xl font-bold text-white">Constructor de Procesos</h2>
                        </div>
                        <p className="text-slate-400 text-sm">
                            {processes.length} proceso{processes.length !== 1 ? 's' : ''} definido{processes.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                    {products.length > 0 && (
                        <button
                            onClick={() => setMode('builder')}
                            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl transition-colors text-sm shrink-0"
                        >
                            <Plus size={16} />
                            Nuevo Proceso
                        </button>
                    )}
                </div>

                {/* Draft recovery banner */}
                {hasDraft && !loading && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-5 flex items-start gap-3">
                        <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <p className="text-amber-300 font-semibold text-sm">Tienes un proceso sin guardar</p>
                            <p className="text-amber-400/70 text-xs mt-0.5">
                                {loadDraft()?.product?.nombre || 'Proceso'} — se recuperó automáticamente
                            </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <button
                                onClick={discardDraft}
                                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded border border-slate-600 hover:border-slate-500 transition-colors"
                            >
                                Descartar
                            </button>
                            <button
                                onClick={restoreDraft}
                                className="bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold px-3 py-1 rounded transition-colors"
                            >
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
                        <p className="text-slate-400 text-xs mb-4">
                            Esto puede deberse a un problema de permisos en Firestore o de conexión.
                            Si el error dice <span className="text-red-300 font-mono">permission-denied</span>, avisa al administrador para revisar las reglas de seguridad.
                        </p>
                        <button
                            onClick={() => { setLoading(true); loadAll(); }}
                            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            <RefreshCw size={14} />
                            Reintentar
                        </button>
                    </div>
                ) : products.length === 0 ? (
                    <div className="text-center py-16">
                        <Workflow size={36} className="text-slate-700 mx-auto mb-3" />
                        <p className="text-slate-500 text-sm">El Catálogo de Productos aún está vacío.</p>
                        <p className="text-slate-600 text-xs mt-1">Pide al Administrador que lo complete primero.</p>
                    </div>
                ) : processes.length === 0 ? (
                    <div className="text-center py-16">
                        <Workflow size={36} className="text-slate-700 mx-auto mb-3" />
                        <p className="text-slate-500 text-sm">Sin procesos. Crea el primero.</p>
                        <button onClick={() => setMode('builder')} className="mt-4 text-emerald-400 hover:text-emerald-300 text-sm font-medium">
                            + Nuevo proceso
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4 max-w-2xl">
                        {processes.map(proc => {
                            const types = (proc.bloques || []).map(b => BLOCK_TYPES.find(t => t.id === b.tipo)).filter(Boolean);
                            return (
                                <div key={proc.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                                    <div className="flex items-start justify-between gap-2 mb-3">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white font-semibold text-sm">{proc.productoNombre}</p>
                                            <p className="text-slate-500 text-xs mt-0.5">
                                                {proc.bloques?.length || 0} bloques · {proc.creadoPorNombre || 'Sistema'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${
                                                proc.estado === 'activo'
                                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                                    : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                                            }`}>
                                                {proc.estado === 'activo' ? 'Activo' : 'Borrador'}
                                            </span>
                                            <button
                                                onClick={() => openEditProcess(proc)}
                                                className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-slate-700 rounded-lg transition-colors"
                                                title="Editar proceso"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                onClick={() => setDeactivateTarget(proc)}
                                                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                                                title="Desactivar proceso"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {types.map((bt, i) => (
                                            <React.Fragment key={i}>
                                                <span className={`text-xs px-2 py-0.5 rounded-full border ${bt.bg} ${bt.color} ${bt.border}`}>
                                                    {bt.label}
                                                </span>
                                                {i < types.length - 1 && <span className="text-slate-600 text-xs">→</span>}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Deactivate confirmation modal */}
            {deactivateTarget && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
                        <h3 className="text-white font-bold text-lg mb-2">Desactivar Proceso</h3>
                        <p className="text-slate-400 text-sm mb-6">
                            ¿Desactivar el proceso de{' '}
                            <strong className="text-white">{deactivateTarget.productoNombre}</strong>?
                            {' '}El proceso ya no estará disponible, pero su historial se conserva.
                        </p>
                        {deactivateError && (
                            <p className="text-red-400 text-xs mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                                {deactivateError}
                            </p>
                        )}
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setDeactivateTarget(null); setDeactivateError(null); }}
                                className="flex-1 border border-slate-600 text-slate-300 rounded-xl py-2.5 text-sm font-medium hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={deactivateProcess}
                                disabled={deactivating}
                                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-60"
                            >
                                {deactivating ? 'Desactivando...' : 'Desactivar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </>
        );
    }

    // ── Builder view ───────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800 shrink-0">
                <button
                    onClick={() => { localStorage.removeItem(DRAFT_KEY); setHasDraft(false); setMode('list'); setSelectedProduct(null); setBloques([]); setEditingProcess(null); }}
                    className="text-slate-400 hover:text-white p-1 rounded transition-colors"
                >
                    <X size={18} />
                </button>
                <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm truncate">
                        {selectedProduct ? selectedProduct.nombre : 'Nuevo Proceso'}
                    </p>
                    <p className="text-slate-500 text-xs">
                        {editingProcess ? 'Editando proceso' : 'Nuevo proceso'}{selectedProduct ? ` · ${bloques.length} bloque${bloques.length !== 1 ? 's' : ''}` : ''}
                    </p>
                </div>
                {selectedProduct && bloques.length > 0 && (
                    <button
                        onClick={saveProcess}
                        disabled={saving}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-60 flex items-center gap-2 shrink-0"
                    >
                        {saving ? <Loader size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        {saving ? 'Guardando…' : editingProcess ? 'Actualizar' : 'Guardar'}
                    </button>
                )}
            </div>

            {saveError && (
                <div className="flex items-center gap-2 bg-red-500/10 border-b border-red-500/30 px-5 py-3 shrink-0">
                    <AlertTriangle size={14} className="text-red-400 shrink-0" />
                    <p className="text-red-300 text-xs flex-1">
                        <span className="font-semibold">Error al guardar:</span> {saveError}
                    </p>
                    <button onClick={() => setSaveError(null)} className="text-red-400 hover:text-white p-0.5">
                        <X size={13} />
                    </button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-5">
                {/* Step 1 — Select product */}
                {!selectedProduct && (
                    <div>
                        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-4">
                            Seleccionar Producto
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {products.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setSelectedProduct(p)}
                                    className="bg-slate-800 border border-slate-700 hover:border-emerald-500/50 rounded-xl p-4 text-left transition-all hover:shadow-lg hover:shadow-emerald-500/10"
                                >
                                    <p className="text-white font-semibold text-sm mb-2">{p.nombre}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        <span className={`text-xs px-2 py-0.5 rounded-full border ${CAT_STYLE[p.categoria] || CAT_STYLE.otro}`}>
                                            {CAT_LABELS[p.categoria] || p.categoria}
                                        </span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full border ${MILK_STYLE[p.tipoLeche] || ''}`}>
                                            Leche {MILK_LABELS[p.tipoLeche] || p.tipoLeche}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 2 — Build blocks */}
                {selectedProduct && (
                    <div>
                        {bloques.length === 0 ? (
                            <div className="text-center py-12 mb-4">
                                <Workflow size={32} className="text-slate-700 mx-auto mb-3" />
                                <p className="text-slate-500 text-sm">Sin bloques. Agrega el primero para comenzar.</p>
                            </div>
                        ) : (
                            <div className="space-y-2 mb-5">
                                {bloques.map((bloque, idx) => {
                                    const bt = BLOCK_TYPES.find(t => t.id === bloque.tipo);
                                    if (!bt) return null;
                                    const Icon = bt.Icon;
                                    return (
                                        <div key={bloque.id}>
                                            <div className={`bg-slate-800 border rounded-xl p-3.5 ${bt.border}`}>
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-9 h-9 rounded-lg ${bt.bg} flex items-center justify-center shrink-0`}>
                                                        <Icon size={16} className={bt.color} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-slate-600 text-xs font-bold tabular-nums">{String(idx + 1).padStart(2, '0')}</span>
                                                            <p className="text-white font-semibold text-sm">{
                                                                bloque.tipo === 'personalizado' && bloque.params.nombre
                                                                    ? bloque.params.nombre
                                                                    : bt.label
                                                            }</p>
                                                        </div>
                                                        <p className="text-slate-400 text-xs truncate">{blockSummary(bloque.tipo, bloque.params)}</p>
                                                    </div>
                                                    <div className="flex flex-col gap-0.5 shrink-0">
                                                        <button onClick={() => moveBlock(idx, -1)} disabled={idx === 0}
                                                            className="p-1 text-slate-600 hover:text-slate-300 disabled:opacity-25 transition-colors">
                                                            <ChevronUp size={14} />
                                                        </button>
                                                        <button onClick={() => moveBlock(idx, 1)} disabled={idx === bloques.length - 1}
                                                            className="p-1 text-slate-600 hover:text-slate-300 disabled:opacity-25 transition-colors">
                                                            <ChevronDown size={14} />
                                                        </button>
                                                    </div>
                                                    <div className="flex flex-col gap-0.5 shrink-0">
                                                        <button onClick={() => openEditBlock(idx)}
                                                            className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-slate-700 rounded-lg transition-colors">
                                                            <Edit2 size={13} />
                                                        </button>
                                                        <button onClick={() => removeBlock(idx)}
                                                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors">
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                            {idx < bloques.length - 1 && (
                                                <div className="flex justify-center py-0.5">
                                                    <span className="text-slate-700 text-xs">↓</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <button
                            onClick={openAddBlock}
                            className="w-full flex items-center justify-center gap-2 border border-dashed border-slate-600 hover:border-emerald-500 text-slate-500 hover:text-emerald-400 rounded-xl py-3.5 transition-colors text-sm font-medium"
                        >
                            <Plus size={16} />
                            Agregar Bloque
                        </button>
                    </div>
                )}
            </div>

            {/* Block editor modal */}
            {blockModal && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-slate-900 border-t border-slate-700 sm:border sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] flex flex-col shadow-2xl">
                        {/* Modal header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
                            <h3 className="text-white font-bold">
                                {blockModal.mode === 'add' ? 'Agregar Bloque' : 'Editar Bloque'}
                            </h3>
                            <button onClick={() => setBlockModal(null)} className="text-slate-400 hover:text-white p-1 rounded transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal body */}
                        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
                            {/* Block type grid — only in add mode */}
                            {blockModal.mode === 'add' && (
                                <div>
                                    <SecLabel>Tipo de Bloque</SecLabel>
                                    <div className="grid grid-cols-2 gap-2">
                                        {BLOCK_TYPES.filter(bt => bt.id !== 'personalizado' && !bt.deprecated).map(bt => {
                                            const Icon = bt.Icon;
                                            const selected = modalTipo === bt.id;
                                            return (
                                                <button
                                                    key={bt.id}
                                                    type="button"
                                                    onClick={() => selectTipo(bt.id)}
                                                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                                                        selected
                                                            ? `${bt.bg} ${bt.border} ${bt.color}`
                                                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                                                    }`}
                                                >
                                                    <Icon size={15} className={selected ? bt.color : 'text-slate-500'} />
                                                    <span className="text-xs font-semibold leading-tight">{bt.label}</span>
                                                </button>
                                            );
                                        })}
                                        {/* Personalizado — full width */}
                                        {(() => {
                                            const bt = BLOCK_TYPES.find(b => b.id === 'personalizado');
                                            const Icon = bt.Icon;
                                            const selected = modalTipo === 'personalizado';
                                            return (
                                                <button
                                                    key="personalizado"
                                                    type="button"
                                                    onClick={() => selectTipo('personalizado')}
                                                    className={`col-span-2 flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                                                        selected
                                                            ? `${bt.bg} ${bt.border} ${bt.color}`
                                                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                                                    }`}
                                                >
                                                    <Icon size={15} className={selected ? bt.color : 'text-slate-500'} />
                                                    <span className="text-xs font-semibold leading-tight">{bt.label} — define tu propio paso</span>
                                                </button>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}

                            {/* Edit mode: show block type label */}
                            {blockModal.mode === 'edit' && (() => {
                                const bt = BLOCK_TYPES.find(t => t.id === modalTipo);
                                if (!bt) return null;
                                const Icon = bt.Icon;
                                return (
                                    <div className={`flex items-center gap-2.5 p-3 rounded-xl ${bt.bg} border ${bt.border}`}>
                                        <Icon size={16} className={bt.color} />
                                        <span className={`font-semibold text-sm ${bt.color}`}>{bt.label}</span>
                                    </div>
                                );
                            })()}

                            {/* Params */}
                            {modalTipo && (
                                <div className={blockModal.mode === 'add' ? 'pt-2 border-t border-slate-800' : ''}>
                                    {blockModal.mode === 'add' && <SecLabel>Parámetros</SecLabel>}
                                    <BlockParamEditor
                                        tipo={modalTipo}
                                        params={modalParams}
                                        setParams={setModalParams}
                                        materials={materials}
                                        materialsLoading={materialsLoading}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Modal footer */}
                        <div className="flex gap-3 px-5 py-4 border-t border-slate-800 shrink-0">
                            <button
                                onClick={() => setBlockModal(null)}
                                className="flex-1 border border-slate-600 text-slate-300 hover:text-white rounded-xl py-3 text-sm font-medium transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmBlock}
                                disabled={!modalTipo}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-40 text-sm"
                            >
                                {blockModal.mode === 'add' ? 'Agregar al proceso' : 'Confirmar cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
