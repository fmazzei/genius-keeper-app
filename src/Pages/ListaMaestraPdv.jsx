// RUTA: src/Pages/ListaMaestraPdv.jsx
//
// CLIENTES Y PUNTOS DE VENTA — el ÚNICO sitio donde se gestionan.
//
// Decisión del dueño (2026-09): la forma de organizar que funciona es la de la
// LISTA MAESTRA — todos los PDV a la vista, agrupados por marca/cadena en
// desplegables — y no una lista de fichas de razón social por la que "hay que
// comenzar por buscar". Así que la lista maestra se quedó y ganó todo lo que
// vivía en otras pantallas:
//
//   · Marca (grupo): cambiar el nombre que se muestra (y quitar la razón social
//     del nombre de sus PDV), frecuencia para toda la marca, vendedor y canal de
//     cada razón social de Zoho de la marca, y "Agregar PDV a esta marca".
//   · PDV (fila): razón social de Zoho y su estado de vínculo, canal, despacho,
//     frecuencia, Editar (FichaPdv) y Eliminar (soft-delete).
//   · Arriba: resumen que FILTRA (activos, inactivos, sin razón social, …),
//     buscador, "Nuevo punto de venta" y exportar PDF.
//
// Inactivar = frecuencia 0 (no se borra). Eliminar = `eliminado:true` (se oculta
// de todas las listas; el documento y sus reportes de visita se conservan).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { db, functions } from '@/Firebase/config.js';
import { collection, onSnapshot, getDocs, query, where, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
    Store, Search, Loader, ChevronDown, Plus, Pencil, Trash2, FileDown, Save,
    AlertTriangle, Check, X, Link2, Link2Off, Truck, MapPin,
} from 'lucide-react';
import FichaPdv from '@/Components/FichaPdv.jsx';
import PuntosDeVentaDoc, { ciudadesDe } from '@/Components/PuntosDeVentaDoc.jsx';
import { canonRazon } from '@/utils/razonesZoho.js';

export const INDIVIDUAL = 'Automercados Individuales';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

const marcaDePos = (p) => (p.chain && String(p.chain).trim()) || INDIVIDUAL;
const esFood = (p) => p.canal === 'foodservice';
const estaInactivo = (p) => !esFood(p) && !(Number(p.visitInterval) > 0);

/**
 * Quita la razón social del comienzo del nombre de un PDV:
 * "Inversiones Cold 2024, C.A - Páramo La Urbina" → "Páramo La Urbina".
 * Si al quitarla no queda nada, devuelve el nombre tal cual.
 */
const sinFormaJuridica = (r) => String(r || '').replace(/[\s,.]*\b(c\.?\s*a|s\.?\s*a|s\.?\s*r\.?\s*l|c\.?\s*i\.?\s*a)\.?\s*$/i, '').trim();

export function nombreSinRazon(nombre, razones = []) {
    const original = String(nombre || '').trim();
    // Versión comparable (sin acentos, minúsculas, sin puntuación ni espacios)
    // con el índice del carácter original de cada letra, para poder cortar el
    // original en el punto exacto.
    const letras = []; const idx = [];
    [...original].forEach((ch, i) => {
        const c = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        if (/[a-z0-9]/.test(c)) { letras.push(c); idx.push(i); }
    });
    const comp = letras.join('');
    const clave = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cands = [...new Set(razones.flatMap(r => [r, canonRazon(r)]).flatMap(r => [r, sinFormaJuridica(r)]).map(clave).filter(Boolean))]
        .sort((a, b) => b.length - a.length);
    for (const r of cands) {
        if (!comp.startsWith(r) || r.length >= comp.length) continue;
        const corte = idx[r.length - 1] + 1;
        let resto = original.slice(corte).replace(/^[\s,.\-–—:·()]+/, '').trim();
        if (resto.endsWith(')') && !resto.includes('(')) resto = resto.slice(0, -1).trim();
        if (resto) return resto;
    }
    return original;
}

const claveTxt = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** "Grupo Páramo" → "Páramo": lo que encabeza el nombre de cada PDV. */
export const prefijoDeGrupo = (marca) => String(marca || '').replace(/^\s*grupo\s+/i, '').trim();

/**
 * Nombre del PDV sin la razón social y, si hace falta, encabezado por la marca:
 *   "Inversiones Cold 2024, C.A - Páramo La Urbina" → "Páramo La Urbina"
 *   "Hipermercado Páramo, C.A. (Piedra Azul)" + "Grupo Páramo" → "Páramo Piedra Azul"
 * No antepone nada si el grupo todavía se llama como una razón social (sería
 * volver a meterla), ni si el nombre ya contiene la marca.
 */
export function nombreConMarca(nombre, razones, marca) {
    const original = String(nombre || '').trim();
    const limpio = nombreSinRazon(original, razones);
    if (limpio === original || !marca || marca === INDIVIDUAL) return limpio;
    const pref = prefijoDeGrupo(marca);
    const kp = claveTxt(pref);
    if (!kp) return limpio;
    const esRazon = razones.some(r => [r, canonRazon(r), sinFormaJuridica(r), sinFormaJuridica(canonRazon(r))]
        .some(x => { const k = claveTxt(x); return k && (k === kp || k.startsWith(kp) && kp.length > 12); }));
    if (esRazon) return limpio;
    return claveTxt(limpio).includes(kp) ? limpio : `${pref} ${limpio}`;
}

