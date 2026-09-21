// RUTA: src/Components/CarteraVencidaModal.jsx
//
// Modal de COBRANZA para el máster/gerencia (dueño/CEO): la cartera abierta,
// factura por factura, con COLOR por antigüedad. Sirve para dos cosas:
//
//   1. Decidir a quién cobrar primero (el rojo salta a la vista).
//   2. CUADRAR contra Zoho. El dueño compara el total de GK con el de Zoho
//      Books; cuando no coinciden hace falta ver el detalle, no solo el total.
//      Por eso el modal declara el cuadre de la última conciliación y, si hay
//      diferencia, dice cuántas facturas y por qué.
//
// El modal SIEMPRE carga la cartera COMPLETA: `minDias` solo PRESELECCIONA un
// tramo (46 = entra con "+45 días" marcado, desde la alerta de cartera en
// riesgo; 0 = sin filtro, desde la tarjeta "Por cobrar"). Antes `minDias`
// recortaba los datos, así que al entrar desde la alerta los tramos 0–30 y
// 31–45 salían en $0 y no había forma de ver el resto de la cartera.
// Tema claro (gerencial/máster).

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Search } from 'lucide-react';
import { saldoAbierto, cuentaEnCartera } from '@/utils/facturaEstado.js';
import { useAppConfig } from '@/context/AppConfigContext.tsx';

const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-VE')}`;
const toDate = (t) => t?.toDate?.() || (t ? new Date(t) : null);
const fmtFecha = (d) => d ? d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

// Tramos de antigüedad = las ventanas de cobro del negocio (0–30 a tiempo,
// 31–45 sin bono, +45 en riesgo de anularse la comisión). Los MISMOS colores
// que la barra de la banda ¿Cobramos?, para que las dos lecturas coincidan.
const TRAMOS = [
    { key: 'd0_30',  label: '0–30 días',  max: 30,       chip: 'bg-emerald-100 text-emerald-700', barra: 'bg-emerald-500', borde: 'border-l-emerald-500' },
    { key: 'd31_45', label: '31–45 días', max: 45,       chip: 'bg-amber-100 text-amber-700',     barra: 'bg-amber-500',   borde: 'border-l-amber-500' },
    { key: 'd45p',   label: '+45 días',   max: Infinity, chip: 'bg-red-100 text-red-700',         barra: 'bg-red-500',     borde: 'border-l-red-500' },
];
const tramoDe = (edad) => TRAMOS.find(t => (edad ?? 0) <= t.max) || TRAMOS[2];

