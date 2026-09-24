import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { kgProducidos, rendimientoLkg } from '@/Kroma/estadoPlanta.js';
import {
    calcCostoTeoricoLote, indexById, indexPackagingAssignments, buildMilkPriceLookup,
} from '@/Kroma/costeoLote.js';
import { fmtL, fmtNum } from '@/Kroma/formato.js';
import Lote from '@/Kroma/Components/Lote.jsx';
import { soloVivos } from '@/Kroma/estadoPlanta.js';
import { db } from '@/Firebase/config.js';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
    ClipboardList, ChevronLeft, ChevronRight, Search, X,
    Loader, Droplets, Package, Calendar, BarChart3,
    CheckCircle, User,
} from 'lucide-react';
import { useKroma } from '../../KromaContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(ts) {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(ts) {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
}
function logDate(log) {
    const ts = log.fechaCierre || log.createdAt;
    if (!ts) return null;
    return ts?.toDate ? ts.toDate() : new Date(ts);
}
function getLitrosNetos(log) {
    const bloques = log.bloquesSnapshot || [];
    const pastIdx = bloques.findIndex(b => b.tipo === 'pasteurizacion');
    if (pastIdx >= 0) {
        const pastData = (log.bloquesData || {})[String(pastIdx)];
        if (pastData?.completado) {
            const merma = pastData.registros?.merma ?? 10;
            return Math.max(0, (log.litrosIngresados || 0) - merma);
        }
    }
    return log.litrosNetos ?? log.litrosIngresados ?? 0;
}
function getMerma(log) {
    const bloques = log.bloquesSnapshot || [];
    const pastIdx = bloques.findIndex(b => b.tipo === 'pasteurizacion');
    if (pastIdx >= 0) {
        const pastData = (log.bloquesData || {})[String(pastIdx)];
        if (pastData?.completado) return pastData.registros?.merma ?? 10;
    }
    return null;
}
function getTotalKg(log) {
    // Primero lo que declaró el bloque de empaque, si esa corrida lo tiene…
    const bloques = log.bloquesSnapshot || [];
    const empIdx = bloques.findIndex(b => b.tipo === 'empaque');
    if (empIdx >= 0) {
        const items = (log.bloquesData || {})[String(empIdx)]?.registros?.items || [];
        const total = items.reduce((s, it) => s + (it.unidades || 0) * (it.pesoKg || 0), 0);
        if (total > 0) return total;
    }
    // …y si no, el campo canónico del lote. Antes esto devolvía `null` y con él
    // se iban los "Kg producidos" y el "Rendimiento" de TODO lote que no tuviera
    // esa forma exacta de registro — incluidas las planillas de papel, que no
    // pasan por el runner de bloques.
    const kg = kgProducidos(log);
    return kg > 0 ? kg : null;
}
function getRendimiento(log) {
    const l = getLitrosNetos(log);
    const k = getTotalKg(log);
    return l && k ? (l / k).toFixed(2) : null;
}
function blockLabel(tipo) {
    return {
        pasteurizacion: 'Pasteurización', cuajado: 'Cuajado', corte: 'Corte de Cuajada',
        desuerado: 'Desuerado', preprensa: 'Pre-prensa', moldeado: 'Moldeado',
        prensado: 'Prensado', salado: 'Salado', maduracion: 'Maduración', empaque: 'Empaque',
    }[tipo] || tipo;
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

function CalendarPicker({ year, month, onChangeMonth, activeDays, selectedDay, onSelectDay }) {
    const DAYS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
    const monthName = new Date(year, month, 1).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
                <button onClick={() => onChangeMonth(-1)} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors">
                    <ChevronLeft size={16} />
                </button>
                <span className="text-white text-sm font-semibold capitalize">{monthName}</span>
                <button onClick={() => onChangeMonth(1)} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors">
                    <ChevronRight size={16} />
                </button>
            </div>
            <div className="grid grid-cols-7 mb-1">
                {DAYS.map(d => <div key={d} className="text-slate-600 text-xs text-center py-1 font-semibold">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
                {cells.map((d, i) => {
                    if (!d) return <div key={`e${i}`} />;
                    const has = activeDays.has(d);
                    const sel = selectedDay === d;
                    return (
                        <button
                            key={d}
                            onClick={() => onSelectDay(sel ? null : d)}
                            className={`relative h-8 w-full rounded-lg text-xs font-medium transition-colors
                                ${sel ? 'bg-emerald-600 text-white shadow shadow-emerald-600/30' :
                                  has ? 'bg-slate-700 text-emerald-300 hover:bg-slate-600' :
                                  'text-slate-500 hover:bg-slate-700 hover:text-slate-300'}`}
                        >
                            {d}
                            {has && !sel && (
                                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-500" />
                            )}
                        </button>
                    );
                })}
            </div>
            {selectedDay && (
                <button onClick={() => onSelectDay(null)} className="mt-3 w-full text-xs text-slate-500 hover:text-slate-300 text-center py-1 transition-colors">
                    Ver todo el mes
                </button>
            )}
        </div>
    );
}

// ─── Detail sheet ─────────────────────────────────────────────────────────────

function Row({ label, value, sub }) {
    return (
        <div className="flex justify-between items-start py-2 border-b border-slate-700/40 last:border-0">
            <span className="text-slate-400 text-sm">{label}</span>
            <div className="text-right">
                <span className="text-white text-sm font-medium">{value}</span>
                {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

function Sec({ title }) {
    return <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mt-5 mb-2">{title}</p>;
}

function LogDetail({ log, materials = [], verCostos = false, onClose }) {
    const litrosIngresados = log.litrosIngresados || 0;
    const merma            = getMerma(log);
    const litrosNetos      = getLitrosNetos(log);
    const totalKg          = getTotalKg(log);
    const rendimiento      = getRendimiento(log);
    const bloques          = log.bloquesSnapshot || [];
    const bData            = log.bloquesData || {};

    const empIdx  = bloques.findIndex(b => b.tipo === 'empaque');
    const empItems = empIdx >= 0 ? (bData[String(empIdx)]?.registros?.items || []) : [];

    const cuajIdx  = bloques.findIndex(b => b.tipo === 'cuajado');
    const cuajData = cuajIdx >= 0 ? bData[String(cuajIdx)] : null;
    const cuajDosis = cuajIdx >= 0 ? (bloques[cuajIdx]?.dosis || {}) : {};
    const cuajReg  = cuajData?.registros || {};
    // Mismo cálculo que usa gerencia: un lote no puede costar dos cosas según
    // desde qué pantalla se mire.
    const costo = useMemo(() => {
        if (!verCostos || !materials.length) return null;
        return calcCostoTeoricoLote(
            log, indexById(materials), indexPackagingAssignments(materials),
            buildMilkPriceLookup(materials));
    }, [log, materials, verCostos]);

    const insumosCuajado = [
        cuajDosis.calcio    && { nombre: 'Cloruro de Calcio', teorico: cuajDosis.calcio,    real: cuajReg.calcioReal },
        cuajDosis.cuajo     && { nombre: 'Cuajo',             teorico: cuajDosis.cuajo,     real: cuajReg.cuajoReal },
        cuajDosis.fermento  && { nombre: 'Fermento',          teorico: cuajDosis.fermento,  real: cuajReg.fermentoReal },
        cuajDosis.conservante && { nombre: 'Conservante',     teorico: cuajDosis.conservante, real: cuajReg.conservanteReal },
    ].filter(Boolean);

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex flex-col justify-end md:justify-center md:items-center">
            <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full md:max-w-xl max-h-[92vh] flex flex-col">
                {/* Header */}
                <div className="p-5 border-b border-slate-800 flex items-start justify-between gap-3 shrink-0">
                    <div>
                        <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-1">Reporte de Lote</p>
                        <p><Lote size="lg" className="!text-xl !font-black tracking-wider">{log.lote || log.id}</Lote></p>
                        <p className="text-emerald-400 font-semibold text-sm mt-0.5">{log.productoNombre}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white p-1.5 rounded-lg hover:bg-slate-700 transition-colors mt-1">
                        <X size={18} />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-5 pb-6">
                    <Sec title="Información General" />
                    <div className="bg-slate-800 rounded-xl p-4">
                        <Row label="Fecha"            value={fmtDate(log.fechaCierre || log.createdAt)} />
                        <Row label="Hora"             value={fmtTime(log.fechaCierre || log.createdAt)} />
                        <Row label="Maestro Quesero"  value={log.firmas?.maestro || log.creadoPorNombre || '—'} />
                        <Row label="Almacén PT"       value={log.firmas?.almacen || '—'} />
                        <Row label="Proveedor leche"  value={log.proveedorNombre || '—'} />
                    </div>

                    <Sec title="Balance de Masa" />
                    <div className="bg-slate-800 rounded-xl p-4">
                        <Row label="Litros recibidos"        value={fmtL(litrosIngresados)} />
                        {merma != null && (
                            <Row label="Merma pasteurizador" value={fmtL(merma)}
                                sub={`${((merma / litrosIngresados) * 100).toFixed(1)}% de los litros`} />
                        )}
                        <Row label="Litros netos a proceso"  value={fmtL(litrosNetos)} />
                        <Row label="Kg producidos"  value={totalKg ? `${fmtNum(totalKg, 3)} kg` : '—'} />
                        <Row label="Rendimiento"    value={rendimiento ? `${rendimiento} L/kg` : '—'} />
                    </div>

                    {/* Costo del lote. La pregunta "¿cuánto costó este queso?" se
                        respondía SOLO en el tablero de gerencia; en la ficha del
                        lote, que es donde se mira un lote, no estaba. */}
                    {verCostos && (
                        <>
                            <Sec title="Costo del lote" />
                            <div className="bg-slate-800 rounded-xl p-4">
                                {costo?.costoPorKg > 0 ? (
                                    <>
                                        <Row label="Costo por kg" value={`$${fmtNum(costo.costoPorKg)} / kg`} />
                                        <Row label="Leche"        value={`$${fmtNum(costo.costoLeche)}`} />
                                        <Row label="Insumos"      value={`$${fmtNum(costo.costoInsumos)}`}
                                            sub={costo.costoInsumos > 0 ? 'dosis de la ficha × precio actual' : 'sin ficha o sin precios cargados'} />
                                        <Row label="Empaque"      value={`$${fmtNum(costo.costoEmpaque)}`} />
                                        <Row label="Costo total"  value={`$${fmtNum(costo.costoTotal)}`} />
                                    </>
                                ) : (
                                    <p className="text-slate-500 text-xs leading-snug">
                                        No se puede costear este lote. Hace falta que tenga kilos
                                        producidos y que su leche o sus insumos tengan precio en el
                                        Maestro de Materiales.
                                    </p>
                                )}
                            </div>
                        </>
                    )}

                    {insumosCuajado.length > 0 && (
                        <>
                            <Sec title="Insumos Cuajado" />
                            <div className="bg-slate-800 rounded-xl p-4">
                                {insumosCuajado.map(ins => (
                                    <Row
                                        key={ins.nombre}
                                        label={ins.nombre}
                                        value={ins.real != null ? `${ins.real} (real)` : '—'}
                                        sub={ins.teorico != null ? `Teórico: ${ins.teorico}` : undefined}
                                    />
                                ))}
                            </div>
                        </>
                    )}

                    <Sec title="Bloques del Proceso" />
                    <div className="space-y-2">
                        {bloques.map((bloque, idx) => {
                            const bd = bData[String(idx)];
                            if (!bd?.completado) return null;
                            const tReal = bd.tiempoRealMin;
                            const tTeo  = bd.tiempoTeorico;
                            const overTime = tReal != null && tTeo != null && tReal > tTeo * 1.1;
                            return (
                                <div key={idx} className="bg-slate-800 rounded-xl p-3 flex items-center gap-3">
                                    <CheckCircle size={14} className="text-emerald-400 shrink-0" />
                                    <div className="flex-1">
                                        <p className="text-white text-sm font-medium">{blockLabel(bloque.tipo)}</p>
                                        {(tReal != null || tTeo != null) && (
                                            <p className="text-slate-500 text-xs mt-0.5">
                                                {tReal != null ? `Real: ${tReal} min` : ''}
                                                {tTeo != null ? ` · Teórico: ${tTeo} min` : ''}
                                                {bd.tiempoEsperaRealMin > 0 ? ` · Espera: ${bd.tiempoEsperaRealMin} min` : ''}
                                            </p>
                                        )}
                                    </div>
                                    {tReal != null && tTeo != null && (
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border
                                            ${overTime
                                                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                                : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'}`}>
                                            {overTime ? '+tiempo' : 'OK'}
                                        </span>
                                    )}
                                </div>
                            );
                        }).filter(Boolean)}
                    </div>

                    {empItems.length > 0 && (
                        <>
                            <Sec title="Empaque" />
                            <div className="bg-slate-800 rounded-xl p-4">
                                {empItems.map((it, i) => (
                                    <Row
                                        key={i}
                                        label={it.nombre || it.sku || `Presentación ${i + 1}`}
                                        value={`${it.unidades || 0} uds`}
                                        sub={it.pesoKg
                                            ? `${it.pesoKg} kg/ud · ${((it.unidades || 0) * (it.pesoKg || 0)).toFixed(2)} kg total`
                                            : undefined}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function statusBadge(log) {
    if (log.empaqueFinalizado) return { label: 'Empacado',   cls: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' };
    if (log.disposicion === 'guardar_todo') return { label: 'En almacén', cls: 'text-amber-400 bg-amber-500/15 border-amber-500/30' };
    return { label: 'Completado', cls: 'text-blue-400 bg-blue-500/15 border-blue-500/30' };
}

export default function ProductionHistoryPage({ params = null }) {
    const { kromaUser, verCostos } = useKroma();
    const [logs,       setLogs]       = useState([]);
    const [materials,  setMaterials]  = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [error,      setError]      = useState(null);
    const [calYear,    setCalYear]    = useState(new Date().getFullYear());
    const [calMonth,   setCalMonth]   = useState(new Date().getMonth());
    const [selectedDay, setSelectedDay] = useState(null);
    const [search,     setSearch]     = useState('');
    const [detail,     setDetail]     = useState(null);

    // Llegada dirigida: "Producciones recientes" del tablero manda el logId y
    // acá se abre su detalle. Espera a que los logs carguen — el id por sí solo
    // no alcanza, LogDetail necesita el documento completo. Si el log no está
    // en la lista (fuera del rango que carga el historial) no se hace nada:
    // mejor dejar al gerente en el historial que abrirle una ficha vacía.
    const abiertoRef = useRef(null);
    useEffect(() => {
        const id = params?.logId;
        if (!id || loading || abiertoRef.current === id) return;
        const log = logs.find(l => l.id === id);
        if (log) { setDetail(log); abiertoRef.current = id; }
    }, [params?.logId, logs, loading]);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const empresaId = kromaUser?.empresaId || 'lacteoca';
            const [snap, matSnap] = await Promise.all([
                getDocs(query(collection(db, 'kroma_production_logs'), where('empresaId', '==', empresaId))),
                // Los precios del Maestro son lo que permite costear el lote.
                // Si fallan, el historial igual se abre: el costo dirá que no
                // se puede calcular, que es la verdad.
                getDocs(query(collection(db, 'kroma_materials'), where('empresaId', '==', empresaId)))
                    .catch(() => ({ docs: [] })),
            ]);
            setMaterials(matSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.active !== false));
            setLogs(
                soloVivos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
                    .filter(l => l.estado === 'completada')
                    .sort((a, b) => {
                        const da = logDate(a), db_ = logDate(b);
                        return da && db_ ? db_ - da : 0;
                    })
            );
        } catch (e) { setError(e.message); }
        finally     { setLoading(false); }
    }, [kromaUser?.empresaId]);

    useEffect(() => { load(); }, [load]);

    // El calendario abría SIEMPRE en el mes de hoy. Con producciones cargadas en
    // diferido —una planilla de mayo— eso significa abrir en una pantalla vacía
    // que además dice "sin producciones en este mes", sin una sola pista de
    // dónde sí hay. Se abre en el mes del lote más reciente; después el usuario
    // navega libre (por eso solo se hace una vez).
    const yaUbicado = useRef(false);
    useEffect(() => {
        if (yaUbicado.current || loading || logs.length === 0) return;
        yaUbicado.current = true;
        const d = logDate(logs[0]);   // vienen ordenados de más nuevo a más viejo
        if (d) { setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }
    }, [loading, logs]);

    // Los meses que TIENEN producción, para poder saltar a ellos.
    const mesesConDatos = useMemo(() => {
        const vistos = new Map();
        logs.forEach(l => {
            const d = logDate(l);
            if (!d) return;
            const k = `${d.getFullYear()}-${d.getMonth()}`;
            if (!vistos.has(k)) vistos.set(k, { y: d.getFullYear(), m: d.getMonth(), n: 0 });
            vistos.get(k).n += 1;
        });
        return [...vistos.values()].sort((a, b) => (b.y - a.y) || (b.m - a.m));
    }, [logs]);

    const monthLogs = logs.filter(l => {
        const d = logDate(l);
        return d && d.getFullYear() === calYear && d.getMonth() === calMonth;
    });
    const activeDays = new Set(monthLogs.map(l => logDate(l)?.getDate()).filter(Boolean));

    // Buscar recorre TODO el historial, no solo el mes abierto: buscar un lote
    // por su código y que no aparezca porque está en otro mes no es una
    // búsqueda, es una trampa.
    const buscando = search.trim().length > 0;
    const filtered = (buscando ? logs : monthLogs).filter(l => {
        if (!buscando && selectedDay && logDate(l)?.getDate() !== selectedDay) return false;
        if (buscando) {
            const q = search.trim().toLowerCase();
            return (l.lote || '').toLowerCase().includes(q) ||
                   (l.productoNombre || '').toLowerCase().includes(q) ||
                   (l.proveedorNombre || '').toLowerCase().includes(q);
        }
        return true;
    });

    const totalLitros     = monthLogs.reduce((s, l) => s + (l.litrosIngresados || 0), 0);
    const rendimientos    = monthLogs.map(getRendimiento).filter(Boolean).map(Number);
    const avgRendimiento  = rendimientos.length
        ? (rendimientos.reduce((a, b) => a + b, 0) / rendimientos.length).toFixed(2)
        : null;

    const changeMonth = (delta) => {
        setSelectedDay(null);
        let m = calMonth + delta, y = calYear;
        if (m < 0)  { m = 11; y--; }
        if (m > 11) { m = 0;  y++; }
        setCalMonth(m); setCalYear(y);
    };

    if (loading) return (
        <div className="flex justify-center items-center h-64">
            <Loader size={28} className="animate-spin text-emerald-400" />
        </div>
    );
    if (error) return (
        <div className="p-6">
            <div className="bg-red-900/40 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
                {error} — <button onClick={load} className="underline">Reintentar</button>
            </div>
        </div>
    );

    return (
        <div className="p-4 md:p-6 max-w-2xl">
            {/* Title */}
            <div className="flex items-center gap-3 mb-5">
                <ClipboardList size={20} className="text-emerald-400" />
                <div>
                    <h2 className="text-xl font-bold text-white">Historial de Producción</h2>
                    <p className="text-slate-400 text-sm">{logs.length} lote{logs.length !== 1 ? 's' : ''} totales</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                    { label: 'Producciones del mes', value: monthLogs.length, Icon: ClipboardList, c: 'text-emerald-400' },
                    { label: 'Litros proc. del mes', value: totalLitros ? fmtL(totalLitros) : '—', Icon: Droplets, c: 'text-blue-400' },
                    { label: 'Rend. prom. del mes', value: avgRendimiento ? `${avgRendimiento} L/kg` : '—', Icon: BarChart3, c: 'text-amber-400' },
                ].map(({ label, value, Icon, c }) => (
                    <div key={label} className="bg-slate-800 border border-slate-700 rounded-xl p-3">
                        <Icon size={14} className={`${c} mb-2`} />
                        <p className="text-white font-bold text-sm leading-none">{value}</p>
                        <p className="text-slate-500 text-xs mt-1 leading-tight">{label}</p>
                    </div>
                ))}
            </div>

            {/* Calendar */}
            <div className="mb-5">
                <CalendarPicker
                    year={calYear} month={calMonth}
                    onChangeMonth={changeMonth}
                    activeDays={activeDays}
                    selectedDay={selectedDay}
                    onSelectDay={setSelectedDay}
                />
            </div>

            {/* Search */}
            <div className="relative mb-4">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar por lote, producto o proveedor…"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
                {search && (
                    <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                        <X size={14} />
                    </button>
                )}
            </div>

            {/* List */}
            {filtered.length === 0 ? (
                <div className="text-center py-12">
                    <ClipboardList size={32} className="text-slate-700 mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">
                        {buscando
                            ? `Nada que coincida con "${search.trim()}"`
                            : selectedDay
                                ? `Sin producciones el día ${selectedDay}`
                                : 'Sin producciones en este mes'}
                    </p>
                    {/* Un mes vacío sin decir dónde SÍ hay deja al gerente
                        adivinando mes por mes. Los que tienen datos se ofrecen. */}
                    {!buscando && mesesConDatos.length > 0 && (
                        <div className="mt-4">
                            <p className="text-slate-600 text-xs mb-2">Meses con producción:</p>
                            <div className="flex flex-wrap gap-1.5 justify-center">
                                {mesesConDatos.slice(0, 8).map(({ y, m, n }) => (
                                    <button key={`${y}-${m}`} type="button"
                                        onClick={() => { setSelectedDay(null); setCalYear(y); setCalMonth(m); }}
                                        className="bg-slate-800 border border-slate-700 hover:border-emerald-500/50 text-slate-300 hover:text-emerald-400 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                                        {new Date(y, m, 1).toLocaleDateString('es-VE', { month: 'short' })} {y} <span className="text-slate-500">· {n}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map(log => {
                        const d   = logDate(log);
                        const { label, cls } = statusBadge(log);
                        const netos = getLitrosNetos(log);
                        const kg    = getTotalKg(log);
                        return (
                            <button
                                key={log.id}
                                onClick={() => setDetail(log)}
                                className="w-full bg-slate-800 border border-slate-700 hover:border-emerald-600/50 rounded-xl p-4 text-left transition-colors group"
                            >
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <div className="min-w-0">
                                        <p className="text-white font-bold text-sm truncate group-hover:text-emerald-300 transition-colors">
                                            {log.productoNombre || '—'}
                                        </p>
                                        <p className="mt-0.5"><Lote>{log.lote || log.id}</Lote></p>
                                    </div>
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${cls}`}>
                                        {label}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                                    <span className="flex items-center gap-1">
                                        <Calendar size={10} />
                                        {d
                                            ? `${d.getDate()} ${d.toLocaleDateString('es-VE', { month: 'short' })} · ${fmtTime(log.fechaCierre || log.createdAt)}`
                                            : '—'}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Droplets size={10} />
                                        {fmtL(log.litrosIngresados || 0)} → {fmtL(netos)} netos
                                    </span>
                                    {kg && (
                                        <span className="flex items-center gap-1">
                                            <Package size={10} />
                                            {kg.toFixed(1)} kg
                                        </span>
                                    )}
                                </div>
                                {log.creadoPorNombre && (
                                    <p className="text-slate-600 text-xs mt-1.5 flex items-center gap-1">
                                        <User size={9} /> {log.creadoPorNombre}
                                    </p>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {detail && <LogDetail log={detail} materials={materials} verCostos={verCostos} onClose={() => setDetail(null)} />}
        </div>
    );
}
