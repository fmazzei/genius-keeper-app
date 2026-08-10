// RUTA: src/Components/SeguidorSemanalView.jsx
//
// SEGUIDOR SEMANAL del vendedor. No es una lista de tareas: cada indicador es un
// número que debe bajar a cero, con la lista concreta detrás para actuar.
//
// Los indicadores NO tienen un orden fijo: cada uno calcula su NIVEL DE URGENCIA
// y sube o baja solo. Se agrupan en tres zonas — "Atiende ya" (tarjetas grandes),
// "Esta semana" (compactas) y "En verde" (colapsado) — para que el vendedor vea
// primero lo que quema. Lunes a domingo.
//
// Sirve al vendedor (tema oscuro) y al máster/gerencia para supervisar (claro).

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Flame, PackageMinus, AlertOctagon, CalendarClock, Receipt, Truck, Users,
    ChevronRight, ChevronLeft, X, CheckCircle2, Link2Off, ChevronDown,
} from 'lucide-react';

const THEME = {
    light: {
        title: 'text-slate-800', meta: 'text-slate-500', soft: 'text-slate-400',
        hero: 'bg-white border border-slate-200', card: 'bg-white border border-slate-200',
        mini: 'bg-white border border-slate-200', sheet: 'bg-slate-50',
        row: 'bg-white border border-slate-200', chip: 'bg-slate-100 text-slate-600',
        bar: 'bg-slate-200', okBox: 'bg-emerald-50 border border-emerald-200',
    },
    dark: {
        title: 'text-white', meta: 'text-slate-400', soft: 'text-slate-500',
        hero: 'bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800',
        card: 'bg-slate-900 border border-slate-800', mini: 'bg-slate-900 border border-slate-800',
        sheet: 'bg-slate-900', row: 'bg-slate-800/60 border border-slate-700',
        chip: 'bg-slate-800 text-slate-300', bar: 'bg-slate-800',
        okBox: 'bg-emerald-500/10 border border-emerald-500/30',
    },
};

// Paleta por nivel de urgencia (3 = quema, 0 = en verde).
const NIVEL = {
    3: { txt: 'text-red-500',     bg: 'bg-red-500/10',     ring: 'ring-1 ring-red-500/30',     stripe: 'bg-red-500' },
    2: { txt: 'text-amber-500',   bg: 'bg-amber-500/10',   ring: 'ring-1 ring-amber-500/25',   stripe: 'bg-amber-500' },
    1: { txt: 'text-sky-500',     bg: 'bg-sky-500/10',     ring: '',                            stripe: 'bg-sky-500' },
    0: { txt: 'text-emerald-500', bg: 'bg-emerald-500/10', ring: '',                            stripe: 'bg-emerald-500' },
};

const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;
const fmtDia = (d) => d ? d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }) : '—';

