// RUTA: src/Pages/TableroGerencial.jsx
//
// TABLERO GERENCIAL — la portada del gerente/dueño, rediseñada a pedido suyo
// para responder OCHO preguntas del negocio, no quince indicadores de campo:
//
//   ① ¿Qué nos deben?      ⑤ ¿Cuánto vendimos?
//   ② ¿Qué debemos?        ⑥ ¿Cuánto nos devolvieron?
//   ③ ¿A quién le vendemos? ⑦ ¿Cuánto compramos?
//   ④ ¿A quién le compramos? ⑧ ¿Cuánto produjimos?
//
// Cada tarjeta trae UNA cifra que se entiende sola y se abre para ver el
// detalle. Los cuatro últimos cruzan la frontera GK ↔ Kroma: el gerente ve la
// planta sin salir de su app (las reglas abren esas colecciones en LECTURA).
//
// Decisión del dueño: este tablero REEMPLAZA la portada anterior (15 KPIs de
// campo + bandas). Ese trabajo no se borró — `GerencialDashboard.jsx` sigue en
// el código y se alcanza desde "Ventas / histórico" → "Indicadores de campo",
// para no perder la auditoría de KPIs de 2026-07.

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    Wallet, Receipt, Users, Truck, TrendingUp, RotateCcw, ShoppingCart, Factory, FileText,
    X, AlertTriangle, Search, ChevronRight,
} from 'lucide-react';
import { useTableroGerencial, ultimosMeses } from '@/hooks/useTableroGerencial.js';
import { fechaProduccion } from '@/Kroma/estadoPlanta.js';
import { SECCIONES_COMPRA } from '@/utils/tableroPlanta.js';
import DossierComercialDoc from '@/Components/DossierComercialDoc.jsx';
import CarteraVencidaModal from '@/Components/CarteraVencidaModal.jsx';

const money  = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-VE')}`;
const num    = (n) => (Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 });
const toDate = (t) => t?.toDate?.() || (t ? new Date(t) : null);
const fmt    = (d) => d ? d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

