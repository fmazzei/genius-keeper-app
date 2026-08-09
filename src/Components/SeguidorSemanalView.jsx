// RUTA: src/Components/SeguidorSemanalView.jsx
//
// SEGUIDOR SEMANAL del vendedor: cada indicador es un número que debe bajar a
// cero (o subir a la meta), con la lista concreta detrás para actuar. Lunes a
// domingo. Sirve igual al vendedor (tema oscuro) y al máster/gerencia para
// supervisar (tema claro), con los mismos números.

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Flame, PackageMinus, AlertOctagon, CalendarClock, Receipt, Truck, Users,
    ChevronRight, X, CheckCircle2, Link2Off,
} from 'lucide-react';

const THEME = {
    light: {
        wrap: '', title: 'text-slate-800', meta: 'text-slate-500',
        card: 'bg-white border border-slate-200 hover:border-slate-300', num: 'text-slate-800',
        sheet: 'bg-slate-50', row: 'bg-white border border-slate-200', chip: 'bg-slate-100 text-slate-600',
        ok: 'bg-emerald-50 border border-emerald-200 text-emerald-700', bar: 'bg-slate-200',
    },
    dark: {
        wrap: '', title: 'text-white', meta: 'text-slate-400',
        card: 'bg-slate-900 border border-slate-800 hover:border-slate-700', num: 'text-white',
        sheet: 'bg-slate-900', row: 'bg-slate-800/60 border border-slate-700', chip: 'bg-slate-800 text-slate-300',
        ok: 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300', bar: 'bg-slate-800',
    },
};

const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;
const fmtDia = (d) => d ? d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }) : '—';

// Severidad → color del número y del punto.
const TONO = {
    rojo:  { txt: 'text-red-500',     dot: 'bg-red-500' },
    ambar: { txt: 'text-amber-500',   dot: 'bg-amber-500' },
    azul:  { txt: 'text-sky-500',     dot: 'bg-sky-500' },
    verde: { txt: 'text-emerald-500', dot: 'bg-emerald-500' },
};

