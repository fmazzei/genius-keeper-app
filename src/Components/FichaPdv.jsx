// RUTA: src/Components/FichaPdv.jsx
//
// LA FICHA DEL PUNTO DE VENTA — la ÚNICA forma de crear o editar un PDV.
//
// Antes había tres: el formulario de "Agregar" (con pestañas Individual/Cadena,
// cada una guardando campos distintos), el modal de "Editar" (con otros), y la
// vinculación a Zoho aparte en Clientes y PDV. Cada vía dejaba el PDV en un
// estado distinto — así un "Páramo Libertador" terminó en un grupo propio y las
// tiendas de Inversiones Cold 2024 agrupadas por la razón social.
//
// Decisiones del dueño (2026-09): una sola ruta, en este orden:
//   1. Razón social — SOLO de la lista que surte Zoho (clientes_zoho). Si la
//      razón social tiene varias sucursales/carnets en Zoho, se elige cuál.
//   2. Nombre para mostrar — el que ve el mercaderista.
//   3. Cadena / marca — agrupa en la lista del mercaderista ("Páramo" con las
//      tiendas de las dos razones sociales). Vacío = Individual.
//   4. Retail o Foodservice.
//   5. Tipo de despacho — Directo por defecto.
//   y lo demás (ciudad, zona, frecuencia, ubicación) como estaba.
// Solo máster y administración la abren; el mercaderista ya no crea PDV.

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { doc, updateDoc, addDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../Firebase/config.js';
import {
    MapPin, AlertTriangle, Save, Lock, CheckCircle,
    Search, X, Loader2, Building2, ChevronRight,
} from 'lucide-react';
import LoadingSpinner from './LoadingSpinner.jsx';
import Modal from './Modal.jsx';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { agruparRazones, canonRazon } from '@/utils/razonesZoho.js';

// ── SVG pin icon ──────────────────────────────────────────────────────────────
const PIN_ICON = L.divIcon({
    html: `<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22s14-12.667 14-22C28 6.268 21.732 0 14 0z" fill="#2563eb"/>
        <circle cx="14" cy="14" r="5.5" fill="white"/>
    </svg>`,
    iconSize: [28, 36], iconAnchor: [14, 36], className: '',
});

const VENEZUELA_CENTER = [8.0, -66.0];

const normalize = (str) =>
    (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function FlyTo({ lat, lng }) {
    const map = useMap();
    useEffect(() => {
        map.flyTo([lat, lng], 17, { animate: true, duration: 0.7 });
    }, [lat, lng]); // eslint-disable-line
    return null;
}

function MapTapHandler({ onTap }) {
    useMapEvents({ click: (e) => onTap(e.latlng.lat, e.latlng.lng) });
    return null;
}

async function nominatimSearch(q) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=ve&limit=6&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    if (!res.ok) throw new Error('search error');
    return res.json();
}

async function reverseGeocode(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    if (!res.ok) return '';
    const d = await res.json();
    return d.display_name || '';
}

// ── GPS status badge ──────────────────────────────────────────────────────────
const GpsBadge = ({ status }) => {
    const config = {
        verified:    { label: 'GPS Verificado',    cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', Icon: Lock },
        provisional: { label: 'GPS Provisional',   cls: 'bg-amber-100 text-amber-800 border-amber-200',    Icon: MapPin },
        pending:     { label: 'Sin GPS',           cls: 'bg-slate-100 text-slate-600 border-slate-200',     Icon: null },
    };
    const { label, cls, Icon } = config[status] || config.pending;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
            {Icon && <Icon size={10} />}
            {label}
        </span>
    );
};


const INDIVIDUAL = 'Automercados Individuales';
const Paso = ({ n, titulo, ayuda, children }) => (
    <div>
        <div className="flex items-baseline gap-2 mb-2">
            <span className="w-5 h-5 shrink-0 rounded-full bg-brand-blue text-white text-[11px] font-bold flex items-center justify-center">{n}</span>
            <p className="text-sm font-bold text-slate-800">{titulo}</p>
        </div>
        {ayuda && <p className="text-xs text-slate-400 -mt-1 mb-2 ml-7">{ayuda}</p>}
        <div className="ml-7">{children}</div>
    </div>
);

const inputCls = 'w-full px-3 py-2.5 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-blue';

/**
 * @param pos        PDV a editar, o null para crear uno nuevo.
 * @param razonInicial  (crear) carnet/razón social preseleccionada, p.ej. desde la ficha del cliente.
 */
const FichaPdv = ({ pos = null, razonInicial = null, onClose, onSaved }) => {
    const nuevo = !pos;
    const [form, setForm] = useState({
        name:            pos?.name || '',
        chain:           (pos?.chain === INDIVIDUAL ? '' : pos?.chain) || '',
        city:            pos?.city || '',
        zone:            pos?.zone || '',
        address:         pos?.address || '',
        tipoDespacho:    pos?.tipoDespacho || 'directo',
        visitInterval:   pos?.visitInterval ?? 7,
        regimenComision: pos?.regimenComision || 'estandar',
        canal:           pos?.canal || 'retail',
    });

    // ── Razón social (lista de Zoho) ────────────────────────────────────────
    const [clientes, setClientes] = useState(null);     // null = cargando
    const [allPos, setAllPos]     = useState([]);
    const [busca, setBusca]       = useState('');
    const [grupo, setGrupo]       = useState(null);     // razón social elegida
    const [carnetId, setCarnetId] = useState(pos?.zohoCustomerId || razonInicial?.customerId || '');
    const [cargaError, setCargaError] = useState('');

    const razones = useMemo(() => agruparRazones(clientes || []), [clientes]);

    useEffect(() => {
        Promise.all([getDocs(collection(db, 'clientes_zoho')), getDocs(collection(db, 'pos'))])
            .then(([cs, ps]) => {
                setClientes(cs.docs.map(d => ({ id: d.id, ...d.data() })));
                setAllPos(ps.docs.map(d => ({ id: d.id, ...d.data() })));
            })
            .catch(e => { setClientes([]); setCargaError(e?.code === 'permission-denied'
                ? 'No tienes permiso para ver la lista de clientes de Zoho.'
                : 'No se pudo cargar la lista de clientes de Zoho.'); });
    }, []);

    // Ubicar la razón social actual (por carnet; si no, por nombre).
    useEffect(() => {
        if (!clientes || grupo) return;
        const cid = pos?.zohoCustomerId || razonInicial?.customerId;
        const nombre = pos?.razonSocialZoho || razonInicial?.customerName;
        let g = cid ? razones.find(r => r.carnets.some(c => c.customerId === cid)) : null;
        if (!g && nombre) {
            const n = normalize(nombre), nc = normalize(canonRazon(nombre));
            g = razones.find(r => r.carnets.some(c => normalize(c.customerName) === n)) || razones.find(r => r.clave === nc);
            const c = g?.carnets.find(x => normalize(x.customerName) === n);
            if (c) setCarnetId(c.customerId);
        }
        if (g) { setGrupo(g); if (g.carnets.length === 1) setCarnetId(g.carnets[0].customerId); }
    }, [clientes, razones]); // eslint-disable-line react-hooks/exhaustive-deps

    const carnet = grupo?.carnets.find(c => c.customerId === carnetId) || null;
    const vinculoPorNombreSinLista = !nuevo && !grupo && clientes && !!pos?.razonSocialZoho;

    const elegirRazon = (g) => {
        setGrupo(g);
        setBusca('');
        setCarnetId(g.carnets.length === 1 ? g.carnets[0].customerId : '');
        setForm(prev => {
            const next = { ...prev };
            // Canal: lo que diga el cliente en Zoho (foodservice), si no, lo que había.
            if (g.foodservice) next.canal = 'foodservice';
            // Cadena: la que ya usan los otros PDV de esta razón social.
            if (!prev.chain) {
                const ids = new Set(g.carnets.map(c => c.customerId));
                const cuenta = {};
                allPos.forEach(p => {
                    if (p.id !== pos?.id && ids.has(p.zohoCustomerId) && p.chain && p.chain !== INDIVIDUAL) cuenta[p.chain] = (cuenta[p.chain] || 0) + 1;
                });
                const top = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
                if (top) next.chain = top[0];
            }
            return next;
        });
    };

    const razonesFiltradas = useMemo(() => {
        const q = normalize(busca.trim());
        const base = q ? razones.filter(r => normalize(r.nombre).includes(q) || r.carnets.some(c => normalize(c.customerName).includes(q))) : razones;
        return base.slice(0, 40);
    }, [busca, razones]);

    // ── Cadena / marca ──────────────────────────────────────────────────────
    const cadenas = useMemo(() => [...new Set(allPos.map(p => p.chain).filter(c => c && c !== INDIVIDUAL))].sort((a, b) => a.localeCompare(b)), [allPos]);
    const [verCadenas, setVerCadenas] = useState(false);
    const cadenasFiltradas = useMemo(() => {
        const q = normalize(form.chain.trim());
        return (q ? cadenas.filter(c => normalize(c).includes(q)) : cadenas).slice(0, 12);
    }, [form.chain, cadenas]);

    // Map / location
    const initPlace = pos?.coordinates
        ? { lat: pos.coordinates.lat, lng: pos.coordinates.lng, address: pos.address || '', fromSearch: false }
        : null;
    const [place, setPlace]               = useState(initPlace);
    const [coordsChanged, setCoordsChanged] = useState(false);
    const [showMap, setShowMap]           = useState(false);
    const [searchQ, setSearchQ]           = useState('');
    const [results, setResults]           = useState([]);
    const [searching, setSearching]       = useState(false);
    const [reversing, setReversing]       = useState(false);
    const searchRef      = useRef(null);
    const dropdownRef    = useRef(null);

    const [isSaving, setIsSaving] = useState(false);
    const [error, setError]       = useState('');
    const isVerified = pos?.gpsStatus === 'verified';

    useEffect(() => {
        const h = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
                searchRef.current  && !searchRef.current.contains(e.target)) setResults([]);
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    useEffect(() => {
        if (searchQ.trim().length < 3) { setResults([]); return; }
        const t = setTimeout(async () => {
            setSearching(true);
            try {
                const q = form.city.trim() ? `${searchQ} ${form.city}` : searchQ;
                setResults(await nominatimSearch(q));
            } catch { setResults([]); }
            finally { setSearching(false); }
        }, 400);
        return () => clearTimeout(t);
    }, [searchQ, form.city]);

    const handleField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    const handleSelectResult = (r) => {
        setPlace({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), address: r.display_name, fromSearch: true });
        setForm(prev => ({ ...prev, address: r.display_name.split(',')[0] }));
        setSearchQ(r.display_name.split(',')[0]);
        setResults([]);
        setCoordsChanged(true);
    };

    const handleMapTap = useCallback(async (lat, lng) => {
        setPlace({ lat, lng, address: '', fromSearch: false });
        setCoordsChanged(true);
        setReversing(true);
        try {
            const address = await reverseGeocode(lat, lng);
            setPlace({ lat, lng, address, fromSearch: false });
            setForm(prev => ({ ...prev, address }));
        } catch { /* sin dirección */ }
        finally { setReversing(false); }
    }, []);

    const clearPlace = () => { setPlace(null); setSearchQ(''); setResults([]); setCoordsChanged(true); };

    const handleSave = async () => {
        if (!carnet) { setError(grupo ? 'Elige la sucursal de Zoho de este punto de venta.' : 'Elige la razón social de la lista de Zoho.'); return; }
        if (!form.name.trim()) { setError('Escribe el nombre para mostrar.'); return; }
        if (nuevo && !form.city.trim()) { setError('La ciudad es obligatoria.'); return; }
        setIsSaving(true);
        setError('');
        try {
            const esFood = form.canal === 'foodservice';
            const vi = esFood ? 0 : (parseInt(form.visitInterval, 10) || 0);
            const chain = form.chain.trim() || INDIVIDUAL;
            const datos = {
                name:            form.name.trim(),
                chain,
                city:            form.city.trim(),
                zone:            form.zone.trim(),
                address:         form.address.trim(),
                // El vínculo con Zoho va por CARNET (la llave estable) + el nombre
                // como etiqueta. Antes Editar cambiaba el nombre y dejaba el
                // carnet viejo: el PDV seguía colgando del cliente anterior.
                zohoCustomerId:  carnet.customerId,
                razonSocialZoho: carnet.customerName,
                tipoDespacho:    esFood ? 'directo' : form.tipoDespacho,
                regimenComision: !esFood && form.tipoDespacho === 'centralizado' ? form.regimenComision : 'estandar',
                canal:           form.canal,
                sinMerchandising: esFood,
                visitInterval:   vi,
                // Frecuencia 0 = inactivo (antes el alta lo dejaba activo igual).
                active:          esFood ? true : vi > 0,
            };
            let posId = pos?.id;
            if (nuevo) {
                // La primera tienda centralizada de una cadena es su cabeza (la
                // usa el despacho del vendedor para agrupar la cadena).
                const hayCabeza = allPos.some(p => p.chain === chain && p.isChainHead);
                const ref = await addDoc(collection(db, 'pos'), {
                    ...datos,
                    coordinates: place ? { lat: place.lat, lng: place.lng } : null,
                    gpsStatus:   place ? 'provisional' : 'pending',
                    ...(datos.tipoDespacho === 'centralizado' && !hayCabeza && { isChainHead: true }),
                    createdAt:   serverTimestamp(),
                });
                posId = ref.id;
            } else {
                const update = { ...datos };
                if (coordsChanged) {
                    update.coordinates = place ? { lat: place.lat, lng: place.lng } : null;
                    if (place && pos.gpsStatus !== 'verified') update.gpsStatus = 'provisional';
                }
                await updateDoc(doc(db, 'pos', pos.id), update);
            }
            if (esFood) {
                try { await httpsCallable(functions, 'marcarCategoriaCliente')({ customerName: carnet.customerName, categoria: 'foodservice' }); } catch { /* no bloquea */ }
            }
            // Atribuye las facturas de esta razón social al vendedor de su cartera (+ histórico).
            try { await httpsCallable(functions, 'emparejarRazonSocialPDV')({ posId, razonSocialZoho: carnet.customerName }); } catch { /* no bloquea */ }
            onSaved?.({ ...(pos || {}), id: posId, ...datos });
            onClose();
        } catch (err) {
            setError(err?.code === 'permission-denied'
                ? (nuevo ? 'No tienes permiso para crear puntos de venta.' : 'No tienes permiso para modificar las coordenadas de un PDV verificado.')
                : 'No se pudo guardar. Intenta de nuevo.');
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={true} onClose={onClose} title={nuevo ? 'Nuevo punto de venta' : 'Editar punto de venta'}>
            <div className="p-4 space-y-5 overflow-y-auto" style={{ maxHeight: '80vh' }}>

                {/* 1 · Razón social */}
                <Paso n={1} titulo="Razón social" ayuda="La empresa que factura, tal como está en Zoho. Toda tienda —cadena o individual— tiene una.">
                    {clientes === null ? (
                        <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Cargando la lista de Zoho…</p>
                    ) : grupo ? (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                                <Building2 size={16} className="text-brand-blue shrink-0" />
                                <p className="flex-1 min-w-0 text-sm font-bold text-slate-800 truncate">{grupo.nombre}</p>
                                <button type="button" onClick={() => { setGrupo(null); setCarnetId(''); }}
                                    className="text-xs font-semibold text-brand-blue hover:underline shrink-0">Cambiar</button>
                            </div>
                            {grupo.carnets.length > 1 && (
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Esta razón social tiene {grupo.carnets.length} sucursales en Zoho. ¿Cuál es este punto de venta?</p>
                                    <select value={carnetId} onChange={e => setCarnetId(e.target.value)} className={inputCls}>
                                        <option value="">Elige la sucursal…</option>
                                        {grupo.carnets.map(c => <option key={c.customerId} value={c.customerId}>{c.customerName}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {vinculoPorNombreSinLista && (
                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                    Estaba vinculado a <strong>"{pos.razonSocialZoho}"</strong>, que no aparece en la lista de Zoho. Elige la razón social correcta.
                                </p>
                            )}
                            <div className="relative">
                                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                <input type="text" value={busca} onChange={e => setBusca(e.target.value)} autoFocus={nuevo}
                                    placeholder="Buscar razón social…" className={`${inputCls} pl-10`} />
                            </div>
                            <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                                {razonesFiltradas.map(r => (
                                    <button key={r.clave} type="button" onClick={() => elegirRazon(r)}
                                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-blue-50 transition-colors">
                                        <span className="flex-1 min-w-0 text-sm font-semibold text-slate-800 truncate">{r.nombre}</span>
                                        {r.carnets.length > 1 && <span className="text-[11px] text-slate-400 shrink-0">{r.carnets.length} sucursales</span>}
                                        <ChevronRight size={14} className="text-slate-300 shrink-0" />
                                    </button>
                                ))}
                                {razonesFiltradas.length === 0 && (
                                    <p className="px-3 py-3 text-xs text-slate-500">
                                        {cargaError || 'Ninguna razón social coincide. Si es un cliente nuevo, créalo primero en Zoho: aparece aquí en la siguiente sincronización (cada hora).'}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </Paso>

                {/* 2 · Nombre para mostrar */}
                <Paso n={2} titulo="Nombre para mostrar" ayuda="El que ve el mercaderista al hacer el reporte. Ej: Páramo La Urbina.">
                    <input type="text" value={form.name} onChange={e => handleField('name', e.target.value)}
                        placeholder="Nombre del punto de venta *" className={inputCls} />
                </Paso>

                {/* 3 · Cadena / marca */}
                <Paso n={3} titulo="Cadena / marca" ayuda="Agrupa las tiendas en la lista del mercaderista (puede juntar varias razones sociales). Vacío = Individual.">
                    <div className="relative">
                        <input type="text" value={form.chain}
                            onChange={e => { handleField('chain', e.target.value); setVerCadenas(true); }}
                            onFocus={() => setVerCadenas(true)}
                            onBlur={() => setTimeout(() => setVerCadenas(false), 150)}
                            placeholder="Ej: Páramo — vacío = Individual" className={inputCls} />
                        {verCadenas && cadenasFiltradas.length > 0 && (
                            <div className="absolute z-[9999] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-56 overflow-y-auto">
                                {cadenasFiltradas.map(name => (
                                    <button key={name} type="button" onMouseDown={e => e.preventDefault()}
                                        onClick={() => { handleField('chain', name); setVerCadenas(false); }}
                                        className="w-full px-4 py-2.5 hover:bg-blue-50 text-left border-t border-slate-100 first:border-0 text-sm font-semibold text-slate-800">
                                        {name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </Paso>

                {/* 4 · Canal */}
                <Paso n={4} titulo="Canal" ayuda="Foodservice: sin visitas del mercaderista y comisión flat.">
                    <div className="flex gap-2">
                        {[{ v: 'retail', label: 'Retail' }, { v: 'foodservice', label: 'Foodservice' }].map(({ v, label }) => (
                            <button key={v} type="button" onClick={() => handleField('canal', v)}
                                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${form.canal === v ? (v === 'foodservice' ? 'bg-orange-500 text-white' : 'bg-brand-blue text-white') : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                </Paso>

                {/* 5 · Despacho */}
                {form.canal !== 'foodservice' && (
                    <Paso n={5} titulo="Tipo de despacho" ayuda="Directo: se le despacha a la tienda. Centralizado: la cadena recibe en un centro de distribución.">
                        <div className="flex gap-2">
                            {['directo', 'centralizado'].map(t => (
                                <button key={t} type="button" onClick={() => handleField('tipoDespacho', t)}
                                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${form.tipoDespacho === t ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                    {t === 'directo' ? 'Directo' : 'Centralizado'}
                                </button>
                            ))}
                        </div>
                        {form.tipoDespacho === 'centralizado' && (
                            <div className="flex items-center justify-between gap-2 mt-2 p-3 border border-slate-200 rounded-xl">
                                <span className="text-sm text-slate-700">Régimen de comisión</span>
                                <div className="flex gap-2">
                                    {[{ v: 'estandar', label: 'Estándar' }, { v: 'anaquel', label: 'Disp. Anaquel' }].map(({ v, label }) => (
                                        <button key={v} type="button" onClick={() => handleField('regimenComision', v)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${form.regimenComision === v ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600'}`}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </Paso>
                )}

                <hr className="border-slate-200" />

                {/* Ciudad, zona, frecuencia */}
                <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                        <input type="text" value={form.city} onChange={e => handleField('city', e.target.value)} placeholder={nuevo ? 'Ciudad *' : 'Ciudad'} className={inputCls} />
                        <input type="text" value={form.zone} onChange={e => handleField('zone', e.target.value)} placeholder="Zona" className={inputCls} />
                    </div>
                    {form.canal !== 'foodservice' && (
                        <>
                            <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl">
                                <span className="text-sm font-medium text-slate-700 flex-1">Frecuencia de visita</span>
                                <input type="number" value={form.visitInterval} onChange={e => handleField('visitInterval', e.target.value)} min="0"
                                    className="w-20 text-center px-2 py-1.5 border border-slate-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                                <span className="text-sm text-slate-500">días</span>
                            </div>
                            {parseInt(form.visitInterval, 10) === 0 && (
                                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">Frecuencia 0 deja el PDV inactivo (no se borra).</p>
                            )}
                        </>
                    )}
                </div>

                <hr className="border-slate-200" />

                {/* ── 5 · Ubicación ───────────────────────────── */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ubicación</p>
                        <GpsBadge status={pos?.gpsStatus || (place ? 'provisional' : 'pending')} />
                    </div>
                    <div className="space-y-2.5">
                        <textarea
                            value={form.address}
                            onChange={e => handleField('address', e.target.value)}
                            placeholder="Dirección (Calle, Av, Referencia)"
                            rows={2}
                            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-blue resize-none"
                        />

                        {isVerified ? (
                            <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                <Lock size={14} className="text-slate-400 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs text-slate-500">Solo el usuario máster puede modificar las coordenadas de un PDV verificado.</p>
                                    {pos?.coordinates && (
                                        <p className="text-xs text-slate-400 font-mono mt-1">
                                            {pos.coordinates.lat.toFixed(6)}, {pos.coordinates.lng.toFixed(6)}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <>
                                {!showMap ? (
                                    <button type="button" onClick={() => setShowMap(true)}
                                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors ${place ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>
                                        <MapPin size={14} />
                                        {place ? 'Ubicación marcada — editar en mapa' : 'Marcar en mapa'}
                                    </button>
                                ) : (
                                    <div className="space-y-2">
                                        {/* Search */}
                                        <div className="relative">
                                            <div ref={searchRef} className="relative">
                                                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                <input
                                                    type="text"
                                                    value={searchQ}
                                                    onChange={e => setSearchQ(e.target.value)}
                                                    placeholder={form.city ? `Buscar en ${form.city}…` : 'Buscar ubicación…'}
                                                    className="w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-blue"
                                                />
                                                {searching
                                                    ? <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
                                                    : searchQ
                                                    ? <button type="button" onClick={() => setSearchQ('')}
                                                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                                        <X size={16} />
                                                      </button>
                                                    : null
                                                }
                                            </div>
                                            {results.length > 0 && (
                                                <div ref={dropdownRef}
                                                    className="absolute z-[9999] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
                                                    {results.map((r, i) => {
                                                        const parts = r.display_name.split(',');
                                                        return (
                                                            <button key={i} type="button" onClick={() => handleSelectResult(r)}
                                                                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-blue-50 text-left border-b border-slate-100 last:border-0 transition-colors">
                                                                <MapPin size={15} className="text-blue-500 shrink-0 mt-0.5" />
                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-semibold text-slate-800 truncate">{parts[0]}</p>
                                                                    <p className="text-xs text-slate-400 truncate">{parts.slice(1, 4).join(',').trim()}</p>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        {/* Map */}
                                        <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-md">
                                            <div style={{ height: 240 }}>
                                                <MapContainer
                                                    center={place ? [place.lat, place.lng] : VENEZUELA_CENTER}
                                                    zoom={place ? 16 : 6}
                                                    style={{ height: '100%', width: '100%' }}
                                                    zoomControl={true}
                                                    attributionControl={false}
                                                    scrollWheelZoom={true}
                                                >
                                                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                                    <MapTapHandler onTap={handleMapTap} />
                                                    {place && (
                                                        <>
                                                            <Marker position={[place.lat, place.lng]} icon={PIN_ICON} />
                                                            {place.fromSearch && <FlyTo lat={place.lat} lng={place.lng} />}
                                                        </>
                                                    )}
                                                </MapContainer>
                                            </div>
                                            {place ? (
                                                <div className="flex items-start gap-2.5 px-3 py-2.5 bg-emerald-50 border-t border-emerald-100">
                                                    {reversing
                                                        ? <Loader2 size={14} className="text-emerald-500 shrink-0 mt-0.5 animate-spin" />
                                                        : <CheckCircle size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                                                    }
                                                    <p className="text-xs text-emerald-800 leading-snug line-clamp-2 flex-1">
                                                        {reversing ? 'Obteniendo dirección…' : place.address || 'Ubicación marcada en el mapa'}
                                                    </p>
                                                    <button type="button" onClick={clearPlace}
                                                        className="text-emerald-500 hover:text-emerald-700 shrink-0">
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-50 border-t border-slate-100">
                                                    <MapPin size={13} className="text-slate-400" />
                                                    <p className="text-xs text-slate-400">
                                                        Busca arriba o <strong>toca el mapa</strong> para marcar la ubicación
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <button type="button" onClick={() => setShowMap(false)}
                                            className="text-xs text-slate-400 hover:text-slate-600 underline">
                                            Ocultar mapa
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>


                {error && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                        <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-800">{error}</p>
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-1 border-t border-slate-100">
                    <button type="button" onClick={onClose}
                        className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-colors">
                        Cancelar
                    </button>
                    <button type="button" onClick={handleSave} disabled={isSaving || clientes === null}
                        className="flex items-center gap-2 px-5 py-2.5 bg-brand-blue text-white rounded-xl font-semibold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity">
                        {isSaving ? <LoadingSpinner size="sm" /> : <Save size={14} />}
                        {isSaving ? 'Guardando…' : (nuevo ? 'Crear punto de venta' : 'Guardar cambios')}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default FichaPdv;