// ── Tarjeta ──────────────────────────────────────────────────────────────────
const Card = ({ n, icon: Icon, titulo, valor, sub, nota, tono = 'slate', onClick, disabled }) => {
    const TONO = {
        slate:   'border-slate-200',
        emerald: 'border-emerald-200',
        red:     'border-red-200',
        amber:   'border-amber-200',
    }[tono] || 'border-slate-200';
    const ICONO = {
        slate: 'bg-slate-100 text-slate-500', emerald: 'bg-emerald-50 text-emerald-600',
        red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600',
    }[tono];
    const Tag = onClick && !disabled ? 'button' : 'div';
    return (
        <Tag
            {...(onClick && !disabled ? { type: 'button', onClick } : {})}
            className={`relative bg-white border ${TONO} rounded-2xl p-4 text-left w-full min-w-0 overflow-hidden shadow-sm
                ${onClick && !disabled ? 'hover:shadow-md hover:border-slate-300 transition-all' : ''}
                ${disabled ? 'opacity-70' : ''}`}
        >
            {/* El título va en su propia línea y a todo el ancho. Antes compartía
                fila con el ícono y el número y llevaba `truncate`: en dos
                columnas de teléfono, "Cuentas por cobrar" y "Devoluciones del
                mes" se cortaban — y una tarjeta cuyo nombre no se lee completo
                no dice qué está mostrando. */}
            <div className="flex items-start justify-between gap-2">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${ICONO}`}><Icon size={16} /></span>
                <span className="text-[10px] font-extrabold text-slate-300 shrink-0">{n}</span>
            </div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mt-2 leading-tight">{titulo}</p>
            <p className="text-2xl font-black text-slate-800 tabular-nums mt-1 truncate">{valor}</p>
            {sub  && <p className="text-xs text-slate-500 mt-0.5 leading-snug">{sub}</p>}
            {nota && <p className="text-[11px] text-slate-400 mt-1 leading-snug">{nota}</p>}
            {onClick && !disabled && (
                <span className="absolute bottom-3 right-3 text-slate-300"><ChevronRight size={16} /></span>
            )}
        </Tag>
    );
};

// ── Hoja de detalle genérica ────────────────────────────────────────────────
const Hoja = ({ titulo, subtitulo, onClose, children }) => createPortal(
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
        <div className="bg-slate-50 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col shadow-2xl"
             onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
                <div className="min-w-0">
                    <h2 className="text-lg font-black text-slate-800 truncate">{titulo}</h2>
                    {subtitulo && <p className="text-xs text-slate-500">{subtitulo}</p>}
                </div>
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-200 text-slate-500 shrink-0"><X size={20} /></button>
            </div>
            <div className="px-5 py-4 overflow-y-auto">{children}</div>
        </div>
    </div>,
    document.body,
);

/** Barras por mes — el histórico que pidió el dueño, sin librería de gráficos. */
const PorMes = ({ datos, valorDe, formato = money0, etiqueta = '' }) => {
    const meses = ultimosMeses(12);
    const vals = meses.map(m => valorDe(datos[m.key]) || 0);
    const max = Math.max(1, ...vals);
    const hayAlgo = vals.some(v => v > 0);
    if (!hayAlgo) {
        return <p className="text-sm text-slate-400 text-center py-8">Todavía no hay histórico {etiqueta}.</p>;
    }
    return (
        <div className="space-y-1.5">
            {meses.map((m, i) => (
                <div key={m.key} className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 w-14 shrink-0 tabular-nums">{m.label}</span>
                    <div className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden">
                        <div className="h-full bg-brand-blue/80 rounded-md transition-all"
                             style={{ width: `${(vals[i] / max) * 100}%` }} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 tabular-nums w-20 text-right shrink-0">
                        {vals[i] > 0 ? formato(vals[i]) : '—'}
                    </span>
                </div>
            ))}
        </div>
    );
};

/** Lista con buscador — clientes, proveedores, facturas por pagar… */
const Lista = ({ items, render, placeholder = 'Buscar…', clave, vacio = 'Nada que mostrar.' }) => {
    const [term, setTerm] = useState('');
    const vis = useMemo(() => {
        const t = term.trim().toLowerCase();
        return t ? items.filter(i => clave(i).toLowerCase().includes(t)) : items;
    }, [items, term, clave]);
    return (
        <>
            {items.length > 6 && (
                <div className="relative mb-3">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={term} onChange={e => setTerm(e.target.value)} placeholder={placeholder}
                        className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-slate-400" />
                </div>
            )}
            {vis.length === 0
                ? <p className="text-sm text-slate-400 text-center py-8">{items.length === 0 ? vacio : 'Nada con esa búsqueda.'}</p>
                : <div className="space-y-2">{vis.map(render)}</div>}
        </>
    );
};

const Fila = ({ titulo, sub, derecha, subDerecha, tono }) => (
    <div className={`bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3 ${tono ? `border-l-4 ${tono}` : ''}`}>
        <div className="min-w-0">
            <p className="font-bold text-slate-800 text-sm truncate">{titulo}</p>
            {sub && <p className="text-[11px] text-slate-400 truncate">{sub}</p>}
        </div>
        <div className="text-right shrink-0">
            <p className="font-black text-slate-800 tabular-nums text-sm whitespace-nowrap">{derecha}</p>
            {subDerecha && <p className="text-[11px] text-slate-400 whitespace-nowrap">{subDerecha}</p>}
        </div>
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// `onIrComercial(tab)`: las tarjetas 03 (clientes) y 05 (ventas) llevan a la
// sección Comercial en vez de repetir aquí sus listas (decisión del dueño,
// 2026-09: una información no debe vivir repetida en dos secciones).
export default function TableroGerencial({ onVerIndicadores = null, onIrComercial = null }) {
    const t = useTableroGerencial();
    const [abierto, setAbierto] = useState(null);   // clave de la hoja abierta
    const [dossier, setDossier] = useState(false);
    const k = t.kpis;

    if (t.loading && !k) {
        return (
            <div className="p-4 md:p-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-28 rounded-2xl bg-white border border-slate-200 animate-pulse" />
                ))}
            </div>
        );
    }
    if (!k) return <p className="p-6 text-sm text-slate-500">{t.error || 'Sin datos.'}</p>;

    // Capital inmovilizado en insumos: el mismo cálculo que el inicio de
    // gerencia de Kroma (stock × precio del maestro). Antes esta cifra salía
    // de un campo que no existe en el inventario y daba siempre $0,00.
    const capitalInsumos = k.capitalInsumos || 0;
    const compra = k.compra || { items: [], sinMinimo: [], sinInventario: [], totalProduccion: 0, totalOtros: 0, sinPrecio: 0 };
    const nComprar = compra.items.length;
    const estadoPP = k.estadoPorPagar;

    const provPorId = {};
    (t.proveedores || []).forEach(p => { provPorId[p.id] = p.nombreComercial || p.nombre || p.nombreFiscal || '—'; });

    const cerrar = () => setAbierto(null);

    return (
        <div className="p-4 md:p-6 space-y-4">
            <div className="flex items-end justify-between gap-3 flex-wrap">
                <div>
                    <h2 className="text-xl font-black text-slate-800 tracking-tight">Tablero Gerencial</h2>
                    <p className="text-sm text-slate-500">El negocio de un vistazo. Toca cualquier tarjeta para ver el detalle.</p>
                </div>
                <div className="flex items-center gap-2">
                    {/* El dossier lo generan gerencia y el máster: es el documento
                        que se le entrega a un tercero que evalúa distribuir. */}
                    <button type="button" onClick={() => setDossier(true)}
                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 rounded-xl px-3 py-2">
                        <FileText size={14} /> Dossier comercial
                    </button>
                    {onVerIndicadores && (
                        <button type="button" onClick={onVerIndicadores}
                            className="text-xs font-bold text-brand-blue bg-white border border-slate-200 rounded-xl px-3 py-2 hover:shadow-md">
                            Indicadores de campo →
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card n="01" icon={Wallet} titulo="Cuentas por cobrar" tono={k.cobrarVencido > 0 ? 'red' : 'emerald'}
                    valor={money0(k.porCobrar)}
                    sub={`${num(k.nPorCobrar)} factura${k.nPorCobrar === 1 ? '' : 's'} abiertas`}
                    nota={k.cobrarVencido > 0 ? `${money0(k.cobrarVencido)} ya vencido` : 'Nada vencido'}
                    onClick={() => setAbierto('cobrar')} />

                <Card n="02" icon={Receipt} titulo="Cuentas por pagar" tono={k.pagarVencido > 0 ? 'red' : 'slate'}
                    valor={k.nPorPagar > 0 ? money0(k.porPagar) : '—'}
                    sub={k.nPorPagar > 0 ? `${num(k.nPorPagar)} factura${k.nPorPagar === 1 ? '' : 's'} de proveedor`
                        : estadoPP?.autorizado ? 'Nada pendiente con proveedores' : 'Sin datos de Zoho todavía'}
                    nota={k.nPorPagar > 0
                        ? (k.pagarVencido > 0 ? `${money0(k.pagarVencido)} ya vencido` : 'Nada vencido')
                        : estadoPP?.autorizado ? 'Según la última lectura de Zoho'
                        : 'Zoho no autoriza leer facturas de proveedor'}
                    onClick={() => setAbierto('pagar')} />

                {/* El número grande son los PUNTOS DE VENTA ACTIVOS: es lo que
                    el socio quiere ver de un vistazo. La hoja los abre por
                    razón social, cada cliente con sus puntos adentro. */}
                <Card n="03" icon={Users} titulo="Lista de clientes" tono="emerald"
                    valor={num(k.nPdvActivos)}
                    sub={`puntos de venta activos · ${num(k.clientesConPdv.length)} cliente${k.clientesConPdv.length === 1 ? '' : 's'}`}
                    nota={`${num(k.nPdvInactivos)} inactivo${k.nPdvInactivos === 1 ? '' : 's'} · ${num(k.ciudades.length)} ciudad${k.ciudades.length === 1 ? '' : 'es'}`}
                    disabled={!onIrComercial} onClick={() => onIrComercial?.('clientes')} />

                <Card n="04" icon={Truck} titulo="Lista de proveedores" valor={num(k.nProveedores)}
                    tono={k.provConDeuda > 0 ? 'amber' : 'slate'}
                    sub={`${num(k.provConCompras)} con compras registradas`}
                    nota={k.nProveedores === 0 ? 'Sin acceso o sin datos migrados'
                        : k.nPorPagar > 0 ? `Se le debe a ${num(k.provConDeuda)}: ${money0(k.porPagar)}`
                        : 'Deuda: sin datos de Zoho'}
                    onClick={() => setAbierto('proveedores')} />

                <Card n="05" icon={TrendingUp} titulo="Ventas / histórico" tono="emerald"
                    valor={money0(k.ventasMes)}
                    sub={`${num(k.ventasMesN)} factura${k.ventasMesN === 1 ? '' : 's'} este mes`}
                    nota="Meta, histórico y ventas por cliente →"
                    disabled={!onIrComercial} onClick={() => onIrComercial?.('meta')} />

                <Card n="06" icon={RotateCcw} titulo="Devoluciones / histórico"
                    tono={k.devMes > 0 ? 'amber' : 'slate'}
                    valor={`${num(k.devMes)} uds`}
                    sub={k.devMesMonto > 0 ? `${money0(k.devMesMonto)} en notas de crédito` : 'Sin notas de crédito'}
                    nota="Toca para el histórico de 12 meses"
                    onClick={() => setAbierto('devoluciones')} />

                <Card n="07" icon={ShoppingCart} titulo="Compras por hacer"
                    tono={compra.items.some(i => i.agotado) ? 'red' : nComprar > 0 ? 'amber' : 'slate'}
                    valor={nComprar > 0 ? money0(compra.totalProduccion) : '—'}
                    sub={nComprar > 0
                        ? `${num(nComprar)} insumo${nComprar === 1 ? '' : 's'} en su mínimo o por debajo`
                        : 'Ningún insumo bajo su mínimo'}
                    nota={`${money0(capitalInsumos)} inmovilizado en insumos`}
                    onClick={() => setAbierto('compras')} />

                <Card n="08" icon={Factory} titulo="Producción"
                    tono={k.lotesActivos.length > 0 ? 'emerald' : 'slate'}
                    valor={`${num(k.lotesActivos.length)} activo${k.lotesActivos.length === 1 ? '' : 's'}`}
                    sub={k.lotesActivos.length > 0 ? `${num(k.litrosEnCurso)} L en proceso` : 'Ningún lote en proceso ahora'}
                    nota={k.lotesSinEnvasar > 0
                        ? `${num(k.lotesSinEnvasar)} lote${k.lotesSinEnvasar === 1 ? '' : 's'} con queso sin envasar · costos por lote →`
                        : 'Rendimiento y costo por lote →'}
                    onClick={() => setAbierto('produccion')} />

            </div>

            {/* ── Hojas de detalle ─────────────────────────────────────────── */}
            {abierto === 'cobrar' && (
                <CarteraVencidaModal facturas={t.facturas || []} minDias={0} titulo="Cuentas por cobrar" onClose={cerrar} />
            )}

            {abierto === 'pagar' && (
                <Hoja titulo="Cuentas por pagar" subtitulo="Facturas de proveedor según Zoho Books" onClose={cerrar}>
                    {k.nPorPagar === 0 ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 leading-relaxed">
                            <p className="font-bold flex items-center gap-2 mb-1"><AlertTriangle size={16} />
                                {estadoPP?.autorizado ? 'No hay facturas de proveedor pendientes' : 'Zoho todavía no entrega las facturas de proveedor'}
                            </p>
                            {estadoPP?.autorizado ? (
                                <p>La última lectura de Zoho{estadoPP.at ? ` (${fmt(toDate(estadoPP.at))})` : ''} no encontró saldos abiertos con proveedores.</p>
                            ) : (
                                <>
                                    <p className="mb-2">
                                        {estadoPP?.motivo
                                            ? <>Última respuesta de Zoho{estadoPP.at ? ` (${fmt(toDate(estadoPP.at))})` : ''}: <i>{estadoPP.motivo}</i></>
                                            : 'GK lee las facturas de proveedor en cada conciliación con Zoho, pero el permiso actual no lo autoriza.'}
                                    </p>
                                    <p>
                                        Para activarla: en Zoho (api-console.zoho.com → Self Client) genera un código nuevo con
                                        estos permisos y pégalo en Configuraciones → Integraciones → Zoho:
                                    </p>
                                    <code className="block bg-white rounded px-2 py-1.5 mt-2 text-[11px] break-all">
                                        ZohoBooks.invoices.CREATE,ZohoBooks.invoices.READ,ZohoBooks.bills.READ,ZohoBooks.contacts.READ,ZohoBooks.settings.READ
                                    </code>
                                    <p className="mt-2">La siguiente conciliación (cada hora de 7:00 a 20:00) la llena sola.</p>
                                </>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-3 flex items-center justify-between">
                                <div>
                                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Saldo total por pagar</p>
                                    <p className="text-3xl font-black text-slate-800 tabular-nums">{money(k.porPagar)}</p>
                                </div>
                                {k.pagarVencido > 0 && (
                                    <div className="text-right">
                                        <p className="text-[11px] font-extrabold uppercase text-red-500">Vencido</p>
                                        <p className="text-xl font-black text-red-700 tabular-nums">{money0(k.pagarVencido)}</p>
                                    </div>
                                )}
                            </div>
                            <Lista
                                items={[...k.pagarAbiertas].sort((a, b) => (toDate(a.vencimiento) || 0) - (toDate(b.vencimiento) || 0))}
                                clave={(b) => `${b.numero} ${b.proveedor}`}
                                placeholder="Buscar por proveedor o número…"
                                render={(b) => {
                                    const v = toDate(b.vencimiento);
                                    const vencida = v && v < new Date();
                                    return (
                                        <Fila key={b.id} titulo={b.proveedor || '—'}
                                            sub={`${b.numero} · vence ${fmt(v)}`}
                                            derecha={money(b.balance)}
                                            subDerecha={vencida ? `vencida ${Math.floor((new Date() - v) / 86400000)} d` : 'vigente'}
                                            tono={vencida ? 'border-l-red-500' : 'border-l-slate-200'} />
                                    );
                                }} />
                        </>
                    )}
                </Hoja>
            )}

            {abierto === 'proveedores' && (
                <Hoja titulo="Proveedores" subtitulo="Última compra, total comprado y deuda abierta" onClose={cerrar}>
                    {k.nPorPagar === 0 && (
                        <p className="text-[11px] text-slate-500 mb-3 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
                            La deuda con cada proveedor sale de las facturas de proveedor de Zoho, que todavía no llegan
                            (ver tarjeta Cuentas por pagar). Las compras de insumos vienen del libro de compras de Kroma,
                            que registra desde septiembre de 2026; la leche, de las recepciones.
                        </p>
                    )}
                    <Lista
                        items={k.proveedoresRel || []}
                        clave={(p) => `${p.nombre} ${p.nombreFiscal} ${p.rif}`}
                        placeholder="Buscar proveedor…"
                        vacio="No hay proveedores visibles. Si Kroma tiene datos, falta correr la migración de empresaId."
                        render={(p) => (
                            <div key={p.id} className={`bg-white border border-slate-200 rounded-xl p-3 ${p.deuda > 0.005 ? 'border-l-4 border-l-amber-500' : ''}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-bold text-slate-800 text-sm">{p.nombre}</p>
                                        <p className="text-[11px] text-slate-400">{[p.rif, p.categoria].filter(Boolean).join(' · ') || 'Sin RIF ni categoría'}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Deuda</p>
                                        <p className={`font-black tabular-nums text-sm ${p.deuda > 0.005 ? 'text-amber-700' : 'text-slate-500'}`}>
                                            {p.deuda > 0.005 ? money(p.deuda) : (k.nPorPagar > 0 ? '$0,00' : '—')}
                                        </p>
                                        {p.facturas.length > 0 && <p className="text-[11px] text-slate-400">{p.facturas.length} factura{p.facturas.length === 1 ? '' : 's'}</p>}
                                    </div>
                                </div>
                                <div className="mt-2 pt-2 border-t border-slate-100 text-[12px] text-slate-600 flex items-start justify-between gap-3">
                                    {p.ultima ? (
                                        <>
                                            <span className="min-w-0">Última compra {fmt(p.ultima.fecha)} · {p.ultima.detalle}</span>
                                            <span className="font-bold tabular-nums shrink-0">{p.ultima.sinPrecio ? 'sin precio' : money(p.ultima.monto)}</span>
                                        </>
                                    ) : <span className="text-slate-400">Sin compras registradas</span>}
                                </div>
                                {p.nMovimientos > 1 && (
                                    <p className="text-[11px] text-slate-400 mt-1">{p.nMovimientos} compras registradas · {money(p.totalComprado)} en total</p>
                                )}
                            </div>
                        )} />
                    {(k.facturasSinProveedor || []).length > 0 && (
                        <div className="mt-4">
                            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Deuda en Zoho con proveedores que no están en Kroma</p>
                            <div className="space-y-2">
                                {k.facturasSinProveedor.map(b => (
                                    <Fila key={b.id} titulo={b.proveedor || '—'} sub={`${b.numero} · vence ${fmt(toDate(b.vencimiento))}`} derecha={money(b.balance)} />
                                ))}
                            </div>
                        </div>
                    )}
                </Hoja>
            )}

            {abierto === 'devoluciones' && (
                <Hoja titulo="Devoluciones · histórico" subtitulo="Unidades retiradas por mes (últimos 12 meses)" onClose={cerrar}>
                    <PorMes datos={k.devPorMes} valorDe={(m) => m?.unidades} formato={(v) => `${num(v)} uds`} etiqueta="de devoluciones" />
                    <div className="mt-4 space-y-2">
                        <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Últimas devoluciones</p>
                        {(t.devoluciones || []).length === 0
                            ? <p className="text-sm text-slate-400 py-4">Sin devoluciones registradas.</p>
                            : [...(t.devoluciones || [])]
                                .sort((a, b) => (toDate(b.fecha) || 0) - (toDate(a.fecha) || 0))
                                .slice(0, 15)
                                .map(d => (
                                    <Fila key={d.id} titulo={d.posName || '—'}
                                        sub={`${fmt(toDate(d.fecha))} · ${
                                            d.resolucion === 'reposicion' ? 'repuesto 1:1'
                                            : d.resolucion === 'nota_credito' ? `nota de crédito ${d.notaCreditoNumero || ''}`.trim()
                                            : 'pendiente de resolver'}`}
                                        derecha={`${num(d.unidades)} uds`}
                                        subDerecha={d.montoNotaCredito > 0 ? money0(d.montoNotaCredito) : ''}
                                        tono={d.resolucion === 'pendiente' ? 'border-l-amber-500' : 'border-l-slate-200'} />
                                ))}
                    </div>
                </Hoja>
            )}

            {abierto === 'compras' && (
                <Hoja titulo="Compras por hacer" subtitulo="Insumos en su mínimo o por debajo, en presentaciones completas" onClose={cerrar}>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-white border border-slate-200 rounded-xl p-3">
                            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Producción y empaque</p>
                            <p className="text-xl font-black text-slate-800 tabular-nums">{money(compra.totalProduccion)}</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl p-3">
                            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Higiene y general</p>
                            <p className="text-xl font-black text-slate-800 tabular-nums">{money(compra.totalOtros)}</p>
                        </div>
                    </div>
                    <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                        Cantidad = lo que falta para volver al mínimo, redondeado hacia arriba a envases completos
                        (no se compra medio sobre ni medio saco), con un mínimo de uno. Valor al costo promedio actual del maestro.
                    </p>
                    {nComprar === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-6">Ningún insumo está en su mínimo o por debajo.</p>
                    ) : SECCIONES_COMPRA.map(sec => {
                        const its = compra.items.filter(i => i.seccion === sec.id);
                        if (!its.length) return null;
                        return (
                            <div key={sec.id} className="mb-4">
                                <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">{sec.label}</p>
                                <div className="space-y-2">
                                    {its.map(i => (
                                        <Fila key={i.materialId}
                                            titulo={i.nombre}
                                            sub={`Hay ${i.stockPres != null ? `${num(Math.floor(i.stockPres * 100) / 100)} ${i.presentacion}` : `${num(i.stockBase)} ${i.unidadBase}`} · mínimo ${num(i.minimo)} ${i.minimoEnPres ? i.presentacion : i.unidadBase}${provPorId[i.proveedorId] ? ` · ${provPorId[i.proveedorId]}` : ''}`}
                                            derecha={i.valor != null ? money(i.valor) : 'sin precio'}
                                            subDerecha={i.presentaciones != null ? `comprar ${num(i.presentaciones)} ${i.presentacion}${i.presentaciones === 1 ? '' : 's'}` : 'falta el tamaño del envase'}
                                            tono={i.agotado ? 'border-l-red-500' : 'border-l-amber-400'} />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    {(compra.sinMinimo.length > 0 || compra.sinInventario.length > 0) && (
                        <div className="bg-slate-100 rounded-xl p-3 text-[11px] text-slate-600 leading-relaxed mb-4">
                            {compra.sinMinimo.length > 0 && (
                                <p><b>{compra.sinMinimo.length} insumo{compra.sinMinimo.length === 1 ? '' : 's'} sin mínimo definido</b> (no se puede saber si hay que comprarlos): {compra.sinMinimo.map(m => m.nombre).join(', ')}. Se define en Kroma → Insumos.</p>
                            )}
                            {compra.sinInventario.length > 0 && (
                                <p className={compra.sinMinimo.length ? 'mt-1' : ''}><b>{compra.sinInventario.length} sin existencias cargadas:</b> {compra.sinInventario.map(m => m.nombre).join(', ')}.</p>
                            )}
                        </div>
                    )}
                    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-3">
                        <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Capital inmovilizado en insumos</p>
                        <p className="text-2xl font-black text-slate-800 tabular-nums">{money(capitalInsumos)}</p>
                        <p className="text-[11px] text-slate-400 mt-1">Stock de insumos valorado al costo promedio del maestro (la misma cifra que el inicio de gerencia de Kroma).</p>
                    </div>
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Compras registradas por mes</p>
                    <PorMes datos={k.comprasPorMes} valorDe={(m) => m?.monto} etiqueta="de compras" />
                    {(t.compras || []).length > 0 && (
                        <div className="mt-4 space-y-2">
                            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Últimas compras</p>
                            {[...(t.compras || [])]
                                .sort((a, b) => (toDate(b.fecha) || 0) - (toDate(a.fecha) || 0))
                                .slice(0, 10)
                                .map(c => (
                                    <Fila key={c.id} titulo={c.materialNombre || '—'}
                                        sub={`${fmt(toDate(c.fecha))} · ${provPorId[c.proveedorId] || c.proveedorNombre || 'proveedor no indicado'}`}
                                        derecha={money(c.costoTotal)}
                                        subDerecha={`${num(c.cantidad)} ${c.unidad || ''}`} />
                                ))}
                        </div>
                    )}
                </Hoja>
            )}

            {dossier && <DossierComercialDoc onClose={() => setDossier(false)} />}

            {abierto === 'produccion' && (
                <Hoja titulo="Producción" subtitulo="Lotes en proceso y costo de cada lote cerrado (Kroma)" onClose={cerrar}>
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">
                        En proceso ahora ({num(k.lotesActivos.length)})
                    </p>
                    {k.lotesActivos.length === 0 ? (
                        <p className="text-sm text-slate-400 py-3">Ningún lote en proceso.</p>
                    ) : (
                        <div className="space-y-2 mb-4">
                            {k.lotesActivos.map(p => {
                                const paso = (p.bloquesSnapshot || [])[p.bloqueActualIdx];
                                return (
                                    <Fila key={p.id} titulo={p.productoNombre || '—'}
                                        sub={`Lote ${p.lote || '—'} · inició ${fmt(fechaProduccion(p))}${p.operarioNombre ? ` · ${p.operarioNombre}` : ''}`}
                                        derecha={`${num(p.litrosNetos || p.litrosIngresados)} L`}
                                        subDerecha={p.estado === 'en_hold' ? 'en espera' : paso?.tipo ? `paso: ${String(paso.tipo).replace(/_/g, ' ')}` : 'en curso'}
                                        tono="border-l-emerald-500" />
                                );
                            })}
                            <p className="text-[11px] text-slate-400">El rendimiento y el costo se calculan al cerrar el empaque, cuando se conocen los kilos.</p>
                        </div>
                    )}

                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Lotes cerrados: rendimiento y costo</p>
                    {k.lotesCerrados.length === 0 ? (
                        <p className="text-sm text-slate-400 py-3">Sin producción cerrada visible. Si Kroma tiene datos, falta correr la migración de empresaId.</p>
                    ) : (
                        <div className="space-y-2 mb-4">
                            {k.lotesCerrados.slice(0, 12).map(({ log: p, costo: c }) => (
                                <div key={p.id} className={`bg-white border border-slate-200 rounded-xl p-3 ${c.faltan.length ? 'border-l-4 border-l-amber-400' : ''}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="font-bold text-slate-800 text-sm">{p.productoNombre || '—'}</p>
                                            <p className="text-[11px] text-slate-400">Lote {p.lote || '—'} · {fmt(fechaProduccion(p))} · {num(c.litros)} L → {num(c.kg)} kg</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Costo por kg</p>
                                            <p className="font-black text-slate-800 tabular-nums text-sm">{c.costoPorKg != null ? money(c.costoPorKg) : '—'}</p>
                                        </div>
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                                        <span className="text-slate-500">Rendimiento</span>
                                        <span className="text-right font-bold tabular-nums text-slate-700">
                                            {c.rendimientoLkg != null ? `${c.rendimientoLkg.toFixed(2)} L/kg` : '—'}
                                        </span>
                                        {c.presentaciones.map(pr => (
                                            <React.Fragment key={pr.nombre}>
                                                <span className="text-slate-500 truncate">Costo por unidad · {pr.nombre}</span>
                                                <span className="text-right font-bold tabular-nums text-slate-700">
                                                    {pr.costoUnidad != null ? money(pr.costoUnidad) : '—'}
                                                    <span className="font-normal text-slate-400"> · {num(pr.unidades)} ud</span>
                                                </span>
                                            </React.Fragment>
                                        ))}
                                        {c.kgSinEnvasar > 0 && (
                                            <>
                                                <span className="text-slate-500">Sin envasar ({num(c.kgSinEnvasar)} kg)</span>
                                                <span className="text-right font-bold tabular-nums text-slate-700">{c.costoBasePorKg != null ? `${money(c.costoBasePorKg)}/kg` : '—'}</span>
                                            </>
                                        )}
                                    </div>
                                    {c.faltan.length > 0 && (
                                        <p className="text-[11px] text-amber-700 mt-1.5">Costo incompleto: falta {c.faltan.join(', ')}.</p>
                                    )}
                                </div>
                            ))}
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                                Costo = leche de sus recepciones + insumos de la ficha técnica al precio del maestro + empaque de cada presentación,
                                dividido entre los kilos del lote. Es el mismo cálculo de las pantallas de gerencia de Kroma. Mano de obra y costos fijos no están incluidos.
                            </p>
                        </div>
                    )}

                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Lotes por mes</p>
                    <PorMes datos={k.prodPorMes} valorDe={(m) => m?.lotes} formato={(v) => `${num(v)} lotes`} etiqueta="de producción" />
                </Hoja>
            )}
        </div>
    );
}

