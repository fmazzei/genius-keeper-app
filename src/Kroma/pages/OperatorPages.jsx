import React from 'react';
import {
    Droplets, Package, Factory,
    Warehouse, ClipboardList, BookOpen, Tag, Truck, ChevronRight,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useKroma } from '../KromaContext';
import { esLecheEnTanque, esProduccionAbierta, fechaProduccion, kgProducidos } from '../estadoPlanta.js';
import AvisosKroma from '../Components/AvisosKroma.jsx';
import PlantaAhora from '../Components/PlantaAhora.jsx';
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
// Pedido del dueño (19-nov), con la captura del inicio de Diana: la tarjeta
// «Lacteoca Chèvre Original en curso · Ir a producción» y la lista «Abierto
// ahora» llevaban al MISMO sitio. Dos cosas que dicen lo mismo no son
// información: son ruido. Ahora la pantalla tiene, en este orden:
//
//   1. Una ALERTA arriba por cada producción en proceso (casi siempre una). Al
//      tocarla se abre ESA producción, en el paso donde quedó.
//   2. Si no hay nada en proceso, una sola acción: arrancar (si hay leche) o
//      registrar la leche.
//   3. Los indicadores, cerca y no al fondo.
//   4. «Por envasar» en UN renglón: al tocarlo se despliegan las producciones
//      con queso a granel en cava, cada una con su botón «Envasar».
//
// Palabras (decisión del dueño): una producción está CERRADA cuando el queso
// salió —dejó de desuerarse y pasó a la cava, aunque sea a granel—. Lo que
// queda después es ENVASAR, que es otra cosa. Por eso aquí se dice «en
// proceso» y «por envasar», nunca «sin cerrar».

const fmtKg = (n) => (Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 1 });

