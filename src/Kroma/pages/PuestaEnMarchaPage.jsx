// RUTA: src/Kroma/pages/PuestaEnMarchaPage.jsx
//
// PUESTA EN MARCHA — la brújula que a Kroma le faltaba.
//
// El problema que resuelve: para poner una planta a andar hay UN orden válido
// (proveedores → productos → materiales → existencias → fichas → leche →
// producción → despachos) y la app no lo enunciaba en ninguna parte. El menú
// muestra 17 destinos planos; el orden se descubría chocando: entras a
// Materiales y el selector de proveedor está vacío, entras a Producción y no
// hay plantillas.
//
// Decisión del dueño sobre QUIÉN carga: las dos cosas. El máster puede cargar
// todo el histórico por su cuenta, y también puede poner a cada rol a hacer lo
// suyo para que converja. Por eso esto NO es un módulo del máster: es un
// TABLERO COMPARTIDO. Los cuatro roles ven la misma secuencia completa —así
// cada uno entiende dónde encaja su trabajo— pero cada paso solo lo ACCIONA
// quien tiene el permiso (los mismos permisos de la Fase 0, no unos nuevos).
// El que no le toca no ve un botón muerto: ve de quién es y cómo va.
//
// El estado de cada paso se deduce de los DATOS REALES, no de una casilla que
// alguien marca: si hay proveedores, el paso está hecho. Así el tablero no
// puede mentir ni quedar desincronizado.

import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { useKroma } from '../KromaContext';
import { leerSello, declararSello, fmtSello } from '../selloDatos.js';
import {
    Truck, Tag, Package, PackageOpen, BookOpen, Droplets, Factory,
    Warehouse, Check, ChevronRight, Loader, RefreshCw, AlertCircle, ShieldCheck,
} from 'lucide-react';

// Cada paso: qué es, de qué módulo depende el permiso, a qué pantalla lleva y
// cómo se sabe que está hecho. `rol` es informativo — quién lo hace por oficio.
const PASOS = [
    {
        id: 'proveedores', n: 1, titulo: 'Proveedores', Icon: Truck,
        modulo: 'catalogos', vista: 'suppliers', rol: 'Administrador',
        porque: 'Sin proveedor no se puede dar de alta un material: es el primer eslabón.',
        coleccion: 'kroma_suppliers',
    },
    {
        id: 'productos', n: 2, titulo: 'Catálogo de productos', Icon: Tag,
        modulo: 'catalogos', vista: 'products', rol: 'Administrador',
        porque: 'Define qué se produce y en qué presentaciones se vende.',
        coleccion: 'kroma_products',
    },
    {
        id: 'materiales', n: 3, titulo: 'Maestro de materiales', Icon: Package,
        modulo: 'catalogos', vista: 'materials', rol: 'Administrador',
        porque: 'Insumos, empaques y consumibles. Los empaques se asignan acá a su producto.',
        coleccion: 'kroma_materials',
    },
    {
        id: 'existencias', n: 4, titulo: 'Existencias y compras', Icon: PackageOpen,
        modulo: 'inventarioMateriales', vista: 'materials_inv', rol: 'Administrador',
        porque: 'Cuánto hay hoy de cada material y a qué costo. De acá sale el costo promedio ponderado.',
        coleccion: 'kroma_inventory_materials',
    },
    {
        id: 'fichas', n: 5, titulo: 'Fichas técnicas', Icon: BookOpen,
        modulo: 'constructores', vista: 'fichas', rol: 'Operario',
        porque: 'La plantilla del proceso: bloques, dosis por litro y materiales. Sin ella no hay producción.',
        coleccion: 'kroma_fichas',
    },
    {
        id: 'leche', n: 6, titulo: 'Recepción de leche', Icon: Droplets,
        modulo: 'leche', vista: 'milk', rol: 'Operario',
        porque: 'La materia prima que alimenta cada producción. Acepta fecha pasada.',
        coleccion: 'kroma_milk_reception',
    },
    {
        id: 'produccion', n: 7, titulo: 'Producciones', Icon: Factory,
        modulo: 'produccionDiaria', vista: 'production', rol: 'Operario',
        porque: 'Corre la ficha, descuenta insumos y genera el producto terminado.',
        coleccion: 'kroma_production_logs',
    },
    {
        id: 'despachos', n: 8, titulo: 'Despachos', Icon: Warehouse,
        modulo: 'despachos', vista: 'despacho', rol: 'Operario',
        porque: 'La salida del producto terminado hacia Caracas u otros destinos.',
        coleccion: 'kroma_despachos',
        opcional: true,
    },
];

const EMPRESA_FALLBACK = 'lacteoca';

