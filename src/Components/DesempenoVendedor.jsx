// RUTA: src/Components/DesempenoVendedor.jsx
//
// Tablero de DESEMPEÑO del vendedor para el máster (Seguimiento). Un vistazo:
// un medidor con el puntaje global y el veredicto, y debajo cada pilar con su
// barra, su cifra y una sola línea que explica de dónde sale. El motor vive en
// `src/utils/desempenoVendedor.js`.
//
//   <DesempenoVendedor ev={evaluacion} nombre="Carolina" />   — vista completa
//   <DesempenoMini ev={…} nombre="…" onClick={…} />            — tarjeta del equipo

import React from 'react';
import { Receipt, Wallet, Zap, MapPin, Store, AlertTriangle } from 'lucide-react';

const TONO = {
    verde: { txt: 'text-emerald-600', bar: 'bg-emerald-500', soft: 'bg-emerald-50 border-emerald-200', ring: '#10b981' },
    ambar: { txt: 'text-amber-600',   bar: 'bg-amber-500',   soft: 'bg-amber-50 border-amber-200',     ring: '#f59e0b' },
    rojo:  { txt: 'text-red-600',     bar: 'bg-red-500',     soft: 'bg-red-50 border-red-200',         ring: '#ef4444' },
    slate: { txt: 'text-slate-400',   bar: 'bg-slate-300',   soft: 'bg-slate-50 border-slate-200',     ring: '#cbd5e1' },
};

export const PILAR_META = {
    facturacion: { nombre: 'Facturación', que: 'Volumen: unidades vs. lo que tocaba llevar a hoy', Icon: Receipt },
    cobranza:    { nombre: 'Cobranza',    que: 'Parte de su cuenta por cobrar que está al día', Icon: Wallet },
    activacion:  { nombre: 'Activación',  que: 'Amplitud: semanas en que compró la mayoría de su cartera', Icon: Zap },
    visitas:     { nombre: 'Visitas',     que: 'Cobertura del mercaderista en su cartera', Icon: MapPin },
    cartera:     { nombre: 'Cartera comprando', que: 'PDV de su cartera que están comprando', Icon: Store },
};
const ORDEN = ['facturacion', 'cobranza', 'activacion', 'visitas', 'cartera'];
const pct = (x) => (x == null || !isFinite(x)) ? '—' : `${Math.round(x * 100)}%`;
const money0 = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;

/** Medidor semicircular con el puntaje global. */
function Medidor({ score, tono, size = 180 }) {
    const t = TONO[tono] || TONO.slate;
    const r = 70, c = Math.PI * r;
    const frac = score == null ? 0 : Math.max(0, Math.min(1, score / 100));
    return (
        <svg viewBox="0 0 180 104" width={size} height={size * 104 / 180} role="img" aria-label={`Puntaje ${score ?? 'sin datos'} de 100`}>
            <path d="M20 94 A70 70 0 0 1 160 94" fill="none" stroke="#e2e8f0" strokeWidth="16" strokeLinecap="round" />
            <path d="M20 94 A70 70 0 0 1 160 94" fill="none" stroke={t.ring} strokeWidth="16" strokeLinecap="round"
                strokeDasharray={`${c * frac} ${c}`} />
            <text x="90" y="84" textAnchor="middle" fontSize="40" fontWeight="900" fill="#0f172a">{score ?? '—'}</text>
            <text x="90" y="100" textAnchor="middle" fontSize="10" fill="#94a3b8">de 100</text>
        </svg>
    );
}