export default function CarteraVencidaModal({
    facturas = [],
    minDias = 0,
    titulo = 'Cuentas por cobrar',
    onClose,
}) {
    const [term, setTerm] = useState('');
    const [tramoSel, setTramoSel] = useState(minDias >= 46 ? 'd45p' : minDias >= 31 ? 'd31_45' : null);
    const { zohoCuadre } = useAppConfig();

    const { filas, totalSaldo, nClientes, porTramo } = useMemo(() => {
        const now = new Date();
        const abiertas = (facturas || [])
            // `cuentaEnCartera` deja fuera lo que Zoho ya no reconoce (borrado
            // allá o devuelto a borrador): no es cartera por cobrar de la empresa.
            .filter(f => cuentaEnCartera(f) && f.estado !== 'pagada')
            .map(f => {
                const emis = toDate(f.fecha);
                const venc = toDate(f.vencimiento);
                const edad = emis ? Math.floor((now - emis) / 86400000) : null;         // días desde emisión
                const diasVencida = venc ? Math.floor((now - venc) / 86400000) : null;   // días desde vencimiento
                return {
                    numero: f.numero || '—',
                    cliente: f.razonSocialCanonica || f.clienteName || '—',
                    saldo: saldoAbierto(f),
                    emis, venc, edad, diasVencida,
                    tramo: tramoDe(edad),
                };
            })
            .filter(f => f.edad !== null && f.saldo > 0.005)
            .sort((a, b) => (b.diasVencida ?? b.edad) - (a.diasVencida ?? a.edad));

        const porTramo = {};
        TRAMOS.forEach(t => { porTramo[t.key] = { ...t, monto: 0, n: 0 }; });
        abiertas.forEach(f => { porTramo[f.tramo.key].monto += f.saldo; porTramo[f.tramo.key].n += 1; });

        const clientes = new Set(abiertas.map(f => f.cliente));
        return {
            filas: abiertas,
            totalSaldo: abiertas.reduce((s, f) => s + f.saldo, 0),
            nClientes: clientes.size,
            porTramo,
        };
    }, [facturas]);

    const visibles = filas.filter(f =>
        (!tramoSel || f.tramo.key === tramoSel) &&
        (!term || `${f.numero} ${f.cliente}`.toLowerCase().includes(term.toLowerCase()))
    );

    // Cuadre con Zoho de la última conciliación. Si el total de GK no coincide
    // con el de Zoho, hay que decirlo AQUÍ — es la pantalla donde el dueño
    // compara los dos números.
    const difZoho = zohoCuadre && Number.isFinite(Number(zohoCuadre.zohoPorCobrar))
        ? (totalSaldo - Number(zohoCuadre.zohoPorCobrar)) : null;
    const descuadra = difZoho !== null && Math.abs(difZoho) > 1;

    return createPortal(
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
            <div
                className="bg-slate-50 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
                    <div className="min-w-0">
                        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                            <AlertTriangle size={18} className="text-red-500" /> {titulo}
                        </h2>
                        <p className="text-xs text-slate-500">Toda la cartera abierta · color por antigüedad desde la emisión · toca un tramo para filtrar (o para quitarlo)</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-200 text-slate-500 shrink-0"><X size={20} /></button>
                </div>

                {/* Resumen + tramos */}
                <div className="px-5 py-3 shrink-0 space-y-3">
                    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Saldo total por cobrar</p>
                            <p className="text-3xl font-black text-slate-800 tabular-nums">{money(totalSaldo)}</p>
                        </div>
                        <div className="text-right text-xs text-slate-500 space-y-0.5 shrink-0">
                            <p><b className="tabular-nums text-sm text-slate-700">{filas.length}</b> factura{filas.length === 1 ? '' : 's'}</p>
                            <p><b className="tabular-nums text-sm text-slate-700">{nClientes}</b> cliente{nClientes === 1 ? '' : 's'}</p>
                        </div>
                    </div>

                    {/* Barra + tramos como filtro */}
                    {totalSaldo > 0 && (
                        <>
                            <div className="flex h-3 rounded-lg overflow-hidden">
                                {TRAMOS.map(t => (
                                    <span key={t.key} className={t.barra}
                                        style={{ width: `${(porTramo[t.key].monto / totalSaldo) * 100}%` }} />
                                ))}
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {TRAMOS.map(t => {
                                    const d = porTramo[t.key];
                                    const activo = tramoSel === t.key;
                                    return (
                                        <button key={t.key} type="button"
                                            onClick={() => setTramoSel(activo ? null : t.key)}
                                            className={`text-left rounded-xl p-2.5 border transition-all ${
                                                activo ? 'border-slate-800 bg-white shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
                                            }`}>
                                            <span className={`inline-block text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full ${t.chip}`}>
                                                {t.label}
                                            </span>
                                            <p className="mt-1 font-black text-slate-800 tabular-nums text-sm">{money0(d.monto)}</p>
                                            <p className="text-[11px] text-slate-400 tabular-nums">{d.n} factura{d.n === 1 ? '' : 's'}</p>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {/* CUADRE CON ZOHO: el total de arriba tiene que ser el mismo
                        que el de Zoho Books. Si no lo es, se dice. */}
                    {zohoCuadre && (
                        <div className={`rounded-xl px-3 py-2 text-[11px] leading-snug border ${
                            descuadra ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        }`}>
                            {descuadra ? (
                                <>
                                    <b>No cuadra con Zoho:</b> allá son {money(zohoCuadre.zohoPorCobrar)} ({zohoCuadre.zohoFacturas} facturas)
                                    {' '}y acá {money(totalSaldo)} — diferencia de <b>{money(Math.abs(difZoho))}</b>.
                                    {zohoCuadre.saldoDistinto > 0 && (
                                        <> Hay <b>{zohoCuadre.saldoDistinto}</b> factura{zohoCuadre.saldoDistinto === 1 ? '' : 's'} con
                                        un saldo distinto al de Zoho ({money(zohoCuadre.saldoDistintoDelta || 0)} de más en GK).</>
                                    )}
                                    {' '}El detalle factura por factura está en Integraciones → Conciliación con Zoho.
                                </>
                            ) : (
                                <>Cuadra con Zoho: {money(zohoCuadre.zohoPorCobrar)} en {zohoCuadre.zohoFacturas} facturas.</>
                            )}
                        </div>
                    )}

                    {/* Buscador: con decenas de facturas, encontrar un cliente a mano no es viable. */}
                    {filas.length > 6 && (
                        <div className="relative">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={term} onChange={e => setTerm(e.target.value)}
                                placeholder="Buscar por cliente o número de factura…"
                                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-slate-400"
                            />
                        </div>
                    )}
                </div>

                {/* Lista */}
                <div className="px-5 pb-5 overflow-y-auto">
                    {visibles.length === 0 ? (
                        <p className="text-center text-slate-400 text-sm py-10">
                            {filas.length === 0 ? 'No hay facturas por cobrar. 🎉' : 'Nada con ese filtro.'}
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {visibles.map((f, i) => (
                                <div key={i} className={`bg-white border border-slate-200 border-l-4 ${f.tramo.borde} rounded-xl p-3 flex items-center justify-between gap-3`}>
                                    <div className="min-w-0">
                                        <p className="font-bold text-slate-800 text-sm truncate">{f.cliente}</p>
                                        <p className="text-[11px] text-slate-400 tabular-nums">
                                            {f.numero} · emitida {fmtFecha(f.emis)} · vence {fmtFecha(f.venc)}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="font-black text-slate-800 tabular-nums whitespace-nowrap">{money(f.saldo)}</p>
                                        <span className={`inline-block mt-0.5 text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full ${f.tramo.chip}`}>
                                            {f.diasVencida != null && f.diasVencida > 0
                                                ? `vencida ${f.diasVencida} d`
                                                : f.diasVencida != null ? `vence en ${Math.abs(f.diasVencida)} d`
                                                : `emitida hace ${f.edad} d`}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
                        Saldo real pendiente de Zoho (total − abonos). El COLOR va por días desde la emisión
                        (0–30 · 31–45 · +45, las ventanas de cobro del negocio); "vencida N d" es respecto al
                        vencimiento de cada factura. No se incluyen las facturas anuladas ni las que Zoho ya no reconoce.
                    </p>
                </div>
            </div>
        </div>,
        document.body
    );
}
