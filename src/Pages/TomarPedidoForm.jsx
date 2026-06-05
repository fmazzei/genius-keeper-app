// RUTA: src/Pages/TomarPedidoForm.jsx

import React, { useState, useMemo } from 'react';
import { db, functions } from '@/Firebase/config.js';
import { httpsCallable } from 'firebase/functions';
import {
    collection, addDoc, getDocs, query, where, serverTimestamp,
} from 'firebase/firestore';
import { ClipboardList, ChevronLeft, CheckCircle, RefreshCw, Bell } from 'lucide-react';
import NumericKeypadModal from '@/Components/NumericKeypadModal.jsx';

// Lookup which vendedor covers a given pos in vendor_clients
async function findVendedorForPos(pos) {
    if (!pos?.id) return null;

    // 1. Direct posId match (directo PDV or chain head)
    const directSnap = await getDocs(
        query(collection(db, 'vendor_clients'),
            where('posId', '==', pos.id),
            where('estado', '==', 'activo'),
            where('active', '==', true),
        )
    );
    if (!directSnap.empty) {
        const d = directSnap.docs[0].data();
        return { vendedorId: d.vendedorId, vendedorName: d.vendedorName };
    }

    // 2. Chain lookup for branch PDVs (centralizado)
    if (pos.chain && pos.chain !== 'Automercados Individuales') {
        const chainSnap = await getDocs(
            query(collection(db, 'vendor_clients'),
                where('chain', '==', pos.chain),
                where('tipoDespacho', '==', 'centralizado'),
                where('estado', '==', 'activo'),
                where('active', '==', true),
            )
        );
        if (!chainSnap.empty) {
            const d = chainSnap.docs[0].data();
            return { vendedorId: d.vendedorId, vendedorName: d.vendedorName };
        }
    }

    return null;
}

