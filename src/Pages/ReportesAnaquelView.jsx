// RUTA: src/Pages/ReportesAnaquelView.jsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { useAuth } from '@/context/AuthContext';
import EditReportForm from '@/Components/EditReportForm.jsx';
import { estadoLote, ESTADO_LABEL } from '@/utils/retiros.js';
import Modal from '@/Components/Modal.jsx';
import {
    ClipboardList, ChevronRight, Search, X,
    Calendar, User, AlertTriangle, Loader,
    CheckCircle, Pencil,
} from 'lucide-react';

const PERIODS = [
    { label: '7 días',    days: 7   },
    { label: '30 días',   days: 30  },
    { label: 'Trimestre', days: 90  },
    { label: 'Semestre',  days: 180 },
    { label: 'Año',       days: 365 },
];

function normalize(str) {
    return (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function daysSinceTs(ts) {
    if (!ts) return null;
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// Variantes visuales: 'light' (Gerencia, sobre fondo blanco) y 'dark'
// (módulo Vendedor, sobre bg-slate-950) — misma estructura, distinta piel.
const THEME = {
    light: {
        card: 'bg-white border border-slate-200 shadow-sm',
        cardTitle: 'text-slate-800',
        cardSub: 'text-slate-500',
        editBtn: 'text-slate-400 hover:text-brand-blue',
        meta: 'text-slate-500',
        metricValue: 'text-slate-800',
        metricPrimary: 'text-brand-blue',
        metricLabel: 'text-slate-400',
        metricCompetidores: 'text-amber-600',
        metricEntrantes: 'text-red-500',
        expandBtn: 'border-t border-slate-100 text-slate-400 hover:bg-slate-50',
        divider: 'border-t border-slate-100',
        fieldLabel: 'text-slate-400',
        fieldValue: 'text-slate-800',
        popOk: 'text-emerald-600',
        popBad: 'text-red-500',
        popNeutral: 'text-slate-500',
        batchRow: 'bg-slate-50',
        batchCode: 'text-slate-700',
        batchExpiry: 'text-slate-500',
        competitorRow: 'bg-amber-50 border border-amber-100',
        competitorName: 'text-amber-900',
        competitorPrice: 'text-amber-700',
        competitorPop: 'text-slate-500',
        entrantRow: 'bg-red-50 border border-red-100',
        entrantBrand: 'text-red-800',
        entrantPresentation: 'text-red-600',
        notesBox: 'bg-slate-50 text-slate-700',
        stockoutTotal: 'text-red-600 bg-red-50 border-red-200',
        stockoutPartial: 'text-amber-600 bg-amber-50 border-amber-200',
        stockoutNone: 'text-emerald-600 bg-emerald-50 border-emerald-200',
        repoChip: 'text-emerald-700 bg-emerald-100 border-emerald-300',
        sheet: 'bg-white',
        sheetHeader: 'bg-white border-b border-slate-200',
        sheetClose: 'text-slate-400 hover:text-slate-700',
        sectionTitle: 'text-slate-400',
        rowHover: 'hover:bg-slate-50 active:bg-slate-100',
        tabsWrap: 'bg-slate-100',
        tabActive: 'bg-white text-slate-800 shadow-sm',
        tabInactive: 'text-slate-500',
        filterCard: 'bg-white border border-slate-200',
        filterLabel: 'text-slate-400',
        periodActive: 'bg-brand-blue text-white',
        periodInactive: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
        select: 'border border-slate-300 text-slate-700 focus:ring-brand-blue bg-white',
        pdvResultsBox: 'border border-slate-200 shadow-sm',
        pdvResultRow: 'hover:bg-slate-50 border-b border-slate-100',
        pdvResultName: 'text-slate-800',
        pdvResultChain: 'text-slate-400',
        pdvNoResults: 'text-slate-500',
        emptyIcon: 'text-slate-300',
        emptyTitle: 'text-slate-500',
        emptySub: 'text-slate-400',
        loadingSpinner: 'text-slate-400',
        errorBox: 'bg-red-50 border border-red-200',
        errorTitle: 'text-red-700',
        errorText: 'text-red-600',
        reportCount: 'text-slate-400',
    },
    dark: {
        card: 'bg-slate-900 border border-slate-700',
        cardTitle: 'text-white',
        cardSub: 'text-slate-400',
        editBtn: 'text-slate-400 hover:text-emerald-400',
        meta: 'text-slate-400',
        metricValue: 'text-white',
        metricPrimary: 'text-emerald-400',
        metricLabel: 'text-slate-500',
        metricCompetidores: 'text-amber-400',
        metricEntrantes: 'text-red-400',
        expandBtn: 'border-t border-slate-700 text-slate-500 hover:bg-slate-800/60',
        divider: 'border-t border-slate-700',
        fieldLabel: 'text-slate-500',
        fieldValue: 'text-white',
        popOk: 'text-emerald-400',
        popBad: 'text-red-400',
        popNeutral: 'text-slate-400',
        batchRow: 'bg-slate-800/60',
        batchCode: 'text-slate-200',
        batchExpiry: 'text-slate-400',
        competitorRow: 'bg-amber-500/10 border border-amber-500/30',
        competitorName: 'text-amber-200',
        competitorPrice: 'text-amber-400',
        competitorPop: 'text-slate-400',
        entrantRow: 'bg-red-500/10 border border-red-500/30',
        entrantBrand: 'text-red-300',
        entrantPresentation: 'text-red-400',
        notesBox: 'bg-slate-800/60 text-slate-300',
        stockoutTotal: 'text-red-300 bg-red-500/10 border-red-500/30',
        stockoutPartial: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
        stockoutNone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
        repoChip: 'text-emerald-200 bg-emerald-500/20 border-emerald-400/40',
        sheet: 'bg-slate-950',
        sheetHeader: 'bg-slate-950 border-b border-slate-800',
        sheetClose: 'text-slate-400 hover:text-white',
        sectionTitle: 'text-slate-500',
        rowHover: 'hover:bg-slate-800/60 active:bg-slate-800',
        tabsWrap: 'bg-slate-800/60 border border-slate-700',
        tabActive: 'bg-emerald-600 text-white',
        tabInactive: 'text-slate-400',
        filterCard: 'bg-slate-900 border border-slate-700',
        filterLabel: 'text-slate-500',
        periodActive: 'bg-emerald-600 text-white',
        periodInactive: 'bg-slate-800 text-slate-300 hover:bg-slate-700',
        select: 'border border-slate-700 text-white focus:ring-emerald-500 bg-slate-800',
        pdvResultsBox: 'border border-slate-700',
        pdvResultRow: 'hover:bg-slate-800 border-b border-slate-700',
        pdvResultName: 'text-white',
        pdvResultChain: 'text-slate-500',
        pdvNoResults: 'text-slate-400',
        emptyIcon: 'text-slate-600',
        emptyTitle: 'text-slate-400',
        emptySub: 'text-slate-500',
        loadingSpinner: 'text-emerald-400',
        errorBox: 'bg-red-500/10 border border-red-500/30',
        errorTitle: 'text-red-300',
        errorText: 'text-red-400',
        reportCount: 'text-slate-500',
    },
};

// ── Quiebre + reposición ─────────────────────────────────────────────────────
//
// Un quiebre reportado NO siempre es un quiebre abierto: el mercaderista suele
// encontrar el anaquel en cero y reponer en esa misma visita (declara las
// unidades en "Reposición de inventario", `orderQuantity`). Ese caso se marca
// con una "R" junto a la etiqueta de quiebre — el anaquel estaba en cero, pero
// quedó atendido. Sin esa distinción, la etiqueta (y el KPI del dashboard)
// exageran los quiebres realmente abiertos.
export function quiebreInfo(report) {
    const s = report?.stockout;
    const esQuiebre = s === true || s === 'total' || s === 'partial';
    const repuesto  = Number(report?.orderQuantity) || 0;
    return {
        esQuiebre,
        parcial: s === 'partial',
        atendido: esQuiebre && repuesto > 0,
        repuesto,
        label: s === true || s === 'total' ? 'Quiebre total'
            : s === 'partial' ? 'Quiebre parcial'
            : (s === false || s === 'none') ? 'Sin quiebre' : '—',
    };
}

const freshnessOf = (expiryDateStr, refDate) => {
    if (!expiryDateStr) return null;
    const ref = refDate ? new Date(refDate) : new Date();
    const exp = new Date(expiryDateStr);
    if (isNaN(exp.getTime())) return null;
    ref.setHours(0, 0, 0, 0); exp.setHours(0, 0, 0, 0);
    const d = Math.ceil((exp - ref) / 86400000);
    if (d <= 0)  return { label: 'Vencido',          tone: 'bad'  };
    if (d <= 30) return { label: 'Próximo a vencer', tone: 'warn' };
    if (d <= 60) return { label: 'Fresco',           tone: 'ok'   };
    return { label: 'Óptimo', tone: 'ok' };
};

// Etiqueta de quiebre + chip "R" de reposición atendida.
function StockoutBadge({ report, t, size = 'sm' }) {
    const q = quiebreInfo(report);
    const color = q.esQuiebre
        ? (q.parcial ? t.stockoutPartial : t.stockoutTotal)
        : t.stockoutNone;
    const px = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
    return (
        <span className="inline-flex items-center gap-1 shrink-0">
            <span className={`font-semibold rounded-full border whitespace-nowrap ${px} ${color}`}>
                {q.label}
            </span>
            {q.atendido && (
                <span
                    title={`Quiebre atendido: repuso ${q.repuesto} uds en esta visita`}
                    className={`font-black rounded-full border ${px} ${t.repoChip}`}
                >
                    R
                </span>
            )}
        </span>
    );
}

// ── Tarjeta compacta ─────────────────────────────────────────────────────────
// Una línea de identidad + una de contexto + una tira de cifras. El detalle
// COMPLETO vive en la hoja (`ReportDetailSheet`), que se abre al tocarla.

function ReportCard({ report, onOpen, t }) {
    const ago = daysSinceTs(report.createdAt);
    const agoLabel = ago === null ? '' : ago === 0 ? 'Hoy' : ago === 1 ? 'Ayer' : `Hace ${ago} días`;

    const cifras = [
        { v: report.inventoryLevel, l: 'en anaquel', primary: true },
        { v: report.facing,         l: 'caras' },
        { v: report.price !== undefined && report.price !== '' ? `$${report.price}` : undefined, l: 'PVP' },
        { v: Array.isArray(report.batches) ? report.batches.length : undefined, l: 'lotes' },
        { v: report.competition?.length || undefined, l: 'compet.' },
        { v: report.newEntrants?.length || undefined, l: 'entrantes' },
    ].filter(c => c.v !== undefined && c.v !== '' && c.v !== null);

    return (
        <div className={`rounded-xl overflow-hidden ${t.card}`}>
            <button
                type="button"
                onClick={() => onOpen(report)}
                className={`w-full text-left px-3.5 py-3 transition-colors ${t.rowHover}`}
            >
                <div className="flex items-start justify-between gap-2">
                    <p className={`font-bold text-sm leading-snug truncate min-w-0 flex-1 ${t.cardTitle}`}>
                        {report.posName || 'PDV sin nombre'}
                    </p>
                    <StockoutBadge report={report} t={t} />
                </div>

                <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] mt-1 ${t.meta}`}>
                    {report.posZone && report.posZone !== 'N/A' && <span className="truncate max-w-[45%]">{report.posZone}</span>}
                    <span className="flex items-center gap-1"><User size={10} />{report.userName || 'Mercaderista'}</span>
                    <span className="flex items-center gap-1"><Calendar size={10} />{agoLabel}</span>
                </div>

                <div className="flex items-center justify-between gap-2 mt-2">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 min-w-0">
                        {cifras.map((c, i) => (
                            <span key={i} className="text-xs whitespace-nowrap">
                                <b className={`font-black ${c.primary ? t.metricPrimary : t.metricValue}`}>{c.v}</b>
                                <span className={`ml-1 ${t.metricLabel}`}>{c.l}</span>
                            </span>
                        ))}
                    </div>
                    <span className={`flex items-center gap-1 text-[11px] font-semibold shrink-0 ${t.metricPrimary}`}>
                        Ver <ChevronRight size={12} />
                    </span>
                </div>
            </button>
        </div>
    );
}

// ── Hoja de detalle COMPLETO ─────────────────────────────────────────────────
// Todo lo que trae el reporte, sin recortar: nombre completo del PDV, quién y
// cuándo, duración de la visita, anaquel, ejecución, lotes con su frescura,
// competencia, nuevos entrantes, observaciones y — al final — cualquier campo
// adicional que traiga el documento y no esté mapeado arriba.

const OMIT_KEYS = new Set([
    'id', 'reportId', 'posId', 'posName', 'posZone', 'userId', 'userName', 'reporterId',
    'createdAt', 'startTime', 'endTime', 'price', 'orderQuantity', 'stockout', 'batches',
    'shelfLocation', 'adjacentCategory', 'popStatus', 'facing', 'competition',
    'newEntrants', 'notes', 'inventoryLevel', 'coordinates',
]);

// Cualquier campo suelto del documento, legible: Timestamps con fecha, booleanos
// en español, objetos/arreglos serializados (nunca "[object Object]").
function formatExtra(v) {
    if (v && typeof v.toDate === 'function') return v.toDate().toLocaleString('es-VE');
    if (typeof v === 'boolean') return v ? 'sí' : 'no';
    if (Array.isArray(v)) return v.map(formatExtra).join(', ');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
}

function Field({ label, value, t, tone }) {
    if (value === undefined || value === null || value === '') return null;
    return (
        <div className="min-w-0">
            <p className={`text-[10px] uppercase tracking-wide ${t.fieldLabel}`}>{label}</p>
            <p className={`font-semibold mt-0.5 break-words ${tone || t.fieldValue}`}>{value}</p>
        </div>
    );
}

function Section({ title, t, children }) {
    return (
        <div>
            <p className={`text-[10px] uppercase tracking-widest font-bold mb-2 ${t.sectionTitle}`}>{title}</p>
            {children}
        </div>
    );
}

function ReportDetailSheet({ report, isMaster, onEdit, onClose, t }) {
    if (!report) return null;

    const q = quiebreInfo(report);
    const created = report.createdAt?.toDate ? report.createdAt.toDate() : (report.createdAt ? new Date(report.createdAt) : null);
    const fechaHora = created
        ? created.toLocaleString('es-VE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';
    const durMin = (report.startTime && report.endTime)
        ? (new Date(report.endTime).getTime() - new Date(report.startTime).getTime()) / 60000
        : null;

    const popLabel = {
        'Exhibido correctamente': 'Exhibido correctamente',
        'Dañado': 'Dañado',
        'Ausente': 'Ausente',
        'Sin Campaña Activa': 'Sin campaña activa',
    }[report.popStatus] || report.popStatus;
    const popColor = report.popStatus === 'Exhibido correctamente' ? t.popOk
        : (report.popStatus === 'Ausente' || report.popStatus === 'Dañado') ? t.popBad : t.popNeutral;

    const extras = Object.entries(report).filter(([k, v]) =>
        !OMIT_KEYS.has(k) && v !== null && v !== undefined && v !== '' && typeof v !== 'function'
    );

    const toneOf = (f) => f?.tone === 'bad' ? t.popBad : f?.tone === 'warn' ? t.metricCompetidores : t.popOk;

    return (
        <div className="fixed inset-0 z-[60] flex flex-col" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div className={`relative m-auto w-full h-full md:h-auto md:max-h-[92vh] md:max-w-2xl md:rounded-2xl overflow-hidden flex flex-col shadow-2xl ${t.sheet}`}>
                {/* Encabezado: nombre COMPLETO del PDV, sin truncar. */}
                <div className={`px-4 py-3 shrink-0 flex items-start gap-3 ${t.sheetHeader}`}>
                    <div className="min-w-0 flex-1">
                        <p className={`font-black text-base leading-snug break-words ${t.cardTitle}`}>
                            {report.posName || 'PDV sin nombre'}
                        </p>
                        <p className={`text-xs mt-0.5 break-words ${t.cardSub}`}>
                            {report.posZone && report.posZone !== 'N/A' ? report.posZone : 'Zona sin definir'}
                        </p>
                        <div className="mt-2"><StockoutBadge report={report} t={t} size="md" /></div>
                    </div>
                    <button onClick={onClose} className={`shrink-0 p-1 ${t.sheetClose}`} aria-label="Cerrar">
                        <X size={22} />
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 py-4 space-y-5" style={{ WebkitOverflowScrolling: 'touch' }}>

                    {q.atendido && (
                        <div className={`rounded-xl border px-3 py-2.5 text-sm ${t.repoChip}`}>
                            <b>Quiebre atendido (R).</b> El anaquel estaba en cero y el mercaderista
                            repuso <b>{q.repuesto} unidades</b> en esta misma visita.
                        </div>
                    )}
                    {q.esQuiebre && !q.atendido && (
                        <div className={`rounded-xl border px-3 py-2.5 text-sm ${t.stockoutTotal}`}>
                            <b>Quiebre sin reponer.</b> No se declaró reposición en esta visita: el PDV
                            quedó sin producto.
                        </div>
                    )}

                    <Section title="Visita" t={t}>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                            <Field label="Reportado por" value={report.userName || '—'} t={t} />
                            <Field label="Fecha y hora" value={fechaHora} t={t} />
                            {durMin !== null && Number.isFinite(durMin) && durMin > 0 && (
                                <Field label="Duración" value={`${durMin.toFixed(1)} min`} t={t} />
                            )}
                            {report.coordinates?.lat != null && (
                                <Field label="Coordenadas" value={`${Number(report.coordinates.lat).toFixed(5)}, ${Number(report.coordinates.lng).toFixed(5)}`} t={t} />
                            )}
                        </div>
                    </Section>

                    <Section title="Anaquel y reposición" t={t}>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                            <Field label="Unidades en anaquel" value={report.inventoryLevel} t={t} tone={t.metricPrimary} />
                            <Field label="Reposición declarada" value={report.orderQuantity !== undefined ? `${report.orderQuantity} uds` : undefined} t={t} />
                            <Field label="PVP observado" value={report.price !== undefined && report.price !== '' ? `$${report.price}` : undefined} t={t} />
                            <Field label="Caras visibles" value={report.facing} t={t} />
                        </div>
                    </Section>

                    <Section title="Ejecución" t={t}>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                            <Field label="Ubicación en anaquel" value={report.shelfLocation} t={t} />
                            <Field label="Categoría adyacente" value={report.adjacentCategory} t={t} />
                            <Field label="Material POP" value={popLabel} t={t} tone={popColor} />
                        </div>
                    </Section>

                    {Array.isArray(report.batches) && report.batches.length > 0 && (
                        <Section title={`Lotes en anaquel (${report.batches.length})`} t={t}>
                            <div className="space-y-1.5">
                                {report.batches.map((b, i) => {
                                    const f = freshnessOf(b.expiryDate, created);
                                    return (
                                        <div key={i} className={`rounded-lg px-3 py-2 text-sm ${t.batchRow} ${b.devuelto ? 'opacity-60' : ''}`}>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className={`font-medium break-words min-w-0 ${t.batchCode}`}>
                                                    {b.batchCode || b.code || `Lote ${i + 1}`}
                                                </span>
                                                {b.quantity !== undefined && (
                                                    <span className={`font-black shrink-0 ${b.devuelto ? t.metricLabel : t.metricPrimary}`}>{b.quantity} uds</span>
                                                )}
                                            </div>
                                            <div className={`flex items-center gap-2 text-xs mt-0.5 flex-wrap ${t.batchExpiry}`}>
                                                {b.expiryDate && <span>Vence {b.expiryDate}</span>}
                                                {f && <span className={`font-semibold ${toneOf(f)}`}>· {f.label}</span>}
                                                {Number(b.danadas) > 0 && <span className="font-bold">· {b.danadas} con envase dañado</span>}
                                                {b.devuelto && <span className="font-bold">· DEVUELTO</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Section>
                    )}

                    {report.competition?.length > 0 && (
                        <Section title={`Competencia (${report.competition.length})`} t={t}>
                            <div className="space-y-1.5">
                                {report.competition.map((c, i) => {
                                    const per100 = (Number(c.price) > 0 && Number(c.weight_g) > 0)
                                        ? ((Number(c.price) / Number(c.weight_g)) * 100).toFixed(2) : null;
                                    return (
                                        <div key={i} className={`rounded-lg px-3 py-2 text-sm ${t.competitorRow}`}>
                                            <div className="flex items-start justify-between gap-2">
                                                <span className={`font-semibold break-words min-w-0 ${t.competitorName}`}>
                                                    {[c.brand, c.productName].filter(Boolean).join(' ') || c.product || 'Producto'}
                                                </span>
                                                {c.price && <span className={`font-black shrink-0 ${t.competitorPrice}`}>${c.price}</span>}
                                            </div>
                                            <div className={`flex flex-wrap gap-x-2 text-xs mt-0.5 ${t.competitorPop}`}>
                                                {c.weight_g ? <span>{c.weight_g} g</span> : null}
                                                {per100 ? <span>· ${per100}/100 g</span> : null}
                                                <span>· POP: {c.hasPop === true ? 'sí' : c.hasPop === false ? 'no' : 'no sabe'}</span>
                                                <span>· Degustación: {c.hasTasting === true ? 'sí' : c.hasTasting === false ? 'no' : 'no sabe'}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Section>
                    )}

                    {report.newEntrants?.length > 0 && (
                        <Section title={`Nuevos entrantes (${report.newEntrants.length})`} t={t}>
                            <div className="space-y-1.5">
                                {report.newEntrants.map((e, i) => (
                                    <div key={i} className={`rounded-lg px-3 py-2 text-sm ${t.entrantRow}`}>
                                        <span className={`font-semibold break-words ${t.entrantBrand}`}>{e.brand}</span>
                                        <div className={`text-xs mt-0.5 flex flex-wrap gap-x-2 ${t.entrantPresentation}`}>
                                            {e.presentation && <span>{e.presentation}</span>}
                                            {e.weight_g ? <span>· {e.weight_g} g</span> : null}
                                            {e.price ? <span>· ${e.price}</span> : null}
                                        </div>
                                        {e.notes && <p className={`text-xs mt-1 break-words ${t.entrantPresentation}`}>{e.notes}</p>}
                                    </div>
                                ))}
                            </div>
                        </Section>
                    )}

                    {report.notes && (
                        <Section title="Observaciones" t={t}>
                            <p className={`text-sm rounded-lg px-3 py-2 leading-relaxed break-words ${t.notesBox}`}>{report.notes}</p>
                        </Section>
                    )}

                    {extras.length > 0 && (
                        <Section title="Otros datos del reporte" t={t}>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                                {extras.map(([k, v]) => (
                                    <Field key={k} label={k} value={formatExtra(v)} t={t} />
                                ))}
                            </div>
                        </Section>
                    )}
                </div>

                {isMaster && (
                    <div className={`shrink-0 px-4 py-3 ${t.sheetHeader}`}>
                        <button
                            onClick={() => { onClose(); onEdit(report); }}
                            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border ${t.repoChip}`}
                        >
                            <Pencil size={14} /> Editar este reporte
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}


// ── Main Component ────────────────────────────────────────────────────────────

const ReportesAnaquelView = ({ theme = 'light' }) => {
    const t = THEME[theme] || THEME.light;
    const { role } = useAuth();
    const [activeTab, setActiveTab]         = useState('recientes');
    const [reports, setReports]             = useState([]);
    const [posList, setPosList]             = useState([]);
    const [loading, setLoading]             = useState(true);
    const [error, setError]                 = useState(null);
    const [editingReport, setEditingReport] = useState(null);
    const [detailReport, setDetailReport]   = useState(null);

    // Histórico filters
    const [periodDays, setPeriodDays]       = useState(30);
    const [scopeType, setScopeType]         = useState('todos');  // 'todos' | 'cadena' | 'pdv'
    const [selectedChain, setSelectedChain] = useState('');
    const [selectedPdvId, setSelectedPdvId] = useState('');
    const [pdvSearch, setPdvSearch]         = useState('');

    // Fetch POS list once for filter data
    useEffect(() => {
        getDocs(collection(db, 'pos'))
            .then(snap => {
                setPosList(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.active !== false));
            })
            .catch(() => {});
    }, []);

    const fetchReports = useCallback(async (days) => {
        setLoading(true);
        setError(null);
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            const snap = await getDocs(
                query(collection(db, 'visit_reports'), where('createdAt', '>=', startDate))
            );
            const items = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => {
                    const ta = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
                    const tb = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
                    return tb - ta;
                });
            setReports(items);
        } catch (e) {
            setError(e.code || e.message || 'Error al cargar reportes');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReports(activeTab === 'recientes' ? 7 : periodDays);
    }, [activeTab, periodDays, fetchReports]);

    const chains = useMemo(() => {
        const set = new Set(posList.map(p => p.chain).filter(Boolean));
        return [...set].sort();
    }, [posList]);

    const filteredPdvs = useMemo(() => {
        if (!pdvSearch) return posList.slice(0, 20);
        const q = normalize(pdvSearch);
        return posList.filter(p => normalize(p.name).includes(q) || normalize(p.chain || '').includes(q)).slice(0, 20);
    }, [pdvSearch, posList]);

    const posMap = useMemo(() => {
        const m = {};
        posList.forEach(p => { m[p.id] = p; });
        return m;
    }, [posList]);

    const displayReports = useMemo(() => {
        if (activeTab === 'recientes') return reports;
        if (scopeType === 'cadena' && selectedChain) {
            return reports.filter(r => {
                const pos = posMap[r.posId];
                return pos?.chain === selectedChain;
            });
        }
        if (scopeType === 'pdv' && selectedPdvId) {
            return reports.filter(r => r.posId === selectedPdvId);
        }
        return reports;
    }, [reports, activeTab, scopeType, selectedChain, selectedPdvId, posMap]);

    const resetScopeFilters = (type) => {
        setScopeType(type);
        setSelectedChain('');
        setSelectedPdvId('');
        setPdvSearch('');
    };

    return (
        <div className="max-w-2xl mx-auto">
            {/* Tabs */}
            <div className={`flex rounded-xl p-1 mb-4 ${t.tabsWrap}`}>
                <button
                    onClick={() => setActiveTab('recientes')}
                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === 'recientes' ? t.tabActive : t.tabInactive}`}
                >
                    Últimos Reportes
                </button>
                <button
                    onClick={() => setActiveTab('historico')}
                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === 'historico' ? t.tabActive : t.tabInactive}`}
                >
                    Histórico
                </button>
            </div>

            {/* Histórico filters */}
            {activeTab === 'historico' && (
                <div className={`space-y-4 mb-4 rounded-2xl p-4 ${t.filterCard}`}>
                    {/* Period */}
                    <div>
                        <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${t.filterLabel}`}>Período</p>
                        <div className="flex flex-wrap gap-2">
                            {PERIODS.map(p => (
                                <button
                                    key={p.days}
                                    onClick={() => setPeriodDays(p.days)}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${periodDays === p.days ? t.periodActive : t.periodInactive}`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Scope */}
                    <div>
                        <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${t.filterLabel}`}>Filtrar por</p>
                        <div className="flex gap-2">
                            {[
                                { id: 'todos',  label: 'Todos los PDVs' },
                                { id: 'cadena', label: 'Por cadena'      },
                                { id: 'pdv',    label: 'PDV específico' },
                            ].map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => resetScopeFilters(s.id)}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${scopeType === s.id ? t.periodActive : t.periodInactive}`}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Chain picker */}
                    {scopeType === 'cadena' && (
                        <div>
                            <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${t.filterLabel}`}>Cadena</p>
                            <select
                                value={selectedChain}
                                onChange={e => setSelectedChain(e.target.value)}
                                className={`w-full rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 ${t.select}`}
                            >
                                <option value="">Selecciona una cadena…</option>
                                {chains.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    )}

                    {/* PDV search */}
                    {scopeType === 'pdv' && (
                        <div>
                            <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${t.filterLabel}`}>Punto de venta</p>
                            <div className="relative">
                                <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${t.filterLabel}`} />
                                <input
                                    type="text"
                                    value={pdvSearch}
                                    onChange={e => { setPdvSearch(e.target.value); setSelectedPdvId(''); }}
                                    placeholder="Buscar PDV…"
                                    className={`w-full rounded-xl pl-9 pr-3 py-2.5 text-base focus:outline-none focus:ring-2 ${t.select}`}
                                />
                            </div>
                            {pdvSearch && !selectedPdvId && (
                                <div className={`mt-1 rounded-xl overflow-hidden ${t.pdvResultsBox}`}>
                                    {filteredPdvs.length === 0 ? (
                                        <p className={`p-3 text-sm text-center ${t.pdvNoResults}`}>Sin resultados</p>
                                    ) : filteredPdvs.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => { setSelectedPdvId(p.id); setPdvSearch(p.name); }}
                                            className={`w-full text-left px-3 py-2.5 text-sm last:border-b-0 ${t.pdvResultRow}`}
                                        >
                                            <span className={`font-medium ${t.pdvResultName}`}>{p.name}</span>
                                            {p.chain && <span className={`ml-1.5 text-xs ${t.pdvResultChain}`}>· {p.chain}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {selectedPdvId && (
                                <p className="text-xs text-emerald-500 mt-1 flex items-center gap-1">
                                    <CheckCircle size={12} /> PDV seleccionado
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <Loader size={28} className={`animate-spin ${t.loadingSpinner}`} />
                </div>
            ) : error ? (
                <div className={`rounded-2xl p-4 flex items-start gap-3 ${t.errorBox}`}>
                    <AlertTriangle size={18} className={`shrink-0 mt-0.5 ${t.errorText}`} />
                    <div>
                        <p className={`font-semibold ${t.errorTitle}`}>Error al cargar reportes</p>
                        <p className={`text-sm mt-0.5 ${t.errorText}`}>{error}</p>
                        <button
                            onClick={() => fetchReports(activeTab === 'recientes' ? 7 : periodDays)}
                            className={`mt-2 text-sm font-semibold underline ${t.errorTitle}`}
                        >
                            Reintentar
                        </button>
                    </div>
                </div>
            ) : displayReports.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <ClipboardList size={48} className={`mb-3 ${t.emptyIcon}`} />
                    <p className={`font-semibold ${t.emptyTitle}`}>Sin reportes</p>
                    <p className={`text-sm mt-1 ${t.emptySub}`}>
                        {activeTab === 'recientes'
                            ? 'No hay reportes de anaquel en los últimos 7 días.'
                            : 'No hay reportes en el período y filtros seleccionados.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    <p className={`text-xs font-semibold ${t.reportCount}`}>
                        {displayReports.length} reporte{displayReports.length !== 1 ? 's' : ''}
                        {activeTab === 'recientes' ? ' · Últimos 7 días' : ` · Últimos ${periodDays} días`}
                    </p>
                    {displayReports.map(r => (
                        <ReportCard key={r.id} report={r} onOpen={setDetailReport} t={t} />
                    ))}
                </div>
            )}

            {/* Vista COMPLETA del reporte (nombre entero del PDV + todos los datos) */}
            {detailReport && (
                <ReportDetailSheet
                    report={detailReport}
                    isMaster={role === 'master'}
                    onEdit={setEditingReport}
                    onClose={() => setDetailReport(null)}
                    t={t}
                />
            )}

            <Modal
                isOpen={!!editingReport}
                onClose={() => setEditingReport(null)}
                title={`Editando: ${editingReport?.posName || ''}`}
                size="lg"
            >
                {editingReport && (
                    <div className="p-4">
                        <EditReportForm
                            report={editingReport}
                            onSave={() => { setEditingReport(null); fetchReports(activeTab === 'recientes' ? 7 : periodDays); }}
                            onClose={() => setEditingReport(null)}
                        />
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default ReportesAnaquelView;
