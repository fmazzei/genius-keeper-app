// RUTA: src/Components/EnLaManoView.jsx
//
// «En la mano»: con cuántas unidades quedó el mercaderista al terminar su
// jornada, y qué entregó que todavía no se facturó (pedido del dueño, 19-nov).
// Cruza lo retirado de ACC, lo entregado según sus visitas y lo facturado en
// Zoho. El cálculo es puro: `src/utils/enLaMano.js`.
//
// Lo ven el máster y gerencia (Mercaderistas) y administración (su pestaña
// «En la mano»), que es quien factura: por eso arriba van las entregas por
// facturar.

import React, { useState } from 'react';
import { useEnLaMano } from '@/hooks/useEnLaMano.js';
import { Hand, Receipt, Truck, ChevronDown, AlertTriangle, RefreshCw, Loader } from 'lucide-react';
import { diaCaracas } from '@/utils/enLaMano.js';


const fmtDia = (d) => {
    if (!d) return '';
    const [y, m, dd] = d.split('-').map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit', month: 'short' });
};

function Cifra({ Icon, titulo, valor, nota, tono = 'slate' }) {
    const tonos = {
        emerald: 'text-emerald-600 bg-emerald-50 border-emerald-200',
        amber: 'text-amber-700 bg-amber-50 border-amber-200',
        slate: 'text-slate-700 bg-white border-slate-200',
        violet: 'text-violet-700 bg-violet-50 border-violet-200',
    };
    return (
        <div className={`rounded-2xl border p-4 ${tonos[tono]}`}>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider opacity-80">
                <Icon size={14} /> {titulo}
            </div>
            <p className="text-3xl font-black mt-1 leading-none">{valor} <span className="text-sm font-bold opacity-70">uds</span></p>
            {nota && <p className="text-xs mt-1.5 opacity-80 leading-snug">{nota}</p>}
        </div>
    );
}

