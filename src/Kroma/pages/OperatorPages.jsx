import React from 'react';
import {
    Droplets, Package, FlaskConical, Factory, Construction,
    Warehouse, ClipboardList, BookOpen, Tag, Truck, ChevronRight,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useKroma } from '../KromaContext';
import FichaBuilderPageImpl from './operator/FichaBuilderPage';
import MaterialsInventoryPageImpl from './operator/MaterialsInventoryPage';
import MilkInventoryPageImpl from './operator/MilkInventoryPage';
import DailyProductionPageImpl from './operator/DailyProductionPage';
import DespachoPageImpl from './operator/DespachoPage';

const SHORTCUT_DEFS = {
    nueva_produccion:   { label: 'Nueva Producción',      desc: 'Iniciar planilla de producción', Icon: Factory,       color: 'emerald', view: 'production'    },
    recepcion_leche:    { label: 'Recepción de Leche',    desc: 'Registrar ingreso de leche',     Icon: Droplets,      color: 'blue',    view: 'milk'          },
    inventario_insumos: { label: 'Inventario de Insumos', desc: 'Stock de materiales e insumos',  Icon: Package,       color: 'amber',   view: 'materials_inv' },
    despacho:           { label: 'Nuevo Despacho',        desc: 'Declarar mercancía en tránsito', Icon: Truck,         color: 'emerald', view: 'despacho'      },
    almacenes:          { label: 'Almacenes',             desc: 'Gestión de almacenes',           Icon: Warehouse,     color: 'violet',  view: 'warehouses'    },
    historial:          { label: 'Historial',             desc: 'Producciones anteriores',        Icon: ClipboardList, color: 'slate',   view: 'history'       },
    fichas:             { label: 'Fichas técnicas',       desc: 'Plantillas del proceso',         Icon: BookOpen,      color: 'cyan',    view: 'fichas'        },
    catalogo_productos: { label: 'Catálogo Productos',    desc: 'Productos terminados',           Icon: Tag,           color: 'rose',    view: 'products'      },
    proveedores:        { label: 'Proveedores',           desc: 'Directorio de proveedores',      Icon: Truck,         color: 'orange',  view: 'suppliers'     },
};

const COLOR_MAP = {
    emerald: { bg: 'bg-emerald-500/15', icon: 'text-emerald-400', border: 'border-emerald-500/25', hover: 'hover:border-emerald-500/50 hover:bg-emerald-500/20' },
    blue:    { bg: 'bg-blue-500/15',    icon: 'text-blue-400',    border: 'border-blue-500/25',    hover: 'hover:border-blue-500/50 hover:bg-blue-500/20'    },
    amber:   { bg: 'bg-amber-500/15',   icon: 'text-amber-400',   border: 'border-amber-500/25',   hover: 'hover:border-amber-500/50 hover:bg-amber-500/20'   },
    violet:  { bg: 'bg-violet-500/15',  icon: 'text-violet-400',  border: 'border-violet-500/25',  hover: 'hover:border-violet-500/50 hover:bg-violet-500/20'  },
    slate:   { bg: 'bg-slate-700/40',   icon: 'text-slate-400',   border: 'border-slate-600/40',   hover: 'hover:border-slate-500/60 hover:bg-slate-700/60'   },
    cyan:    { bg: 'bg-cyan-500/15',    icon: 'text-cyan-400',    border: 'border-cyan-500/25',    hover: 'hover:border-cyan-500/50 hover:bg-cyan-500/20'    },
    rose:    { bg: 'bg-rose-500/15',    icon: 'text-rose-400',    border: 'border-rose-500/25',    hover: 'hover:border-rose-500/50 hover:bg-rose-500/20'    },
    orange:  { bg: 'bg-orange-500/15',  icon: 'text-orange-400',  border: 'border-orange-500/25',  hover: 'hover:border-orange-500/50 hover:bg-orange-500/20'  },
};

// ─── Inicio del OPERARIO ──────────────────────────────────────────────────────
//
// Antes esto eran tres contadores (leche en tanque, insumos activos, fichas
// creadas). Un contador es un dato, no una instrucción: el maestro quesero
// llegaba y no sabía si tenía algo abierto, si un lote en espera ya podía
// reanudarse, ni qué tocaba hacer ahora. Ahora la pantalla responde la única
// pregunta que importa al entrar: **¿qué tengo abierto y qué sigue?**
//
// Los contadores no se borraron: bajaron a una tira secundaria, que es el lugar
// que les corresponde.

