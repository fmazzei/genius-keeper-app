// RUTA: src/Components/CeseVendedor.jsx
//
// FECHA DE CESE de un vendedor (pedido del dueño, 3-nov-2026). Se pide al
// marcarlo inactivo (y se puede registrar o corregir después). Desde esa fecha:
//   · sus comisiones quedan calculadas hasta ese día y el mes se congela solo;
//   · sus facturas que seguían abiertas ese día pasan al vendedor que heredó sus
//     clientes (si ya se hizo el traspaso; si no, pasan al hacerlo).
// Primero muestra qué va a pasar (el servidor lo simula) y solo con la
// confirmación lo aplica. Lo hace la función `registrarCese`.

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/Firebase/config.js';
import { Loader2, AlertCircle } from 'lucide-react';

const llamar = (datos) => httpsCallable(functions, 'registrarCese')(datos).then(r => r.data);
const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ddmm = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : s; };

export default function CeseVendedor({ vendedor, onListo, onCancelar }) {
    const [fecha, setFecha] = useState(vendedor.fechaCese || hoy());
    const [sim, setSim] = useState(null);
    const [error, setError] = useState('');
    const [trabajando, setTrabajando] = useState(false);

    useEffect(() => {
        let vivo = true;
        setSim(null); setError('');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return undefined;
        llamar({ vendedorId: vendedor.id, fechaCese: fecha, accion: 'simular' })
            .then(r => { if (vivo) setSim(r.resumen); })
            .catch(e => { if (vivo) setError(e?.message || 'No se pudo calcular.'); });
        return () => { vivo = false; };
    }, [fecha, vendedor.id]);

    const confirmar = async () => {
        setTrabajando(true); setError('');
        try { await llamar({ vendedorId: vendedor.id, fechaCese: fecha, accion: 'ejecutar' }); onListo?.(fecha); }
        catch (e) { setError(e?.message || 'No se pudo registrar el cese.'); setTrabajando(false); }
    };

    return createPortal((
        <div className="fixed inset-0 z-[100] bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto">
                <div>
                    <p className="text-lg font-bold text-slate-800">Cese de {vendedor.name}</p>
                    <p className="text-sm text-slate-500">¿Cuál fue su último día de trabajo en la empresa?</p>
                </div>
                <input type="date" value={fecha} max={hoy()} onChange={e => setFecha(e.target.value)}
                    className="block w-full min-w-0 appearance-none p-2.5 border border-slate-300 rounded-lg text-base" />
                <ul className="text-sm text-slate-700 space-y-1.5">
                    <li>• Sus comisiones se calculan hasta el <b>{ddmm(fecha)}</b> y ese mes se congela solo al cerrar.</li>
                    <li>• Su fijo de ese mes: las quincenas que cerraron hasta ese día.</li>
                    <li>• Sus facturas que seguían abiertas ese día pasan a quien heredó sus clientes (como cuentas recuperadas).</li>
                </ul>
                {!sim && !error && <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Calculando…</p>}
                {sim && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm space-y-1">
                        {sim.carnetsHeredados > 0 ? (
                            <p><b>{sim.facturasQuePasan}</b> factura{sim.facturasQuePasan !== 1 ? 's' : ''} abierta{sim.facturasQuePasan !== 1 ? 's' : ''} ({money(sim.saldoQuePasa)}) pasan al heredero{sim.detalle?.[0]?.a ? ` (${sim.detalle[0].a})` : ''}.</p>
                        ) : (
                            <p className="text-amber-800">Sus clientes todavía no se han traspasado a nadie: sus facturas abiertas pasarán cuando hagas el traspaso (Comercial → Traspasar cartera).</p>
                        )}
                        {sim.carnetsSinHeredero > 0 && sim.carnetsHeredados > 0 && <p className="text-amber-800">{sim.carnetsSinHeredero} cliente(s) siguen a su nombre: traspásalos en Comercial → Traspasar cartera.</p>}
                        {sim.detalle?.length > 0 && (
                            <details className="text-xs text-slate-500"><summary className="cursor-pointer">Ver las facturas</summary>
                                <p className="mt-1">{sim.detalle.map(f => `${f.numero} (${money(f.saldo)})`).join(' · ')}</p>
                            </details>
                        )}
                    </div>
                )}
                {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-2.5 flex gap-2"><AlertCircle size={16} className="shrink-0 mt-0.5" />{error}</p>}
                <div className="grid grid-cols-2 gap-2 pt-1">
                    <button type="button" onClick={onCancelar} disabled={trabajando} className="py-2.5 rounded-lg border border-slate-300 text-slate-600 font-semibold text-sm">Cancelar</button>
                    <button type="button" onClick={confirmar} disabled={trabajando || !sim}
                        className="py-2.5 rounded-lg bg-red-600 text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2">
                        {trabajando && <Loader2 size={15} className="animate-spin" />} Registrar cese
                    </button>
                </div>
            </div>
        </div>
    ), document.body);
}
