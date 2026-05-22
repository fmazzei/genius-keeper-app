import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useKroma } from '../../KromaContext';
import {
    Workflow, Plus, X, ChevronUp, ChevronDown, Edit2, Trash2, Loader,
    Thermometer, Snowflake, FlaskConical, Clock, Scissors, RotateCcw,
    Droplets, ArrowDown, Waves, CalendarDays, Package, CheckCircle2,
} from 'lucide-react';
import { PillGroup } from '../admin/ProductCatalogPage';

// ─── Constants ────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);

const BLOCK_TYPES = [
    { id: 'pasteurizacion', label: 'Pasteurización',    Icon: Thermometer,  color: 'text-orange-400',  bg: 'bg-orange-500/20',  border: 'border-orange-500/30' },
    { id: 'enfriamiento',   label: 'Enfriamiento',      Icon: Snowflake,    color: 'text-cyan-400',    bg: 'bg-cyan-500/20',    border: 'border-cyan-500/30' },
    { id: 'inoculacion',    label: 'Inoculación',       Icon: FlaskConical, color: 'text-violet-400',  bg: 'bg-violet-500/20',  border: 'border-violet-500/30' },
    { id: 'cuajado',        label: 'Cuajado',           Icon: Clock,        color: 'text-amber-400',   bg: 'bg-amber-500/20',   border: 'border-amber-500/30' },
    { id: 'corte',          label: 'Corte de Cuajada',  Icon: Scissors,     color: 'text-red-400',     bg: 'bg-red-500/20',     border: 'border-red-500/30' },
    { id: 'agitacion',      label: 'Agitación/Cocción', Icon: RotateCcw,    color: 'text-orange-400',  bg: 'bg-orange-500/20',  border: 'border-orange-500/30' },
    { id: 'desuerado',      label: 'Desuerado',         Icon: Droplets,     color: 'text-blue-400',    bg: 'bg-blue-500/20',    border: 'border-blue-500/30' },
    { id: 'prensado',       label: 'Prensado',          Icon: ArrowDown,    color: 'text-slate-400',   bg: 'bg-slate-600/30',   border: 'border-slate-500/30' },
    { id: 'salado',         label: 'Salado',            Icon: Waves,        color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/30' },
    { id: 'maduracion',     label: 'Maduración/Curado', Icon: CalendarDays, color: 'text-amber-400',   bg: 'bg-amber-500/20',   border: 'border-amber-500/30' },
    { id: 'empaque',        label: 'Empaque',           Icon: Package,      color: 'text-blue-400',    bg: 'bg-blue-500/20',    border: 'border-blue-500/30' },
];

const BLOCK_DEFAULTS = {
    pasteurizacion: { metodo: 'htlv', temperatura: 72, tiempo: 15, unidadTiempo: 'seg' },
    enfriamiento:   { temperaturaObjetivo: 22 },
    inoculacion:    { tipoCultivo: 'mesofilico', temperatura: 22, tiempoIncubacion: 12, unidadTiempo: 'h' },
    cuajado:        { tipo: 'acido', temperatura: 22, tiempo: 14, unidadTiempo: 'h', phObjetivo: 4.5 },
    corte:          { tamanoGrano: 'medio', tipoCorte: 'manual' },
    agitacion:      { tipo: 'agitacion', temperaturaObjetivo: 38, tiempo: 30, unidadTiempo: 'min' },
    desuerado:      { metodo: 'gravedad', conMoldes: 'si', tiempo: 12, unidadTiempo: 'h', temperaturaAmbiente: 18 },
    prensado:       { presion: 'suave', tiempo: 6, unidadTiempo: 'h', volteos: 'cada2h' },
    salado:         { metodo: 'superficie', concentracion: '20', temperatura: 12, tiempo: 12, unidadTiempo: 'h' },
    maduracion:     { temperatura: 12, humedadRelativa: 90, duracion: 21, unidadDuracion: 'dias', virajes: 'cada2dias' },
    empaque:        { tipo: 'film_stretch', temperaturaEmpaque: 'refrigerado', almacenamiento: 'refrigeracion' },
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
        case 'pasteurizacion':
            if (params.metodo === 'htlv') return 'HTLV · 72°C · 15 seg';
            if (params.metodo === 'ltlt') return 'LTLT · 63°C · 30 min';
            return `${params.temperatura}°C · ${params.tiempo} ${params.unidadTiempo}`;
        case 'enfriamiento':
            return `→ ${params.temperaturaObjetivo}°C`;
        case 'inoculacion': {
            const cl = { mesofilico: 'Mesofílico', termofilico: 'Termofílico', mixto: 'Mixto' };
            return `${cl[params.tipoCultivo] || params.tipoCultivo} · ${params.temperatura}°C · ${params.tiempoIncubacion} ${params.unidadTiempo}`;
        }
        case 'cuajado': {
            const tl = { acido: 'Ácido', enzimatico: 'Enzimático', mixto: 'Mixto' };
            const ph = params.phObjetivo ? ` · pH ${Number(params.phObjetivo).toFixed(1)}` : '';
            return `${tl[params.tipo] || params.tipo} · ${params.temperatura}°C · ${params.tiempo} ${params.unidadTiempo}${ph}`;
        }
        case 'corte': {
            const gl = { fino: 'Fino 3mm', medio: 'Medio 6mm', grueso: 'Grueso 12mm', extra_grueso: 'Extra 20mm' };
            const tc = { manual: 'Lira manual', mecanico: 'Mecánico' };
            return `${gl[params.tamanoGrano] || params.tamanoGrano} · ${tc[params.tipoCorte] || params.tipoCorte}`;
        }
        case 'agitacion': {
            const tl = { agitacion: 'Agitación', coccion: 'Cocción' };
            return `${tl[params.tipo] || params.tipo} · → ${params.temperaturaObjetivo}°C · ${params.tiempo} ${params.unidadTiempo}`;
        }
        case 'desuerado': {
            const ml = { gravedad: 'Gravedad', prensado_suave: 'Prensado suave', prensado_fuerte: 'Prensado fuerte' };
            return `${ml[params.metodo] || params.metodo} · ${params.tiempo} ${params.unidadTiempo}`;
        }
        case 'prensado': {
            const pl = { suave: '1:1', media: '2:1', fuerte: '5:1', extra: '10:1' };
            return `Presión ${pl[params.presion] || params.presion} · ${params.tiempo} ${params.unidadTiempo}`;
        }
        case 'salado': {
            const sl = { superficie: 'Superficie', salmuera: 'En salmuera', masa: 'En masa' };
            let s = sl[params.metodo] || params.metodo;
            if (params.metodo === 'salmuera' && params.concentracion) s += ` ${params.concentracion}%`;
            return s;
        }
        case 'maduracion':
            return `${params.temperatura}°C · HR ${params.humedadRelativa}% · ${params.duracion} ${params.unidadDuracion}`;
        case 'empaque': {
            const el = {
                al_vacio: 'Al vacío', film_stretch: 'Film stretch',
                papel_encerado: 'Papel encerado', bandeja_sellada: 'Bandeja sellada',
                atm_modificada: 'Atm. modificada',
            };
            return el[params.tipo] || params.tipo;
        }
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

function BlockParamEditor({ tipo, params, setParams }) {
    const set = key => val => setParams(p => ({ ...p, [key]: val }));

    switch (tipo) {
        case 'pasteurizacion':
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Método</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'htlv',   label: 'HTLV  (72°C / 15 seg)' },
                                { id: 'ltlt',   label: 'LTLT  (63°C / 30 min)' },
                                { id: 'manual', label: 'Personalizado' },
                            ]}
                            value={params.metodo}
                            onChange={v => {
                                if (v === 'htlv') setParams({ metodo: 'htlv', temperatura: 72, tiempo: 15, unidadTiempo: 'seg' });
                                else if (v === 'ltlt') setParams({ metodo: 'ltlt', temperatura: 63, tiempo: 30, unidadTiempo: 'min' });
                                else setParams(p => ({ ...p, metodo: 'manual' }));
                            }}
                        />
                    </div>
                    {params.metodo === 'manual' && (
                        <>
                            <SliderField label="Temperatura" value={params.temperatura} min={60} max={95} unit="°C" onChange={set('temperatura')} />
                            <div>
                                <SecLabel>Tiempo</SecLabel>
                                <TiempoRow
                                    value={params.tiempo} unidad={params.unidadTiempo}
                                    onValueChange={set('tiempo')} onUnidadChange={set('unidadTiempo')}
                                    min={1} max={120}
                                    units={[{ id: 'seg', label: 'seg' }, { id: 'min', label: 'min' }, { id: 'h', label: 'h' }]}
                                />
                            </div>
                        </>
                    )}
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

        case 'inoculacion':
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Tipo de Cultivo</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'mesofilico',  label: 'Mesofílico' },
                                { id: 'termofilico', label: 'Termofílico' },
                                { id: 'mixto',       label: 'Mixto' },
                            ]}
                            value={params.tipoCultivo}
                            onChange={set('tipoCultivo')}
                        />
                    </div>
                    <SliderField label="Temperatura de inoculación" value={params.temperatura} min={18} max={45} unit="°C" onChange={set('temperatura')} />
                    <div>
                        <SecLabel>Tiempo de incubación</SecLabel>
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
                <div className="space-y-6">
                    <div>
                        <SecLabel>Tipo de Cuajado</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'acido',      label: 'Ácido (solo cultivos)' },
                                { id: 'enzimatico', label: 'Enzimático (cuajo)' },
                                { id: 'mixto',      label: 'Mixto' },
                            ]}
                            value={params.tipo}
                            onChange={set('tipo')}
                        />
                    </div>
                    <SliderField label="Temperatura" value={params.temperatura} min={18} max={42} unit="°C" onChange={set('temperatura')} />
                    <div>
                        <SecLabel>Tiempo de cuajado</SecLabel>
                        <TiempoRow
                            value={params.tiempo} unidad={params.unidadTiempo}
                            onValueChange={set('tiempo')} onUnidadChange={set('unidadTiempo')}
                            min={1} max={72}
                        />
                    </div>
                    {(params.tipo === 'acido' || params.tipo === 'mixto') && (
                        <SliderField label="pH objetivo" value={params.phObjetivo} min={3.8} max={6.8} step={0.1} decimals={1} onChange={set('phObjetivo')} />
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
                                { id: 'fino',        label: 'Fino (3 mm)' },
                                { id: 'medio',       label: 'Medio (6 mm)' },
                                { id: 'grueso',      label: 'Grueso (12 mm)' },
                                { id: 'extra_grueso',label: 'Extra (20 mm)' },
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
                </div>
            );

        case 'prensado':
            return (
                <div className="space-y-6">
                    <div>
                        <SecLabel>Nivel de Presión (kg peso / kg queso)</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'suave', label: 'Suave 1:1' },
                                { id: 'media', label: 'Media 2:1' },
                                { id: 'fuerte',label: 'Fuerte 5:1' },
                                { id: 'extra', label: 'Extra 10:1' },
                            ]}
                            value={params.presion}
                            onChange={set('presion')}
                        />
                    </div>
                    <div>
                        <SecLabel>Tiempo total</SecLabel>
                        <TiempoRow
                            value={params.tiempo} unidad={params.unidadTiempo}
                            onValueChange={set('tiempo')} onUnidadChange={set('unidadTiempo')}
                            min={1} max={48}
                        />
                    </div>
                    <div>
                        <SecLabel>Volteos</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'ninguno',    label: 'Ninguno' },
                                { id: 'una_vez',    label: '1 vez' },
                                { id: 'cada_hora',  label: 'Cada hora' },
                                { id: 'cada2h',     label: 'Cada 2 h' },
                            ]}
                            value={params.volteos}
                            onChange={set('volteos')}
                        />
                    </div>
                </div>
            );

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
                            <SliderField label="Temperatura de salmuera" value={params.temperatura} min={4} max={20} unit="°C" onChange={set('temperatura')} />
                            <div>
                                <SecLabel>Tiempo en salmuera</SecLabel>
                                <TiempoRow
                                    value={params.tiempo} unidad={params.unidadTiempo}
                                    onValueChange={set('tiempo')} onUnidadChange={set('unidadTiempo')}
                                    min={1} max={72} units={[{ id: 'h', label: 'h' }, { id: 'dias', label: 'días' }]}
                                />
                            </div>
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
                </div>
            );

        case 'empaque':
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
                    <div>
                        <SecLabel>Temperatura de Empaque</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'refrigerado', label: 'Refrigerado (4°C)' },
                                { id: 'ambiente',    label: 'Temperatura ambiente' },
                            ]}
                            value={params.temperaturaEmpaque}
                            onChange={set('temperaturaEmpaque')}
                        />
                    </div>
                    <div>
                        <SecLabel>Almacenamiento Final</SecLabel>
                        <PillGroup
                            options={[
                                { id: 'refrigeracion', label: 'Refrigeración 0–4°C' },
                                { id: 'ambiente',      label: 'Temperatura ambiente' },
                                { id: 'congelado',     label: 'Congelado' },
                            ]}
                            value={params.almacenamiento}
                            onChange={set('almacenamiento')}
                        />
                    </div>
                </div>
            );

        default:
            return null;
    }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProcessBuilderPage() {
    const { kromaUser } = useKroma();
    const [products, setProducts] = useState([]);
    const [processes, setProcesses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [mode, setMode] = useState('list'); // 'list' | 'builder'

    // Builder state
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [bloques, setBloques] = useState([]);
    const [saving, setSaving] = useState(false);

    // Block editor modal
    const [blockModal, setBlockModal] = useState(null); // null | { mode: 'add' | 'edit', index? }
    const [modalTipo, setModalTipo] = useState('');
    const [modalParams, setModalParams] = useState({});

    const loadAll = useCallback(async () => {
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
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    // Block modal actions
    const openAddBlock = () => { setModalTipo(''); setModalParams({}); setBlockModal({ mode: 'add' }); };
    const openEditBlock = (idx) => {
        const b = bloques[idx];
        setModalTipo(b.tipo);
        setModalParams({ ...b.params });
        setBlockModal({ mode: 'edit', index: idx });
    };
    const selectTipo = (tipo) => { setModalTipo(tipo); setModalParams({ ...BLOCK_DEFAULTS[tipo] }); };
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

    const saveProcess = async () => {
        if (!selectedProduct || bloques.length === 0) return;
        setSaving(true);
        try {
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
            await loadAll();
            setMode('list');
            setSelectedProduct(null);
            setBloques([]);
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    // ── List view ──────────────────────────────────────────────────────────────
    if (mode === 'list') {
        return (
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

                {loading ? (
                    <div className="flex justify-center py-16">
                        <Loader size={28} className="animate-spin text-emerald-400" />
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
                                    {/* Block flow preview */}
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
        );
    }

    // ── Builder view ───────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800 shrink-0">
                <button
                    onClick={() => { setMode('list'); setSelectedProduct(null); setBloques([]); }}
                    className="text-slate-400 hover:text-white p-1 rounded transition-colors"
                >
                    <X size={18} />
                </button>
                <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm truncate">
                        {selectedProduct ? selectedProduct.nombre : 'Nuevo Proceso'}
                    </p>
                    {selectedProduct && (
                        <p className="text-slate-500 text-xs">{bloques.length} bloque{bloques.length !== 1 ? 's' : ''}</p>
                    )}
                </div>
                {selectedProduct && bloques.length > 0 && (
                    <button
                        onClick={saveProcess}
                        disabled={saving}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-60 flex items-center gap-2 shrink-0"
                    >
                        {saving ? <Loader size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                )}
            </div>

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
                                                    {/* Icon */}
                                                    <div className={`w-9 h-9 rounded-lg ${bt.bg} flex items-center justify-center shrink-0`}>
                                                        <Icon size={16} className={bt.color} />
                                                    </div>
                                                    {/* Info */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-slate-600 text-xs font-bold tabular-nums">{String(idx + 1).padStart(2, '0')}</span>
                                                            <p className="text-white font-semibold text-sm">{bt.label}</p>
                                                        </div>
                                                        <p className="text-slate-400 text-xs truncate">{blockSummary(bloque.tipo, bloque.params)}</p>
                                                    </div>
                                                    {/* Move */}
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
                                                    {/* Edit / Remove */}
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

            {/* Block editor modal — bottom sheet on mobile, centered on desktop */}
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
                                        {BLOCK_TYPES.map(bt => {
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
                                    <BlockParamEditor tipo={modalTipo} params={modalParams} setParams={setModalParams} />
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
