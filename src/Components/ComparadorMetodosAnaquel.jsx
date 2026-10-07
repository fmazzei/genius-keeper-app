// RUTA: src/Components/ComparadorMetodosAnaquel.jsx
//
// COMPARAR MÉTODOS (solo máster, solo lectura). Pone lado a lado la rotación del
// Dashboard y la del método nuevo del anaquel v2, paso por paso, con los datos
// REALES. Sirve para calibrar los umbrales antes de cambiar la captura (Fase 2).
//
// No escribe nada: recibe los reportes y las devoluciones que la hoja del mapa
// ya leyó, y todo el cálculo es `compararMetodos` (src/utils/anaquelV2.js).

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FlaskConical } from 'lucide-react';
import EncabezadoHoja from '@/Components/EncabezadoHoja.jsx';
import { useAtrasCierra } from '@/hooks/useAtrasCierra.js';
import { compararMetodos, fmtNum, fmtUds } from '@/utils/anaquelV2.js';
import { MIN_DIAS_TRAMO, MAX_DIAS_TRAMO, PERIODOS_DIAS } from '@/utils/anaquelConstantes.js';

const pct = (v) => (v == null || !Number.isFinite(v) ? '—' : `${fmtNum(v * 100, 1)} %`);
const signo = (v) => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(Math.abs(v), 2)}`);
const fecha = (ms) => new Date(ms).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' });

function Dato({ k, v, sub }) {
    return (
        <div className="bg-white border border-slate-200 rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</p>
            <p className="text-xl font-black text-slate-800 leading-tight">{v}</p>
            {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
        </div>
    );
}

function Seccion({ titulo, nota, children }) {
    return (
        <section className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="font-bold text-slate-800">{titulo}</h3>
            {nota && <p className="text-xs text-slate-500 mt-0.5 mb-3">{nota}</p>}
            {children}
        </section>
    );
}

export default function ComparadorMetodosAnaquel({ reports, devoluciones, posList, onClose }) {
    useAtrasCierra(onClose);
    const [dias, setDias] = useState(30);
    const [verTodos, setVerTodos] = useState(false);
    const [verCambian, setVerCambian] = useState(false);
    const c = useMemo(() => compararMetodos({ reports: reports || [], devoluciones: devoluciones || [], posList: posList || [], dias }),
        [reports, devoluciones, posList, dias]);

    const maxHist = Math.max(1, ...c.histDias.map(h => h.tramos));
    const pdvs = verTodos ? c.porPdv : c.porPdv.slice(0, 25);

    return createPortal(
        <div className="fixed inset-0 z-[110] bg-slate-50 flex flex-col">
            <EncabezadoHoja titulo="Comparar métodos" onVolver={onClose}
                icono={<FlaskConical size={18} className="text-brand-blue shrink-0" />}
                subtitulo="Solo máster · solo lectura. Rotación del Dashboard contra el método nuevo, con los datos reales." />
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-4xl mx-auto p-3 sm:p-5 space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-500">Período:</span>
                        {PERIODOS_DIAS.map(d => (
                            <button key={d} onClick={() => setDias(d)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${dias === d ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-slate-600 border-slate-200'}`}>
                                {d} días
                            </button>
                        ))}
                        {devoluciones == null && <span className="text-[11px] text-amber-700">No se pudieron leer las devoluciones: los pasos que las usan salen sin ellas.</span>}
                    </div>

                    {/* 1. De la cifra del Dashboard al método nuevo */}
                    <Seccion titulo="De la cifra del Dashboard al método nuevo"
                        nota="Cada paso agrega una regla y muestra cuánto mueve la rotación de la red (uds por día, ponderada por tiempo).">
                        <div className="mb-3 rounded-xl bg-slate-100 px-3 py-2 text-sm">
                            Cifra del Dashboard (últimos {dias} días): <b>{fmtUds(c.dashboard)}</b>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {c.pasos.map((p, k) => (
                                <div key={p.clave} className="py-2 flex items-center gap-3">
                                    <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center shrink-0">{k + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-800">{p.nombre}</p>
                                        <p className="text-[11px] text-slate-500">{p.tramos} tramos · {fmtNum(p.dias, 0)} días medidos</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm font-black text-slate-800">{fmtUds(p.porDia)}</p>
                                        {k > 0 && <p className={`text-[11px] font-bold ${p.cambio > 0 ? 'text-emerald-700' : p.cambio < 0 ? 'text-red-700' : 'text-slate-400'}`}>{signo(p.cambio)} uds/día</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">
                            Si además se excluyeran los tramos que terminan en anaquel vacío ({c.tramosEnQuiebre}), la rotación sería {fmtUds(c.rotacionSiSeExcluyeranQuiebres)}.
                            El método nuevo los cuenta como mínimo: se vendió al menos eso.
                        </p>
                    </Seccion>

                    {/* 2. Calidad de los tramos */}
                    <Seccion titulo="Los tramos medidos" nota={`Tramos crudos entre dos visitas seguidas que terminan en el período: ${c.tramosTotales}.`}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <Dato k="Resultado negativo" v={pct(c.pctNegativos)} sub="error de captura: se excluyen, no se ponen en cero" />
                            <Dato k="Terminan en anaquel vacío" v={pct(c.pctTerminanVacio)} sub="cuentan como mínimo" />
                            <Dato k="Tramos cortos unidos" v={c.tramosCortosUnidos.tramos} sub={`juntan ${c.tramosCortosUnidos.absorbidos} tramos de menos de ${MIN_DIAS_TRAMO} días`} />
                            <Dato k="Incluyen devoluciones" v={c.devoluciones.tramos} sub={`de ${c.tramosContados} que cuentan · ${fmtNum(c.devoluciones.retiradas, 0)} uds retiradas`} />
                        </div>
                        <p className="text-xs font-bold text-slate-600 mt-4 mb-2">Días por tramo (para calibrar el mínimo de {MIN_DIAS_TRAMO} y el máximo de {MAX_DIAS_TRAMO})</p>
                        <div className="space-y-1.5">
                            {c.histDias.map(h => (
                                <div key={h.id} className="flex items-center gap-2 text-xs">
                                    <span className="w-24 shrink-0 text-slate-600">{h.label}</span>
                                    <div className="flex-1 h-4 bg-slate-100 rounded">
                                        <div className="h-4 rounded bg-brand-blue" style={{ width: `${h.tramos / maxHist * 100}%` }} />
                                    </div>
                                    <span className="w-24 shrink-0 text-right font-bold text-slate-700">
                                        {h.tramos} {c.tramosTotales ? `(${fmtNum(h.tramos / c.tramosTotales * 100, 0)} %)` : ''}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </Seccion>

                    {/* 3. Devoluciones */}
                    <Seccion titulo="Devoluciones de los últimos 90 días, por motivo"
                        nota={`${c.devoluciones90.registros} registros. Un registro con lotes de varios motivos cuenta en cada uno.`}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                                        <th className="py-1.5">Motivo</th><th className="py-1.5 text-right">Registros</th><th className="py-1.5 text-right">Unidades</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {c.devoluciones90.porMotivo.filter(m => m.motivo !== 'sin_motivo' || m.registros > 0).map(m => (
                                        <tr key={m.motivo}>
                                            <td className="py-1.5 text-slate-700">{m.etiqueta}</td>
                                            <td className="py-1.5 text-right font-bold">{m.registros}</td>
                                            <td className="py-1.5 text-right font-bold">{fmtNum(m.unidades, 0)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Seccion>

                    {/* 4. Por PDV */}
                    <Seccion titulo="Por punto de venta"
                        nota="Rotación con el método anterior (Dashboard) y con el nuevo. Ordenados por la diferencia: arriba los que más mueven el total.">
                        <div className="divide-y divide-slate-100">
                            {pdvs.map(p => (
                                <div key={p.posId} className="py-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-sm font-semibold text-slate-800 min-w-0">{p.nombre}</p>
                                        <span className={`shrink-0 text-sm font-black ${p.diferencia > 0 ? 'text-emerald-700' : p.diferencia < 0 ? 'text-red-700' : 'text-slate-500'}`}>{signo(p.diferencia)}</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                        {p.visitas} visitas · Anterior <b className="text-slate-700">{fmtNum(p.rotAnterior, 2)}</b> ({p.tramosAnterior} tramos)
                                        {' → '}Nuevo <b className="text-slate-700">{fmtNum(p.rotNueva, 2)}</b> ({p.tramosNuevo} tramos)
                                    </p>
                                </div>
                            ))}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">Rotación en uds por día; a la derecha, la diferencia (nuevo − anterior). "—" = sin tramos que cuenten en ese método.</p>
                        {c.porPdv.length > 25 && (
                            <button onClick={() => setVerTodos(v => !v)} className="mt-2 text-sm font-bold text-brand-blue">
                                {verTodos ? 'Ver solo los 25 primeros' : `Ver los ${c.porPdv.length} PDV`}
                            </button>
                        )}
                    </Seccion>

                    {/* 5. Tramos que cambian de estado */}
                    <Seccion titulo={`Tramos que el método nuevo cuenta distinto (${c.cambian.length})`}
                        nota="Tramos que el Dashboard cuenta y el método nuevo excluye o une con otro.">
                        <button onClick={() => setVerCambian(v => !v)} className="text-sm font-bold text-brand-blue">
                            {verCambian ? 'Ocultar la lista' : 'Ver la lista'}
                        </button>
                        {verCambian && (
                            <div className="overflow-x-auto mt-2">
                                <table className="w-full text-xs min-w-[520px]">
                                    <thead>
                                        <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400">
                                            <th className="py-1.5 px-1">PDV</th><th className="py-1.5 px-1">Tramo</th>
                                            <th className="py-1.5 px-1 text-right">Días</th><th className="py-1.5 px-1 text-right">Venta Dashboard</th>
                                            <th className="py-1.5 px-1">Ahora</th><th className="py-1.5 px-1 text-right">Venta nueva</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {c.cambian.map((t, i) => (
                                            <tr key={i}>
                                                <td className="py-1.5 px-1 font-semibold text-slate-700">{t.nombre}</td>
                                                <td className="py-1.5 px-1 text-slate-500">{fecha(t.desde)} – {fecha(t.hasta)}</td>
                                                <td className="py-1.5 px-1 text-right">{fmtNum(t.dias, 1)}</td>
                                                <td className="py-1.5 px-1 text-right">{fmtNum(t.ventasDashboard, 0)}</td>
                                                <td className="py-1.5 px-1">{t.estadoNuevo.replace('_', ' ')}</td>
                                                <td className="py-1.5 px-1 text-right">{fmtNum(t.ventasNuevo, 0)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {c.porVencer90.devoluciones > 0 && (
                            <p className="text-[11px] text-slate-500 mt-2">Retiros "Por vencer" en 90 días: {c.porVencer90.devoluciones} ({fmtNum(c.porVencer90.unidades, 0)} uds). No son merma: se reubican o se trasladan.</p>
                        )}
                    </Seccion>
                    <p className="text-[11px] text-slate-400 text-center pb-6">Esta pantalla no guarda ni cambia nada.</p>
                </div>
            </div>
        </div>,
        document.body,
    );
}