export default function SeguidorSemanalView({ data, theme = 'dark', onIrACobranza = null, onIrAPedidos = null }) {
    const t = THEME[theme] || THEME.dark;
    const [detalle, setDetalle] = useState(null); // { titulo, items, render }

    if (!data) return null;
    const { semana, sinFacturar, anaquelBajo, quiebres, porVencer, cobranza, despachos, mercaderista, cobertura } = data;

    const abrir = (titulo, subtitulo, items, render) => setDetalle({ titulo, subtitulo, items, render });

    // Definición de las líneas del seguidor, en orden de prioridad de negocio.
    const LINEAS = [
        {
            key: 'sinFacturar', Icon: Flame,
            label: `PDV sin facturar +${sinFacturar ? data.cfg.diasSinFacturar : 8} días`,
            valor: sinFacturar.count,
            tono: sinFacturar.count > 0 ? 'rojo' : 'verde',
            pie: sinFacturar.activadosSemana > 0
                ? `${sinFacturar.activadosSemana} activado${sinFacturar.activadosSemana !== 1 ? 's' : ''} esta semana`
                : 'Activar la cartera es la prioridad',
            onClick: () => abrir('PDV sin facturar', 'Ordenados por días sin comprar', sinFacturar.items,
                (i) => (
                    <>
                        <p className="font-bold text-sm">{i.nombre}</p>
                        <p className="text-xs opacity-70">{i.zona}</p>
                        <span className={`text-xs font-black ${i.nunca ? 'text-red-500' : i.dias >= 15 ? 'text-red-500' : 'text-amber-500'}`}>
                            {i.nunca ? 'Nunca ha facturado' : `${i.dias} días`}
                        </span>
                    </>
                )),
        },
        {
            key: 'anaquel', Icon: PackageMinus,
            label: `Anaquel bajo ${anaquelBajo.piso} uds`,
            valor: anaquelBajo.count,
            tono: anaquelBajo.count > 0 ? 'ambar' : 'verde',
            pie: 'Hay que meter la próxima OC',
            onClick: () => abrir('Anaquel bajo el piso', `Menos de ${anaquelBajo.piso} unidades en la última visita`, anaquelBajo.items,
                (i) => (
                    <>
                        <p className="font-bold text-sm">{i.nombre}</p>
                        <p className="text-xs opacity-70">Visto {fmtDia(i.visita)} · {i.zona}</p>
                        <span className="text-xs font-black text-amber-500">{i.nivel} uds · faltan {i.faltan}</span>
                    </>
                )),
        },
        {
            key: 'quiebres', Icon: AlertOctagon,
            label: 'Quiebres de stock',
            valor: quiebres.count,
            tono: quiebres.count > 0 ? 'rojo' : 'verde',
            pie: 'Cero producto en anaquel',
            onClick: () => abrir('Quiebres de stock', 'Sin producto en la última visita', quiebres.items,
                (i) => (
                    <>
                        <p className="font-bold text-sm">{i.nombre}</p>
                        <p className="text-xs opacity-70">Visto {fmtDia(i.visita)} · {i.zona}</p>
                        <span className="text-xs font-black text-red-500">0 uds</span>
                    </>
                )),
        },
        {
            key: 'porVencer', Icon: CalendarClock,
            label: 'PDV con producto por vencer',
            valor: porVencer.count,
            tono: porVencer.count > 0 ? 'ambar' : 'verde',
            pie: 'Rotar, promocionar o retirar',
            onClick: () => abrir('Producto por vencer', 'Según el último reporte de visita', porVencer.items,
                (i) => (
                    <>
                        <p className="font-bold text-sm">{i.nombre}</p>
                        <p className="text-xs opacity-70">Vence {i.vence}{i.unidades ? ` · ${i.unidades} uds` : ''} · {i.zona}</p>
                        <span className={`text-xs font-black ${i.diasParaVencer <= 0 ? 'text-red-500' : i.diasParaVencer <= 15 ? 'text-red-500' : 'text-amber-500'}`}>
                            {i.diasParaVencer <= 0 ? 'Vencido' : `${i.diasParaVencer} días`}
                        </span>
                    </>
                )),
        },
        {
            key: 'cobranza', Icon: Receipt,
            label: 'Facturas vencidas por cobrar',
            valor: cobranza.count,
            tono: cobranza.count > 0 ? 'rojo' : 'verde',
            pie: cobranza.count > 0 ? `${money(cobranza.monto)} por cobrar` : 'Cartera al día',
            onClick: () => abrir('Facturas vencidas', `${money(cobranza.monto)} por cobrar`, cobranza.items,
                (i) => (
                    <>
                        <p className="font-bold text-sm">{i.cliente}</p>
                        <p className="text-xs opacity-70">{i.id}</p>
                        <span className="text-xs font-black text-red-500">{money(i.monto)} · {i.diasVencida} d</span>
                    </>
                )),
        },
        {
            key: 'despachos', Icon: Truck,
            label: 'Despachos por realizar',
            valor: despachos.count,
            tono: despachos.count > 0 ? 'azul' : 'verde',
            pie: 'Pedidos tomados sin despachar',
            onClick: () => abrir('Despachos por realizar', 'Pedidos pendientes', despachos.items,
                (i) => (
                    <>
                        <p className="font-bold text-sm">{i.nombre}</p>
                        <p className="text-xs opacity-70">Tomado {fmtDia(i.fecha)}</p>
                        <span className="text-xs font-black text-sky-500">{i.cantidad} uds</span>
                    </>
                )),
        },
    ];

    return (
        <div className="space-y-3">
            {/* Encabezado de la semana */}
            <div className="flex items-baseline justify-between gap-2">
                <div>
                    <p className={`text-[11px] font-extrabold uppercase tracking-widest ${t.meta}`}>Tu semana</p>
                    <p className={`text-lg font-black ${t.title}`}>
                        {fmtDia(semana.desde)} — {fmtDia(new Date(semana.hasta.getTime() - 86400000))}
                    </p>
                </div>
                {sinFacturar.activadosSemana > 0 && (
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${t.ok}`}>
                        <CheckCircle2 size={12} className="inline mr-1" />
                        {sinFacturar.activadosSemana} activados
                    </span>
                )}
            </div>

            {/* Aviso de PDV sin vincular: el indicador principal depende del vínculo */}
            {cobertura.sinVincular > 0 && (
                <div className="flex items-start gap-2 text-xs rounded-xl px-3 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-500">
                    <Link2Off size={14} className="shrink-0 mt-0.5" />
                    <span>
                        <b>{cobertura.sinVincular} PDV sin vincular</b> a su cliente de Zoho — no cuentan en "sin facturar".
                        Vincúlalos en la ficha del PDV (campo "Razón social en Zoho").
                    </span>
                </div>
            )}

            {/* Indicadores */}
            <div className="space-y-2">
                {LINEAS.map(({ key, Icon, label, valor, tono, pie, onClick }) => {
                    const c = TONO[tono];
                    return (
                        <button key={key} onClick={onClick} disabled={valor === 0}
                            className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors disabled:cursor-default ${t.card}`}>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                            <Icon size={18} className={`shrink-0 ${t.meta}`} />
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-bold leading-snug ${t.title}`}>{label}</p>
                                <p className={`text-xs leading-snug ${t.meta}`}>{pie}</p>
                            </div>
                            <span className={`text-3xl font-black tabular-nums shrink-0 ${valor === 0 ? 'text-emerald-500' : c.txt}`}>{valor}</span>
                            {valor > 0 && <ChevronRight size={16} className={`shrink-0 ${t.meta}`} />}
                        </button>
                    );
                })}

                {/* Supervisión del mercaderista */}
                <button
                    onClick={() => mercaderista.items.length && abrir(
                        'PDV por cubrir', `Meta: ${mercaderista.visitasPorPdv} visitas por PDV esta semana`, mercaderista.items,
                        (i) => (
                            <>
                                <p className="font-bold text-sm">{i.nombre}</p>
                                <p className="text-xs opacity-70">{i.zona}</p>
                                <span className="text-xs font-black text-indigo-400">{i.visitas}/{mercaderista.visitasPorPdv} · faltan {i.faltan}</span>
                            </>
                        ))}
                    disabled={mercaderista.items.length === 0}
                    className={`w-full rounded-xl px-4 py-3 text-left transition-colors disabled:cursor-default ${t.card}`}
                >
                    <div className="flex items-center gap-3">
                        <Users size={18} className={`shrink-0 ${t.meta}`} />
                        <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold leading-snug ${t.title}`}>Tu mercaderista</p>
                            <p className={`text-xs leading-snug ${t.meta}`}>
                                Meta {mercaderista.visitasPorPdv} visitas/semana en {mercaderista.pdvTotal} PDV
                            </p>
                        </div>
                        <div className="text-right shrink-0">
                            <p className={`text-2xl font-black tabular-nums ${mercaderista.faltan === 0 ? 'text-emerald-500' : 'text-indigo-400'}`}>
                                {mercaderista.hechas}<span className={`text-sm ${t.meta}`}>/{mercaderista.meta}</span>
                            </p>
                            {mercaderista.faltan > 0 && <p className="text-[11px] text-indigo-400 font-bold">faltan {mercaderista.faltan}</p>}
                        </div>
                    </div>
                    <div className={`h-2 rounded-full overflow-hidden mt-2 ${t.bar}`}>
                        <div className="h-full rounded-full bg-indigo-500 transition-all"
                             style={{ width: `${Math.min(100, mercaderista.pct || 0)}%` }} />
                    </div>
                </button>
            </div>

            {/* Detalle */}
            {detalle && createPortal(
                <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
                     onClick={() => setDetalle(null)}>
                    <div className={`w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[85vh] flex flex-col shadow-2xl ${t.sheet}`}
                         onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between px-5 py-4 shrink-0">
                            <div>
                                <h3 className={`text-base font-black ${t.title}`}>{detalle.titulo}</h3>
                                <p className={`text-xs ${t.meta}`}>{detalle.subtitulo} · {detalle.items.length}</p>
                            </div>
                            <button onClick={() => setDetalle(null)} className={`p-1 ${t.meta}`}><X size={18} /></button>
                        </div>
                        <div className="px-5 pb-6 overflow-y-auto space-y-2">
                            {detalle.items.map((i, idx) => (
                                <div key={idx} className={`rounded-xl px-3 py-2.5 ${t.row} ${t.title}`}>
                                    {detalle.render(i)}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
