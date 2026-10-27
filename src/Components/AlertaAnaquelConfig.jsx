// RUTA: src/Components/AlertaAnaquelConfig.jsx — Configuraciones → Sistema →
// "Alerta de anaquel bajo" (solo máster).
//   · Quién la recibe se elige en el Centro de notificaciones (tipo 'anaquel').
//   · Umbral de unidades, horas que dura y horas de los recordatorios
//     (`settings/alertaAnaquel`; los lee el servidor en cada corrida).
//   · Estado: alertas abiertas ahora y última corrida del barrido.

import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { AlertTriangle, Save } from 'lucide-react';
import { db } from '@/Firebase/config.js';
import { fmtFechaHora, horasRestantes } from '@/utils/alertaAnaquel.js';

const DEFAULTS = { umbral: 6, horas: 72, recordatorios: [9, 13, 17] };
const msDe = (v) => (v && typeof v.toMillis === 'function') ? v.toMillis() : NaN;

export default function AlertaAnaquelConfig() {
    const [cfg, setCfg] = useState(DEFAULTS);
    const [form, setForm] = useState({ umbral: '6', horas: '72', recordatorios: '9, 13, 17' });
    const [estado, setEstado] = useState(null);
    const [abiertas, setAbiertas] = useState([]);
    const [guardando, setGuardando] = useState(false);
    const [msg, setMsg] = useState(null);

    useEffect(() => onSnapshot(doc(db, 'settings', 'alertaAnaquel'), (s) => {
        const c = { ...DEFAULTS, ...(s.exists() ? s.data() : {}) };
        setCfg(c);
        setForm({ umbral: String(c.umbral), horas: String(c.horas), recordatorios: (c.recordatorios || []).join(', ') });
    }, () => {}), []);
    useEffect(() => onSnapshot(doc(db, 'settings', 'alertaAnaquelEstado'), (s) => setEstado(s.exists() ? s.data() : null), () => {}), []);
    useEffect(() => onSnapshot(query(collection(db, 'alertas_anaquel'), where('estado', '==', 'abierta')),
        (s) => setAbiertas(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => msDe(a.venceAt) > Date.now())),
        () => setAbiertas([])), []);

    const guardar = async () => {
        const umbral = Number(form.umbral);
        const horas = Number(form.horas);
        const recordatorios = form.recordatorios.split(/[,\s]+/).filter(Boolean).map(Number);
        if (!Number.isInteger(umbral) || umbral < 0 || umbral > 100) return setMsg({ tipo: 'error', texto: 'El umbral debe ser un número entero entre 0 y 100.' });
        if (!(horas >= 1 && horas <= 240)) return setMsg({ tipo: 'error', texto: 'Las horas deben estar entre 1 y 240.' });
        if (!recordatorios.length || recordatorios.some(h => !Number.isInteger(h) || h < 7 || h > 20)) {
            return setMsg({ tipo: 'error', texto: 'Los recordatorios son horas enteras entre 7 y 20 (el programador corre cada hora en ese rango).' });
        }
        setGuardando(true);
        try {
            await setDoc(doc(db, 'settings', 'alertaAnaquel'), { umbral, horas, recordatorios: [...new Set(recordatorios)].sort((a, b) => a - b) }, { merge: true });
            setMsg({ tipo: 'ok', texto: 'Guardado. Se aplica en la próxima corrida (como mucho en una hora).' });
        } catch (e) {
            setMsg({ tipo: 'error', texto: `No se pudo guardar: ${e.message}` });
        } finally { setGuardando(false); }
    };

    const ultimoBarrido = estado?.ultimoBarrido && msDe(estado.ultimoBarrido);
    const barridoViejo = !ultimoBarrido || Date.now() - ultimoBarrido > 5 * 3600000;

    return (
        <div className="space-y-5 max-w-3xl">
            <div>
                <h3 className="text-xl font-bold text-slate-800">Alerta de anaquel bajo</h3>
                <p className="text-sm text-slate-500 mt-1">
                    Se abre cuando el mercaderista cuenta {cfg.umbral} unidades o menos en un PDV y no repone en esa visita.
                    Quien la tenga en el Centro de notificaciones la ve en un renglón rojo arriba y en un panel grande; también llega al teléfono,
                    con recordatorios a las {(cfg.recordatorios || []).join(', ')} h. Se cierra sola al reponer o a las {cfg.horas} h.
                </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={18} className="text-red-600" />
                    <p className="font-bold text-slate-800">Ahora: {abiertas.length} {abiertas.length === 1 ? 'alerta abierta' : 'alertas abiertas'}</p>
                </div>
                {abiertas.length > 0 && (
                    <ul className="divide-y divide-slate-100">
                        {abiertas.sort((a, b) => (a.contadas ?? 0) - (b.contadas ?? 0)).map(a => (
                            <li key={a.id} className="py-2 flex items-center gap-3 text-sm">
                                <span className="w-10 text-center font-black text-white bg-red-600 rounded-lg py-0.5">{a.contadas ?? 0}</span>
                                <span className="flex-1 min-w-0 truncate font-semibold text-slate-800">{a.posName}</span>
                                <span className="text-xs text-slate-500 shrink-0">{fmtFechaHora(a.horaVisita)} · cierra en {horasRestantes(a.venceAt)} h</span>
                            </li>
                        ))}
                    </ul>
                )}
                <p className={`text-xs mt-2 ${barridoViejo ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                    Última revisión automática: {ultimoBarrido ? fmtFechaHora(estado.ultimoBarrido) : 'todavía no corrió'}
                    {estado?.ultimoRecordatorio ? ` · último recordatorio: ${estado.ultimoRecordatorio.slice(8, 10)}/${estado.ultimoRecordatorio.slice(5, 7)} a las ${estado.ultimoRecordatorio.slice(11)} h` : ''}
                    {barridoViejo && ultimoBarrido ? ' · lleva más de 5 h sin correr' : ''}
                </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                <p className="font-bold text-slate-800">Reglas</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="text-sm text-slate-600">
                        Unidades o menos
                        <input inputMode="numeric" value={form.umbral} onChange={e => setForm(f => ({ ...f, umbral: e.target.value }))} className="mt-1 w-full p-2.5 border border-slate-300 rounded-lg" />
                    </label>
                    <label className="text-sm text-slate-600">
                        Se cierra sola a las (horas)
                        <input inputMode="numeric" value={form.horas} onChange={e => setForm(f => ({ ...f, horas: e.target.value }))} className="mt-1 w-full p-2.5 border border-slate-300 rounded-lg" />
                    </label>
                    <label className="text-sm text-slate-600">
                        Recordatorios (horas)
                        <input value={form.recordatorios} onChange={e => setForm(f => ({ ...f, recordatorios: e.target.value }))} className="mt-1 w-full p-2.5 border border-slate-300 rounded-lg" />
                    </label>
                </div>
                <p className="text-xs text-slate-500">Los domingos no se mandan recordatorios; la alerta y su aviso al abrirse sí salen.</p>
                <button onClick={guardar} disabled={guardando} className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-slate-900 text-white text-sm font-bold disabled:opacity-50">
                    <Save size={16} /> {guardando ? 'Guardando…' : 'Guardar reglas'}
                </button>
                {msg && (
                    <p className={`text-sm ${msg.tipo === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>{msg.texto}</p>
                )}
            </div>

            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <p className="font-bold text-slate-800">Quién la recibe</p>
                <p className="text-sm text-slate-600 mt-1">
                    Se elige en Sistema → <b>Centro de notificaciones</b>, tipo 🔴 Anaquel bajo: por rol y por persona.
                    Apagada para alguien: no ve el renglón ni el panel y no le llega al teléfono.
                </p>
            </div>
        </div>
    );
}
