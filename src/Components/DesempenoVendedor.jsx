// RUTA: src/Components/DesempenoVendedor.jsx
//
// Tablero de GESTIÓN DE VENTA del vendedor para el máster (Comercial →
// Vendedores). El motor vive en `src/utils/desempenoVendedor.js`; la Activación
// semana a semana en `src/utils/activacion.js`; inercia y captación en
// `src/utils/gestionVenta.js`.
//
//   <DesempenoVendedor ev={…} anio={…} ventana="mes" onVentana={…} nombre="…" onInforme={…} />
//   <DesempenoMini ev={…} nombre="…" onClick={…} />   — tarjeta del equipo
//
// 13-oct (pedido del dueño): la tarjeta del equipo es grande y se lee de un
// vistazo (nombre + índice); el detalle se ve por Mes (por defecto), Última
// semana cerrada, Trimestre y Año (gráfico mes a mes). Índice en cuatro partes
// (Facturación, Activación, Cobranza, Captación); la Activación se muestra con
// quiénes se activaron, cuánto facturaron y quiénes faltan.

import React, { useState } from 'react';
import { Receipt, Wallet, Zap, UserPlus, AlertTriangle, MapPin, Store, FileText, Check, ChevronDown } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine } from 'recharts';
import { ORDEN_PILARES } from '@/utils/desempenoVendedor.js';
import { OBJETIVOS_GESTION, RESULTADOS_GESTION, TIPOS_GESTION, etiqueta, esProactiva } from '@/utils/gestionVenta.js';

const TONO = {
    verde: { txt: 'text-emerald-600', bar: 'bg-emerald-500', soft: 'bg-emerald-50 border-emerald-200', ring: '#10b981' },
    ambar: { txt: 'text-amber-600',   bar: 'bg-amber-500',   soft: 'bg-amber-50 border-amber-200',     ring: '#f59e0b' },
    rojo:  { txt: 'text-red-600',     bar: 'bg-red-500',     soft: 'bg-red-50 border-red-200',         ring: '#ef4444' },
    slate: { txt: 'text-slate-400',   bar: 'bg-slate-300',   soft: 'bg-slate-50 border-slate-200',     ring: '#cbd5e1' },
};
const colorScore = (s) => s == null ? '#cbd5e1' : s >= 85 ? '#10b981' : s >= 65 ? '#f59e0b' : '#ef4444';

export const PILAR_META = {
    facturacion: { nombre: 'Facturación', que: 'Unidades vs. lo que tocaba llevar al corte', Icon: Receipt },
    cobranza:    { nombre: 'Cobranza', que: (pil) => `El % es cuánto de lo que vencía en el período se cobró a tiempo (hasta ${pil.graciaDias ?? 5} días después del vencimiento)`, Icon: Wallet },
    activacion:  { nombre: 'Activación', que: 'El % es cuántos de sus PDV retail visitó y facturó (≥12 uds) por semana, en promedio', Icon: Zap },
    captacion:   { nombre: 'Captación', que: 'Sucursales nuevas o que volvió a traer', Icon: UserPlus },
};
export const VENTANAS = [
    { id: 'mes', label: 'Mes' },
    { id: 'semana', label: 'Última semana' },
    { id: 'trimestre', label: 'Trimestre' },
    { id: 'anio', label: 'Año' },
];
const pct = (x) => (x == null || !isFinite(x)) ? '—' : `${Math.round(x * 100)}%`;
const CORTO = { facturacion: 'Fact.', activacion: 'Activ.', cobranza: 'Cobr.', captacion: 'Capt.' };
const money0 = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;
const num = (n) => (Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 });
const peso = (w) => (Math.round(w * 10) / 10).toLocaleString('es-VE');

