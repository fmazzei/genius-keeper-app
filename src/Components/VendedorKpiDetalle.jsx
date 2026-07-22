// RUTA: src/Components/VendedorKpiDetalle.jsx
//
// Modal de expansión (página completa, oscuro) para CADA KPI del vendedor. Muestra
// el valor grande + estado, y tres bloques claros: qué significa, cómo se calcula
// y qué hacer. Para algunos KPIs agrega un desglose contextual (progreso de meta,
// estado de cuenta, antigüedad de cobranza). Coherente con la estética del vendedor.

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Info, Calculator, Lightbulb } from 'lucide-react';

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-VE')}`;
const num = (n) => (Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 });

const TONE_TEXT = { good: 'text-emerald-400', warn: 'text-amber-400', bad: 'text-red-400', neutral: 'text-white' };

const DETALLE = {
    comision_periodo: { que: 'Lo que has ganado de comisión en el período de empleo en curso, sobre lo que YA se cobró.', como: 'Suma de la comisión de cada factura cobrada, con la tasa de tu nivel (o 5% flat si es heredada).', hacer: 'Cobra a tiempo: una unidad solo vale cuando se cobra.' },
    meta_nivel: { que: 'Unidades que has facturado este período vs tu meta, y el nivel de comisión que te da ese volumen.', como: 'Unidades de tus facturas dentro del período de empleo ÷ meta. Más unidades = mejor nivel = mejor tasa.', hacer: 'Coloca más pedidos y cuida que se facturen para subir de nivel.' },
    velocidad: { que: 'Tu ritmo de venta actual comparado con el ritmo que necesitas para llegar a la meta.', como: 'Unidades facturadas ÷ días transcurridos, contra (lo que falta ÷ días restantes).', hacer: 'Si vas por debajo del ritmo necesario, acelera pedidos esta semana.' },
    por_cobrar: { que: 'Facturas tuyas que están por vencer pronto.', como: 'Facturas no pagadas cuyo vencimiento cae en los próximos 3 días.', hacer: 'Adelántate: contacta al cliente antes de que venza.' },
    cobranza: { que: 'Qué porcentaje de tus facturas se cobró dentro del plazo (vencimiento + gracia).', como: 'Facturas cobradas a tiempo ÷ facturas que ya debían cobrarse.', hacer: 'El Bono Cobranza se paga por cada factura cobrada a tiempo.' },
    vencidas: { que: 'Facturas de tu cartera que ya pasaron su fecha de vencimiento sin cobrarse.', como: 'Cuenta y monto de facturas no pagadas con vencimiento anterior a hoy.', hacer: 'Prioriza estas: a los 45 días la comisión se anula.' },
    despachos: { que: 'Unidades que registraste como despachadas hoy.', como: 'Suma de despachos del día. Es logística: no cuenta para tu meta ni comisión.', hacer: 'El despacho mueve producto; la venta se cuenta al facturar.' },
    activacion: { que: 'Qué parte de tu cartera facturó suficientes unidades esta semana (Bono Activación).', como: 'PDV de tu cartera con facturación ≥ mínimo ÷ total de tu cartera.', hacer: 'Activa más clientes cada semana para ganar el bono proporcional.' },
    anaquel: { que: 'Disponibilidad de producto en anaquel en tus cuentas de régimen anaquel (Bono Anaquel).', como: 'Sucursales con inventario alto en visitas de martes/viernes ÷ total de cuentas anaquel.', hacer: 'Coordina con el mercaderista para mantener el anaquel surtido.' },
    radar: { que: 'Alertas accionables de tu cartera: visitas vencidas, nunca visitados y quiebres de stock.', como: 'Se comparan las últimas visitas de tus PDV contra su frecuencia y su estado de stock.', hacer: 'Atiende primero los quiebres y las visitas más atrasadas.' },
    genius: { que: 'Puntaje global de qué tan bien se ejecuta tu producto en el punto de venta de tu cartera.', como: 'Combina posición en anaquel, POP, ausencia de quiebres, cumplimiento de visitas y calidad del reporte.', hacer: 'Sube el KPI de ejecución más débil para mejorar el puntaje.' },
    cumplimiento: { que: 'Qué % de tus PDV fue visitado dentro de su frecuencia asignada.', como: 'PDV con última visita dentro de su intervalo de días ÷ PDV activos con frecuencia.', hacer: 'Agenda con el mercaderista los PDV que se están atrasando.' },
    quiebres: { que: 'PDV de tu cartera que en su última visita no tenían producto disponible.', como: 'PDV distintos cuyo último reporte marcó quiebre de stock.', hacer: 'Un quiebre es venta perdida: repón en las próximas 24–48 h.' },
    frescura: { que: 'Qué % de los lotes vistos en tu cartera están óptimos o frescos.', como: 'Lotes con buen tiempo de vencimiento (evaluado a la fecha de la visita) ÷ total de lotes.', hacer: 'Rota el producto próximo a vencer para no perder inventario.' },
    anaquel_efec: { que: 'Qué % de tus reportes tienen el producto en la posición óptima del estante (ojos/manos).', como: 'Reportes con ubicación ojos/manos ÷ reportes con ubicación registrada.', hacer: 'Negocia la "ubicación dorada" (mira el Mapa de Anaquel).' },
    pop: { que: 'Qué % de tus reportes tienen el material publicitario (POP) exhibido correctamente.', como: 'Reportes con POP "exhibido correctamente" ÷ reportes con estado de POP.', hacer: 'Repón o corrige el POP dañado o ausente en tus visitas.' },
    visitas: { que: 'Cuántos reportes de visita se registraron en tu cartera en los últimos 30 días.', como: 'Conteo de reportes de visita de los PDV de tu cartera en la ventana.', hacer: 'Más cobertura de visitas alimenta todos los KPIs de ejecución.' },
};

