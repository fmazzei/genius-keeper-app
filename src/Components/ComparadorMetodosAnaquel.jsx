// RUTA: src/Components/ComparadorMetodosAnaquel.jsx
//
// COMPARAR MÉTODOS (solo máster, solo lectura). Pone lado a lado la rotación del
// Dashboard y la del método nuevo del anaquel v2, paso por paso, con los datos
// REALES. Sirve para calibrar los umbrales antes de cambiar la captura (Fase 2).
// Incluye el diagnóstico de los intervalos de visitas: negativos con sus
// vecinos, intervalos largos, cobertura y posibles PDV duplicados.
//
// No escribe nada: recibe los reportes y las devoluciones que la hoja del mapa
// ya leyó, lee la lista COMPLETA de PDV (activos e inactivos, para buscar
// duplicados) y todo el cálculo es `compararMetodos` (src/utils/anaquelV2.js).

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, getDocs } from 'firebase/firestore';
import { FlaskConical } from 'lucide-react';
import { db } from '@/Firebase/config.js';
import EncabezadoHoja from '@/Components/EncabezadoHoja.jsx';
import { useAtrasCierra } from '@/hooks/useAtrasCierra.js';
import { compararMetodos, fmtNum, fmtUds } from '@/utils/anaquelV2.js';
import { MIN_DIAS_TRAMO, MAX_DIAS_TRAMO, PERIODOS_DIAS, FACTOR_VECINO_ALTO, PCT_VECINO_COMPENSA } from '@/utils/anaquelConstantes.js';

const pct = (v) => (v == null || !Number.isFinite(v) ? '—' : `${fmtNum(v * 100, 1)} %`);
const signo = (v) => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(Math.abs(v), 2)}`);
const signoUds = (v) => (v == null || !Number.isFinite(v) ? '—'
    : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(Math.abs(v), Number.isInteger(v) ? 0 : 2)}`);