// periodoCtl (opcional): { gran, setGran, offset, setOffset, label, actual }
// Permite navegar el histórico por semana o por mes. Sin él, la vista muestra
// solo el período que le pasen (comportamiento original).
export default function SeguidorSemanalView({ data, theme = 'dark', periodoCtl = null, titulo = null }) {
    const t = THEME[theme] || THEME.dark;
    const [detalle, setDetalle] = useState(null);
    const [verVerdes, setVerVerdes] = useState(false);

    if (!data) return null;
    const { semana, cfg, sinFacturar, anaquelBajo, quiebres, porVencer, cobranza, despachos, mercaderista, cobertura } = data;
    const abrir = (titulo, subtitulo, items, render) => setDetalle({ titulo, subtitulo, items, render });

    // ── Cada indicador declara su nivel de urgencia; el orden sale de ahí ──
    const peorVencimiento = porVencer.items[0]?.diasParaVencer ?? null;
    const peorMora = cobranza.items[0]?.diasVencida ?? 0;

    const LINEAS = [
        {
            key: 'sinFacturar', Icon: Flame, label: `PDV sin facturar +${cfg.diasSinFacturar} días`,
            valor: sinFacturar.count,
            nivel: sinFacturar.count >= 10 ? 3 : sinFacturar.count >= 4 ? 2 : sinFacturar.count > 0 ? 1 : 0,
            accion: 'Activa la cartera: llama o visita',
            desglose: sinFacturar.heredados > 0
                ? `${sinFacturar.heredados} ya venían fríos · ${sinFacturar.propios} de su gestión`
                : null,
            onClick: () => abrir('PDV sin facturar', 'Del más frío al más reciente', sinFacturar.items,
                (i) => (<>
                    <p className="font-bold text-sm">
                        {i.nombre}
                        {i.heredado && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-500/20 text-slate-400 align-middle">Heredado</span>}
                    </p>
                    <p className="text-xs opacity-70">{i.zona}</p>
                    <span className={`text-xs font-black ${i.nunca || i.dias >= 15 ? 'text-red-500' : 'text-amber-500'}`}>
                        {i.nunca ? 'Nunca ha facturado' : `${i.dias} días`}
                    </span>
                </>)),
        },
        {
            key: 'quiebres', Icon: AlertOctagon, label: 'Quiebres de stock',
            valor: quiebres.count,
            nivel: quiebres.count > 0 ? 3 : 0,          // sin producto = venta perdida hoy
            accion: 'Cero producto en anaquel: repón ya',
            onClick: () => abrir('Quiebres de stock', 'Sin producto en la última visita', quiebres.items,
                (i) => (<>
                    <p className="font-bold text-sm">{i.nombre}</p>
                    <p className="text-xs opacity-70">Visto {fmtDia(i.visita)} · {i.zona}</p>
                    <span className="text-xs font-black text-red-500">0 uds</span>
                </>)),
        },
        {
            key: 'cobranza', Icon: Receipt, label: 'Facturas vencidas por cobrar',
            valor: cobranza.count, sufijo: cobranza.count > 0 ? money(cobranza.monto) : null,
            nivel: cobranza.count === 0 ? 0 : peorMora > 30 ? 3 : 2,
            accion: peorMora > 30 ? `Hay mora de ${peorMora} días: cobra hoy` : 'Cobra antes de que envejezca',
            desglose: cobranza.heredadas > 0
                ? `${cobranza.heredadas} heredadas (${money(cobranza.montoHeredado)}) · ${cobranza.propias} suyas (${money(cobranza.montoPropio)})`
                : null,
            onClick: () => abrir('Facturas vencidas', `${money(cobranza.monto)} por cobrar`, cobranza.items,
                (i) => (<>
                    <p className="font-bold text-sm">
                        {i.cliente}
                        {i.heredada && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-500/20 text-slate-400 align-middle">Heredada</span>}
                    </p>
                    <p className="text-xs opacity-70">{i.id}</p>
                    <span className="text-xs font-black text-red-500">{money(i.monto)} · {i.diasVencida} d</span>
                </>)),
        },
        {
            key: 'porVencer', Icon: CalendarClock, label: 'PDV con producto por vencer',
            valor: porVencer.count,
            nivel: porVencer.count === 0 ? 0 : (peorVencimiento !== null && peorVencimiento <= 15) ? 3 : 2,
            accion: (peorVencimiento !== null && peorVencimiento <= 0)
                ? 'Hay producto VENCIDO en anaquel'
                : 'Rota, promociona o retira',
            onClick: () => abrir('Producto por vencer', 'Según el último reporte de visita', porVencer.items,
                (i) => (<>
                    <p className="font-bold text-sm">{i.nombre}</p>
                    <p className="text-xs opacity-70">Vence {i.vence}{i.unidades ? ` · ${i.unidades} uds` : ''} · {i.zona}</p>
                    <span className={`text-xs font-black ${i.diasParaVencer <= 15 ? 'text-red-500' : 'text-amber-500'}`}>
                        {i.diasParaVencer <= 0 ? 'Vencido' : `${i.diasParaVencer} días`}
                    </span>
                </>)),
        },
        {
            key: 'anaquel', Icon: PackageMinus, label: `Anaquel bajo ${anaquelBajo.piso} uds`,
            valor: anaquelBajo.count,
            nivel: anaquelBajo.count >= 5 ? 2 : anaquelBajo.count > 0 ? 1 : 0,
            accion: 'Mete la próxima OC antes del quiebre',
            onClick: () => abrir('Anaquel bajo el piso', `Menos de ${anaquelBajo.piso} unidades en la última visita`, anaquelBajo.items,
                (i) => (<>
                    <p className="font-bold text-sm">{i.nombre}</p>
                    <p className="text-xs opacity-70">Visto {fmtDia(i.visita)} · {i.zona}</p>
                    <span className="text-xs font-black text-amber-500">{i.nivel} uds · faltan {i.faltan}</span>
                </>)),
        },
        {
            key: 'despachos', Icon: Truck, label: 'Despachos por realizar',
            valor: despachos.count,
            nivel: despachos.count >= 5 ? 2 : despachos.count > 0 ? 1 : 0,
            accion: 'Pedidos tomados sin despachar',
            onClick: () => abrir('Despachos por realizar', 'Pedidos pendientes', despachos.items,
                (i) => (<>
                    <p className="font-bold text-sm">{i.nombre}</p>
                    <p className="text-xs opacity-70">Tomado {fmtDia(i.fecha)}</p>
                    <span className="text-xs font-black text-sky-500">{i.cantidad} uds</span>
                </>)),
        },
    ];

    // Orden dinámico: más urgente primero; a igual urgencia, el número más grande.
    const orden = [...LINEAS].sort((a, b) => b.nivel - a.nivel || b.valor - a.valor);
    const urgentes = orden.filter(l => l.nivel === 3);
    const medios   = orden.filter(l => l.nivel === 1 || l.nivel === 2);
    const verdes   = orden.filter(l => l.nivel === 0);

    const totalIndicadores = LINEAS.length;
    const enVerde = verdes.length;
    const foco = urgentes[0] || medios[0] || null;

    return (
        <div className="space-y-4">

            {/* ── Pulso de la semana + foco ── */}
            <div className={`rounded-2xl p-4 ${t.hero}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                        <p className={`text-[10px] font-extrabold uppercase tracking-[0.2em] ${t.soft}`}>
                            {titulo || (periodoCtl?.gran === 'mes' ? 'Mes' : 'Tu semana')}
                        </p>
                        <p className={`text-xl font-black leading-tight capitalize ${t.title}`}>
                            {periodoCtl?.label || `${fmtDia(semana.desde)} — ${fmtDia(new Date(semana.hasta.getTime() - 86400000))}`}
                        </p>
                        {semana.enCurso === false && (
                            <p className={`text-[11px] ${t.soft}`}>Cerrado · foto al final del período</p>
                        )}
                    </div>
                    {sinFacturar.activadosSemana > 0 && (
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${t.okBox} text-emerald-400`}>
                            <CheckCircle2 size={12} className="inline mr-1" />{sinFacturar.activadosSemana} activados
                        </span>
                    )}
                </div>

                {/* Navegación del histórico: semana/mes + anterior/siguiente */}
                {periodoCtl && (
                    <div className="flex items-center gap-2 mb-3">
                        <div className={`flex rounded-lg p-0.5 ${t.bar}`}>
                            {[['semana', 'Semana'], ['mes', 'Mes']].map(([g, lbl]) => (
                                <button key={g} onClick={() => { periodoCtl.setGran(g); periodoCtl.setOffset(0); }}
                                    className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                                        periodoCtl.gran === g ? 'bg-emerald-600 text-white' : t.meta
                                    }`}>{lbl}</button>
                            ))}
                        </div>
                        <div className="ml-auto flex items-center gap-1">
                            <button onClick={() => periodoCtl.setOffset(periodoCtl.offset - 1)}
                                aria-label="Período anterior"
                                className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.bar} ${t.title}`}>
                                <ChevronLeft size={16} />
                            </button>
                            <button onClick={() => periodoCtl.setOffset(Math.min(0, periodoCtl.offset + 1))}
                                disabled={periodoCtl.offset >= 0} aria-label="Período siguiente"
                                className={`w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30 ${t.bar} ${t.title}`}>
                                <ChevronRight size={16} />
                            </button>
                            {periodoCtl.offset !== 0 && (
                                <button onClick={() => periodoCtl.setOffset(0)}
                                    className={`px-2 h-8 rounded-lg text-xs font-bold ${t.chip}`}>Hoy</button>
                            )}
                        </div>
                    </div>
                )}

                {/* Semáforo compacto: un segmento por indicador, ordenado por urgencia */}
                <div className="flex gap-1 mb-2">
                    {orden.map(l => (
                        <span key={l.key} className={`h-1.5 flex-1 rounded-full ${NIVEL[l.nivel].stripe} ${l.nivel === 0 ? 'opacity-40' : ''}`} />
                    ))}
                </div>
                <p className={`text-xs mb-3 ${t.meta}`}>
                    <b className={enVerde === totalIndicadores ? 'text-emerald-500' : t.title}>{enVerde} de {totalIndicadores}</b> indicadores en verde
                </p>

                {/* Foco: lo primero que hay que atender */}
                {foco && foco.valor > 0 ? (
                    <button onClick={foco.onClick}
                        className={`w-full flex items-center gap-3 rounded-xl p-3 text-left ${NIVEL[foco.nivel].bg} ${NIVEL[foco.nivel].ring}`}>
                        <foco.Icon size={20} className={`shrink-0 ${NIVEL[foco.nivel].txt}`} />
                        <div className="flex-1 min-w-0">
                            <p className={`text-[10px] font-extrabold uppercase tracking-wider ${NIVEL[foco.nivel].txt}`}>Lo primero</p>
                            <p className={`text-sm font-bold leading-snug ${t.title}`}>{foco.valor} {foco.label.toLowerCase()}</p>
                            <p className={`text-xs leading-snug ${t.meta}`}>{foco.accion}</p>
                        </div>
                        <ChevronRight size={18} className={`shrink-0 ${t.meta}`} />
                    </button>
                ) : (
                    <div className={`flex items-center gap-2 rounded-xl p-3 ${t.okBox}`}>
                        <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                        <p className="text-sm font-bold text-emerald-500">Semana bajo control. Sigue facturando.</p>
                    </div>
                )}
            </div>

            {/* Aviso de PDV sin vincular (el indicador principal depende del vínculo) */}
            {cobertura.sinVincular > 0 && (
                <div className="flex items-start gap-2 text-xs rounded-xl px-3 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-500">
                    <Link2Off size={14} className="shrink-0 mt-0.5" />
                    <span>
                        <b>{cobertura.sinVincular} PDV sin vincular</b> a su cliente de Zoho — no cuentan en "sin facturar".
                        Añade su razón social en la ficha del PDV.
                    </span>
                </div>
            )}

            {/* ── ATIENDE YA ── */}
            {urgentes.length > 0 && (
                <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-red-500 mb-2 px-1">Atiende ya</p>
                    <div className="grid gap-2 md:grid-cols-2">
                        {urgentes.map(l => {
                            const n = NIVEL[l.nivel];
                            return (
                                <button key={l.key} onClick={l.onClick}
                                    className={`w-full flex items-stretch gap-3 rounded-2xl overflow-hidden text-left ${t.card} ${n.ring}`}>
                                    <span className={`w-1.5 shrink-0 ${n.stripe}`} />
                                    <div className="flex items-center gap-3 flex-1 min-w-0 py-3 pr-3">
                                        <span className={`text-4xl font-black tabular-nums shrink-0 ${n.txt}`}>{l.valor}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-bold leading-snug ${t.title}`}>{l.label}</p>
                                            <p className={`text-xs leading-snug ${t.meta}`}>{l.sufijo ? `${l.sufijo} · ` : ''}{l.accion}</p>
                                            {l.desglose && (
                                                <p className={`text-[11px] leading-snug mt-0.5 ${t.soft}`}>{l.desglose}</p>
                                            )}
                                        </div>
                                        <ChevronRight size={16} className={`shrink-0 ${t.meta}`} />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── ESTA SEMANA ── */}
            {medios.length > 0 && (
                <div>
                    <p className={`text-[10px] font-extrabold uppercase tracking-[0.2em] mb-2 px-1 ${t.soft}`}>Esta semana</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {medios.map(l => {
                            const n = NIVEL[l.nivel];
                            return (
                                <button key={l.key} onClick={l.onClick}
                                    className={`rounded-2xl p-3 text-left ${t.mini}`}>
                                    <div className="flex items-center justify-between mb-1">
                                        <l.Icon size={16} className={n.txt} />
                                        <span className={`text-2xl font-black tabular-nums ${n.txt}`}>{l.valor}</span>
                                    </div>
                                    <p className={`text-xs font-bold leading-snug ${t.title}`}>{l.label}</p>
                                    <p className={`text-[11px] leading-snug ${t.soft}`}>{l.sufijo || l.accion}</p>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── MERCADERISTA ── */}
            <div>
                <p className={`text-[10px] font-extrabold uppercase tracking-[0.2em] mb-2 px-1 ${t.soft}`}>Tu mercaderista</p>
                <button
                    onClick={() => mercaderista.items.length && abrir(
                        'PDV por cubrir', 'Según la frecuencia de cada punto', mercaderista.items,
                        (i) => (<>
                            <p className="font-bold text-sm">{i.nombre}</p>
                            <p className="text-xs opacity-70">Cada {i.intervalo} días · {i.zona}</p>
                            <span className="text-xs font-black text-indigo-400">{i.visitas}/{i.meta} · faltan {i.faltan}</span>
                        </>))}
                    disabled={mercaderista.items.length === 0}
                    className={`w-full rounded-2xl p-4 text-left disabled:cursor-default ${t.card}`}
                >
                    <div className="flex items-end justify-between gap-3 mb-2">
                        <div className="min-w-0">
                            <p className={`text-sm font-bold ${t.title}`}>Cobertura de visitas</p>
                            <p className={`text-xs ${t.meta}`}>
                                Según la frecuencia de cada PDV · {mercaderista.pdvTotal} tocan esta semana
                            </p>
                        </div>
                        <div className="text-right shrink-0">
                            <p className={`text-3xl font-black tabular-nums leading-none ${mercaderista.faltan === 0 ? 'text-emerald-500' : 'text-indigo-400'}`}>
                                {mercaderista.hechas}<span className={`text-base ${t.soft}`}>/{mercaderista.meta}</span>
                            </p>
                        </div>
                    </div>
                    <div className={`h-2.5 rounded-full overflow-hidden ${t.bar}`}>
                        <div className={`h-full rounded-full transition-all ${mercaderista.faltan === 0 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                             style={{ width: `${Math.min(100, mercaderista.pct || 0)}%` }} />
                    </div>
                    <p className={`text-xs mt-1.5 ${t.meta}`}>
                        {mercaderista.faltan === 0
                            ? '¡Meta semanal cumplida!'
                            : <>Faltan <b className="text-indigo-400">{mercaderista.faltan} visitas</b> · {mercaderista.items.length} PDV sin cubrir</>}
                    </p>
                </button>
            </div>

            {/* ── EN VERDE (colapsado) ── */}
            {verdes.length > 0 && (
                <div>
                    <button onClick={() => setVerVerdes(v => !v)}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold ${t.chip}`}>
                        <CheckCircle2 size={14} className="text-emerald-500" />
                        En verde ({verdes.length})
                        {verVerdes ? <ChevronDown size={14} className="ml-auto" /> : <ChevronRight size={14} className="ml-auto" />}
                    </button>
                    {verVerdes && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            {verdes.map(l => (
                                <div key={l.key} className={`rounded-xl p-3 ${t.mini}`}>
                                    <div className="flex items-center justify-between mb-1">
                                        <l.Icon size={15} className="text-emerald-500" />
                                        <span className="text-xl font-black text-emerald-500">0</span>
                                    </div>
                                    <p className={`text-xs font-bold leading-snug ${t.title}`}>{l.label}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

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