const Bloque = ({ Icon, titulo, children, color = 'text-slate-400' }) => (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
        <div className="flex items-center gap-2 mb-1.5">
            <Icon size={15} className={color} />
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">{titulo}</p>
        </div>
        <div className="text-slate-200 text-sm leading-relaxed">{children}</div>
    </div>
);

// Desglose contextual opcional por KPI.
function Extra({ id, ctx, kpi }) {
    const { stats, vendedor, estadoActual, pct } = ctx || {};
    if (id === 'meta_nivel') {
        return (
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
                <div className="flex justify-between text-xs text-slate-400 mb-1"><span>{num(stats?.unidadesDelMes)} uds</span><span>meta {num(vendedor?.metaMensual)}</span></div>
                <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" style={{ width: `${Math.min(100, (pct || 0) * 100)}%` }} /></div>
                <p className="text-xs text-slate-500 mt-2">{Math.round((pct || 0) * 100)}% de la meta · faltan {num(Math.max(0, (vendedor?.metaMensual || 0) - (stats?.unidadesDelMes || 0)))} uds</p>
            </div>
        );
    }
    if (id === 'comision_periodo' && estadoActual) {
        return (
            <div className="grid grid-cols-3 gap-2">
                {[['Devengado', estadoActual.devengado, 'text-white'], ['Pagado', estadoActual.pagado, 'text-emerald-400'], ['Saldo', estadoActual.saldo, 'text-amber-400']].map(([l, v, c], i) => (
                    <div key={i} className="rounded-xl bg-slate-900 border border-slate-800 p-3"><p className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">{l}</p><p className={`font-black ${c}`}>{money(v)}</p></div>
                ))}
            </div>
        );
    }
    if (id === 'vencidas' || id === 'por_cobrar') {
        return (
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 flex items-center justify-between">
                <div><p className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">Monto vencido</p><p className="font-black text-red-400 text-lg">{money(stats?.montoVencido || 0)}</p></div>
                <div className="text-right"><p className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">Vencidas</p><p className="font-black text-white text-lg">{num(stats?.facturasVencidas || 0)}</p></div>
            </div>
        );
    }
    return null;
}

export default function VendedorKpiDetalle({ id, def, kpi, ctx, onClose }) {
    const d = DETALLE[id] || { que: def?.desc || '', como: '', hacer: '' };
    return createPortal((
        <div className="fixed inset-0 z-[96] bg-slate-950 flex flex-col">
            <div className="shrink-0 flex items-center justify-between px-4 h-14 border-b border-slate-800 bg-slate-900">
                <span className="text-white font-black text-sm truncate pr-2">{def?.label || 'Indicador'}</span>
                <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300 hover:text-white shrink-0"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* Valor grande */}
                <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/40 border border-slate-800 p-5 text-center">
                    <p className={`text-5xl font-black tracking-tight ${TONE_TEXT[kpi?.tone] || 'text-white'}`}>
                        {kpi?.value}{kpi?.unit && <span className="text-lg font-bold text-slate-500"> {kpi.unit}</span>}
                    </p>
                    {kpi?.sub && <p className="text-slate-400 text-sm mt-1">{kpi.sub}</p>}
                </div>

                <Extra id={id} ctx={ctx} kpi={kpi} />

                <Bloque Icon={Info} titulo="Qué significa" color="text-blue-400">{d.que}</Bloque>
                {d.como && <Bloque Icon={Calculator} titulo="Cómo se calcula" color="text-slate-400">{d.como}</Bloque>}
                {d.hacer && <Bloque Icon={Lightbulb} titulo="Qué hacer" color="text-amber-400">{d.hacer}</Bloque>}
            </div>
        </div>
    ), document.body);
}
