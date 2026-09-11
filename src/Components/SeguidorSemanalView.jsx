// RUTA: src/Components/SeguidorSemanalView.jsx
//
// SEGUIDOR SEMANAL del vendedor. No es una lista de tareas: cada indicador es un
// número que debe bajar a cero, con la lista concreta detrás para actuar.
//
// Los indicadores NO tienen un orden fijo: cada uno calcula su NIVEL DE URGENCIA
// y sube o baja solo. Se agrupan en tres zonas — "Atiende ya" (tarjetas grandes),
// "Esta semana" (compactas) y "En verde" (colapsado) — para que el vendedor vea
// primero lo que quema. Lunes a domingo.
//
// Sirve al vendedor (tema oscuro) y al máster/gerencia para supervisar (claro).

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Flame, PackageMinus, AlertOctagon, CalendarClock, Receipt, Users,
    ChevronRight, ChevronLeft, X, CheckCircle2, Link2Off, ChevronDown, PackageX,
} from 'lucide-react';

const THEME = {
    light: {
        title: 'text-slate-800', meta: 'text-slate-500', soft: 'text-slate-400',
        hero: 'bg-white border border-slate-200', card: 'bg-white border border-slate-200',
        mini: 'bg-white border border-slate-200', sheet: 'bg-slate-50',
        row: 'bg-white border border-slate-200', chip: 'bg-slate-100 text-slate-600',
        bar: 'bg-slate-200', okBox: 'bg-emerald-50 border border-emerald-200',
    },
    dark: {
        title: 'text-white', meta: 'text-slate-400', soft: 'text-slate-500',
        hero: 'bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800',
        card: 'bg-slate-900 border border-slate-800', mini: 'bg-slate-900 border border-slate-800',
        sheet: 'bg-slate-900', row: 'bg-slate-800/60 border border-slate-700',
        chip: 'bg-slate-800 text-slate-300', bar: 'bg-slate-800',
        okBox: 'bg-emerald-500/10 border border-emerald-500/30',
    },
};

// Paleta por nivel de urgencia (4 = alerta máxima, 0 = en verde).
// El 4 (morado) es para lo que NO SE PUEDE NI EVALUAR — un PDV que nadie ha
// visitado: no se sabe si hay producto, así que no es "rojo, corre a vender",
// es "manda a alguien YA". Por eso lleva color propio y no un rojo más.
const NIVEL = {
    4: { txt: 'text-purple-500',  bg: 'bg-purple-500/10',  ring: 'ring-1 ring-purple-500/40',  stripe: 'bg-purple-600' },
    3: { txt: 'text-red-500',     bg: 'bg-red-500/10',     ring: 'ring-1 ring-red-500/30',     stripe: 'bg-red-500' },
    2: { txt: 'text-amber-500',   bg: 'bg-amber-500/10',   ring: 'ring-1 ring-amber-500/25',   stripe: 'bg-amber-500' },
    1: { txt: 'text-sky-500',     bg: 'bg-sky-500/10',     ring: '',                            stripe: 'bg-sky-500' },
    0: { txt: 'text-emerald-500', bg: 'bg-emerald-500/10', ring: '',                            stripe: 'bg-emerald-500' },
};

// Cómo se lee cada PDV sin facturar según su última visita (ver `seguidorSemanal`).
const EST_VISITA = {
    sin_visita:     { label: 'Sin visita vigente', cls: 'text-purple-500' },
    sin_oc:         { label: 'Visitado sin OC',    cls: 'text-red-500' },
    sin_ruta:       { label: 'Foodservice',        cls: 'text-slate-400' },
    con_inventario: { label: 'Tenía inventario',   cls: 'text-slate-400' },
};

const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;
const fmtDia = (d) => d ? d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }) : '—';