const TomarPedidoForm = ({ posList = [], selectedReporter, onBack }) => {
    const [posId, setPosId]         = useState('');
    const [cantidad, setCantidad]   = useState('');
    const [sending, setSending]     = useState(false);
    const [sentMode, setSentMode]   = useState(null); // 'vendedor' | 'email'
    const [error, setError]         = useState('');
    const [isNumpadOpen, setNumpadOpen] = useState(false);

    const sortedPosList = useMemo(
        () => [...posList].sort((a, b) => a.name.localeCompare(b.name)),
        [posList],
    );

    const selectedPos = posList.find(p => p.id === posId);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!posId || !cantidad) return;
        setSending(true);
        setError('');
        try {
            // Try to find the vendedor responsible for this PDV
            const vendedor = await findVendedorForPos(selectedPos);

            if (vendedor?.vendedorId) {
                // New flow: save to Firestore + create alert for the vendedor
                const pedidoRef = await addDoc(collection(db, 'pedidos_mercaderista'), {
                    posId,
                    posName:          selectedPos?.name  || '',
                    posZone:          selectedPos?.zone  || '',
                    chain:            selectedPos?.chain || '',
                    cantidad:         Number(cantidad),
                    cantidadFinal:    Number(cantidad),
                    mercaderistaId:   selectedReporter?.id   || '',
                    mercaderistaName: selectedReporter?.name || '',
                    vendedorId:       vendedor.vendedorId,
                    vendedorName:     vendedor.vendedorName,
                    estado:           'pendiente',
                    notas:            '',
                    createdAt:        serverTimestamp(),
                });

                await addDoc(collection(db, 'vendedor_alertas'), {
                    uid:       vendedor.vendedorId,
                    alertType: 'pedido_mercaderista',
                    title:     `Pedido en ${selectedPos?.name || ''}`,
                    body:      `${selectedReporter?.name || 'Mercaderista'} tomó un pedido de ${cantidad} docena${Number(cantidad) !== 1 ? 's' : ''}.`,
                    pedidoId:  pedidoRef.id,
                    createdAt: serverTimestamp(),
                });

                setSentMode('vendedor');
            } else {
                // Fallback: PDV has no assigned vendedor → send email directly
                const fn = httpsCallable(functions, 'sendPedidoEmail');
                await fn({
                    posId,
                    posName:      selectedPos?.name  || '',
                    chain:        selectedPos?.chain || '',
                    cantidad:     Number(cantidad),
                    reporterId:   selectedReporter?.id   || '',
                    reporterName: selectedReporter?.name || '',
                });
                setSentMode('email');
            }
        } catch (err) {
            console.error('Error enviando pedido:', err);
            setError(err.message || 'No se pudo enviar el pedido. Intenta de nuevo.');
        } finally {
            setSending(false);
        }
    };

    if (sentMode) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
                {sentMode === 'vendedor'
                    ? <Bell size={72} className="text-emerald-500" />
                    : <CheckCircle size={72} className="text-emerald-500" />
                }
                <h3 className="text-2xl font-bold text-slate-800">¡Pedido Registrado!</h3>
                <p className="text-slate-500">
                    {sentMode === 'vendedor'
                        ? <>Se notificó al vendedor asignado sobre el pedido de{' '}
                            <strong>{cantidad} {Number(cantidad) === 1 ? 'docena' : 'docenas'}</strong> en{' '}
                            <strong>{selectedPos?.name}</strong>.
                            El vendedor lo confirmará antes de enviarlo a ventas.</>
                        : <>Se notificó a ventas sobre el pedido de{' '}
                            <strong>{cantidad} {Number(cantidad) === 1 ? 'docena' : 'docenas'}</strong> en{' '}
                            <strong>{selectedPos?.name}</strong>.</>
                    }
                </p>
                {sentMode === 'email' && (
                    <p className="text-xs text-slate-400 bg-slate-50 border rounded-lg px-3 py-2">
                        Este PDV no tiene vendedor asignado — el pedido fue enviado directamente a ventas.
                    </p>
                )}
                <button
                    onClick={() => { setSentMode(null); setPosId(''); setCantidad(''); }}
                    className="mt-2 bg-emerald-600 text-white font-bold py-3 px-8 rounded-xl"
                >
                    Tomar otro pedido
                </button>
                <button onClick={onBack} className="text-slate-500 font-medium">
                    Volver al inicio
                </button>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-lg mx-auto w-full">
            <button onClick={onBack} className="flex items-center gap-1 text-slate-500 hover:text-emerald-600 mb-6 font-medium">
                <ChevronLeft size={20} /> Volver
            </button>

            <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <ClipboardList size={24} className="text-emerald-700" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Tomar Pedido</h2>
                    <p className="text-slate-500 text-sm">Pedido verbal recibido en el establecimiento</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">

                {/* Cliente */}
                <div className="bg-white rounded-xl shadow p-4 border border-slate-100">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 block">
                        Cliente <span className="text-red-500">*</span>
                    </label>
                    <select
                        value={posId}
                        onChange={e => setPosId(e.target.value)}
                        required
                        className="w-full p-3 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 text-base"
                    >
                        <option value="">Seleccionar establecimiento...</option>
                        {sortedPosList.map(pos => (
                            <option key={pos.id} value={pos.id}>{pos.name}</option>
                        ))}
                    </select>
                </div>

                {/* Cantidad (docenas) */}
                <div className="bg-white rounded-xl shadow p-4 border border-slate-100">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                        Cantidad <span className="text-slate-400 font-normal normal-case">(docenas)</span>{' '}
                        <span className="text-red-500">*</span>
                    </p>
                    <button
                        type="button"
                        onClick={() => setNumpadOpen(true)}
                        className={`w-full py-5 rounded-xl text-center transition-colors ${
                            cantidad
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 text-slate-400 border-2 border-dashed border-slate-300'
                        }`}
                    >
                        {cantidad ? (
                            <span className="text-4xl font-black">
                                {cantidad} <span className="text-xl font-semibold opacity-80">{Number(cantidad) === 1 ? 'docena' : 'docenas'}</span>
                            </span>
                        ) : (
                            <span className="text-lg font-semibold">Toca para ingresar cantidad</span>
                        )}
                    </button>
                </div>

                {error && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 font-medium">
                        {error}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={sending || !posId || !cantidad}
                    className="w-full bg-emerald-600 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:bg-emerald-700"
                >
                    {sending
                        ? <><RefreshCw size={20} className="animate-spin" /> Registrando...</>
                        : 'Registrar Pedido'}
                </button>

                <p className="text-xs text-center text-slate-400">
                    El pedido se notificará al vendedor asignado para su confirmación.
                </p>
            </form>

            <NumericKeypadModal
                isOpen={isNumpadOpen}
                onClose={() => setNumpadOpen(false)}
                onConfirm={(val) => { setCantidad(val); setNumpadOpen(false); }}
                title="Docenas pedidas"
            />
        </div>
    );
};

export default TomarPedidoForm;