export default function EnLaManoView({ datos: dado = null }) {
    const propio = useEnLaMano(!dado);
    const { r, error, recargar } = dado || propio;
    const [abierto, setAbierto] = useState(null);
    const hoy = diaCaracas(Date.now());

    if (error) {
        return (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
                No se pudo armar el cruce: {error}
                <button onClick={recargar} className="ml-2 underline font-semibold">Reintentar</button>
            </div>
        );
    }
    if (!r) {
        return <div className="flex items-center gap-2 text-slate-500 text-sm py-6"><Loader size={16} className="animate-spin" /> Cruzando retiros, visitas y facturas…</div>;
    }

    const porFacturarUds = r.porFacturar.reduce((s, x) => s + x.unidades, 0);
    const dias = [...r.dias].reverse();
    const descuentos = r.dias.flatMap(d => d.retiros.filter(x => x.registradoComo === 'descuento'));

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-lg font-black text-slate-800">Mercaderista: en la mano</h3>
                    <p className="text-sm text-slate-500">
                        Desde el {fmtDia(r.desde)}: retiró {r.retirado} de Frimaca, entregó {r.entregado}{r.repuesto ? ` y repuso ${r.repuesto}` : ''} según sus visitas, y se facturaron {r.facturado}.
                    </p>
                </div>
                <button onClick={recargar} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 shrink-0" title="Actualizar">
                    <RefreshCw size={16} />
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Cifra Icon={Hand} titulo="En la mano" valor={r.enLaMano} tono="emerald"
                    nota="Lo que debería tener según lo que retiró y lo que anotó en sus visitas." />
                <Cifra Icon={Receipt} titulo="Entregado sin factura" valor={porFacturarUds} tono={porFacturarUds > 0 ? 'amber' : 'slate'}
                    nota={porFacturarUds > 0 ? `${r.porFacturar.length} entrega${r.porFacturar.length !== 1 ? 's' : ''} por facturar (abajo).` : 'Todo lo entregado está facturado.'} />
                <Cifra Icon={Truck} titulo="Devoluciones en la mano" valor={r.devoluciones} tono={r.devoluciones > 0 ? 'violet' : 'slate'}
                    nota="Retiradas de anaquel para devolver: van al camión a Barinas." />
            </div>
            <p className="text-xs text-slate-500">
                Retirado − facturado = <b>{r.sinFacturar}</b> sin facturar: son las {r.enLaMano} en la mano más las {porFacturarUds} entregadas por facturar
                {r.sinFacturar !== r.enLaMano + porFacturarUds ? ' (la diferencia la explican las facturas sin entrega anotada o lo repuesto y reubicado)' : ''}.
            </p>

            {r.porFacturar.length > 0 && (
                <section className={`bg-white border rounded-2xl overflow-hidden ${r.porFacturar.some(x => x.dia < hoy) ? 'border-red-300' : 'border-amber-200'}`}>
                    <p className={`px-4 py-3 text-sm font-bold border-b ${r.porFacturar.some(x => x.dia < hoy) ? 'text-red-700 bg-red-50 border-red-200' : 'text-amber-800 bg-amber-50 border-amber-200'}`}>
                        Entregas por facturar{r.porFacturar.some(x => x.dia < hoy) ? ' · facturar hoy: ya pasó el día de la entrega' : ''}
                    </p>
                    <div className="divide-y divide-slate-100">
                        {r.porFacturar.map((x, i) => (
                            <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-800 truncate">{x.posName}</p>
                                    <p className="text-xs text-slate-500">Entregado el {fmtDia(x.dia)}{x.quien ? ` · ${x.quien}` : ''}</p>
                                    {x.motivo && <p className="text-xs text-amber-700 mt-0.5">{x.motivo}</p>}
                                </div>
                                <p className={`text-lg font-black shrink-0 ${x.dia < hoy ? 'text-red-600' : 'text-amber-700'}`}>{x.unidades}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {r.sinEntrega.length > 0 && (
                <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <p className="px-4 py-3 text-sm font-bold text-slate-700 border-b border-slate-200">Facturado sin entrega anotada</p>
                    <p className="px-4 pt-2 text-xs text-slate-500">Facturas de la ruta que ninguna visita del mercaderista registra como entregadas.</p>
                    <div className="divide-y divide-slate-100">
                        {r.sinEntrega.map(x => (
                            <div key={x.numero} className="px-4 py-2.5 flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-800 truncate">{x.cliente}</p>
                                    <p className="text-xs text-slate-500">{x.numero} · {fmtDia(x.dia)}</p>
                                </div>
                                <p className="text-lg font-black text-slate-700 shrink-0">{x.unidades}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {descuentos.length > 0 && (
                <div className="flex items-start gap-2 text-xs rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2.5">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>
                        {descuentos.length === 1 ? 'Un retiro se anotó' : `${descuentos.length} retiros se anotaron`} con «Descontar» en vez de «Picking».
                        Aquí cuentan igual, pero en el inventario quedan como merma: anótalos como picking.
                    </span>
                </div>
            )}

            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <p className="px-4 py-3 text-sm font-bold text-slate-700 border-b border-slate-200">Día por día</p>
                <div className="grid grid-cols-[1fr_repeat(4,minmax(0,3.2rem))] gap-x-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <span>Día</span><span className="text-right">Retiró</span><span className="text-right">Entregó</span><span className="text-right">Facturó</span><span className="text-right">Mano</span>
                </div>
                <div className="divide-y divide-slate-100">
                    {dias.map(d => (
                        <div key={d.dia}>
                            <button type="button" onClick={() => setAbierto(a => (a === d.dia ? null : d.dia))}
                                className="w-full grid grid-cols-[1fr_repeat(4,minmax(0,3.2rem))] gap-x-2 px-4 py-2.5 text-sm text-left hover:bg-slate-50">
                                <span className="flex items-center gap-1 font-semibold text-slate-700 capitalize min-w-0">
                                    <ChevronDown size={13} className={`shrink-0 text-slate-400 transition-transform ${abierto === d.dia ? 'rotate-180' : ''}`} />
                                    <span className="truncate">{fmtDia(d.dia)}</span>
                                </span>
                                <span className="text-right font-mono">{d.retirado || '—'}</span>
                                <span className="text-right font-mono">{d.entregado + d.repuesto || '—'}</span>
                                <span className="text-right font-mono">{d.facturado || '—'}</span>
                                <span className="text-right font-mono font-black text-emerald-700">{d.manoVisitas}</span>
                            </button>
                            {abierto === d.dia && (
                                <div className="px-4 pb-3 space-y-1.5 text-xs text-slate-600">
                                    {d.retiros.map((x, i) => (
                                        <p key={`r${i}`}>Retiró <b>{x.unidades}</b> de Frimaca{x.lote ? ` · lote ${x.lote}` : ''}{x.quien ? ` · anotó ${x.quien}` : ''}{x.registradoComo === 'descuento' ? ' (como descuento)' : ''}</p>
                                    ))}
                                    {d.entregas.map((x, i) => (
                                        <p key={`e${i}`}>Entregó <b>{x.unidades}</b> en {x.posName}{x.facturadaCon?.length ? ` · ${x.facturadaCon.join(', ')}` : ' · sin factura'}</p>
                                    ))}
                                    {d.repuesto > 0 && <p>Repuso <b>{d.repuesto}</b> al retirar producto de un anaquel.</p>}
                                    {d.reubicado > 0 && <p>Retiró <b>{d.reubicado}</b> de un anaquel para ponerlas en otro.</p>}
                                    {d.devolucion > 0 && <p>Retiró <b>{d.devolucion}</b> de un anaquel como devolución (al camión).</p>}
                                    {d.facturas.map(x => (
                                        <p key={x.numero}>Factura {x.numero} · {x.cliente} · <b>{x.unidades}</b></p>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                    {dias.length === 0 && <p className="px-4 py-4 text-sm text-slate-500">Sin movimientos desde el {fmtDia(r.desde)}.</p>}
                </div>
            </section>
            <p className="text-[11px] text-slate-400">
                Se parte de {r.inicial} en la mano el {fmtDia(r.desde)}. Una entrega se cruza con una factura del mismo cliente de Zoho emitida desde 2 días antes hasta 7 días después.
            </p>
        </div>
    );
}
