// RUTA: src/Kroma/pages/operator/VentasPlanta.jsx
//
// Despachos → "Ventas en planta": las ventas que salieron de la cava de Barinas
// y su factura de Zoho.
//
//   · Por facturar — salió producto y todavía no hay factura. Es la lista que
//     se tiene que vaciar.
//   · Facturadas   — con su número de factura y el CUADRE: unidades entregadas
//     (en unidades de venta de GK) contra las unidades de la factura.
//   · Facturas sin salida — facturas de clientes de planta que nadie registró
//     como salida de cava. El control en el otro sentido.
//   · Reposiciones (`tipo:'reposicion'`) — "por documentar" hasta vincular la
//     NOTA DE CRÉDITO por lo devuelto y la FACTURA por lo repuesto, que la
//     administradora hace en Zoho y cruza entre sí.
//
// Registrar la venta lo puede hacer el operario (sin precios). Facturar,
// vincular y ver montos es de quien puede ver costos (`verCostos`): el
// operario nunca ve precios.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/Firebase/config.js';
import { ShoppingBag, Loader, Link2, FileText, CheckCircle2, AlertTriangle, X, Plus, Unlink, Search } from 'lucide-react';
import { useKroma } from '../../KromaContext';
import SalidaCavaSheet from '../../Components/SalidaCavaSheet.jsx';
import { resumenLineas, gramosDeLinea, motivoLabel } from '@/Kroma/salidasCava.js';

const esRepo = (v) => v?.tipo === 'reposicion';
import { fmtVence } from '@/utils/fechaCorta.js';