// ── Piezas ───────────────────────────────────────────────────────────────────

const Chip = ({ tone = 'slate', children, title }) => {
    const t = {
        slate:  'bg-slate-100 text-slate-600',
        green:  'bg-emerald-50 text-emerald-700',
        amber:  'bg-amber-50 text-amber-700',
        red:    'bg-red-50 text-red-700',
        orange: 'bg-orange-100 text-orange-700',
        blue:   'bg-blue-50 text-blue-700',
    }[tone];
    return <span title={title} className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${t}`}>{children}</span>;
};

// ── Componente principal ─────────────────────────────────────────────────────

export default function ListaMaestraPdv() {
    const [pos, setPos]               = useState(null);   // null = cargando
    const [clientes, setClientes]     = useState([]);
    const [vendedores, setVendedores] = useState([]);
    const [error, setError]           = useState('');
    const [msg, setMsg]               = useState('');

    const [filtro, setFiltro]   = useState('todos');
    const [busca, setBusca]     = useState('');
    const [abiertas, setAbiertas] = useState({});
    const [cambiosFrec, setCambiosFrec] = useState({});   // posId → días ('' = 0)
    const [guardando, setGuardando] = useState(false);
    const [trabajando, setTrabajando] = useState('');     // clave de lo que se está guardando

    const [ficha, setFicha]       = useState(null);       // {pos} para crear/editar
    const [exportCfg, setExportCfg] = useState(null);
    const [showDoc, setShowDoc]   = useState(null);

    // Carga TODOS los PDV (activos e inactivos): es la lista maestra. Los
    // eliminados se ocultan.
    useEffect(() => {
        const unsub = onSnapshot(
            collection(db, 'pos'),
            snap => setPos(snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'pos' })).filter(p => p.eliminado !== true)),
            e => { console.error('ListaMaestraPdv pos:', e); setError('No se pudieron cargar los puntos de venta. ' + (e?.message || '')); setPos([]); },
        );
        return () => unsub();
    }, []);

    const cargarClientes = useCallback(async () => {
        try {
            const [cSnap, vSnap] = await Promise.all([
                getDocs(collection(db, 'clientes_zoho')),
                getDocs(query(collection(db, 'users_metadata'), where('role', '==', 'vendedor'))),
            ]);
            setClientes(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setVendedores(vSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es')));
        } catch (e) {
            console.error('ListaMaestraPdv clientes:', e);
        }
    }, []);
    useEffect(() => { cargarClientes(); }, [cargarClientes]);

    // Carnet → cliente, y nombre → cliente (respaldo para lo vinculado por nombre).
    const clientePorCarnet = useMemo(() => {
        const m = new Map();
        clientes.forEach(c => m.set(String(c.customerId || c.id), c));
        return m;
    }, [clientes]);
    const clientePorNombre = useMemo(() => {
        const m = new Map();
        clientes.forEach(c => { const k = norm(c.customerName); if (k) m.set(k, m.has(k) ? null : c); });
        return m;
    }, [clientes]);

    // Estado del vínculo de un PDV con Zoho.
    const vinculo = useCallback((p) => {
        const cid = String(p.zohoCustomerId || '').trim();
        if (cid && clientePorCarnet.has(cid)) return { estado: 'ok', cliente: clientePorCarnet.get(cid) };
        const nom = String(p.razonSocialZoho || '').trim();
        if (!cid && !nom) return { estado: 'sin' };
        const porNombre = clientePorNombre.get(norm(nom));
        if (porNombre) return { estado: 'nombre', cliente: porNombre };
        // Con la lista de clientes aún vacía no se puede afirmar que esté roto.
        if (clientes.length === 0) return { estado: 'ok', cliente: null };
        return { estado: 'roto' };
    }, [clientePorCarnet, clientePorNombre, clientes.length]);

    // PDV con la frecuencia EDITADA (sin guardar) aplicada.
    const lista = useMemo(() => (pos || []).map(p =>
        p.id in cambiosFrec ? { ...p, visitInterval: cambiosFrec[p.id] } : p), [pos, cambiosFrec]);

    const conteo = useMemo(() => {
        const c = { todos: 0, activos: 0, inactivos: 0, food: 0, sinRazon: 0 };
        lista.forEach(p => {
            c.todos++;
            if (esFood(p)) c.food++;
            else if (estaInactivo(p)) c.inactivos++; else c.activos++;
            if (vinculo(p).estado === 'sin' || vinculo(p).estado === 'roto') c.sinRazon++;
        });
        return c;
    }, [lista, vinculo]);

    const pasaFiltro = useCallback((p) => {
        if (filtro === 'activos'   && (esFood(p) || estaInactivo(p))) return false;
        if (filtro === 'inactivos' && !estaInactivo(p)) return false;
        if (filtro === 'food'      && !esFood(p)) return false;
        if (filtro === 'sinRazon'  && !['sin', 'roto'].includes(vinculo(p).estado)) return false;
        const q = norm(busca);
        if (q && !norm(p.name).includes(q) && !norm(p.razonSocialZoho).includes(q)
            && !norm(marcaDePos(p)).includes(q) && !norm(p.city).includes(q)) return false;
        return true;
    }, [filtro, busca, vinculo]);

    // Grupos por MARCA (cadena). Individuales al final.
    const grupos = useMemo(() => {
        const m = new Map();
        lista.forEach(p => {
            const k = marcaDePos(p);
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(p);
        });
        return [...m.entries()].map(([marca, todosPdv]) => {
            todosPdv.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
            // Dentro del grupo, los PDV se ordenan por RAZÓN SOCIAL de Zoho (un
            // grupo como "Grupo Páramo" vive con varias: Inversiones Cold 2024 e
            // Hipermercado Páramo). Lo que no tiene razón social va al final.
            const secciones = new Map();
            todosPdv.forEach(p => {
                const v = vinculo(p);
                const canon = v.cliente ? (v.cliente.razonSocialCanonica || canonRazon(v.cliente.customerName)) : '';
                const k = canon ? norm(canon) : '__sin';
                if (!secciones.has(k)) {
                    secciones.set(k, {
                        clave: k,
                        razon: canon ? {
                            canon,
                            carnets: clientes.filter(c => norm(c.razonSocialCanonica || canonRazon(c.customerName)) === norm(canon)),
                        } : null,
                        todos: [],
                    });
                }
                secciones.get(k).todos.push(p);
            });
            const lista = [...secciones.values()]
                .map(sec => ({ ...sec, visibles: sec.todos.filter(pasaFiltro) }))
                .sort((a, b) => (!a.razon) - (!b.razon) || (a.razon?.canon || '').localeCompare(b.razon?.canon || '', 'es'));
            const razones = lista.filter(sec => sec.razon).map(sec => sec.razon);
            return {
                marca, todos: todosPdv, secciones: lista,
                visibles: todosPdv.filter(pasaFiltro),
                activos: todosPdv.filter(p => !esFood(p) && !estaInactivo(p)).length,
                sinRazon: todosPdv.filter(p => ['sin', 'roto'].includes(vinculo(p).estado)).length,
                razones,
            };
        })
            .filter(g => g.visibles.length > 0)
            .sort((a, b) => (a.marca === INDIVIDUAL) - (b.marca === INDIVIDUAL) || a.marca.localeCompare(b.marca, 'es'));
    }, [lista, pasaFiltro, vinculo, clientes]);

    const filtrando = filtro !== 'todos' || !!busca.trim();
    const estaAbierta = (marca) => abiertas[marca] ?? filtrando;
    const toggle = (marca) => setAbiertas(a => ({ ...a, [marca]: !estaAbierta(marca) }));

    const aviso = (texto) => { setMsg(texto); setError(''); };
    const falla = (texto, e) => { setError(`${texto} ${e?.message || e || ''}`); setMsg(''); };

    // ── Frecuencias (se editan en la lista y se guardan juntas) ─────────────
    const cambiarFrecuencia = (posId, valor) => {
        const limpio = String(valor ?? '').replace(/[^\d]/g, '');
        setCambiosFrec(c => ({ ...c, [posId]: limpio === '' ? '' : Math.max(0, parseInt(limpio, 10)) }));
    };
    const frecuenciaParaMarca = (grupo, dias) => {
        const n = parseInt(dias, 10);
        if (isNaN(n) || n < 0) { falla('Escribe un número de días válido.'); return; }
        setCambiosFrec(c => {
            const next = { ...c };
            grupo.todos.forEach(p => { if (!esFood(p)) next[p.id] = n; });
            return next;
        });
        aviso(`Frecuencia de ${n} días puesta a ${grupo.todos.filter(p => !esFood(p)).length} PDV de "${grupo.marca}". Pulsa "Guardar frecuencias".`);
    };
    const pendientes = Object.keys(cambiosFrec).filter(id => {
        const p = (pos || []).find(x => x.id === id);
        return p && (Number(p.visitInterval) || 0) !== (Number(cambiosFrec[id]) || 0);
    });
    const guardarFrecuencias = async () => {
        if (pendientes.length === 0) { setCambiosFrec({}); return; }
        setGuardando(true);
        try {
            for (let i = 0; i < pendientes.length; i += 400) {
                const batch = writeBatch(db);
                pendientes.slice(i, i + 400).forEach(id => {
                    const dias = Number(cambiosFrec[id]) || 0;
                    batch.set(doc(db, 'pos', id), { visitInterval: dias, active: dias > 0 }, { merge: true });
                });
                await batch.commit();
            }
            aviso(`✓ ${pendientes.length} punto(s) de venta actualizados.`);
            setCambiosFrec({});
        } catch (e) { falla('No se pudieron guardar las frecuencias.', e); }
        finally { setGuardando(false); }
    };

    // ── Marca: nombre para mostrar ──────────────────────────────────────────
    const renombrarMarca = async (grupo, nueva, limpiar) => {
        const destino = nueva.trim() || INDIVIDUAL;
        setTrabajando('marca:' + grupo.marca);
        try {
            const razones = grupo.razones.flatMap(r => [r.canon, ...r.carnets.map(c => c.customerName)]);
            grupo.todos.forEach(p => { if (p.razonSocialZoho) razones.push(p.razonSocialZoho); });
            let renombrados = 0;
            for (let i = 0; i < grupo.todos.length; i += 400) {
                const batch = writeBatch(db);
                grupo.todos.slice(i, i + 400).forEach(p => {
                    const patch = { chain: destino };
                    if (limpiar) {
                        const n = nombreConMarca(p.name, razones, destino);
                        if (n !== p.name) { patch.name = n; renombrados++; }
                    }
                    batch.update(doc(db, 'pos', p.id), patch);
                });
                await batch.commit();
            }
            setAbiertas(a => ({ ...a, [destino]: true }));
            aviso(`✓ "${grupo.marca}" ahora se muestra como "${destino === INDIVIDUAL ? 'Individual' : destino}"`
                + (renombrados ? ` · ${renombrados} nombre(s) de PDV limpiados.` : '.'));
        } catch (e) { falla('No se pudo cambiar el nombre.', e); }
        finally { setTrabajando(''); }
    };

    // ── Razón social: vendedor / oficina / canal (por sus carnets) ──────────
    const accionRazon = async (razon, cambio) => {
        const customerIds = razon.carnets.map(c => String(c.customerId || c.id)).filter(Boolean);
        if (customerIds.length === 0) return;
        setTrabajando('razon:' + razon.canon);
        try {
            const oficina = razon.carnets.every(c => c.esOficina);
            const vendActual = razon.carnets.find(c => c.vendedorId)?.vendedorId || null;
            const payload = { customerIds };
            if (cambio.tipo === 'vendedor') {
                if (cambio.valor === '__oficina') payload.esOficina = true;
                else payload.vendedorId = cambio.valor || null;
            } else {
                payload.esOficina = oficina;
                payload.vendedorId = oficina ? null : vendActual;
                payload.categoria = cambio.valor;
            }
            const fn = httpsCallable(functions, 'asignarClienteVendedor', { timeout: 540000 });
            const { data } = await fn(payload);

            // El canal es del cliente: sus PDV lo heredan.
            if (cambio.tipo === 'canal') {
                const ids = new Set(customerIds);
                const afectados = (pos || []).filter(p => ids.has(String(p.zohoCustomerId || ''))
                    || razon.carnets.some(c => norm(c.customerName) === norm(p.razonSocialZoho)));
                if (afectados.length) {
                    const batch = writeBatch(db);
                    afectados.forEach(p => batch.set(doc(db, 'pos', p.id), cambio.valor === 'foodservice'
                        ? { canal: 'foodservice', sinMerchandising: true, visitInterval: 0, active: true }
                        : { canal: 'retail', sinMerchandising: false }, { merge: true }));
                    await batch.commit();
                }
            }
            await cargarClientes();
            aviso(`✓ ${razon.canon} actualizado${data?.backfilled ? ` · ${data.backfilled} factura(s) re-atribuida(s)` : ''}.`);
        } catch (e) { falla('No se pudo guardar.', e); }
        finally { setTrabajando(''); }
    };

    // ── PDV: eliminar ───────────────────────────────────────────────────────
    const eliminar = async (p) => {
        if (!window.confirm(`¿Eliminar "${p.name}"?\n\nDeja de aparecer en todas las listas (mercaderista, vendedor, seguimiento). Sus reportes de visita se conservan.`)) return;
        setTrabajando('pdv:' + p.id);
        try {
            await updateDoc(doc(db, 'pos', p.id), { eliminado: true, active: false, visitInterval: 0, eliminadoAt: new Date() });
            aviso(`✓ "${p.name}" eliminado.`);
        } catch (e) { falla('No se pudo eliminar.', e); }
        finally { setTrabajando(''); }
    };

    if (pos === null) {
        return <div className="flex justify-center py-16"><Loader size={26} className="animate-spin text-brand-blue" /></div>;
    }

    const FILTROS = [
        { k: 'todos',     label: 'Todos',            n: conteo.todos,     cls: 'text-slate-800' },
        { k: 'activos',   label: 'Activos',          n: conteo.activos,   cls: 'text-emerald-700' },
        { k: 'inactivos', label: 'Inactivos',        n: conteo.inactivos, cls: 'text-slate-500' },
        { k: 'food',      label: 'Foodservice',      n: conteo.food,      cls: 'text-orange-600' },
        { k: 'sinRazon',  label: 'Sin razón social', n: conteo.sinRazon,  cls: 'text-red-600' },
    ];

    const nombresGrupos = grupos.map(g => g.marca).filter(m => m !== INDIVIDUAL);

    // En el teléfono la pantalla se usa de borde a borde (el contenedor del
    // panel ya trae su relleno): sin tarjeta ni márgenes anidados. En pantalla
    // grande vuelve la tarjeta.
    return (
        <div className="-mx-4 sm:mx-0 min-w-0 overflow-x-hidden sm:bg-white sm:p-6 sm:rounded-lg sm:shadow">
            {/* Encabezado */}
            <div className="px-4 sm:px-0 flex flex-col lg:flex-row lg:items-end justify-between gap-3 mb-4">
                <div>
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Store size={20} className="text-brand-blue" /> Clientes y puntos de venta
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">Agrupados por grupo comercial y, dentro de cada grupo, por razón social. Toca un grupo para trabajarlo.</p>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:flex gap-2">
                    <button onClick={() => setFicha({ pos: null })}
                        className="flex items-center justify-center gap-2 bg-brand-yellow text-black font-bold px-4 py-2.5 rounded-lg shadow-sm">
                        <Plus size={18} /> Nuevo punto de venta
                    </button>
                    <button onClick={() => setExportCfg({ estado: 'todos', ciudades: [], canal: 'todos' })}
                        className="flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 font-bold px-4 py-2.5 rounded-lg shadow-sm">
                        <FileDown size={18} /> PDF
                    </button>
                </div>
            </div>

            {/* Resumen que filtra: ocupa todo el ancho */}
            <div className="px-4 sm:px-0 grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
                {FILTROS.map(f => (
                    <button key={f.k} onClick={() => setFiltro(filtro === f.k && f.k !== 'todos' ? 'todos' : f.k)}
                        className={`text-left px-3 py-2.5 rounded-xl border transition-colors ${
                            filtro === f.k ? 'border-brand-blue bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                        <p className={`text-xl font-black leading-none ${f.cls}`}>{f.n}</p>
                        <p className="text-[11px] font-semibold text-slate-500 mt-1 leading-tight">{f.label}</p>
                    </button>
                ))}
            </div>

            <div className="px-4 sm:px-0 relative mb-4">
                <Search size={16} className="absolute left-7 sm:left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar (opcional)"
                    className="w-full pl-9 pr-9 py-2.5 border border-slate-300 rounded-lg text-sm bg-white" />
                {busca && <button onClick={() => setBusca('')} className="absolute right-6 sm:right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400"><X size={16} /></button>}
            </div>

            <div className="px-4 sm:px-0">
                {msg && <p className="mb-3 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-start gap-2"><Check size={16} className="mt-0.5 flex-shrink-0" />{msg}</p>}
                {error && <p className="mb-3 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />{error}</p>}
                {exportCfg && <ExportarPdf cfg={exportCfg} setCfg={setExportCfg} posList={lista} onGenerar={() => setShowDoc(exportCfg)} />}
            </div>
            {showDoc && <PuntosDeVentaDoc posList={lista} estado={showDoc.estado} ciudades={showDoc.ciudades} canal={showDoc.canal} onClose={() => setShowDoc(null)} />}

            {/* Frecuencias sin guardar */}
            {pendientes.length > 0 && (
                <div className="sticky top-0 z-10 mb-3 flex items-center gap-2 px-4 py-3 sm:rounded-lg bg-brand-blue text-white shadow">
                    <p className="text-sm font-semibold flex-grow">{pendientes.length} frecuencia(s) sin guardar</p>
                    <button onClick={() => setCambiosFrec({})} className="text-xs font-semibold px-3 py-1.5 rounded-md bg-white/15">Descartar</button>
                    <button onClick={guardarFrecuencias} disabled={guardando}
                        className="flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-md bg-white text-brand-blue disabled:opacity-60">
                        {guardando ? <Loader size={14} className="animate-spin" /> : <Save size={14} />} Guardar
                    </button>
                </div>
            )}

            {/* Grupos */}
            <div className="space-y-3">
                {grupos.length === 0 && <p className="text-center text-sm text-slate-500 py-10">No hay puntos de venta con este filtro.</p>}
                {grupos.map(g => (
                    <GrupoMarca key={g.marca} g={g} abierta={estaAbierta(g.marca)} onToggle={() => toggle(g.marca)}
                        vinculo={vinculo} vendedores={vendedores} trabajando={trabajando}
                        otrosGrupos={nombresGrupos.filter(n => n !== g.marca)}
                        onRenombrar={renombrarMarca} onFrecuenciaMarca={frecuenciaParaMarca}
                        onAccionRazon={accionRazon} onFrecuencia={cambiarFrecuencia}
                        onAgregar={() => setFicha({ pos: g.marca === INDIVIDUAL ? null : { chain: g.marca } })}
                        onEditar={(p) => setFicha({ pos: p })} onEliminar={eliminar} />
                ))}
            </div>

            {ficha && (
                <FichaPdv pos={ficha.pos} onClose={() => setFicha(null)}
                    onSaved={() => { setFicha(null); cargarClientes(); }} />
            )}
        </div>
    );
}