export function OperatorHome({ onNavigate }) {
    const { kromaUser, kromaRole } = useKroma();
    const empresaId = kromaUser?.empresaId || 'lacteoca';
    const shortcuts = (kromaUser?.shortcuts || []).map(id => SHORTCUT_DEFS[id]).filter(Boolean);

    const [data, setData] = useState(null);

    useEffect(() => {
        let vivo = true;
        const load = async () => {
            const vacio = { docs: [] };
            const q = (col) => getDocs(query(collection(db, col), where('empresaId', '==', empresaId))).catch(() => vacio);
            try {
                const [milkSnap, fichasSnap, logsSnap, alertSnap] = await Promise.all([
                    q('kroma_milk_reception'), q('kroma_fichas'), q('kroma_production_logs'), q('kroma_alerts'),
                ]);
                if (!vivo) return;
                const vivos = (snap) => (snap.docs || []).map(d => ({ id: d.id, ...d.data() })).filter(x => x.active !== false);

                // Definición compartida con la pantalla de Leche (ver estadoPlanta.js).
                const lecheEsperando = vivos(milkSnap).filter(esLecheEnTanque);

                const todosLogs = vivos(logsSnap);
                const enProceso = todosLogs.filter(esProduccionAbierta);

                // Lo producido en el mes: lotes CERRADOS (el queso ya salió).
                const hoy = new Date();
                const delMes = todosLogs.filter(l => {
                    if (esProduccionAbierta(l)) return false;
                    const f = fechaProduccion(l);
                    return f && f.getFullYear() === hoy.getFullYear() && f.getMonth() === hoy.getMonth();
                });

                setData({
                    logs: todosLogs,
                    litrosTanque: lecheEsperando.reduce((s, r) => s + (r.litros || 0), 0),
                    recepcionesEsperando: lecheEsperando.length,
                    fichas: vivos(fichasSnap).length,
                    enProceso,
                    kgMes: delMes.reduce((s, l) => s + kgProducidos(l), 0),
                    lotesMes: delMes.length,
                    alertas: vivos(alertSnap),
                });
            } catch {
                if (vivo) setData({ logs: [], litrosTanque: 0, recepcionesEsperando: 0, fichas: 0, enProceso: [], kgMes: 0, lotesMes: 0, alertas: [] });
            }
        };
        load();
        return () => { vivo = false; };
    }, [empresaId]);

    const cargando = !data;
    const enProceso  = data?.enProceso || [];

    // Si no hay nada en proceso: UNA acción, la que toca.
    let siguiente = null;
    if (!cargando && enProceso.length === 0) {
        if (data.fichas === 0) {
            siguiente = { titulo: 'Todavía no hay fichas técnicas', detalle: 'Sin una ficha no se puede arrancar una producción.', label: 'Ver puesta en marcha', view: 'puesta_marcha' };
        } else if (data.litrosTanque > 0) {
            siguiente = { titulo: `${fmtKg(data.litrosTanque)} L de leche esperando`, detalle: 'No hay nada en proceso: puedes arrancar.', label: 'Nueva producción', view: 'production', params: { nueva: true } };
        } else {
            siguiente = { titulo: 'No hay leche esperando', detalle: 'Registra la leche que llegó para poder producir.', label: 'Registrar leche', view: 'milk' };
        }
    }

    return (
        <div className="p-5 md:p-8 space-y-5">
            <div>
                <h2 className="text-2xl font-bold text-white">
                    Hola, {kromaUser?.name?.split(' ')[0] || 'Operario'}
                </h2>
                {cargando && <p className="text-slate-500 text-sm mt-1">Revisando la planta…</p>}
            </div>

            {/* ── 1. En proceso (alerta arriba) y por envasar (un renglón) ── */}
            {data && <PlantaAhora logs={data.logs} onNavigate={onNavigate} />}

            {/* ── 2. Sin nada en proceso: la siguiente acción ── */}
            {siguiente && (
                <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                        <p className="text-white font-bold leading-tight">{siguiente.titulo}</p>
                        <p className="text-slate-400 text-xs mt-0.5">{siguiente.detalle}</p>
                    </div>
                    <button onClick={() => onNavigate?.(siguiente.view, siguiente.params || null)}
                        className="shrink-0 inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold px-4 py-2.5 rounded-xl">
                        {siguiente.label} <ChevronRight size={15} />
                    </button>
                </section>
            )}

            {/* ── 3. Indicadores ── */}
            <section className="grid grid-cols-3 gap-2.5">
                {[
                    { label: 'Leche esperando', value: cargando ? null : `${fmtKg(data.litrosTanque)} L`, Icon: Droplets, view: 'milk' },
                    { label: 'Producido este mes', value: cargando ? null : `${fmtKg(data.kgMes)} kg`, Icon: Factory, view: 'production' },
                    { label: 'Lotes este mes', value: cargando ? null : data.lotesMes, Icon: ClipboardList, view: 'production' },
                ].map(({ label, value, Icon, view }) => (
                    <button key={label} onClick={() => onNavigate?.(view)}
                        className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-3 text-left active:scale-95 transition-transform">
                        <Icon size={14} className="text-slate-500 mb-1.5" />
                        <p className="text-lg font-bold text-white font-mono leading-none">
                            {value === null ? <span className="text-slate-700 text-sm">—</span> : value}
                        </p>
                        <p className="text-slate-500 text-[11px] mt-1 leading-tight">{label}</p>
                    </button>
                ))}
            </section>

            {/* ── Avisos del inventario ──
                Al operario NO se le muestran (pedido del dueño, 19-nov: con los
                avisos de falta de insumos «se enreda y no sabe qué hacer»). Las
                compras son de administración: los avisos siguen llegando allá. */}
            {kromaRole !== 'kroma_operario' && (
                <AvisosKroma alertas={data?.alertas || []} userId={kromaUser?.id} />
            )}

            {/* ── Accesos directos (si el máster se los configuró) ── */}
            {shortcuts.length > 0 && (
                <section>
                    <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-3">Accesos directos</p>
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
        </div>
    );
}

export const MilkInventoryPage = (props) => <MilkInventoryPageImpl {...props} />;

export const MaterialsInventoryPage = (props) => <MaterialsInventoryPageImpl {...props} />;

export const FichaBuilderPage = (props) => <FichaBuilderPageImpl {...props} />;

export const DailyProductionPage = (props) => <DailyProductionPageImpl {...props} />;

export const DespachoPage = (props) => <DespachoPageImpl {...props} />;