// periodoCtl (opcional): { gran, setGran, offset, setOffset, label, actual }
// Permite navegar el histórico por semana o por mes. Sin él, la vista muestra
// solo el período que le pasen (comportamiento original).
//
// onDevolver (opcional): (item) => void — hace ACCIONABLE "PDV con producto por
// vencer": abre la hoja de devolución para declarar el retiro ahí mismo. Solo lo
// pasa el VENDEDOR (es quien resuelve con el cliente); el máster/gerencia ve el
// mismo tablero en modo supervisión, sin botón.
export default function SeguidorSemanalView({ data, theme = 'dark', periodoCtl = null, titulo = null, onDevolver = null }) {
    const t = THEME[theme] || THEME.dark;
    const [detalle, setDetalle] = useState(null);
    const [verVerdes, setVerVerdes] = useState(false);

    if (!data) return null;
    const { semana, cfg, sinFacturar, anaquelBajo, quiebres, porVencer, cobranza, mercaderista, cobertura } = data;
    // Hoja de detalle. `resumen` = bloque JSX arriba de la lista (p.ej. la
    // fracción y barra de Cobertura). `accion` = { label, onClick(item) }, botón
    // por fila. `secciones` = [{ titulo, nota, items }] cuando la lista no es
    // homogénea y agruparla dice algo (PDV sin facturar: lo accionable primero,
    // lo que tenía inventario aparte).
    const abrir = ({ titulo, subtitulo, items = [], render, resumen = null, accion = null, secciones = null }) =>
        setDetalle({ titulo, subtitulo, items, render, resumen, accion, secciones });

    // ── Cada indicador declara su nivel de urgencia; el orden sale de ahí ──
    const peorVencimiento = porVencer.items[0]?.diasParaVencer ?? null;
    const peorMora = cobranza.items[0]?.diasVencida ?? 0;

    // Fila de "PDV sin facturar": además de cuánto lleva frío, POR QUÉ está así
    // — qué vio la última visita — y bajo qué razón social se encontró su última
    // factura, que es lo que delata un vínculo apuntando al cliente equivocado.
    const renderSinFacturar = (i) => {
        const est = EST_VISITA[i.estadoVisita] || EST_VISITA.sin_ruta;
        return (<>
            <p className="font-bold text-sm">
                {i.nombre}
                {i.heredado && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-500/20 text-slate-400 align-middle">Heredado</span>}
            </p>
            <p className="text-xs opacity-70">{i.zona}</p>

            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mt-0.5">
                {/* Un vínculo roto NO es un PDV frío: decirlo evita mandar al
                    vendedor a "activar" un punto que sí está comprando. */}
                {i.sinCoincidencia ? (
                    <span className="text-xs font-black text-amber-500">Sin factura a este nombre</span>
                ) : (
                    <span className={`text-xs font-black ${i.nunca || i.dias >= 15 ? 'text-red-500' : 'text-amber-500'}`}>
                        {i.nunca ? 'Nunca ha facturado' : `${i.dias} días`}
                    </span>
                )}
                <span className={`text-[11px] font-bold ${est.cls}`}>· {est.label}</span>
            </div>

            {/* Qué vio la última visita: es lo que justifica (o no) el reclamo */}
            <p className="text-[11px] opacity-60 leading-snug">
                {i.estadoVisita === 'sin_ruta'
                    ? 'Sin ruta de mercaderista'
                    : i.visita
                        ? <>Última visita {fmtDia(i.visita)} ({i.diasSinVisita} d{i.intervalo > 0 ? `, frecuencia ${i.intervalo} d` : ''})
                            {i.nivelAnaquel !== null && ` · ${i.nivelAnaquel} uds en anaquel`}</>
                        : 'Nunca se ha visitado'}
            </p>

            {i.sinCoincidencia ? (
                <p className="text-[11px] opacity-60 leading-snug mt-0.5">
                    {i.porCarnet
                        // Vinculado por carnet: el vínculo es correcto y sobrevive
                        // a renombres, así que el problema no es el dato.
                        ? <>Vinculado por carnet a "{i.razonSocial || '—'}": el vínculo está bien, este cliente no tiene facturas.</>
                        : <>Vinculado por NOMBRE a "{i.razonSocial || '—'}" — vuelve a vincularlo desde Clientes y PDV para amarrarlo al carnet de Zoho.</>}
                </p>
            ) : i.facturadoComo ? (
                <p className="text-[11px] opacity-60 leading-snug mt-0.5">
                    Última factura a nombre de "{i.facturadoComo}".
                </p>
            ) : null}
        </>);
    };

    const LINEAS = [
        {
            key: 'sinFacturar', Icon: Flame, label: `PDV sin facturar +${cfg.diasSinFacturar} días`,
            valor: sinFacturar.count,
            // Un PDV que nadie visitó pesa más que uno frío pero vigilado: no se
            // sabe siquiera si tiene producto.
            nivel: sinFacturar.sinVisita > 0 ? 4
                : sinFacturar.count >= 10 ? 3 : sinFacturar.count >= 4 ? 2 : sinFacturar.count > 0 ? 1 : 0,
            accion: sinFacturar.sinVisita > 0
                ? `${sinFacturar.sinVisita} sin visita: manda a alguien YA`
                : 'Activa la cartera: llama o visita',
            desglose: [
                sinFacturar.sinVisita > 0 ? `${sinFacturar.sinVisita} sin visita` : null,
                sinFacturar.sinOC > 0 ? `${sinFacturar.sinOC} visitado${sinFacturar.sinOC === 1 ? '' : 's'} sin OC` : null,
                sinFacturar.conInventario.count > 0 ? `${sinFacturar.conInventario.count} tenía${sinFacturar.conInventario.count === 1 ? '' : 'n'} inventario` : null,
            ].filter(Boolean).join(' · ') || null,
            onClick: () => abrir({
                titulo: 'PDV sin facturar',
                subtitulo: 'Cruzado con la última visita',
                render: renderSinFacturar,
                secciones: [
                    {
                        titulo: 'Sin visita vigente · atender YA',
                        nota: 'Nadie ha ido, o la visita ya venció su frecuencia. No se sabe si hay producto en el anaquel.',
                        items: sinFacturar.items.filter(i => i.estadoVisita === 'sin_visita'),
                    },
                    {
                        titulo: 'Visitado y sin orden de compra',
                        nota: `El anaquel estaba por debajo de ${cfg.pisoAnaquel} uds y aun así no salió pedido: acá se está perdiendo la venta.`,
                        items: sinFacturar.items.filter(i => i.estadoVisita === 'sin_oc'),
                    },
                    {
                        titulo: 'Foodservice',
                        nota: 'No lleva visitas de mercaderista por diseño: se le vende directo.',
                        items: sinFacturar.items.filter(i => i.estadoVisita === 'sin_ruta'),
                    },
                    {
                        titulo: 'Tenían inventario · no cuentan',
                        nota: 'Visitados y con producto suficiente en anaquel: no les tocaba comprar, así que no se cargan a la gestión del vendedor.',
                        items: sinFacturar.conInventario.items,
                    },
                ].filter(s => s.items.length > 0),
                resumen: sinFacturar.sinCoincidencia > 0 ? (
                    <p className="text-xs leading-snug">
                        <b className="text-amber-500">{sinFacturar.sinCoincidencia} de estos PDV</b> están vinculados a una
                        razón social que no aparece en ninguna factura. No son cartera fría: o el nombre está mal escrito,
                        o el cliente de Zoho todavía no está asignado. Corrígelo en Clientes y PDV.
                    </p>
                ) : null,
            }),
        },
        {
            // El número accionable es el de quiebres que quedaron ABIERTOS. Los que
            // el mercaderista repuso en la misma visita ya están surtidos: contarlos
            // aquí manda al vendedor a pedir una OC que no hace falta.
            key: 'quiebres', Icon: AlertOctagon, label: 'Quiebres sin reponer',
            valor: quiebres.abiertos ?? quiebres.count,
            nivel: (quiebres.abiertos ?? quiebres.count) > 0 ? 3 : 0,
            accion: 'Cero producto en anaquel: repón ya',
            desglose: quiebres.repuestos > 0
                ? `${quiebres.count} quiebre${quiebres.count === 1 ? '' : 's'} · ${quiebres.repuestos} repuesto${quiebres.repuestos === 1 ? '' : 's'} en la visita (R)`
                : null,
            onClick: () => abrir({
                titulo: 'Quiebres de stock',
                subtitulo: `${quiebres.abiertos ?? 0} sin reponer · ${quiebres.repuestos ?? 0} atendidos (R)`,
                items: quiebres.items,
                render: (i) => (<>
                    <p className="font-bold text-sm">
                        {i.nombre}
                        {i.atendido && <span className="ml-1.5 text-[10px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 align-middle">R</span>}
                    </p>
                    <p className="text-xs opacity-70">Visto {fmtDia(i.visita)} · {i.zona}</p>
                    <span className={`text-xs font-black ${i.atendido ? 'text-emerald-400' : 'text-red-500'}`}>
                        {i.atendido ? `Repuesto ${i.repuesto} uds` : '0 uds'}
                    </span>
                </>),
            }),
        },
        {
            key: 'cobranza', Icon: Receipt, label: 'Facturas vencidas por cobrar',
            valor: cobranza.count, sufijo: cobranza.count > 0 ? money(cobranza.monto) : null,
            nivel: cobranza.count === 0 ? 0 : peorMora > 30 ? 3 : 2,
            accion: peorMora > 30 ? `Hay mora de ${peorMora} días: cobra hoy` : 'Cobra antes de que envejezca',
            desglose: cobranza.heredadas > 0
                ? `${cobranza.heredadas} heredadas (${money(cobranza.montoHeredado)}) · ${cobranza.propias} suyas (${money(cobranza.montoPropio)})`
                : null,
            onClick: () => abrir({
                titulo: 'Facturas vencidas',
                subtitulo: `${money(cobranza.monto)} por cobrar`,
                items: cobranza.items,
                render: (i) => (<>
                    <p className="font-bold text-sm">
                        {i.cliente}
                        {i.heredada && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-500/20 text-slate-400 align-middle">Heredada</span>}
                    </p>
                    <p className="text-xs opacity-70">{i.id}</p>
                    <span className="text-xs font-black text-red-500">{money(i.monto)} · {i.diasVencida} d</span>
                </>),
            }),
        },
        {
            key: 'porVencer', Icon: CalendarClock, label: 'PDV con producto por vencer',
            valor: porVencer.count,
            nivel: porVencer.count === 0 ? 0 : (peorVencimiento !== null && peorVencimiento <= 15) ? 3 : 2,
            accion: (peorVencimiento !== null && peorVencimiento <= 0)
                ? 'Hay producto VENCIDO en anaquel'
                : 'Rota, promociona o retira',
            onClick: () => abrir({
                titulo: 'Producto por vencer',
                subtitulo: 'Según el último reporte de visita',
                items: porVencer.items,
                render: (i) => (<>
                    <p className="font-bold text-sm">{i.nombre}</p>
                    <p className="text-xs opacity-70">Vence {i.vence}{i.unidades ? ` · ${i.unidades} uds` : ''} · {i.zona}</p>
                    <span className={`text-xs font-black ${i.diasParaVencer <= 15 ? 'text-red-500' : 'text-amber-500'}`}>
                        {i.diasParaVencer <= 0 ? 'Vencido' : `${i.diasParaVencer} días`}
                    </span>
                </>),
                // El indicador no se cierra mirándolo: se cierra retirando o
                // reponiendo. Misma hoja que usa el equipo de campo.
                accion: onDevolver ? { label: 'Retirar / reponer', onClick: onDevolver } : null,
            }),
        },
        {
            key: 'anaquel', Icon: PackageMinus, label: `Anaquel bajo ${anaquelBajo.piso} uds`,
            valor: anaquelBajo.count,
            nivel: anaquelBajo.count >= 5 ? 2 : anaquelBajo.count > 0 ? 1 : 0,
            accion: 'Mete la próxima OC antes del quiebre',
            onClick: () => abrir({
                titulo: 'Anaquel bajo el piso',
                subtitulo: `Menos de ${anaquelBajo.piso} unidades en la última visita`,
                items: anaquelBajo.items,
                render: (i) => (<>
                    <p className="font-bold text-sm">{i.nombre}</p>
                    <p className="text-xs opacity-70">Visto {fmtDia(i.visita)} · {i.zona}</p>
                    <span className="text-xs font-black text-amber-500">{i.nivel} uds · faltan {i.faltan}</span>
                </>),
            }),
        },
    ];

    // Orden dinámico: más urgente primero; a igual urgencia, el número más grande.
    const orden = [...LINEAS].sort((a, b) => b.nivel - a.nivel || b.valor - a.valor);
    const urgentes = orden.filter(l => l.nivel >= 3);
    const medios   = orden.filter(l => l.nivel === 1 || l.nivel === 2);
    const verdes   = orden.filter(l => l.nivel === 0);

    const totalIndicadores = LINEAS.length;
    const enVerde = verdes.length;
    const foco = urgentes[0] || medios[0] || null;

    return (
        <div className="space-y-4">

            {/* ── Pulso de la semana + foco ── */}
            <div className={`rounded-2xl p-4 ${t.hero}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                        <p className={`text-[10px] font-extrabold uppercase tracking-[0.2em] ${t.soft}`}>
                            {titulo || (periodoCtl?.gran === 'mes' ? 'Mes' : 'Tu semana')}
                        </p>
                        <p className={`text-xl font-black leading-tight capitalize ${t.title}`}>
                            {periodoCtl?.label || `${fmtDia(semana.desde)} — ${fmtDia(new Date(semana.hasta.getTime() - 86400000))}`}
                        </p>
                        {semana.enCurso === false && (
                            <p className={`text-[11px] ${t.soft}`}>Cerrado · foto al final del período</p>
                        )}
                    </div>
                    {sinFacturar.activadosSemana > 0 && (
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${t.okBox} text-emerald-400`}>
                            <CheckCircle2 size={12} className="inline mr-1" />{sinFacturar.activadosSemana} activados
                        </span>
                    )}
                </div>

                {/* Navegación del histórico: semana/mes + anterior/siguiente */}
                {periodoCtl && (
                    <div className="flex items-center gap-2 mb-3">
                        <div className={`flex rounded-lg p-0.5 ${t.bar}`}>
                            {[['semana', 'Semana'], ['mes', 'Mes']].map(([g, lbl]) => (
                                <button key={g} onClick={() => { periodoCtl.setGran(g); periodoCtl.setOffset(0); }}
                                    className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                                        periodoCtl.gran === g ? 'bg-emerald-600 text-white' : t.meta
                                    }`}>{lbl}</button>
                            ))}
                        </div>
                        <div className="ml-auto flex items-center gap-1">
                            <button onClick={() => periodoCtl.setOffset(periodoCtl.offset - 1)}
                                aria-label="Período anterior"
                                className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.bar} ${t.title}`}>
                                <ChevronLeft size={16} />
                            </button>
                            <button onClick={() => periodoCtl.setOffset(Math.min(0, periodoCtl.offset + 1))}
                                disabled={periodoCtl.offset >= 0} aria-label="Período siguiente"
                                className={`w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30 ${t.bar} ${t.title}`}>
                                <ChevronRight size={16} />
                            </button>
                            {periodoCtl.offset !== 0 && (
                                <button onClick={() => periodoCtl.setOffset(0)}
                                    className={`px-2 h-8 rounded-lg text-xs font-bold ${t.chip}`}>Hoy</button>
                            )}
                        </div>
                    </div>
                )}

                {/* Semáforo compacto: un segmento por indicador, ordenado por urgencia */}
                <div className="flex gap-1 mb-2">
                    {orden.map(l => (
                        <span key={l.key} className={`h-1.5 flex-1 rounded-full ${NIVEL[l.nivel].stripe} ${l.nivel === 0 ? 'opacity-40' : ''}`} />
                    ))}
                </div>
                <p className={`text-xs mb-3 ${t.meta}`}>
                    <b className={enVerde === totalIndicadores ? 'text-emerald-500' : t.title}>{enVerde} de {totalIndicadores}</b> indicadores en verde
                </p>

                {/* Foco: lo primero que hay que atender */}
                {foco && foco.valor > 0 ? (
                    <button onClick={foco.onClick}
                        className={`w-full flex items-center gap-3 rounded-xl p-3 text-left ${NIVEL[foco.nivel].bg} ${NIVEL[foco.nivel].ring}`}>
                        <foco.Icon size={20} className={`shrink-0 ${NIVEL[foco.nivel].txt}`} />
                        <div className="flex-1 min-w-0">
                            <p className={`text-[10px] font-extrabold uppercase tracking-wider ${NIVEL[foco.nivel].txt}`}>Lo primero</p>
                            <p className={`text-sm font-bold leading-snug ${t.title}`}>{foco.valor} {foco.label.toLowerCase()}</p>
                            <p className={`text-xs leading-snug ${t.meta}`}>{foco.accion}</p>
                        </div>
                        <ChevronRight size={18} className={`shrink-0 ${t.meta}`} />
                    </button>
                ) : (
                    <div className={`flex items-center gap-2 rounded-xl p-3 ${t.okBox}`}>
                        <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                        <p className="text-sm font-bold text-emerald-500">Semana bajo control. Sigue facturando.</p>
                    </div>
                )}
            </div>

            {/* ── Cobertura de visitas del mercaderista ── arriba y compacta: una
                sola fila (antes era una tarjeta con barra de progreso que ocupaba
                mucho espacio). El detalle completo —fracción, barra, PDV
                pendientes— se ve al pulsarla, en la hoja ampliada. */}
            {mercaderista.pdvCartera > 0 && (() => {
                const sinNadaQueCubrir = mercaderista.meta === 0;
                const cumplida = !sinNadaQueCubrir && mercaderista.faltan === 0;
                const ok = sinNadaQueCubrir || cumplida;
                const resumenCobertura = (
                    <div className="mb-1">
                        <div className="flex items-end justify-between gap-3 mb-2">
                            <p className={`text-xs ${t.meta}`}>{mercaderista.pdvTotal} PDV tocan este período</p>
                            <p className={`text-3xl font-black tabular-nums leading-none ${ok ? 'text-emerald-500' : 'text-indigo-400'}`}>
                                {mercaderista.hechas}<span className={`text-base ${t.soft}`}>/{mercaderista.meta}</span>
                            </p>
                        </div>
                        <div className={`h-2.5 rounded-full overflow-hidden ${t.bar}`}>
                            <div className={`h-full rounded-full transition-all ${ok ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                 style={{ width: `${Math.min(100, mercaderista.pct || 0)}%` }} />
                        </div>
                        <p className={`text-xs mt-1.5 ${t.meta}`}>
                            {cumplida
                                ? '¡Meta del período cumplida!'
                                : <>Faltan <b className="text-indigo-400">{mercaderista.faltan} visitas</b> · {mercaderista.items.length} PDV sin cubrir</>}
                        </p>
                    </div>
                );
                return (
                    <button
                        onClick={() => abrir({
                            titulo: 'Cobertura de visitas',
                            subtitulo: 'Según la frecuencia de cada PDV',
                            items: mercaderista.items,
                            render: (i) => (<>
                                <p className="font-bold text-sm">{i.nombre}</p>
                                <p className="text-xs opacity-70">Cada {i.intervalo} días · {i.zona}</p>
                                <span className="text-xs font-black text-indigo-400">{i.visitas}/{i.meta} · faltan {i.faltan}</span>
                            </>),
                            resumen: resumenCobertura,
                        })}
                        className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left ${t.card}`}
                    >
                        <Users size={18} className={`shrink-0 ${ok ? 'text-emerald-500' : 'text-indigo-400'}`} />
                        <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold ${t.title}`}>Cobertura de visitas</p>
                            <p className={`text-xs leading-snug ${t.meta}`}>
                                {sinNadaQueCubrir
                                    ? 'Nada que cubrir este período'
                                    : cumplida
                                        ? '¡Meta del período cumplida!'
                                        : <>Faltan <b className="text-indigo-400">{mercaderista.faltan}</b> · {mercaderista.items.length} PDV sin cubrir</>}
                            </p>
                        </div>
                        {!sinNadaQueCubrir && (
                            <span className={`text-xl font-black tabular-nums shrink-0 ${ok ? 'text-emerald-500' : 'text-indigo-400'}`}>
                                {mercaderista.hechas}<span className={`text-xs font-bold ${t.soft}`}>/{mercaderista.meta}</span>
                            </span>
                        )}
                        <ChevronRight size={16} className={`shrink-0 ${t.meta}`} />
                    </button>
                );
            })()}

            {/* Aviso de PDV sin vincular (el indicador principal depende del vínculo) */}
            {cobertura.sinVincular > 0 && (
                <div className="flex items-start gap-2 text-xs rounded-xl px-3 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-500">
                    <Link2Off size={14} className="shrink-0 mt-0.5" />
                    <span>
                        <b>{cobertura.sinVincular} PDV sin vincular</b> a su cliente de Zoho — no cuentan en "sin facturar".
                        Añade su razón social en la ficha del PDV.
                    </span>
                </div>
            )}

            {/* ── ATIENDE YA ── */}
            {urgentes.length > 0 && (
                <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-red-500 mb-2 px-1">Atiende ya</p>
                    <div className="grid gap-2 md:grid-cols-2">
                        {urgentes.map(l => {
                            const n = NIVEL[l.nivel];
                            return (
                                <button key={l.key} onClick={l.onClick}
                                    className={`w-full flex items-stretch gap-3 rounded-2xl overflow-hidden text-left ${t.card} ${n.ring}`}>
                                    <span className={`w-1.5 shrink-0 ${n.stripe}`} />
                                    <div className="flex items-center gap-3 flex-1 min-w-0 py-3 pr-3">
                                        <span className={`text-4xl font-black tabular-nums shrink-0 ${n.txt}`}>{l.valor}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-bold leading-snug ${t.title}`}>{l.label}</p>
                                            <p className={`text-xs leading-snug ${t.meta}`}>{l.sufijo ? `${l.sufijo} · ` : ''}{l.accion}</p>
                                            {l.desglose && (
                                                <p className={`text-[11px] leading-snug mt-0.5 ${t.soft}`}>{l.desglose}</p>
                                            )}
                                        </div>
                                        <ChevronRight size={16} className={`shrink-0 ${t.meta}`} />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── ESTA SEMANA ── */}
            {medios.length > 0 && (
                <div>
                    <p className={`text-[10px] font-extrabold uppercase tracking-[0.2em] mb-2 px-1 ${t.soft}`}>Esta semana</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {medios.map(l => {
                            const n = NIVEL[l.nivel];
                            return (
                                <button key={l.key} onClick={l.onClick}
                                    className={`rounded-2xl p-3 text-left ${t.mini}`}>
                                    <div className="flex items-center justify-between mb-1">
                                        <l.Icon size={16} className={n.txt} />
                                        <span className={`text-2xl font-black tabular-nums ${n.txt}`}>{l.valor}</span>
                                    </div>
                                    <p className={`text-xs font-bold leading-snug ${t.title}`}>{l.label}</p>
                                    <p className={`text-[11px] leading-snug ${t.soft}`}>{l.sufijo || l.accion}</p>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── EN VERDE (colapsado) ── */}
            {verdes.length > 0 && (
                <div>
                    <button onClick={() => setVerVerdes(v => !v)}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold ${t.chip}`}>
                        <CheckCircle2 size={14} className="text-emerald-500" />
                        En verde ({verdes.length})
                        {verVerdes ? <ChevronDown size={14} className="ml-auto" /> : <ChevronRight size={14} className="ml-auto" />}
                    </button>
                    {verVerdes && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            {verdes.map(l => (
                                <div key={l.key} className={`rounded-xl p-3 ${t.mini}`}>
                                    <div className="flex items-center justify-between mb-1">
                                        <l.Icon size={15} className="text-emerald-500" />
                                        <span className="text-xl font-black text-emerald-500">0</span>
                                    </div>
                                    <p className={`text-xs font-bold leading-snug ${t.title}`}>{l.label}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Detalle */}
            {detalle && createPortal(
                <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
                     onClick={() => setDetalle(null)}>
                    <div className={`w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[85vh] flex flex-col shadow-2xl ${t.sheet}`}
                         onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between px-5 py-4 shrink-0">
                            <div>
                                <h3 className={`text-base font-black ${t.title}`}>{detalle.titulo}</h3>
                                <p className={`text-xs ${t.meta}`}>
                                    {detalle.subtitulo} · {detalle.secciones
                                        ? detalle.secciones.reduce((s, x) => s + x.items.length, 0)
                                        : detalle.items.length}
                                </p>
                            </div>
                            <button onClick={() => setDetalle(null)} className={`p-1 ${t.meta}`}><X size={18} /></button>
                        </div>
                        <div className="px-5 pb-6 overflow-y-auto space-y-2">
                            {detalle.resumen && (
                                <div className={`rounded-xl p-3 mb-1 ${t.mini}`}>{detalle.resumen}</div>
                            )}
                            {(() => {
                                const fila = (i, idx) => (
                                    <div key={idx} className={`rounded-xl px-3 py-2.5 ${t.row} ${t.title}`}>
                                        {detalle.render(i)}
                                        {detalle.accion && (
                                            <button
                                                onClick={() => { setDetalle(null); detalle.accion.onClick(i); }}
                                                className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                                            >
                                                <PackageX size={14} /> {detalle.accion.label}
                                            </button>
                                        )}
                                    </div>
                                );
                                if (detalle.secciones) {
                                    if (detalle.secciones.length === 0) {
                                        return <p className={`text-sm text-center py-6 ${t.meta}`}>Sin pendientes.</p>;
                                    }
                                    return detalle.secciones.map((sec, si) => (
                                        <div key={si} className={si > 0 ? 'pt-3' : ''}>
                                            <p className={`text-[11px] font-black uppercase tracking-wider mb-1 ${t.soft}`}>
                                                {sec.titulo} · {sec.items.length}
                                            </p>
                                            {sec.nota && (
                                                <p className={`text-[11px] leading-snug mb-2 ${t.meta}`}>{sec.nota}</p>
                                            )}
                                            <div className="space-y-2">{sec.items.map(fila)}</div>
                                        </div>
                                    ));
                                }
                                if (detalle.items.length === 0 && !detalle.resumen) {
                                    return <p className={`text-sm text-center py-6 ${t.meta}`}>Sin pendientes.</p>;
                                }
                                return detalle.items.map(fila);
                            })()}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
