// RUTA: src/Components/NuevaFacturaSheet.jsx
//
// FACTURAR DESDE GK: el vendedor emite una factura en Zoho Books sin tener
// acceso a Zoho. Elige cliente (solo los de SU cartera), productos y cantidades;
// el PRECIO lo pone el servidor según el canal del cliente (retail/foodservice),
// no el vendedor. Puede guardarla como borrador o emitirla.
//
// Las credenciales de Zoho nunca llegan al teléfono: la factura la crea la Cloud
// Function `crearFacturaZoho`, que además la sincroniza en GK con su atribución
// y comisión reusando la misma lógica de la conciliación.

import React, { useEffect, useMemo, useState } from 'react';
import { db, functions } from '@/Firebase/config.js';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
    X, Loader, Plus, Minus, FileText, Search, CheckCircle2, AlertTriangle, Trash2,
} from 'lucide-react';

const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function NuevaFacturaSheet({ vendedorId, onClose, onCreada }) {
    const [clientes, setClientes] = useState([]);
    const [items, setItems]       = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError]       = useState('');

    const [paso, setPaso]     = useState(1);        // 1 = cliente · 2 = productos
    const [busca, setBusca]   = useState('');
    const [cliente, setCliente] = useState(null);
    const [lineas, setLineas] = useState([]);       // [{ itemId, nombre, cantidad }]
    const [diasCredito, setDiasCredito] = useState(15);
    const [notas, setNotas]   = useState('');
    const [enviando, setEnviando] = useState(false);
    const [hecho, setHecho]   = useState(null);

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const [cSnap, iSnap] = await Promise.all([
                    getDocs(query(collection(db, 'clientes_zoho'), where('vendedorId', '==', vendedorId))),
                    getDocs(collection(db, 'zoho_items')),
                ]);
                if (!vivo) return;
                setClientes(cSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                    .filter(c => !c.esOficina)
                    .sort((a, b) => (a.customerName || '').localeCompare(b.customerName || '')));
                setItems(iSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                    .filter(i => i.activo !== false)
                    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')));
            } catch (e) {
                if (vivo) setError('No se pudo cargar. ' + (e?.message || ''));
            } finally {
                if (vivo) setCargando(false);
            }
        })();
        return () => { vivo = false; };
    }, [vendedorId]);

    const clientesFiltrados = useMemo(() => {
        const q = busca.trim().toLowerCase();
        if (!q) return clientes;
        return clientes.filter(c => (c.customerName || '').toLowerCase().includes(q));
    }, [clientes, busca]);

    const setCantidad = (itemId, delta) => {
        setLineas(prev => {
            const ex = prev.find(l => l.itemId === itemId);
            if (!ex) {
                const it = items.find(i => i.id === itemId);
                return delta > 0 ? [...prev, { itemId, nombre: it?.nombre || '', cantidad: delta }] : prev;
            }
            const nueva = ex.cantidad + delta;
            if (nueva <= 0) return prev.filter(l => l.itemId !== itemId);
            return prev.map(l => l.itemId === itemId ? { ...l, cantidad: nueva } : l);
        });
    };

    const totalUnidades = lineas.reduce((s, l) => s + l.cantidad, 0);

    const emitir = async (deseaEmitir) => {
        if (enviando || lineas.length === 0 || !cliente) return;
        setEnviando(true); setError('');
        try {
            const fn = httpsCallable(functions, 'crearFacturaZoho');
            const res = await fn({
                customerId: cliente.id,
                lineas: lineas.map(l => ({ itemId: l.itemId, cantidad: l.cantidad })),
                emitir: deseaEmitir,
                diasCredito: Number(diasCredito) || 0,
                notas: notas.trim(),
            });
            setHecho(res.data);
            onCreada?.(res.data);
        } catch (e) {
            setError(e?.message || 'No se pudo crear la factura.');
        } finally {
            setEnviando(false);
        }
    };

    // ── Confirmación ──
    if (hecho) {
        return (
            <>
                <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
                <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-slate-900 border-t border-slate-700 p-6 text-center">
                    <CheckCircle2 size={44} className="mx-auto text-emerald-400 mb-3" />
                    <p className="text-white font-black text-lg">
                        {hecho.estado === 'emitida' ? '¡Factura emitida!' : 'Borrador creado'}
                    </p>
                    <p className="text-slate-300 text-sm mt-1">
                        {hecho.numero ? `Nº ${hecho.numero} · ` : ''}{money(hecho.total)}
                    </p>
                    {!hecho.sincronizada && (
                        <p className="text-amber-400 text-xs mt-2">
                            Se creó en Zoho, pero aún no se reflejó en GK. Aparecerá con la próxima conciliación.
                        </p>
                    )}
                    <button onClick={onClose}
                        className="w-full mt-5 bg-emerald-600 text-white font-black py-3.5 rounded-xl">Listo</button>
                </div>
            </>
        );
    }

    return (
        <>
            <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
            <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-slate-900 border-t border-slate-700 shadow-2xl" style={{ maxHeight: '92vh' }}>
                <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-700" /></div>
                <div className="overflow-y-auto px-5 pb-8" style={{ maxHeight: 'calc(92vh - 20px)' }}>

                    <div className="flex items-start justify-between py-2 mb-3">
                        <div className="min-w-0">
                            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Nueva factura</p>
                            <p className="font-bold text-base text-white leading-tight">
                                {paso === 1 ? 'Elige el cliente' : cliente?.customerName}
                            </p>
                            {paso === 2 && (
                                <p className="text-xs text-slate-400">
                                    {cliente?.categoria === 'foodservice' ? 'Foodservice' : 'Retail'} · precio según canal
                                </p>
                            )}
                        </div>
                        <button onClick={onClose} className="p-1 text-slate-400"><X size={18} /></button>
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 text-sm rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 px-3 py-2 mb-3">
                            <AlertTriangle size={15} className="shrink-0 mt-0.5" /> <span>{error}</span>
                        </div>
                    )}

                    {cargando ? (
                        <div className="py-16 flex justify-center"><Loader size={24} className="animate-spin text-emerald-400" /></div>
                    ) : paso === 1 ? (
                        <>
                            {clientes.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-10">
                                    No tienes clientes asignados con carnet de Zoho. Pídele al administrador que
                                    vincule tu cartera.
                                </p>
                            ) : (
                                <>
                                    <div className="relative mb-3">
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                        <input value={busca} onChange={e => setBusca(e.target.value)}
                                            placeholder="Buscar cliente…"
                                            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                                    </div>
                                    <div className="space-y-2">
                                        {clientesFiltrados.map(c => (
                                            <button key={c.id} onClick={() => { setCliente(c); setPaso(2); }}
                                                className="w-full text-left px-3 py-3 rounded-xl bg-slate-800/60 border border-slate-700">
                                                <p className="text-sm font-semibold text-white leading-snug">{c.customerName}</p>
                                                <p className="text-xs text-slate-400">
                                                    {c.categoria === 'foodservice' ? 'Foodservice' : 'Retail'}
                                                    {c.facturas ? ` · ${c.facturas} facturas` : ''}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        <>
                            {items.length === 0 ? (
                                <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-3">
                                    El catálogo de productos aún no se ha sincronizado desde Zoho. Pídele al
                                    administrador que lo actualice en Integraciones.
                                </p>
                            ) : (
                                <div className="space-y-2 mb-4">
                                    {items.map(it => {
                                        const linea = lineas.find(l => l.itemId === it.id);
                                        const cant = linea?.cantidad || 0;
                                        return (
                                            <div key={it.id} className={`rounded-xl px-3 py-2.5 border ${cant > 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-800/60 border-slate-700'}`}>
                                                <p className="text-sm font-semibold text-white leading-snug">{it.nombre}</p>
                                                {it.sku && <p className="text-[11px] text-slate-500">{it.sku}</p>}
                                                <div className="flex items-center justify-end gap-2 mt-2">
                                                    <button onClick={() => setCantidad(it.id, -1)} disabled={cant === 0}
                                                        className="w-10 h-10 rounded-lg bg-slate-800 text-slate-200 flex items-center justify-center disabled:opacity-30">
                                                        <Minus size={16} />
                                                    </button>
                                                    <span className="w-12 text-center text-lg font-black text-white tabular-nums">{cant}</span>
                                                    <button onClick={() => setCantidad(it.id, 1)}
                                                        className="w-10 h-10 rounded-lg bg-slate-800 text-slate-200 flex items-center justify-center">
                                                        <Plus size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold text-slate-300 mb-1">Días de crédito</p>
                                    <input type="number" min="0" value={diasCredito}
                                        onChange={e => setDiasCredito(e.target.value)}
                                        className="block w-full min-w-0 px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold text-slate-300 mb-1">Unidades</p>
                                    <div className="px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-lg font-black tabular-nums">
                                        {totalUnidades}
                                    </div>
                                </div>
                            </div>

                            <textarea value={notas} onChange={e => setNotas(e.target.value)}
                                placeholder="Notas para la factura (opcional)" rows={2}
                                className="w-full rounded-xl px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none resize-none mb-4" />

                            <div className="flex gap-2">
                                <button onClick={() => emitir(false)} disabled={enviando || lineas.length === 0}
                                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm bg-slate-800 text-slate-200 disabled:opacity-40">
                                    {enviando ? <Loader size={16} className="animate-spin" /> : <FileText size={16} />}
                                    Guardar borrador
                                </button>
                                <button onClick={() => emitir(true)} disabled={enviando || lineas.length === 0}
                                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm bg-emerald-600 text-white disabled:opacity-40">
                                    {enviando ? <Loader size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                    Emitir factura
                                </button>
                            </div>
                            <button onClick={() => { setPaso(1); setLineas([]); }}
                                className="w-full mt-2 text-xs font-semibold text-slate-400 py-2">
                                ← Cambiar de cliente
                            </button>
                            <p className="text-[11px] text-slate-500 text-center mt-1">
                                El precio lo aplica el sistema según el canal del cliente. La numeración la asigna Zoho.
                            </p>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