/** Medidor semicircular con el puntaje global. */
function Medidor({ score, tono, size = 180 }) {
    const t = TONO[tono] || TONO.slate;
    const r = 70, c = Math.PI * r;
    const frac = score == null ? 0 : Math.max(0, Math.min(1, score / 100));
    return (
        <svg viewBox="0 0 180 104" width={size} height={size * 104 / 180} role="img" aria-label={`Puntaje ${score ?? 'sin datos'} de 100`}>
            <path d="M20 94 A70 70 0 0 1 160 94" fill="none" stroke="#e2e8f0" strokeWidth="16" strokeLinecap="round" />
            <path d="M20 94 A70 70 0 0 1 160 94" fill="none" stroke={t.ring} strokeWidth="16" strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} />
            <text x="90" y="84" textAnchor="middle" fontSize="40" fontWeight="900" fill="#0f172a">{score ?? '—'}</text>
            <text x="90" y="100" textAnchor="middle" fontSize="10" fill="#94a3b8">de 100</text>
        </svg>
    );
}

export function SelectorVentana({ valor, onChange }) {
    return (
        <div className="grid grid-cols-4 gap-1 bg-white border border-slate-200 rounded-xl p-1">
            {VENTANAS.map(v => (
                <button key={v.id} onClick={() => onChange(v.id)}
                    className={`py-2 rounded-lg text-xs sm:text-sm font-bold ${valor === v.id ? 'bg-brand-blue text-white' : 'text-slate-500'}`}>
                    {v.label}
                </button>
            ))}
        </div>
    );
}

/** Cifras clave de una parte del índice: número grande, rótulo corto. */
function Cifras({ cifras }) {
    if (!cifras?.length) return null;
    return (
        <div className="grid grid-cols-2 gap-2">
            {cifras.map(c => (
                <div key={c.k} className="bg-slate-50 rounded-xl px-3 py-2.5">
                    <p className="text-lg font-black text-slate-800 leading-tight">{c.v}</p>
                    <p className="text-[11px] text-slate-500">{c.k}</p>
                </div>
            ))}
        </div>
    );
}

/** Cobranza: las facturas que vencían y no se cobraron a tiempo, primero las que siguen sin cobrar. */
function CobranzaDetalle({ fallas }) {
    if (!fallas?.length) return null;
    const sin = fallas.filter(f => !f.pagada), tarde = fallas.filter(f => f.pagada);
    const Lista = ({ titulo, items, rojo }) => items.length > 0 && (
        <details className="mt-1">
            <summary className={`text-[11px] font-bold uppercase tracking-wider cursor-pointer ${rojo ? 'text-red-400' : 'text-slate-400'}`}>{titulo} ({items.length})</summary>
            <div className="mt-1 divide-y divide-slate-100">
                {items.map(f => (
                    <div key={f.numero} className="py-1.5 flex items-baseline justify-between gap-2 text-xs">
                        <span className="text-slate-700 min-w-0">{f.cliente} <span className="text-slate-400">· {f.numero}</span></span>
                        <span className="shrink-0 text-right text-slate-500">
                            <b className="text-slate-700">{money0(f.pagada ? f.monto : f.saldo)}</b>
                            {f.dias != null && <><br />{f.pagada ? `${f.dias} d tarde` : `${f.dias} d vencida`}</>}
                        </span>
                    </div>
                ))}
            </div>
        </details>
    );
    return (
        <section className="space-y-1">
            <Lista titulo="Sin cobrar" items={sin} rojo />
            <Lista titulo="Cobradas tarde" items={tarde} />
        </section>
    );
}

/** Lo que se despliega al tocar cada parte. */
function Ampliado({ k, pil }) {
    return (
        <div className="space-y-3 pt-3">
            <p className="text-xs text-slate-500">{typeof PILAR_META[k].que === 'function' ? PILAR_META[k].que(pil) : PILAR_META[k].que}.</p>
            <Cifras cifras={pil.cifras} />
            {k === 'cobranza' && <CobranzaDetalle fallas={pil.fallas} />}
            {k === 'activacion' && <ActivacionDetalle det={pil.detalleActivacion} />}
            {k === 'activacion' && <RegistroGestiones plan={pil.plan} />}
            {k === 'captacion' && <Captadas captadas={pil.captadas} />}
            {k === 'captacion' && <VentaDeGestion ventas={pil.ventas} />}
            {pil.score == null && <p className="text-xs text-slate-500">{pil.detalle}</p>}
            {pil.score != null && <p className="text-[11px] text-slate-400">Puntaje {pil.score}/100 · pesa {peso(pil.peso)} %</p>}
        </div>
    );
}

