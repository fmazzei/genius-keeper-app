// RUTA: src/Components/EditReportForm.jsx
//
// EDICIÓN COMPLETA DEL REPORTE DE VISITA (solo el máster; pedido del dueño,
// 16-nov-2026): todo lo que el mercaderista reporta se corrige aquí, sin
// recurrir a nadie. Lo que se deduce (inventario total, envases dañados, estado
// de cada lote, lo que entró al anaquel) se recalcula igual que en el
// formulario del mercaderista (utils/edicionReporte.js). Cada guardado deja
// constancia en `edicionesMaster` (quién, cuándo, qué cambió y qué valor tenía).

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/Firebase/config.js';
import { doc, updateDoc, deleteDoc, collection, getDocs, getDoc, setDoc, query, where, arrayUnion } from 'firebase/firestore';
import { DollarSign, BarChart2, Shield, Trash2, X, Search, Plus, Calendar, Truck, Undo2, Info } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner.jsx';
import NewEntrantModal from './NewEntrantModal.jsx';
import { useAuth } from '@/context/AuthContext';
import { useReporters } from '@/hooks/useReporters.js';
import { estadoLote, ESTADO_LABEL } from '@/utils/retiros.js';
import { ALTURAS, CATEGORIAS_VECINAS, ESTADOS_POP } from '@/utils/anaquelCatalogo.js';
import { MOTIVOS_RETIRO, diaLocalMs } from '@/utils/visitaOla1.js';
import { formularioDesdeReporte, armarEdicion, devolucionDeRetiro, NOMBRE_CAMPO } from '@/utils/edicionReporte.js';

const useCompetitorProducts = () => {
    const [products, setProducts] = useState([]);
    useEffect(() => {
        getDocs(query(collection(db, 'competitors'), where('active', '==', true)))
            .then(snap => setProducts(snap.docs.map(d => {
                const data = d.data();
                return { id: d.id, brand: data.brand || '', name: data.name || '', weight_g: data.weight_g, text: `${data.brand} ${data.name} ${data.weight_g}g` };
            })))
            .catch(() => {});
    }, []);
    return products;
};

const Seccion = ({ titulo, icono, children, nota }) => (
    <section className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="flex items-center gap-2 font-bold text-slate-800 mb-1">{icono}{titulo}</h3>
        {nota && <p className="text-xs text-slate-500 mb-3">{nota}</p>}
        <div className="space-y-3">{children}</div>
    </section>
);
const Campo = ({ label, children }) => (
    <label className="block min-w-0">
        <span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>
        {children}
    </label>
);
const inputCls = 'w-full min-w-0 px-3 py-2.5 border-2 border-slate-200 rounded-lg bg-white text-sm focus:border-brand-blue outline-none';
const Num = ({ value, onChange, placeholder = '0', decimal = false }) => (
    <input type="text" inputMode={decimal ? 'decimal' : 'numeric'} value={value} placeholder={placeholder}
        onChange={e => onChange(decimal ? e.target.value.replace(/[^\d.,]/g, '') : e.target.value.replace(/[^\d]/g, ''))}
        className={inputCls} />
);

