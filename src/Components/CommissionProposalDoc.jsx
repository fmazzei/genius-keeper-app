// RUTA: src/Components/CommissionProposalDoc.jsx
//
// Propuesta de comisiones para el vendedor — documento de una página, muy
// visual, pensado para "enamorar". Se abre como vista previa a pantalla
// completa dentro del AdminPanel y se exporta con "Imprimir / Guardar PDF"
// (impresión nativa del navegador → en iPhone: Compartir → Guardar en Archivos).
// No usa ninguna dependencia de generación de PDF: aprovecha `window.print()`
// con estilos de impresión acotados a la hoja.

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Shield, Zap, Target, Package, Banknote, ArrowUpRight, RotateCcw } from 'lucide-react';

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-VE')}`;
const uds   = (n) => `${Math.round(Number(n) || 0).toLocaleString('es-VE')}`;

function computeProposal(config = {}) {
    const precio = Number(config.precioUnidad) || 5.6;
    const base   = (Number(config.salarioFijo) || 0) + (Number(config.viaticosSemanales) || 0) * 4;

    const tiers = [...(config.tiers || [])].sort((a, b) => b.minPct - a.minPct);
    // Nivel "objetivo" = el que aplica al 100% de cumplimiento.
    const objetivo = tiers.filter(t => t.minPct <= 100).sort((a, b) => b.minPct - a.minPct)[0]
        || tiers[tiers.length - 1]
        || { label: 'Óptima', rate: 5 };

    const bonoCobranza   = Number(config.bonusPuntualidad) || 0; // "Bono Cobranza" (rate)
    const bonoActivacion = Number(config.bonusActivacion) || 0;

    const tasaObjetivo   = (Number(objetivo.rate) || 0) + bonoCobranza + bonoActivacion;
    const topRate        = (tiers[0]?.rate || objetivo.rate || 0) + bonoCobranza + bonoActivacion;

    const montoFacturacion = (Number(config.metaMensual) || 0) * precio;
    const comisionObjetivo = montoFacturacion * tasaObjetivo / 100;
    const potencial        = base + comisionObjetivo;

    const montoCobranza    = (Number(config.metaCobranza) || 0) * precio;
    const comisionEjemplo  = montoCobranza * tasaObjetivo / 100;

    return { precio, base, tiers, objetivo, bonoCobranza, bonoActivacion, tasaObjetivo, topRate, montoFacturacion, comisionObjetivo, potencial, montoCobranza, comisionEjemplo };
}

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #gk-proposal-sheet, #gk-proposal-sheet * { visibility: visible !important; }
  #gk-proposal-sheet {
    position: fixed !important; inset: 0 !important;
    margin: 0 !important; width: 100% !important; max-width: none !important;
    box-shadow: none !important; border-radius: 0 !important;
  }
  .gk-no-print { display: none !important; }
  @page { size: A4; margin: 12mm; }
}
`;

const Step = ({ label, rate, highlight }) => (
    <div className={`flex-1 rounded-lg px-2 py-2.5 text-center border ${highlight ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'}`}>
        <p className={`text-[11px] font-bold ${highlight ? 'text-emerald-700' : 'text-slate-500'}`}>{label}</p>
        <p className={`text-base font-black ${highlight ? 'text-emerald-700' : 'text-slate-700'}`}>{rate}%</p>
    </div>
);

