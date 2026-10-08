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
import {
    MIN_DIAS_TRAMO, MAX_DIAS_TRAMO, PERIODOS_DIAS, FACTOR_VECINO_ALTO, PCT_VECINO_COMPENSA,
    MIN_PDV_CELDA, MIN_CELDAS_CAPA_B, DISTANCIA_MISMO_PDV_M,
} from '@/utils/anaquelConstantes.js';
import { etiquetaAltura, etiquetaCategoria } from '@/utils/anaquelCatalogo.js';
import { ETIQUETAS } from '@/utils/visitaOla1.js';

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
    desfase: { txt: 'Desfase: lo facturado antes llegó después', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
    conteo: { txt: 'Error de conteo: un vecino lo compensa sin facturado que lo explique', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
    aislado: { txt: 'Aislado: producto que entró sin registrarse', cls: 'bg-red-50 text-red-700 border-red-200' },
    sin_vecinos: { txt: 'Sin intervalos vecinos para comparar', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

// Exportación de los negativos para cruzar con las facturas de Zoho: una fila
// por visita involucrada (separador ";" y BOM, para Excel en español).
function exportarNegativosCsv(negativos) {
    const num = (v) => (v == null || !Number.isFinite(v) ? '' : String(v).replace('.', ','));
    const celda = (v) => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const filas = [['PDV', 'posId', 'Carnet Zoho (zohoCustomerId)', 'Razón social', 'Intervalo desde', 'Intervalo hasta',
        'Resultado del intervalo', 'Lectura', 'Visita', 'Fecha', 'Hora', 'Inventario', 'orderQuantity']];
    negativos.forEach(n => (n.visitas || []).forEach(v => {
        const d = new Date(v.fecha);
        filas.push([n.nombre, n.posId, n.zohoCustomerId || '', n.razonSocialZoho || '', fecha(n.desde), fecha(n.hasta),
            num(n.resultado), n.lectura, v.rol, v.dia, d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
            num(v.inventario), num(v.orderQuantity)]);
    }));
    const csv = '\uFEFF' + filas.map(f => f.map(celda).join(';')).join('\r\n');
    try {
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = `intervalos-negativos-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch { /* navegador sin descargas: no hay nada que limpiar */ }
}

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

function TarjetaNegativo({ n }) {
    const l = LECTURA[n.lectura];
    return (
        <div className="py-3">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{n.nombre}</p>
                    <p className="text-[11px] text-slate-500">Visitas del {fecha(n.desde)} ({n.reporterInicio || '—'}) y del {fecha(n.hasta)} ({n.reporterFin || '—'}) · {fmtNum(n.dias, 1)} días
                        {n.subidoTarde && <span className="ml-1 font-bold text-amber-700">· subido más tarde</span>}</p>
                </div>
                <span className="shrink-0 text-sm font-black text-red-700">{signoUds(n.resultado)} uds</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                <Cifra k="Inv. anterior" v={n.invAnterior} />
                <Cifra k="Anotado en visita" v={n.facturadas} />
                <Cifra k="Repuestas" v={n.repuestas} />
                <Cifra k="Retiradas" v={n.retiradas} />
                <Cifra k="Inv. actual" v={n.invActual} />
                <Cifra k="Resultado" v={n.resultado} fuerte />
            </div>
            {n.facturasEntre?.length > 0 && (
                <div className="mt-1.5 rounded-lg bg-emerald-50 border border-emerald-100 px-2 py-1.5 text-[11px] text-emerald-900">
                    Facturas entre las visitas: {n.facturasEntre.map(f => `${f.numero || 's/n'} del ${f.dia.split('-').reverse().join('/')} por ${fmtNum(f.unidades, 0)} uds${f.dudosa ? ' (dudosa)' : ''}`).join(' · ')}.
                    {' '}Sumándolas: <b>{signoUds(n.ventaSumandoFacturas)} uds</b>{n.resultadoConFacturas != null && n.resultadoConFacturas !== n.ventaSumandoFacturas && <> · con facturas en lugar de lo anotado: <b>{signoUds(n.resultadoConFacturas)}</b></>}.
                </div>
            )}
            {n.grupo !== 'con_factura' && (
                <>
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
                </>
            )}
            {n.resultadoSinDevoluciones !== n.resultado && (
                <p className="text-[11px] text-slate-500 mt-1">Sin contar devoluciones daría {signoUds(n.resultadoSinDevoluciones)} uds.</p>
            )}
        </div>
    );
}

export default function ComparadorMetodosAnaquel({ reports, devoluciones, facturas = null, posList, onClose }) {
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
    const c = useMemo(() => compararMetodos({ reports: reports || [], devoluciones: devoluciones || [], facturas, posList: lista, dias }),
        [reports, devoluciones, facturas, lista, dias]);

    const maxHist = Math.max(1, ...c.histDias.map(h => h.tramos));
    const pdvs = verTodos ? c.porPdv : c.porPdv.slice(0, 25);
    const sinFact = c.negativos.filter(n => n.grupo !== 'con_factura');
    const nDesfase = sinFact.filter(n => n.lectura === 'desfase').length;
    const nConteo = sinFact.filter(n => n.lectura === 'conteo').length;
    const nAislado = sinFact.filter(n => n.lectura === 'aislado').length;

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

                    {/* Cruce con las facturas de Zoho */}
                    <Seccion titulo="Cruce con las facturas de Zoho"
                        nota="Entregas = facturas de Zoho con fecha dentro del intervalo de visitas (desde el día siguiente a la visita inicial hasta el día de la visita final), con las unidades guardadas de sus líneas. Dudosa = a ±1 día de una visita: pudo entrar en el intervalo vecino. Se compara sobre los mismos PDV con las dos fuentes.">
                        {!c.facturasLeidas && <p className="text-sm text-amber-700">No se pudieron leer las facturas: este cruce no está disponible.</p>}
                        {c.facturasLeidas && (
                            <>
                                {/* Una tarjeta por período: en el teléfono una tabla de 5 columnas no cabe. */}
                                <div className="grid gap-2 sm:grid-cols-3">
                                    {c.cruceFacturas.map(p => (
                                        <div key={p.dias} className={`rounded-xl border p-3 text-xs ${p.dias === dias ? 'border-brand-blue/40 bg-blue-50/60' : 'border-slate-200'}`}>
                                            <p className="font-bold text-slate-800 mb-1.5">Últimos {p.dias} días <span className="font-normal text-slate-400">· {plural(p.intervalos, 'intervalo', 'intervalos')}</span></p>
                                            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 items-baseline">
                                                <span className="text-[10px] uppercase tracking-wider text-slate-400"></span>
                                                <span className="text-[10px] uppercase tracking-wider text-slate-400 text-right">Visita</span>
                                                <span className="text-[10px] uppercase tracking-wider text-slate-400 text-right">Facturas</span>
                                                <span className="text-slate-600">Negativos</span>
                                                <b className="text-right">{p.negativosOq}</b><b className="text-right">{p.negativosFa}</b>
                                                <span className="text-slate-600">Red (uds/día)</span>
                                                <b className="text-right">{fmtNum(p.redOq, 2)}</b><b className="text-right">{fmtNum(p.redFa, 2)}</b>
                                                <span className="text-slate-600">Más de {MAX_DIAS_TRAMO} días <span className="text-slate-400">({p.largosOq.tramos})</span></span>
                                                <span className="text-right">{fmtNum(p.largosOq.porDia, 2)}</span><span className="text-right">{fmtNum(p.largosFa.porDia, 2)}</span>
                                            </div>
                                            <p className="text-slate-500 mt-1.5">Facturas usadas <b>{p.facturasAsignadas}</b> · dudosas <b>{p.facturasDudosas}</b></p>
                                        </div>
                                    ))}
                                </div>
                                {(() => {
                                    const p = c.cruceFacturas.find(x => x.dias === dias);
                                    return (
                                        <>
                                            <p className="text-[11px] text-slate-500 mt-2">
                                                Facturas de los últimos {dias} días sin asignar a un anaquel: <b>{p.noAsignadas.compartida}</b> de un carnet que comparten varios PDV (factura central o PDV duplicado) · <b>{p.noAsignadas.sinPdv}</b> de clientes sin PDV vinculado.
                                                {c.pdvSinFuente.length > 0 && ` ${plural(c.pdvSinFuente.length, 'PDV visitado queda', 'PDV visitados quedan')} fuera del cruce por no tener un carnet propio: ${c.pdvSinFuente.map(x => `${x.nombre} (${x.estado === 'compartido' ? 'carnet compartido' : 'sin vínculo'})`).join(', ')}.`}
                                            </p>
                                            <p className="text-[11px] text-slate-500 mt-1">
                                                PDV activos con despacho <b>centralizado</b>: <b>{c.centralizados.pdv}</b>
                                                {c.centralizados.cadenas.length > 0 && ` (${c.centralizados.cadenas.join(', ')})`}.
                                                {' '}Carnets que comparten varios PDV: <b>{c.compartidos.length}</b>
                                                {c.compartidos.length > 0 && ` (${c.compartidos.map(x => x.nombres.join(' + ')).join(' · ')})`}.
                                                {' '}Sus facturas no se pueden repartir entre sucursales con lo que GK guarda hoy.
                                            </p>
                                            <p className="text-xs font-bold text-slate-600 mt-3 mb-1">Por PDV, últimos {dias} días: anotado en las visitas frente a facturado</p>
                                            <div className="divide-y divide-slate-100">
                                                {p.porPdv.map(x => (
                                                    <div key={x.posId} className="py-1.5 flex items-center justify-between gap-2 text-xs">
                                                        <span className="min-w-0 text-slate-700 font-semibold">{x.nombre}</span>
                                                        <span className="shrink-0 text-slate-600">visitas <b>{fmtNum(x.orderQuantity, 0)}</b> · facturas <b className={x.facturado !== x.orderQuantity ? 'text-amber-700' : ''}>{fmtNum(x.facturado, 0)}</b> <span className="text-slate-400">({x.facturas})</span></span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    );
                                })()}
                            </>
                        )}
                    </Seccion>

                    {/* 3. Diagnóstico a: negativos */}
                    <Seccion titulo={`Intervalos de visitas con resultado negativo (${c.negativos.length})`}
                        nota={`Primero se separan los que tienen una factura de Zoho entre las dos visitas: ahí entró mercancía que ninguna visita anotó, no es error de quien reporta. Para los demás: "vecino alto" = un intervalo del mismo PDV que rota al menos ${FACTOR_VECINO_ALTO} veces la mediana del PDV y compensa al menos el ${fmtNum(PCT_VECINO_COMPENSA * 100, 0)} % del negativo.`}>
                        {c.negativos.length > 0 && (
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <p className="text-xs text-slate-600">
                                    <b>{c.tipoVisita.negativos.conFactura}</b> con factura entre las visitas · <b>{c.tipoVisita.negativos.sinFactura}</b> sin factura
                                    {c.tipoVisita.negativos.sinFuente > 0 && <> · <b>{c.tipoVisita.negativos.sinFuente}</b> sin carnet propio para cruzar</>}.
                                    {' '}Entre los sin factura: <b>{nDesfase}</b> desfase · <b>{nConteo}</b> error de conteo · <b>{nAislado}</b> {nAislado === 1 ? 'aislado' : 'aislados'}.
                                </p>
                                <button onClick={() => exportarNegativosCsv(c.negativos)}
                                    className="text-xs font-bold text-brand-blue border border-brand-blue/40 rounded-lg px-2.5 py-1.5">
                                    Exportar CSV
                                </button>
                            </div>
                        )}
                        {c.negativos.length === 0 && <p className="text-sm text-slate-500">Ninguno en el período.</p>}
                        {[['con_factura', 'Con factura de Zoho entre las dos visitas'], ['sin_factura', 'Sin factura entre las dos visitas'], ['sin_fuente', 'Sin carnet propio: no se puede cruzar']].map(([g, titulo]) => {
                            const lista = c.negativos.filter(n => n.grupo === g);
                            if (!lista.length) return null;
                            return (
                                <div key={g} className="mt-3">
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{titulo} ({lista.length})</p>
                                    <div className="divide-y divide-slate-100">
                                        {lista.map((n, i) => <TarjetaNegativo key={i} n={n} />)}
                                    </div>
                                </div>
                            );
                        })}
                    </Seccion>

                    {/* Desglose: quién y dónde */}
                    <Seccion titulo="Dónde se concentran los errores"
                        nota={`Solo los negativos SIN factura y los conteos sospechosos de los últimos ${dias} días. Conteos absolutos y orden alfabético: la muestra es chica para porcentajes o rankings. Mercaderista = quien se eligió al reportar.`}>
                        {/* Filas con sus cifras rotuladas (no tablas anchas: no caben en el teléfono). */}
                        <p className="text-xs font-bold text-slate-600 mb-1">Por mercaderista</p>
                        {c.desglose.porMercaderista.length === 0
                            ? <p className="text-sm text-slate-500">Nada que atribuir en el período.</p>
                            : <div className="divide-y divide-slate-100">
                                {c.desglose.porMercaderista.map(x => (
                                    <div key={x.nombre} className="py-1.5 text-xs">
                                        <p className="font-semibold text-slate-800">{x.nombre}</p>
                                        <p className="text-slate-600">Negativos: <b>{x.negFin}</b> en su visita final · <b>{x.negInicio}</b> en su visita inicial · Duplicados <b>{x.duplicados}</b> · Envío repetido <b>{x.idRepetido}</b> · Posible copia <b>{x.copiados}</b></p>
                                    </div>
                                ))}
                            </div>}
                        <p className="text-xs font-bold text-slate-600 mt-3 mb-1">Por cadena</p>
                        {c.desglose.porCadena.length === 0
                            ? <p className="text-sm text-slate-500">Nada que atribuir en el período.</p>
                            : <div className="divide-y divide-slate-100">
                                {c.desglose.porCadena.map(x => (
                                    <div key={x.nombre} className="py-1.5 text-xs">
                                        <p className="font-semibold text-slate-800">{x.nombre}</p>
                                        <p className="text-slate-600">Negativos <b>{x.negativos}</b> · Duplicados <b>{x.duplicados}</b> · Envío repetido <b>{x.idRepetido}</b> · Posible copia <b>{x.copiados}</b></p>
                                    </div>
                                ))}
                            </div>}
                        <p className="text-[11px] text-slate-500 mt-2">
                            Reportes subidos más tarde (guardados otro día que el de la visita): <b>{c.tipoVisita.subidosTarde}</b> de {c.tipoVisita.reportes}.
                            {' '}Negativos sin factura con una visita subida más tarde: <b>{c.tipoVisita.negativos.sinFacturaSubidoTarde}</b>.
                        </p>
                    </Seccion>

                    {/* Conteos sospechosos */}
                    <Seccion titulo="Conteos sospechosos"
                        nota="Posible conteo copiado: el mismo inventario en dos visitas seguidas, sin entrega (ni en la visita ni por factura), sin devolución y con venta cero. Reporte duplicado: el mismo PDV reportado dos veces el mismo día. Envío repetido: el mismo identificador de envío guardado dos veces.">
                        <p className="text-xs font-bold text-slate-600 mb-1">Posible conteo copiado ({c.sospechosos.copiados.length})</p>
                        {c.sospechosos.copiados.length === 0 && <p className="text-xs text-slate-400 mb-2">Ninguno.</p>}
                        <div className="divide-y divide-slate-100 mb-3">
                            {c.sospechosos.copiados.map((x, i) => (
                                <div key={i} className="py-1.5 text-xs">
                                    <p className="font-semibold text-slate-800">{x.nombre}</p>
                                    <p className="text-slate-500">{fecha(x.desde)} y {fecha(x.hasta)}: {fmtNum(x.inventario, 0)} y {fmtNum(x.inventario, 0)} uds · {x.reporterInicio || '—'} → {x.reporterFin || '—'}
                                        {x.lotesIdenticos ? ' · mismos lotes y cantidades' : ''}{x.sinFuente ? ' · sin carnet para ver facturas' : ''}</p>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs font-bold text-slate-600 mb-1">Reportes duplicados el mismo día ({c.sospechosos.duplicadosDia.length})</p>
                        {c.sospechosos.duplicadosDia.length === 0 && <p className="text-xs text-slate-400 mb-2">Ninguno.</p>}
                        <div className="divide-y divide-slate-100 mb-3">
                            {c.sospechosos.duplicadosDia.map((g, i) => (
                                <div key={i} className="py-1.5 text-xs">
                                    <p className="font-semibold text-slate-800">{g.nombre} · {g.dia.split('-').reverse().join('/')}</p>
                                    <p className="text-slate-500">{g.reportes.map(r => `${r.reporter || '—'} ${new Date(r.hora).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })} (${fmtNum(r.inventario, 0)} uds)`).join(' · ')}</p>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs font-bold text-slate-600 mb-1">Envío repetido ({c.sospechosos.reportIdRepetido.length})</p>
                        {c.sospechosos.reportIdRepetido.length === 0 && <p className="text-xs text-slate-400">Ninguno.</p>}
                        <div className="divide-y divide-slate-100">
                            {c.sospechosos.reportIdRepetido.map((g, i) => (
                                <div key={i} className="py-1.5 text-xs text-slate-600"><b className="text-slate-800">{g.nombre}</b> · {g.dia.split('-').reverse().join('/')} · {g.veces} veces · {g.reporter || '—'}</div>
                            ))}
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
                        <p className="text-xs font-bold text-slate-600 mt-4 mb-1">Cifra de la red frente a la mediana por PDV</p>
                        <p className="text-[11px] text-slate-500 mb-2">La cifra de red pondera por días medidos: los PDV con más visitas pesan más. La mediana es por PDV: cada uno pesa igual. "Top 5" = qué parte de los días medidos aportan los 5 PDV con más días.</p>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs min-w-[340px]">
                                <thead>
                                    <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400">
                                        <th className="py-1.5">Período</th><th className="py-1.5">Método</th>
                                        <th className="py-1.5 text-right">Red</th><th className="py-1.5 text-right">Mediana</th>
                                        <th className="py-1.5 text-right">PDV</th><th className="py-1.5 text-right">Top 5</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {c.coberturaPorPeriodo.flatMap(p => [['Nuevo', p.nuevo], ['Dashboard', p.anterior]].map(([m, r], k) => (
                                        <tr key={`${p.dias}-${m}`} className={p.dias === dias ? 'bg-blue-50/60' : ''}>
                                            <td className="py-1.5 text-slate-700">{k === 0 ? `${p.dias} días` : ''}</td>
                                            <td className="py-1.5 text-slate-600">{m}</td>
                                            <td className="py-1.5 text-right font-bold">{fmtNum(r.red, 2)}</td>
                                            <td className="py-1.5 text-right font-bold">{fmtNum(r.mediana, 2)}</td>
                                            <td className="py-1.5 text-right">{r.nPdv}</td>
                                            <td className="py-1.5 text-right">{pct(r.pesoTop5)}</td>
                                        </tr>
                                    )))}
                                </tbody>
                            </table>
                        </div>
                    </Seccion>

                    {/* Diagnóstico e: vista previa del mapa de calor */}
                    <Seccion titulo="Vista previa del mapa de calor (90 días)"
                        nota={`Solo conteos, no es la pantalla final. Cada celda: PDV · intervalos que cuentan (válidos). Gris = menos de ${MIN_PDV_CELDA} PDV: saldría sin cifra.`}>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                            <Dato k="Celdas con cifra" v={`${c.mapaPreview.conCifra} de ${c.mapaPreview.celdas}`} />
                            <Dato k="Celdas grises" v={c.mapaPreview.grises} sub={`menos de ${MIN_PDV_CELDA} PDV`} />
                            <Dato k="Celdas vacías" v={c.mapaPreview.vacias} sub="ningún PDV" />
                            <Dato k="Elegibles capa B" v={c.mapaPreview.pdvCapaB} sub={`${c.mapaPreview.pdvVistosEn2} vistos en ≥${MIN_CELDAS_CAPA_B} celdas`} />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs min-w-[460px] border-separate border-spacing-1">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                                        <th className="text-left">Altura</th>
                                        {c.mapaPreview.columnas.map(col => <th key={col.id} className="text-center">{etiquetaCategoria(col.id)}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {c.mapaPreview.filas.map(f => (
                                        <tr key={f.id}>
                                            <td className="text-slate-700 font-semibold pr-1">{etiquetaAltura(f.id)}</td>
                                            {f.celdas.map(cel => (
                                                <td key={cel.categoria} className={`text-center rounded-lg px-1 py-2 ${cel.vacia ? 'bg-slate-50 text-slate-300' : cel.gris ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-900'}`}>
                                                    {cel.vacia ? '—' : <><b>{cel.nPdv}</b> PDV<br /><span className="text-[10px]">{cel.intervalos} ({cel.validos})</span></>}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">
                            Capa B: PDV con índice propio (≥3 intervalos válidos en 90 días) vistos en al menos {MIN_CELDAS_CAPA_B} celdas.
                            {c.mapaPreview.sinUbicacion > 0 && ` ${plural(c.mapaPreview.sinUbicacion, 'intervalo queda', 'intervalos quedan')} fuera por no tener altura o categoría anotada.`}
                        </p>
                    </Seccion>

                    {/* 6. Diagnóstico d: duplicados */}
                    <Seccion titulo={`Posibles PDV duplicados (${c.duplicados.length})`}
                        nota="Nombres iguales o casi iguales tras quitar acentos, signos, orden de palabras y forma jurídica. Incluye PDV inactivos. Aquí no se fusiona nada.">
                        {posTodos == null && <p className="text-[11px] text-slate-400 mb-2">Leyendo la lista completa de PDV…</p>}
                        {c.duplicados.length === 0 && <p className="text-sm text-slate-500">No se encontraron nombres parecidos.</p>}
                        <div className="space-y-2">
                            {c.duplicados.map((g, i) => (
                                <div key={i} className="rounded-xl border border-slate-200 p-2.5">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                        {g.motivo === 'mismo' ? 'Mismo nombre' : 'Nombre casi igual'}
                                        {g.mismoCarnet && ' · mismo carnet de Zoho'}{g.carnetsDistintos && ' · carnets de Zoho distintos'}
                                    </p>
                                    {g.miembros.map(m => (
                                        <div key={m.posId} className="py-1.5">
                                            <p className="text-sm font-semibold text-slate-800">{m.nombre}
                                                {m.sugerido && <span className="ml-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">sugerido conservar</span>}
                                                {m.activo === false && <span className="ml-1.5 text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">inactivo</span>}
                                                {m.fueraDeLista && <span className="ml-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">solo en reportes</span>}
                                            </p>
                                            <p className="text-[11px] text-slate-500">
                                                {plural(m.visitas, 'visita', 'visitas')}
                                                {m.primeraVisita ? ` · del ${fecha(m.primeraVisita)} al ${fecha(m.ultimaVisita)}` : ''}
                                                {m.devoluciones ? ` · ${plural(m.devoluciones, 'devolución', 'devoluciones')}` : ''}
                                                {m.chain ? ` · grupo ${m.chain}` : ''}
                                            </p>
                                            <p className="text-[11px] text-slate-500">
                                                Carnet: {m.zohoCustomerId || 'sin vincular'}{m.razonSocial ? ` (${m.razonSocial})` : ''}
                                            </p>
                                            <p className="text-[11px] text-slate-500">
                                                {m.direccion ? `Dirección: ${m.direccion}` : 'Sin dirección'}
                                                {m.coords ? '' : ' · sin ubicación en el mapa'}
                                                {m.distanciaM != null && (
                                                    <b className={m.distanciaM <= DISTANCIA_MISMO_PDV_M ? 'text-emerald-700' : 'text-amber-700'}> · a {fmtNum(m.distanciaM, 0)} m del sugerido</b>
                                                )}
                                            </p>
                                            <p className="text-[10px] text-slate-400">id {m.posId}</p>
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
                    {/* Formulario (Ola 1) */}
                    <Seccion titulo="Formulario de visita (Ola 1)"
                        nota={`Reportes de los últimos ${dias} días hechos con el formulario nuevo (versión 2) frente a los anteriores. Cada pregunta salta solo cuando algo no cuadra y nunca impide enviar.`}>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            <Dato k="Formulario nuevo" v={c.formulario.reportesV2} sub={`tiempo medio ${c.formulario.tiempoV2.minutos == null ? '—' : `${fmtNum(c.formulario.tiempoV2.minutos, 1)} min`}`} />
                            <Dato k="Formulario anterior" v={c.formulario.reportesV1} sub={`tiempo medio ${c.formulario.tiempoV1.minutos == null ? '—' : `${fmtNum(c.formulario.tiempoV1.minutos, 1)} min`}`} />
                        </div>
                        <div className="divide-y divide-slate-100 text-xs">
                            {[
                                ['Reporte duplicado el mismo día', c.formulario.alertas.duplicado, c.formulario.respuestas.duplicado, ETIQUETAS.duplicado],
                                ['Conteo idéntico a la visita anterior', c.formulario.alertas.conteoIdentico, c.formulario.respuestas.conteoIdentico, ETIQUETAS.conteoIdentico],
                                ['Conteo corregido después de pasar a reponer', c.formulario.alertas.correccionConteo, c.formulario.respuestas.correccionConteo, ETIQUETAS.correccionConteo],
                                ['Lote sin fecha legible', c.formulario.alertas.loteSinFecha, c.formulario.respuestas.loteSinFecha, ETIQUETAS.loteSinFecha],
                            ].map(([titulo, veces, resp, etq]) => (
                                <div key={titulo} className="py-1.5">
                                    <p className="text-slate-700"><b>{titulo}</b>: {plural(veces, 'reporte', 'reportes')}</p>
                                    {Object.keys(resp).length > 0 && <p className="text-slate-500">{Object.entries(resp).map(([k, v]) => `${etq[k] || k}: ${v}`).join(' · ')}</p>}
                                </div>
                            ))}
                            <div className="py-1.5">
                                <p className="text-slate-700"><b>Ubicación (GPS, solo registro)</b>: {c.formulario.gps.leidas} leídas · {Object.values(c.formulario.gps.fallas).reduce((a, b) => a + b, 0)} fallidas</p>
                                {Object.keys(c.formulario.gps.fallas).length > 0 && <p className="text-slate-500">{Object.entries(c.formulario.gps.fallas).map(([k, v]) => `${ETIQUETAS.gps[k] || k}: ${v}`).join(' · ')}</p>}
                            </div>
                        </div>
                    </Seccion>
                    <p className="text-[11px] text-slate-400 text-center pb-6">Esta pantalla no guarda ni cambia nada.</p>
                </div>
            </div>
        </div>,
        document.body,
    );
}