// ── Un grupo comercial (desplegable) ─────────────────────────────────────────

const Herramienta = ({ titulo, ayuda, children }) => (
    <div className="min-w-0 bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-bold text-slate-800">{titulo}</p>
        {ayuda && <p className="text-xs text-slate-500 mt-0.5 mb-3">{ayuda}</p>}
        {children}
    </div>
);

function GrupoMarca({ g, abierta, onToggle, vinculo, vendedores, trabajando, otrosGrupos, onRenombrar,
    onFrecuenciaMarca, onAccionRazon, onFrecuencia, onAgregar, onEditar, onEliminar }) {
    const individual = g.marca === INDIVIDUAL;
    const razonesTodas = g.razones.flatMap(r => [r.canon, ...r.carnets.map(c => c.customerName)]);
    // Si el grupo todavía se llama como su razón social, el campo arranca
    // vacío: ese nombre es justo lo que hay que cambiar.
    const nombreEsRazon = !individual && razonesTodas.some(r => [canonRazon(r), sinFormaJuridica(canonRazon(r))].some(x => claveTxt(x) === claveTxt(g.marca)));
    const inicial = individual || nombreEsRazon ? '' : g.marca;
    const [nombre, setNombre] = useState(inicial);
    const [limpiar, setLimpiar] = useState(true);
    const [dias, setDias] = useState('');
    const [unirA, setUnirA] = useState('');
    useEffect(() => { setNombre(inicial); }, [inicial]);

    const destino = nombre.trim();
    const ejemplo = destino && g.todos
        .map(p => ({ antes: p.name, despues: nombreConMarca(p.name, [...razonesTodas, p.razonSocialZoho].filter(Boolean), destino) }))
        .find(x => x.antes !== x.despues);
    const vendName = (id) => vendedores.find(v => v.id === id)?.name;
    const vendedoresGrupo = [...new Set(g.razones.map(r => {
        if (r.carnets.length > 0 && r.carnets.every(c => c.esOficina)) return 'Oficina';
        return vendName(r.carnets.find(c => c.vendedorId)?.vendedorId) || 'Sin vendedor';
    }))];
    const ocupadoMarca = trabajando === 'marca:' + g.marca;
    const puedeGuardar = !!destino && (destino !== g.marca || (limpiar && ejemplo));

    return (
        <div className="bg-white border-y sm:border border-slate-200 sm:rounded-xl overflow-hidden">
            <button onClick={onToggle} className="w-full px-4 py-4 flex items-center gap-3 text-left bg-white hover:bg-slate-50">
                <div className="min-w-0 flex-grow">
                    <p className="text-lg font-bold text-slate-900 leading-snug">{individual ? 'Individuales (sin grupo)' : g.marca}</p>
                    <p className="text-sm text-slate-500 mt-0.5">
                        {g.todos.length} PDV · <span className="text-emerald-700 font-semibold">{g.activos} activo{g.activos === 1 ? '' : 's'}</span>
                        {g.razones.length > 0 && <> · {g.razones.length} razón{g.razones.length === 1 ? '' : 'es'} social{g.razones.length === 1 ? '' : 'es'}</>}
                        {vendedoresGrupo.length > 0 && <> · {vendedoresGrupo.join(', ')}</>}
                    </p>
                    {(g.sinRazon > 0 || nombreEsRazon) && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {g.sinRazon > 0 && <Chip tone="red"><Link2Off size={11} /> {g.sinRazon} sin razón social</Chip>}
                            {nombreEsRazon && <Chip tone="amber">Ponle nombre de grupo</Chip>}
                        </div>
                    )}
                </div>
                <ChevronDown className={`flex-shrink-0 text-slate-400 transition-transform ${abierta ? 'rotate-180' : ''}`} />
            </button>

            {abierta && (
                <div className="border-t border-slate-200 min-w-0">
                    {/* Herramientas del grupo: una al lado de la otra en pantalla ancha */}
                    <div className="bg-slate-50 p-3 sm:p-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                        <Herramienta titulo={individual ? 'Formar un grupo' : 'Nombre del grupo'}
                            ayuda={'Es lo que ven el mercaderista y todo GK. Ej.: "Grupo Páramo".'}>
                            <div className="flex gap-2">
                                <input value={nombre} onChange={e => setNombre(e.target.value)}
                                    placeholder={nombreEsRazon ? `Hoy: ${g.marca}` : 'Ej.: Grupo Páramo'}
                                    className="min-w-0 w-0 flex-grow px-3 py-2.5 border border-slate-300 rounded-lg text-sm" />
                                <button disabled={!puedeGuardar || ocupadoMarca} onClick={() => onRenombrar(g, destino, limpiar)}
                                    className="flex-shrink-0 flex items-center gap-1.5 bg-brand-blue text-white font-bold px-4 rounded-lg text-sm disabled:opacity-40">
                                    {ocupadoMarca ? <Loader size={14} className="animate-spin" /> : <Check size={14} />} Guardar
                                </button>
                            </div>
                            {ejemplo && (
                                <label className="flex items-start gap-2 mt-3 text-xs text-slate-600 cursor-pointer">
                                    <input type="checkbox" checked={limpiar} onChange={e => setLimpiar(e.target.checked)} className="mt-0.5" />
                                    <span>Quitar la razón social del nombre de cada PDV.<br />
                                        <span className="text-slate-400 line-through">{ejemplo.antes}</span> → <b className="text-slate-800">{ejemplo.despues}</b></span>
                                </label>
                            )}
                        </Herramienta>

                        {otrosGrupos.length > 0 && (
                            <Herramienta titulo="Unir con otro grupo"
                                ayuda="Si este cliente es parte de un grupo que ya existe (otra razón social del mismo dueño), pásalo allá.">
                                <div className="flex gap-2">
                                    <select value={unirA} onChange={e => setUnirA(e.target.value)}
                                        className="min-w-0 w-0 flex-grow px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white">
                                        <option value="">Elegir grupo…</option>
                                        {otrosGrupos.map(n => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                    <button disabled={!unirA || ocupadoMarca} onClick={() => onRenombrar(g, unirA, true)}
                                        className="flex-shrink-0 bg-slate-800 text-white font-bold px-4 rounded-lg text-sm disabled:opacity-40">Unir</button>
                                </div>
                            </Herramienta>
                        )}

                        <Herramienta titulo="Frecuencia para todo el grupo" ayuda="Días entre visitas. 0 = inactivo (no se borra).">
                            <div className="flex gap-2">
                                <input type="text" inputMode="numeric" value={dias} onChange={e => setDias(e.target.value.replace(/[^\d]/g, ''))}
                                    placeholder="Días" className="w-24 text-center px-3 py-2.5 border border-slate-300 rounded-lg text-sm" />
                                <button onClick={() => onFrecuenciaMarca(g, dias)} disabled={dias === ''}
                                    className="flex-grow sm:flex-grow-0 bg-slate-800 text-white font-bold px-4 rounded-lg text-sm disabled:opacity-40">Aplicar a todos</button>
                            </div>
                        </Herramienta>
                    </div>

                    {/* Los PDV, por razón social */}
                    {g.secciones.filter(sec => sec.visibles.length > 0).map(sec => (
                        <SeccionRazon key={sec.clave} sec={sec} vinculo={vinculo} vendedores={vendedores}
                            trabajando={trabajando} onAccionRazon={onAccionRazon}
                            onFrecuencia={onFrecuencia} onEditar={onEditar} onEliminar={onEliminar} />
                    ))}

                    <div className="p-3 sm:p-4 border-t border-slate-200">
                        <button onClick={onAgregar}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-300 text-sm font-bold text-slate-600 hover:border-brand-blue hover:text-brand-blue">
                            <Plus size={16} /> Agregar punto de venta {individual ? '' : `a ${g.marca}`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Una razón social dentro del grupo: su vendedor, su canal y sus PDV ───────

function SeccionRazon({ sec, vinculo, vendedores, trabajando, onAccionRazon, onFrecuencia, onEditar, onEliminar }) {
    const r = sec.razon;
    const of = r && r.carnets.length > 0 && r.carnets.every(c => c.esOficina);
    const vid = r?.carnets.find(c => c.vendedorId)?.vendedorId || '';
    const food = r?.carnets.some(c => c.categoria === 'foodservice');
    const ocupado = r && trabajando === 'razon:' + r.canon;
    return (
        <section className="border-t border-slate-200">
            <div className="px-4 py-3 bg-slate-100/80 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                <div className="min-w-0 flex-grow">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{r ? 'Razón social' : 'Sin razón social de Zoho'}</p>
                    <p className="text-sm font-bold text-slate-800">
                        {r ? r.canon : 'Ábrelos con Editar y elige su razón social'}
                        <span className="font-normal text-slate-500"> · {sec.todos.length} PDV{r && r.carnets.length > 1 ? ` · ${r.carnets.length} sucursales en Zoho` : ''}</span>
                    </p>
                </div>
                {r && (
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:w-auto min-w-0">
                        <select value={of ? '__oficina' : vid} disabled={ocupado}
                            onChange={e => onAccionRazon(r, { tipo: 'vendedor', valor: e.target.value })}
                            className="min-w-0 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white md:w-52">
                            <option value="">Sin vendedor</option>
                            {vendedores.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                            <option value="__oficina">Oficina (sin comisión)</option>
                        </select>
                        <div className="flex rounded-lg border border-slate-300 overflow-hidden text-xs font-bold bg-white">
                            {ocupado && <span className="px-2 flex items-center"><Loader size={13} className="animate-spin text-brand-blue" /></span>}
                            {[['retail', 'Retail'], ['foodservice', 'Food']].map(([k, l]) => (
                                <button key={k} disabled={ocupado || (k === 'foodservice') === !!food}
                                    onClick={() => onAccionRazon(r, { tipo: 'canal', valor: k })}
                                    className={`px-3 py-2 ${(k === 'foodservice') === !!food ? 'bg-brand-blue text-white' : 'text-slate-600'}`}>{l}</button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <ul className="divide-y divide-slate-100">
                {sec.visibles.map(p => (
                    <FilaPdv key={p.id} p={p} v={vinculo(p)} ocupado={trabajando === 'pdv:' + p.id}
                        onFrecuencia={onFrecuencia} onEditar={onEditar} onEliminar={onEliminar} />
                ))}
            </ul>
        </section>
    );
}

// ── Una fila de PDV ──────────────────────────────────────────────────────────

function FilaPdv({ p, v, ocupado, onFrecuencia, onEditar, onEliminar }) {
    const food = esFood(p);
    const inactivo = estaInactivo(p);
    return (
        <li className={`px-4 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 ${inactivo ? 'bg-slate-50' : ''}`}>
            <div className="min-w-0 flex-grow">
                <p className={`text-base font-semibold ${inactivo ? 'text-slate-500' : 'text-slate-900'}`}>
                    {p.name || <span className="italic text-slate-400">(sin nombre)</span>}
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-slate-500">
                    {v.estado === 'nombre' && <Chip tone="amber" title="Vinculado solo por nombre: ábrelo con Editar y guárdalo">Vínculo por nombre</Chip>}
                    {v.estado === 'roto' && <Chip tone="red" title="Esa razón social ya no existe en Zoho">{p.razonSocialZoho} no está en Zoho</Chip>}
                    {v.estado === 'sin' && <Chip tone="red"><Link2Off size={11} /> Sin razón social</Chip>}
                    {v.estado === 'ok' && p.razonSocialZoho && /\(/.test(p.razonSocialZoho) && (
                        <span className="inline-flex items-center gap-1 text-emerald-700"><Link2 size={11} /> {p.razonSocialZoho.match(/\(([^)]*)\)\s*$/)?.[1] || p.razonSocialZoho}</span>
                    )}
                    {food ? <Chip tone="orange">Foodservice</Chip> : inactivo ? <Chip tone="slate">Inactivo</Chip> : null}
                    {p.tipoDespacho === 'centralizado' && <Chip tone="blue"><Truck size={11} /> Centralizado</Chip>}
                    {p.city && <span className="inline-flex items-center gap-0.5"><MapPin size={11} />{p.city}{p.zone ? ` · ${p.zone}` : ''}</span>}
                </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
                {food ? <span className="text-xs text-orange-600 font-semibold w-[104px]">Sin visitas</span> : (
                    <label className="flex items-center gap-1.5">
                        <input type="text" inputMode="numeric" value={p.visitInterval ?? ''}
                            onChange={(e) => onFrecuencia(p.id, e.target.value)}
                            className="w-14 text-center py-2 border border-slate-300 rounded-lg text-sm" />
                        <span className="text-xs text-slate-500">días</span>
                    </label>
                )}
                <button onClick={() => onEditar(p)} className="flex-grow md:flex-grow-0 flex items-center justify-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:border-brand-blue hover:text-brand-blue">
                    <Pencil size={14} /> Editar
                </button>
                <button onClick={() => onEliminar(p)} disabled={ocupado} title="Eliminar"
                    className="p-2.5 rounded-lg border border-slate-300 text-slate-400 hover:text-red-600 hover:border-red-300 disabled:opacity-40">
                    {ocupado ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
            </div>
        </li>
    );
}

// ── Opciones de exportación a PDF ────────────────────────────────────────────

function ExportarPdf({ cfg, setCfg, posList, onGenerar }) {
    const Pills = ({ campo, opciones }) => (
        <div className="flex gap-2">
            {opciones.map(([val, lbl]) => (
                <button key={val} onClick={() => setCfg(c => ({ ...c, [campo]: val }))}
                    className={`flex-1 px-2 py-2 rounded-lg text-xs font-bold border ${cfg[campo] === val ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-slate-600 border-slate-300'}`}>{lbl}</button>
            ))}
        </div>
    );
    return (
        <div className="mb-4 p-4 border border-slate-200 rounded-xl bg-slate-50">
            <p className="text-sm font-bold text-slate-700 mb-3">Exportar puntos de venta a PDF</p>
            <div className="grid gap-4 sm:grid-cols-2">
                <div><p className="text-xs font-semibold text-slate-500 mb-1.5">Estado</p>
                    <Pills campo="estado" opciones={[['todos', 'Ambos'], ['activos', 'Solo activos'], ['inactivos', 'Solo inactivos']]} /></div>
                <div><p className="text-xs font-semibold text-slate-500 mb-1.5">Canal</p>
                    <Pills campo="canal" opciones={[['todos', 'Ambos'], ['retail', 'Retail'], ['foodservice', 'Foodservice']]} /></div>
            </div>
            <div className="mt-4">
                <p className="text-xs font-semibold text-slate-500 mb-1.5">Ciudades {cfg.ciudades.length > 0 && <span className="text-brand-blue">({cfg.ciudades.length})</span>}</p>
                <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => setCfg(c => ({ ...c, ciudades: [] }))}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border ${cfg.ciudades.length === 0 ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-slate-600 border-slate-300'}`}>Todas</button>
                    {ciudadesDe(posList).map(c => {
                        const sel = cfg.ciudades.includes(c);
                        return <button key={c} onClick={() => setCfg(prev => ({ ...prev, ciudades: sel ? prev.ciudades.filter(x => x !== c) : [...prev.ciudades, c] }))}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${sel ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-slate-600 border-slate-300'}`}>{c}</button>;
                    })}
                </div>
            </div>
            <div className="flex gap-2 mt-4">
                <button onClick={onGenerar} className="flex items-center gap-2 bg-brand-blue text-white font-bold text-sm px-4 py-2 rounded-lg"><FileDown size={16} /> Generar PDF</button>
                <button onClick={() => setCfg(null)} className="text-sm font-semibold text-slate-500 px-3">Cancelar</button>
            </div>
        </div>
    );
}