export default function DesempenoVendedor({ ev, nombre }) {
    if (!ev) return null;
    const t = TONO[ev.estado.tono];
    const p = ev.periodo;
    return (
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            {/* Veredicto */}
            <div className={`p-5 sm:p-6 border-b ${t.soft} flex flex-col sm:flex-row items-center gap-4 sm:gap-6`}>
                <Medidor score={ev.global} tono={ev.estado.tono} />
                <div className="text-center sm:text-left min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Desempeño de {nombre}</p>
                    <p className={`text-3xl font-black mt-1 ${t.txt}`}>{ev.estado.label}</p>
                    <p className="text-sm text-slate-600 mt-1.5">
                        {p.sinIngreso ? 'Mes en curso' : `Mes ${p.mes} de su empleo`} · {p.label} · día {p.diasCorridos} de {p.diasTotales}
                    </p>
                    {ev.peor && ev.estado.key !== 'cumple' && (
                        <p className="text-sm text-slate-700 mt-2 flex items-start gap-1.5 justify-center sm:justify-start">
                            <AlertTriangle size={15} className={`${t.txt} shrink-0 mt-0.5`} />
                            <span>Lo que más le resta: <b>{PILAR_META[ev.peor].nombre}</b> — {ev.pilares[ev.peor].detalle}</span>
                        </p>
                    )}
                    {ev.comision && (
                        <p className="text-xs text-slate-500 mt-1.5">
                            Nivel de comisión <b className="text-slate-700">{ev.comision.nivel} ({(ev.comision.tasa * 100).toLocaleString('es-VE', { maximumFractionDigits: 1 })}%)</b>
                            {' · '}comisión generada por lo cobrado: <b className="text-slate-700">{money0(ev.comision.generada)}</b>
                        </p>
                    )}
                    {p.sinIngreso && (
                        <p className="text-xs text-amber-700 mt-2">Sin fecha de ingreso: se evalúa el mes de calendario con la meta plena.</p>
                    )}
                </div>
            </div>

            {/* Pilares */}
            <div className="divide-y divide-slate-100">
                {ORDEN.map(k => {
                    const pil = ev.pilares[k];
                    const meta = PILAR_META[k];
                    const tp = TONO[pil.estado.tono];
                    const Icon = meta.Icon;
                    return (
                        <div key={k} className="px-5 sm:px-6 py-4 grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1.5">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${tp.soft}`}>
                                <Icon size={18} className={tp.txt} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-800 flex items-baseline gap-2 flex-wrap">
                                    {meta.nombre}
                                    <span className="text-[11px] font-normal text-slate-400">{meta.que} · pesa {String(pil.peso).replace('.', ',')}%</span>
                                </p>
                                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden mt-1.5">
                                    <div className={`h-full rounded-full ${tp.bar}`} style={{ width: `${pil.score ?? 0}%` }} />
                                </div>
                            </div>
                            {/* A la derecha, lo que pidió el dueño: % sobre la meta y
                                las unidades sobre la meta. La barra es el puntaje
                                (contra lo que tocaba llevar a hoy). */}
                            <div className="text-right">
                                <p className={`text-2xl font-black leading-none ${tp.txt}`}>{pct(pil.pctMeta)}</p>
                                <p className="text-[11px] text-slate-500 mt-0.5 whitespace-nowrap">{pil.valor}</p>
                            </div>
                            <p className="col-start-2 col-span-2 text-xs text-slate-500">
                                {pil.sobreMeta && <b className="text-slate-600">{pil.sobreMeta} · </b>}
                                {pil.detalle}
                                {pil.score != null && <span className="text-slate-400"> · puntaje {pil.score}/100</span>}
                            </p>
                        </div>
                    );
                })}
            </div>

            <p className="px-5 sm:px-6 py-3 text-[11px] text-slate-400 bg-slate-50 border-t border-slate-100">
                El porcentaje grande es el avance sobre la meta del período. La barra y el puntaje comparan contra lo que
                tocaba llevar a hoy, no contra la meta del mes entero. Global: 85 o más cumpliendo · 65 a 84 en riesgo ·
                menos de 65 no está cumpliendo. Los pilares sin datos no cuentan y su peso se reparte entre los demás.
            </p>
        </section>
    );
}

/** Tarjeta compacta para comparar al equipo de un vistazo. */
export function DesempenoMini({ ev, nombre, onClick }) {
    if (!ev) return null;
    const t = TONO[ev.estado.tono];
    return (
        <button type="button" onClick={onClick}
            className={`text-left bg-white border rounded-2xl p-4 hover:shadow-md transition-shadow ${t.soft}`}>
            <div className="flex items-center gap-3">
                <div className="shrink-0"><Medidor score={ev.global} tono={ev.estado.tono} size={96} /></div>
                <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate">{nombre}</p>
                    <p className={`text-sm font-black ${t.txt}`}>{ev.estado.label}</p>
                    <p className="text-[11px] text-slate-500">Día {ev.periodo.diasCorridos} de {ev.periodo.diasTotales}</p>
                </div>
            </div>
            <div className="mt-3 space-y-1.5">
                {ORDEN.map(k => {
                    const pil = ev.pilares[k];
                    const tp = TONO[pil.estado.tono];
                    return (
                        <div key={k} className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-500 w-28 shrink-0 truncate">{PILAR_META[k].nombre}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-white/80 overflow-hidden">
                                <div className={`h-full rounded-full ${tp.bar}`} style={{ width: `${pil.score ?? 0}%` }} />
                            </div>
                            <span className={`text-[11px] font-bold w-10 text-right ${tp.txt}`}>{pct(pil.pctMeta)}</span>
                        </div>
                    );
                })}
            </div>
        </button>
    );
}
