// RUTA: src/Components/CorreoEnUso.jsx
//
// "Ese correo ya existe": en vez de mandar a Firebase Console a borrar la
// cuenta (y con ella el rastro de lo que hay que liquidarle a quien se fue),
// dice de QUIÉN es el correo y, si esa cuenta está inactiva o no tiene perfil
// en GK, ofrece liberarlo ahí mismo. Lo hace el servidor (cuentaCorreo).

import React, { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../Firebase/config.js';
import { AlertCircle, Unlock, Loader2 } from 'lucide-react';

const fmtDia = (v) => {
    const d = v ? new Date(v) : null;
    if (!d || Number.isNaN(d.getTime())) return null;
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
};

// "internal" a secas = el servidor no respondió (la función no está publicada o
// se cayó). Se dice así, en vez de mostrar la palabra suelta.
const mensajeDe = (e, porDefecto) => {
    const code = String(e?.code || '');
    if (code.endsWith('internal') || code.endsWith('not-found') || code.endsWith('unavailable')) {
        return 'El servidor no respondió. Espera unos minutos y vuelve a tocar Crear; si sigue, avísale al soporte.';
    }
    return e?.message || porDefecto;
};

export const cuentaCorreo = (datos) => httpsCallable(functions, 'cuentaCorreo')(datos).then(r => r.data);

export default function CorreoEnUso({ email, onLiberado }) {
    const [info, setInfo] = useState(null);
    const [error, setError] = useState('');
    const [trabajando, setTrabajando] = useState(false);

    useEffect(() => {
        let vivo = true;
        setInfo(null); setError('');
        cuentaCorreo({ accion: 'consultar', email })
            .then(r => { if (vivo) setInfo(r); })
            .catch(e => { if (vivo) setError(mensajeDe(e, 'No se pudo revisar de quién es el correo.')); });
        return () => { vivo = false; };
    }, [email]);

    const liberar = async () => {
        setTrabajando(true); setError('');
        try {
            await cuentaCorreo({ accion: 'liberar', email });
            onLiberado?.();
        } catch (e) {
            setError(mensajeDe(e, 'No se pudo liberar el correo.'));
            setTrabajando(false);
        }
    };

    if (error) return <p className="text-red-600 text-sm bg-red-50 p-3 rounded-lg font-medium">{error}</p>;
    if (!info) return (
        <p className="text-slate-500 text-sm bg-slate-50 p-3 rounded-lg flex items-center gap-2">
            <Loader2 size={15} className="animate-spin" /> {email} ya está en uso: revisando de quién es…
        </p>
    );
    if (info.estado === 'libre') return (
        <p className="text-emerald-700 text-sm bg-emerald-50 p-3 rounded-lg font-medium">El correo ya está libre: vuelve a tocar Crear.</p>
    );

    const quien = info.nombre || 'una persona';
    const detalle = [
        !info.conPerfil ? 'ya no tiene perfil en GK' : info.activo === false ? 'está inactiva en GK' : null,
        fmtDia(info.ultimoAcceso) ? `último acceso ${fmtDia(info.ultimoAcceso)}` : null,
    ].filter(Boolean).join(' · ');

    if (info.estado === 'bloqueado') return (
        <div className="text-sm bg-red-50 text-red-700 p-3 rounded-lg space-y-1">
            <p className="font-semibold flex items-center gap-1.5"><AlertCircle size={15} /> {info.email} ya está en uso.</p>
            <p>{info.motivo}</p>
        </div>
    );

    return (
        <div className="text-sm bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-lg space-y-2">
            <p className="font-semibold">{info.email} es de la cuenta de {quien}{detalle ? ` (${detalle})` : ''}.</p>
            <p>
                Liberarlo le pone a esa cuenta un correo de archivo y la desactiva. Sus facturas, pagos y
                comisiones quedan igual, así que se le puede seguir liquidando.
            </p>
            <button type="button" onClick={liberar} disabled={trabajando}
                className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-lg disabled:opacity-50">
                {trabajando ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />}
                {trabajando ? 'Liberando…' : 'Liberar el correo y crear la cuenta'}
            </button>
        </div>
    );
}
