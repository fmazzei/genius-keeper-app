import React from 'react';
import {
    Droplets, Package, FlaskConical, Factory, Construction,
    Warehouse, ClipboardList, BookOpen, Tag, Truck, ChevronRight,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useKroma } from '../KromaContext';
import ProcessBuilderPageImpl from './operator/ProcessBuilderPage';
import RecipeBuilderPageImpl from './operator/RecipeBuilderPage';
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
    fichas:             { label: 'Fichas y Recetas',      desc: 'Constructores de recetas',       Icon: BookOpen,      color: 'cyan',    view: 'fichas'        },
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

export function OperatorHome({ onNavigate }) {
    const { kromaUser } = useKroma();
    const shortcuts = (kromaUser?.shortcuts || []).map(id => SHORTCUT_DEFS[id]).filter(Boolean);
    const [stats, setStats] = useState({ litrosTanque: null, litrosEnProceso: null, insumos: null, recetas: null });

    useEffect(() => {
        const load = async () => {
            try {
                const [milkSnap, matSnap, fichasSnap] = await Promise.all([
                    getDocs(query(collection(db, 'kroma_milk_reception'), where('active', '!=', false))),
                    getDocs(query(collection(db, 'kroma_inventory_materials'), where('active', '!=', false))),
                    getDocs(query(collection(db, 'kroma_fichas'), where('active', '!=', false))),
                ]);
                const milkDocs = milkSnap.docs.map(d => d.data());
                const litrosTanque = milkDocs
                    .filter(r => r.enrutamiento === 'tanque' && r.status !== 'en_proceso' && r.status !== 'inactivo')
                    .reduce((s, r) => s + (r.litros || 0), 0);
                // "en proceso" = already linked to a production log (status en_proceso)
                //              + direct milk (enrutamiento produccion) pending use
                const litrosEnProceso = milkDocs
                    .filter(r =>
                        r.status === 'en_proceso' ||
                        (r.enrutamiento === 'produccion' && r.status !== 'inactivo' && r.status !== 'completada')
                    )
                    .reduce((s, r) => s + (r.litros || 0), 0);
                const recetas = fichasSnap.size;
                setStats({ litrosTanque, litrosEnProceso, insumos: matSnap.size, recetas });
            } catch {}
        };
        load();
    }, []);

    const STAT_TILES = [
        {
            label: 'Leche en Tanque',
            value: stats.litrosTanque === null ? null : `${stats.litrosTanque} L`,
            sub:   stats.litrosEnProceso > 0 ? `${stats.litrosEnProceso} L en producción` : null,
            color: 'blue', Icon: Droplets, view: 'milk',
        },
        { label: 'Insumos Activos', value: stats.insumos,  color: 'emerald', Icon: Package,      view: 'materials_inv' },
        { label: 'Fichas Creadas',  value: stats.recetas,  color: 'violet',  Icon: FlaskConical,  view: 'fichas'        },
    ];

    return (
        <div className="p-6 md:p-8">
            <h2 className="text-2xl font-bold text-white mb-1">
                Hola, {kromaUser?.name?.split(' ')[0] || 'Operario'}
            </h2>
            <p className="text-slate-400 mb-8">Bienvenido a tu panel de trabajo.</p>

            {/* Shortcuts */}
            {shortcuts.length > 0 && (
                <section className="mb-8">
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

            {/* Stats — connected and interactive */}
            <section>
                <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-3">Resumen</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {STAT_TILES.map(({ label, value, sub, color, Icon, view }) => {
                        const c = COLOR_MAP[color] || COLOR_MAP.slate;
                        return (
                            <button key={label} onClick={() => onNavigate?.(view)}
                                className={`bg-slate-900 border ${c.border} ${c.hover} rounded-xl p-5 text-left transition-all active:scale-95`}>
                                <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center mb-3`}>
                                    <Icon size={18} className={c.icon} />
                                </div>
                                <p className="text-2xl font-bold text-white font-mono">
                                    {value === null ? <span className="text-slate-600 text-base">—</span> : value}
                                </p>
                                <p className="text-slate-400 text-sm mt-1">{label}</p>
                                {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
                            </button>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}

export const MilkInventoryPage = () => <MilkInventoryPageImpl />;

export const MaterialsInventoryPage = () => <MaterialsInventoryPageImpl />;

export const FichaBuilderPage = () => <FichaBuilderPageImpl />;

export const RecipeBuilderPage = () => <RecipeBuilderPageImpl />;

export const ProcessBuilderPage = () => <ProcessBuilderPageImpl />;

export const DailyProductionPage = () => <DailyProductionPageImpl />;

export const DespachoPage = () => <DespachoPageImpl />;
