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
    Wallet, Receipt, Users, Truck, TrendingUp, RotateCcw, ShoppingCart, Factory, Store,
    X, AlertTriangle, Search, ChevronRight,
} from 'lucide-react';
import { useTableroGerencial, ultimosMeses } from '@/hooks/useTableroGerencial.js';
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
export default function TableroGerencial({ onVerIndicadores = null }) {
    const t = useTableroGerencial();
    const [abierto, setAbierto] = useState(null);   // clave de la hoja abierta
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

    // Capital inmovilizado en insumos: el inventario de materiales valorado al
    // costo promedio del maestro. Es la única cifra de "compras" disponible
    // hacia atrás — el libro de compras arranca vacío (ver nota de la tarjeta).
    const capitalInsumos = (t.invMateriales || []).reduce((s, i) => {
        const base = (Number(i.stockCerrado) || 0) * (Number(i.cantidadPorUnidad) || 1) + (Number(i.stockEnUso) || 0);
        return s + base * (Number(i.costoBaseUSD) || 0);
    }, 0);

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
                {onVerIndicadores && (
                    <button type="button" onClick={onVerIndicadores}
                        className="text-xs font-bold text-brand-blue bg-white border border-slate-200 rounded-xl px-3 py-2 hover:shadow-md">
                        Indicadores de campo →
                    </button>
                )}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card n="01" icon={Wallet} titulo="Cuentas por cobrar" tono={k.cobrarVencido > 0 ? 'red' : 'emerald'}
                    valor={money0(k.porCobrar)}
                    sub={`${num(k.nPorCobrar)} factura${k.nPorCobrar === 1 ? '' : 's'} abiertas`}
                    nota={k.cobrarVencido > 0 ? `${money0(k.cobrarVencido)} ya vencido` : 'Nada vencido'}
                    onClick={() => setAbierto('cobrar')} />

                <Card n="02" icon={Receipt} titulo="Cuentas por pagar" tono={k.pagarVencido > 0 ? 'red' : 'slate'}
                    valor={k.nPorPagar > 0 ? money0(k.porPagar) : '—'}
                    sub={k.nPorPagar > 0 ? `${num(k.nPorPagar)} factura${k.nPorPagar === 1 ? '' : 's'} de proveedor` : 'Sin datos de Zoho todavía'}
                    nota={k.nPorPagar > 0
                        ? (k.pagarVencido > 0 ? `${money0(k.pagarVencido)} ya vencido` : 'Nada vencido')
                        : 'Falta autorizar el scope de facturas de proveedor'}
                    onClick={() => setAbierto('pagar')} />

                <Card n="03" icon={Users} titulo="Clientes" valor={num(k.nClientes)}
                    sub={`${num(k.conVendedor)} con vendedor · ${num(k.oficina)} oficina`}
                    nota={k.nClientes - k.conVendedor - k.oficina > 0
                        ? `${num(k.nClientes - k.conVendedor - k.oficina)} sin asignar`
                        : 'Todos asignados'}
                    tono={k.nClientes - k.conVendedor - k.oficina > 0 ? 'amber' : 'slate'}
                    onClick={() => setAbierto('clientes')} />

                <Card n="04" icon={Truck} titulo="Proveedores" valor={num(k.nProveedores)}
                    sub="Registrados en Kroma"
                    nota={k.nProveedores === 0 ? 'Sin acceso o sin datos migrados' : 'Maestro de planta'}
                    onClick={() => setAbierto('proveedores')} />

                <Card n="05" icon={TrendingUp} titulo="Ventas del mes" tono="emerald"
                    valor={money0(k.ventasMes)}
                    sub={`${num(k.ventasMesN)} factura${k.ventasMesN === 1 ? '' : 's'} este mes`}
                    nota="Toca para el histórico de 12 meses"
                    onClick={() => setAbierto('ventas')} />

                <Card n="06" icon={RotateCcw} titulo="Devoluciones del mes"
                    tono={k.devMes > 0 ? 'amber' : 'slate'}
                    valor={`${num(k.devMes)} uds`}
                    sub={k.devMesMonto > 0 ? `${money0(k.devMesMonto)} en notas de crédito` : 'Sin notas de crédito'}
                    nota="Toca para el histórico de 12 meses"
                    onClick={() => setAbierto('devoluciones')} />

                <Card n="07" icon={ShoppingCart} titulo="Compras del mes"
                    valor={k.comprasMes > 0 ? money0(k.comprasMes) : '—'}
                    sub={k.comprasMes > 0 ? 'Entradas de material con costo' : 'El libro arranca ahora'}
                    nota={`${money0(capitalInsumos)} inmovilizado en insumos`}
                    onClick={() => setAbierto('compras')} />

                <Card n="09" icon={Store} titulo="Puntos de venta" tono="emerald"
                    valor={num(k.nPdvActivos)}
                    sub={`${num(k.nPdvInactivos)} inactivo${k.nPdvInactivos === 1 ? '' : 's'} · ${num(k.ciudades.length)} ciudad${k.ciudades.length === 1 ? '' : 'es'}`}
                    nota="Toca para verlos por peso de facturación"
                    onClick={() => setAbierto('pdv')} />

                <Card n="08" icon={Factory} titulo="Producción del mes"
                    valor={`${num(k.prodMes.lotes)} lote${k.prodMes.lotes === 1 ? '' : 's'}`}
                    sub={`${num(k.prodMes.litros)} L · ${num(k.prodMes.kg)} kg`}
                    nota="Toca para el histórico de 12 meses"
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
                            <p className="font-bold flex items-center gap-2 mb-1"><AlertTriangle size={16} /> Todavía no hay datos</p>
                            <p>
                                GK ya sabe pedirle a Zoho las facturas de proveedor, pero el token actual
                                solo tiene permiso para leer las facturas de venta. Para que esta tarjeta
                                se llene hay que <b>regenerar el Self Client de Zoho</b> agregando el scope{' '}
                                <code className="bg-white px-1 rounded">ZohoBooks.bills.READ</code> a los que ya tiene,
                                y volver a guardarlo en Integraciones. En el siguiente barrido aparece solo.
                            </p>
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

            {abierto === 'clientes' && (
                <Hoja titulo="Clientes" subtitulo={`${num(k.nClientes)} razones sociales en el registro de Zoho`} onClose={cerrar}>
                    <Lista
                        items={[...(t.clientes || [])].sort((a, b) => (b.facturas || 0) - (a.facturas || 0))}
                        clave={(c) => c.customerName || c.razonSocialCanonica || ''}
                        placeholder="Buscar cliente…"
                        vacio="No hay clientes sincronizados desde Zoho."
                        render={(c) => (
                            <Fila key={c.id}
                                titulo={c.customerName || c.razonSocialCanonica || '—'}
                                sub={c.esOficina ? 'Oficina · sin comisión' : (c.vendedorId ? 'Con vendedor asignado' : 'Sin vendedor asignado')}
                                derecha={`${num(c.facturas || 0)} fact.`}
                                subDerecha={c.ultimaFactura ? `últ. ${fmt(toDate(c.ultimaFactura))}` : 'sin facturas'}
                                tono={c.esOficina ? 'border-l-slate-300' : (c.vendedorId ? 'border-l-emerald-500' : 'border-l-amber-500')} />
                        )} />
                </Hoja>
            )}

            {abierto === 'proveedores' && (
                <Hoja titulo="Proveedores" subtitulo="Maestro de Kroma (planta)" onClose={cerrar}>
                    <Lista
                        items={t.proveedores || []}
                        clave={(p) => `${p.nombreComercial || ''} ${p.nombreFiscal || ''} ${p.rif || ''}`}
                        placeholder="Buscar proveedor…"
                        vacio="No hay proveedores visibles. Si Kroma tiene datos, falta correr la migración de empresaId."
                        render={(p) => (
                            <Fila key={p.id}
                                titulo={p.nombreComercial || p.nombreFiscal || '—'}
                                sub={[p.rif, Array.isArray(p.categorias) ? p.categorias.join(', ') : p.categoria].filter(Boolean).join(' · ') || 'Sin categoría'}
                                derecha={p.telefono || '—'}
                                subDerecha={p.contacto || ''} />
                        )} />
                </Hoja>
            )}

            {abierto === 'ventas' && (
                <Hoja titulo="Ventas · histórico" subtitulo="Facturado por mes (últimos 12 meses)" onClose={cerrar}>
                    <PorMes datos={k.ventasPorMes} valorDe={(m) => m?.monto} etiqueta="de ventas" />
                    <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
                        Monto facturado por fecha de emisión, excluyendo anuladas y las que Zoho ya no
                        reconoce. Facturar no es cobrar: lo cobrado vive en "Cuentas por cobrar".
                    </p>
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
                <Hoja titulo="Compras · histórico" subtitulo="Entradas de material con costo (Kroma)" onClose={cerrar}>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-3">
                        <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Capital inmovilizado en insumos</p>
                        <p className="text-2xl font-black text-slate-800 tabular-nums">{money(capitalInsumos)}</p>
                        <p className="text-[11px] text-slate-400 mt-1">Inventario de materiales valorado al costo promedio del maestro.</p>
                    </div>
                    <PorMes datos={k.comprasPorMes} valorDe={(m) => m?.monto} etiqueta="de compras" />
                    {(t.compras || []).length === 0 && (
                        <p className="text-[11px] text-slate-500 mt-4 leading-relaxed bg-amber-50 border border-amber-200 rounded-xl p-3">
                            <b>El libro de compras arranca ahora.</b> Hasta hoy, registrar una entrada de
                            material actualizaba el stock y el costo promedio pero no dejaba rastro de la
                            compra (fecha, proveedor, monto), así que no hay histórico hacia atrás. Desde
                            este cambio, cada entrada con costo queda registrada y el gráfico se va llenando.
                        </p>
                    )}
                    {(t.compras || []).length > 0 && (
                        <div className="mt-4 space-y-2">
                            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Últimas compras</p>
                            {[...(t.compras || [])]
                                .sort((a, b) => (toDate(b.fecha) || 0) - (toDate(a.fecha) || 0))
                                .slice(0, 15)
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

            {abierto === 'pdv' && (
                <HojaPdv k={k} onClose={cerrar} />
            )}

            {abierto === 'produccion' && (
                <Hoja titulo="Producción · histórico" subtitulo="Lotes producidos por mes (Kroma)" onClose={cerrar}>
                    <PorMes datos={k.prodPorMes} valorDe={(m) => m?.lotes} formato={(v) => `${num(v)} lotes`} etiqueta="de producción" />
                    <div className="mt-4 space-y-2">
                        <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Últimos lotes</p>
                        {(t.produccion || []).length === 0
                            ? <p className="text-sm text-slate-400 py-4">Sin producción visible. Si Kroma tiene datos, falta correr la migración de empresaId.</p>
                            : [...(t.produccion || [])]
                                .sort((a, b) => (toDate(b.fechaInicio) || 0) - (toDate(a.fechaInicio) || 0))
                                .slice(0, 15)
                                .map(p => (
                                    <Fila key={p.id} titulo={p.productoNombre || '—'}
                                        sub={`Lote ${p.lote || '—'} · ${fmt(toDate(p.fechaInicio))} · ${p.operarioNombre || ''}`}
                                        derecha={`${num(p.rendimientoKg)} kg`}
                                        subDerecha={`${num(p.litrosNetos)} L${p.estado === 'activa' ? ' · en curso' : ''}`}
                                        tono={p.estado === 'activa' ? 'border-l-emerald-500' : 'border-l-slate-200'} />
                                ))}
                    </div>
                </Hoja>
            )}
        </div>
    );
}

// ─── Hoja de Puntos de Venta ─────────────────────────────────────────────────
//
// El socio la pidió así: los PDV ACTIVOS ordenados por peso de facturación, los
// INACTIVOS igual, y poder filtrar por ciudad. El orden por facturación es el
// punto — un PDV que factura $4.000 y uno que factura $80 no son el mismo
// problema, y en una lista alfabética se ven idénticos.
function HojaPdv({ k, onClose }) {
    const [estado, setEstado] = useState('activos');   // activos | inactivos | todos
    const [ciudad, setCiudad] = useState('todas');

    const base = estado === 'activos' ? k.pdvActivos
        : estado === 'inactivos'      ? k.pdvInactivos
        : k.pdv;
    const lista = ciudad === 'todas' ? base : base.filter(p => p.ciudad === ciudad);
    const total = lista.reduce((s, p) => s + p.facturado, 0);
    const conVentas = lista.filter(p => p.facturado > 0).length;

    const Pill = ({ activa, onClick, children }) => (
        <button type="button" onClick={onClick}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                activa ? 'bg-slate-800 text-white border-slate-800'
                       : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
            {children}
        </button>
    );

    return (
        <Hoja titulo="Puntos de venta"
            subtitulo="Ordenados por lo que factura cada uno desde 2026"
            onClose={onClose}>

            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                <Pill activa={estado === 'activos'}   onClick={() => setEstado('activos')}>
                    Activos ({num(k.nPdvActivos)})
                </Pill>
                <Pill activa={estado === 'inactivos'} onClick={() => setEstado('inactivos')}>
                    Inactivos ({num(k.nPdvInactivos)})
                </Pill>
                <Pill activa={estado === 'todos'}     onClick={() => setEstado('todos')}>
                    Todos ({num(k.pdv.length)})
                </Pill>
            </div>

            {/* Las ciudades son el segundo corte: el socio quiere saber dónde
                está el peso, no solo cuánto suma. */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 mt-1">
                <Pill activa={ciudad === 'todas'} onClick={() => setCiudad('todas')}>Todas las ciudades</Pill>
                {k.ciudades.map(c => (
                    <Pill key={c} activa={ciudad === c} onClick={() => setCiudad(c)}>{c}</Pill>
                ))}
            </div>

            <div className="flex items-baseline justify-between gap-3 mt-3 pb-2 border-b border-slate-200">
                <p className="text-sm font-bold text-slate-700">
                    {num(lista.length)} punto{lista.length === 1 ? '' : 's'} de venta
                </p>
                <p className="text-xs text-slate-500">
                    {money0(total)} · {num(conVentas)} con ventas
                </p>
            </div>

            <div className="mt-2 space-y-1.5">
                {lista.length === 0 ? (
                    <p className="text-sm text-slate-500 py-6 text-center">Sin puntos de venta con ese filtro.</p>
                ) : lista.map((p, i) => (
                    <div key={p.id}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${
                            p.activo ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200'}`}>
                        <span className="w-6 shrink-0 text-[11px] font-black text-slate-300 tabular-nums">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold truncate ${p.activo ? 'text-slate-800' : 'text-slate-500'}`}>
                                {p.name || p.nombre || '—'}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                                {p.ciudad}
                                {p.chain && <> · {p.chain}</>}
                                {!p.activo && <span className="text-slate-400"> · inactivo</span>}
                            </p>
                        </div>
                        <div className="text-right shrink-0">
                            <p className="text-sm font-black text-slate-800 tabular-nums">
                                {p.facturado > 0 ? money0(p.facturado) : '—'}
                            </p>
                            <p className="text-[11px] text-slate-400">
                                {p.facturado > 0
                                    ? `${num(p.nFacturas)} factura${p.nFacturas === 1 ? '' : 's'}`
                                    : 'sin ventas desde 2026'}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </Hoja>
    );
}