const EditReportForm = ({ report, posList = [], onSave, onClose }) => {
    const { user } = useAuth();
    const { reporters } = useReporters();
    const competitorProducts = useCompetitorProducts();
    const [f, setF] = useState(() => formularioDesdeReporte(report));
    const [isProcessing, setIsProcessing] = useState(false);
    const [errores, setErrores] = useState([]);
    const [comp, setComp] = useState({ product: '', brand: '', productName: '', price: '', weight_g: null });
    const [isEntrantModalOpen, setIsEntrantModalOpen] = useState(false);

    useEffect(() => { setF(formularioDesdeReporte(report)); setErrores([]); }, [report]);

    const set = (campo, valor) => setF(prev => ({ ...prev, [campo]: valor }));
    const setItem = (lista, i, cambios) => setF(prev => ({ ...prev, [lista]: prev[lista].map((x, k) => (k === i ? { ...x, ...cambios } : x)) }));
    const quitar = (lista, i) => setF(prev => ({ ...prev, [lista]: prev[lista].filter((_, k) => k !== i) }));

    const pdvs = useMemo(() => [...posList].filter(p => !p.eliminado && p.type !== 'depot')
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')), [posList]);
    const pos = pdvs.find(p => p.id === f.posId) || (f.posId ? { id: f.posId, name: report.posName, zone: report.posZone, coordinates: report.coordinates } : null);
    const listaReporters = useMemo(() => {
        const l = [...reporters];
        if (report.reporterId && !l.some(r => r.id === report.reporterId)) l.unshift({ id: report.reporterId, name: report.userName || 'Mercaderista (inactivo)' });
        return l;
    }, [reporters, report]);
    const reporter = listaReporters.find(r => r.id === f.reporterId) || null;

    const vista = useMemo(() => armarEdicion(report, f, { pos, reporter }), [report, f, pos, reporter]);

    const handleProductSelect = (e) => {
        const s = competitorProducts.find(p => p.text === e.target.value);
        setComp(prev => ({ ...prev, product: e.target.value, brand: s?.brand || '', productName: s?.name || '', weight_g: s?.weight_g || null }));
    };
    const handleAddCompetitor = () => {
        if (!comp.product || !comp.price) return;
        set('competition', [...(f.competition || []), { ...comp, hasPop: false, hasTasting: 'unknown' }]);
        setComp({ product: '', brand: '', productName: '', price: '', weight_g: null });
    };

    const handleSave = async () => {
        if (String(report.id).startsWith('sim-report-')) { alert('No se pueden editar reportes del modo simulación.'); return; }
        const { cambios, campos, antes, errores: errs } = vista;
        if (errs.length) { setErrores(errs); return; }
        if (!Object.keys(cambios).length) { onClose?.(); return; }
        setIsProcessing(true);
        setErrores([]);
        try {
            const constancia = JSON.parse(JSON.stringify({
                at: new Date().toISOString(),
                por: { uid: user?.uid || null, email: user?.email || null },
                campos: campos.length ? campos : Object.keys(cambios),
                antes,
            }));
            await updateDoc(doc(db, 'visit_reports', report.id), { ...cambios, edicionesMaster: arrayUnion(constancia) });
            // El retiro declarado en la visita vive también en Devoluciones
            // (visita_<id>): se mantiene igual a lo que dice el reporte.
            if ('retiroVisita' in cambios) {
                const id = `visita_${report.reportId || report.id}`;
                const ref = doc(db, 'devoluciones', id);
                const existe = (await getDoc(ref)).exists();
                const final = { ...report, ...cambios };
                const dev = devolucionDeRetiro(final, cambios.retiroVisita);
                if (dev) {
                    await setDoc(ref, { ...dev, fecha: diaLocalMs(Date.parse(final.startTime) || Date.now()), corregidoPorMaster: new Date().toISOString(),
                        ...(existe ? {} : { montoNotaCredito: null, notaCreditoNumero: null, notaCreditoFecha: null, reporteOrigenId: null, createdAt: new Date().toISOString() }) }, { merge: true });
                } else if (existe) {
                    await updateDoc(ref, { unidades: 0, unidadesRepuestas: 0, lotes: [], anuladaPorMaster: new Date().toISOString(), notas: 'El máster quitó el retiro del reporte' });
                }
            }
            onSave?.();
        } catch (error) {
            console.error('Error al actualizar el reporte:', error);
            setErrores([`No se pudo guardar: ${error?.message || error}`]);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDelete = async () => {
        if (String(report.id).startsWith('sim-report-')) { alert('No se pueden eliminar reportes del modo simulación.'); return; }
        if (!window.confirm('¿Eliminar este reporte? Esta acción no se puede deshacer.')) return;
        setIsProcessing(true);
        try {
            await deleteDoc(doc(db, 'visit_reports', report.id));
            onSave?.();
        } catch (error) {
            console.error('Error al eliminar el reporte:', error);
            alert('No se pudo eliminar el reporte.');
        } finally {
            setIsProcessing(false);
        }
    };

    const total = vista.cambios.inventoryLevel ?? report.inventoryLevel ?? 0;
    const entro = vista.cambios.orderQuantity ?? report.orderQuantity ?? 0;
    const camposCambiados = vista.campos.filter(c => NOMBRE_CAMPO[c]).map(c => NOMBRE_CAMPO[c]);
    const unicos = [...new Set(camposCambiados)];

    return (
        <>
            <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1 pb-2">
                <Seccion titulo="Visita" icono={<Calendar size={18} className="text-brand-blue" />}
                    nota="Si el mercaderista cargó el reporte después de la visita, aquí se pone la hora real.">
                    <Campo label="Punto de venta">
                        <select value={f.posId} onChange={e => set('posId', e.target.value)} className={inputCls}>
                            {!pdvs.some(p => p.id === f.posId) && f.posId && <option value={f.posId}>{report.posName}</option>}
                            {pdvs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </Campo>
                    <Campo label="Mercaderista">
                        <select value={f.reporterId} onChange={e => set('reporterId', e.target.value)} className={inputCls}>
                            {!f.reporterId && <option value="">{report.userName || '—'}</option>}
                            {listaReporters.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </Campo>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Campo label="Inicio (hora de Caracas)">
                            <input type="datetime-local" value={f.inicio} onChange={e => set('inicio', e.target.value)} className={`${inputCls} appearance-none`} />
                        </Campo>
                        <Campo label="Fin (hora de Caracas)">
                            <input type="datetime-local" value={f.fin} onChange={e => set('fin', e.target.value)} className={`${inputCls} appearance-none`} />
                        </Campo>
                    </div>
                </Seccion>

                <Seccion titulo="Anaquel" icono={<DollarSign size={18} className="text-brand-blue" />}
                    nota="Lo que había al llegar, ANTES de reponer. El total se suma de los lotes.">
                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => set('stockout', false)}
                            className={`p-3 rounded-lg border-2 font-semibold text-sm ${!f.stockout ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600'}`}>Hay producto</button>
                        <button type="button" onClick={() => set('stockout', true)}
                            className={`p-3 rounded-lg border-2 font-semibold text-sm ${f.stockout ? 'border-red-500 bg-red-50 text-red-800' : 'border-slate-200 text-slate-600'}`}>Anaquel vacío (quiebre)</button>
                    </div>
                    {!f.stockout && (
                        <>
                            {(f.batches || []).map((b, i) => {
                                const est = b.sinFecha ? 'sin_fecha' : estadoLote(b.expiryDate);
                                return (
                                    <div key={i} className={`p-3 rounded-lg border ${est === 'vencido' ? 'border-red-200 bg-red-50' : est === 'por_vencer' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold text-slate-700">Lote {i + 1} · {ESTADO_LABEL[est] || 'Sin fecha'}{b.devuelto ? ' · devuelto' : ''}</span>
                                            <button type="button" onClick={() => quitar('batches', i)} className="text-red-500 p-1"><X size={16} /></button>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            <Campo label="Vence">
                                                <input type="date" disabled={b.sinFecha} value={b.expiryDate || ''} onChange={e => setItem('batches', i, { expiryDate: e.target.value })} className={`${inputCls} appearance-none px-2`} />
                                            </Campo>
                                            <Campo label="Unidades"><Num value={b.quantity} onChange={v => setItem('batches', i, { quantity: v })} /></Campo>
                                            <Campo label="Dañadas"><Num value={b.danadas} onChange={v => setItem('batches', i, { danadas: v })} /></Campo>
                                        </div>
                                        <label className="flex items-center gap-2 mt-2 text-xs text-slate-600">
                                            <input type="checkbox" checked={!!b.sinFecha} onChange={e => setItem('batches', i, { sinFecha: e.target.checked, expiryDate: e.target.checked ? '' : b.expiryDate })} />
                                            Sin fecha legible
                                        </label>
                                    </div>
                                );
                            })}
                            {!(f.batches || []).length && (
                                <Campo label="Total en anaquel sin lotes (ud)"><Num value={f.totalSinLotes} onChange={v => set('totalSinLotes', v)} /></Campo>
                            )}
                            <button type="button" onClick={() => set('batches', [...(f.batches || []), { expiryDate: '', quantity: '', danadas: '', sinFecha: false }])}
                                className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg border-2 border-dashed border-slate-300 text-slate-600 font-semibold text-sm">
                                <Plus size={16} /> Agregar lote
                            </button>
                        </>
                    )}
                    <p className="text-sm font-bold text-slate-800">Total en anaquel: {total} ud</p>
                </Seccion>

                <Seccion titulo="Entregas, retiro y PVP" icono={<Truck size={18} className="text-brand-blue" />}
                    nota="Lo que entró hoy al anaquel. «Lo que entró» es la suma de las facturas entregadas más lo que entró sin factura.">
                    {(f.entregas || []).map((e, i) => (
                        <div key={i} className="grid grid-cols-[1fr_6rem_auto] gap-2 items-end">
                            <Campo label={`Factura${e.fecha ? ` (${e.fecha})` : ''}`}>
                                <input type="text" value={e.numero} onChange={ev => setItem('entregas', i, { numero: ev.target.value })} className={inputCls} placeholder="INV-00…" />
                            </Campo>
                            <Campo label="Entregó"><Num value={e.unidadesEntregadas} onChange={v => setItem('entregas', i, { unidadesEntregadas: v })} /></Campo>
                            <button type="button" onClick={() => quitar('entregas', i)} className="text-red-500 p-2 mb-1"><X size={16} /></button>
                        </div>
                    ))}
                    <button type="button" onClick={() => set('entregas', [...(f.entregas || []), { numero: '', fecha: '', unidadesFactura: null, opcion: 'otra', unidadesEntregadas: '' }])}
                        className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg border-2 border-dashed border-slate-300 text-slate-600 font-semibold text-sm">
                        <Plus size={16} /> Agregar entrega con factura
                    </button>
                    <div className="grid grid-cols-2 gap-3">
                        <Campo label="Entró sin factura (ud)"><Num value={f.sinFactura} onChange={v => set('sinFactura', v)} /></Campo>
                        <Campo label="PVP (USD)"><Num decimal value={f.price} onChange={v => set('price', v)} placeholder="0,00" /></Campo>
                    </div>
                    <p className="text-sm font-bold text-slate-800">Lo que entró hoy: {entro} ud</p>

                    <div className="pt-2 border-t border-slate-100">
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <input type="checkbox" checked={!!f.retiro.activo} onChange={e => set('retiro', { ...f.retiro, activo: e.target.checked })} />
                            <Undo2 size={16} /> Retiró producto del anaquel
                        </label>
                        {f.retiro.activo && (
                            <div className="grid grid-cols-3 gap-2 mt-2">
                                <Campo label="Retiradas"><Num value={f.retiro.unidades} onChange={v => set('retiro', { ...f.retiro, unidades: v })} /></Campo>
                                <Campo label="Motivo">
                                    <select value={f.retiro.motivo} onChange={e => set('retiro', { ...f.retiro, motivo: e.target.value })} className={`${inputCls} px-2`}>
                                        {MOTIVOS_RETIRO.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                                    </select>
                                </Campo>
                                <Campo label="Repuso"><Num value={f.retiro.repuestas} onChange={v => set('retiro', { ...f.retiro, repuestas: v })} /></Campo>
                            </div>
                        )}
                    </div>
                </Seccion>

                <Seccion titulo="Ejecución en anaquel" icono={<BarChart2 size={18} className="text-brand-blue" />}>
                    <div className="grid grid-cols-2 gap-3">
                        <Campo label="Caras visibles"><Num value={f.facing} onChange={v => set('facing', v)} /></Campo>
                        <Campo label="Altura">
                            <select value={f.shelfLocation} onChange={e => set('shelfLocation', e.target.value)} className={inputCls}>
                                <option value="">—</option>
                                {ALTURAS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                            </select>
                        </Campo>
                        <Campo label="Categoría vecina">
                            <select value={f.adjacentCategory} onChange={e => set('adjacentCategory', e.target.value)} className={inputCls}>
                                <option value="">—</option>
                                {CATEGORIAS_VECINAS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                                {f.adjacentCategory && !CATEGORIAS_VECINAS.some(o => o.id === f.adjacentCategory) && <option value={f.adjacentCategory}>{f.adjacentCategory}</option>}
                            </select>
                        </Campo>
                        <Campo label="Material POP">
                            <select value={f.popStatus} onChange={e => set('popStatus', e.target.value)} className={inputCls}>
                                <option value="">—</option>
                                {ESTADOS_POP.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                            </select>
                        </Campo>
                    </div>
                </Seccion>

                <Seccion titulo="Competencia" icono={<Shield size={18} className="text-brand-blue" />}>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={!!f.sinCompetencia} onChange={e => set('sinCompetencia', e.target.checked)} />
                        No hay competencia en este anaquel
                    </label>
                    {(f.competition || []).map((c, i) => (
                        <div key={i} className="grid grid-cols-[1fr_6rem_auto] gap-2 items-end">
                            <div className="text-sm font-semibold text-slate-700 truncate pb-3">{c.product || `${c.brand} ${c.productName}`}</div>
                            <Campo label="Precio"><Num decimal value={c.price} onChange={v => setItem('competition', i, { price: v })} /></Campo>
                            <button type="button" onClick={() => quitar('competition', i)} className="text-red-500 p-2 mb-1"><X size={16} /></button>
                        </div>
                    ))}
                    <div className="p-3 bg-slate-50 rounded-lg border space-y-2">
                        <select value={comp.product} onChange={handleProductSelect} className={inputCls}>
                            <option value="">— Agregar un competidor —</option>
                            {competitorProducts.map(p => <option key={p.id} value={p.text}>{p.text}</option>)}
                        </select>
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                            <Num decimal value={comp.price} onChange={v => setComp({ ...comp, price: v })} placeholder="Precio" />
                            <button type="button" onClick={handleAddCompetitor} className="px-4 bg-slate-200 font-semibold rounded-lg text-sm">Agregar</button>
                        </div>
                    </div>
                    {(f.newEntrants || []).map((e, i) => (
                        <div key={i} className="flex justify-between items-center p-2 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg">
                            <span className="text-sm font-semibold flex-1 truncate">{e.brand} - {e.presentation}</span>
                            <button type="button" onClick={() => quitar('newEntrants', i)}><X size={16} className="text-red-500" /></button>
                        </div>
                    ))}
                    <button type="button" onClick={() => setIsEntrantModalOpen(true)} className="w-full bg-amber-100 text-amber-800 font-bold p-2.5 rounded-lg flex items-center justify-center gap-2 text-sm">
                        <Search size={16} /> Declarar nuevo entrante
                    </button>
                </Seccion>

                <Seccion titulo="Observaciones" icono={<Info size={18} className="text-brand-blue" />}>
                    <textarea value={f.notes} onChange={e => set('notes', e.target.value)} rows={3} className={inputCls} />
                </Seccion>

                {(report.edicionesMaster || []).length > 0 && (
                    <p className="text-xs text-slate-500">Editado {report.edicionesMaster.length} {report.edicionesMaster.length === 1 ? 'vez' : 'veces'} por el máster; el último cambio fue el {new Date(report.edicionesMaster[report.edicionesMaster.length - 1].at).toLocaleString('es-VE')}.</p>
                )}
            </div>

            {errores.length > 0 && (
                <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 space-y-1">
                    {errores.map((e, i) => <p key={i}>{e}</p>)}
                </div>
            )}
            {unicos.length > 0 && !errores.length && (
                <p className="mt-3 text-xs text-slate-600">Vas a cambiar: <b>{unicos.join(', ')}</b>.</p>
            )}

            <div className="flex flex-wrap justify-between items-center gap-3 pt-4 border-t mt-4">
                <button type="button" onClick={handleDelete} disabled={isProcessing}
                    className="bg-red-100 text-red-600 font-semibold px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
                    <Trash2 size={16} /> Eliminar reporte
                </button>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-lg">Cancelar</button>
                    <button type="button" onClick={handleSave} disabled={isProcessing}
                        className="bg-brand-blue text-white px-4 py-2 rounded-lg disabled:bg-slate-300 flex items-center gap-2">
                        {isProcessing && <LoadingSpinner size="sm" />}
                        {isProcessing ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                </div>
            </div>
            <NewEntrantModal isOpen={isEntrantModalOpen} onClose={() => setIsEntrantModalOpen(false)}
                onSave={(d) => { set('newEntrants', [...(f.newEntrants || []), d]); setIsEntrantModalOpen(false); }} />
        </>
    );
};

export default EditReportForm;
