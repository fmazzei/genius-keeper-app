// RUTA: src/Components/RecepcionFrimacaSheet.jsx
//
// Flujo guiado de 2 pasos para recibir un despacho de planta (Barinas) en
// Caracas y entregarlo en el almacén Frimaca. Es la vía AUTORITATIVA por la que
// la mercancía entra a `inventario_comercial` (Frimaca) — sustituye al viejo
// botón "Recibido" y evita el doble conteo con Kroma.
//
//  Paso 1 — Recepción (Quinta Crespo): la persona que recibe el camión da fe de
//           la CANTIDAD recibida por línea y del ESTADO (envases sanos y limpios
//           o "reportar novedad" con nota + foto).
//  Paso 2 — Entrega en Frimaca: adjunta la FOTO de la planilla de recibo de
//           Frimaca y confirma. Al guardar: carga el inventario (desde lo
//           RECIBIDO), escribe el libro de movimientos y el acta con fotos, y
//           cierra el despacho como `recibido_caracas`.

import React, { useState, useMemo } from 'react';
import { db } from '@/Firebase/config.js';
import {
    collection, doc, addDoc, updateDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import {
    X, Truck, Package, CheckCircle, AlertTriangle, Camera, Loader, ChevronRight, ArrowLeft, Minus, Plus,
} from 'lucide-react';
import { fileToCompactDataURL } from '@/utils/imageCapture.js';

const THEME = {
    light: {
        sheet: 'bg-white', handle: 'bg-slate-200', title: 'text-slate-800', meta: 'text-slate-400',
        close: 'text-slate-400 hover:text-slate-700', card: 'bg-slate-50 border border-slate-200',
        label: 'text-slate-600', select: 'border border-slate-300 bg-white text-slate-800 focus:ring-brand-blue',
        stepBtn: 'bg-slate-100 text-slate-700', input: 'border-2 border-slate-200 text-slate-800 bg-white focus:border-brand-blue',
        okOn: 'bg-emerald-600 text-white', okOff: 'bg-slate-100 text-slate-500',
        novOn: 'bg-amber-500 text-white', novOff: 'bg-slate-100 text-slate-500',
        textarea: 'bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:border-brand-blue',
        primary: 'bg-brand-blue text-white', save: 'bg-brand-yellow text-black',
        photo: 'border-2 border-dashed border-slate-300 text-slate-500', stepDot: 'bg-brand-blue', stepDotOff: 'bg-slate-200',
    },
    dark: {
        sheet: 'bg-slate-900 border-t border-slate-700', handle: 'bg-slate-700', title: 'text-white', meta: 'text-slate-400',
        close: 'text-slate-400 hover:text-slate-200', card: 'bg-slate-800/60 border border-slate-700',
        label: 'text-slate-300', select: 'border border-slate-700 bg-slate-800 text-white focus:ring-emerald-500',
        stepBtn: 'bg-slate-800 text-slate-200', input: 'border-2 border-slate-700 text-white bg-slate-800 focus:border-emerald-500',
        okOn: 'bg-emerald-600 text-white', okOff: 'bg-slate-800 text-slate-400',
        novOn: 'bg-amber-500 text-white', novOff: 'bg-slate-800 text-slate-400',
        textarea: 'bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:border-emerald-500',
        primary: 'bg-emerald-600 text-white', save: 'bg-emerald-600 hover:bg-emerald-500 text-white',
        photo: 'border-2 border-dashed border-slate-600 text-slate-400', stepDot: 'bg-emerald-500', stepDotOff: 'bg-slate-700',
    },
};

const norm = (s) => (s || '').trim().toLowerCase();

export default function RecepcionFrimacaSheet({ despacho, almacenes = [], inventario = [], actor, theme = 'light', onClose, onDone }) {
    const t = THEME[theme] || THEME.light;
    const lineas = useMemo(() => despacho?.lineas || [], [despacho]);

    // Almacén Frimaca por defecto: el que contiene "frimaca" o "caracas", o el primero.
    const defAlmacen = useMemo(() => {
        const byName = almacenes.find(a => /frimaca|caracas/i.test(a.nombre || ''));
        return (byName || almacenes[0])?.id || '';
    }, [almacenes]);

    const [paso, setPaso]         = useState(1);
    const [almacenId, setAlmacenId] = useState(defAlmacen);
    const [rows, setRows]         = useState(() => lineas.map(l => ({
        cantidadRecibida: Number(l.cantidad) || 0,
        estadoOk: true,
        novedad: '',
        novedadFoto: null,
    })));
    const [planillaFoto, setPlanillaFoto] = useState(null);
    const [notas, setNotas]       = useState('');
    const [busyFoto, setBusyFoto] = useState(false);
    const [saving, setSaving]     = useState(false);
    const [error, setError]       = useState('');

    const almacen = almacenes.find(a => a.id === almacenId);
    const setRow = (i, patch) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));

    const capturaFoto = async (file, apply) => {
        if (!file) return;
        setBusyFoto(true);
        try { apply(await fileToCompactDataURL(file)); }
        catch { setError('No se pudo procesar la foto. Intenta otra vez.'); }
        finally { setBusyFoto(false); }
    };

    const guardar = async () => {
        if (saving) return;
        if (!almacen) { setError('Elige el almacén Frimaca de destino.'); setPaso(1); return; }
        if (!planillaFoto) { setError('Adjunta la foto de la planilla de Frimaca.'); return; }
        setSaving(true); setError('');
        try {
            const actorLabel = { id: actor?.id || '', nombre: actor?.nombre || '', role: actor?.role || '' };
            const yaAplicado = despacho.inventarioAplicado === true;

            // 1) Cargar inventario (desde lo RECIBIDO) + libro de movimientos.
            if (!yaAplicado) {
                for (let i = 0; i < lineas.length; i++) {
                    const l = lineas[i];
                    const recibida = Number(rows[i]?.cantidadRecibida) || 0;
                    if (recibida <= 0) continue;
                    const lote = l.lote || '';
                    const venc = l.fechaVencimiento || '';
                    // Solo se suma a un lote VIGENTE. Un lote CERRADO (0 unidades)
                    // se queda cerrado: mercancía nueva abre un registro nuevo,
                    // así el histórico y su pista no se "reabren".
                    const existing = inventario.find(inv =>
                        inv.almacenId === almacenId &&
                        norm(inv.productoNombre) === norm(l.productoNombre) &&
                        (inv.lote || '') === lote &&
                        (inv.fechaVencimiento || '') === venc &&
                        (Number(inv.unidades) || 0) > 0
                    );
                    const antes = existing ? (existing.unidades || 0) : 0;
                    const despues = antes + recibida;
                    if (existing) {
                        await updateDoc(doc(db, 'inventario_comercial', existing.id), {
                            unidades: despues, updatedAt: serverTimestamp(), updatedBy: actorLabel,
                        });
                    } else {
                        await addDoc(collection(db, 'inventario_comercial'), {
                            almacenId, almacenNombre: almacen.nombre,
                            productoNombre: l.productoNombre, presentacion: l.presentacion || '',
                            tipo: l.tipo || 'empacado', unit: l.unit || 'ud',
                            lote, fechaVencimiento: venc, unidades: despues,
                            origenDespachoId: despacho.id, updatedAt: serverTimestamp(), updatedBy: actorLabel,
                        });
                    }
                    await addDoc(collection(db, 'inventario_movimientos'), {
                        almacenId, almacenNombre: almacen.nombre,
                        productoNombre: l.productoNombre, presentacion: l.presentacion || '',
                        lote, fechaVencimiento: venc,
                        tipo: 'entrada_recepcion', cantidad: recibida,
                        unidadesAntes: antes, unidadesDespues: despues,
                        ref: { despachoId: despacho.id },
                        actorId: actorLabel.id, actorNombre: actorLabel.nombre, actorRole: actorLabel.role,
                        nota: rows[i]?.estadoOk ? '' : (rows[i]?.novedad || 'novedad'),
                        createdAt: serverTimestamp(),
                    });
                }
            }

            // 2) Acta de recepción con fotos (doc aparte para no inflar el despacho).
            const conNovedad = rows.some(r => !r.estadoOk);
            await setDoc(doc(db, 'recepciones_frimaca', despacho.id), {
                despachoId: despacho.id,
                recibidoPor: actorLabel, recibidoAt: serverTimestamp(),
                almacenId, almacenNombre: almacen.nombre,
                lineasRecibidas: lineas.map((l, i) => ({
                    productoNombre: l.productoNombre, presentacion: l.presentacion || '',
                    lote: l.lote || '', fechaVencimiento: l.fechaVencimiento || '',
                    unit: l.unit || 'ud',
                    cantidadEnviada: Number(l.cantidad) || 0,
                    cantidadRecibida: Number(rows[i]?.cantidadRecibida) || 0,
                    estadoOk: rows[i]?.estadoOk !== false,
                    novedad: rows[i]?.estadoOk ? '' : (rows[i]?.novedad || ''),
                    novedadFoto: rows[i]?.estadoOk ? null : (rows[i]?.novedadFoto || null),
                })),
                conNovedad, planillaFoto, notas: notas.trim(),
                createdAt: serverTimestamp(),
            });

            // 3) Cerrar el despacho.
            await updateDoc(doc(db, 'kroma_despachos', despacho.id), {
                estado: 'recibido_caracas',
                recibidoCaracas: true,
                recibidoPor: actorLabel,
                recibidoEnGKAt: serverTimestamp(),
                almacenComercialId: almacenId,
                almacenComercialNombre: almacen.nombre,
                conNovedad,
                inventarioAplicado: true,
            });

            onDone?.();
            onClose?.();
        } catch (e) {
            setError('No se pudo guardar la recepción. ' + (e?.message || ''));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
            <div className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl shadow-2xl ${t.sheet}`} style={{ maxHeight: '92vh' }}>
                <div className="flex justify-center pt-3 pb-1"><div className={`w-10 h-1 rounded-full ${t.handle}`} /></div>
                <div className="overflow-y-auto px-5 pb-8" style={{ maxHeight: 'calc(92vh - 20px)' }}>

                    {/* Header + pasos */}
                    <div className="flex items-start justify-between py-2 mb-2">
                        <div className="flex items-center gap-2">
                            {paso === 2 && (
                                <button onClick={() => setPaso(1)} className={`p-1 ${t.close}`}><ArrowLeft size={18} /></button>
                            )}
                            <div>
                                <p className={`font-bold text-base ${t.title}`}>{paso === 1 ? 'Recepción del camión' : 'Entrega en Frimaca'}</p>
                                <p className={`text-xs ${t.meta}`}>{paso === 1 ? 'Da fe de lo que recibiste' : 'Adjunta la planilla de recibo'}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className={`p-1 ${t.close}`}><X size={18} /></button>
                    </div>
                    <div className="flex items-center gap-1.5 mb-4">
                        <span className={`h-1.5 flex-1 rounded-full ${t.stepDot}`} />
                        <span className={`h-1.5 flex-1 rounded-full ${paso === 2 ? t.stepDot : t.stepDotOff}`} />
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 text-sm rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 px-3 py-2 mb-3">
                            <AlertTriangle size={15} className="shrink-0 mt-0.5" /> <span>{error}</span>
                        </div>
                    )}

                    {/* ── Paso 1: Recepción ── */}
                    {paso === 1 && (
                        <div className="space-y-3">
                            <div>
                                <p className={`text-xs font-semibold mb-1 ${t.label}`}>Almacén Frimaca de destino</p>
                                <select value={almacenId} onChange={e => setAlmacenId(e.target.value)}
                                    className={`w-full p-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 ${t.select}`}>
                                    {almacenes.length === 0 && <option value="">Crea un almacén primero</option>}
                                    {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                                </select>
                            </div>

                            {lineas.map((l, i) => {
                                const r = rows[i] || {};
                                return (
                                    <div key={i} className={`rounded-xl p-3 ${t.card}`}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <Package size={15} className={t.meta} />
                                            <div className="min-w-0 flex-1">
                                                <p className={`text-sm font-semibold truncate ${t.title}`}>{l.productoNombre}</p>
                                                <p className={`text-xs ${t.meta}`}>
                                                    Enviado: {l.cantidad} {l.unit || 'ud'}
                                                    {l.lote && ` · Lote ${l.lote}`}
                                                    {l.fechaVencimiento && ` · Vence ${l.fechaVencimiento}`}
                                                </p>
                                            </div>
                                        </div>
                                        {/* Cantidad recibida */}
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`text-xs font-semibold ${t.label}`}>Recibido:</span>
                                            <button onClick={() => setRow(i, { cantidadRecibida: Math.max(0, (r.cantidadRecibida || 0) - 1) })}
                                                className={`w-9 h-9 rounded-lg flex items-center justify-center ${t.stepBtn}`}><Minus size={15} /></button>
                                            <input type="number" inputMode="numeric" value={r.cantidadRecibida}
                                                onChange={e => setRow(i, { cantidadRecibida: Math.max(0, parseInt(e.target.value) || 0) })}
                                                className={`w-20 text-center text-xl font-black rounded-lg py-1 focus:outline-none ${t.input}`} />
                                            <button onClick={() => setRow(i, { cantidadRecibida: (r.cantidadRecibida || 0) + 1 })}
                                                className={`w-9 h-9 rounded-lg flex items-center justify-center ${t.stepBtn}`}><Plus size={15} /></button>
                                            <span className={`text-xs ${t.meta}`}>{l.unit || 'ud'}</span>
                                        </div>
                                        {/* Estado */}
                                        <div className="flex gap-2">
                                            <button onClick={() => setRow(i, { estadoOk: true })}
                                                className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 ${r.estadoOk ? t.okOn : t.okOff}`}>
                                                <CheckCircle size={13} /> Sanos y limpios
                                            </button>
                                            <button onClick={() => setRow(i, { estadoOk: false })}
                                                className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 ${!r.estadoOk ? t.novOn : t.novOff}`}>
                                                <AlertTriangle size={13} /> Reportar novedad
                                            </button>
                                        </div>
                                        {!r.estadoOk && (
                                            <div className="mt-2 space-y-2">
                                                <textarea value={r.novedad} onChange={e => setRow(i, { novedad: e.target.value })}
                                                    placeholder="¿Qué novedad? (envases rotos, faltante, sucio…)" rows={2}
                                                    className={`w-full rounded-lg px-3 py-2 text-sm focus:outline-none resize-none ${t.textarea}`} />
                                                <label className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold cursor-pointer ${t.photo}`}>
                                                    <Camera size={14} /> {r.novedadFoto ? 'Foto adjunta ✓ (cambiar)' : 'Adjuntar foto (opcional)'}
                                                    <input type="file" accept="image/*" capture="environment" className="hidden"
                                                        onChange={e => capturaFoto(e.target.files?.[0], (d) => setRow(i, { novedadFoto: d }))} />
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            <button onClick={() => { setError(''); if (!almacenId) { setError('Elige el almacén de destino.'); return; } setPaso(2); }}
                                className={`w-full font-black py-3.5 rounded-xl text-base flex items-center justify-center gap-2 ${t.primary}`}>
                                Siguiente: entrega en Frimaca <ChevronRight size={18} />
                            </button>
                        </div>
                    )}

                    {/* ── Paso 2: Frimaca ── */}
                    {paso === 2 && (
                        <div className="space-y-3">
                            <div className={`rounded-xl p-3 ${t.card}`}>
                                <p className={`text-xs ${t.meta} mb-1`}>Entregando en</p>
                                <p className={`font-bold ${t.title}`}>{almacen?.nombre}</p>
                                <p className={`text-xs ${t.meta} mt-1`}>{lineas.length} producto(s) · das fe de la entrega bajo tu responsabilidad.</p>
                            </div>

                            <label className={`flex flex-col items-center justify-center gap-2 rounded-xl py-8 text-sm font-semibold cursor-pointer ${t.photo}`}>
                                {busyFoto ? <Loader size={22} className="animate-spin" /> : <Camera size={26} />}
                                {planillaFoto ? 'Planilla adjunta ✓ (cambiar)' : 'Foto de la planilla de Frimaca'}
                                <input type="file" accept="image/*" capture="environment" className="hidden"
                                    onChange={e => capturaFoto(e.target.files?.[0], setPlanillaFoto)} />
                            </label>
                            {planillaFoto && (
                                <img src={planillaFoto} alt="Planilla Frimaca" className="w-full max-h-56 object-contain rounded-xl border border-slate-300/40" />
                            )}

                            <textarea value={notas} onChange={e => setNotas(e.target.value)}
                                placeholder="Notas de la entrega (opcional)" rows={2}
                                className={`w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none ${t.textarea}`} />

                            <button onClick={guardar} disabled={saving || busyFoto || !planillaFoto}
                                className={`w-full font-black py-4 rounded-xl text-base disabled:opacity-50 flex items-center justify-center gap-2 ${t.save}`}>
                                {saving ? <Loader size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                                {saving ? 'Guardando…' : 'Confirmar recepción y entrega'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