function fmtFecha(ts) {
    const d = ts?.toDate?.() || (ts ? new Date(ts) : null);
    if (!d || Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
}

function fmtHoraHold(ts) {
    const d = ts?.toDate?.() || (ts ? new Date(ts) : null);
    if (!d || Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function OperatorHome({ onNavigate }) {
    const { kromaUser } = useKroma();
    const empresaId = kromaUser?.empresaId || 'lacteoca';
    const shortcuts = (kromaUser?.shortcuts || []).map(id => SHORTCUT_DEFS[id]).filter(Boolean);

    const [data, setData] = useState(null);

    useEffect(() => {
        let vivo = true;
        const load = async () => {
            const vacio = { docs: [] };
            const q = (col) => getDocs(query(collection(db, col), where('empresaId', '==', empresaId))).catch(() => vacio);
            try {
                const [milkSnap, matSnap, fichasSnap, logsSnap, alertSnap] = await Promise.all([
                    q('kroma_milk_reception'), q('kroma_inventory_materials'),
                    q('kroma_fichas'), q('kroma_production_logs'), q('kroma_alerts'),
                ]);
                if (!vivo) return;
                const vivos = (snap) => (snap.docs || []).map(d => ({ id: d.id, ...d.data() })).filter(x => x.active !== false);

                const milkDocs = vivos(milkSnap);
                const litrosTanque = milkDocs
                    .filter(r => r.enrutamiento === 'tanque' && r.status !== 'en_proceso' && r.status !== 'inactivo')
                    .reduce((s, r) => s + (r.litros || 0), 0);

                const abiertas = vivos(logsSnap)
                    .filter(l => l.estado !== 'completada')
                    .sort((a, b) => (b.fechaInicio?.seconds || 0) - (a.fechaInicio?.seconds || 0));

                setData({
                    litrosTanque,
                    insumos: vivos(matSnap).length,
                    fichas:  vivos(fichasSnap).length,
                    abiertas,
                    // Más recientes primero: sin ordenar salían en el orden que
                    // devolviera Firestore, así que un aviso viejo podía tapar
                    // al de hoy. Se ordena en cliente a propósito — sumar
                    // orderBy al where exigiría un índice compuesto, y este
                    // proyecto no despliega índices en CI.
                    alertas: vivos(alertSnap)
                        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                        .slice(0, 4),
                });
            } catch { if (vivo) setData({ litrosTanque: 0, insumos: 0, fichas: 0, abiertas: [], alertas: [] }); }
        };
        load();
        return () => { vivo = false; };
    }, [empresaId]);

    const cargando = !data;
    const abiertas = data?.abiertas || [];
    const ahora    = Date.now();

    // Un hold cuyo plazo ya venció es lo MÁS urgente: el queso está esperando.
    const holdVencido = abiertas.find(l => {
        if (l.estado !== 'en_hold' || !l.holdHasta) return false;
        const fin = l.holdHasta?.toDate ? l.holdHasta.toDate() : new Date(l.holdHasta);
        return fin.getTime() <= ahora;
    });

    // "Lo primero": una sola frase, en orden de urgencia real.
    let titular, detalle, accion = null;
    if (cargando) {
        titular = 'Revisando la planta…';
    } else if (holdVencido) {
        titular = `Lote ${holdVencido.lote || holdVencido.productoNombre} ya puede continuar`;
        detalle = 'Su tiempo de espera se cumplió.';
        accion  = { label: 'Continuar producción', view: 'production' };
    } else if (abiertas.length > 0) {
        const l = abiertas[0];
        titular = abiertas.length === 1
            ? `${l.productoNombre} en curso`
            : `${abiertas.length} producciones en curso`;
        detalle = abiertas.length === 1
            ? `Lote ${l.lote || '—'}${l.estado === 'en_hold' ? ' · en espera' : ''}`
            : 'Retómalas donde las dejaste.';
        accion  = { label: 'Ir a producción', view: 'production' };
    } else if (data.fichas === 0) {
        titular = 'Todavía no hay fichas técnicas';
        detalle = 'Sin una ficha no se puede arrancar una producción.';
        accion  = { label: 'Ver puesta en marcha', view: 'puesta_marcha' };
    } else if (data.litrosTanque > 0) {
        titular = `${data.litrosTanque} L de leche en tanque`;
        detalle = 'No tienes nada abierto: puedes arrancar una producción.';
        accion  = { label: 'Nueva producción', view: 'production' };
    } else {
        titular = 'Sin leche en tanque';
        detalle = 'Registra una recepción para poder producir.';
        accion  = { label: 'Recepción de leche', view: 'milk' };
    }

    return (
        <div className="p-6 md:p-8">
            <h2 className="text-2xl font-bold text-white mb-1">
                Hola, {kromaUser?.name?.split(' ')[0] || 'Operario'}
            </h2>
            <p className="text-slate-400 mb-6">Esto es lo que tienes entre manos.</p>

            {/* ── Lo primero ── */}
            <section className={`rounded-2xl border p-5 mb-6 ${
                holdVencido ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-900 border-slate-800'
            }`}>
                <p className={`font-bold text-lg leading-tight ${holdVencido ? 'text-amber-300' : 'text-white'}`}>
                    {titular}
                </p>
                {detalle && <p className="text-slate-400 text-sm mt-1">{detalle}</p>}
                {accion && (
                    <button onClick={() => onNavigate?.(accion.view)}
                        className={`mt-4 inline-flex items-center gap-1.5 font-bold text-sm px-4 py-2.5 rounded-xl transition-colors ${
                            holdVencido
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-900'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}>
                        {accion.label} <ChevronRight size={15} />
                    </button>
                )}
            </section>

            {/* ── Abierto ahora ── */}
            {abiertas.length > 0 && (
                <section className="mb-6">
                    <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-3">Abierto ahora</p>
                    <div className="space-y-2">
                        {abiertas.slice(0, 5).map(l => {
                            const enHold = l.estado === 'en_hold';
                            const fin = enHold && l.holdHasta
                                ? (l.holdHasta?.toDate ? l.holdHasta.toDate() : new Date(l.holdHasta))
                                : null;
                            const vencido = fin && fin.getTime() <= ahora;
                            return (
                                <button key={l.id} onClick={() => onNavigate?.('production')}
                                    className="w-full text-left bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-600/40 rounded-xl p-4 transition-colors flex items-center gap-3">
                                    <Factory size={16} className={vencido ? 'text-amber-400 shrink-0' : 'text-slate-500 shrink-0'} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-semibold text-sm truncate">{l.productoNombre}</p>
                                        <p className="text-slate-500 text-xs mt-0.5">
                                            Lote {l.lote || '—'}
                                            {l.fechaInicio && ` · ${fmtFecha(l.fechaInicio)}`}
                                            {enHold && fin && (vencido
                                                ? <span className="text-amber-400 font-medium"> · listo para continuar</span>
                                                : <span> · en espera hasta {fmtHoraHold(fin)}</span>)}
                                        </p>
                                    </div>
                                    <ChevronRight size={15} className="text-slate-600 shrink-0" />
                                </button>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* ── Avisos del inventario ── */}
            {(data?.alertas || []).length > 0 && (
                <section className="mb-6">
                    <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-3">Avisos</p>
                    <div className="space-y-2">
                        {data.alertas.map(a => (
                            <div key={a.id} className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                                <p className="text-amber-200 text-xs leading-snug">{a.mensaje}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* ── Accesos directos (si el máster se los configuró) ── */}
            {shortcuts.length > 0 && (
                <section className="mb-6">
                    <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-3">Accesos Directos</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {shortcuts.map(({ label, desc, Icon, color, view }) => {
                            const c = COLOR_MAP[color] || COLOR_MAP.slate;
                            return (
                                <button key={view} onClick={() => onNavigate?.(view)}
                                    className={`flex flex-col items-start gap-3 p-4 rounded-xl border text-left transition-all bg-slate-900 ${c.border} ${c.hover} active:scale-95`}>
                                    <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
                                        <Icon size={20} className={c.icon} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-white font-semibold text-sm leading-tight">{label}</p>
                                        <p className="text-slate-500 text-xs mt-0.5 leading-tight">{desc}</p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* ── Los contadores, ahora en su lugar: contexto, no titular ── */}
            <section>
                <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-3">De un vistazo</p>
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { label: 'Leche en tanque', value: cargando ? null : `${data.litrosTanque} L`, Icon: Droplets,     view: 'milk' },
                        { label: 'Insumos',         value: cargando ? null : data.insumos,            Icon: Package,      view: 'materials_inv' },
                        { label: 'Fichas',          value: cargando ? null : data.fichas,             Icon: FlaskConical, view: 'fichas' },
                    ].map(({ label, value, Icon, view }) => (
                        <button key={label} onClick={() => onNavigate?.(view)}
                            className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 text-left transition-colors active:scale-95">
                            <Icon size={15} className="text-slate-500 mb-2" />
                            <p className="text-lg font-bold text-white font-mono leading-none">
                                {value === null ? <span className="text-slate-700 text-sm">—</span> : value}
                            </p>
                            <p className="text-slate-500 text-xs mt-1 leading-tight">{label}</p>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
}

export const MilkInventoryPage = () => <MilkInventoryPageImpl />;

export const MaterialsInventoryPage = () => <MaterialsInventoryPageImpl />;

export const FichaBuilderPage = () => <FichaBuilderPageImpl />;

export const DailyProductionPage = () => <DailyProductionPageImpl />;

export const DespachoPage = () => <DespachoPageImpl />;
