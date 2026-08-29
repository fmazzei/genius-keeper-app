// RUTA: src/Pages/ClientesPdvHub.jsx
//
// CENTRO ÚNICO DE CLIENTES Y PUNTOS DE VENTA.
//
// Antes, dar de alta o actualizar un cliente obligaba a saltar entre tres o
// cuatro pantallas: el vendedor se declaraba en Integraciones, el canal
// (retail/foodservice) en otra, la razón social del PDV en la ficha del PDV o en
// una pantalla de vinculación aparte, y la frecuencia de visita en la lista
// maestra. Aquí todo eso vive en UNA ficha, en la secuencia en que se piensa el
// negocio:
//
//   ① ¿Quién es?      → razón social (viene de Zoho) y sus sucursales/carnets
//   ② ¿De quién es?   → vendedor de la cartera, u Oficina (sin comisión)
//   ③ ¿Cómo se vende? → canal Retail / Foodservice (precio y comisión)
//   ④ ¿Dónde se ejecuta? → sus puntos de venta, con su frecuencia de visita
//
// Integraciones queda SOLO para trabajo avanzado: sincronizar con Zoho, reparar
// datos y diagnóstico.
//
// Los clientes nacen en Zoho (una razón social existe cuando se le factura) y
// entran a GK con la conciliación. Los PDV se crean aquí.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { db, functions } from '@/Firebase/config.js';
import { collection, onSnapshot, getDocs, query, where, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
    Store, Search, Loader, Check, AlertTriangle, ChevronDown, ChevronRight,
    Plus, Link2, Link2Off, Building2, Briefcase,
} from 'lucide-react';
import Modal from '@/Components/Modal.jsx';
import AddPosForm from '@/Components/AddPosForm.jsx';
import EditPosModal from '@/Components/EditPosModal.jsx';

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
// Razón social SIN el paréntesis de sucursal: "Central Madeirense, C.A. (Santa
// Marta)" → "Central Madeirense, C.A.". Espejo de `stripSucursal` del backend.
const canon = (s) => String(s || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

// ── Piezas de UI ─────────────────────────────────────────────────────────────

const Chip = ({ tone = 'slate', children }) => {
    const tones = {
        slate:   'bg-slate-100 text-slate-600',
        emerald: 'bg-emerald-100 text-emerald-700',
        amber:   'bg-amber-100 text-amber-700',
        red:     'bg-red-100 text-red-600',
        orange:  'bg-orange-100 text-orange-700',
        blue:    'bg-blue-100 text-blue-700',
    };
    return <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${tones[tone]}`}>{children}</span>;
};

const Paso = ({ n, titulo, ayuda, children }) => (
    <div className="border-t border-slate-100 pt-3 mt-3 first:border-0 first:pt-0 first:mt-0">
        <div className="flex items-baseline gap-2 mb-1.5">
            <span className="w-5 h-5 rounded-full bg-brand-blue/10 text-brand-blue text-[10px] font-black grid place-items-center shrink-0">{n}</span>
            <p className="text-xs font-bold text-slate-700">{titulo}</p>
        </div>
        {ayuda && <p className="text-[11px] text-slate-400 mb-2 leading-snug">{ayuda}</p>}
        {children}
    </div>
);

const Segmented = ({ value, options, onChange, disabled }) => (
    <div className="flex flex-wrap gap-1.5">
        {options.map(o => (
            <button
                key={o.value}
                type="button"
                disabled={disabled}
                onClick={() => value !== o.value && onChange(o.value)}
                className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                    value === o.value
                        ? (o.tone === 'orange' ? 'bg-orange-500 border-orange-500 text-white' : 'bg-brand-blue border-brand-blue text-white')
                        : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
            >
                {o.label}
            </button>
        ))}
    </div>
);

// ── Fila de PDV dentro de la ficha del cliente ───────────────────────────────

const PdvRow = ({ pdv, onFrecuencia, onDesvincular, onEditar, saving }) => {
    const [valor, setValor] = useState(String(pdv.visitInterval ?? ''));
    useEffect(() => { setValor(String(pdv.visitInterval ?? '')); }, [pdv.visitInterval]);

    const esFood   = pdv.canal === 'foodservice';
    const inactivo = !esFood && !(Number(pdv.visitInterval) > 0);

    const commit = () => {
        const n = valor === '' ? 0 : Math.max(0, parseInt(valor, 10) || 0);
        if (n !== (Number(pdv.visitInterval) || 0)) onFrecuencia(pdv.id, n);
    };

    return (
        <div className={`rounded-lg border px-3 py-2 ${inactivo ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-start justify-between gap-2">
                <button type="button" onClick={() => onEditar(pdv)} className="min-w-0 text-left flex-1 group">
                    <p className="text-sm font-semibold text-slate-800 leading-snug break-words group-hover:text-brand-blue">{pdv.name || '(sin nombre)'}</p>
                    <p className="text-[11px] text-slate-400 break-words">
                        {[pdv.chain, pdv.zone, pdv.city].filter(Boolean).join(' · ') || 'Sin zona'}
                    </p>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                    {esFood && <Chip tone="orange">Foodservice</Chip>}
                    {inactivo && <Chip tone="slate">Inactivo</Chip>}
                </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
                {esFood ? (
                    <p className="text-[11px] text-slate-400 flex-1">Foodservice no lleva visitas de mercaderista.</p>
                ) : (
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-500 flex-1 min-w-0">
                        Visitar cada
                        <input
                            type="number" min="0" inputMode="numeric"
                            value={valor}
                            onChange={e => setValor(e.target.value.replace(/[^\d]/g, ''))}
                            onBlur={commit}
                            className="w-16 px-2 py-1 border border-slate-300 rounded-lg text-sm text-center"
                        />
                        días <span className="text-slate-300">· 0 = inactivo</span>
                    </label>
                )}
                {saving === pdv.id && <Loader size={13} className="animate-spin text-brand-blue shrink-0" />}
                <button type="button" onClick={() => onDesvincular(pdv.id)}
                    className="text-[11px] font-semibold text-slate-400 hover:text-red-500 shrink-0">
                    Desvincular
                </button>
            </div>
        </div>
    );
};

// ── Ficha de cliente (los 4 pasos) ───────────────────────────────────────────

const ClienteCard = ({ grupo, vendedores, pdvsSinCliente, abierto, onToggle, onAccion, onVincularPdv,
                       onFrecuencia, onDesvincular, onEditarPdv, onCrearPdv, saving, savingPdv }) => {
    const [nuevoPdvId, setNuevoPdvId] = useState('');
    const [carnetSel, setCarnetSel]   = useState('');

    const vendName = (id) => vendedores.find(v => v.id === id)?.name || 'Vendedor';
    const carnetPorDefecto = grupo.carnets.length === 1 ? grupo.carnets[0].customerName : (carnetSel || '');

    return (
        <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
            <button type="button" onClick={onToggle} className="w-full text-left px-3.5 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 text-slate-300">
                        {abierto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-800 text-sm leading-snug break-words">{grupo.canon}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            {grupo.carnets.length > 1 ? `${grupo.carnets.length} sucursales · ` : ''}
                            {grupo.facturas} factura{grupo.facturas === 1 ? '' : 's'} ·{' '}
                            {grupo.pdvs.length} PDV
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1 shrink-0 max-w-[45%]">
                        {grupo.canal === 'foodservice' && <Chip tone="orange">Foodservice</Chip>}
                        {grupo.estado === 'asignado' && <Chip tone="emerald">{vendName(grupo.vendedorId)}</Chip>}
                        {grupo.estado === 'oficina'  && <Chip tone="slate">Oficina</Chip>}
                        {grupo.estado === 'mixto'    && <Chip tone="amber">Mixto</Chip>}
                        {grupo.estado === 'pendiente'&& <Chip tone="red">Sin vendedor</Chip>}
                        {grupo.pdvs.length === 0 && grupo.canal !== 'foodservice' && <Chip tone="amber">Sin PDV</Chip>}
                    </div>
                </div>
            </button>

            {abierto && (
                <div className="px-3.5 pb-4 border-t border-slate-100">

                    <Paso n="1" titulo="Quién es"
                          ayuda="La razón social viene de Zoho; una cadena puede tener varias sucursales, cada una con su propio carnet.">
                        <div className="space-y-1">
                            {grupo.carnets.map(c => (
                                <div key={c.customerId} className="flex items-center gap-2 text-[11px] text-slate-500">
                                    <Building2 size={12} className="shrink-0 text-slate-300" />
                                    <span className="break-words min-w-0">{c.customerName}</span>
                                </div>
                            ))}
                        </div>
                    </Paso>

                    <Paso n="2" titulo="De quién es"
                          ayuda="El vendedor dueño del cliente cobra la comisión de sus facturas. Al asignar, su histórico se re-atribuye solo.">
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                value={grupo.estado === 'asignado' ? grupo.vendedorId : ''}
                                onChange={e => e.target.value && onAccion(grupo, 'asignar', e.target.value)}
                                disabled={saving === grupo.canon}
                                className="flex-1 min-w-[150px] p-2 border border-slate-300 rounded-lg text-xs bg-white"
                            >
                                <option value="">Asignar a vendedor…</option>
                                {vendedores.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </select>
                            <button type="button" onClick={() => onAccion(grupo, 'oficina')} disabled={saving === grupo.canon}
                                className={`text-[11px] font-semibold px-2.5 py-2 rounded-lg border ${grupo.estado === 'oficina' ? 'bg-slate-200 border-slate-300 text-slate-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                                <Briefcase size={12} className="inline mr-1" />Oficina
                            </button>
                            {grupo.estado !== 'pendiente' && (
                                <button type="button" onClick={() => onAccion(grupo, 'quitar')} disabled={saving === grupo.canon}
                                    className="text-[11px] font-semibold px-2.5 py-2 rounded-lg border border-slate-300 text-red-500 hover:bg-red-50">
                                    Quitar
                                </button>
                            )}
                            {saving === grupo.canon && <Loader size={14} className="animate-spin text-brand-blue" />}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1.5">
                            <b>Oficina</b> = lo atiendes tú directo: no genera comisión y no aparece como pendiente.
                        </p>
                    </Paso>

                    <Paso n="3" titulo="Cómo se le vende"
                          ayuda="El canal fija el precio por unidad y, en foodservice, la comisión flat y la conversión de kilos a unidades. Sus PDV heredan el canal.">
                        <Segmented
                            value={grupo.canal}
                            disabled={saving === grupo.canon}
                            onChange={(v) => onAccion(grupo, 'canal', null, v)}
                            options={[
                                { value: 'retail', label: 'Retail' },
                                { value: 'foodservice', label: 'Foodservice', tone: 'orange' },
                            ]}
                        />
                    </Paso>

                    <Paso n="4" titulo="Dónde se ejecuta"
                          ayuda="Los puntos de venta de este cliente y cada cuántos días los visita el mercaderista.">
                        {grupo.pdvs.length === 0 ? (
                            <p className="text-[11px] text-slate-400 mb-2">Todavía no hay puntos de venta vinculados a este cliente.</p>
                        ) : (
                            <div className="space-y-1.5 mb-2">
                                {grupo.pdvs.map(p => (
                                    <PdvRow key={p.id} pdv={p} saving={savingPdv}
                                        onFrecuencia={onFrecuencia} onDesvincular={onDesvincular} onEditar={onEditarPdv} />
                                ))}
                            </div>
                        )}

                        <div className="rounded-lg border border-dashed border-slate-300 p-2.5 space-y-2">
                            <p className="text-[11px] font-semibold text-slate-500">Agregar un punto de venta</p>
                            {grupo.carnets.length > 1 && (
                                <select value={carnetSel} onChange={e => setCarnetSel(e.target.value)}
                                    className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white">
                                    <option value="">¿A cuál sucursal factura?…</option>
                                    {grupo.carnets.map(c => <option key={c.customerId} value={c.customerName}>{c.customerName}</option>)}
                                </select>
                            )}
                            <div className="flex flex-wrap gap-2">
                                <select
                                    value={nuevoPdvId}
                                    onChange={e => {
                                        const id = e.target.value;
                                        setNuevoPdvId('');
                                        if (id && carnetPorDefecto) onVincularPdv(id, carnetPorDefecto);
                                        else if (id) alert('Elige primero a cuál sucursal factura este punto de venta.');
                                    }}
                                    className="flex-1 min-w-[150px] p-2 border border-slate-300 rounded-lg text-xs bg-white"
                                >
                                    <option value="">Vincular un PDV existente…</option>
                                    {pdvsSinCliente.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}{p.zone ? ` · ${p.zone}` : ''}</option>
                                    ))}
                                </select>
                                <button type="button" onClick={onCrearPdv}
                                    className="text-[11px] font-semibold px-2.5 py-2 rounded-lg bg-brand-blue text-white">
                                    <Plus size={12} className="inline mr-1" />Crear PDV
                                </button>
                            </div>
                        </div>
                    </Paso>
                </div>
            )}
        </div>
    );
};

// ── Componente principal ─────────────────────────────────────────────────────

export default function ClientesPdvHub() {
    const [clientes, setClientes]   = useState([]);
    const [pos, setPos]             = useState([]);
    const [vendedores, setVendedores] = useState([]);
    const [cargando, setCargando]   = useState(true);
    const [error, setError]         = useState('');
    const [msg, setMsg]             = useState('');

    const [busca, setBusca]   = useState('');
    const [filtro, setFiltro] = useState('todos'); // todos|pendientes|sinPdv|oficina
    const [abierto, setAbierto] = useState(null);
    const [saving, setSaving]   = useState('');
    const [savingPdv, setSavingPdv] = useState('');

    const [crearPdv, setCrearPdv]   = useState(false);
    const [editarPdv, setEditarPdv] = useState(null);
    const [verHuerfanos, setVerHuerfanos] = useState(false);

    // Los PDV se escuchan en vivo (se editan aquí mismo); clientes y vendedores
    // se cargan una vez y se refrescan con las acciones.
    useEffect(() => {
        const unsub = onSnapshot(
            collection(db, 'pos'),
            snap => setPos(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            e => { console.error('ClientesPdvHub pos:', e); setError('No se pudieron cargar los puntos de venta.'); },
        );
        return () => unsub();
    }, []);

    const cargar = useCallback(async () => {
        try {
            const [cSnap, vSnap] = await Promise.all([
                getDocs(collection(db, 'clientes_zoho')),
                getDocs(query(collection(db, 'users_metadata'), where('role', '==', 'vendedor'))),
            ]);
            setClientes(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setVendedores(vSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        } catch (e) {
            setError('No se pudo cargar el registro de clientes. ' + (e?.message || ''));
        } finally {
            setCargando(false);
        }
    }, []);
    useEffect(() => { cargar(); }, [cargar]);

    // PDV por razón social vinculada (clave normalizada del nombre completo).
    const pdvPorRazon = useMemo(() => {
        const m = new Map();
        pos.forEach(p => {
            const k = norm(p.razonSocialZoho);
            if (!k) return;
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(p);
        });
        return m;
    }, [pos]);

    const pdvsSinCliente = useMemo(() => pos
        .filter(p => !(p.razonSocialZoho || '').trim())
        .sort((a, b) => (a.name || '').localeCompare(b.name || '')), [pos]);

    // Agrupación por razón social canónica: una ficha por CLIENTE, aunque tenga
    // varias sucursales en Zoho.
    const grupos = useMemo(() => {
        const g = new Map();
        clientes.forEach(c => {
            const key = (c.razonSocialCanonica || canon(c.customerName) || '(sin nombre)').trim();
            const cur = g.get(key) || { canon: key, carnets: [], facturas: 0, vendedorIds: new Set(), oficina: 0, food: 0 };
            cur.carnets.push(c);
            cur.facturas += Number(c.facturas) || 0;
            if (c.esOficina) cur.oficina++;
            else if (c.vendedorId) cur.vendedorIds.add(c.vendedorId);
            if (c.categoria === 'foodservice') cur.food++;
            g.set(key, cur);
        });
        return [...g.values()].map(x => {
            const total = x.carnets.length;
            let estado = 'pendiente';
            if (x.oficina === total) estado = 'oficina';
            else if (x.vendedorIds.size === 1 && x.oficina === 0 && x.carnets.every(c => c.vendedorId)) estado = 'asignado';
            else if (x.vendedorIds.size >= 1 || x.oficina > 0) estado = 'mixto';
            // PDV del cliente: los que apuntan a cualquiera de sus carnets, más
            // los que apuntan al nombre canónico (cliente de una sola sucursal).
            const claves = new Set(x.carnets.map(c => norm(c.customerName)));
            claves.add(norm(x.canon));
            const pdvs = [];
            claves.forEach(k => (pdvPorRazon.get(k) || []).forEach(p => { if (!pdvs.includes(p)) pdvs.push(p); }));
            pdvs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            return {
                ...x, sucursales: total, estado, pdvs,
                canal: x.food > 0 ? 'foodservice' : 'retail',
                vendedorId: x.vendedorIds.size === 1 ? [...x.vendedorIds][0] : null,
            };
        }).sort((a, b) => {
            const rank = (e) => e === 'pendiente' ? 0 : e === 'mixto' ? 1 : 2;
            return rank(a.estado) - rank(b.estado) || b.facturas - a.facturas;
        });
    }, [clientes, pdvPorRazon]);

    const resumen = useMemo(() => ({
        total:      grupos.length,
        asignados:  grupos.filter(g => g.estado === 'asignado').length,
        oficina:    grupos.filter(g => g.estado === 'oficina').length,
        pendientes: grupos.filter(g => g.estado === 'pendiente' || g.estado === 'mixto').length,
        sinPdv:     grupos.filter(g => g.pdvs.length === 0 && g.canal !== 'foodservice').length,
    }), [grupos]);

    const visibles = useMemo(() => {
        const q = norm(busca);
        return grupos.filter(g => {
            if (filtro === 'pendientes' && !(g.estado === 'pendiente' || g.estado === 'mixto')) return false;
            if (filtro === 'oficina' && g.estado !== 'oficina') return false;
            if (filtro === 'sinPdv' && !(g.pdvs.length === 0 && g.canal !== 'foodservice')) return false;
            if (q && !norm(g.canon).includes(q)
                && !g.carnets.some(c => norm(c.customerName).includes(q))
                && !g.pdvs.some(p => norm(p.name).includes(q))) return false;
            return true;
        });
    }, [grupos, filtro, busca]);

    // ── Acciones ─────────────────────────────────────────────────────────────

    // Vendedor / Oficina / Canal — todo por el mismo callable, sobre los carnets
    // del grupo. Al cambiar SOLO el canal se reenvía la atribución vigente para
    // no soltar el cliente.
    const accionCliente = async (grupo, accion, vendedorId, categoria) => {
        setSaving(grupo.canon); setMsg(''); setError('');
        try {
            const customerIds = grupo.carnets.map(c => c.customerId).filter(Boolean);
            const payload = { customerIds };
            if (accion === 'oficina')      payload.esOficina = true;
            else if (accion === 'quitar')  payload.vendedorId = null;
            else if (accion === 'canal') {
                payload.esOficina  = grupo.estado === 'oficina';
                payload.vendedorId = grupo.estado === 'oficina' ? null : (grupo.vendedorId || null);
                payload.categoria  = categoria;
            } else payload.vendedorId = vendedorId;

            const fn = httpsCallable(functions, 'asignarClienteVendedor', { timeout: 540000 });
            const { data } = await fn(payload);

            // Espejo local inmediato.
            setClientes(cs => cs.map(c => {
                if (!customerIds.includes(c.customerId)) return c;
                if (accion === 'canal') return { ...c, categoria };
                return { ...c, vendedorId: accion === 'asignar' ? vendedorId : null, esOficina: accion === 'oficina' };
            }));

            // El canal es una propiedad del CLIENTE: sus PDV lo heredan. Al pasar a
            // foodservice se apaga el merchandising (no lleva visitas por diseño).
            if (accion === 'canal' && grupo.pdvs.length > 0) {
                const batch = writeBatch(db);
                grupo.pdvs.forEach(p => {
                    const patch = categoria === 'foodservice'
                        ? { canal: 'foodservice', sinMerchandising: true, visitInterval: 0, active: true }
                        : { canal: 'retail', sinMerchandising: false };
                    batch.set(doc(db, 'pos', p.id), patch, { merge: true });
                });
                await batch.commit();
            }

            const etiqueta = accion === 'canal'   ? (categoria === 'foodservice' ? 'Foodservice' : 'Retail')
                : accion === 'oficina' ? 'Oficina'
                : accion === 'quitar'  ? 'sin vendedor'
                : (vendedores.find(v => v.id === vendedorId)?.name || 'vendedor');
            setMsg(`✓ ${grupo.canon} → ${etiqueta}${data?.backfilled ? ` · ${data.backfilled} factura(s) re-atribuida(s)` : ''}.`);
        } catch (e) {
            setError('No se pudo guardar. ' + (e?.message || e));
        } finally { setSaving(''); }
    };

    // Vincular un PDV a la razón social del cliente. Escribe `pos.razonSocialZoho`
    // y atribuye el histórico de esa razón social (misma callable que la ficha).
    const vincularPdv = async (posId, razonSocialZoho) => {
        setSavingPdv(posId); setMsg(''); setError('');
        try {
            await updateDoc(doc(db, 'pos', posId), { razonSocialZoho });
            try { await httpsCallable(functions, 'emparejarRazonSocialPDV')({ posId, razonSocialZoho }); } catch { /* el vínculo ya quedó */ }
            setMsg(`✓ Punto de venta vinculado a ${razonSocialZoho}.`);
        } catch (e) {
            setError('No se pudo vincular. ' + (e?.message || e));
        } finally { setSavingPdv(''); }
    };

    const desvincularPdv = async (posId) => {
        setSavingPdv(posId);
        try { await updateDoc(doc(db, 'pos', posId), { razonSocialZoho: '' }); }
        catch (e) { setError('No se pudo desvincular. ' + (e?.message || e)); }
        finally { setSavingPdv(''); }
    };

    // Frecuencia de visita: 0 = PDV inactivo (la lista maestra manda).
    const cambiarFrecuencia = async (posId, dias) => {
        setSavingPdv(posId);
        try { await updateDoc(doc(db, 'pos', posId), { visitInterval: dias, active: dias > 0 }); }
        catch (e) { setError('No se pudo guardar la frecuencia. ' + (e?.message || e)); }
        finally { setSavingPdv(''); }
    };

    if (cargando) {
        return <div className="flex justify-center py-16"><Loader size={26} className="animate-spin text-brand-blue" /></div>;
    }

    const FILTROS = [
        { k: 'todos',      label: 'Todos',        val: resumen.total,      cls: 'text-slate-800' },
        { k: 'pendientes', label: 'Sin vendedor', val: resumen.pendientes, cls: 'text-red-600'   },
        { k: 'sinPdv',     label: 'Sin PDV',      val: resumen.sinPdv,     cls: 'text-amber-600' },
        { k: 'oficina',    label: 'Oficina',      val: resumen.oficina,    cls: 'text-slate-500' },
    ];

    return (
        <div className="max-w-3xl">
            <div className="mb-4">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Store size={20} className="text-brand-blue" /> Clientes y Puntos de Venta
                </h3>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                    Todo el cliente en una sola ficha, en orden: <b>quién es</b> → <b>de quién es</b> (vendedor u
                    oficina) → <b>cómo se le vende</b> (retail o foodservice) → <b>dónde se ejecuta</b> (sus puntos
                    de venta y su frecuencia de visita). Los clientes llegan de Zoho al conciliar; los puntos de
                    venta se crean aquí.
                </p>
                <p className="text-[11px] text-slate-400 mt-1.5">
                    Para trabajo en lote (aplicar una frecuencia a toda una cadena o exportar el maestro) usa
                    <b> PDV: lista maestra</b>. Integraciones queda solo para sincronizar y reparar datos.
                </p>
            </div>

            {error && (
                <p className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}
                </p>
            )}
            {msg && (
                <p className="flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">
                    <Check size={15} className="shrink-0 mt-0.5" /> {msg}
                </p>
            )}

            {clientes.length === 0 && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                    Todavía no hay clientes de Zoho en GK. Corre una <b>conciliación</b> en Configuración →
                    Integraciones y vuelve aquí: los clientes aparecen solos a partir de sus facturas.
                </p>
            )}

            {/* Resumen / filtros */}
            <div className="grid grid-cols-4 gap-2 mb-3">
                {FILTROS.map(f => (
                    <button key={f.k} onClick={() => setFiltro(f.k)}
                        className={`text-left border rounded-xl px-2.5 py-2 transition-colors ${filtro === f.k ? 'border-brand-blue bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                        <p className={`text-xl font-black ${f.cls}`}>{f.val}</p>
                        <p className="text-[10px] text-slate-500 leading-tight">{f.label}</p>
                    </button>
                ))}
            </div>

            <div className="relative mb-3">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input value={busca} onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar por cliente o punto de venta…"
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm" />
            </div>

            {/* Puntos de venta sin cliente — el otro extremo del vínculo, aquí mismo */}
            <div className="border border-slate-200 rounded-xl mb-3 overflow-hidden">
                {/* El botón de crear va como HERMANO del de desplegar: un <button>
                    dentro de otro no es HTML válido y el clic se vuelve ambiguo. */}
                <div className="flex items-center gap-2 px-3.5 py-2.5">
                    <button type="button" onClick={() => setVerHuerfanos(v => !v)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left">
                        {pdvsSinCliente.length > 0
                            ? <Link2Off size={15} className="text-amber-500 shrink-0" />
                            : <Link2 size={15} className="text-emerald-500 shrink-0" />}
                        <span className="text-sm font-semibold text-slate-700 flex-1 min-w-0">
                            Puntos de venta sin cliente ({pdvsSinCliente.length})
                        </span>
                        {verHuerfanos ? <ChevronDown size={15} className="text-slate-300 shrink-0" /> : <ChevronRight size={15} className="text-slate-300 shrink-0" />}
                    </button>
                    <button type="button" onClick={() => setCrearPdv(true)}
                        className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-brand-blue text-white shrink-0">
                        <Plus size={12} className="inline mr-1" />Nuevo PDV
                    </button>
                </div>
                {verHuerfanos && (
                    <div className="px-3.5 pb-3 border-t border-slate-100 pt-3">
                        {pdvsSinCliente.length === 0 ? (
                            <p className="text-[11px] text-slate-400">Todos los puntos de venta están vinculados a su cliente. 🎉</p>
                        ) : (
                            <>
                                <p className="text-[11px] text-slate-400 mb-2">
                                    Sin razón social no se puede cruzar el PDV con su facturación (ni medir sus días sin
                                    facturar). En cadenas elige el nombre <b>con su sucursal</b>.
                                </p>
                                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                                    {pdvsSinCliente.map(p => (
                                        <div key={p.id} className="rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2">
                                            <div className="flex items-start justify-between gap-2">
                                                <button type="button" onClick={() => setEditarPdv(p)} className="min-w-0 text-left flex-1">
                                                    <p className="text-sm font-semibold text-slate-800 break-words leading-snug">{p.name || '(sin nombre)'}</p>
                                                    <p className="text-[11px] text-slate-400 break-words">{[p.chain, p.zone].filter(Boolean).join(' · ') || 'Sin zona'}</p>
                                                </button>
                                                {savingPdv === p.id && <Loader size={13} className="animate-spin text-brand-blue shrink-0 mt-1" />}
                                            </div>
                                            <div className="mt-1.5 min-w-0">
                                                <select
                                                    value=""
                                                    onChange={e => e.target.value && vincularPdv(p.id, e.target.value)}
                                                    className="block w-full min-w-0 max-w-full p-2 border border-slate-300 rounded-lg text-xs bg-white"
                                                >
                                                    <option value="">Vincular a un cliente…</option>
                                                    {clientes
                                                        .slice()
                                                        .sort((a, b) => (a.customerName || '').localeCompare(b.customerName || ''))
                                                        .map(c => <option key={c.id} value={c.customerName}>{c.customerName}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Fichas de cliente */}
            <div className="space-y-2">
                {visibles.length === 0 && (
                    <p className="text-sm text-slate-400 py-8 text-center">Sin clientes con ese filtro.</p>
                )}
                {visibles.slice(0, 200).map(g => (
                    <ClienteCard
                        key={g.canon}
                        grupo={g}
                        vendedores={vendedores}
                        pdvsSinCliente={pdvsSinCliente}
                        abierto={abierto === g.canon}
                        onToggle={() => setAbierto(a => a === g.canon ? null : g.canon)}
                        onAccion={accionCliente}
                        onVincularPdv={vincularPdv}
                        onFrecuencia={cambiarFrecuencia}
                        onDesvincular={desvincularPdv}
                        onEditarPdv={setEditarPdv}
                        onCrearPdv={() => setCrearPdv(true)}
                        saving={saving}
                        savingPdv={savingPdv}
                    />
                ))}
                {visibles.length > 200 && (
                    <p className="text-[11px] text-slate-400 text-center py-2">
                        Mostrando 200 de {visibles.length}. Usa el buscador para acotar.
                    </p>
                )}
            </div>

            <Modal isOpen={crearPdv} onClose={() => setCrearPdv(false)} title="Nuevo punto de venta" size="lg">
                <AddPosForm onClose={() => setCrearPdv(false)} canEditZoho />
            </Modal>

            {editarPdv && (
                <EditPosModal
                    pos={editarPdv}
                    onClose={() => setEditarPdv(null)}
                    onSaved={() => setEditarPdv(null)}
                />
            )}
        </div>
    );
}