const llamar = (data) => httpsCallable(functions, 'ventasPlanta', { timeout: 240000 })(data).then(r => r.data);
const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n) => (Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 2 });
const fechaMs = (ms) => ms ? new Date(ms).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
const aNum = (s) => { const n = parseFloat(String(s).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function Hoja({ titulo, onClose, children, pie }) {
    return (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
                    <p className="text-white font-bold">{titulo}</p>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><X size={18} /></button>
                </div>
                <div className="overflow-y-auto px-5 py-4 space-y-4">{children}</div>
                {pie && <div className="px-5 py-4 border-t border-slate-800 shrink-0">{pie}</div>}
            </div>
        </div>
    );
}

function Cuadre({ v }) {
    if (v.estadoFactura !== 'facturada') return null;
    const ok = v.cuadra;
    return (
        <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${ok ? 'border-emerald-700/40 bg-emerald-900/15 text-emerald-300' : 'border-amber-600/50 bg-amber-900/20 text-amber-200'}`}>
            <span className="font-semibold">Factura {v.facturaNumero}</span>
            {esRepo(v) ? ` · NC ${v.notaCreditoNumero || '—'}` : v.facturaVia === 'creada' ? ' · creada desde Kroma' : ' · vinculada'}
            <span className="block mt-0.5">
                {esRepo(v) ? 'Repuesto' : 'Entregado'} {num(v.unidadesEntregadas)} uds · facturado {num(v.facturaUnidades)} uds
                {ok ? ' — cuadra' : ` — diferencia ${v.diferenciaUnidades > 0 ? '+' : ''}${num(v.diferenciaUnidades)} uds`}
            </span>
        </div>
    );
}

// ── Vincular una factura ya hecha en Zoho ────────────────────────────────────
function VincularSheet({ venta, onClose, onHecho }) {
    const repo = esRepo(venta);
    const [nc, setNc] = useState('');
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [guardando, setGuardando] = useState('');
    const [res, setRes] = useState(null);
    useEffect(() => {
        llamar({ accion: 'candidatas', ventaId: venta.id }).then(setData).catch(e => setError(e.message));
    }, [venta.id]);
    const vincular = async (numero) => {
        if (repo && !nc.trim()) { setError('Primero escribe el número de la nota de crédito.'); return; }
        setGuardando(numero); setError('');
        try { const r = await llamar({ accion: 'vincular', ventaId: venta.id, numero, notaCreditoNumero: nc.trim() }); setRes(r); onHecho(); }
        catch (e) { setError(e.message); }
        finally { setGuardando(''); }
    };
    return (
        <Hoja titulo={repo ? 'Documentar la reposición' : 'Vincular factura de Zoho'} onClose={onClose}>
            {repo ? (
                <div className="space-y-3">
                    <p className="text-slate-400 text-sm leading-relaxed">
                        En Zoho: <b className="text-white">1)</b> nota de crédito por lo devuelto ({num(venta.unidadesDevueltas)} ud),
                        {' '}<b className="text-white">2)</b> factura por lo repuesto ({data ? num(data.unidadesEntregadas) : '…'} uds de venta),
                        {' '}<b className="text-white">3)</b> aplica la nota de crédito a esa factura. Luego vincúlalas aquí.
                    </p>
                    {!res && (
                        <label className="block text-xs text-slate-500">Número de la nota de crédito
                            <input value={nc} onChange={e => setNc(e.target.value)} placeholder="Ej: CN-00031"
                                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-violet-500" />
                        </label>
                    )}
                    {!res && <p className="text-slate-500 text-xs">Ahora elige la factura de la reposición:</p>}
                </div>
            ) : (
                <p className="text-slate-400 text-sm">
                    Facturas de <b className="text-white">{venta.clienteNombre}</b>, las más cercanas a la venta del {fmtVence(venta.fecha)} primero.
                    Se entregaron {data ? num(data.unidadesEntregadas) : '…'} uds de venta.
                </p>
            )}
            {error && <p className="bg-rose-900/20 border border-rose-700/40 rounded-xl px-3 py-2 text-rose-300 text-sm">{error}</p>}
            {res ? (
                <div className="text-center py-4">
                    <CheckCircle2 size={36} className={`mx-auto mb-2 ${res.cuadre.cuadra ? 'text-emerald-400' : 'text-amber-400'}`} />
                    <p className="text-white font-semibold">{res.reposicion ? `Documentada: factura ${res.numero} + NC ${nc}` : `Vinculada a ${res.numero}`}</p>
                    {res.reposicion && <p className="text-slate-400 text-xs mt-1">Esa factura ya no cuenta como venta ni comisión en GK.</p>}
                    <p className="text-slate-400 text-sm mt-1">
                        {res.cuadre.cuadra ? 'Lo entregado y lo facturado cuadran.'
                            : `No cuadra: entregado ${num(res.cuadre.entregadas)} uds, facturado ${num(res.cuadre.facturadas)} uds.`}
                    </p>
                    {res.aviso && <p className="text-amber-300 text-xs mt-3">{res.aviso}</p>}
                </div>
            ) : !data && !error ? (
                <div className="flex justify-center py-8"><Loader size={22} className="animate-spin text-emerald-400" /></div>
            ) : data && data.facturas.length === 0 ? (
                <p className="text-slate-500 text-sm py-4">
                    Este cliente no tiene facturas libres en GK. Si la acabas de hacer en Zoho, espera la próxima conciliación (cada hora de día) o factúrala desde aquí.
                </p>
            ) : data && (
                <div className="space-y-2">
                    {data.facturas.map(f => (
                        <button key={f.numero} disabled={!!guardando} onClick={() => vincular(f.numero)}
                            className="w-full text-left bg-slate-800/60 border border-slate-700 hover:border-emerald-500/60 rounded-xl px-3 py-2.5 flex items-center gap-3 disabled:opacity-50">
                            <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-semibold">{f.numero} <span className="text-slate-500 font-normal">· {fechaMs(f.fecha)}</span></p>
                                <p className="text-slate-400 text-xs">{num(f.unidades)} uds · {money(f.total)} · {f.estado}</p>
                            </div>
                            {guardando === f.numero ? <Loader size={15} className="animate-spin text-emerald-400" /> : <Link2 size={15} className="text-emerald-400" />}
                        </button>
                    ))}
                </div>
            )}
        </Hoja>
    );
}

// Sugerencia de artículo de Zoho para una línea: palabras del producto en común
// y, sobre todo, el mismo peso ("250", "1 kg").
function sugerir(linea, articulos) {
    const palabras = norm(linea.productoNombre).split(/[^a-z0-9]+/).filter(w => w.length > 2);
    const g = Math.round((Number(linea.pesoPorUnidad) || 0) * 1000);
    let mejor = null, puntos = 0;
    articulos.forEach(a => {
        const n = norm(a.nombre);
        let p = palabras.filter(w => n.includes(w)).length;
        if (linea.tipo === 'sin_envasar' ? /\bkg\b/.test(norm(a.unidad)) : g > 0 && (n.includes(String(g)) || (g >= 1000 && n.includes(`${g / 1000} kg`)))) p += 3;
        if (p > puntos) { puntos = p; mejor = a; }
    });
    return mejor;
}
const cantidadPara = (linea, art) => {
    if (art && /kg/.test(norm(art.unidad).replace(/[^a-z]/g, ''))) return +(gramosDeLinea(linea) / 1000).toFixed(3);
    return Number(linea.cantidad) || 0;
};

// ── Facturar en Zoho desde la venta ──────────────────────────────────────────
function FacturarSheet({ venta, onClose, onHecho }) {
    const [cat, setCat] = useState(null);
    const [error, setError] = useState('');
    const [filas, setFilas] = useState([]);
    const [emitir, setEmitir] = useState(false);
    const [dias, setDias] = useState('0');
    const [notas, setNotas] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [res, setRes] = useState(null);

    useEffect(() => {
        llamar({ accion: 'catalogo', conArticulos: true }).then(c => {
            setCat(c);
            setFilas((venta.lineas || []).map(l => {
                const a = sugerir(l, c.articulos || []);
                return { linea: l, itemId: a?.itemId || '', cantidad: String(cantidadPara(l, a)), rate: a?.precioZoho ? String(a.precioZoho) : '' };
            }));
        }).catch(e => setError(e.message));
    }, [venta]);

    const artDe = (id) => cat?.articulos.find(a => a.itemId === id);
    const total = filas.reduce((s, f) => s + aNum(f.cantidad) * aNum(f.rate), 0);
    const listo = filas.length > 0 && filas.every(f => f.itemId && aNum(f.cantidad) > 0 && aNum(f.rate) > 0);
    const set = (i, patch) => setFilas(fs => fs.map((f, j) => j === i ? { ...f, ...patch } : f));

    const facturar = async () => {
        if (!listo || guardando) return;
        setGuardando(true); setError('');
        try {
            const r = await llamar({
                accion: 'facturar', ventaId: venta.id, emitir, diasCredito: aNum(dias), notas,
                lineas: filas.map(f => ({ itemId: f.itemId, cantidad: aNum(f.cantidad), rate: aNum(f.rate) })),
            });
            setRes(r); onHecho();
        } catch (e) { setError(e.message); }
        finally { setGuardando(false); }
    };

    return (
        <Hoja titulo="Facturar en Zoho" onClose={onClose} pie={!res && cat && (
            <button onClick={facturar} disabled={!listo || guardando}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-xl py-3 text-sm flex items-center justify-center gap-2">
                {guardando && <Loader size={15} className="animate-spin" />}
                {emitir ? 'Emitir factura' : 'Guardar borrador en Zoho'} · {money(total)}
            </button>
        )}>
            <p className="text-slate-400 text-sm">Cliente: <b className="text-white">{venta.clienteNombre}</b> · fecha de la factura {fmtVence(venta.fecha)}</p>
            {error && <p className="bg-rose-900/20 border border-rose-700/40 rounded-xl px-3 py-2 text-rose-300 text-sm">{error}</p>}
            {res ? (
                <div className="text-center py-4">
                    <CheckCircle2 size={36} className="mx-auto mb-2 text-emerald-400" />
                    <p className="text-white font-semibold">Factura {res.numero} · {money(res.total)}</p>
                    <p className="text-slate-400 text-sm mt-1">
                        {res.sincronizada
                            ? (res.cuadre.cuadra ? 'Lo entregado y lo facturado cuadran.' : `No cuadra: entregado ${num(res.cuadre.entregadas)} uds, facturado ${num(res.cuadre.facturadas)} uds.`)
                            : 'Creada en Zoho. Entrará a GK en la próxima conciliación.'}
                    </p>
                    {res.aviso && <p className="text-amber-300 text-xs mt-3">{res.aviso}</p>}
                </div>
            ) : !cat && !error ? (
                <div className="flex justify-center py-8"><Loader size={22} className="animate-spin text-emerald-400" /></div>
            ) : cat && (
                <>
                    {cat.articulos.length === 0 && (
                        <p className="text-amber-300 text-sm">No hay artículos de Zoho en GK. Corre "Sincronizar artículos" en AdminPanel → Integraciones.</p>
                    )}
                    {filas.map((f, i) => {
                        const a = artDe(f.itemId);
                        return (
                            <div key={i} className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2">
                                <p className="text-slate-300 text-xs">
                                    Salió: <b className="text-white">{resumenLineas([f.linea])}</b> · {f.linea.productoNombre} · lote {f.linea.lote || '—'}
                                </p>
                                <select value={f.itemId} onChange={e => { const na = artDe(e.target.value); set(i, { itemId: e.target.value, cantidad: String(cantidadPara(f.linea, na)), rate: na?.precioZoho ? String(na.precioZoho) : f.rate }); }}
                                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-2 py-2 text-white text-sm">
                                    <option value="">— Artículo de Zoho —</option>
                                    {cat.articulos.map(x => <option key={x.itemId} value={x.itemId}>{x.nombre}{x.unidad ? ` (${x.unidad})` : ''}</option>)}
                                </select>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="text-xs text-slate-500">Cantidad{a?.unidad ? ` (${a.unidad})` : ''}
                                        <input value={f.cantidad} inputMode="decimal" onChange={e => set(i, { cantidad: e.target.value })}
                                            className="mt-1 w-full bg-slate-900 border border-slate-600 rounded-lg px-2 py-2 text-white text-sm font-mono" />
                                    </label>
                                    <label className="text-xs text-slate-500">Precio ($ por {a?.unidad || 'unidad'})
                                        <input value={f.rate} inputMode="decimal" onChange={e => set(i, { rate: e.target.value })}
                                            className="mt-1 w-full bg-slate-900 border border-slate-600 rounded-lg px-2 py-2 text-white text-sm font-mono" />
                                    </label>
                                </div>
                            </div>
                        );
                    })}
                    <div className="grid grid-cols-2 gap-2">
                        <label className="text-xs text-slate-500">Días de crédito
                            <input value={dias} inputMode="numeric" onChange={e => setDias(e.target.value)}
                                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm font-mono" />
                        </label>
                        <div className="text-xs text-slate-500">Estado en Zoho
                            <div className="mt-1 flex bg-slate-800 border border-slate-700 rounded-lg p-0.5">
                                {[[false, 'Borrador'], [true, 'Emitida']].map(([v, l]) => (
                                    <button key={l} type="button" onClick={() => setEmitir(v)}
                                        className={`flex-1 py-1.5 rounded-md text-xs font-semibold ${emitir === v ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>{l}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Notas de la factura (opcional)"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm placeholder-slate-500" />
                    <p className="text-slate-500 text-xs">El cliente queda como Oficina (sin comisión) si no tiene vendedor. El impuesto lo aplica Zoho según el artículo.</p>
                </>
            )}
        </Hoja>
    );
}

export default function VentasPlanta({ inventory = [], nombreAlmacen, onInventarioCambio }) {
    const { kromaUser, verCostos, canEdit } = useKroma();
    const empresaId = kromaUser?.empresaId || 'lacteoca';
    const [ventas, setVentas] = useState(null);
    const [error, setError] = useState('');
    const [filtro, setFiltro] = useState('por_facturar');
    const [q, setQ] = useState('');
    const [nueva, setNueva] = useState(false);
    const [vincular, setVincular] = useState(null);
    const [facturar, setFacturar] = useState(null);
    const [sinSalida, setSinSalida] = useState(null);
    const [cargandoSin, setCargandoSin] = useState(false);

    const cargar = useCallback(async () => {
        setError('');
        try {
            const snap = await getDocs(query(collection(db, 'kroma_ventas_planta'), where('empresaId', '==', empresaId)));
            setVentas(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(v => v.active !== false)
                .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
        } catch (e) { setError(e?.message || 'No se pudieron cargar las ventas.'); setVentas([]); }
    }, [empresaId]);
    useEffect(() => { cargar(); }, [cargar]);

    const revisarSinSalida = async () => {
        setCargandoSin(true);
        try { const r = await llamar({ accion: 'pendientes' }); setSinSalida(r.sinSalida || []); }
        catch (e) { setError(e.message); }
        finally { setCargandoSin(false); }
    };
    const desvincular = async (v) => {
        try { await llamar({ accion: 'desvincular', ventaId: v.id }); cargar(); }
        catch (e) { setError(e.message); }
    };

    const cuentas = useMemo(() => {
        const l = ventas || [];
        return {
            por_facturar: l.filter(v => v.estadoFactura !== 'facturada').length,
            reposiciones: l.filter(esRepo).length,
            facturada: l.filter(v => v.estadoFactura === 'facturada').length,
            descuadre: l.filter(v => v.estadoFactura === 'facturada' && v.cuadra === false).length,
        };
    }, [ventas]);
    const visibles = (ventas || [])
        .filter(v => filtro === 'por_facturar' ? v.estadoFactura !== 'facturada'
            : filtro === 'descuadre' ? v.estadoFactura === 'facturada' && v.cuadra === false
            : v.estadoFactura === 'facturada')
        .filter(v => !q.trim() || norm(v.clienteNombre).includes(norm(q)) || (v.lineas || []).some(l => norm(l.lote).includes(norm(q))));

    return (
        <div className="space-y-4">
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 text-xs text-slate-400 leading-relaxed">
                Ventas y reposiciones que salieron de la cava de la planta. Quien entrega las registra (cliente, lote y cantidad);
                {verCostos ? ' tú las documentas en Zoho: la venta con su factura, la reposición con nota de crédito + factura cruzadas.' : ' administración las documenta en Zoho.'}
            </div>

            {canEdit('despachos') && (
                <button onClick={() => setNueva(true)}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl py-3 text-sm">
                    <Plus size={16} /> Registrar venta
                </button>
            )}

            <div className="flex gap-1.5 flex-wrap">
                {[['por_facturar', 'Pendientes', cuentas.por_facturar], ['facturada', 'Documentadas', cuentas.facturada], ['descuadre', 'No cuadran', cuentas.descuadre]]
                    .filter(([k, , n]) => k !== 'descuadre' || n > 0)
                    .map(([k, l, n]) => (
                        <button key={k} onClick={() => setFiltro(k)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${filtro === k
                                ? (k === 'descuadre' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-emerald-600 border-emerald-500 text-white')
                                : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                            {l} ({n})
                        </button>
                    ))}
            </div>
            {(ventas || []).length > 6 && (
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cliente o lote"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white text-sm placeholder-slate-500" />
                </div>
            )}

            {error && <p className="bg-rose-900/20 border border-rose-700/40 rounded-xl px-3 py-2 text-rose-300 text-sm">{error}</p>}

            {ventas === null ? (
                <div className="flex justify-center py-12"><Loader size={24} className="animate-spin text-emerald-400" /></div>
            ) : visibles.length === 0 ? (
                <div className="text-center py-12">
                    <ShoppingBag size={30} className="text-slate-700 mx-auto mb-2" />
                    <p className="text-slate-500 text-sm">{filtro === 'por_facturar' ? 'Nada pendiente de documentar.' : 'Nada por aquí.'}</p>
                </div>
            ) : visibles.map(v => (
                <div key={v.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="text-white font-semibold text-sm">
                                {esRepo(v) && <span className="text-violet-300 text-[10px] font-bold uppercase tracking-wide mr-1.5">Reposición</span>}
                                {v.clienteNombre}
                            </p>
                            <p className="text-slate-400 text-xs mt-0.5">
                                {fmtVence(v.fecha)} · {esRepo(v) ? 'repuesto ' : ''}{resumenLineas(v.lineas)}
                                {esRepo(v) ? ` · devolvió ${num(v.unidadesDevueltas)} ud (${motivoLabel(v.motivo).toLowerCase()})` : ''}
                            </p>
                            <p className="text-slate-600 text-xs mt-0.5">
                                Lote {[...new Set((v.lineas || []).map(l => l.lote).filter(Boolean))].join(', ') || '—'}
                                {v.registradoPorNombre ? ` · registró ${v.registradoPorNombre}` : ''}
                            </p>
                            {v.nota && <p className="text-slate-500 text-xs italic mt-1">"{v.nota}"</p>}
                        </div>
                        <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md ${v.estadoFactura === 'facturada'
                            ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                            {v.estadoFactura === 'facturada' ? (esRepo(v) ? 'Documentada' : 'Facturada') : (esRepo(v) ? 'Por documentar' : 'Por facturar')}
                        </span>
                    </div>
                    <Cuadre v={v} />
                    {verCostos && (
                        <div className="flex gap-2 mt-3">
                            {v.estadoFactura !== 'facturada' && esRepo(v) ? (
                                <button onClick={() => setVincular(v)} className="flex-1 flex items-center justify-center gap-1.5 bg-violet-700 hover:bg-violet-600 text-white text-xs font-bold rounded-lg py-2">
                                    <Link2 size={13} /> Vincular nota de crédito y factura
                                </button>
                            ) : v.estadoFactura !== 'facturada' ? (
                                <>
                                    <button onClick={() => setFacturar(v)} className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg py-2">
                                        <FileText size={13} /> Facturar en Zoho
                                    </button>
                                    <button onClick={() => setVincular(v)} className="flex-1 flex items-center justify-center gap-1.5 border border-slate-600 text-slate-200 hover:border-emerald-500 text-xs font-bold rounded-lg py-2">
                                        <Link2 size={13} /> Vincular factura
                                    </button>
                                </>
                            ) : v.facturaVia === 'vinculada' && (
                                <button onClick={() => desvincular(v)} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-300">
                                    <Unlink size={12} /> Desvincular
                                </button>
                            )}
                        </div>
                    )}
                </div>
            ))}

            {verCostos && (
                <div className="border-t border-slate-800 pt-4">
                    <p className="text-white text-sm font-semibold flex items-center gap-2"><AlertTriangle size={15} className="text-amber-400" /> Facturas sin salida de cava</p>
                    <p className="text-slate-500 text-xs mt-1">Facturas de clientes de planta (desde su primera venta registrada) que no están vinculadas a ninguna salida: producto facturado que nadie sacó del inventario.</p>
                    {sinSalida === null ? (
                        <button onClick={revisarSinSalida} disabled={cargandoSin}
                            className="mt-2 flex items-center gap-2 text-sm text-emerald-400 font-semibold disabled:opacity-50">
                            {cargandoSin && <Loader size={14} className="animate-spin" />} Revisar
                        </button>
                    ) : sinSalida.length === 0 ? (
                        <p className="text-emerald-400 text-sm mt-2">Ninguna: toda factura de planta tiene su salida.</p>
                    ) : (
                        <div className="mt-2 space-y-1.5">
                            {sinSalida.map(f => (
                                <div key={f.numero} className="bg-amber-900/10 border border-amber-700/30 rounded-lg px-3 py-2 text-xs">
                                    <p className="text-white font-semibold">{f.numero} · {f.clienteNombre}</p>
                                    <p className="text-slate-400">{fechaMs(f.fecha)} · {num(f.unidades)} uds · {money(f.total)}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {nueva && (
                <SalidaCavaSheet tipoInicial="venta" items={inventory} nombreAlmacen={nombreAlmacen}
                    onClose={() => setNueva(false)} onDone={() => { cargar(); onInventarioCambio?.(); }} />
            )}
            {vincular && <VincularSheet venta={vincular} onClose={() => setVincular(null)} onHecho={cargar} />}
            {facturar && <FacturarSheet venta={facturar} onClose={() => setFacturar(null)} onHecho={cargar} />}
        </div>
    );
}
