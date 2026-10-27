// RUTA: src/Components/AlertaAnaquelBajo.jsx — alerta de ANAQUEL BAJO.
//
// Pedido del dueño (24-oct): cuando el mercaderista cuenta en un PDV 6 unidades
// o menos y en esa misma visita no repone, todos los usuarios (menos
// administración) lo ven:
//   · un renglón rojo delgado, arriba, mientras haya alguna alerta viva;
//   · al abrir la app y cuando llega una alerta nueva, el panel grande y
//     luminoso con cada PDV (tocar el renglón también lo abre).
// El renglón se cierra con la X, pero vuelve al abrir otra vez el perfil (o al
// volver a la app después de unos minutos fuera). Las alertas las abre y cierra
// SOLO el servidor (`alertas_anaquel`, ver functions/handlers/alertaAnaquel.js);
// además aquí se esconden las que ya pasaron su hora de vencer, por si el
// barrido llega tarde. Quién la ve lo decide el centro de notificaciones
// (Configuraciones → Sistema), por rol y por persona.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { AlertTriangle, ChevronRight, X } from 'lucide-react';
import { db } from '@/Firebase/config.js';
import { useCentroNotificaciones } from '@/hooks/useCentroNotificaciones.js';
import { fmtFechaHora, horasRestantes, textoUnidades } from '@/utils/alertaAnaquel.js';

// Fuera de la app por más de esto = "volvió a abrir el perfil".
const MIN_FUERA_MS = 3 * 60 * 1000;

const msDe = (v) => (v && typeof v.toMillis === 'function') ? v.toMillis() : (Number.isFinite(v) ? v : NaN);