function Chip({ children, tone = 'slate' }) {
    const tones = {
        slate:   'bg-slate-800 text-slate-400 border-slate-700',
        emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        amber:   'bg-amber-500/15 text-amber-400 border-amber-500/30',
    };
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tones[tone]}`}>
            {children}
        </span>
    );
}

function PasoRow({ paso, conteo, listo, puedeAccionar, onIr }) {
    const { Icon } = paso;
    return (
        <div className={`flex items-start gap-3 p-4 rounded-2xl border transition-colors ${
            listo ? 'bg-slate-900 border-slate-800' : 'bg-slate-900 border-slate-700'
        }`}>
            {/* Número / check */}
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                listo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
            }`}>
                {listo ? <Check size={15} /> : paso.n}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <Icon size={14} className={listo ? 'text-emerald-400 shrink-0' : 'text-slate-500 shrink-0'} />
                    <p className={`font-semibold text-sm ${listo ? 'text-slate-200' : 'text-white'}`}>{paso.titulo}</p>
                    <Chip tone={listo ? 'emerald' : 'slate'}>{paso.rol}</Chip>
                    {paso.opcional && !listo && <Chip>opcional</Chip>}
                </div>

                <p className="text-slate-500 text-xs mt-1 leading-snug">{paso.porque}</p>

                <p className="text-xs mt-1.5">
                    {listo
                        ? <span className="text-emerald-400 font-medium">{conteo} cargado{conteo === 1 ? '' : 's'}</span>
                        : <span className="text-slate-500">Sin cargar todavía</span>}
                </p>

                {/* Quien no acciona no ve un botón muerto: ve de quién es. */}
                {!puedeAccionar && !listo && (
                    <p className="text-slate-600 text-xs mt-2 leading-snug">
                        Le toca al {paso.rol.toLowerCase()}. Acá lo ves para saber cómo va,
                        pero no es tu parte.
                    </p>
                )}
            </div>

            {puedeAccionar && (
                <button
                    onClick={() => onIr(paso.vista)}
                    className={`shrink-0 flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-xl transition-colors ${
                        listo
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                >
                    {listo ? 'Revisar' : 'Cargar'} <ChevronRight size={13} />
                </button>
            )}
        </div>
    );
}

export default function PuestaEnMarchaPage({ onNavigate }) {
    const { kromaUser, kromaRole, canEdit } = useKroma();
    // Declarar el sello es del máster: es un juicio sobre la calidad de
    // TODOS los datos, no una tarea de un oficio. Las reglas de Firestore
    // ya restringen la escritura de `kroma_empresas` al máster; esto es el
    // candado de la UI para que a los demás ni se les ofrezca.
    const esMaster = kromaRole === 'master' || kromaRole === 'kroma_owner';
    const empresaId = kromaUser?.empresaId || EMPRESA_FALLBACK;

    const [conteos, setConteos] = useState(null);
    const [sello, setSello]     = useState(null);
    const [selloDraft, setSelloDraft] = useState('');
    const [guardandoSello, setGuardandoSello] = useState(false);
    const [selloError, setSelloError] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');

    const cargar = useCallback(async () => {
        setLoading(true); setError('');
        try {
            // Una sola tanda en paralelo. Cada colección cae a 0 por su cuenta:
            // que una falle no puede dejar el tablero entero en blanco.
            const pares = await Promise.all(PASOS.map(async (p) => {
                try {
                    const snap = await getDocs(query(
                        collection(db, p.coleccion),
                        where('empresaId', '==', empresaId),
                    ));
                    const vivos = snap.docs.filter(d => d.data().active !== false).length;
                    return [p.id, vivos];
                } catch {
                    return [p.id, 0];
                }
            }));
            setConteos(Object.fromEntries(pares));
            const s = await leerSello(empresaId);
            setSello(s);
            setSelloDraft(s || new Date().toISOString().split('T')[0]);
        } catch (e) {
            console.error(e);
            setError('No se pudo leer el estado de la planta. Revisa tu señal y reintenta.');
        } finally {
            setLoading(false);
        }
    }, [empresaId]);

    useEffect(() => { cargar(); }, [cargar]);

    if (loading && !conteos) {
        return (
            <div className="flex justify-center py-16">
                <Loader size={26} className="animate-spin text-emerald-400" />
            </div>
        );
    }

    const estado = PASOS.map(p => ({
        paso: p,
        conteo: conteos?.[p.id] ?? 0,
        listo: (conteos?.[p.id] ?? 0) > 0,
        puedeAccionar: canEdit(p.modulo),
    }));

    const obligatorios = estado.filter(e => !e.paso.opcional);
    const hechos       = obligatorios.filter(e => e.listo).length;
    const total        = obligatorios.length;
    const lista        = hechos === total;
    const mios         = estado.filter(e => e.puedeAccionar && !e.listo);

    return (
        <div className="p-5 md:p-8 max-w-3xl">
            <div className="flex items-start justify-between gap-3 mb-1">
                <h2 className="text-2xl font-bold text-white">Puesta en marcha</h2>
                <button onClick={cargar} disabled={loading}
                    className="shrink-0 flex items-center gap-1.5 text-slate-400 hover:text-white text-xs font-semibold px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors disabled:opacity-50">
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Actualizar
                </button>
            </div>
            <p className="text-slate-400 text-sm mb-6">
                El orden en que se carga una planta. Cada paso necesita que el anterior exista.
            </p>

            {error && (
                <div className="mb-5 bg-rose-500/10 border border-rose-500/40 rounded-2xl p-4 flex items-start gap-3">
                    <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-rose-200 text-sm flex-1">{error}</p>
                </div>
            )}

            {/* Progreso — el mismo número para todos los roles */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-5">
                <div className="flex items-end justify-between mb-2">
                    <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest">Avance</p>
                    <p className="text-white font-mono font-bold text-lg">{hechos}<span className="text-slate-600 text-sm">/{total}</span></p>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${total ? (hechos / total) * 100 : 0}%` }} />
                </div>

                {lista ? (
                    <p className="text-emerald-400 text-sm mt-3 font-medium">
                        La planta está lista para operar. Todo lo que hace falta está cargado.
                    </p>
                ) : mios.length > 0 ? (
                    <p className="text-slate-300 text-sm mt-3">
                        Lo tuyo ahora: <span className="font-semibold text-white">{mios[0].paso.titulo}</span>
                        {mios.length > 1 && <span className="text-slate-500"> · y {mios.length - 1} paso{mios.length - 1 === 1 ? '' : 's'} más</span>}
                    </p>
                ) : (
                    <p className="text-slate-400 text-sm mt-3">
                        No queda nada de tu parte. Lo que falta le toca a otro rol — acá lo ves avanzar.
                    </p>
                )}
            </div>

            <div className="space-y-2.5">
                {estado.map(({ paso, conteo, listo, puedeAccionar }) => (
                    <PasoRow key={paso.id} paso={paso} conteo={conteo} listo={listo}
                        puedeAccionar={puedeAccionar} onIr={onNavigate} />
                ))}
            </div>


            {/* ── El sello: datos confiables desde… ──
                Va al final a propósito: es la firma que cierra el arranque, no
                un campo más del formulario. Con la carga de historia hacia
                atrás, sin esta fecha gerencia no puede distinguir "julio rindió
                mal" de "julio se cargó a medias". */}
            <section className="mt-6 bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                    <ShieldCheck size={18} className={sello ? 'text-emerald-400 shrink-0 mt-0.5' : 'text-slate-600 shrink-0 mt-0.5'} />
                    <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm">Datos confiables desde</p>
                        {sello ? (
                            <p className="text-emerald-400 text-sm mt-1 font-medium">{fmtSello(sello)}</p>
                        ) : (
                            <p className="text-slate-500 text-xs mt-1 leading-snug">
                                Nadie lo ha declarado todavía. Hasta que lo hagas, los tableros de
                                gerencia no pueden decir desde cuándo hay que creerles.
                            </p>
                        )}

                        {esMaster ? (
                            <div className="mt-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <input
                                        type="date"
                                        value={selloDraft}
                                        onChange={e => setSelloDraft(e.target.value)}
                                        className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                                    />
                                    <button
                                        onClick={async () => {
                                            if (!selloDraft) return;
                                            setGuardandoSello(true); setSelloError('');
                                            try {
                                                await declararSello(empresaId, selloDraft, kromaUser);
                                                setSello(selloDraft);
                                            } catch (e) {
                                                console.error(e);
                                                setSelloError('No se pudo guardar. Revisa tu señal e intenta de nuevo.');
                                            } finally { setGuardandoSello(false); }
                                        }}
                                        disabled={guardandoSello || !selloDraft}
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                                    >
                                        {guardandoSello ? 'Guardando…' : sello ? 'Corregir' : 'Declarar'}
                                    </button>
                                </div>
                                <p className="text-slate-600 text-xs mt-2 leading-snug">
                                    Es tu juicio, no un cálculo: la fecha a partir de la cual das los
                                    datos por buenos. Por eso no se deduce sola — el dato más antiguo
                                    cargado puede ser una recepción suelta que no significa que ese mes
                                    esté completo.
                                </p>
                                {selloError && <p className="text-rose-400 text-xs mt-2">{selloError}</p>}
                            </div>
                        ) : (
                            <p className="text-slate-600 text-xs mt-2">Lo declara el máster.</p>
                        )}
                    </div>
                </div>
            </section>

            <p className="text-slate-600 text-xs mt-6 leading-relaxed">
                El estado sale de los datos reales, no de casillas que alguien marca: si hay
                proveedores cargados, el paso figura hecho. Por eso este tablero no se
                desincroniza — y por eso todos, sin importar el rol, ven exactamente lo mismo.
            </p>
        </div>
    );
}
