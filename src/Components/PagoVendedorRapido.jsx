// RUTA: src/Components/PagoVendedorRapido.jsx — UN monto y listo (25-nov-2026).
//
// Pedido del dueño: «si la administradora introduce el monto correcto, el
// sistema tiene que hacer todo solo». Se escribe lo que se transfirió; el
// sistema lo reconoce (todas las comisiones, el fijo, las dos cosas o un
// abono), lo reparte entre los meses (descontando lo pagado de más), lo pasa
// por los cruces y lo registra. Sin preguntas.

import React, { useMemo, useState } from 'react';
import { repartirPago } from '../utils/pagoVendedor.js';
import { puedePagar } from '../utils/verificarLiquidacion.js';

const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const leerMonto = (t) => {
    const s = String(t || '').trim().replace(/\s/g, '');
    if (!s) return 0;
    // «1.234,56» o «1234,56» o «1234.56»
    const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
    return Number.isFinite(n) ? n : 0;
};
const hoyStr = () => {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
};

/**
 * @param {{estados:Array, verifs:Object, baseMes:number, nombre:string,
 *          onRegistrar:(plan, extra:{fecha,nota,file})=>Promise<void>}} props
 */
export default function PagoVendedorRapido({ estados = [], verifs = {}, baseMes = 0, nombre = '', onRegistrar }) {
    const [texto, setTexto] = useState('');
    const [fecha, setFecha] = useState(hoyStr());
    const [nota, setNota] = useState('');
    const [file, setFile] = useState(null);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');
    const [listo, setListo] = useState(null);

    const monto = leerMonto(texto);
    const plan = useMemo(() => (monto > 0 ? repartirPago(estados, monto, { baseMes }) : null), [estados, monto, baseMes]);
    const deuda = useMemo(() => repartirPago(estados, 0, { baseMes }).deuda, [estados, baseMes]);

    // Un mes cuyos cruces dan error no se paga: se dice cuál y por qué.
    const bloqueos = (plan?.ok ? plan.lineas : [])
        .map(l => {
            const v = verifs[l.periodKey]?.v;
            if (v && puedePagar(v, l.concepto)) return null;
            const err = (v?.cruces || []).find(c => c.nivel === 'error' && (c.cuenta === l.concepto || c.cuenta === 'ambas'));
            return `Mes ${l.mes}: ${err ? `${err.titulo}. ${err.detalle}` : 'no se pudo verificar el cálculo.'}`;
        })
        .filter(Boolean);
    const puede = plan?.ok && bloqueos.length === 0 && !guardando;

    const registrar = async () => {
        if (!puede) return;
        setGuardando(true); setError('');
        try {
            await onRegistrar(plan, { fecha: fecha || hoyStr(), nota: nota.trim(), file });
            setListo({ total: plan.total, lineas: plan.lineas });
            setTexto(''); setNota(''); setFile(null);
        } catch (e) {
            setError(e.message || 'No se pudo registrar el pago.');
        } finally { setGuardando(false); }
    };

    const sinDeuda = deuda.total <= 0.005 && deuda.comBruto <= 0.005;

    return (
        <div className="bg-white border-2 border-brand-blue/30 rounded-xl p-5 mb-4">
            <p className="font-bold text-slate-800">Registrar un pago{nombre ? ` a ${nombre}` : ''}</p>
            {sinDeuda ? (
                <p className="text-emerald-700 text-sm mt-1">No se le debe nada: comisiones y fijo están al día.</p>
            ) : (
                <>
                    <p className="text-slate-500 text-xs mt-1 mb-3">
                        Escribe lo que transferiste. El sistema lo reparte entre los meses y lo registra.
                    </p>
                    <div className="flex flex-wrap gap-2 mb-3">
                        <button type="button" onClick={() => { setTexto(deuda.total.toFixed(2).replace('.', ',')); setListo(null); }}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-brand-blue/10 text-brand-blue">
                            Se le debe: {money(deuda.total)}
                        </button>
                        {deuda.comNeto > 0.005 && deuda.fijoTotal > 0.005 && (<>
                            <span className="text-xs text-slate-500 self-center">comisiones {money(deuda.comNeto)} · fijo {money(deuda.fijoTotal)}</span>
                        </>)}
                        {deuda.aFavor > 0.005 && (
                            <span className="text-xs text-slate-500 self-center">ya descontados {money(deuda.aFavor)} pagados de más antes</span>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                            <label className="text-xs font-semibold text-slate-600">Monto transferido (USD)</label>
                            <input type="text" inputMode="decimal" value={texto} placeholder="0,00"
                                onChange={e => { setTexto(e.target.value.replace(/[^0-9.,]/g, '')); setListo(null); setError(''); }}
                                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-lg font-bold text-slate-800" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-600">Fecha</label>
                            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                                className="mt-1 w-full min-w-0 border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-800" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-600">Referencia (opcional)</label>
                            <input type="text" value={nota} onChange={e => setNota(e.target.value)} placeholder="Ref. banco, Bs…"
                                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-800" />
                        </div>
                    </div>
                    <label className="block mt-2 text-xs text-slate-500">
                        Comprobante del banco (opcional):{' '}
                        <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} className="text-xs" />
                    </label>

                    {plan && !plan.ok && <p className="mt-3 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{plan.error}</p>}
                    {plan?.ok && (
                        <div className={`mt-3 rounded-lg px-3 py-2.5 text-sm ${bloqueos.length ? 'bg-red-50' : 'bg-emerald-50'}`}>
                            <p className={`font-bold ${bloqueos.length ? 'text-red-700' : 'text-emerald-800'}`}>{plan.titulo}</p>
                            <p className="text-slate-600 text-xs mb-1.5">{plan.explicacion}</p>
                            {plan.lineas.map((l, i) => (
                                <p key={i} className="text-slate-700 text-sm flex justify-between gap-2">
                                    <span>Mes {l.mes} · {l.rango} · {l.concepto === 'fijo' ? `fijo (${l.fijoTipo === 'quincena' ? 'quincena' : 'mes'})` : 'comisiones'}</span>
                                    <b>{money(l.monto)}</b>
                                </p>
                            ))}
                            {bloqueos.map((b, i) => <p key={i} className="text-red-700 text-xs mt-1.5">{b}</p>)}
                        </div>
                    )}
                    {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

                    <button type="button" onClick={registrar} disabled={!puede}
                        className="mt-3 w-full bg-brand-blue text-white font-bold text-sm px-5 py-3 rounded-xl disabled:opacity-40">
                        {guardando ? 'Registrando…' : plan?.ok ? `Registrar pago de ${money(plan.total)}` : 'Registrar pago'}
                    </button>
                </>
            )}
            {listo && (
                <p className="mt-3 text-sm text-emerald-800 bg-emerald-50 rounded-lg px-3 py-2">
                    Listo: se registró el pago de <b>{money(listo.total)}</b> ({listo.lineas.map(l => `Mes ${l.mes} ${money(l.monto)}`).join(' · ')}). Está en el histórico con su cálculo.
                </p>
            )}
        </div>
    );
}
