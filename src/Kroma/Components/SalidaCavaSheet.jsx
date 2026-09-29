// RUTA: src/Kroma/Components/SalidaCavaSheet.jsx
//
// "Salida de cava" — lo primero que pregunta es QUÉ tipo de salida es, porque
// eso decide si el producto sigue siendo de la empresa:
//   · Venta a un cliente  → sale del inventario y queda "por facturar".
//   · Transferencia       → sigue siendo nuestro, solo cambia de lugar (abre el
//                           "Mover producto" de siempre: despacho a Caracas o
//                           traslado dentro de la planta).
//   · Otra salida         → sale sin venta, con motivo obligatorio.
// La lógica (transacción, libro de movimientos) vive en `salidasCava.js`.
//
// Quien registra aquí NO ve precios: la venta lleva cliente, lote y cantidad.
// El precio lo pone administración al facturar (Despachos → Ventas en planta).

import React, { useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/Firebase/config.js';
import { X, ShoppingBag, ArrowRight, AlertTriangle, Loader, Search, Plus, Trash2, CheckCircle2, RefreshCw } from 'lucide-react';
import { useKroma } from '../KromaContext';
import CampoFecha, { hoyInput } from './CampoFecha.jsx';
import Lote from './Lote.jsx';
import { etiquetaPeso } from '@/Kroma/inventarioPT.js';
import { fmtVence } from '@/utils/fechaCorta.js';
import { MOTIVOS_SALIDA, MOTIVOS_REPOSICION, disponible, registrarSalidaCava } from '@/Kroma/salidasCava.js';

const granel = (i) => i?.tipo === 'sin_envasar';
const presLabel = (i) => granel(i) ? 'Granel' : (etiquetaPeso(i?.pesoPorUnidad) || i?.presentacion || '—');
const fmtDisp = (i) => granel(i) ? `${String(+disponible(i).toFixed(3)).replace('.', ',')} kg` : `${disponible(i)} ud`;
const TONO = {
    emerald: { borde: 'hover:border-emerald-500/70', fondo: 'bg-emerald-500/15', icono: 'text-emerald-400' },
    sky:     { borde: 'hover:border-sky-500/70',     fondo: 'bg-sky-500/15',     icono: 'text-sky-400' },
    amber:   { borde: 'hover:border-amber-500/70',   fondo: 'bg-amber-500/15',   icono: 'text-amber-400' },
    violet:  { borde: 'hover:border-violet-500/70',  fondo: 'bg-violet-500/15',  icono: 'text-violet-400' },
};
const aNum = (s) => { const n = parseFloat(String(s).replace(',', '.')); return Number.isFinite(n) ? n : 0; };

function Cliente({ onElegir }) {
    const [lista, setLista] = useState(null);
    const [error, setError] = useState('');
    const [q, setQ] = useState('');
    const cargar = () => {
        setError(''); setLista(null);
        httpsCallable(functions, 'ventasPlanta', { timeout: 60000 })({ accion: 'catalogo' })
            .then(r => setLista(r.data.clientes || []))
            .catch(e => setError(e?.message || 'No se pudo cargar la lista de clientes.'));
    };
    useEffect(cargar, []);
    const filtrados = useMemo(() => {
        const t = q.trim().toLowerCase();
        return (lista || []).filter(c => !t || c.customerName.toLowerCase().includes(t)).slice(0, 12);
    }, [lista, q]);

    if (error) return (
        <div className="bg-rose-900/20 border border-rose-700/40 rounded-xl p-3 text-rose-300 text-sm">
            {error} <button onClick={cargar} className="underline font-semibold ml-1">Reintentar</button>
        </div>
    );
    if (!lista) return <div className="flex items-center gap-2 text-slate-400 text-sm py-3"><Loader size={16} className="animate-spin" /> Cargando clientes de Zoho…</div>;
    return (
        <div>
            <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Busca el cliente…"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
            </div>
            <div className="mt-2 max-h-56 overflow-y-auto space-y-1">
                {filtrados.map(c => (
                    <button key={c.customerId} type="button" onClick={() => onElegir(c)}
                        className="w-full text-left px-3 py-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-800 hover:border-emerald-600/60">
                        <p className="text-white text-sm font-medium">{c.customerName}</p>
                    </button>
                ))}
                {filtrados.length === 0 && (
                    <p className="text-slate-500 text-xs py-2">
                        Ningún cliente con ese nombre. El cliente tiene que existir en Zoho; los nuevos aparecen tras la próxima conciliación.
                    </p>
                )}
            </div>
        </div>
    );
}

export default function SalidaCavaSheet({ items = [], itemInicial = null, tipoInicial = null, nombreAlmacen, onTransferir, onClose, onDone }) {
    const { kromaUser } = useKroma();
    const conStock = useMemo(() => items.filter(i => disponible(i) > 0 && i.active !== false), [items]);
    const [tipo, setTipo] = useState(tipoInicial);          // venta | salida
    const [cliente, setCliente] = useState(null);
    const [motivo, setMotivo] = useState('');
    const [nota, setNota] = useState('');
    const [devueltas, setDevueltas] = useState('');
    const [fecha, setFecha] = useState(() => hoyInput());
    const [lineas, setLineas] = useState(() => itemInicial ? [{ id: itemInicial.id, cant: granel(itemInicial) ? '' : '1' }] : []);
    const [agregar, setAgregar] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [hecho, setHecho] = useState(null);

    const itemDe = (id) => conStock.find(i => i.id === id) || items.find(i => i.id === id);
    const usados = new Set(lineas.map(l => l.id));
    const libres = conStock.filter(i => !usados.has(i.id));

    const problemas = lineas.map(l => {
        const it = itemDe(l.id); const n = aNum(l.cant);
        if (!it) return 'ya no está';
        if (!(n > 0)) return 'falta la cantidad';
        if (!granel(it) && !Number.isInteger(n)) return 'unidades enteras';
        if (n > disponible(it) + 0.0005) return `solo hay ${fmtDisp(it)}`;
        return null;
    });
    const listo = lineas.length > 0 && problemas.every(p => !p)
        && (tipo === 'venta' ? !!cliente
            : tipo === 'reposicion' ? (!!cliente && MOTIVOS_REPOSICION.some(m => m.key === motivo) && parseInt(devueltas, 10) > 0)
            : (MOTIVOS_SALIDA.some(m => m.key === motivo) && (motivo !== 'otro' || nota.trim())));

    const guardar = async () => {
        if (!listo || saving) return;
        setSaving(true); setError('');
        try {
            const r = await registrarSalidaCava(db, {
                tipo, cliente, motivo, nota, devueltas: parseInt(devueltas, 10) || 0, fecha: fecha || hoyInput(), hoy: hoyInput(),
                lineas: lineas.map(l => ({ inventoryId: l.id, cantidad: aNum(l.cant) })),
                empresaId: kromaUser?.empresaId || 'lacteoca',
                responsable: { id: kromaUser?.id || '', nombre: kromaUser?.name || '' },
                nombreAlmacen: nombreAlmacen || (() => 'Cava'),
                etiquetaPresentacion: (d) => etiquetaPeso(d.pesoPorUnidad),
            });
            setHecho(r);
            onDone?.();
        } catch (e) {
            setError(e?.message || 'No se pudo registrar la salida.');
        } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
                    <p className="text-white font-bold">
                        {hecho ? 'Listo' : !tipo ? 'Salida de cava' : tipo === 'venta' ? 'Venta a un cliente' : tipo === 'reposicion' ? 'Reposición a un cliente' : 'Otra salida'}
                    </p>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><X size={18} /></button>
                </div>

                <div className="overflow-y-auto px-5 py-4 space-y-5">
                    {hecho ? (
                        <div className="text-center py-6">
                            <CheckCircle2 size={40} className="text-emerald-400 mx-auto mb-3" />
                            <p className="text-white font-semibold">{tipo === 'venta' ? 'Venta registrada' : tipo === 'reposicion' ? 'Reposición registrada' : 'Salida registrada'}</p>
                            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                                {tipo === 'venta'
                                    ? 'El producto ya salió del inventario. La venta queda "por facturar": administración la factura o le vincula su factura de Zoho en Despachos → Ventas en planta.'
                                    : tipo === 'reposicion'
                                    ? 'Quedó registrada y lo devuelto como merma. Falta documentarla en Zoho: nota de crédito por lo devuelto y factura por lo repuesto, cruzadas. Luego se vinculan en Despachos → Ventas en planta.'
                                    : 'El producto ya salió del inventario y el motivo quedó en el libro de movimientos.'}
                            </p>
                            <button onClick={onClose} className="mt-5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl px-6 py-2.5 text-sm">Cerrar</button>
                        </div>
                    ) : !tipo ? (
                        <div className="space-y-2.5">
                            <p className="text-slate-400 text-sm">¿El producto sigue siendo de la empresa?</p>
                            {[
                                { k: 'venta', Icon: ShoppingBag, t: 'Venta a un cliente', d: 'Pasa a un cliente. Queda por facturar en Zoho.', c: 'emerald' },
                                { k: 'reposicion', Icon: RefreshCw, t: 'Reposición a un cliente', d: 'Se le reemplaza, sin cobrar, producto vencido o dañado.', c: 'violet' },
                                { k: 'transfer', Icon: ArrowRight, t: 'Transferencia', d: 'Sigue siendo nuestro: va a Caracas o a otro almacén de la planta.', c: 'sky' },
                                { k: 'salida', Icon: AlertTriangle, t: 'Otra salida', d: 'Sale sin venta: merma, vencido, muestra, consumo interno…', c: 'amber' },
                            ].filter(o => o.k !== 'transfer' || onTransferir).map(({ k, Icon, t, d, c }) => (
                                <button key={k} type="button"
                                    onClick={() => { if (k === 'transfer') onTransferir(itemInicial); else { setTipo(k); setMotivo(''); } }}
                                    className={`w-full flex items-start gap-3 text-left rounded-xl border p-4 bg-slate-800/60 border-slate-700 ${TONO[c].borde}`}>
                                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${TONO[c].fondo}`}>
                                        <Icon size={18} className={TONO[c].icono} />
                                    </span>
                                    <span>
                                        <span className="block text-white font-semibold text-sm">{t}</span>
                                        <span className="block text-slate-400 text-xs mt-0.5">{d}</span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <>
                            {(tipo === 'venta' || tipo === 'reposicion') && (
                                <div>
                                    <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest mb-2">Cliente</p>
                                    {cliente ? (
                                        <div className="flex items-center gap-2 bg-emerald-900/20 border border-emerald-700/40 rounded-xl px-3 py-2.5">
                                            <p className="flex-1 min-w-0 text-white text-sm font-semibold truncate">{cliente.customerName}</p>
                                            <button onClick={() => setCliente(null)} className="text-xs text-slate-400 hover:text-white underline shrink-0">Cambiar</button>
                                        </div>
                                    ) : <Cliente onElegir={setCliente} />}
                                </div>
                            )}

                            {tipo === 'reposicion' && (
                                <div>
                                    <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest mb-2">¿Por qué se repone?</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {MOTIVOS_REPOSICION.map(m => (
                                            <button key={m.key} type="button" onClick={() => setMotivo(m.key)}
                                                className={`text-left text-sm rounded-xl border px-3 py-2.5 ${motivo === m.key
                                                    ? 'bg-violet-500/15 border-violet-400 text-violet-200 font-semibold'
                                                    : 'bg-slate-800/60 border-slate-700 text-slate-300'}`}>
                                                {m.label}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest mt-4 mb-2">¿Cuántas unidades devolvió el cliente?</p>
                                    <div className="flex items-center gap-2">
                                        <input value={devueltas} inputMode="numeric" placeholder="ud"
                                            onChange={e => setDevueltas(e.target.value.replace(/[^0-9]/g, ''))}
                                            className="w-28 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-base font-mono focus:outline-none focus:border-violet-500" />
                                        <span className="text-slate-400 text-sm">ud</span>
                                    </div>
                                    <p className="text-slate-500 text-xs mt-2">Lo devuelto queda registrado como merma: no vuelve a la venta. Abajo va lo que SALE de la cava para reemplazar. En Zoho se documenta con una nota de crédito (lo devuelto) y una factura (lo repuesto).</p>
                                </div>
                            )}

                            {tipo === 'salida' && (
                                <div>
                                    <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest mb-2">Motivo</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {MOTIVOS_SALIDA.map(m => (
                                            <button key={m.key} type="button" onClick={() => setMotivo(m.key)}
                                                className={`text-left text-sm rounded-xl border px-3 py-2.5 ${motivo === m.key
                                                    ? 'bg-amber-500/15 border-amber-400 text-amber-200 font-semibold'
                                                    : 'bg-slate-800/60 border-slate-700 text-slate-300'}`}>
                                                {m.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest mb-2">Qué sale</p>
                                <div className="space-y-2">
                                    {lineas.map((l, idx) => {
                                        const it = itemDe(l.id);
                                        return (
                                            <div key={l.id} className="bg-slate-800/60 border border-slate-700 rounded-xl p-3">
                                                <div className="flex items-center gap-2">
                                                    <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-bold ${granel(it) ? 'border-amber-500/40 text-amber-300' : 'border-sky-500/40 text-sky-300 font-mono'}`}>
                                                        {presLabel(it)}
                                                    </span>
                                                    <p className="flex-1 min-w-0 text-white text-sm font-medium truncate">{it?.productoNombre || '—'}</p>
                                                    <button onClick={() => setLineas(ls => ls.filter(x => x.id !== l.id))} className="text-slate-500 hover:text-rose-400 p-1"><Trash2 size={14} /></button>
                                                </div>
                                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                    {it?.lote && <Lote size="xs">{it.lote}</Lote>}
                                                    {it?.fechaVencimiento && <span className="text-slate-500 text-xs">Vence {fmtVence(it.fechaVencimiento)}</span>}
                                                    <span className="text-slate-500 text-xs ml-auto">Hay {it ? fmtDisp(it) : '—'}</span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <input value={l.cant} inputMode={granel(it) ? 'decimal' : 'numeric'}
                                                        onChange={e => setLineas(ls => ls.map(x => x.id === l.id ? { ...x, cant: e.target.value } : x))}
                                                        placeholder={granel(it) ? 'kg' : 'ud'}
                                                        className="w-28 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-base font-mono focus:outline-none focus:border-emerald-500" />
                                                    <span className="text-slate-400 text-sm">{granel(it) ? 'kg' : 'ud'}</span>
                                                    {it && <button type="button" onClick={() => setLineas(ls => ls.map(x => x.id === l.id ? { ...x, cant: String(disponible(it)) } : x))}
                                                        className="text-xs text-slate-400 hover:text-white underline">Todo</button>}
                                                    {problemas[idx] && l.cant !== '' && <span className="text-rose-400 text-xs ml-auto">{problemas[idx]}</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {agregar ? (
                                    <div className="mt-2 max-h-52 overflow-y-auto space-y-1 border border-slate-700 rounded-xl p-2">
                                        {libres.length === 0 && <p className="text-slate-500 text-xs p-2">No hay más producto en la cava.</p>}
                                        {libres.map(i => (
                                            <button key={i.id} type="button" onClick={() => { setLineas(ls => [...ls, { id: i.id, cant: granel(i) ? '' : '1' }]); setAgregar(false); }}
                                                className="w-full flex items-center gap-2 text-left px-2 py-2 rounded-lg hover:bg-slate-800">
                                                <span className="text-xs font-bold text-sky-300 font-mono w-14 shrink-0">{presLabel(i)}</span>
                                                <span className="flex-1 min-w-0 text-slate-200 text-sm truncate">{i.productoNombre}</span>
                                                <span className="text-slate-500 text-xs shrink-0">{i.lote} · {fmtDisp(i)}</span>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <button type="button" onClick={() => setAgregar(true)}
                                        className="mt-2 flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 font-semibold">
                                        <Plus size={15} /> Agregar otro producto
                                    </button>
                                )}
                            </div>

                            <div className="max-w-[16rem]">
                                <CampoFecha label="Fecha de la salida" value={fecha} onChange={setFecha} max={hoyInput()} acento="emerald"
                                    ayuda="Hoy por defecto. Muévela solo para registrar una salida que ya ocurrió." />
                            </div>

                            <div>
                                <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest mb-2">
                                    Nota {tipo === 'salida' && motivo === 'otro' ? '(obligatoria)' : '(opcional)'}
                                </p>
                                <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
                                    placeholder={tipo === 'venta' ? 'Ej: retiró en planta, pagó en efectivo…' : tipo === 'reposicion' ? 'Ej: devolvió 6 ud del lote LCO…, vencidas' : 'Qué pasó'}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
                            </div>

                            {error && <p className="bg-rose-900/20 border border-rose-700/40 rounded-xl px-3 py-2 text-rose-300 text-sm">{error}</p>}
                        </>
                    )}
                </div>

                {tipo && !hecho && (
                    <div className="px-5 py-4 border-t border-slate-800 flex gap-2 shrink-0">
                        <button onClick={() => { setTipo(tipoInicial || null); setMotivo(''); setError(''); }} disabled={!!tipoInicial}
                            className="px-4 border border-slate-600 text-slate-300 rounded-xl text-sm disabled:hidden">Atrás</button>
                        <button onClick={guardar} disabled={!listo || saving}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-xl py-3 text-sm flex items-center justify-center gap-2">
                            {saving && <Loader size={15} className="animate-spin" />}
                            {tipo === 'venta' ? 'Registrar venta' : tipo === 'reposicion' ? 'Registrar reposición' : 'Registrar salida'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