/** Las cuatro partes: tarjetas compactas que se abren al tocarlas. */
function Pilares({ ev }) {
    const [abierto, setAbierto] = useState(null);
    return (
        <div className="divide-y divide-slate-100">
            {ORDEN_PILARES.map(k => {
                const pil = ev.pilares[k];
                const meta = PILAR_META[k];
                const tp = TONO[pil.estado.tono];
                const Icon = meta.Icon;
                const open = abierto === k;
                return (
                    <div key={k} className={open ? 'bg-slate-50/40' : ''}>
                        <button type="button" onClick={() => setAbierto(open ? null : k)} aria-expanded={open}
                            className="w-full text-left px-4 sm:px-6 py-4 flex items-center gap-3">
                            <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center border ${tp.soft}`}>
                                <Icon size={18} className={tp.txt} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                    <p className="text-base font-bold text-slate-800">{meta.nombre}</p>
                                    <p className={`text-2xl font-black leading-none ${tp.txt}`}>{pct(pil.pctMeta)}</p>
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">{pil.valor}</p>
                                <div className="h-2 rounded-full bg-slate-100 overflow-hidden mt-2">
                                    <div className={`h-full rounded-full ${tp.bar}`} style={{ width: `${pil.score ?? 0}%` }} />
                                </div>
                            </div>
                            <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </button>
                        {open && <div className="px-4 sm:px-6 pb-4"><Ampliado k={k} pil={pil} /></div>}
                    </div>
                );
            })}
        </div>
    );
}

/** Sucursales captadas en el período. */
function Captadas({ captadas }) {
    if (!captadas?.length) return null;
    return (
        <div className="divide-y divide-slate-100">
            {captadas.map(c => (
                <div key={c.key} className="py-1.5 flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-slate-700">{c.nombre}</span>
                    <span className="shrink-0 text-emerald-700 font-bold">{c.nuevo > 0 ? 'nueva' : 'volvió'} · {num(c.nuevo + c.reactivado)} uds</span>
                </div>
            ))}
        </div>
    );
}

const fmtSem = (d) => d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;

/** Activación semana a semana: quiénes se activaron, con cuánto, y quiénes faltan. */
function ActivacionDetalle({ det }) {
    if (!det || !det.semanas.length) return null;
    return (
        <section>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Semana a semana · meta {det.objetivo} de {det.cartera}</p>
            <div className="space-y-1.5 mt-2">
                {det.semanas.map(w => {
                    const p = det.objetivo ? Math.min(100, w.activados / det.objetivo * 100) : 0;
                    return (
                        <div key={w.n} className="flex items-center gap-2 text-xs">
                            <span className="w-28 shrink-0 text-slate-500 whitespace-nowrap">Sem {w.n} · {fmtSem(w.inicio)}</span>
                            <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                                <div className={`h-full rounded-full ${w.lograda ? 'bg-emerald-500' : p >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${p}%` }} />
                            </div>
                            <span className="w-20 shrink-0 text-right font-bold text-slate-700">{w.activados}/{det.objetivo}{w.lograda && <Check size={12} className="inline ml-0.5 text-emerald-600" />}</span>
                            {w.enCurso && <span className="text-[10px] text-sky-600 shrink-0">en curso</span>}
                        </div>
                    );
                })}
            </div>
            {det.activados.length > 0 && (
                <details className="mt-3">
                    <summary className="text-[11px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer">Activadas ({det.activados.length})</summary>
                    <div className="mt-1 divide-y divide-slate-100">
                        {det.activados.map(c => (
                            <div key={c.clave} className="py-1.5 flex items-baseline justify-between gap-2 text-xs">
                                <span className="min-w-0 text-slate-700">
                                    <span className="font-semibold">{c.nombre}</span>
                                    <span className="text-slate-400"> · {c.semanas} sem · {c.facturas} factura{c.facturas === 1 ? '' : 's'}{c.conVisita ? ' · con visita' : ''}</span>
                                </span>
                                <span className="shrink-0 text-right text-slate-700 whitespace-nowrap"><b>{num(c.unidades)} uds</b> · {money(c.monto)}</span>
                            </div>
                        ))}
                    </div>
                </details>
            )}
            {det.sinActivar.length > 0 && (
                <details className="mt-3">
                    <summary className="text-[11px] font-bold uppercase tracking-wider text-red-400 cursor-pointer">Sin activar en el período ({det.sinActivar.length})</summary>
                    <div className="mt-1 divide-y divide-slate-100">
                        {det.sinActivar.map(c => (
                            <div key={c.clave} className="py-1.5 flex items-baseline justify-between gap-2 text-xs">
                                <span className="text-slate-700">{c.nombre}</span>
                                <span className="shrink-0 text-slate-500">{c.diasSinComprar == null ? 'nunca ha comprado' : `${c.diasSinComprar} días sin comprar`}</span>
                            </div>
                        ))}
                    </div>
                </details>
            )}
            {det.fuera?.length > 0 && (
                <details className="mt-3">
                    <summary className="text-[11px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer">No cuentan: PDV inactivo o sin PDV ({det.fuera.length})</summary>
                    <div className="mt-1 divide-y divide-slate-100">
                        {det.fuera.map(c => (
                            <div key={c.clave} className="py-1.5 flex items-baseline justify-between gap-2 text-xs">
                                <span className="text-slate-500">{c.nombre}</span>
                                <span className="shrink-0 text-slate-400">{c.motivo}</span>
                            </div>
                        ))}
                    </div>
                </details>
            )}
        </section>
    );
}

/** Inercia contra crecimiento y captación, con los clientes que la explican. */
function VentaDeGestion({ ventas }) {
    if (!ventas || !ventas.unidades) return null;
    const p = (x) => ventas.unidades ? x / ventas.unidades * 100 : 0;
    const gestionados = ventas.clientes.filter(c => c.gestion > 0);
    const inercia = ventas.clientes.filter(c => c.inercia > 0 && c.gestion === 0).sort((a, b) => b.inercia - a.inercia);
    return (
        <section className="pt-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">¿De dónde salen sus unidades?</p>
            <div className="flex h-4 rounded-full overflow-hidden mt-2 bg-slate-100">
                <div className="bg-emerald-500" style={{ width: `${p(ventas.nuevo)}%` }} title="Clientes nuevos" />
                <div className="bg-sky-500" style={{ width: `${p(ventas.reactivado)}%` }} title="Reactivados" />
                <div className="bg-indigo-500" style={{ width: `${p(ventas.crecimiento)}%` }} title="Crecimiento" />
                <div className="bg-slate-300" style={{ width: `${p(ventas.inercia)}%` }} title="Inercia" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs">
                <span><b className="text-emerald-600">● Nuevos</b> {num(ventas.nuevo)} uds</span>
                <span><b className="text-sky-600">● Reactivados</b> {num(ventas.reactivado)} uds</span>
                <span><b className="text-indigo-600">● Crecimiento</b> {num(ventas.crecimiento)} uds</span>
                <span><b className="text-slate-500">● Inercia</b> {num(ventas.inercia)} uds</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
                Inercia = sucursales que ya compraban y siguen pidiendo lo mismo que su promedio de los 90 días anteriores. Crecimiento = lo que una
                sucursal compró más allá de un 25 % sobre su promedio. Nuevas y las que vuelven tras un silencio mayor que su ritmo (al menos 45 días,
                o 1,5 veces su intervalo habitual) son la Captación.
                {ventas.historiaCorta && ' Hay poca historia antes de este período: los "nuevos" y el promedio pueden salir altos.'}
            </p>
            {gestionados.length > 0 && (
                <div className="mt-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Fuera de la inercia ({gestionados.length} sucursales)</p>
                    <div className="space-y-1">
                        {gestionados.slice(0, 12).map(c => (
                            <div key={c.key} className="flex items-baseline justify-between gap-2 text-xs">
                                <span className="text-slate-700 truncate">{c.nombre} <span className="text-slate-400">· {c.motivo.join(' · ')}</span></span>
                                <b className="text-emerald-700 whitespace-nowrap">+{num(c.gestion)} uds</b>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {inercia.length > 0 && (
                <details className="mt-3">
                    <summary className="text-[11px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer">Compraron por inercia ({inercia.length} clientes)</summary>
                    <div className="space-y-1 mt-1">
                        {inercia.slice(0, 30).map(c => (
                            <div key={c.key} className="flex items-baseline justify-between gap-2 text-xs">
                                <span className="text-slate-600 truncate">{c.nombre} <span className="text-slate-400">· su promedio ≈ {num(c.esperado)} uds</span></span>
                                <span className="text-slate-500 whitespace-nowrap">{num(c.inercia)} uds</span>
                            </div>
                        ))}
                    </div>
                </details>
            )}
        </section>
    );
}

/** Su registro de gestiones en el período. */
function RegistroGestiones({ plan }) {
    if (!plan) return null;
    const conteo = (obj, lista) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${etiqueta(lista, k)} ${n}`).join(' · ') || '—';
    return (
        <section className="pt-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Visitas de venta que registró</p>
            <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="bg-slate-50 rounded-xl p-2.5 text-center"><p className="text-xl font-black text-slate-800">{plan.proactivas}</p><p className="text-[10px] text-slate-500">para vender</p></div>
                <div className="bg-slate-50 rounded-xl p-2.5 text-center"><p className="text-xl font-black text-slate-800">{plan.reactivas}</p><p className="text-[10px] text-slate-500">pedido o cobro</p></div>
                <div className="bg-slate-50 rounded-xl p-2.5 text-center"><p className="text-xl font-black text-slate-800">{plan.planCumplidas}/{plan.planificadas}</p><p className="text-[10px] text-slate-500">del plan</p></div>
            </div>
            {plan.lista.length === 0 ? (
                <p className="text-xs text-slate-400 mt-2">Sin visitas registradas en el período.</p>
            ) : (<>
                <p className="text-xs text-slate-500 mt-2"><b>Para qué:</b> {conteo(plan.porObjetivo, OBJETIVOS_GESTION)}</p>
                <p className="text-xs text-slate-500"><b>Cómo:</b> {conteo(plan.porTipo, TIPOS_GESTION)}{plan.visitas > 0 && ` · ${plan.conGps} de ${plan.visitas} visitas con ubicación`}</p>
                <p className="text-xs text-slate-500"><b>Resultado:</b> {conteo(plan.porResultado, RESULTADOS_GESTION)}</p>
            </>)}
            {plan.lista.length > 0 && (
                <details className="mt-2">
                    <summary className="text-[11px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer">Ver cada gestión ({plan.lista.length})</summary>
                    <div className="space-y-1 mt-1">
                        {plan.lista.slice(0, 60).map(g => (
                            <p key={g.id} className="text-xs text-slate-600">
                                <span className={esProactiva(g) ? 'text-emerald-600' : 'text-slate-400'}>●</span>{' '}
                                {new Date(g._t).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })} · <b>{g.nombre}</b>{g.esProspecto ? ' (prospecto)' : ''} · {etiqueta(TIPOS_GESTION, g.tipo)} · {etiqueta(OBJETIVOS_GESTION, g.objetivo)} → {etiqueta(RESULTADOS_GESTION, g.resultado)}{g.nota ? ` · "${g.nota}"` : ''}
                            </p>
                        ))}
                    </div>
                </details>
            )}
        </section>
    );
}

function Contexto({ contexto }) {
    const items = [
        contexto?.visitasMercaderista && { Icon: MapPin, t: 'Visitas del mercaderista', ...contexto.visitasMercaderista },
        contexto?.carteraComprando && { Icon: Store, t: 'Cartera comprando', ...contexto.carteraComprando },
    ].filter(Boolean);
    if (!items.length) return null;
    return (
        <section className="px-4 sm:px-6 py-4 border-t border-slate-100 bg-slate-50/60">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Contexto · no cuenta en su índice</p>
            {items.map(x => (
                <div key={x.t} className="flex items-start gap-2 mb-1.5">
                    <x.Icon size={14} className="text-slate-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-slate-600"><b>{x.t}:</b> {x.valor} · {x.detalle}</p>
                </div>
            ))}
        </section>
    );
}

/** El año: un índice por mes de empleo y la tabla de pilares mes a mes. */
function VistaAnio({ anio }) {
    if (!anio?.length) return <p className="p-6 text-sm text-slate-500">Sin meses que mostrar.</p>;
    const datos = anio.map(m => ({ mes: m.label, score: m.ev.global, rango: m.rango }));
    const conDato = anio.filter(m => m.ev.global != null);
    const promedio = conDato.length ? Math.round(conDato.reduce((s, m) => s + m.ev.global, 0) / conDato.length) : null;
    return (
        <div className="p-4 sm:p-6">
            <div className="flex items-baseline justify-between">
                <p className="text-sm font-bold text-slate-800">Índice mes a mes</p>
                <p className="text-xs text-slate-500">Promedio: <b style={{ color: colorScore(promedio) }}>{promedio ?? '—'}</b></p>
            </div>
            <div className="h-56 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={datos} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} interval={0} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <ReferenceLine y={85} stroke="#10b981" strokeDasharray="4 4" />
                        <ReferenceLine y={65} stroke="#f59e0b" strokeDasharray="4 4" />
                        <Tooltip formatter={(v) => [v ?? 'sin datos', 'Índice']} labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.rango || ''}`} />
                        <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                            {datos.map((d, i) => <Cell key={i} fill={colorScore(d.score)} />)}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-slate-400">Líneas: 85 cumpliendo · 65 en riesgo.</p>
            <div className="overflow-x-auto mt-4">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-slate-400 text-left">
                            <th className="py-1.5 pr-2 font-semibold">Mes</th>
                            <th className="py-1.5 px-1 font-semibold text-right">Índice</th>
                            {ORDEN_PILARES.map(k => <th key={k} className="py-1.5 px-1 font-semibold text-right whitespace-nowrap" title={PILAR_META[k].nombre}>{CORTO[k]}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {[...anio].reverse().map(m => (
                            <tr key={m.rango} className="border-t border-slate-100">
                                <td className="py-1.5 pr-2"><b className="text-slate-700 whitespace-nowrap">{m.label}</b>{m.enCurso && <span className="text-sky-600"> ·</span>}<span className="block text-[10px] text-slate-400 whitespace-nowrap">{m.rango}</span></td>
                                <td className="py-1.5 px-1 text-right font-black" style={{ color: colorScore(m.ev.global) }}>{m.ev.global ?? '—'}</td>
                                {ORDEN_PILARES.map(k => (
                                    <td key={k} className="py-1.5 px-1 text-right" style={{ color: colorScore(m.ev.pilares[k].score) }}>{pct(m.ev.pilares[k].pctMeta)}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Cada mes es su período de comisión (mes de empleo hasta septiembre de 2026; desde octubre, el mes calendario), contra su meta de ese período. Las cifras de la tabla son el % sobre la meta de cada pilar (Fact. facturación, Activ. activación, Cobr. cobranza, Capt. captación). Punto azul = mes en curso.</p>
        </div>
    );
}

export default function DesempenoVendedor({ ev, anio, nombre, ventana = 'mes', onVentana, onInforme }) {
    const esAnio = ventana === 'anio';
    if (!ev && !esAnio) return null;
    const t = TONO[ev?.estado.tono || 'slate'];
    const p = ev?.periodo;
    return (
        <div className="space-y-3">
            {onVentana && <SelectorVentana valor={ventana} onChange={onVentana} />}
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                {esAnio ? <VistaAnio anio={anio} /> : (
                    <>
                        <div className={`p-5 sm:p-6 border-b ${t.soft} flex flex-col sm:flex-row items-center gap-4 sm:gap-6`}>
                            <Medidor score={ev.global} tono={ev.estado.tono} />
                            <div className="text-center sm:text-left min-w-0">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Desempeño de {nombre}</p>
                                <p className={`text-3xl font-black mt-1 ${t.txt}`}>{ev.estado.label}</p>
                                <p className="text-sm text-slate-600 mt-1.5">
                                    {p.titulo} · {p.label}{p.enCurso ? ` · día ${p.diasCorridos} de ${p.diasTotales}` : ' · cerrado'}
                                </p>
                                {ev.peor && ev.estado.key !== 'cumple' && (
                                    <p className="text-sm text-slate-700 mt-2 flex items-start gap-1.5 justify-center sm:justify-start">
                                        <AlertTriangle size={15} className={`${t.txt} shrink-0 mt-0.5`} />
                                        <span>Lo que más le resta: <b>{PILAR_META[ev.peor].nombre}</b> ({pct(ev.pilares[ev.peor].pctMeta)})</span>
                                    </p>
                                )}
                                {ev.comision && (
                                    <p className="text-xs text-slate-500 mt-1.5">
                                        Nivel de comisión <b className="text-slate-700">{ev.comision.nivel} ({(ev.comision.tasa * 100).toLocaleString('es-VE', { maximumFractionDigits: 1 })}%)</b>
                                        {' · '}comisión generada por lo cobrado: <b className="text-slate-700">{money0(ev.comision.generada)}</b>
                                    </p>
                                )}
                                {p.sinIngreso && <p className="text-xs text-amber-700 mt-2">Sin fecha de ingreso: se evalúa el mes de calendario con la meta plena.</p>}
                            </div>
                        </div>
                        <p className="px-4 sm:px-6 pt-3 text-[11px] text-slate-400">Toca cada parte para ver el detalle.</p>
                        <Pilares ev={ev} />
                        <Contexto contexto={ev.contexto} />
                        <details className="px-4 sm:px-6 py-3 text-[11px] text-slate-500 bg-slate-50 border-t border-slate-100">
                            <summary className="font-bold cursor-pointer">¿Cómo se lee?</summary>
                            <p className="mt-1">% grande = avance sobre la meta. Barra = contra lo que tocaba llevar a hoy. Índice: 85+ cumpliendo · 65–84 en riesgo · menos de 65 no cumple.</p>
                        </details>
                    </>
                )}
            </section>
            {onInforme && (
                <button onClick={onInforme} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white border border-slate-300 text-sm font-bold text-slate-700">
                    <FileText size={16} /> Informe de gestión del mes (PDF)
                </button>
            )}
        </div>
    );
}

/** Tarjeta del equipo: nombre e índice de un vistazo, y lo que más le resta. */
export function DesempenoMini({ ev, nombre, onClick }) {
    if (!ev) return null;
    const t = TONO[ev.estado.tono];
    return (
        <button type="button" onClick={onClick}
            className={`w-full text-left bg-white border rounded-2xl p-5 hover:shadow-md transition-shadow ${t.soft}`}>
            <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-xl font-black text-slate-900 leading-tight">{nombre}</p>
                    <p className={`text-base font-black mt-1 ${t.txt}`}>{ev.estado.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{ev.periodo.titulo} · día {ev.periodo.diasCorridos} de {ev.periodo.diasTotales}</p>
                </div>
                <div className="shrink-0 w-24 h-24 rounded-full grid place-items-center border-[6px]" style={{ borderColor: t.ring }}>
                    <div className="text-center leading-none">
                        <p className="text-4xl font-black text-slate-900">{ev.global ?? '—'}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">de 100</p>
                    </div>
                </div>
            </div>
            {ev.peor && ev.estado.key !== 'cumple' && (
                <p className="text-sm text-slate-700 mt-3 flex items-start gap-1.5">
                    <AlertTriangle size={15} className={`${t.txt} shrink-0 mt-0.5`} />
                    <span>Lo que más le resta: <b>{PILAR_META[ev.peor].nombre}</b> ({pct(ev.pilares[ev.peor].pctMeta)})</span>
                </p>
            )}
        </button>
    );
}
