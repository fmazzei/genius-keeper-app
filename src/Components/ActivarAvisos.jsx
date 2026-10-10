// RUTA: src/Components/ActivarAvisos.jsx
//
// "Avisos en este teléfono" (vigilante, 8-oct). Dice en palabras simples si las
// notificaciones están activas y, si no, el ÚNICO paso que falta. En iPhone las
// notificaciones solo funcionan con GK agregada a la pantalla de inicio; mientras
// tanto todo llega igual a la campanita. La persona puede apagarlas cuando quiera.

import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { requestNotificationPermission } from '@/utils/firebaseMessaging.js';
import { BellRing, BellOff, Check } from 'lucide-react';

function estadoTelefono() {
    try {
        const ua = navigator.userAgent || '';
        const ios = /iPhone|iPad|iPod/i.test(ua);
        const instalada = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
        const soporta = 'Notification' in window && 'serviceWorker' in navigator;
        if (ios && !instalada) return 'ios_sin_instalar';
        if (!soporta) return 'sin_soporte';
        return Notification.permission;   // 'default' | 'granted' | 'denied'
    } catch { return 'sin_soporte'; }
}

export default function ActivarAvisos({ uid, oscuro = false }) {
    const [estado, setEstado] = useState(estadoTelefono);
    const [push, setPush] = useState(true);
    const [ocupado, setOcupado] = useState(false);

    useEffect(() => {
        if (!uid) return;
        getDoc(doc(db, 'vigilancia_preferencias', uid)).then(s => { if (s.exists() && s.data().push === false) setPush(false); }).catch(() => {});
        // Con permiso ya dado, se renueva el registro del teléfono (por si cambió).
        if (estadoTelefono() === 'granted') requestNotificationPermission(uid).catch(() => {});
    }, [uid]);

    const activar = async () => {
        setOcupado(true);
        try { await requestNotificationPermission(uid); } catch { /* el estado lo dice */ }
        setEstado(estadoTelefono());
        setOcupado(false);
    };
    const cambiarPush = (v) => {
        setPush(v);
        setDoc(doc(db, 'vigilancia_preferencias', uid), { push: v, at: serverTimestamp() }, { merge: true }).catch(() => {});
    };

    const caja = oscuro ? 'bg-slate-800/60 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700';
    const tenue = oscuro ? 'text-slate-400' : 'text-slate-500';
    const mensajes = {
        ios_sin_instalar: 'En iPhone: toca Compartir y luego "Agregar a inicio". Abre GK desde ese ícono y vuelve aquí a tocar "Activar". Mientras tanto los avisos llegan a esta campanita.',
        sin_soporte: 'Este teléfono no permite notificaciones de la app. Los avisos llegan a esta campanita.',
        denied: 'Las notificaciones de GK están bloqueadas. Actívalas en Ajustes del teléfono → Notificaciones → Chrome (o GK). Mientras tanto llegan a esta campanita.',
    };

    return (
        <div className={`rounded-xl border p-3 text-sm ${caja}`}>
            <div className="flex items-center gap-2 font-bold">
                {estado === 'granted' && push ? <BellRing size={16} className="text-emerald-500" /> : <BellOff size={16} className={tenue} />}
                Avisos en este teléfono
            </div>
            {estado === 'granted' ? (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className={tenue}>{push ? <><Check size={13} className="inline -mt-0.5" /> Activados</> : 'Apagados (solo en la campanita)'}</span>
                    <button onClick={() => cambiarPush(!push)} className="shrink-0 text-xs font-bold text-brand-blue underline">
                        {push ? 'Apagar' : 'Encender'}
                    </button>
                </div>
            ) : estado === 'default' ? (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className={tenue}>Recibe los avisos aunque no tengas la app abierta.</span>
                    <button onClick={activar} disabled={ocupado} className="shrink-0 bg-brand-blue text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50">
                        {ocupado ? 'Activando…' : 'Activar'}
                    </button>
                </div>
            ) : (
                <p className={`mt-1.5 ${tenue}`}>{mensajes[estado]}</p>
            )}
        </div>
    );
}