const fecha = (ms) => (ms ? new Date(ms).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—');
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

const ETIQUETA_ESTADO = {
    error_captura: 'negativo (error de captura)', corto: `corto (menos de ${MIN_DIAS_TRAMO} días)`,
    largo: `largo (más de ${MAX_DIAS_TRAMO} días)`, sin_producto: 'sin producto', minimo: 'mínimo (anaquel vacío)',
    valido: 'válido', 'fuera del periodo': 'fuera del período',
};
const etiquetaEstado = (e) => {
    const m = /^unido \((.+)\)$/.exec(e || '');
    return m ? `unido con el siguiente · ${ETIQUETA_ESTADO[m[1]] || m[1]}` : (ETIQUETA_ESTADO[e] || e);
};
const LECTURA = {
    desfase: { txt: 'Vecino alto: posible desfase facturación–despacho', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
    aislado: { txt: 'Aislado: posible producto que entró sin registrarse', cls: 'bg-red-50 text-red-700 border-red-200' },
    sin_vecinos: { txt: 'Sin intervalos vecinos para comparar', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

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

function Cifra({ k, v, fuerte }) {
    return (
        <span className="inline-flex flex-col min-w-[64px]">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">{k}</span>
            <span className={`text-sm ${fuerte ? 'font-black' : 'font-semibold'} ${fuerte && v < 0 ? 'text-red-700' : 'text-slate-800'}`}>{fmtNum(v, 0)}</span>
        </span>
    );
}

export default function ComparadorMetodosAnaquel({ reports, devoluciones, posList, onClose }) {
    useAtrasCierra(onClose);
    const [dias, setDias] = useState(30);
    const [verTodos, setVerTodos] = useState(false);
    const [verCambian, setVerCambian] = useState(false);
    // Lista completa de PDV (también inactivos): un duplicado suele estar inactivo.
    const [posTodos, setPosTodos] = useState(null);
    useEffect(() => {
        let vivo = true;
        getDocs(collection(db, 'pos'))
            .then(s => { if (vivo) setPosTodos(s.docs.map(d => ({ id: d.id, ...d.data(), type: 'pos' }))); })
            .catch(() => { if (vivo) setPosTodos([]); });
        return () => { vivo = false; };
    }, []);
    const lista = useMemo(() => (posTodos && posTodos.length ? posTodos : (posList || [])), [posTodos, posList]);
    const c = useMemo(() => compararMetodos({ reports: reports || [], devoluciones: devoluciones || [], posList: lista, dias }),
        [reports, devoluciones, lista, dias]);

    const maxHist = Math.max(1, ...c.histDias.map(h => h.tramos));
    const pdvs = verTodos ? c.porPdv : c.porPdv.slice(0, 25);
    const nDesfase = c.negativos.filter(n => n.lectura === 'desfase').length;
    const nAislado = c.negativos.filter(n => n.lectura === 'aislado').length;

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
                                        <p className="text-[11px] text-slate-500">{plural(p.tramos, 'intervalo de visitas', 'intervalos de visitas')} · {fmtNum(p.dias, 0)} días medidos</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm font-black text-slate-800">{fmtUds(p.porDia)}</p>
                                        {k > 0 && <p className={`text-[11px] font-bold ${p.cambio > 0 ? 'text-emerald-700' : p.cambio < 0 ? 'text-red-700' : 'text-slate-400'}`}>{signo(p.cambio)} uds/día</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">
                            Si además se excluyeran los intervalos de visitas que terminan en anaquel vacío ({c.tramosEnQuiebre}), la rotación sería {fmtUds(c.rotacionSiSeExcluyeranQuiebres)}.
                            El método nuevo los cuenta como mínimo: se vendió al menos eso.
                        </p>
                    </Seccion>

                    {/* 2. Calidad de los intervalos de visitas */}
                    <Seccion titulo="Los intervalos de visitas medidos" nota={`Intervalos de visitas crudos (entre dos visitas seguidas) que terminan en el período: ${c.tramosTotales}.`}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <Dato k="Resultado negativo" v={pct(c.pctNegativos)} sub="error de captura: se excluyen, no se ponen en cero" />
                            <Dato k="Terminan en anaquel vacío" v={pct(c.pctTerminanVacio)} sub="cuentan como mínimo" />
                            <Dato k="Intervalos cortos unidos" v={c.tramosCortosUnidos.tramos} sub={`juntan ${c.tramosCortosUnidos.absorbidos} intervalos de menos de ${MIN_DIAS_TRAMO} días`} />
                            <Dato k="Incluyen devoluciones" v={c.devoluciones.tramos} sub={`de ${c.tramosContados} que cuentan · ${fmtNum(c.devoluciones.retiradas, 0)} uds retiradas`} />
                        </div>
                        <p className="text-xs font-bold text-slate-600 mt-4 mb-2">Días por intervalo (para calibrar el mínimo de {MIN_DIAS_TRAMO} y el máximo de {MAX_DIAS_TRAMO})</p>
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

                    {/* 3. Diagnóstico a: negativos */}
                    <Seccion titulo={`Intervalos de visitas con resultado negativo (${c.negativos.length})`}
                        nota={`Venta = inventario anterior + facturadas + repuestas − retiradas − inventario actual. Para cada uno, la rotación del intervalo anterior y del siguiente del mismo PDV. "Vecino alto" = rota al menos ${FACTOR_VECINO_ALTO} veces la mediana del PDV y compensa al menos el ${fmtNum(PCT_VECINO_COMPENSA * 100, 0)} % del negativo.`}>
                        {c.negativos.length > 0 && (
                            <p className="text-xs text-slate-600 mb-2">
                                <b>{nDesfase}</b> con vecino alto (posible desfase entre facturación y despacho) · <b>{nAislado}</b> {nAislado === 1 ? 'aislado' : 'aislados'} (posible producto que entró sin registrarse).
                            </p>
                        )}
                        {c.negativos.length === 0 && <p className="text-sm text-slate-500">Ninguno en el período.</p>}
                        <div className="divide-y divide-slate-100">
                            {c.negativos.map((n, i) => {
                                const l = LECTURA[n.lectura];
                                return (
                                    <div key={i} className="py-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-slate-800">{n.nombre}</p>
                                                <p className="text-[11px] text-slate-500">Visitas del {fecha(n.desde)} y del {fecha(n.hasta)} · {fmtNum(n.dias, 1)} días</p>
                                            </div>
                                            <span className="shrink-0 text-sm font-black text-red-700">{signoUds(n.resultado)} uds</span>
                                        </div>
                                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                                            <Cifra k="Inv. anterior" v={n.invAnterior} />
                                            <Cifra k="Facturadas" v={n.facturadas} />
                                            <Cifra k="Repuestas" v={n.repuestas} />
                                            <Cifra k="Retiradas" v={n.retiradas} />
                                            <Cifra k="Inv. actual" v={n.invActual} />
                                            <Cifra k="Resultado" v={n.resultado} fuerte />
                                        </div>
                                        {n.resultadoSinDevoluciones !== n.resultado && (
                                            <p className="text-[11px] text-slate-500 mt-1">Sin contar devoluciones daría {signoUds(n.resultadoSinDevoluciones)} uds.</p>
                                        )}
                                        <p className="text-[11px] text-slate-600 mt-1">
                                            Rotación del intervalo anterior: <b>{n.rotAnterior == null ? 'no hay' : `${fmtNum(n.rotAnterior, 2)} uds/día`}</b>
                                            {' · '}del siguiente: <b>{n.rotSiguiente == null ? 'no hay' : `${fmtNum(n.rotSiguiente, 2)} uds/día`}</b>
                                            {n.medianaPdv != null && <> · mediana del PDV {fmtNum(n.medianaPdv, 2)}</>}
                                        </p>
                                        {(n.vecinoAlto === 'anterior' || n.vecinoAlto === 'ambos') && n.juntosAnterior != null && (
                                            <p className="text-[11px] text-slate-600">Juntos con el anterior: {fmtNum(n.juntosAnterior, 2)} uds/día.</p>
                                        )}
                                        {(n.vecinoAlto === 'siguiente' || n.vecinoAlto === 'ambos') && n.juntosSiguiente != null && (
                                            <p className="text-[11px] text-slate-600">Juntos con el siguiente: {fmtNum(n.juntosSiguiente, 2)} uds/día.</p>
                                        )}
                                        <span className={`inline-block mt-1.5 text-[11px] font-bold px-2 py-0.5 rounded border ${l.cls}`}>{l.txt}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </Seccion>

                    {/* 4. Diagnóstico b: largos */}
                    <Seccion titulo={`Intervalos de visitas de más de ${MAX_DIAS_TRAMO} días`}
                        nota="Rotación de la red con el método nuevo, sin ellos (como está hoy) y con ellos, en cada período.">
                        <div className="grid grid-cols-3 gap-2 mb-3">
                            {c.largosPorPeriodo.map(p => (
                                <div key={p.dias} className={`rounded-xl border p-2.5 ${p.dias === dias ? 'border-brand-blue bg-blue-50' : 'border-slate-200 bg-white'}`}>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{p.dias} días</p>
                                    <p className="text-[11px] text-slate-600 mt-0.5">Sin ellos <b className="text-slate-800">{fmtNum(p.sin, 2)}</b></p>
                                    <p className="text-[11px] text-slate-600">Con ellos <b className="text-slate-800">{fmtNum(p.con, 2)}</b></p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">{plural(p.largos, 'intervalo largo', 'intervalos largos')}</p>
                                </div>
                            ))}
                        </div>
                        {c.largos.length === 0 && <p className="text-sm text-slate-500">Ninguno en los últimos {dias} días.</p>}
                        <div className="divide-y divide-slate-100">
                            {c.largos.map((t, i) => (
                                <div key={i} className="py-2 flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-800">{t.nombre}</p>
                                        <p className="text-[11px] text-slate-500">{fecha(t.desde)} – {fecha(t.hasta)} · {fmtNum(t.dias, 0)} días · {fmtNum(t.unidades, 0)} uds</p>
                                    </div>
                                    <span className="shrink-0 text-sm font-bold text-slate-700">{fmtNum(t.rotacion, 2)} uds/día</span>
                                </div>
                            ))}
                        </div>
                    </Seccion>

                    {/* 5. Diagnóstico c: cobertura */}
                    <Seccion titulo="Cobertura: PDV con intervalos de visitas válidos"
                        nota={`Válido = entre ${MIN_DIAS_TRAMO} y ${MAX_DIAS_TRAMO} días, no negativo, con producto y sin terminar en anaquel vacío. Sobre los PDV activos con frecuencia de visita.`}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                                        <th className="py-1.5">Período</th><th className="py-1.5 text-right">≥ 1</th><th className="py-1.5 text-right">≥ 2</th><th className="py-1.5 text-right">≥ 3</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {c.coberturaPorPeriodo.map(p => (
                                        <tr key={p.dias}>
                                            <td className="py-1.5 text-slate-700">{p.dias} días</td>
                                            {[p.al1, p.al2, p.al3].map((v, k) => (
                                                <td key={k} className="py-1.5 text-right">
                                                    <b>{v}</b>{p.pdvActivos ? <span className="text-[11px] text-slate-400"> de {p.pdvActivos}</span> : null}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Seccion>

                    {/* 6. Diagnóstico d: duplicados */}
                    <Seccion titulo={`Posibles PDV duplicados (${c.duplicados.length})`}
                        nota="Nombres iguales o casi iguales tras quitar acentos, signos, orden de palabras y forma jurídica. Incluye PDV inactivos. Aquí no se fusiona nada.">
                        {posTodos == null && <p className="text-[11px] text-slate-400 mb-2">Leyendo la lista completa de PDV…</p>}
                        {c.duplicados.length === 0 && <p className="text-sm text-slate-500">No se encontraron nombres parecidos.</p>}
                        <div className="space-y-2">
                            {c.duplicados.map((g, i) => (
                                <div key={i} className="rounded-xl border border-slate-200 p-2.5">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{g.motivo === 'mismo' ? 'Mismo nombre' : 'Nombre casi igual'}</p>
                                    {g.miembros.map(m => (
                                        <div key={m.posId} className="py-1">
                                            <p className="text-sm font-semibold text-slate-800">{m.nombre}
                                                {m.activo === false && <span className="ml-1.5 text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">inactivo</span>}
                                                {m.fueraDeLista && <span className="ml-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">solo en reportes</span>}
                                            </p>
                                            <p className="text-[11px] text-slate-500">
                                                {plural(m.visitas, 'visita', 'visitas')}{m.ultimaVisita ? ` · última ${fecha(m.ultimaVisita)}` : ''}
                                                {m.chain ? ` · grupo ${m.chain}` : ''}{m.razonSocial ? ` · ${m.razonSocial}` : ''}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </Seccion>

                    {/* 7. Devoluciones */}
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

                    {/* 8. Por PDV */}
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
                                        {p.visitas} visitas · Anterior <b className="text-slate-700">{fmtNum(p.rotAnterior, 2)}</b> ({plural(p.tramosAnterior, 'intervalo', 'intervalos')})
                                        {' → '}Nuevo <b className="text-slate-700">{fmtNum(p.rotNueva, 2)}</b> ({plural(p.tramosNuevo, 'intervalo', 'intervalos')})
                                    </p>
                                </div>
                            ))}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">Rotación en uds por día; a la derecha, la diferencia (nuevo − anterior). "—" = sin intervalos de visitas que cuenten en ese método.</p>
                        {c.porPdv.length > 25 && (
                            <button onClick={() => setVerTodos(v => !v)} className="mt-2 text-sm font-bold text-brand-blue">
                                {verTodos ? 'Ver solo los 25 primeros' : `Ver los ${c.porPdv.length} PDV`}
                            </button>
                        )}
                    </Seccion>

                    {/* 9. Intervalos que cambian de estado */}
                    <Seccion titulo={`Intervalos de visitas que el método nuevo cuenta distinto (${c.cambian.length})`}
                        nota="Intervalos de visitas que el Dashboard cuenta y el método nuevo excluye o une con otro.">
                        <button onClick={() => setVerCambian(v => !v)} className="text-sm font-bold text-brand-blue">
                            {verCambian ? 'Ocultar la lista' : 'Ver la lista'}
                        </button>
                        {verCambian && (
                            <div className="divide-y divide-slate-100 mt-2">
                                {c.cambian.map((t, i) => (
                                    <div key={i} className="py-2">
                                        <p className="text-sm font-semibold text-slate-800">{t.nombre}</p>
                                        <p className="text-[11px] text-slate-500">
                                            {fecha(t.desde)} – {fecha(t.hasta)} · {fmtNum(t.dias, 1)} días · venta Dashboard {fmtNum(t.ventasDashboard, 0)} → nueva {fmtNum(t.ventasNuevo, 0)}
                                        </p>
                                        <p className="text-[11px] text-slate-700">Ahora: {etiquetaEstado(t.estadoNuevo)}</p>
                                    </div>
                                ))}
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