const Badge = ({ Icon, title, value, tone = 'emerald' }) => {
    const tones = {
        emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
        blue:    'bg-blue-50 border-blue-200 text-blue-700',
        amber:   'bg-amber-50 border-amber-200 text-amber-700',
    };
    return (
        <div className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${tones[tone]}`}>
            <Icon size={18} className="shrink-0" />
            <div className="min-w-0">
                <p className="text-[11px] font-semibold leading-tight opacity-80">{title}</p>
                <p className="text-sm font-black leading-tight">{value}</p>
            </div>
        </div>
    );
};

export default function CommissionProposalDoc({ config, vendedorName = 'Vendedor', onClose }) {
    const p = computeProposal(config);
    const allTiers = [...p.tiers, { label: 'Baja', rate: Number(config.bajaRate) || 0 }];
    const fecha = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });
    const cobranzaDias = Number(config.cobranzaDias) || 30;
    const recuperadas  = Number(config.comisionRecuperadas) || 0;

    // Portal al <body>: si el overlay se renderiza dentro del modal del
    // AdminPanel (un ancestro con `transform`), `position: fixed` se ancla a ese
    // ancestro y la barra de acciones queda fuera de vista → app "atrapada".
    // Con el portal, el overlay ocupa el viewport real y la barra siempre se ve.
    return createPortal((
        <div className="fixed inset-0 z-[100] bg-slate-900/80 flex flex-col overflow-auto">
            {/* Toolbar — no se imprime */}
            <div className="gk-no-print sticky top-0 z-10 flex items-center justify-between gap-3 bg-slate-900 px-4 py-3">
                <button onClick={onClose} className="flex items-center gap-1.5 text-slate-300 text-sm font-semibold hover:text-white">
                    <X size={18} /> Cerrar
                </button>
                <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm px-4 py-2 rounded-lg"
                >
                    <Printer size={16} /> Imprimir / Guardar PDF
                </button>
            </div>

            {/* Hoja */}
            <div className="flex-1 p-3 sm:p-6 flex justify-center">
                <div id="gk-proposal-sheet" className="bg-white w-full max-w-[800px] rounded-2xl shadow-2xl overflow-hidden self-start">

                    {/* Encabezado */}
                    <div className="bg-[#0D2B4C] px-6 py-5 flex items-center justify-between">
                        <div>
                            <p className="text-[#FFD600] text-[11px] font-black uppercase tracking-[0.2em]">Genius Keeper</p>
                            <h1 className="text-white text-xl font-black leading-tight">Propuesta de Comisiones</h1>
                        </div>
                        <div className="text-right">
                            <p className="text-white/50 text-[10px] uppercase tracking-widest">Preparada para</p>
                            <p className="text-white text-base font-bold">{vendedorName}</p>
                        </div>
                    </div>

                    {/* Hero */}
                    <div className="px-6 py-6 text-center border-b border-slate-100">
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.2em]">Tu potencial mensual</p>
                        <p className="text-emerald-600 text-5xl font-black leading-none my-2">hasta {money(p.potencial)}</p>
                        <p className="text-slate-400 text-xs">Ingreso base + comisión al cumplir tu meta, con bonos activos</p>
                    </div>

                    <div className="px-6 py-5 space-y-5">

                        {/* Piso + Meta */}
                        <div className="grid grid-cols-2 gap-3">
                            <Badge Icon={Shield} title="Tu piso seguro" value={`${money(p.base)} / mes`} tone="blue" />
                            <Badge Icon={Package} title="Meta de colocación" value={`${uds(config.metaMensual)} uds`} tone="emerald" />
                        </div>

                        {/* Escalera de comisión */}
                        <div>
                            <p className="text-slate-400 text-[11px] font-black uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5">
                                <ArrowUpRight size={14} /> Tu comisión crece contigo
                            </p>
                            <div className="flex items-end gap-1.5">
                                {[...allTiers].reverse().map((t, i) => (
                                    <Step key={i} label={t.label} rate={t.rate} highlight={t.label === p.objetivo.label} />
                                ))}
                            </div>
                            <p className="text-slate-400 text-[10px] mt-1 text-center">% sobre el monto que <b>cobras</b> — a más colocación, mejor tasa</p>
                        </div>

                        {/* Bonos */}
                        <div className="grid grid-cols-2 gap-3">
                            <Badge Icon={Zap} title="Bono Cobranza" value={`+${p.bonoCobranza}%`} tone="emerald" />
                            <Badge Icon={Target} title="Bono Activación" value={`+${p.bonoActivacion}%`} tone="amber" />
                        </div>
                        <p className="text-center text-sm font-black text-emerald-700 -mt-2">Hasta {p.topRate.toFixed(1)}% sobre lo que cobras</p>

                        {/* Metas de caja */}
                        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 flex items-center gap-3">
                            <Banknote size={22} className="text-emerald-600 shrink-0" />
                            <div>
                                <p className="text-slate-800 text-sm font-black">Cobra {money(p.montoCobranza)} ({uds(config.metaCobranza)} uds) en {cobranzaDias} días</p>
                                <p className="text-slate-400 text-xs">Cobrar rápido activa tu Bono Cobranza</p>
                            </div>
                        </div>

                        {/* Cuentas recuperadas */}
                        {recuperadas > 0 && (
                            <div className="rounded-xl bg-[#0D2B4C]/5 border border-[#0D2B4C]/15 px-4 py-3 flex items-center gap-3">
                                <RotateCcw size={20} className="text-[#0D2B4C] shrink-0" />
                                <p className="text-slate-700 text-sm">
                                    <b>Cuentas Recuperadas:</b> cobra facturas heredadas de tu cartera y gana <b>+{recuperadas}%</b> extra sobre lo recuperado.
                                </p>
                            </div>
                        )}

                        {/* Ejemplo */}
                        <div className="rounded-xl border-2 border-emerald-200 px-4 py-3 text-center">
                            <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest">Ejemplo</p>
                            <p className="text-slate-700 text-sm mt-0.5">
                                Cobras <b>{money(p.montoCobranza)}</b> en nivel <b>{p.objetivo.label}</b> →
                                <span className="text-emerald-700 font-black"> ~{money(p.comisionEjemplo)}</span> de comisión <b>+ tu base</b>
                            </p>
                        </div>
                    </div>

                    {/* Pie */}
                    <div className="bg-slate-50 px-6 py-3 flex items-center justify-between border-t border-slate-100">
                        <p className="text-slate-400 text-[10px]">Genius Keeper · Lácteoca — {fecha}</p>
                        <p className="text-slate-400 text-[10px]">Propuesta referencial, sujeta a las políticas de la empresa</p>
                    </div>
                </div>
            </div>

            <style>{PRINT_CSS}</style>
        </div>
    ), document.body);
}