export function useAlertasAnaquel() {
    const { uid, recibe } = useCentroNotificaciones();
    const [docs, setDocs] = useState([]);
    const [ahora, setAhora] = useState(() => Date.now());
    // Lo decide el centro de notificaciones (categoría 🔴 Anaquel bajo).
    const habilitado = !!uid && recibe('anaquel');

    useEffect(() => {
        if (!habilitado) { setDocs([]); return undefined; }
        const q = query(collection(db, 'alertas_anaquel'), where('estado', '==', 'abierta'));
        return onSnapshot(q, (s) => setDocs(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => { /* sin señal: se queda lo último */ });
    }, [habilitado]);

    // Revisa cada minuto qué alertas ya vencieron.
    useEffect(() => {
        const t = setInterval(() => setAhora(Date.now()), 60 * 1000);
        return () => clearInterval(t);
    }, []);

    const alertas = useMemo(() => (habilitado ? docs : [])
        .filter(a => msDe(a.venceAt) > ahora)
        .sort((a, b) => (a.contadas ?? 0) - (b.contadas ?? 0) || msDe(b.horaVisita) - msDe(a.horaVisita)),
    [docs, habilitado, ahora]);

    return { alertas, ahora };
}

// Clave de un episodio: si el mismo PDV vuelve a abrir otra alerta, es nueva.
const claveDe = (a) => `${a.id}:${msDe(a.desde) || a.desdeReportId || ''}`;

export default function AlertaAnaquelBajo({ tema = 'claro', onAbrirReporte }) {
    const { alertas, ahora } = useAlertasAnaquel();
    const [cerrado, setCerrado] = useState(false);
    const [panel, setPanel] = useState(false);
    const vistas = useRef(new Set());
    const ocultoDesde = useRef(null);

    // Llegó desde la notificación del teléfono (link /alertas-anaquel).
    useEffect(() => {
        try {
            if (window.location.pathname.startsWith('/alertas-anaquel')) {
                setPanel(true);
                window.history.replaceState({}, document.title, '/');
            }
        } catch { /* sin historial */ }
    }, []);

    // Volver a la app tras unos minutos fuera = abrir el perfil otra vez.
    useEffect(() => {
        const alCambiar = () => {
            if (document.visibilityState === 'hidden') { ocultoDesde.current = Date.now(); return; }
            // Vuelve el renglón; el panel grande solo salta con una alerta nueva
            // (para no tapar al mercaderista a mitad de un reporte).
            if (ocultoDesde.current && Date.now() - ocultoDesde.current >= MIN_FUERA_MS) setCerrado(false);
            ocultoDesde.current = null;
        };
        document.addEventListener('visibilitychange', alCambiar);
        return () => document.removeEventListener('visibilitychange', alCambiar);
    }, []);

    // Alerta nueva (o al abrir): el renglón vuelve y el panel grande se muestra.
    const claves = alertas.map(claveDe).join('|');
    useEffect(() => {
        const nuevas = alertas.filter(a => !vistas.current.has(claveDe(a)));
        if (!nuevas.length) return;
        nuevas.forEach(a => vistas.current.add(claveDe(a)));
        setCerrado(false);
        setPanel(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [claves]);

    useEffect(() => { if (!alertas.length) setPanel(false); }, [alertas.length]);

    if (!alertas.length) return null;
    const umbral = alertas[0].umbral ?? 6;
    const nombres = alertas.map(a => a.posName).join(' · ');

    return (
        <>
            {!cerrado && (
                <div
                    role="alert"
                    className="shrink-0 relative z-20 flex items-center gap-2 h-9 pl-3 pr-1 bg-red-600 text-white shadow-[0_0_18px_rgba(239,68,68,0.75)]"
                >
                    <button onClick={() => setPanel(true)} className="flex-1 min-w-0 flex items-center gap-2 text-left h-full">
                        <span className="relative flex w-2.5 h-2.5 shrink-0">
                            <span className="absolute inline-flex w-full h-full rounded-full bg-white opacity-75 animate-ping" />
                            <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-white" />
                        </span>
                        <span className="text-[13px] font-extrabold whitespace-nowrap">
                            {alertas.length} PDV con {umbral} uds o menos sin reponer
                        </span>
                        <span className="text-[13px] font-medium text-red-100 truncate">· {nombres}</span>
                        <ChevronRight size={16} className="shrink-0 text-red-100" />
                    </button>
                    <button
                        onClick={() => setCerrado(true)}
                        className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full active:bg-red-700"
                        aria-label="Cerrar el aviso"
                    >
                        <X size={18} />
                    </button>
                </div>
            )}
            {panel && createPortal(
                <PanelAnaquelBajo
                    alertas={alertas}
                    ahora={ahora}
                    umbral={umbral}
                    oscuro={tema === 'oscuro'}
                    onCerrar={() => setPanel(false)}
                    onAbrirReporte={onAbrirReporte ? (id) => { setPanel(false); onAbrirReporte(id); } : null}
                />,
                document.body,
            )}
        </>
    );
}

function PanelAnaquelBajo({ alertas, ahora, umbral, oscuro, onCerrar, onAbrirReporte }) {
    return (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={onCerrar}>
            <div
                onClick={(e) => e.stopPropagation()}
                className={`w-full sm:max-w-lg max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl border-2 border-red-500 shadow-[0_0_45px_rgba(239,68,68,0.85)] overflow-hidden ${oscuro ? 'bg-slate-950 text-white' : 'bg-white text-slate-900'}`}
            >
                <div className="relative bg-gradient-to-br from-red-600 via-red-500 to-rose-600 text-white px-5 pt-5 pb-4">
                    <button onClick={onCerrar} className="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/15 flex items-center justify-center active:bg-white/25" aria-label="Cerrar">
                        <X size={20} />
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shadow-[0_0_25px_rgba(255,255,255,0.6)] animate-pulse">
                            <AlertTriangle size={30} />
                        </div>
                        <div className="pr-10">
                            <p className="text-xs font-bold uppercase tracking-widest text-red-100">Alerta de anaquel bajo</p>
                            <p className="text-2xl font-black leading-tight">{alertas.length} {alertas.length === 1 ? 'punto de venta' : 'puntos de venta'}</p>
                        </div>
                    </div>
                    <p className="mt-3 text-sm text-red-50 leading-snug">
                        El mercaderista contó {umbral} unidades o menos y no repuso en esa visita. Cada alerta se cierra sola al reponer, o a las 72 h.
                    </p>
                </div>
                <ul className="flex-1 overflow-y-auto p-3 space-y-2">
                    {alertas.map(a => {
                        const h = horasRestantes(a.venceAt, ahora);
                        return (
                            <li key={a.id} className={`rounded-2xl border-2 p-3 ${oscuro ? 'border-red-500/50 bg-red-500/10' : 'border-red-200 bg-red-50'}`}>
                                <div className="flex items-start gap-3">
                                    <div className="w-16 shrink-0 text-center rounded-xl bg-red-600 text-white py-1.5 shadow-[0_0_14px_rgba(239,68,68,0.6)]">
                                        <p className="text-2xl font-black leading-none">{a.contadas ?? 0}</p>
                                        <p className="text-[10px] font-bold uppercase">uds</p>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-extrabold leading-tight">{a.posName}</p>
                                        {a.chain && <p className={`text-xs ${oscuro ? 'text-slate-400' : 'text-slate-500'}`}>{a.chain}</p>}
                                        <p className={`text-sm mt-1 ${oscuro ? 'text-slate-200' : 'text-slate-700'}`}>
                                            {a.reporterName || 'El mercaderista'} {a.contadas ? `contó ${textoUnidades(a.contadas)}` : 'encontró el anaquel vacío'} el {fmtFechaHora(a.horaVisita)} y no repuso.
                                        </p>
                                        {(a.detecciones || 1) > 1 && (
                                            <p className="text-xs font-semibold text-red-500 mt-0.5">
                                                Sigue bajo en {a.detecciones} visitas seguidas, desde el {fmtFechaHora(a.desde)}.
                                            </p>
                                        )}
                                        <p className={`text-xs mt-1 ${oscuro ? 'text-slate-400' : 'text-slate-500'}`}>
                                            Se cierra al reponer · si no, en {h} h
                                        </p>
                                    </div>
                                </div>
                                {onAbrirReporte && a.reportId && (
                                    <button onClick={() => onAbrirReporte(a.reportId)} className="mt-2 w-full h-10 rounded-xl bg-red-600 text-white text-sm font-bold active:bg-red-700">
                                        Ver el reporte
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
                <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <button onClick={onCerrar} className={`w-full h-12 rounded-2xl font-bold ${oscuro ? 'bg-slate-800 text-white' : 'bg-slate-900 text-white'}`}>
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
}
