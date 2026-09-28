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

/**
 * Nombre del PDV sin la razón social y encabezado por la marca:
 * "Hipermercado Páramo, C.A. (Piedra Azul)" + marca "Páramo" → "Páramo Piedra Azul".
 * Si el nombre ya empieza por la marca, no la repite.
 */
export function nombreConMarca(nombre, razones, marca) {
    const limpio = nombreSinRazon(nombre, razones);
    if (limpio === String(nombre || '').trim() || !marca || marca === INDIVIDUAL) return limpio;
    return norm(limpio).startsWith(norm(marca)) ? limpio : `${marca} ${limpio}`;
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

const PasoMarca = ({ n, titulo, ayuda, children }) => (
    <div className="p-3 sm:p-4 border-b border-slate-200 last:border-b-0">
        <p className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-brand-blue text-white text-[11px] flex items-center justify-center flex-shrink-0">{n}</span>
            {titulo}
        </p>
        {ayuda && <p className="text-xs text-slate-500 mt-1 ml-7">{ayuda}</p>}
        <div className="mt-2 ml-7">{children}</div>
    </div>
);

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
            // Razones sociales de Zoho de la marca, agrupadas (con todas sus sucursales).
            const razones = new Map();
            todosPdv.forEach(p => {
                const v = vinculo(p);
                if (!v.cliente) return;
                const canon = v.cliente.razonSocialCanonica || canonRazon(v.cliente.customerName);
                if (!razones.has(norm(canon))) {
                    const carnets = clientes.filter(c => norm(c.razonSocialCanonica || canonRazon(c.customerName)) === norm(canon));
                    razones.set(norm(canon), { canon, carnets });
                }
            });
            return {
                marca, todos: todosPdv,
                visibles: todosPdv.filter(pasaFiltro),
                activos: todosPdv.filter(p => !esFood(p) && !estaInactivo(p)).length,
                sinRazon: todosPdv.filter(p => ['sin', 'roto'].includes(vinculo(p).estado)).length,
                razones: [...razones.values()].sort((a, b) => a.canon.localeCompare(b.canon, 'es')),
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

    return (
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
            {/* Encabezado */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
                <div>
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Store size={20} className="text-brand-blue" /> Clientes y puntos de venta
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">Todos tus puntos de venta, agrupados por marca. Toca una marca para verla y trabajarla.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => setFicha({ pos: null })}
                        className="flex items-center gap-2 bg-brand-yellow text-black font-bold px-4 py-2 rounded-lg shadow-sm">
                        <Plus size={18} /> Nuevo punto de venta
                    </button>
                    <button onClick={() => setExportCfg({ estado: 'todos', ciudades: [], canal: 'todos' })}
                        className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 font-bold px-4 py-2 rounded-lg shadow-sm">
                        <FileDown size={18} /> PDF
                    </button>
                </div>
            </div>

            {/* Cómo funciona: tres pasos */}
            <ol className="grid sm:grid-cols-3 gap-2 mb-4">
                {[
                    ['Crea el punto de venta', 'Razón social de Zoho → nombre → marca → retail/foodservice → despacho.'],
                    ['Ordena por marca', 'Dentro de cada marca: cómo se llama, quién la vende y cada cuánto se visita.'],
                    ['Ajusta cada PDV', 'Frecuencia, editar o eliminar, desde su fila.'],
                ].map(([t, d], i) => (
                    <li key={t} className="flex gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="w-6 h-6 rounded-full bg-brand-blue text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                        <div><p className="text-sm font-bold text-slate-700">{t}</p><p className="text-xs text-slate-500">{d}</p></div>
                    </li>
                ))}
            </ol>

            {/* Resumen que filtra */}
            <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
                {FILTROS.map(f => (
                    <button key={f.k} onClick={() => setFiltro(filtro === f.k && f.k !== 'todos' ? 'todos' : f.k)}
                        className={`flex-shrink-0 text-left px-3 py-2 rounded-lg border transition-colors ${
                            filtro === f.k ? 'border-brand-blue bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                        <p className={`text-lg font-black leading-none ${f.cls}`}>{f.n}</p>
                        <p className="text-[11px] font-semibold text-slate-500 mt-1 whitespace-nowrap">{f.label}</p>
                    </button>
                ))}
            </div>

            <div className="relative mb-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nombre, marca, razón social o ciudad (opcional)"
                    className="w-full pl-9 pr-9 py-2 border border-slate-300 rounded-lg text-sm" />
                {busca && <button onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400"><X size={16} /></button>}
            </div>

            {msg && <p className="mb-3 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-start gap-2"><Check size={16} className="mt-0.5 flex-shrink-0" />{msg}</p>}
            {error && <p className="mb-3 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />{error}</p>}

            {/* Frecuencias sin guardar */}
            {pendientes.length > 0 && (
                <div className="sticky top-0 z-10 mb-3 flex items-center gap-2 p-3 rounded-lg bg-brand-blue text-white shadow">
                    <p className="text-sm font-semibold flex-grow">{pendientes.length} frecuencia(s) sin guardar</p>
                    <button onClick={() => setCambiosFrec({})} className="text-xs font-semibold px-3 py-1.5 rounded-md bg-white/15">Descartar</button>
                    <button onClick={guardarFrecuencias} disabled={guardando}
                        className="flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-md bg-white text-brand-blue disabled:opacity-60">
                        {guardando ? <Loader size={14} className="animate-spin" /> : <Save size={14} />} Guardar frecuencias
                    </button>
                </div>
            )}

            {/* Exportar PDF */}
            {exportCfg && <ExportarPdf cfg={exportCfg} setCfg={setExportCfg} posList={lista} onGenerar={() => setShowDoc(exportCfg)} />}
            {showDoc && <PuntosDeVentaDoc posList={lista} estado={showDoc.estado} ciudades={showDoc.ciudades} canal={showDoc.canal} onClose={() => setShowDoc(null)} />}

            {/* Marcas */}
            <div className="space-y-2">
                {grupos.length === 0 && <p className="text-center text-sm text-slate-500 py-10">No hay puntos de venta con este filtro.</p>}
                {grupos.map(g => (
                    <GrupoMarca key={g.marca} g={g} abierta={estaAbierta(g.marca)} onToggle={() => toggle(g.marca)}
                        vinculo={vinculo} vendedores={vendedores} trabajando={trabajando}
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

// ── Una marca (desplegable) ──────────────────────────────────────────────────

function GrupoMarca({ g, abierta, onToggle, vinculo, vendedores, trabajando, onRenombrar, onFrecuenciaMarca,
    onAccionRazon, onFrecuencia, onAgregar, onEditar, onEliminar }) {
    const [nombre, setNombre] = useState(g.marca === INDIVIDUAL ? '' : g.marca);
    const [limpiar, setLimpiar] = useState(true);
    const [dias, setDias] = useState('');
    useEffect(() => { setNombre(g.marca === INDIVIDUAL ? '' : g.marca); }, [g.marca]);

    const individual = g.marca === INDIVIDUAL;
    const razonesTodas = g.razones.flatMap(r => [r.canon, ...r.carnets.map(c => c.customerName)]);
    const ejemplo = g.todos.map(p => ({ antes: p.name, despues: nombreConMarca(p.name, [...razonesTodas, p.razonSocialZoho].filter(Boolean), nombre.trim()) }))
        .find(x => x.antes !== x.despues);
    const vendName = (id) => vendedores.find(v => v.id === id)?.name;
    const cambiaNombre = (nombre.trim() || INDIVIDUAL) !== g.marca;
    const ocupadoMarca = trabajando === 'marca:' + g.marca;

    return (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
            <button onClick={onToggle} className="w-full bg-slate-50 p-4 flex items-center gap-3 text-left">
                <div className="min-w-0 flex-grow">
                    <p className="font-bold text-slate-800 truncate">{individual ? 'Individuales (sin marca)' : g.marca}
                        <span className="text-slate-400 font-semibold"> ({g.todos.length})</span></p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <Chip tone="green">{g.activos} activo{g.activos === 1 ? '' : 's'}</Chip>
                        {g.sinRazon > 0 && <Chip tone="red"><Link2Off size={11} /> {g.sinRazon} sin razón social</Chip>}
                        {!individual && g.razones.map(r => {
                            const vid = r.carnets.find(c => c.vendedorId)?.vendedorId;
                            const of = r.carnets.length > 0 && r.carnets.every(c => c.esOficina);
                            return <Chip key={r.canon} tone="slate" title={r.canon}>
                                <span className="max-w-[180px] truncate">{r.canon}</span>
                                <span className="text-slate-400">· {of ? 'Oficina' : (vendName(vid) || 'sin vendedor')}</span>
                            </Chip>;
                        })}
                    </div>
                </div>
                <ChevronDown className={`flex-shrink-0 text-slate-500 transition-transform ${abierta ? 'rotate-180' : ''}`} />
            </button>

            {abierta && (
                <div>
                    {/* Herramientas de la marca, paso a paso */}
                    <div className="bg-slate-100/70 border-y border-slate-200">
                        <PasoMarca n="1" titulo={individual ? 'Agrupar en una marca' : 'Nombre que se muestra'}
                            ayuda={individual
                                ? 'Estos PDV no tienen marca. Escribe una para agruparlos todos (o usa Editar en cada uno).'
                                : 'Es lo que ven el mercaderista y todo GK (p.ej. "Páramo" en vez de "Inversiones Cold 2024, C.A").'}>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre de la marca"
                                    className="flex-grow p-2 border border-slate-300 rounded-md text-sm" />
                                <button disabled={!cambiaNombre && !(limpiar && ejemplo) || ocupadoMarca}
                                    onClick={() => onRenombrar(g, nombre, limpiar)}
                                    className="flex items-center justify-center gap-1.5 bg-brand-blue text-white font-semibold px-4 py-2 rounded-md text-sm disabled:opacity-40">
                                    {ocupadoMarca ? <Loader size={14} className="animate-spin" /> : <Check size={14} />} Guardar
                                </button>
                            </div>
                            {ejemplo && (
                                <label className="flex items-start gap-2 mt-2 text-xs text-slate-600 cursor-pointer">
                                    <input type="checkbox" checked={limpiar} onChange={e => setLimpiar(e.target.checked)} className="mt-0.5" />
                                    <span>Quitar la razón social del nombre de los PDV. Ej.: <i>{ejemplo.antes}</i> → <b>{ejemplo.despues}</b></span>
                                </label>
                            )}
                        </PasoMarca>

                        {g.razones.length > 0 && (
                            <PasoMarca n="2" titulo="Razón social de Zoho: vendedor y canal"
                                ayuda="A quién se le atribuyen las facturas y cómo se le vende. Aplica a todas sus sucursales.">
                                <div className="space-y-2">
                                    {g.razones.map(r => {
                                        const of = r.carnets.length > 0 && r.carnets.every(c => c.esOficina);
                                        const vid = r.carnets.find(c => c.vendedorId)?.vendedorId || '';
                                        const food = r.carnets.some(c => c.categoria === 'foodservice');
                                        const ocupado = trabajando === 'razon:' + r.canon;
                                        return (
                                            <div key={r.canon} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-white rounded-md border border-slate-200">
                                                <p className="text-sm font-semibold text-slate-700 flex-grow min-w-0">
                                                    {r.canon}
                                                    {r.carnets.length > 1 && <span className="text-xs text-slate-400 font-normal"> · {r.carnets.length} sucursales en Zoho</span>}
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    {ocupado && <Loader size={14} className="animate-spin text-brand-blue" />}
                                                    <select value={of ? '__oficina' : vid} disabled={ocupado}
                                                        onChange={e => onAccionRazon(r, { tipo: 'vendedor', valor: e.target.value })}
                                                        className="p-1.5 border border-slate-300 rounded-md text-sm">
                                                        <option value="">Sin vendedor</option>
                                                        {vendedores.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                                        <option value="__oficina">Oficina (sin comisión)</option>
                                                    </select>
                                                    <div className="flex rounded-md border border-slate-300 overflow-hidden text-xs font-bold">
                                                        {[['retail', 'Retail'], ['foodservice', 'Foodservice']].map(([k, l]) => (
                                                            <button key={k} disabled={ocupado || (k === 'foodservice') === food}
                                                                onClick={() => onAccionRazon(r, { tipo: 'canal', valor: k })}
                                                                className={`px-2.5 py-1.5 ${(k === 'foodservice') === food ? 'bg-brand-blue text-white' : 'bg-white text-slate-600'}`}>{l}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </PasoMarca>
                        )}

                        <PasoMarca n={g.razones.length > 0 ? '3' : '2'} titulo="Frecuencia de visita para toda la marca"
                            ayuda="Días entre visitas. 0 = inactivo (no se borra). Luego pulsa Guardar frecuencias.">
                            <div className="flex gap-2">
                                <input type="text" inputMode="numeric" value={dias} onChange={e => setDias(e.target.value.replace(/[^\d]/g, ''))}
                                    placeholder="Días" className="w-24 text-center p-2 border border-slate-300 rounded-md text-sm" />
                                <button onClick={() => onFrecuenciaMarca(g, dias)} disabled={dias === ''}
                                    className="bg-slate-700 text-white font-semibold px-4 py-2 rounded-md text-sm disabled:opacity-40">Aplicar a todos</button>
                            </div>
                        </PasoMarca>
                    </div>

                    {/* Los PDV */}
                    <ul className="divide-y divide-slate-200">
                        {g.visibles.map(p => (
                            <FilaPdv key={p.id} p={p} v={vinculo(p)} ocupado={trabajando === 'pdv:' + p.id}
                                onFrecuencia={onFrecuencia} onEditar={onEditar} onEliminar={onEliminar} />
                        ))}
                    </ul>
                    <div className="p-3 bg-white border-t border-slate-200">
                        <button onClick={onAgregar}
                            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border-2 border-dashed border-slate-300 text-sm font-bold text-slate-600 hover:border-brand-blue hover:text-brand-blue">
                            <Plus size={16} /> Agregar punto de venta {individual ? '' : `a ${g.marca}`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Una fila de PDV ──────────────────────────────────────────────────────────

function FilaPdv({ p, v, ocupado, onFrecuencia, onEditar, onEliminar }) {
    const food = esFood(p);
    const inactivo = estaInactivo(p);
    return (
        <li className={`p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${inactivo ? 'bg-slate-50/60' : ''}`}>
            <div className="min-w-0 flex-grow">
                <p className={`font-semibold ${inactivo ? 'text-slate-500' : 'text-slate-900'}`}>
                    {p.name || <span className="italic text-slate-400">(sin nombre)</span>}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {v.estado === 'ok' && <Chip tone="green" title="Vinculado al carnet de Zoho"><Link2 size={11} /> {p.razonSocialZoho || v.cliente?.customerName || 'Zoho'}</Chip>}
                    {v.estado === 'nombre' && <Chip tone="amber" title="Vinculado por nombre: ábrelo con Editar y guárdalo para amarrarlo al carnet"><Link2 size={11} /> {p.razonSocialZoho}</Chip>}
                    {v.estado === 'roto' && <Chip tone="red" title="Esa razón social ya no existe en Zoho: elígela de nuevo con Editar"><Link2Off size={11} /> {p.razonSocialZoho} (no está en Zoho)</Chip>}
                    {v.estado === 'sin' && <Chip tone="red"><Link2Off size={11} /> Sin razón social de Zoho</Chip>}
                    {food ? <Chip tone="orange">Foodservice · sin visitas</Chip>
                        : inactivo ? <Chip tone="slate">INACTIVO</Chip> : null}
                    {p.tipoDespacho === 'centralizado' && <Chip tone="blue"><Truck size={11} /> Centralizado</Chip>}
                    {p.city && <span className="text-[11px] text-slate-400 inline-flex items-center gap-0.5"><MapPin size={11} />{p.city}{p.zone ? ` · ${p.zone}` : ''}</span>}
                </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
                {!food && (
                    <label className="flex items-center gap-1.5">
                        <input type="text" inputMode="numeric" value={p.visitInterval ?? ''}
                            onChange={(e) => onFrecuencia(p.id, e.target.value)}
                            className="w-16 text-center p-2 border border-slate-300 rounded-md" />
                        <span className="text-sm text-slate-500">días</span>
                    </label>
                )}
                <button onClick={() => onEditar(p)} className="flex items-center gap-1 text-sm font-semibold px-3 py-2 rounded-md border border-slate-300 text-slate-700 hover:border-brand-blue hover:text-brand-blue">
                    <Pencil size={14} /> Editar
                </button>
                <button onClick={() => onEliminar(p)} disabled={ocupado} title="Eliminar"
                    className="p-2 rounded-md border border-slate-300 text-slate-400 hover:text-red-600 hover:border-red-300 disabled:opacity-40">
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
